"""Catalogue endpoints: the therapy tree and the parameter domains."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from .. import catalog as cat
from ..acuity import ACUITY_LEVELS, DisplayCalibration, acuity_table
from ..difficulty import DIFFICULTIES
from ..db import get_db
from .settings import load_settings

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/catalog")
def get_catalog(conn: sqlite3.Connection = Depends(get_db)) -> dict:
    """Everything the shell needs to render itself."""
    settings = load_settings(conn)
    cal = DisplayCalibration(**settings["calibration"])
    return {
        **cat.tree(),
        "difficulties": DIFFICULTIES,
        "acuity_levels": ACUITY_LEVELS,
        "acuity_table": acuity_table(cal),
        "duration_range": {"min": 1, "max": 15, "step": 1, "unit": "min"},
    }


@router.get("/acuity")
def get_acuity_table(
    viewing_distance_cm: float | None = None,
    device_pixel_ratio: float | None = None,
    conn: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Recompute optotype sizes for an ad-hoc viewing distance."""
    settings = load_settings(conn)
    calibration = dict(settings["calibration"])
    if viewing_distance_cm is not None:
        calibration["viewing_distance_cm"] = viewing_distance_cm
    if device_pixel_ratio is not None:
        calibration["device_pixel_ratio"] = device_pixel_ratio
    cal = DisplayCalibration(**calibration)
    return {
        "ppi": round(cal.ppi, 2),
        "pixels_per_mm": round(cal.pixels_per_mm, 4),
        "viewing_distance_cm": cal.viewing_distance_cm,
        "levels": acuity_table(cal),
    }
