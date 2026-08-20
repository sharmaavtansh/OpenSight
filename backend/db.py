"""SQLite persistence.

Plain stdlib sqlite3 - the data volume for a home-therapy install is tiny and
an ORM would only add a dependency. Connections are per-request and closed by
the FastAPI dependency, with WAL enabled so a long-running session write never
blocks the UI reading progress.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS patients (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    dob          TEXT,
    treated_eye  TEXT,
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS security_answers (
    patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    question_id TEXT    NOT NULL,
    answer_hash TEXT    NOT NULL,
    salt        TEXT    NOT NULL,
    PRIMARY KEY (patient_id, idx)
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT    PRIMARY KEY,
    patient_id    INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    activity_id   TEXT    NOT NULL,
    mode_id       TEXT    NOT NULL,
    eye           TEXT    NOT NULL,
    anaglyph      INTEGER NOT NULL,
    difficulty    TEXT    NOT NULL,
    acuity        INTEGER NOT NULL,
    duration_min  REAL    NOT NULL,
    seed          INTEGER NOT NULL,
    params_json   TEXT    NOT NULL,
    started_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    ended_at      TEXT,
    status        TEXT    NOT NULL DEFAULT 'running',
    score         INTEGER NOT NULL DEFAULT 0,
    hits          INTEGER NOT NULL DEFAULT 0,
    misses        INTEGER NOT NULL DEFAULT 0,
    false_alarms  INTEGER NOT NULL DEFAULT 0,
    mean_rt_ms    REAL,
    elapsed_s     REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trials (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    t_ms        REAL    NOT NULL,
    outcome     TEXT    NOT NULL,
    rt_ms       REAL,
    target      TEXT,
    response    TEXT,
    x           REAL,
    y           REAL
);

CREATE TABLE IF NOT EXISTS assessments (
    id            TEXT    PRIMARY KEY,
    patient_id    INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    kind          TEXT    NOT NULL DEFAULT 'baseline',
    seed          INTEGER NOT NULL,
    acuity_json   TEXT    NOT NULL,
    started_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    ended_at      TEXT,
    status        TEXT    NOT NULL DEFAULT 'running',
    report_json   TEXT
);

CREATE TABLE IF NOT EXISTS assessment_trials (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id TEXT    NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL,
    eye           TEXT    NOT NULL,
    condition     TEXT    NOT NULL,
    denominator   INTEGER NOT NULL,
    target        TEXT    NOT NULL,
    response      TEXT,
    correct       INTEGER NOT NULL DEFAULT 0,
    phase         TEXT    NOT NULL DEFAULT 'threshold',
    rt_ms         REAL
);

CREATE INDEX IF NOT EXISTS idx_atrials ON assessment_trials(assessment_id, seq);
CREATE INDEX IF NOT EXISTS idx_assessments_patient ON assessments(patient_id, started_at);
CREATE INDEX IF NOT EXISTS idx_trials_session ON trials(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(activity_id, started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id, started_at);
"""


def connect() -> sqlite3.Connection:
    # check_same_thread=False is required because FastAPI runs a sync dependency
    # and the sync endpoint that consumes it on different threadpool workers, so
    # the connection is opened on one thread and used on another. It stays safe
    # here because every request gets its own connection and closes it again -
    # no connection is ever shared between requests or used concurrently.
    conn = sqlite3.connect(DB_PATH, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# Columns added after a table first shipped. CREATE TABLE IF NOT EXISTS will
# not alter an existing table, so they are applied explicitly.
MIGRATIONS: list[tuple[str, str, str]] = [
    ("assessment_trials", "phase", "TEXT NOT NULL DEFAULT 'threshold'"),
    # Credentials live on the person they belong to. Nullable throughout: a
    # patient record created before accounts existed, or one a parent manages
    # without a separate login, simply has none.
    ("patients", "username", "TEXT"),
    ("patients", "password_hash", "TEXT"),
    ("patients", "password_salt", "TEXT"),
    ("patients", "is_admin", "INTEGER NOT NULL DEFAULT 0"),
    ("patients", "email", "TEXT"),
    # Bumped on a password reset, and carried in the session cookie: recovering
    # an account has to evict whoever was already signed in to it.
    ("patients", "session_version", "INTEGER NOT NULL DEFAULT 1"),
]

# SQLite cannot add a UNIQUE column by ALTER, so the constraint is an index.
INDICES: list[str] = [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_username "
    "ON patients(username) WHERE username IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_email "
    "ON patients(email) WHERE email IS NOT NULL",
    # Signup no longer sends a code. Anything still sitting in this table is a
    # half-finished signup from the previous scheme and means nothing now.
    "DROP TABLE IF EXISTS signup_codes",
]


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        for table, column, ddl in MIGRATIONS:
            existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
        for statement in INDICES:
            conn.execute(statement)


@contextmanager
def cursor() -> Iterator[sqlite3.Cursor]:
    conn = connect()
    try:
        yield conn.cursor()
        conn.commit()
    finally:
        conn.close()


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# --- settings key/value helpers -------------------------------------------

def read_setting(conn: sqlite3.Connection, key: str, default: Any = None) -> Any:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if row is None:
        return default
    return json.loads(row["value"])


def write_setting(conn: sqlite3.Connection, key: str, value: Any) -> None:
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, json.dumps(value)),
    )
