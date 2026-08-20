"""Progress reporting - trends across completed sessions."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..catalog import ACTIVITY_BY_ID
from ..db import get_db

router = APIRouter(prefix="/api", tags=["progress"])


@router.get("/progress")
def progress(patient_id: int | None = None, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    where, args = ["status = 'completed'"], []
    if patient_id is not None:
        where.append("patient_id = ?")
        args.append(patient_id)
    clause = " AND ".join(where)

    totals = conn.execute(
        f"""SELECT COUNT(*) AS sessions,
                   COALESCE(SUM(elapsed_s), 0) AS seconds,
                   COALESCE(SUM(hits), 0) AS hits,
                   COALESCE(SUM(misses), 0) AS misses,
                   COALESCE(SUM(false_alarms), 0) AS false_alarms,
                   AVG(mean_rt_ms) AS mean_rt_ms
              FROM sessions WHERE {clause}""",
        args,
    ).fetchone()

    by_activity = conn.execute(
        f"""SELECT activity_id,
                   COUNT(*) AS sessions,
                   COALESCE(SUM(elapsed_s), 0) AS seconds,
                   COALESCE(SUM(hits), 0) AS hits,
                   COALESCE(SUM(misses), 0) AS misses,
                   COALESCE(SUM(false_alarms), 0) AS false_alarms,
                   AVG(mean_rt_ms) AS mean_rt_ms,
                   MAX(score) AS best_score,
                   MAX(started_at) AS last_played
              FROM sessions WHERE {clause}
             GROUP BY activity_id
             ORDER BY last_played DESC""",
        args,
    ).fetchall()

    by_day = conn.execute(
        f"""SELECT date(started_at) AS day,
                   COUNT(*) AS sessions,
                   COALESCE(SUM(elapsed_s), 0) AS seconds,
                   COALESCE(SUM(hits), 0) AS hits,
                   COALESCE(SUM(misses), 0) AS misses,
                   COALESCE(SUM(false_alarms), 0) AS false_alarms
              FROM sessions WHERE {clause}
             GROUP BY day ORDER BY day DESC LIMIT 30""",
        args,
    ).fetchall()

    def with_accuracy(record: dict) -> dict:
        attempts = record["hits"] + record["misses"] + record["false_alarms"]
        record["accuracy"] = round(record["hits"] / attempts, 4) if attempts else None
        if record.get("mean_rt_ms") is not None:
            record["mean_rt_ms"] = round(record["mean_rt_ms"], 1)
        record["minutes"] = round(record["seconds"] / 60.0, 1)
        return record

    activities = []
    for row in by_activity:
        record = with_accuracy(dict(row))
        meta = ACTIVITY_BY_ID.get(record["activity_id"])
        record["name"] = meta["name"] if meta else record["activity_id"]
        record["category"] = meta["category"] if meta else None
        activities.append(record)

    return {
        "totals": with_accuracy(dict(totals)),
        "by_activity": activities,
        "by_day": [with_accuracy(dict(r)) for r in by_day],
    }
