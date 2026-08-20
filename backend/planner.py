"""Session planning: palette resolution and seeded stimulus generation.

Everything a game needs to run one session is decided here, server-side, from
a single integer seed. Two consequences that matter clinically:

* the same seed replays the identical session, so a result can be audited;
* the stimulus set is never chosen by the client, so difficulty cannot drift
  between builds.
"""

from __future__ import annotations

import random
from typing import Any

from .acuity import DisplayCalibration, describe
from .catalog import get_activity, get_mode, resolve_activity
from .difficulty import resolve

# Sloan letters - the set used for standardised acuity charts. Deliberately
# excludes letters that are easy to guess from partial cues.
SLOAN = ["C", "D", "H", "K", "N", "O", "R", "S", "V", "Z"]
DIGITS = list("0123456789")
E_ORIENTATIONS = ["right", "down", "left", "up"]

COMMON_WORDS = [
    "cat", "dog", "sun", "hat", "cup", "bed", "car", "box", "pen", "key",
    "tree", "bird", "fish", "star", "book", "hand", "door", "milk", "ball",
    "cake", "moon", "leaf", "shoe", "rain", "frog", "kite", "nest", "lamp",
]


def _relative_luminance(hex_colour: str) -> float:
    """WCAG relative luminance, used to pick the anaglyph polarity."""
    value = hex_colour.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    r, g, b = (int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4))

    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def _channel_css(channel: dict[str, Any]) -> str:
    """Render one calibrated channel as an rgba() string.

    ``intensity`` scales the colour toward black on a 0-256 scale and ``alpha``
    carries the leakage calibration straight through to the canvas, so what the
    patient tuned on the Adjust Colors screen is exactly what the games draw.
    """
    value = str(channel.get("hex", "#ff0000")).lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    r, g, b = (int(value[i : i + 2], 16) for i in (0, 2, 4))
    scale = max(0, min(256, int(channel.get("intensity", 256)))) / 256.0
    alpha = max(0.0, min(1.0, float(channel.get("alpha", 1.0))))
    return f"rgba({round(r * scale)}, {round(g * scale)}, {round(b * scale)}, {round(alpha, 3)})"


def resolve_palette(mode: dict[str, Any], anaglyph: dict[str, Any]) -> dict[str, Any]:
    """Decide which colour the treated eye must chase.

    Anaglyph polarity flips with background luminance, and getting it backwards
    trains the wrong eye:

    * On a dark background an object matching a filter's colour passes through
      that filter and is blocked by the other, so it is seen by the matching
      eye only.
    * On a light background the same object washes out for the matching eye and
      reads as a dark silhouette to the other, so visibility inverts.

    The two cases are calibrated independently on the Adjust Colors screen -
    red/blue against black, red/cyan against white - so the profile is picked
    by background rather than interpolated.
    """
    background_key = anaglyph.get("active_background", "black")
    profile = anaglyph.get(background_key) or {}
    background = profile.get("background", "#000000" if background_key == "black" else "#ffffff")
    channels: dict[str, Any] = profile.get("channels") or {}
    left_filter = anaglyph.get("left_filter", "red")

    light_background = _relative_luminance(background) >= 0.5
    polarity = "light" if light_background else "dark"
    fusion = (
        anaglyph.get("fusion_light", "#101010")
        if light_background
        else anaglyph.get("fusion_dark", "#e8e8e8")
    )

    treated_eye = mode["eye"]
    # The fellow eye always wears the complementary filter.
    complement = "cyan" if "cyan" in channels else "blue"
    treated_filter = (
        left_filter if treated_eye == "left" else (complement if left_filter == "red" else "red")
    )
    if treated_filter not in channels:
        treated_filter = "red" if "red" in channels else complement
    other_filter = complement if treated_filter == "red" else "red"

    if not mode["anaglyph"]:
        # Monocular: the fellow eye is patched, so there is no channel to separate.
        return {
            "anaglyph": False,
            "treated_eye": treated_eye,
            "background": background,
            "background_key": background_key,
            "target": fusion,
            "suppressed": fusion,
            "fusion": fusion,
            "polarity": polarity,
            "note": f"Patch the {'right' if treated_eye == 'left' else 'left'} eye.",
        }

    # On a light background visibility inverts, so the treated eye chases the
    # channel matching the *other* filter.
    target_filter = other_filter if light_background else treated_filter
    suppressed_filter = treated_filter if light_background else other_filter

    return {
        "anaglyph": True,
        "treated_eye": treated_eye,
        "treated_filter": treated_filter,
        "background": background,
        "background_key": background_key,
        # Targets: only the treated eye sees these.
        "target": _channel_css(channels.get(target_filter, {})),
        # Anti-suppression cues: only the fellow eye sees these.
        "suppressed": _channel_css(channels.get(suppressed_filter, {})),
        # Shared surround: both eyes see this, which is what holds fusion.
        "fusion": fusion,
        "polarity": polarity,
        "channels": {name: _channel_css(ch) for name, ch in channels.items()},
        "note": (
            f"{treated_filter.capitalize()} filter over the {treated_eye} eye. "
            f"Targets render in {target_filter} on a {polarity} background."
        ),
    }


