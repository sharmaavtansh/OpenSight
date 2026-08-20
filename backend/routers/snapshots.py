"""Snapshot capture for QA.

The game surfaces are canvas-only, so the sole way to inspect what they draw
is to have the page render frames and post the image back. Files land under
data/snapshots/ and are never served to clients.
"""

from __future__ import annotations

import base64
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import DATA_DIR

router = APIRouter(prefix="/api/dev", tags=["dev"])

SNAPSHOT_DIR = DATA_DIR / "snapshots"
SAFE_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


class Snapshot(BaseModel):
    name: str
    data_url: str


@router.post("/snapshot")
def save_snapshot(payload: Snapshot) -> dict:
    if not SAFE_NAME.match(payload.name):
        raise HTTPException(status_code=422, detail="unsafe snapshot name")
    prefix = "data:image/png;base64,"
    if not payload.data_url.startswith(prefix):
        raise HTTPException(status_code=422, detail="expected a base64 PNG data URL")
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    target = SNAPSHOT_DIR / f"{payload.name}.png"
    target.write_bytes(base64.b64decode(payload.data_url[len(prefix):]))
    return {"saved": target.name, "bytes": target.stat().st_size}
