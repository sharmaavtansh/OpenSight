"""Difficulty -> concrete activity parameters.

The client never invents its own numbers: it asks the server to resolve a
(activity, difficulty, acuity) triple into the exact knobs the game engine
runs with. Keeping this server-side means a clinician can retune a protocol
without shipping a new frontend, and every session stores the parameters it
actually ran with.
"""

from __future__ import annotations

from typing import Any

DIFFICULTIES: list[str] = ["easy", "medium", "hard"]

# Global scaling applied on top of each activity's base parameters.
_SCALE: dict[str, dict[str, float]] = {
    "easy":   {"speed": 0.70, "rate": 1.40, "clutter": 0.5, "window": 1.50, "tolerance": 1.45},
    "medium": {"speed": 1.00, "rate": 1.00, "clutter": 1.0, "window": 1.00, "tolerance": 1.00},
    "hard":   {"speed": 1.45, "rate": 0.70, "clutter": 1.8, "window": 0.65, "tolerance": 0.72},
}

# Per-activity baseline (medium). Only the keys an activity actually uses.
#   speed_pps        target motion, CSS px/second
#   spawn_ms         interval between target presentations
#   distractors      simultaneous non-target items
#   crowding_ratio   edge-to-edge gap as a multiple of optotype width
#   exposure_ms      tachistoscopic flash duration
#   window_ms        time allowed to respond before a miss is scored
#   tolerance_mult   hit radius as a multiple of optotype height
#   span             items in a sequence / trail
_BASE: dict[str, dict[str, float]] = {
    "shoot_the_asteroids":            {"speed_pps": 90,  "spawn_ms": 1400, "distractors": 3, "tolerance_mult": 1.6, "window_ms": 6000},
    "crush_the_letters":              {"speed_pps": 0,   "spawn_ms": 1200, "distractors": 5, "tolerance_mult": 1.5, "window_ms": 5000},
    "connect_the_letters":            {"speed_pps": 0,   "spawn_ms": 0,    "distractors": 4, "tolerance_mult": 1.8, "span": 6},
    "hop_the_e":                      {"speed_pps": 0,   "spawn_ms": 0,    "distractors": 0, "tolerance_mult": 1.8, "window_ms": 7000},
    "alphabet_racer":                 {"speed_pps": 150, "spawn_ms": 1100, "distractors": 4, "tolerance_mult": 1.5, "span": 8},
    "drop_the_balls":                 {"speed_pps": 130, "spawn_ms": 1000, "distractors": 3, "tolerance_mult": 1.7},
    "ice_jump":                       {"speed_pps": 120, "spawn_ms": 1300, "distractors": 2, "tolerance_mult": 1.8},
    "trace_magic":                    {"speed_pps": 70,  "spawn_ms": 0,    "distractors": 0, "tolerance_mult": 2.2, "span": 5},
    "balloon_pop_pursuit":            {"speed_pps": 95,  "spawn_ms": 1500, "distractors": 3, "tolerance_mult": 1.6},
    "catch_the_falling_items":        {"speed_pps": 110, "spawn_ms": 1000, "distractors": 3, "tolerance_mult": 1.7},
    "floating_letters_tachistoscope": {"speed_pps": 60,  "spawn_ms": 1800, "distractors": 4, "exposure_ms": 320, "window_ms": 4000},
    "common_word_sequence":           {"speed_pps": 55,  "spawn_ms": 0,    "distractors": 3, "span": 5, "window_ms": 9000},
    "match_symbol_contrast_pursuit":  {"speed_pps": 85,  "spawn_ms": 1600, "distractors": 3, "tolerance_mult": 1.6, "window_ms": 7000, "contrast": 0.35},
    "match_symbol_contrast_saccades": {"speed_pps": 0,   "spawn_ms": 1100, "distractors": 3, "tolerance_mult": 1.6, "window_ms": 5000, "contrast": 0.35},
    "balloon_pop_saccades":           {"speed_pps": 0,   "spawn_ms": 900,  "distractors": 3, "tolerance_mult": 1.6, "window_ms": 3500},
    "jump_letters_tachistoscope":     {"speed_pps": 0,   "spawn_ms": 1200, "distractors": 0, "exposure_ms": 260, "window_ms": 3500},
    "number_text":                    {"speed_pps": 0,   "spawn_ms": 0,    "distractors": 0, "span": 12, "window_ms": 4000},
    "smiley":                         {"speed_pps": 0,   "spawn_ms": 0,    "distractors": 8, "crowding_ratio": 1.0, "window_ms": 6000},
    "match_the_slant_lines":          {"speed_pps": 0,   "spawn_ms": 0,    "distractors": 8, "crowding_ratio": 0.8, "window_ms": 6000},
    "pattern_matching":               {"speed_pps": 0,   "spawn_ms": 0,    "distractors": 6, "crowding_ratio": 1.2, "window_ms": 8000},
}

# Which scaling axis governs which key.
_AXIS: dict[str, str] = {
    "speed_pps": "speed",
    "spawn_ms": "rate",
    "exposure_ms": "window",
    "window_ms": "window",
    "distractors": "clutter",
    "span": "clutter",
    "tolerance_mult": "tolerance",
    "crowding_ratio": "tolerance",
    # Lower Michelson contrast is harder, so it rides the tolerance axis.
    "contrast": "tolerance",
}


def resolve(activity_id: str, difficulty: str, optotype_px: float) -> dict[str, Any]:
    """Return the runtime parameter block for one activity."""
    if activity_id not in _BASE:
        raise KeyError(f"unknown activity: {activity_id}")
    difficulty = difficulty.lower()
    if difficulty not in _SCALE:
        raise ValueError(f"unknown difficulty: {difficulty}")

    scale = _SCALE[difficulty]
    base = _BASE[activity_id]
    out: dict[str, Any] = {}

    for key, value in base.items():
        factor = scale[_AXIS[key]]
        if key in ("distractors", "span"):
            # Clutter counts scale up with difficulty but never below one item.
            out[key] = max(1, round(value * factor)) if value else 0
        elif key == "contrast":
            out[key] = round(min(1.0, value * factor), 3)
        elif key == "crowding_ratio":
            # Tighter spacing is harder, so the tolerance axis applies directly.
            out[key] = round(value * factor, 3)
        else:
            out[key] = round(value * factor, 2)

    # Derived, acuity-linked geometry.
    out["optotype_px"] = round(optotype_px, 2)
    out["stroke_px"] = round(optotype_px / 5.0, 2)
    if "tolerance_mult" in out:
        out["hit_radius_px"] = round(optotype_px * out["tolerance_mult"], 2)
    if "crowding_ratio" in out:
        out["crowd_gap_px"] = round(optotype_px * out["crowding_ratio"], 2)
    out["difficulty"] = difficulty
    return out
