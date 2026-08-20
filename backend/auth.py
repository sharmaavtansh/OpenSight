"""A single shared password in front of the whole app.

The app was written for one family on one machine, so it has no user accounts
and no per-record ownership - every endpoint trusts whoever can reach it. That
is fine on localhost and not fine on a public URL, where the patient table
holds names, dates of birth and notes, and the assessment tables hold
children's vision measurements.

This is deliberately the smallest thing that closes that hole:

- **Off unless configured.** With ``OPENSIGHT_PASSWORD`` unset the gate does
  nothing at all, so the desktop launcher keeps working with no password.
- **Signing key derived from the password**, so sessions survive a restart but
  are all invalidated the moment the password changes.
- **Constant-time comparison** on both the password and the cookie signature.
- **Per-address backoff**, because one shared password on a public URL is
  otherwise guessable at network speed.

It is not a user system. Everyone who gets in shares one identity and can see
everything, which is the correct model for a household and the wrong one for a
clinic with several patients.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import urllib.parse
from collections import defaultdict

from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse

COOKIE_NAME = "opensight_session"
SESSION_TTL_S = 30 * 24 * 3600  # A month: therapy is daily, re-typing is friction.

# Fly's health check reaches the app through the public proxy, so it has to be
# answerable without a cookie or the machine is declared unhealthy and cycled.
OPEN_PATHS = {"/api/health", "/login", "/api/login", "/favicon.svg"}

# Backoff after repeated failures from one address.
_FAIL_LIMIT = 5
_FAIL_WINDOW_S = 300
_failures: dict[str, list[float]] = defaultdict(list)


def configured_password() -> str | None:
    """The shared password, or None when the gate is switched off."""
    value = os.environ.get("OPENSIGHT_PASSWORD", "").strip()
    return value or None


def _signing_key(password: str) -> bytes:
    """Stable across restarts, invalidated by a password change."""
    return hashlib.sha256(b"opensight-session-v1:" + password.encode()).digest()


def issue_token(password: str, now: float | None = None) -> str:
    expiry = int((now or time.time()) + SESSION_TTL_S)
    payload = str(expiry).encode()
    mac = hmac.new(_signing_key(password), payload, hashlib.sha256).hexdigest()
    return f"{expiry}.{mac}"


def token_valid(token: str, password: str, now: float | None = None) -> bool:
    try:
        expiry_s, mac = token.split(".", 1)
        expiry = int(expiry_s)
    except (ValueError, AttributeError):
        return False
    if expiry < (now or time.time()):
        return False
    expected = hmac.new(_signing_key(password), expiry_s.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, expected)


def _client_key(request: Request) -> str:
    # Fly terminates TLS and forwards the real address here; falling back to the
    # socket address keeps this working off-Fly too.
    forwarded = request.headers.get("fly-client-ip") or request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _throttled(key: str) -> bool:
    cutoff = time.time() - _FAIL_WINDOW_S
    recent = [t for t in _failures[key] if t > cutoff]
    _failures[key] = recent
    return len(recent) >= _FAIL_LIMIT


def _record_failure(key: str) -> None:
    _failures[key].append(time.time())


LOGIN_PAGE = """<!doctype html>
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
  .box { width: min(360px, 90vw); text-align: left; }
  .name { font-size: 34px; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; }
  .name em { font-style: normal; color: #6c4fe0; }
  .sub {
    font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
    color: #b9c0e8; margin-bottom: 28px;
  }
  label {
    display: block; font-size: 11px; letter-spacing: 0.1em;
    text-transform: uppercase; color: #b9c0e8; margin-bottom: 8px;
  }
  input {
    width: 100%; padding: 13px 14px; font-size: 15px; color: #ffffff;
    background: #0a1046; border: 1px solid rgba(120,140,220,0.35);
    border-radius: 10px; outline: none;
  }
  input:focus { border-color: #6c4fe0; }
  button {
    width: 100%; margin-top: 14px; padding: 13px; font-size: 14px; font-weight: 700;
    letter-spacing: 0.06em; color: #ffffff; background: #6c4fe0;
    border: 0; border-radius: 10px; cursor: pointer;
  }
  button:hover { background: #4c37a5; }
  .msg { margin-top: 14px; font-size: 13px; color: #ef5b2b; min-height: 18px; }
  .foot { margin-top: 26px; font-size: 11px; color: #b9c0e8; opacity: 0.65; line-height: 1.5; }
</style>
</head>
<body>
  <form class="box" method="post" action="/api/login">
    <div class="name"><em>Open</em>Sight</div>
    <div class="sub">Vision therapy</div>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus>
    <button type="submit">Enter</button>
    <div class="msg">__MESSAGE__</div>
    <div class="foot">
      This instance holds patient records. If you do not have the password,
      you are not meant to be here.
    </div>
  </form>
</body>
</html>
"""


def login_page(message: str = "", status: int = 200) -> HTMLResponse:
    return HTMLResponse(LOGIN_PAGE.replace("__MESSAGE__", message), status_code=status)


async def _supplied_password(request: Request) -> str:
    """Read the password from the request body.

    Starlette's ``request.form()`` asserts on python-multipart even for a plain
    urlencoded body, and this is one field on one route - not worth a runtime
    dependency. Both encodings are accepted so the login works from the form and
    from a script.
    """
    raw = (await request.body()).decode("utf-8", "replace")
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("application/json"):
        try:
            return str(json.loads(raw or "{}").get("password", ""))
        except (ValueError, AttributeError):
            return ""
    return urllib.parse.parse_qs(raw).get("password", [""])[0]


router = APIRouter()


@router.get("/login")
def login_form() -> HTMLResponse:
    if configured_password() is None:
        return HTMLResponse("<p>No password is configured; the gate is off.</p>")
    return login_page()


@router.post("/api/login")
async def login(request: Request) -> Response:
    password = configured_password()
    if password is None:
        return JSONResponse({"detail": "No password configured."}, status_code=400)

    key = _client_key(request)
    if _throttled(key):
        return login_page("Too many attempts. Wait a few minutes.", status=429)

    supplied = await _supplied_password(request)
    if not hmac.compare_digest(supplied, password):
        _record_failure(key)
        return login_page("That password is not right.", status=401)

    _failures.pop(key, None)
    response = Response(status_code=303, headers={"Location": "/"})
    response.set_cookie(
        COOKIE_NAME,
        issue_token(password),
        max_age=SESSION_TTL_S,
        httponly=True,
        samesite="lax",
        # Set only behind TLS: a Secure cookie is dropped over plain http,
        # which would lock out anyone running this on a LAN address.
        secure=request.url.scheme == "https",
    )
    return response


async def gate(request: Request, call_next):
    """Refuse anything without a valid session cookie."""
    password = configured_password()
    if password is None:
        return await call_next(request)

    path = request.url.path
    if path in OPEN_PATHS:
        return await call_next(request)

    token = request.cookies.get(COOKIE_NAME, "")
    if token_valid(token, password):
        return await call_next(request)

    # An API caller wants a status code; a browser wants somewhere to type.
    if path.startswith("/api/"):
        return JSONResponse({"detail": "Authentication required."}, status_code=401)
    return login_page(status=401)
