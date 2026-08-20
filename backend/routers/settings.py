"""Display calibration and anaglyph colours, per user.

Calibration is a property of a person in front of a screen, not of the install:
the ruler measurement encodes that display's pixel pitch, and the anaglyph
alphas encode how strongly *those* glasses leak for *that* pair of eyes. Storing
one copy meant a second person recalibrating silently changed the first
person's optotype sizes, so their past acuity numbers stopped meaning what they
said.

Each user therefore gets their own settings row, stored under ``user:<id>`` and
layered over the shared install defaults. With no user selected the install row
is used directly, which is what a single-person desktop install does.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..acuity import DisplayCalibration, acuity_table
from ..db import get_db, read_setting, write_setting
from ..models import SettingsIn

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_KEY = "install"


def settings_key(patient_id: int | None) -> str:
    """Where one user's settings live, or the shared install row."""
    return SETTINGS_KEY if patient_id is None else f"user:{patient_id}"


def _overlay(base: dict, patch: dict) -> dict:
    """One level of nesting is enough: the payload is groups of flat fields."""
    merged = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


def load_settings(conn: sqlite3.Connection, patient_id: int | None = None) -> dict:
    """Defaults, then the install row, then this user's own overrides.

    Layering rather than replacing means a user who has never opened the colour
    screen still gets sensible values, and a key added in a later version never
    breaks an existing install.
    """
    merged = _overlay(SettingsIn().model_dump(), read_setting(conn, SETTINGS_KEY, {}) or {})
    if patient_id is not None:
        merged = _overlay(merged, read_setting(conn, settings_key(patient_id), {}) or {})
    return merged


@router.get("")
def get_settings(
    patient_id: int | None = None, conn: sqlite3.Connection = Depends(get_db)
) -> dict:
    settings = load_settings(conn, patient_id)
    cal = DisplayCalibration(**settings["calibration"])
    return {
        **settings,
        "patient_id": patient_id,
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
def put_settings(
    payload: SettingsIn,
    patient_id: int | None = None,
    conn: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Writes to the selected user's row, or to the install row when none."""
    write_setting(conn, settings_key(patient_id), payload.model_dump())
    conn.commit()
    return get_settings(patient_id, conn)
