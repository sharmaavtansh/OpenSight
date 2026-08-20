"""Snapshot capture for QA.

The game surfaces are canvas-only, so the sole way to inspect what they draw is
to have the page render frames and post the image back. Files land under
data/snapshots/ and are never served to clients.

**Off unless OPENSIGHT_DEV_TOOLS is set.** This is a development tool that
writes attacker-chosen bytes to disk, and the shipped app never calls it. On a
deployed instance it was reachable by any signed-in account with no size limit,
which is a way to fill the volume and nothing else. Leaving a write endpoint
enabled because it is harmless *today* is how it stops being harmless.
"""

from __future__ import annotations

import base64
import os
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import DATA_DIR

router = APIRouter(prefix="/api/dev", tags=["dev"])

SNAPSHOT_DIR = DATA_DIR / "snapshots"
SAFE_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
# A generous frame is well under this; anything larger is not a screenshot.
MAX_BYTES = 8 * 1024 * 1024


def enabled() -> bool:
    return os.environ.get("OPENSIGHT_DEV_TOOLS", "").strip() not in ("", "0", "false", "no")


class Snapshot(BaseModel):
    name: str
    data_url: str


@router.post("/snapshot")
def save_snapshot(payload: Snapshot) -> dict:
    if not enabled():
        raise HTTPException(status_code=404, detail="not found")
    if not SAFE_NAME.match(payload.name):
        raise HTTPException(status_code=422, detail="unsafe snapshot name")
    prefix = "data:image/png;base64,"
    if not payload.data_url.startswith(prefix):
        raise HTTPException(status_code=422, detail="expected a base64 PNG data URL")
    try:
        blob = base64.b64decode(payload.data_url[len(prefix):], validate=True)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="that is not valid base64") from None
    if len(blob) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="snapshot too large")

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    target = SNAPSHOT_DIR / f"{payload.name}.png"
    target.write_bytes(blob)
    return {"saved": target.name, "bytes": target.stat().st_size}
