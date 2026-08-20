"""Anaglyph glasses calibration, measured rather than assumed.

Two things the app must not take on trust:

1. **Which lens is over which eye.** A stored guess means a patient who wears
   the glasses the other way round has every MFBF activity training the wrong
   eye - silently, because nothing on screen looks wrong.

2. **How dark each channel must be.** Dragging an alpha slider until a patch
   "looks gone" is one unaided judgement at one shade, with no check that the
   treated eye can still see it.

Phase 1 - orientation, one colour at a time
    A red patch is shown alone, on a randomised side, with one eye closed. If
    the open eye can locate it, that eye is behind the red lens; if red is
    completely invisible, it is behind the complementary one.

    Showing red and blue together would let the observer compare and infer
    rather than judge absolutely, and comparison survives poor lenses that
    absolute invisibility does not. Both eyes are run; the answers must
    disagree, which is the consistency check.

Phase 2 - isolation, shown as a palette
    All shades of one colour are presented at once, brightest to faintest, and
    the patient marks the faintest one they can still see with the eye that
    must *not* see it. Everything below that is invisible to the fellow eye.

    A palette is used rather than a descending staircase because a child can
    point at "the last one I can see" far more reliably than they can sit
    through eleven separate yes/no trials, and seeing the series together makes
    the fade obvious rather than a judgement about one patch in isolation.

Phase 3 - the child picks the working shade
    Only the shades at or below the isolation point are offered, and the
    patient picks whichever looks the best, clearest colour with the treated
    eye. That becomes the stored alpha. Every option is already invisible to
    the fellow eye, so preference cannot compromise isolation.
"""

from __future__ import annotations

from typing import Any, Literal

Eye = Literal["left", "right"]

# Shades offered as the palette, brightest first.
ALPHA_LADDER: list[float] = [1.0, 0.85, 0.7, 0.6, 0.5, 0.42, 0.35, 0.28, 0.22, 0.16, 0.1]

# Backgrounds are calibrated separately: the pairing and the polarity differ.
PROFILES: dict[str, list[str]] = {"black": ["red", "blue"], "white": ["red", "cyan"]}

# If the fellow eye can still see shades this faint, the lens is barely working.
POOR_ISOLATION_ALPHA = 0.85


def complement(channel: str, background: str) -> str:
    """The other channel in the same background profile."""
    pair = PROFILES[background]
    return pair[1] if channel == pair[0] else pair[0]


def steps() -> list[dict[str, Any]]:
    """The ordered wizard, so the client can render a progress bar."""
    plan: list[dict[str, Any]] = [
        {"kind": "orientation", "eye": "right"},
        {"kind": "orientation", "eye": "left"},
    ]
    for background, channels in PROFILES.items():
        for channel in channels:
            # Find where it disappears to the fellow eye, then let the treated
            # eye choose among the shades that are safe.
            plan.append({"kind": "isolate", "background": background, "channel": channel})
            plan.append({"kind": "choose", "background": background, "channel": channel})
    return plan


def resolve_orientation(right_answer: str, left_answer: str) -> dict[str, Any]:
    """Work out which lens sits over which eye.

    Each eye is shown red alone. ``"red"`` means that eye located the red
    patch, so it sits behind the red lens. ``"none"`` means red was completely
    invisible to it, so it sits behind the complementary lens. Anything else -
    "both", a wrong side - is not a usable answer.
    """

    def lens(answer: str) -> str | None:
        if answer == "red":
            return "red"
        if answer in ("none", "blue"):
            # Red invisible to this eye means it is behind the blue/cyan lens.
            return "blue"
        return None

    right_filter = lens(right_answer)
    left_filter = lens(left_answer)

    consistent = (
        right_filter is not None and left_filter is not None and right_filter != left_filter
    )
    resolved = left_filter

    return {
        "right_filter": right_filter,
        "left_filter": resolved,
        "consistent": consistent,
        # Disagreeing answers mean the glasses moved, an eye was not properly
        # closed, or the lenses are not a complementary pair. Any of those makes
        # the result unsafe to act on.
        "usable": consistent and resolved is not None,
        "note": (
            f"{resolved.capitalize()} lens over the left eye."
            if consistent and resolved
            else "Answers disagree - reseat the glasses and repeat."
        ),
    }


def safe_shades(faintest_seen: float | None) -> list[float]:
    """Shades invisible to the fellow eye, and therefore safe to use.

    ``faintest_seen`` is the faintest shade the fellow eye could still make
    out; everything below it is safe. ``None`` means nothing was visible at
    all, so the whole palette is safe.
    """
    if faintest_seen is None:
        return list(ALPHA_LADDER)
    return [a for a in ALPHA_LADDER if a < faintest_seen]


def build_result(
    orientation: dict[str, Any],
    isolation: dict[str, dict[str, float | None]],
    chosen: dict[str, dict[str, float | None]],
) -> dict[str, Any]:
    """Turn the wizard's answers into a settings patch plus a verdict."""
    channels_out: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    blocked = False

    for background, names in PROFILES.items():
        profile: dict[str, Any] = {}
        for channel in names:
            faintest = isolation.get(background, {}).get(channel)
            options = safe_shades(faintest)

            if not options:
                # Even the faintest shade was visible to the eye that must not
                # see it: this lens is not blocking the channel at all.
                warnings.append(
                    f"{channel} on {background}: visible to the wrong eye even at the faintest "
                    "shade, so this channel cannot be isolated."
                )
                blocked = True
                alpha: float = ALPHA_LADDER[-1]
            else:
                pick = chosen.get(background, {}).get(channel)
                if pick is None or pick not in options:
                    if pick is not None:
                        warnings.append(
                            f"{channel} on {background}: the chosen shade was not one of the safe "
                            "options, so the brightest safe shade was used instead."
                        )
                    # Brightest shade the fellow eye still cannot see.
                    alpha = options[0]
                else:
                    alpha = pick

            if faintest is not None and faintest >= POOR_ISOLATION_ALPHA:
                warnings.append(
                    f"{channel} on {background}: still visible to the wrong eye at "
                    f"{faintest:.2f}, which is very bright. Check the glasses are the right type."
                )

            profile[channel] = {
                "alpha": round(float(alpha), 3),
                "isolated_below": faintest,
                "options": options,
            }
        channels_out[background] = profile

    return {
        "orientation": orientation,
        "channels": channels_out,
        "warnings": warnings,
        "usable": bool(orientation.get("usable")) and not blocked,
    }


def apply_to_settings(settings: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    """Merge a calibration result into the stored anaglyph settings."""
    anaglyph = dict(settings["anaglyph"])
    left_filter = result["orientation"].get("left_filter")
    if left_filter in ("red", "blue"):
        anaglyph["left_filter"] = left_filter

    for background, channels in result["channels"].items():
        profile = dict(anaglyph.get(background) or {})
        existing = dict(profile.get("channels") or {})
        for channel, measured in channels.items():
            current = dict(existing.get(channel) or {})
            current["alpha"] = measured["alpha"]
            existing[channel] = current
        profile["channels"] = existing
        anaglyph[background] = profile

    return {**settings, "anaglyph": anaglyph}
