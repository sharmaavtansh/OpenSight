"""Patient records."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..models import PatientIn
from .settings import settings_key

router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("")
def list_patients(conn: sqlite3.Connection = Depends(get_db)) -> dict:
    rows = conn.execute("SELECT * FROM patients ORDER BY created_at").fetchall()
    return {"patients": [dict(r) for r in rows]}


@router.post("", status_code=201)
def create_patient(payload: PatientIn, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    cur = conn.execute(
        "INSERT INTO patients (name, dob, treated_eye, notes) VALUES (?,?,?,?)",
        (payload.name, payload.dob, payload.treated_eye, payload.notes),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


@router.put("/{patient_id}")
def update_patient(
    patient_id: int, payload: PatientIn, conn: sqlite3.Connection = Depends(get_db)
) -> dict:
    cur = conn.execute(
        "UPDATE patients SET name = ?, dob = ?, treated_eye = ?, notes = ? WHERE id = ?",
        (payload.name, payload.dob, payload.treated_eye, payload.notes, patient_id),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="unknown patient")
    conn.commit()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    return dict(row)


@router.delete("/{patient_id}", status_code=204)
def delete_patient(patient_id: int, conn: sqlite3.Connection = Depends(get_db)) -> None:
    conn.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
    # Their calibration goes with them. Leaving it behind would hand the row to
    # whoever next got the same autoincrement id.
    conn.execute("DELETE FROM settings WHERE key = ?", (settings_key(patient_id),))
    conn.commit()
