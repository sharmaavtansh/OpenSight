"""Runtime configuration and filesystem layout."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = Path(os.environ.get("OPENSIGHT_DATA_DIR", BASE_DIR / "data"))
DB_PATH = DATA_DIR / "opensight.db"

HOST = os.environ.get("OPENSIGHT_HOST", "127.0.0.1")
PORT = int(os.environ.get("OPENSIGHT_PORT", "8420"))

# Default display calibration. Overridden per-install via /api/settings.
DEFAULT_CALIBRATION = {
    "viewing_distance_cm": 40.0,
    "screen_diagonal_in": 15.6,
    "screen_width_px": 1920,
    "screen_height_px": 1080,
}

DATA_DIR.mkdir(parents=True, exist_ok=True)
