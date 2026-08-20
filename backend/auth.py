"""Login, logout, first-run setup, and the gate that enforces them."""

from __future__ import annotations

import json
import sqlite3
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse

from . import accounts, landing, mailer
from .db import connect, get_db

router = APIRouter()


# ------------------------------------------------------------------ pages

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenSight</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #050826; color: #ffffff;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  }
  form { width: min(360px, 90vw); }
  .name { font-size: 34px; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; }
  .name em { font-style: normal; color: #6c4fe0; }
  .sub {
    font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
    color: #b9c0e8; margin-bottom: 26px;
  }
  label {
    display: block; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
    color: #b9c0e8; margin: 14px 0 7px;
  }
  input {
    width: 100%; padding: 12px 13px; font-size: 15px; color: #ffffff;
    background: #0a1046; border: 1px solid rgba(120,140,220,0.35);
    border-radius: 10px; outline: none;
  }
  input:focus { border-color: #6c4fe0; }
  button {
    width: 100%; margin-top: 18px; padding: 13px; font-size: 14px; font-weight: 700;
    letter-spacing: 0.06em; color: #ffffff; background: #6c4fe0;
    border: 0; border-radius: 10px; cursor: pointer;
  }
  button:hover { background: #4c37a5; }
  .msg { margin-top: 14px; font-size: 13px; color: #ef5b2b; min-height: 18px; }
  .foot { margin-top: 24px; font-size: 11px; color: #b9c0e8; opacity: 0.65; line-height: 1.5; }
</style>
</head>
<body>
  <form method="post" action="__ACTION__">
    <div class="name"><em>Open</em>Sight</div>
    <div class="sub">__SUB__</div>
    __FIELDS__
    <button type="submit">__CTA__</button>
    <div class="msg">__MESSAGE__</div>
    <div class="foot">__FOOT__</div>
  </form>
</body>
</html>
"""

LOGIN_FIELDS = """
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username" autofocus>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password">
"""

SETUP_FIELDS = """
    <label for="name">Your name</label>
    <input id="name" name="name" autocomplete="name" autofocus>
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="new-password">
"""


def _render(kind: str, message: str = "", status: int = 200) -> HTMLResponse:
    """The front page, whatever the reason for showing it.

    Sign-in and sign-up are two tabs on one page rather than two pages, so a
    newcomer reads what the therapy is before being asked for an address, and
    an existing user is one click from the box they came for.
    """
    return HTMLResponse(
        landing.page(message, mail_configured=mailer.configured()), status_code=status
    )


async def _form(request: Request) -> dict[str, str]:
    """Read a urlencoded or JSON body without pulling in python-multipart."""
    raw = (await request.body()).decode("utf-8", "replace")
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            data = json.loads(raw or "{}")
            return {k: str(v) for k, v in data.items()}
        except (ValueError, AttributeError):
            return {}
    return {k: v[0] for k, v in urllib.parse.parse_qs(raw).items()}


def _set_session(response: Response, request: Request, conn, account_id: int) -> None:
    response.set_cookie(
        accounts.COOKIE_NAME,
        accounts.issue_token(conn, account_id),
        max_age=accounts.SESSION_TTL_S,
        httponly=True,
        samesite="lax",
        # Only behind TLS: a Secure cookie is dropped over plain http, which
        # would lock out anyone running this on a LAN address.
        secure=request.url.scheme == "https",
    )


# ----------------------------------------------------------------- routes

@router.get("/login")
def login_page(conn: sqlite3.Connection = Depends(get_db)) -> HTMLResponse:
    if not accounts.accounts_exist(conn):
        return _render("setup")
    return _render("login")


@router.get("/setup")
def setup_page(conn: sqlite3.Connection = Depends(get_db)) -> HTMLResponse:
    if accounts.accounts_exist(conn):
        return _render("login", "An account already exists. Sign in instead.")
    return _render("setup")


@router.get("/api/auth/state")
def auth_state(request: Request, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    """What the shell needs to know about who is signed in."""
    account = getattr(request.state, "account", None)
    return {
        "accounts_exist": accounts.accounts_exist(conn),
        "required": accounts.accounts_exist(conn) or accounts.shared_password() is not None,
        "account": accounts.public(account),
    }


@router.post("/api/setup")
async def setup(request: Request, conn: sqlite3.Connection = Depends(get_db)) -> Response:
    """Create the first account. Only ever available while there are none."""
    if accounts.accounts_exist(conn):
        raise HTTPException(status_code=409, detail="An account already exists.")

    form = await _form(request)
    name = form.get("name", "").strip()
    username = form.get("username", "").strip()
    password = form.get("password", "")

    problem = _validate(name, username, password)
    if problem:
        return _render("setup", problem, status=422)

    row = accounts.create_account(conn, name, username, password, is_admin=True)
    response = Response(status_code=303, headers={"Location": "/"})
    _set_session(response, request, conn, row["id"])
    return response


def _validate(name: str, username: str, password: str) -> str | None:
    if not name:
        return "A name is needed."
    if len(username) < 3:
        return "The username needs at least 3 characters."
    if not username.replace("_", "").replace("-", "").replace(".", "").isalnum():
        return "Usernames may use letters, numbers, dot, dash and underscore."
    if len(password) < 8:
        return "The password needs at least 8 characters."
    return None


@router.post("/api/login")
async def login(request: Request, conn: sqlite3.Connection = Depends(get_db)) -> Response:
    key = accounts.client_key(request)
    if accounts.throttled(key):
        return _render("login", "Too many attempts. Wait a few minutes.", status=429)

    form = await _form(request)
    username = form.get("username", "").strip()
    password = form.get("password", "")

    # The legacy single-password gate, for an instance that has no accounts yet.
    if not accounts.accounts_exist(conn):
        shared = accounts.shared_password()
        if shared and password and not username:
            import hmac as _hmac

            if _hmac.compare_digest(password, shared):
                accounts.clear_failures(key)
                response = Response(status_code=303, headers={"Location": "/"})
                _set_session(response, request, conn, 0)
                return response
        return _render("setup", "No accounts yet - create the first one.", status=401)

    row = accounts.find_by_username(conn, username) if username else None
    if row is None or not row["password_hash"]:
        accounts.record_failure(key)
        # Same message either way: distinguishing them tells an attacker which
        # usernames exist.
        return _render("login", "That username and password do not match.", status=401)

    if not accounts.verify_password(password, row["password_hash"], row["password_salt"]):
        accounts.record_failure(key)
        return _render("login", "That username and password do not match.", status=401)

    accounts.clear_failures(key)
    response = Response(status_code=303, headers={"Location": "/"})
    _set_session(response, request, conn, row["id"])
    return response


@router.post("/api/signup/request")
async def signup_request(request: Request, conn: sqlite3.Connection = Depends(get_db)) -> Response:
    """Send a code to an address. Says the same thing whether or not it is
    already registered, so this cannot be used to test who has an account."""
    key = accounts.client_key(request)
    if accounts.throttled(key):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait a few minutes.")

    form = await _form(request)
    email = accounts.normalise_email(form.get("email", ""))
    if not accounts.valid_email(email):
        raise HTTPException(status_code=422, detail="That does not look like an email address.")

    if accounts.email_taken(conn, email):
        # Deliberately indistinguishable from success. Nothing is sent and no
        # code is stored, so the address cannot be taken over this way either.
        accounts.record_failure(key)
        return JSONResponse({"delivered": mailer.configured()})

    code = accounts.issue_code(conn, email)
    delivered = mailer.send_code(email, code, accounts.CODE_TTL_S // 60)
    return JSONResponse({"delivered": delivered})


@router.post("/api/signup/verify")
async def signup_verify(request: Request, conn: sqlite3.Connection = Depends(get_db)) -> Response:
    """Check the code, then create the account and sign them in."""
    key = accounts.client_key(request)
    if accounts.throttled(key):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait a few minutes.")

    form = await _form(request)
    email = accounts.normalise_email(form.get("email", ""))
    code = form.get("code", "")
    name = form.get("name", "").strip()
    username = form.get("username", "").strip()
    password = form.get("password", "")

    problem = _validate(name, username, password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)

    failure = accounts.check_code(conn, email, code)
    if failure:
        accounts.record_failure(key)
        raise HTTPException(status_code=401, detail=failure)

    if accounts.find_by_username(conn, username) is not None:
        raise HTTPException(status_code=409, detail="That username is taken.")
    if accounts.email_taken(conn, email):
        raise HTTPException(status_code=409, detail="That address already has an account.")

    # The first person through the door administers the instance; there is
    # nobody else who could have granted it.
    first = not accounts.accounts_exist(conn)
    row = accounts.create_account(
        conn, name, username, password, is_admin=first, email=email
    )
    accounts.consume_code(conn, email)
    accounts.clear_failures(key)

    response = JSONResponse({"ok": True, "account": accounts.public(row)})
    _set_session(response, request, conn, row["id"])
    return response


@router.post("/api/logout")
def logout(request: Request) -> Response:
    response = JSONResponse({"ok": True})
    response.delete_cookie(accounts.COOKIE_NAME, httponly=True, samesite="lax")
    return response


# ------------------------------------------------------------------- gate

async def gate(request: Request, call_next):
    """Attach the signed-in account, and refuse anyone who has no session."""
    request.state.account = None
    conn = connect()
    try:
        has_accounts = accounts.accounts_exist(conn)
        shared = accounts.shared_password()

        token = request.cookies.get(accounts.COOKIE_NAME, "")
        account_id = accounts.read_token(conn, token) if token else None
        if account_id:
            # 0 is the legacy shared session: authenticated, but not a person.
            request.state.account = (
                accounts.find_by_id(conn, account_id) if account_id > 0 else None
            )
            request.state.authenticated = True
            if account_id > 0 and request.state.account is None:
                # The account was deleted while its cookie was still valid.
                request.state.authenticated = False
        else:
            request.state.authenticated = False

        # Nothing configured at all: a single-person desktop install.
        if not has_accounts and shared is None:
            return await call_next(request)

        if request.url.path in accounts.OPEN_PATHS:
            return await call_next(request)

        if getattr(request.state, "authenticated", False):
            return await call_next(request)

        if request.url.path.startswith("/api/"):
            return JSONResponse({"detail": "Authentication required."}, status_code=401)
        return _render("setup" if not has_accounts else "login", status=401)
    finally:
        conn.close()


def session_patient_id(request: Request) -> int | None:
    """The user a request may act on.

    Taken from the session and never from a query parameter: honouring a
    client-supplied id would let any account read any other account's
    calibration and results by editing the URL.
    """
    account = getattr(request, "state", None) and getattr(request.state, "account", None)
    return account["id"] if account is not None else None


def resolve_patient(request: Request, patient_id: int | None = None) -> int | None:
    """Which user's configuration this request may touch.

    A session always wins. The query parameter survives only for the
    unauthenticated single-person desktop install, where there is no session to
    read and no one to impersonate.
    """
    from_session = session_patient_id(request)
    if from_session is not None:
        return from_session
    if getattr(request.state, "authenticated", False):
        # Signed in on the legacy shared session: no personal scope of its own,
        # so the query parameter is how it selects a user, as before.
        return patient_id
    return patient_id


def is_admin(request: Request) -> bool:
    account = getattr(request.state, "account", None)
    return bool(account and account["is_admin"])
