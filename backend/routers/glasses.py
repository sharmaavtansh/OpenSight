"""Glasses calibration endpoints.

The client walks the wizard and posts the answers back in one payload; the
server does the interpretation, decides whether the result is trustworthy, and
only then writes it into settings. Keeping the verdict server-side means a
client bug cannot quietly save a calibration that would train the wrong eye.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..db import get_db, write_setting
from ..glasses import (
    ALPHA_LADDER,
    PROFILES,
    apply_to_settings,
    build_result,
    complement,
    resolve_orientation,
    safe_shades,
    steps,
)
from ..models import SettingsIn
from .settings import load_settings, settings_key

router = APIRouter(prefix="/api/glasses", tags=["glasses"])


class ChannelAnswers(BaseModel):
    background: Literal["black", "white"]
    channel: str
    # Faintest shade the FELLOW eye could still see. None means it saw nothing
    # at all, so the whole palette is safe.
    faintest_seen: float | None = Field(None, ge=0, le=1)
    # Shade the TREATED eye picked as the best-looking colour.
    chosen: float | None = Field(None, ge=0, le=1)


class GlassesCalibration(BaseModel):
    """Everything the wizard collected."""

    right_eye_sees: str
    left_eye_sees: str
    channels: list[ChannelAnswers] = []
    save: bool = True


@router.get("/plan")
def plan() -> dict[str, Any]:
    """The wizard script, including the shade ladder and what to draw."""
    return {
        "steps": steps(),
        "alpha_ladder": ALPHA_LADDER,
        # The palette is shown all at once rather than one shade at a time.
        "palette": True,
        "profiles": PROFILES,
        "instructions": {
            "orientation": (
                "Put the glasses on. Close one eye and keep the other open. "
                "Tell us which coloured patch you can still see."
            ),
            "isolate": (
                "Cover the eye the screen names. Tap the faintest square you can "
                "still see, or say you cannot see any of them."
            ),
            "choose": (
                "Swap eyes. Every square here is already invisible to the other "
                "eye - just pick whichever looks the best, clearest colour."
            ),
        },
    }


@router.get("/safe-shades")
def safe(faintest_seen: float | None = None) -> dict[str, Any]:
    """Shades that are invisible to the fellow eye, given what it could see."""
    return {"faintest_seen": faintest_seen, "options": safe_shades(faintest_seen)}


@router.post("")
def submit(
    payload: GlassesCalibration,
    patient_id: int | None = None,
    conn: sqlite3.Connection = Depends(get_db),
) -> dict[str, Any]:
    orientation = resolve_orientation(payload.right_eye_sees, payload.left_eye_sees)

    isolation: dict[str, dict[str, float | None]] = {bg: {} for bg in PROFILES}
    chosen: dict[str, dict[str, float | None]] = {bg: {} for bg in PROFILES}
    for entry in payload.channels:
        if entry.channel not in PROFILES[entry.background]:
            raise HTTPException(
                status_code=422,
                detail=f"{entry.channel} is not a channel of the {entry.background} profile",
            )
        isolation[entry.background][entry.channel] = entry.faintest_seen
        chosen[entry.background][entry.channel] = entry.chosen

    result = build_result(orientation, isolation, chosen)

    saved = False
    if payload.save and result["usable"]:
        merged = apply_to_settings(load_settings(conn, patient_id), result)
        # Validate before persisting, so a bad merge cannot corrupt settings.
        validated = SettingsIn(**merged).model_dump()
        # Which lens sits over which eye, and how much each channel leaks,
        # are facts about one person and one pair of glasses.
        write_setting(conn, settings_key(patient_id), validated)
        conn.commit()
        saved = True

    result["saved"] = saved
    if not saved and payload.save:
        result["reason"] = "Calibration was not trustworthy, so settings were left unchanged."
    return result


@router.get("/preview")
def preview(
    background: str = "black",
    patient_id: int | None = None,
    conn: sqlite3.Connection = Depends(get_db),
) -> dict[str, Any]:
    """What the current stored calibration means, in plain terms."""
    if background not in PROFILES:
        raise HTTPException(status_code=404, detail="unknown background profile")
    settings = load_settings(conn, patient_id)
    anaglyph = settings["anaglyph"]
    profile = anaglyph.get(background) or {}
    channels = profile.get("channels") or {}
    left_filter = anaglyph.get("left_filter", "red")
    right_filter = complement(left_filter, background) if left_filter in PROFILES[background] else None
    return {
        "background": background,
        "left_filter": left_filter,
        "right_filter": right_filter,
        "channels": {
            name: {"hex": ch.get("hex"), "alpha": ch.get("alpha"), "intensity": ch.get("intensity")}
            for name, ch in channels.items()
        },
    }
