"""Baseline and follow-up assessment endpoints.

The staircase lives in the database rather than in memory: every response is a
row, and the current state is recomputed from those rows. That keeps the API
stateless between requests and means a half-finished assessment survives a
reload or a crash.
"""

from __future__ import annotations

import json
import random
import secrets
import sqlite3
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..acuity import DisplayCalibration, describe
from ..assessment import (
    ACUITY_LEVELS,
    DIRECTIONS,
    OPTOTYPES_PER_LEVEL,
    ConditionRun,
    LevelResult,
    build_report,
    next_step,
    progress_against,
    snellen_to_logmar,
    summarise_eye,
)
from ..db import get_db
from ..glasses import PROFILES
from ..prescription import build_plan
from ..models import AssessmentResponse, AssessmentStart
from .settings import load_settings

router = APIRouter(prefix="/api/assessments", tags=["assessment"])

# Right eye first, by convention (OD then OS); isolated before crowded so the
# uncrowded threshold is measured while the patient is freshest.
RUN_ORDER: list[tuple[str, str]] = [
    ("right", "isolated"),
    ("right", "crowded"),
    ("left", "isolated"),
    ("left", "crowded"),
]


def _runs_from_trials(rows: list[sqlite3.Row]) -> dict[tuple[str, str], ConditionRun]:
    runs: dict[tuple[str, str], ConditionRun] = {
        key: ConditionRun(eye=key[0], condition=key[1]) for key in RUN_ORDER  # type: ignore[arg-type]
    }
    for row in rows:
        run = runs[(row["eye"], row["condition"])]
        phase = row["phase"] if "phase" in row.keys() else "threshold"
        last = run.levels[-1] if run.levels else None
        if last is None or last.denominator != row["denominator"] or last.phase != phase:
            run.levels.append(
                LevelResult(
                    row["denominator"], snellen_to_logmar(row["denominator"]), 0, 0, phase
                )
            )
        level = run.levels[-1]
        level.presented += 1
        level.correct += 1 if row["correct"] else 0
    return runs


def _current_step(
    runs: dict[tuple[str, str], ConditionRun]
) -> tuple[str, str, int, str] | None:
    """The next (eye, condition, level, phase) to present, or None when done."""
    for key in RUN_ORDER:
        step = next_step(runs[key])
        if step is not None:
            return key[0], key[1], step[0], step[1]
    return None


def _optotype_px(denominator: int, conn: sqlite3.Connection, dpr: float | None) -> dict[str, Any]:
    settings = load_settings(conn)
    calibration = dict(settings["calibration"])
    if dpr:
        calibration["device_pixel_ratio"] = dpr
    return describe(denominator, DisplayCalibration(**calibration))


def _progress(runs: dict[tuple[str, str], ConditionRun]) -> dict[str, Any]:
    done = sum(1 for key in RUN_ORDER if next_step(runs[key]) is None)
    return {"runs_complete": done, "runs_total": len(RUN_ORDER)}


def _next_payload(
    assessment_id: str, seed: int, rows: list[sqlite3.Row], conn: sqlite3.Connection,
    dpr: float | None,
) -> dict[str, Any]:
    runs = _runs_from_trials(rows)
    step = _current_step(runs)
    if step is None:
        return {"assessment_id": assessment_id, "complete": True, "progress": _progress(runs)}

    eye, condition, denominator, phase = step
    # Seeded per trial index so a reload re-presents the same orientation
    # rather than handing the patient a fresh guess.
    rng = random.Random(f"{seed}:{len(rows)}")
    acuity = _optotype_px(denominator, conn, dpr)
    return {
        "assessment_id": assessment_id,
        "complete": False,
        "trial": {
            "seq": len(rows),
            "eye": eye,
            "condition": condition,
            "denominator": denominator,
            "snellen": f"20/{denominator}",
            "phase": phase,
            "direction": rng.choice(DIRECTIONS),
            "optotype_px": acuity["height_css_px"],
            "stroke_px": acuity["stroke_css_px"],
            "renderable": acuity["renderable"],
            # Flankers sit one optotype width away - the standard crowding
            # separation.
            "flanker_gap_px": acuity["height_css_px"] if condition == "crowded" else 0,
        },
        "progress": _progress(runs),
    }


def _trials(assessment_id: str, conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM assessment_trials WHERE assessment_id = ? ORDER BY seq",
        (assessment_id,),
    ).fetchall()


