"""Turn a baseline assessment into a concrete therapy plan.

The assessment says where the patient is. This says what to actually run:
which eye, which therapy mode, what optotype size to start activities at, what
difficulty, and how much of it per day.

Dosing follows what approved digital amblyopia therapies prescribe, rather
than a number picked to feel reasonable:

* Luminopia One - 1 hour/day, 6 days/week, 12 weeks.
* CureSight - 90 minutes/day, 5 days/week, 16 weeks.
* The patching comparator in those trials - 2 hours/day, 7 days/week.

The more conservative of the two digital regimens is used as the default.

Starting size is set two lines *coarser* than measured threshold. Running
therapy at threshold means the patient fails most trials, which is
demotivating and trains nothing; a task that is achievable and then tightened
is the point of having an acuity control at all.
"""

from __future__ import annotations

from typing import Any

from .assessment import ACUITY_LEVELS, logmar_to_snellen, snellen_to_logmar

# Start activities this many logMAR easier than threshold.
HEADROOM_LOGMAR = 0.2

# Luminopia-style dose: the more conservative of the two approved regimens.
DAILY_MINUTES = 60
DAYS_PER_WEEK = 6
PROGRAMME_WEEKS = 12

# A crowding cost above this is large enough to shape the activity mix.
HIGH_CROWDING_LOGMAR = 0.15


def _nearest_level(target_logmar: float) -> int:
    """Closest available Snellen level to a logMAR value."""
    return min(ACUITY_LEVELS, key=lambda d: abs(snellen_to_logmar(d) - target_logmar))


def _difficulty(baseline_logmar: float, crowding: float) -> tuple[str, str]:
    """Difficulty governs speed and clutter, not letter size."""
    if baseline_logmar >= 0.4 or crowding >= HIGH_CROWDING_LOGMAR:
        return "easy", (
            "Starting easy: slower targets and less clutter, because acuity or crowding "
            "is the limiting factor right now."
        )
    if baseline_logmar >= 0.2:
        return "medium", "Acuity is moderate, so standard speed and clutter."
    return "hard", "Acuity is close to normal, so the task can carry more speed and clutter."


def build_plan(report: dict[str, Any], glasses_usable: bool = True) -> dict[str, Any]:
    """Recommend therapy settings from a completed baseline.

    If there is nothing to treat, say so rather than prescribing a programme
    anyway. Recommending 72 hours of therapy to someone measuring 20/20 in both
    eyes would be worse than useless.
    """
    # Derive rather than trust the flag: reports written before it existed do
    # not carry it, and a stale record must not produce a bogus prescription.
    at_ceiling = bool(
        report.get("at_ceiling", report.get("baseline_logmar", 1.0) <= 0.0)
    )
    amblyopia = bool(report.get("iod_flagged"))
    if at_ceiling and not amblyopia:
        return {
            "indicated": False,
            "headline": "No therapy indicated on these numbers.",
            "treated_eye": None,
            "therapy": None,
            "mode_id": None,
            "targets": report["targets"],
            "rationale": [
                "Both eyes measure 20/20, the finest line on the chart, and they are within "
                f"{report['interocular_difference']:.2f} logMAR of each other.",
                "There is no acuity deficit to improve and no interocular difference to close, "
                "so a therapy programme has no target to work towards.",
                "If there is a concern not captured by acuity - eye strain, double vision, "
                "reading difficulty, poor depth perception - that needs an eye examination, "
                "not this app.",
            ],
            "review": (
                "Re-test only if symptoms change. Repeating a normal test will mostly measure "
                f"noise, which is about {report['measurement_noise_logmar']} logMAR."
            ),
        }

    worse_eye = report.get("amblyopic_eye")
    if not worse_eye:
        # No meaningful interocular difference: treat the poorer eye anyway, but
        # say plainly that this is not an amblyopia picture.
        worse_eye = (
            "left"
            if report["left"]["isolated_logmar"] >= report["right"]["isolated_logmar"]
            else "right"
        )

    baseline = report["baseline_logmar"]
    crowding = report[worse_eye]["crowding_ratio"]

    # MFBF keeps both eyes open and is the preferred modern approach, but it is
    # only honest if the glasses actually separate the channels.
    therapy = "mfbf" if glasses_usable else "monocular"
    mode_id = f"{therapy}_{worse_eye}"

    start_level = _nearest_level(baseline + HEADROOM_LOGMAR)
    difficulty, difficulty_why = _difficulty(baseline, crowding)

    emphasis: list[str] = ["pursuits", "saccades"]
    if crowding >= HIGH_CROWDING_LOGMAR:
        emphasis.insert(0, "crowding")

    session_minutes = 10
    sessions_per_day = max(1, round(DAILY_MINUTES / session_minutes))

    return {
        "indicated": True,
        "headline": f"Treat the {worse_eye} eye.",
        "treated_eye": worse_eye,
        "therapy": therapy,
        "mode_id": mode_id,
        "amblyopia_pattern": bool(report.get("iod_flagged")),
        "acuity": {
            "start_denominator": start_level,
            "start_snellen": f"20/{start_level}",
            "threshold_snellen": logmar_to_snellen(baseline),
            "headroom_logmar": HEADROOM_LOGMAR,
        },
        "difficulty": difficulty,
        "duration_min": session_minutes,
        "dose": {
            "daily_minutes": DAILY_MINUTES,
            "sessions_per_day": sessions_per_day,
            "days_per_week": DAYS_PER_WEEK,
            "programme_weeks": PROGRAMME_WEEKS,
            "total_hours": round(DAILY_MINUTES * DAYS_PER_WEEK * PROGRAMME_WEEKS / 60),
        },
        "emphasis": emphasis,
        "targets": report["targets"],
        "rationale": [
            (
                f"Treating the {worse_eye} eye: it measured "
                f"{report[worse_eye]['isolated_snellen']} against "
                f"{report['right' if worse_eye == 'left' else 'left']['isolated_snellen']} "
                f"in the other eye."
            )
            if report.get("iod_flagged")
            else (
                f"The eyes are within {report['interocular_difference']:.2f} logMAR of each "
                "other, so this is not an amblyopia pattern. Treating the poorer eye, but "
                "a clinician should confirm therapy is indicated at all."
            ),
            (
                "MFBF: both eyes stay open behind the glasses, which is the preferred "
                "modern approach."
                if glasses_usable
                else "Monocular with the fellow eye patched, because the glasses did not "
                "separate the colour channels reliably."
            ),
            (
                f"Activities start at 20/{start_level} - two lines larger than the measured "
                f"{logmar_to_snellen(baseline)} threshold, so the task is winnable from day one."
            ),
            difficulty_why,
            (
                f"{DAILY_MINUTES} minutes a day, {DAYS_PER_WEEK} days a week, for "
                f"{PROGRAMME_WEEKS} weeks - about "
                f"{sessions_per_day} sessions of {session_minutes} minutes daily. This mirrors "
                "the dose approved digital amblyopia therapies prescribe."
            ),
            (
                f"Crowding costs {crowding:.2f} logMAR in that eye, so crowding activities are "
                "prioritised."
                if crowding >= HIGH_CROWDING_LOGMAR
                else "Crowding is not a major limiter, so the mix leads with pursuits and saccades."
            ),
        ],
        "review": (
            "Re-test after 4 weeks. Only a change larger than "
            f"{report['measurement_noise_logmar']} logMAR is bigger than measurement noise."
        ),
    }
