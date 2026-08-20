"""Per-user accounts: credentials, sessions, and who the request belongs to.

The important rule here is the last one. Once someone is logged in, the user
whose data they see comes from **their session**, never from a query parameter.
Scoping on a client-supplied ``?patient_id=`` would let any account read any
other account's calibration and results by editing the URL, which is exactly
the hole accounts are meant to close.

Passwords are PBKDF2-HMAC-SHA256 with a per-user random salt. That is a stdlib
primitive, so it costs no dependency; it is weaker than Argon2 against a
determined attacker with the database in hand, and is chosen deliberately
because the alternative here is a third-party package on a machine a parent has
to install unattended.

Modes, decided by what is in the database rather than by configuration:

- **No accounts** - the gate is off. A single-person desktop install keeps
  working with no password, as it always has.
- **Accounts exist** - every request needs a session. The first account is
  created through a one-time setup page, because otherwise nobody could get in.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from collections import defaultdict
from typing import Any

from fastapi import Request

from .db import read_setting, write_setting

COOKIE_NAME = "opensight_account"
SESSION_TTL_S = 30 * 24 * 3600
PBKDF2_ROUNDS = 240_000

# Reachable without a session: the health check Fly polls through the public
# proxy, and the pages needed to obtain a session in the first place.
OPEN_PATHS = {
    "/api/health",
    "/login",
    "/api/login",
    "/api/logout",
    "/setup",
    "/api/setup",
    "/api/auth/state",
    "/api/signup",
    "/api/questions",
    "/api/recover",
    "/api/recover/reset",
    "/favicon.svg",
}

_FAIL_LIMIT = 8
_FAIL_WINDOW_S = 300
_failures: dict[str, list[float]] = defaultdict(list)


# --------------------------------------------------------------- passwords

def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ROUNDS)
    return base64.b64encode(digest).decode(), salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    try:
        candidate, _ = hash_password(password, salt)
    except ValueError:
        return False
    return hmac.compare_digest(candidate, stored_hash)


# ---------------------------------------------------------------- sessions

def _server_secret(conn: sqlite3.Connection) -> bytes:
    """Generated once and stored, so sessions survive a restart.

    Deliberately not derived from any password: with per-user accounts there is
    no single password to derive from, and one user changing theirs must not
    sign everyone else out.
    """
    stored = read_setting(conn, "session_secret", None)
    if not stored:
        stored = secrets.token_hex(32)
        write_setting(conn, "session_secret", stored)
        conn.commit()
    return bytes.fromhex(stored)


def _session_version(conn: sqlite3.Connection, account_id: int) -> int:
    row = conn.execute(
        "SELECT session_version FROM patients WHERE id = ?", (account_id,)
    ).fetchone()
    return int(row["session_version"]) if row else 1


def issue_token(conn: sqlite3.Connection, account_id: int, now: float | None = None) -> str:
    expiry = int((now or time.time()) + SESSION_TTL_S)
    version = _session_version(conn, account_id) if account_id > 0 else 1
    payload = f"{account_id}.{version}.{expiry}"
    mac = hmac.new(_server_secret(conn), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{mac}"


def read_token(conn: sqlite3.Connection, token: str, now: float | None = None) -> int | None:
    """The account id this token proves, or None."""
    try:
        account_s, version_s, expiry_s, mac = token.split(".", 3)
        account_id = int(account_s)
        version = int(version_s)
        expiry = int(expiry_s)
    except (ValueError, AttributeError):
        return None
    if expiry < (now or time.time()):
        return None
    expected = hmac.new(
        _server_secret(conn), f"{account_s}.{version_s}.{expiry_s}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(mac, expected):
        return None
    # A password reset bumps the account's version, which retires every cookie
    # issued before it - including one an intruder was still holding.
    if account_id > 0 and version != _session_version(conn, account_id):
        return None
    return account_id


# ------------------------------------------------------------------- state

def accounts_exist(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 FROM patients WHERE username IS NOT NULL LIMIT 1"
    ).fetchone()
    return row is not None


def find_by_username(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM patients WHERE username = ? COLLATE NOCASE", (username.strip(),)
    ).fetchone()


def find_by_id(conn: sqlite3.Connection, account_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM patients WHERE id = ? AND username IS NOT NULL", (account_id,)
    ).fetchone()


def create_account(
    conn: sqlite3.Connection,
    name: str,
    username: str,
    password: str,
    is_admin: bool = False,
    treated_eye: str | None = None,
    email: str | None = None,
) -> sqlite3.Row:
    digest, salt = hash_password(password)
    cur = conn.execute(
        "INSERT INTO patients (name, treated_eye, username, password_hash, password_salt, "
        "is_admin, email) VALUES (?,?,?,?,?,?,?)",
        (
            name,
            treated_eye,
            username.strip(),
            digest,
            salt,
            1 if is_admin else 0,
            normalise_email(email) if email else None,
        ),
    )
    conn.commit()
    return conn.execute("SELECT * FROM patients WHERE id = ?", (cur.lastrowid,)).fetchone()


def public(row: sqlite3.Row | None) -> dict[str, Any] | None:
    """An account as the client may see it - never the hash or the salt."""
    if row is None:
        return None
    data = dict(row)
    return {
        "id": data["id"],
        "name": data["name"],
        "username": data.get("username"),
        "email": data.get("email"),
        "is_admin": bool(data.get("is_admin")),
        "treated_eye": data.get("treated_eye"),
    }


# ------------------------------------------------------------- rate limits

def client_key(request: Request) -> str:
    forwarded = request.headers.get("fly-client-ip") or request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def throttled(key: str) -> bool:
    cutoff = time.time() - _FAIL_WINDOW_S
    _failures[key] = [t for t in _failures[key] if t > cutoff]
    return len(_failures[key]) >= _FAIL_LIMIT


def record_failure(key: str) -> None:
    _failures[key].append(time.time())


def clear_failures(key: str) -> None:
    _failures.pop(key, None)


# ---------------------------------------------------- security questions

REQUIRED_ANSWERS = 3

# Chosen to avoid the classic weak ones. A mother's maiden name, a first school
# or a pet's name are findable on social media or known to anyone who knows the
# family, which is exactly the person most likely to try. These ask for small
# private specifics instead, and each has an answer that does not change.
QUESTIONS: list[dict[str, str]] = [
    {"id": "street_number", "text": "What was the house number of your childhood home?"},
    {"id": "first_employer", "text": "What was the name of your first employer?"},
    {"id": "childhood_friend", "text": "What was the first name of your closest childhood friend?"},
    {"id": "first_concert", "text": "What was the first live performance you attended?"},
    {"id": "grandparent_town", "text": "In what town did your grandparents live?"},
    {"id": "first_dish", "text": "What was the first dish you learned to cook?"},
    {"id": "old_phone", "text": "What were the last four digits of your childhood phone number?"},
    {"id": "favourite_teacher", "text": "What was the surname of your favourite teacher?"},
    {"id": "first_trip", "text": "Where did you go on your first trip abroad?"},
    {"id": "book_reread", "text": "Which book have you read more than any other?"},
]

QUESTION_IDS = {q["id"] for q in QUESTIONS}
QUESTION_TEXT = {q["id"]: q["text"] for q in QUESTIONS}


def normalise_answer(answer: str) -> str:
    """Case and spacing must not decide whether someone gets back in.

    "New  York", "new york" and " New York " are the same answer. Everything
    else is left alone: stripping punctuation would quietly merge answers the
    person meant to keep distinct.
    """
    return " ".join(answer.strip().lower().split())


def set_answers(conn: sqlite3.Connection, patient_id: int, answers: list) -> None:
    """Replaces any existing set. Answers are hashed exactly like passwords."""
    conn.execute("DELETE FROM security_answers WHERE patient_id = ?", (patient_id,))
    for idx, (question_id, answer) in enumerate(answers):
        digest, salt = hash_password(normalise_answer(answer))
        conn.execute(
            "INSERT INTO security_answers (patient_id, idx, question_id, answer_hash, salt) "
            "VALUES (?,?,?,?,?)",
            (patient_id, idx, question_id, digest, salt),
        )
    conn.commit()


def questions_for(conn: sqlite3.Connection, patient_id: int) -> list:
    rows = conn.execute(
        "SELECT idx, question_id FROM security_answers WHERE patient_id = ? ORDER BY idx",
        (patient_id,),
    ).fetchall()
    return [
        {"idx": r["idx"], "id": r["question_id"], "text": QUESTION_TEXT.get(r["question_id"], "")}
        for r in rows
    ]


def verify_answers(conn: sqlite3.Connection, patient_id: int, given: dict) -> bool:
    """All of them, or none.

    Every stored answer is checked even after one has failed, so how long this
    takes does not reveal which one was wrong.
    """
    rows = conn.execute(
        "SELECT idx, answer_hash, salt FROM security_answers WHERE patient_id = ? ORDER BY idx",
        (patient_id,),
    ).fetchall()
    if len(rows) < REQUIRED_ANSWERS:
        return False
    ok = True
    for row in rows:
        supplied = normalise_answer(given.get(row["idx"], ""))
        if not verify_password(supplied, row["answer_hash"], row["salt"]):
            ok = False
    return ok


def validate_question_set(chosen: list) -> str:
    if len(chosen) != REQUIRED_ANSWERS:
        return "Choose %d questions." % REQUIRED_ANSWERS
    if len(set(chosen)) != REQUIRED_ANSWERS:
        return "Choose three different questions."
    if any(q not in QUESTION_IDS for q in chosen):
        return "That is not one of the available questions."
    return ""


def bump_session_version(conn: sqlite3.Connection, patient_id: int) -> None:
    conn.execute(
        "UPDATE patients SET session_version = session_version + 1 WHERE id = ?", (patient_id,)
    )
    conn.commit()


def set_password(conn: sqlite3.Connection, patient_id: int, password: str) -> None:
    digest, salt = hash_password(password)
    conn.execute(
        "UPDATE patients SET password_hash = ?, password_salt = ? WHERE id = ?",
        (digest, salt, patient_id),
    )
    # Everything signed in under the old password stops working now.
    bump_session_version(conn, patient_id)


def find_for_recovery(conn: sqlite3.Connection, identifier: str):
    """Username or email - people remember one or the other, rarely both."""
    identifier = identifier.strip()
    row = find_by_username(conn, identifier)
    if row is not None:
        return row
    return conn.execute(
        "SELECT * FROM patients WHERE email = ? AND username IS NOT NULL",
        (normalise_email(identifier),),
    ).fetchone()


# ------------------------------------------------------- signup by email


def normalise_email(email: str) -> str:
    return email.strip().lower()


def valid_email(email: str) -> bool:
    """Deliberately loose.

    Nothing here proves the address belongs to whoever typed it - there is no
    verification step - so a strict pattern would only reject deliverable
    addresses while catching none of the addresses that are simply someone
    else's. It is an identifier and a way to reach the person, not a proof.
    """
    if len(email) > 254 or email.count("@") != 1:
        return False
    local, _, domain = email.partition("@")
    return bool(local) and "." in domain and not domain.startswith(".") and not domain.endswith(".")


def email_taken(conn: sqlite3.Connection, email: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM patients WHERE email = ? LIMIT 1", (normalise_email(email),)
    ).fetchone() is not None


# ------------------------------------------------------------ legacy gate

def shared_password() -> str | None:
    """The pre-accounts single password.

    Still honoured so an instance deployed with OPENSIGHT_PASSWORD and no
    accounts yet does not throw its doors open on upgrade.
    """
    value = os.environ.get("OPENSIGHT_PASSWORD", "").strip()
    return value or None