def _stimuli_for(activity_id: str, params: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    """Seeded stimulus material, shaped to what each activity consumes."""
    span = int(params.get("span") or 8)
    distractors = int(params.get("distractors") or 0)

    def letters(n: int) -> list[str]:
        return [rng.choice(SLOAN) for _ in range(max(n, 1))]

    if activity_id in ("connect_the_letters", "alphabet_racer"):
        # An ordered trail the patient must follow, plus off-sequence lures.
        # The trail is drawn from the Sloan set in chart order rather than A-Z,
        # so every glyph on screen is a true optotype in the chart face.
        sequence = SLOAN[: max(2, min(span, len(SLOAN)))]
        return {"sequence": sequence, "lures": letters(distractors)}

    if activity_id == "number_text":
        return {"sequence": [str(rng.randint(1, 99)) for _ in range(span)]}

    if activity_id == "hop_the_e":
        return {"orientations": [rng.choice(E_ORIENTATIONS) for _ in range(40)]}

    if activity_id in (
        "floating_letters_tachistoscope",
        "jump_letters_tachistoscope",
        "common_word_sequence",
    ):
        # Three-letter words from the nursery/LKG vocabulary: the child spells a
        # word they already know rather than recalling an arbitrary string.
        three = [w for w in COMMON_WORDS if len(w) == 3]
        return {"words": [rng.choice(three).upper() for _ in range(40)]}

    if activity_id == "match_the_slant_lines":
        return {"angles": [rng.choice([-60, -30, 0, 30, 60, 90]) for _ in range(40)]}

    if activity_id == "pattern_matching":
        shapes = ["circle", "square", "triangle", "diamond", "cross", "star"]
        return {"shapes": shapes, "trials": [rng.choice(shapes) for _ in range(40)]}

    if activity_id in ("match_symbol_contrast_pursuit", "match_symbol_contrast_saccades"):
        symbols = ["circle", "square", "triangle", "diamond", "cross", "star"]
        contrast = float(params.get("contrast") or 0.35)
        # Each trial pairs a reference symbol with a contrast step to match.
        trials = []
        for _ in range(40):
            symbol = rng.choice(symbols)
            # Clamped: Michelson contrast is defined on 0-1, and a step above
            # 1.0 rendered as an out-of-range CSS channel that the browser
            # silently pinned to full - compressing the top of the ladder
            # instead of extending it.
            steps = sorted({min(1.0, round(contrast * m, 3)) for m in (0.6, 1.0, 1.5, 2.2)})
            trials.append({"symbol": symbol, "target_contrast": rng.choice(steps), "steps": steps})
        return {"symbols": symbols, "trials": trials}

    if activity_id == "smiley":
        return {"moods": [rng.choice(["happy", "sad"]) for _ in range(40)]}

    if activity_id == "crush_the_letters":
        return {"letters": letters(80), "targets": letters(40)}

    # Generic pool for the purely spatial games.
    return {"letters": letters(60)}


def build_plan(
    session_id: str,
    activity_id: str,
    mode_id: str,
    difficulty: str,
    acuity: int,
    duration_min: float,
    calibration: DisplayCalibration,
    anaglyph: dict[str, Any],
    seed: int,
) -> dict[str, Any]:
    mode = get_mode(mode_id)
    # Resolve against the therapy so the briefing screen gets the display
    # title, discipline and any therapy-specific renaming.
    activity = resolve_activity(get_activity(activity_id), mode["therapy"])
    acuity_info = describe(acuity, calibration)
    params = resolve(activity_id, difficulty, acuity_info["height_css_px"])
    rng = random.Random(seed)

    return {
        "session_id": session_id,
        "activity": activity,
        "mode": mode,
        "params": params,
        "acuity": acuity_info,
        "palette": resolve_palette(mode, anaglyph),
        "seed": seed,
        "duration_s": duration_min * 60.0,
        "stimuli": _stimuli_for(activity_id, params, rng),
    }