@router.post("")
def start_assessment(payload: AssessmentStart, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    assessment_id = uuid.uuid4().hex
    seed = payload.seed if payload.seed is not None else secrets.randbelow(2**31)
    settings = load_settings(conn)
    conn.execute(
        "INSERT INTO assessments (id, patient_id, kind, seed, acuity_json) VALUES (?,?,?,?,?)",
        (assessment_id, payload.patient_id, payload.kind, seed, json.dumps(settings["calibration"])),
    )
    conn.commit()
    return _next_payload(assessment_id, seed, [], conn, payload.device_pixel_ratio)


@router.post("/{assessment_id}/respond")
def respond(
    assessment_id: str, payload: AssessmentResponse, conn: sqlite3.Connection = Depends(get_db)
) -> dict:
    row = conn.execute("SELECT * FROM assessments WHERE id = ?", (assessment_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="unknown assessment")
    if row["status"] != "running":
        raise HTTPException(status_code=409, detail="assessment already closed")

    rows = _trials(assessment_id, conn)
    runs = _runs_from_trials(rows)
    step = _current_step(runs)
    if step is None:
        raise HTTPException(status_code=409, detail="assessment already complete")

    eye, condition, denominator, phase = step
    rng = random.Random(f"{row['seed']}:{len(rows)}")
    target = rng.choice(DIRECTIONS)
    correct = 1 if payload.direction == target else 0

    conn.execute(
        """INSERT INTO assessment_trials
           (assessment_id, seq, eye, condition, denominator, target, response, correct,
            phase, rt_ms)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (assessment_id, len(rows), eye, condition, denominator, target,
         payload.direction, correct, phase, payload.rt_ms),
    )
    conn.commit()

    rows = _trials(assessment_id, conn)
    result = _next_payload(assessment_id, row["seed"], rows, conn, payload.device_pixel_ratio)
    result["last"] = {"target": target, "response": payload.direction, "correct": bool(correct)}

    if result["complete"]:
        runs = _runs_from_trials(rows)
        report = build_report(
            summarise_eye(runs[("left", "isolated")], runs[("left", "crowded")]),
            summarise_eye(runs[("right", "isolated")], runs[("right", "crowded")]),
        )
        conn.execute(
            "UPDATE assessments SET status='completed', ended_at=datetime('now'), report_json=? WHERE id=?",
            (json.dumps(report), assessment_id),
        )
        conn.commit()
        result["report"] = report
    return result


@router.get("")
def list_assessments(patient_id: int | None = None, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    clause, args = "status = 'completed'", []
    if patient_id is not None:
        clause += " AND patient_id = ?"
        args.append(patient_id)
    rows = conn.execute(
        f"SELECT * FROM assessments WHERE {clause} ORDER BY started_at", args
    ).fetchall()
    items = []
    for row in rows:
        record = dict(row)
        record["report"] = json.loads(record.pop("report_json") or "null")
        record.pop("acuity_json", None)
        items.append(record)

    baseline = items[0] if items else None
    latest = items[-1] if items else None
    comparison = None
    if baseline and latest and baseline["id"] != latest["id"]:
        comparison = progress_against(baseline["report"], latest["report"])
    return {"assessments": items, "baseline": baseline, "latest": latest, "progress": comparison}


@router.get("/{assessment_id}")
def get_assessment(assessment_id: str, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    row = conn.execute("SELECT * FROM assessments WHERE id = ?", (assessment_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="unknown assessment")
    record = dict(row)
    record["report"] = json.loads(record.pop("report_json") or "null")
    record["trials"] = [dict(t) for t in _trials(assessment_id, conn)]
    return record


def _glasses_usable(conn: sqlite3.Connection) -> bool:
    """Can the stored calibration actually separate the channels?

    A channel whose alpha is 1.0 has never been nulled, so MFBF cannot be
    trusted to isolate and monocular therapy is the honest recommendation.
    """
    anaglyph = load_settings(conn)["anaglyph"]
    for background, names in PROFILES.items():
        channels = (anaglyph.get(background) or {}).get("channels") or {}
        for name in names:
            alpha = (channels.get(name) or {}).get("alpha")
            if alpha is None or alpha >= 1.0:
                return False
    return True


@router.get("/latest/plan")
def latest_plan(patient_id: int | None = None, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    """The therapy plan implied by the most recent completed assessment."""
    clause, args = "status = 'completed'", []
    if patient_id is not None:
        clause += " AND patient_id = ?"
        args.append(patient_id)
    row = conn.execute(
        f"SELECT * FROM assessments WHERE {clause} ORDER BY started_at DESC LIMIT 1", args
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="no completed assessment yet")
    stored = json.loads(row["report_json"])
    # Per-eye thresholds are the measurement; everything above them is derived.
    # Recomputing means a rules change applies to past assessments too, instead
    # of leaving stale targets on record.
    report = build_report(stored["left"], stored["right"])
    plan = build_plan(report, glasses_usable=_glasses_usable(conn))
    return {"assessment_id": row["id"], "measured_at": row["ended_at"], "report": report, "plan": plan}


@router.get("/meta/protocol")
def protocol() -> dict:
    """What the test does and why, for the UI to show before it starts."""
    return {
        "method": "Tumbling E, 4-alternative forced choice",
        "levels": [f"20/{d}" for d in ACUITY_LEVELS],
        "optotypes_per_level": OPTOTYPES_PER_LEVEL,
        "logmar_per_optotype": 0.02,
        "pass_threshold": f"3 of {OPTOTYPES_PER_LEVEL}",
        "conditions": ["isolated", "crowded"],
        "eyes": ["right", "left"],
        "runs": [f"{eye} / {condition}" for eye, condition in RUN_ORDER],
    }
