"""Sending the signup code.

Uses stdlib ``smtplib``, so any SMTP provider works - a Gmail app password,
Resend, SendGrid, Postmark, SES - without adding a dependency to a project a
parent has to install unattended.

With nothing configured the code is written to the server log instead of being
sent. That keeps the desktop install and local development working, and it is
loud about what happened: a silent failure here would leave someone staring at
an inbox for a message that was never going to arrive.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

log = logging.getLogger("opensight.mail")


def _config() -> dict[str, str] | None:
    host = os.environ.get("OPENSIGHT_SMTP_HOST", "").strip()
    if not host:
        return None
    return {
        "host": host,
        "port": os.environ.get("OPENSIGHT_SMTP_PORT", "587").strip(),
        "user": os.environ.get("OPENSIGHT_SMTP_USER", "").strip(),
        "password": os.environ.get("OPENSIGHT_SMTP_PASSWORD", ""),
        "sender": os.environ.get("OPENSIGHT_SMTP_FROM", "").strip()
        or os.environ.get("OPENSIGHT_SMTP_USER", "").strip(),
    }


def configured() -> bool:
    return _config() is not None


BODY = """Your OpenSight verification code is:

    {code}

It expires in {minutes} minutes. Enter it on the sign-up page to choose your
password.

If you did not ask for this, ignore this message - no account is created
until the code is used.

--
OpenSight - vision therapy for home use
Not a medical device. It measures and trains; it does not diagnose.
"""


def send_code(email: str, code: str, minutes: int) -> bool:
    """True if the code was actually handed to an SMTP server."""
    cfg = _config()
    if cfg is None:
        # Deliberately at WARNING: this is the only way to complete signup on an
        # install without mail, so it must not be buried at debug level.
        log.warning(
            "SMTP is not configured. Verification code for %s is %s "
            "(set OPENSIGHT_SMTP_HOST to send this by email instead).",
            email,
            code,
        )
        return False

    message = EmailMessage()
    message["Subject"] = "Your OpenSight verification code"
    message["From"] = cfg["sender"]
    message["To"] = email
    message.set_content(BODY.format(code=code, minutes=minutes))

    try:
        port = int(cfg["port"])
        if port == 465:
            with smtplib.SMTP_SSL(cfg["host"], port, context=ssl.create_default_context()) as server:
                if cfg["user"]:
                    server.login(cfg["user"], cfg["password"])
                server.send_message(message)
        else:
            with smtplib.SMTP(cfg["host"], port, timeout=20) as server:
                server.starttls(context=ssl.create_default_context())
                if cfg["user"]:
                    server.login(cfg["user"], cfg["password"])
                server.send_message(message)
        return True
    except Exception as exc:  # noqa: BLE001 - the caller only needs sent/not sent
        log.error("Could not send the verification code to %s: %s", email, exc)
        return False
