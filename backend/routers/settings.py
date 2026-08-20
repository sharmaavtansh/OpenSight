"""Install-level settings: display calibration and anaglyph colours."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..acuity import DisplayCalibration, acuity_table
from ..db import get_db, read_setting, write_setting
from ..models import SettingsIn

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_KEY = "install"


def load_settings(conn: sqlite3.Connection) -> dict:
    """Stored settings merged over the defaults, so new keys never break an
    existing install."""
    defaults = SettingsIn().model_dump()
    stored = read_setting(conn, SETTINGS_KEY, {}) or {}
    merged = dict(defaults)
    for key, value in stored.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


@router.get("")
def get_settings(conn: sqlite3.Connection = Depends(get_db)) -> dict:
    settings = load_settings(conn)
    cal = DisplayCalibration(**settings["calibration"])
    return {
        **settings,
        "derived": {
            "ppi": round(cal.ppi, 2),
            "nominal_ppi": round(cal.nominal_ppi, 2),
            "pixels_per_mm": round(cal.pixels_per_mm, 4),
            "calibrated": cal.calibrated,
            "reference_e_cm": cal.reference_e_cm,
            "acuity_table": acuity_table(cal),
        },
    }


@router.put("")
def put_settings(payload: SettingsIn, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    write_setting(conn, SETTINGS_KEY, payload.model_dump())
    conn.commit()
    return get_settings(conn)
