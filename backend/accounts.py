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
    "/api/signup/request",
    "/api/signup/verify",
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


def issue_token(conn: sqlite3.Connection, account_id: int, now: float | None = None) -> str:
    expiry = int((now or time.time()) + SESSION_TTL_S)
    payload = f"{account_id}.{expiry}"
    mac = hmac.new(_server_secret(conn), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{mac}"


def read_token(conn: sqlite3.Connection, token: str, now: float | None = None) -> int | None:
    """The account id this token proves, or None."""
    try:
        account_s, expiry_s, mac = token.split(".", 2)
        account_id = int(account_s)
        expiry = int(expiry_s)
    except (ValueError, AttributeError):
        return None
    if expiry < (now or time.time()):
        return None
    expected = hmac.new(
        _server_secret(conn), f"{account_s}.{expiry_s}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(mac, expected):
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


# ------------------------------------------------------- signup by email

CODE_TTL_S = 10 * 60
CODE_MAX_ATTEMPTS = 5


def normalise_email(email: str) -> str:
    return email.strip().lower()


def valid_email(email: str) -> bool:
    """Deliberately loose. The code in the inbox is the real proof; a strict
    regex here only rejects addresses that are in fact deliverable."""
    if len(email) > 254 or email.count("@") != 1:
        return False
    local, _, domain = email.partition("@")
    return bool(local) and "." in domain and not domain.startswith(".") and not domain.endswith(".")


def email_taken(conn: sqlite3.Connection, email: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM patients WHERE email = ? LIMIT 1", (normalise_email(email),)
    ).fetchone() is not None


def issue_code(conn: sqlite3.Connection, email: str) -> str:
    """Replaces any code already outstanding for this address."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    digest, salt = hash_password(code)
    conn.execute(
        "INSERT INTO signup_codes (email, code_hash, salt, expires_at, attempts) "
        "VALUES (?,?,?,?,0) ON CONFLICT(email) DO UPDATE SET "
        "code_hash=excluded.code_hash, salt=excluded.salt, "
        "expires_at=excluded.expires_at, attempts=0",
        (normalise_email(email), digest, salt, time.time() + CODE_TTL_S),
    )
    conn.commit()
    return code


def check_code(conn: sqlite3.Connection, email: str, code: str) -> str | None:
    """None if the code is good, otherwise the reason it is not."""
    email = normalise_email(email)
    row = conn.execute("SELECT * FROM signup_codes WHERE email = ?", (email,)).fetchone()
    if row is None:
        return "Ask for a code first."
    if row["expires_at"] < time.time():
        conn.execute("DELETE FROM signup_codes WHERE email = ?", (email,))
        conn.commit()
        return "That code has expired. Ask for a new one."
    if row["attempts"] >= CODE_MAX_ATTEMPTS:
        return "Too many wrong codes. Ask for a new one."
    if not verify_password(code.strip(), row["code_hash"], row["salt"]):
        conn.execute("UPDATE signup_codes SET attempts = attempts + 1 WHERE email = ?", (email,))
        conn.commit()
        return "That code is not right."
    return None


def consume_code(conn: sqlite3.Connection, email: str) -> None:
    conn.execute("DELETE FROM signup_codes WHERE email = ?", (normalise_email(email),))
    conn.commit()


# ------------------------------------------------------------ legacy gate

def shared_password() -> str | None:
    """The pre-accounts single password.

    Still honoured so an instance deployed with OPENSIGHT_PASSWORD and no
    accounts yet does not throw its doors open on upgrade.
    """
    value = os.environ.get("OPENSIGHT_PASSWORD", "").strip()
    return value or None
