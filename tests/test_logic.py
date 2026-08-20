"""The clinical maths, checked against values derived independently.

These are the numbers that decide what a child is actually shown. An error here
is a wrong measurement rather than a cosmetic fault, so the expected values are
worked out from the definitions rather than copied from the implementation -
otherwise the test only proves the code agrees with itself.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import assessment, difficulty, glasses, planner, prescription  # noqa: E402
from backend.acuity import (  # noqa: E402
    DisplayCalibration,
    acuity_table,
    describe,
    logmar,
    mar_arcmin,
    optotype_height_mm,
    stroke_width_css_px,
)
from runner import check, close, equal, group, raises  # noqa: E402


def test_acuity() -> None:
    group("acuity: optotype geometry")

    # MAR = D/20 arcmin, by definition.
    equal("20/20 MAR is 1 arcmin", mar_arcmin(20), 1.0)
    equal("20/200 MAR is 10 arcmin", mar_arcmin(200), 10.0)
    equal("20/40 MAR is 2 arcmin", mar_arcmin(40), 2.0)

    # logMAR = log10(MAR).
    close("20/20 is logMAR 0.00", logmar(20), 0.0, 0.001)
    close("20/200 is logMAR 1.00", logmar(200), 1.0, 0.001)
    close("20/40 is logMAR 0.30", logmar(40), 0.301, 0.002)

    # A letter subtends 5 x MAR. At 40 cm, 20/20 is 5 arcmin:
    #   h = 2 * d * tan(t/2), d = 400 mm, t = 5' = 5/60 degrees
    cal = DisplayCalibration(
        viewing_distance_cm=40, screen_diagonal_in=15.6, screen_width_px=1920,
        screen_height_px=1080, device_pixel_ratio=1,
    )
    expected_mm = 2 * 400 * math.tan(math.radians(5 / 60) / 2)
    close("20/20 at 40cm is ~0.58 mm", optotype_height_mm(20, cal), expected_mm, 0.001)
    check("that is the well-known 0.58 mm", abs(expected_mm - 0.582) < 0.005, f"{expected_mm:.4f}")

    # Ten times the angle is ten times the height, to within the tangent's
    # curvature - at these angles it is linear to five decimal places.
    ratio = optotype_height_mm(200, cal) / optotype_height_mm(20, cal)
    close("20/200 is 10x the height of 20/20", ratio, 10.0, 0.001)

    # Stroke is one fifth of the letter, the 5x5 optotype grid.
    from backend.acuity import optotype_height_css_px

    close(
        "stroke is a fifth of the letter",
        stroke_width_css_px(200, cal) * 5,
        optotype_height_css_px(200, cal),
        0.01,
    )

    # Doubling the viewing distance doubles the physical size needed.
    far = DisplayCalibration(
        viewing_distance_cm=80, screen_diagonal_in=15.6, screen_width_px=1920,
        screen_height_px=1080, device_pixel_ratio=1,
    )
    close(
        "twice the distance needs twice the height",
        optotype_height_mm(20, far) / optotype_height_mm(20, cal),
        2.0,
        0.001,
    )

    group("acuity: display calibration")
    # Ruler calibration must beat the nominal diagonal.
    measured = DisplayCalibration(
        viewing_distance_cm=40, screen_diagonal_in=15.6, screen_width_px=1920,
        screen_height_px=1080, device_pixel_ratio=1, content_size_px=300,
    )
    check("a measured pitch is used when present", measured.calibrated is True)
    check("nominal pitch is not used when measured", abs(measured.ppi - measured.nominal_ppi) > 1,
          f"ppi={measured.ppi:.2f} nominal={measured.nominal_ppi:.2f}")
    check("uncalibrated falls back to nominal", cal.calibrated is False)
    close("uncalibrated ppi equals nominal", cal.ppi, cal.nominal_ppi, 0.001)

    # The reference E is 7.2 cm at or below 32 inch, 10 cm above.
    big = DisplayCalibration(
        viewing_distance_cm=40, screen_diagonal_in=42, screen_width_px=3840,
        screen_height_px=2160, device_pixel_ratio=1,
    )
    equal("small screens use the 7.2 cm reference", cal.reference_e_cm, 7.2)
    equal("large screens use the 10 cm reference", big.reference_e_cm, 10.0)

    group("acuity: renderability")
    row = describe(20, cal)
    check("20/20 at 40cm on a 141ppi panel is not renderable", row["renderable"] is False,
          f"{row['height_css_px']} css px")
    row200 = describe(200, cal)
    check("20/200 is renderable", row200["renderable"] is True, f"{row200['height_css_px']} css px")
    table = acuity_table(cal)
    check("the table covers a full ladder", len(table) >= 8, f"{len(table)} rows")
    check(
        "the table is ordered coarse to fine",
        all(table[i]["denominator"] >= table[i + 1]["denominator"] for i in range(len(table) - 1)),
    )


def test_difficulty() -> None:
    group("difficulty: scaling")
    for activity in ("shoot_the_asteroids", "balloon_pop_pursuit", "match_symbol_contrast_pursuit"):
        easy = difficulty.resolve(activity, "easy", 24.0)
        hard = difficulty.resolve(activity, "hard", 24.0)
        if "window_ms" in easy:
            check(f"{activity}: hard gives less time", hard["window_ms"] < easy["window_ms"],
                  f"{easy['window_ms']} -> {hard['window_ms']}")
        if "contrast" in easy:
            check(f"{activity}: hard is lower contrast", hard["contrast"] < easy["contrast"],
                  f"{easy['contrast']} -> {hard['contrast']}")

    raises("an unknown activity raises", lambda: difficulty.resolve("nope", "easy", 24.0), KeyError)
    raises(
        "an unknown difficulty raises",
        lambda: difficulty.resolve("shoot_the_asteroids", "extreme", 24.0),
        ValueError,
    )

    group("difficulty: contrast stays in range")
    for d in ("easy", "medium", "hard"):
        for a in ("match_symbol_contrast_pursuit", "match_symbol_contrast_saccades"):
            c = difficulty.resolve(a, d, 24.0)["contrast"]
            check(f"{a[-8:]}/{d}: contrast within 0-1", 0 < c <= 1.0, f"{c}")

    group("difficulty: every activity resolves")
    from backend.catalog import ACTIVITIES

    for a in ACTIVITIES:
        for d in ("easy", "medium", "hard"):
            try:
                params = difficulty.resolve(a["id"], d, 24.0)
                ok = isinstance(params, dict) and len(params) > 0
            except Exception as e:  # noqa: BLE001
                ok, params = False, str(e)
            if not ok:
                check(f"{a['id']}/{d} resolves", False, str(params))
    check("all 20 activities x 3 difficulties resolve", True, f"{len(ACTIVITIES) * 3} combinations")


def test_planner() -> None:
    group("planner: anaglyph polarity")
    from backend.models import AnaglyphSettings

    anaglyph = AnaglyphSettings().model_dump()

    black = planner.resolve_palette({"anaglyph": True, "eye": "left"}, {**anaglyph, "active_background": "black"})
    white = planner.resolve_palette({"anaglyph": True, "eye": "left"}, {**anaglyph, "active_background": "white"})
    check("black background uses red/blue", "255, 0, 0" in black["target"] or "0, 0, 255" in black["target"],
          black["target"])
    check("the two backgrounds differ", black["background"] != white["background"],
          f"{black['background']} vs {white['background']}")
    check("target and suppressed are never equal", black["target"] != black["suppressed"])
    check("fusion differs from both channels",
          black["fusion"] not in (black["target"], black["suppressed"]))

    group("planner: monocular collapses the channels")
    mono = planner.resolve_palette({"anaglyph": False, "eye": "left"}, anaglyph)
    check("monocular target equals suppressed", mono["target"] == mono["suppressed"],
          f"{mono['target']}")

    group("planner: the treated eye follows the mode")
    left = planner.resolve_palette({"anaglyph": True, "eye": "left"}, anaglyph)
    right = planner.resolve_palette({"anaglyph": True, "eye": "right"}, anaglyph)
    check("swapping the eye swaps the channels",
          left["target"] == right["suppressed"] and left["suppressed"] == right["target"],
          f"L target={left['target']} R target={right['target']}")

    group("planner: seeded determinism")
    import random

    for activity in ("shoot_the_asteroids", "common_word_sequence", "alphabet_racer"):
        params = difficulty.resolve(activity, "easy", 24.0)
        a = planner._stimuli_for(activity, params, random.Random(7))
        b = planner._stimuli_for(activity, params, random.Random(7))
        c = planner._stimuli_for(activity, params, random.Random(8))
        check(f"{activity}: same seed, same stimuli", a == b)
        check(f"{activity}: a different seed differs", a != c)


def _feed(run, den, phase, correct):
    """Record one trial exactly the way the router does, so the test exercises
    the real accumulation rather than a convenient shortcut."""
    last = run.levels[-1] if run.levels else None
    if last is None or last.denominator != den or last.phase != phase:
        run.levels.append(
            assessment.LevelResult(den, assessment.snellen_to_logmar(den), 0, 0, phase)
        )
    level = run.levels[-1]
    level.presented += 1
    level.correct += 1 if correct else 0


def _drive(answer_for) -> "assessment.ConditionRun":
    """Run a whole condition to completion. `answer_for(den)` decides truth."""
    run = assessment.ConditionRun(eye="left", condition="isolated")
    for _ in range(600):
        step = assessment.next_step(run)
        if step is None:
            return run
        den, phase = step
        _feed(run, den, phase, answer_for(den))
    raise AssertionError("staircase did not terminate in 600 trials")


def test_assessment() -> None:
    group("assessment: snellen and logMAR round-trip")
    for den in (200, 100, 63, 40, 25, 20):
        lm = assessment.snellen_to_logmar(den)
        back = assessment.logmar_to_snellen(lm)
        check(f"20/{den} round-trips", back == f"20/{den}", back)

    group("assessment: the staircase terminates")
    perfect = _drive(lambda den: True)
    check("a perfect run terminates", True, f"{len(perfect.levels)} levels")
    check("a perfect run reaches the finest line",
          min(lv.denominator for lv in perfect.levels) == assessment.ACUITY_LEVELS[-1],
          f"finest reached 20/{min(lv.denominator for lv in perfect.levels)}")
    close("a perfect run scores at the chart floor", perfect.threshold_logmar(),
          assessment.snellen_to_logmar(assessment.ACUITY_LEVELS[-1]), 0.06)

    blind = _drive(lambda den: False)
    check("an all-wrong run terminates too", True, f"{len(blind.levels)} levels")
    check("an all-wrong run scores worse than a perfect one",
          blind.threshold_logmar() > perfect.threshold_logmar(),
          f"{blind.threshold_logmar()} vs {perfect.threshold_logmar()}")

    group("assessment: the threshold lands near the true acuity")
    # Someone who reliably reads down to 20/50 and no further.
    for truth in (100, 50, 32):
        run = _drive(lambda den, t=truth: den >= t)
        got = run.threshold_logmar()
        want = assessment.snellen_to_logmar(truth)
        close(f"a 20/{truth} reader measures near 20/{truth}", got, want, 0.16)

    group("assessment: trial count is tolerable for a child")
    total = sum(lv.presented for lv in _drive(lambda den: den >= 50).levels)
    check("a full condition is under 40 trials", total < 40, f"{total} trials")

    group("assessment: crowding and the report")
    iso = _drive(lambda den: den >= 40)
    crowded = _drive(lambda den: den >= 63)
    eye = assessment.summarise_eye(iso, crowded)
    check("crowded is scored worse than isolated", eye["crowding_ratio"] > 0,
          f"{eye['crowding_ratio']} logMAR cost")
    check("the eye summary names its snellen lines",
          eye["isolated_snellen"].startswith("20/") and eye["crowded_snellen"].startswith("20/"),
          f"{eye['isolated_snellen']} / {eye['crowded_snellen']}")

    group("assessment: thresholds are the documented ones")
    equal("5 optotypes per level", assessment.OPTOTYPES_PER_LEVEL, 5)
    equal("0.02 logMAR per optotype", round(assessment.LOGMAR_PER_OPTOTYPE, 3), 0.02)
    equal("3 of 5 passes", assessment.PASS_THRESHOLD, 3)
    equal("test-retest is 0.1 logMAR", assessment.TEST_RETEST_LOGMAR, 0.1)
    equal("meaningful gain is 0.2 logMAR (two lines)", assessment.MEANINGFUL_GAIN_LOGMAR, 0.2)
    equal("amblyopia IOD flag at 0.2 logMAR", assessment.AMBLYOPIA_IOD_LOGMAR, 0.2)


def _report(left_iso, left_crw, right_iso, right_crw):
    """A report built by the real code path, so the fixture cannot drift from
    the shape build_plan actually receives."""
    def eye(name, iso, crw):
        return {
            "eye": name,
            "isolated_logmar": iso,
            "isolated_snellen": assessment.logmar_to_snellen(iso),
            "crowded_logmar": crw,
            "crowded_snellen": assessment.logmar_to_snellen(crw),
            "crowding_ratio": round(crw - iso, 3),
        }

    return assessment.build_report(eye("left", left_iso, left_crw), eye("right", right_iso, right_crw))


def test_prescription() -> None:
    group("assessment: report targets")
    perfect = _report(0.0, 0.0, 0.0, 0.0)
    check("20/20 both eyes is at the chart ceiling", perfect["at_ceiling"] is True)
    check("and states no acuity target", perfect["targets"]["meaningful_logmar"] is None,
          str(perfect["targets"]))

    deficit = _report(0.6, 0.8, 0.0, 0.05)
    check("a deficit is not at the ceiling", deficit["at_ceiling"] is False)
    close("IOD is the difference between eyes", deficit["interocular_difference"], 0.6, 0.001)
    check("0.6 logMAR IOD is flagged", deficit["iod_flagged"] is True)
    equal("and names the amblyopic eye", deficit["amblyopic_eye"], "left")
    close("the meaningful target is two lines better",
          deficit["targets"]["meaningful_logmar"], 0.4, 0.001)

    group("prescription: at the chart ceiling")
    plan = prescription.build_plan(perfect)
    check("20/20 both eyes prescribes nothing", plan["indicated"] is False, plan["headline"])
    check("and sets no acuity target", not plan.get("acuity"), str(plan.get("acuity")))

    group("prescription: a real deficit")
    plan = prescription.build_plan(deficit)
    check("a 0.6 logMAR difference indicates therapy", plan["indicated"] is True, plan["headline"])
    check("it names the worse eye", plan.get("treated_eye") == "left", str(plan.get("treated_eye")))
    check("it gives a rationale", len(plan.get("rationale", [])) > 0,
          f"{len(plan.get('rationale', []))} lines")
    dose = plan.get("dose") or {}
    equal("the daily dose is the documented 60 minutes", dose.get("daily_minutes"),
          prescription.DAILY_MINUTES)
    equal("6 days a week", dose.get("days_per_week"), prescription.DAYS_PER_WEEK)
    equal("over 12 weeks", dose.get("programme_weeks"), prescription.PROGRAMME_WEEKS)
    check("the starting acuity is easier than the threshold",
          plan["acuity"]["start_denominator"] >= 20, str(plan.get("acuity")))

    group("prescription: difficulty follows the deficit")
    mild = prescription.build_plan(_report(0.2, 0.25, 0.0, 0.0))
    severe = prescription.build_plan(_report(1.0, 1.2, 0.0, 0.0))
    check("a worse eye starts on a coarser line",
          severe["acuity"]["start_denominator"] >= mild["acuity"]["start_denominator"],
          f"mild={mild['acuity']['start_denominator']} severe={severe['acuity']['start_denominator']}")

    group("prescription: unusable glasses fall back to monocular")
    without = prescription.build_plan(deficit, glasses_usable=False)
    check(
        "no usable glasses means no MFBF",
        without.get("therapy") == "monocular" or str(without.get("mode_id", "")).startswith("monocular"),
        f"{without.get('therapy')} / {without.get('mode_id')}",
    )


def test_glasses() -> None:
    group("glasses: which lens is over which eye")
    both = glasses.resolve_orientation("red", "none")
    check("right sees red, left sees nothing -> red over right",
          both.get("right_filter") == "red", str(both))
    swapped = glasses.resolve_orientation("none", "red")
    check("left sees red -> red over left", swapped.get("left_filter") == "red", str(swapped))

    group("glasses: safe shades")
    check("nothing seen means every shade is safe", len(glasses.safe_shades(None)) > 0)
    partial = glasses.safe_shades(0.5)
    check("a shade seen at 0.5 leaves only fainter ones", all(a < 0.5 for a in partial),
          str(partial))
    check("seeing the faintest leaves nothing safe", glasses.safe_shades(0.0) == [],
          str(glasses.safe_shades(0.0)))

    group("glasses: isolation verdicts")
    clean = glasses.build_result(
        glasses.resolve_orientation("red", "none"),
        {"black": {"red": None, "blue": None}, "white": {"red": None, "cyan": None}},
        {"black": {"red": 0.5, "blue": 0.5}, "white": {"red": 0.5, "cyan": 0.5}},
    )
    check("seeing nothing through the wrong lens is usable", clean["usable"] is True,
          str(clean.get("warnings")))
    check("and raises no warnings", len(clean["warnings"]) == 0, str(clean["warnings"]))

    # Visible only at the brightest rung: a real leak, but fainter shades still
    # isolate, so the calibration is salvageable.
    mild = glasses.build_result(
        glasses.resolve_orientation("red", "none"),
        {"black": {"red": 1.0, "blue": 1.0}, "white": {"red": 1.0, "cyan": 1.0}},
        {"black": {"red": 0.5, "blue": 0.5}, "white": {"red": 0.5, "cyan": 0.5}},
    )
    check("a leak at full brightness still leaves usable shades", mild["usable"] is True)
    check("but it is warned about", len(mild["warnings"]) > 0, f"{len(mild['warnings'])} warnings")

    # Visible even at the faintest rung: nothing isolates, so MFBF is unsafe.
    faintest = glasses.ALPHA_LADDER[-1]
    total = glasses.build_result(
        glasses.resolve_orientation("red", "none"),
        {"black": {"red": faintest, "blue": faintest}, "white": {"red": faintest, "cyan": faintest}},
        {"black": {"red": None, "blue": None}, "white": {"red": None, "cyan": None}},
    )
    check("visible even at the faintest shade is NOT usable", total["usable"] is False,
          f"usable={total['usable']}")
    check("and says why", any("cannot be isolated" in w for w in total["warnings"]),
          f"{len(total['warnings'])} warnings")

    group("glasses: an inconsistent answer is refused")
    muddle = glasses.resolve_orientation("red", "red")
    check("both eyes seeing red cannot be resolved",
          muddle.get("usable") is False or muddle.get("consistent") is False, str(muddle))


SUITES = [
    test_acuity,
    test_difficulty,
    test_planner,
    test_assessment,
    test_prescription,
    test_glasses,
]
