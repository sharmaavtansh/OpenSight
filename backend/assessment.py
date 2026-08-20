"""Baseline assessment: measure where a patient starts, and set the target.

Protocol
--------
A tumbling-E, 4-alternative forced-choice acuity staircase, scored
letter-by-letter on the ETDRS convention.

Why these choices:

* **Tumbling E, 4AFC.** No literacy needed, so it works for the children this
  app is aimed at, and the optotype is the same 5x5 grid geometry the therapy
  activities already draw. Chance performance is 25%.
* **Five optotypes per level, 0.1 logMAR between levels, 0.02 logMAR per
  optotype.** This is the ETDRS scoring convention - each of the five letters
  on a line carries one fifth of that line's 0.1 logMAR.
* **Letter-by-letter (not line-assignment) scoring.** Reported test-retest
  variability is materially lower letter-by-letter, with a within-test SD of
  roughly 0.04 logMAR, versus coarser line assignment.
* **Terminate at 3 or more errors on a level.** Passing is 3/5, which sits
  above the 25% guess rate for a 4AFC task.
* **Two phases, so the test stays short.** Running all eleven levels at five
  optotypes each takes ~45 trials per eye per condition - six minutes of
  button pressing for a child, most of it spent on lines they can read
  trivially. Instead a *screening* phase descends one optotype per level until
  the first error, then the *threshold* phase backs up two levels and runs the
  full five-per-level staircase from there. This is the same bracket-then-
  measure shape the Amblyopia Treatment Study protocol uses, and it cuts the
  test to roughly a third of the trials without changing the scale: levels
  bracketed in screening are credited as read.

Two conditions are run per eye, because amblyopia is not only a resolution
loss:

* **isolated** - a single optotype, no flankers.
* **crowded** - the same optotype ringed by flanking bars at one optotype
  width. Crowded acuity normally sits about one line worse than isolated;
  a markedly larger gap is itself an amblyopia sign.

Derived measures
----------------
* **crowding ratio** = crowded logMAR - isolated logMAR.
* **interocular difference (IOD)** = worse eye logMAR - better eye logMAR.
  An IOD of 0.2 logMAR or more with an otherwise normal eye is the usual
  amblyopia threshold.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Literal

# Levels run coarse -> fine. 20/200 is logMAR 1.0, 20/20 is logMAR 0.0.
ACUITY_LEVELS: list[int] = [200, 160, 125, 100, 80, 63, 50, 40, 32, 25, 20]

OPTOTYPES_PER_LEVEL = 5
LOGMAR_PER_LEVEL = 0.1
LOGMAR_PER_OPTOTYPE = LOGMAR_PER_LEVEL / OPTOTYPES_PER_LEVEL  # 0.02, ETDRS
PASS_THRESHOLD = 3  # of 5; above the 25% chance rate of a 4AFC task

# 95% test-retest limits for letter-by-letter scoring. Anything smaller than
# this is measurement noise, not change, and the UI must not claim otherwise.
TEST_RETEST_LOGMAR = 0.1

# Clinically meaningful improvement is two logMAR lines.
MEANINGFUL_GAIN_LOGMAR = 0.2
# PEDIG-style treatment success: three or more lines gained, or the amblyopic
# eye reaching 20/25 (0.1 logMAR) or better.
SUCCESS_GAIN_LOGMAR = 0.3
SUCCESS_CEILING_LOGMAR = 0.1
# Amblyopia is conventionally flagged at an interocular difference of 2 lines.
AMBLYOPIA_IOD_LOGMAR = 0.2

Condition = Literal["isolated", "crowded"]
Eye = Literal["left", "right"]
DIRECTIONS = ["right", "down", "left", "up"]


def snellen_to_logmar(denominator: int) -> float:
    return round(math.log10(denominator / 20.0), 3)


def logmar_to_snellen(logmar: float) -> str:
    """Nearest conventional Snellen line for display."""
    denominator = 20.0 * (10.0**logmar)
    nearest = min(ACUITY_LEVELS, key=lambda d: abs(d - denominator))
    return f"20/{nearest}"


# How far to back up from the first screening error before measuring.
BRACKET_BACKOFF = 2

Phase = Literal["screen", "threshold"]


@dataclass
class LevelResult:
    denominator: int
    logmar: float
    correct: int
    presented: int
    phase: Phase = "threshold"


@dataclass
class ConditionRun:
    """One eye, one condition: the staircase and its score."""

    eye: Eye
    condition: Condition
    levels: list[LevelResult] = field(default_factory=list)

    # --- screening phase ---------------------------------------------------

    @property
    def screen_levels(self) -> list[LevelResult]:
        return [lv for lv in self.levels if lv.phase == "screen"]

    @property
    def threshold_levels(self) -> list[LevelResult]:
        return [lv for lv in self.levels if lv.phase == "threshold"]

    @property
    def bracket_index(self) -> int | None:
        """Index of the level the threshold phase should start from.

        None while screening is still running.
        """
        for lv in self.screen_levels:
            if lv.correct == 0 and lv.presented > 0:
                first_error = ACUITY_LEVELS.index(lv.denominator)
                return max(0, first_error - BRACKET_BACKOFF)
        # Screening reached the finest level without an error.
        if self.screen_levels and self.screen_levels[-1].denominator == ACUITY_LEVELS[-1]:
            return max(0, len(ACUITY_LEVELS) - 1 - BRACKET_BACKOFF)
        return None

    # --- scoring -----------------------------------------------------------

    @property
    def implied_correct(self) -> int:
        """Optotypes credited for levels bracketed away during screening."""
        index = self.bracket_index
        return 0 if index is None else index * OPTOTYPES_PER_LEVEL

    @property
    def total_correct(self) -> int:
        return self.implied_correct + sum(lv.correct for lv in self.threshold_levels)

    @property
    def terminated(self) -> bool:
        levels = self.threshold_levels
        if not levels:
            return False
        last = levels[-1]
        if last.presented < OPTOTYPES_PER_LEVEL:
            return False
        # Stop on 3+ errors, or when the finest level has been completed.
        return last.correct < PASS_THRESHOLD or last.denominator == ACUITY_LEVELS[-1]

    def threshold_logmar(self) -> float:
        """ETDRS letter-by-letter score.

        Start from the coarsest level and credit 0.02 logMAR per optotype
        identified, including those bracketed during screening. A patient who
        reads every optotype on a level gains the full 0.1 logMAR for it, so
        the score stays on the same scale as line-based reporting while
        resolving to a fifth of a line.
        """
        start = snellen_to_logmar(ACUITY_LEVELS[0])
        score = start - self.total_correct * LOGMAR_PER_OPTOTYPE
        floor = snellen_to_logmar(ACUITY_LEVELS[-1])
        return round(max(score, floor), 3)


def next_step(run: ConditionRun) -> tuple[int, Phase] | None:
    """Next (Snellen level, phase) to present, or None when the run is done."""
    bracket = run.bracket_index

    if bracket is None:
        # Screening: one optotype per level, coarse to fine.
        screened = run.screen_levels
        if not screened:
            return ACUITY_LEVELS[0], "screen"
        last = screened[-1]
        index = ACUITY_LEVELS.index(last.denominator)
        if index + 1 >= len(ACUITY_LEVELS):
            return None
        return ACUITY_LEVELS[index + 1], "screen"

    # Threshold: five per level from the bracketed start.
    measured = run.threshold_levels
    if not measured:
        return ACUITY_LEVELS[bracket], "threshold"
    last = measured[-1]
    if last.presented < OPTOTYPES_PER_LEVEL:
        return last.denominator, "threshold"
    if run.terminated:
        return None
    index = ACUITY_LEVELS.index(last.denominator)
    if index + 1 >= len(ACUITY_LEVELS):
        return None
    return ACUITY_LEVELS[index + 1], "threshold"


def next_level(run: ConditionRun) -> int | None:
    step = next_step(run)
    return None if step is None else step[0]


def summarise_eye(isolated: ConditionRun, crowded: ConditionRun) -> dict[str, Any]:
    iso = isolated.threshold_logmar()
    crw = crowded.threshold_logmar()
    return {
        "eye": isolated.eye,
        "isolated_logmar": iso,
        "isolated_snellen": logmar_to_snellen(iso),
        "crowded_logmar": crw,
        "crowded_snellen": logmar_to_snellen(crw),
        # Positive means crowded is worse, which is the expected direction.
        "crowding_ratio": round(crw - iso, 3),
    }


def build_report(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    """Combine both eyes into a baseline, and state the therapy targets."""
    worse, better = (left, right) if left["isolated_logmar"] >= right["isolated_logmar"] else (right, left)
    iod = round(worse["isolated_logmar"] - better["isolated_logmar"], 3)

    baseline = worse["isolated_logmar"]

    # The chart bottoms out at 20/20. If the patient is already there, there is
    # no acuity left to gain and quoting a target equal to the baseline is
    # meaningless - so say so instead of inventing one.
    chart_floor = snellen_to_logmar(ACUITY_LEVELS[-1])
    at_ceiling = baseline <= chart_floor

    target = None if at_ceiling else round(max(baseline - MEANINGFUL_GAIN_LOGMAR, chart_floor), 3)
    # Success is three lines gained OR reaching 20/25, whichever comes first -
    # so the target to state is the nearer of the two, not the harder one.
    success = (
        None
        if at_ceiling
        else round(max(baseline - SUCCESS_GAIN_LOGMAR, SUCCESS_CEILING_LOGMAR), 3)
    )

    return {
        "left": left,
        "right": right,
        "amblyopic_eye": worse["eye"] if iod >= AMBLYOPIA_IOD_LOGMAR else None,
        "interocular_difference": iod,
        "iod_flagged": iod >= AMBLYOPIA_IOD_LOGMAR,
        "baseline_logmar": baseline,
        "baseline_snellen": logmar_to_snellen(baseline),
        "at_ceiling": at_ceiling,
        "targets": {
            # Two lines: the accepted threshold for a clinically meaningful gain.
            "meaningful_logmar": target,
            "meaningful_snellen": None if target is None else logmar_to_snellen(target),
            # Three lines, or 20/25 - PEDIG-style treatment success.
            "success_logmar": success,
            "success_snellen": None if success is None else logmar_to_snellen(success),
            "iod_goal_logmar": 0.1,
        },
        "measurement_noise_logmar": TEST_RETEST_LOGMAR,
        "notes": [
            *(
                [
                    "Acuity already measures 20/20 in both eyes, which is the finest line "
                    "this chart has. There is no acuity improvement available to target, so "
                    "no acuity goal is set."
                ]
                if at_ceiling
                else []
            ),
            "Two logMAR lines (0.20) is the accepted threshold for a clinically "
            "meaningful improvement.",
            "Treatment success is conventionally three or more lines gained, or the "
            "amblyopic eye reaching 20/25.",
            f"Test-retest variability is about {TEST_RETEST_LOGMAR} logMAR, so a change "
            "smaller than one line should not be read as real progress.",
        ],
    }


def progress_against(baseline: dict[str, Any], latest: dict[str, Any]) -> dict[str, Any]:
    """Compare a follow-up assessment with the baseline."""
    start = baseline["baseline_logmar"]
    now = latest["baseline_logmar"]
    gain = round(start - now, 3)
    lines = round(gain / LOGMAR_PER_LEVEL, 1)
    return {
        "baseline_logmar": start,
        "current_logmar": now,
        "gain_logmar": gain,
        "gain_lines": lines,
        # Only a change beyond test-retest noise counts as real.
        "beyond_noise": abs(gain) > TEST_RETEST_LOGMAR,
        "meaningful": gain >= MEANINGFUL_GAIN_LOGMAR,
        "success": gain >= SUCCESS_GAIN_LOGMAR or now <= SUCCESS_CEILING_LOGMAR,
        "percent_to_target": (
            max(0, min(100, round(100 * gain / MEANINGFUL_GAIN_LOGMAR)))
            if MEANINGFUL_GAIN_LOGMAR
            else 0
        ),
    }
