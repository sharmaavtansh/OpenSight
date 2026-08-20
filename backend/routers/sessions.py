"""Session lifecycle: plan -> run -> ingest trials -> aggregate."""

from __future__ import annotations

import json
import secrets
import sqlite3
import uuid

from fastapi import APIRouter, Depends, HTTPException

from ..acuity import ACUITY_LEVELS, DisplayCalibration
from ..catalog import get_activity, get_mode
from ..db import get_db
from ..models import SessionFinish, SessionStart
from ..planner import build_plan
from .settings import load_settings

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

POINTS_PER_HIT = 10
PENALTY_PER_FALSE_ALARM = 3


@router.post("")
def start_session(payload: SessionStart, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    try:
        get_activity(payload.activity_id)
        mode = get_mode(payload.mode_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if payload.acuity not in ACUITY_LEVELS:
        raise HTTPException(status_code=422, detail=f"unsupported acuity 20/{payload.acuity}")

    settings = load_settings(conn)
    calibration = dict(settings["calibration"])
    if payload.device_pixel_ratio:
        # The browser knows its own DPR better than the stored calibration does.
        calibration["device_pixel_ratio"] = payload.device_pixel_ratio

    session_id = uuid.uuid4().hex
    seed = payload.seed if payload.seed is not None else secrets.randbelow(2**31)

    plan = build_plan(
        session_id=session_id,
        activity_id=payload.activity_id,
        mode_id=payload.mode_id,
        difficulty=payload.difficulty,
        acuity=payload.acuity,
        duration_min=payload.duration_min,
        calibration=DisplayCalibration(**calibration),
        anaglyph=settings["anaglyph"],
        seed=seed,
    )

    conn.execute(
        """INSERT INTO sessions
           (id, patient_id, activity_id, mode_id, eye, anaglyph, difficulty,
            acuity, duration_min, seed, params_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            session_id,
            payload.patient_id,
            payload.activity_id,
            payload.mode_id,
            mode["eye"],
            1 if mode["anaglyph"] else 0,
            payload.difficulty,
            payload.acuity,
            payload.duration_min,
            seed,
            json.dumps(plan["params"]),
        ),
    )
    conn.commit()
    return plan


@router.post("/{session_id}/finish")
def finish_session(
    session_id: str, payload: SessionFinish, conn: sqlite3.Connection = Depends(get_db)
) -> dict:
    row = conn.execute("SELECT id, status FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="unknown session")
    if row["status"] != "running":
        raise HTTPException(status_code=409, detail="session already closed")

    conn.executemany(
        """INSERT INTO trials (session_id, idx, t_ms, outcome, rt_ms, target, response, x, y)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        [
            (
                session_id,
                t.idx,
                t.t_ms,
                t.outcome,
                t.rt_ms,
                t.target,
                t.response,
                t.x,
                t.y,
            )
            for t in payload.trials
        ],
    )

    hits = sum(1 for t in payload.trials if t.outcome == "hit")
    misses = sum(1 for t in payload.trials if t.outcome in ("miss", "timeout"))
    false_alarms = sum(1 for t in payload.trials if t.outcome == "false_alarm")
    rts = [t.rt_ms for t in payload.trials if t.outcome == "hit" and t.rt_ms is not None]
    mean_rt = sum(rts) / len(rts) if rts else None
    score = max(0, hits * POINTS_PER_HIT - false_alarms * PENALTY_PER_FALSE_ALARM)

    conn.execute(
        """UPDATE sessions
              SET ended_at = datetime('now'), status = ?, score = ?, hits = ?,
                  misses = ?, false_alarms = ?, mean_rt_ms = ?, elapsed_s = ?
            WHERE id = ?""",
        (payload.status, score, hits, misses, false_alarms, mean_rt, payload.elapsed_s, session_id),
    )
    conn.commit()
    return summarise(session_id, conn)


def summarise(session_id: str, conn: sqlite3.Connection) -> dict:
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="unknown session")
    record = dict(row)
    record["params"] = json.loads(record.pop("params_json"))
    attempts = record["hits"] + record["misses"] + record["false_alarms"]
    record["accuracy"] = round(record["hits"] / attempts, 4) if attempts else None
    minutes = (record["elapsed_s"] or 0) / 60.0
    record["targets_per_min"] = round(record["hits"] / minutes, 2) if minutes > 0 else None
    return record


@router.get("/{session_id}")
def get_session(session_id: str, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    return summarise(session_id, conn)


@router.get("")
def list_sessions(
    limit: int = 50,
    activity_id: str | None = None,
    patient_id: int | None = None,
    conn: sqlite3.Connection = Depends(get_db),
) -> dict:
    clauses, args = ["status != 'running'"], []
    if activity_id:
        clauses.append("activity_id = ?")
        args.append(activity_id)
    if patient_id is not None:
        clauses.append("patient_id = ?")
        args.append(patient_id)
    args.append(max(1, min(limit, 500)))

    rows = conn.execute(
        f"SELECT * FROM sessions WHERE {' AND '.join(clauses)} "
        "ORDER BY started_at DESC LIMIT ?",
        args,
    ).fetchall()

    sessions = []
    for row in rows:
        record = dict(row)
        record["params"] = json.loads(record.pop("params_json"))
        attempts = record["hits"] + record["misses"] + record["false_alarms"]
        record["accuracy"] = round(record["hits"] / attempts, 4) if attempts else None
        sessions.append(record)
    return {"sessions": sessions}
