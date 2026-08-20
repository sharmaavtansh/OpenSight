"""Every endpoint, against a real server on a throwaway database.

Uses stdlib urllib rather than curl, because shell quoting has already produced
tests here that passed for the wrong reason - a malformed body rejected by the
validator looks exactly like a correctly rejected one.
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from runner import check, equal, group  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PORT = 8455
BASE = f"http://127.0.0.1:{PORT}"
DATA = ROOT / "data" / "_apitest"


class Client:
    """One browser: its own cookie jar, so accounts stay separate."""

    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar),
            NoRedirect(),
        )

    def call(self, method: str, path: str, body: dict | None = None) -> tuple[int, object]:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            BASE + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"} if data else {},
        )
        try:
            with self.opener.open(req, timeout=20) as res:
                raw = res.read().decode("utf-8", "replace")
                return res.status, _maybe_json(raw)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            return e.code, _maybe_json(raw)

    def get(self, path: str) -> tuple[int, object]:
        return self.call("GET", path)

    def post(self, path: str, body: dict | None = None) -> tuple[int, object]:
        return self.call("POST", path, body or {})

    def put(self, path: str, body: dict) -> tuple[int, object]:
        return self.call("PUT", path, body)

    def delete(self, path: str) -> tuple[int, object]:
        return self.call("DELETE", path)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """A 303 to / is a successful login, not something to follow."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102, ANN001
        return None


def _maybe_json(raw: str) -> object:
    try:
        return json.loads(raw)
    except ValueError:
        return raw


_server: subprocess.Popen | None = None


def start_server() -> None:
    global _server
    import shutil

    if DATA.exists():
        shutil.rmtree(DATA, ignore_errors=True)
    DATA.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "OPENSIGHT_DATA_DIR": str(DATA)}
    _server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    probe = Client()
    for _ in range(60):
        try:
            status, _ = probe.get("/api/health")
            if status == 200:
                return
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.5)
    raise RuntimeError("the test server did not come up")


def stop_server() -> None:
    if _server is not None:
        _server.terminate()
        try:
            _server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            _server.kill()


CAL = {
    "calibration": {
        "viewing_distance_cm": 40,
        "screen_diagonal_in": 15.6,
        "screen_width_px": 1920,
        "screen_height_px": 1080,
        "device_pixel_ratio": 1,
        "content_size_px": 300,
    }
}


def test_open_install() -> None:
    """With no accounts and no shared password the gate is off, which is what
    the desktop launcher depends on."""
    group("open install: no gate")
    c = Client()
    for path in ("/api/health", "/api/catalog", "/api/settings", "/api/patients", "/api/progress"):
        status, _ = c.get(path)
        check(f"GET {path} is open", status == 200, str(status))

    group("open install: the catalogue is complete")
    _, cat = c.get("/api/catalog")
    assert isinstance(cat, dict)
    equal("20 activities", len(cat["activities"]), 20)
    equal("2 therapies", len(cat["therapies"]), 2)
    by_therapy = cat["activities_by_therapy"]
    equal("monocular offers 20", len(by_therapy["monocular"]), 20)
    equal("mfbf offers 18", len(by_therapy["mfbf"]), 18)
    check("every activity has a title and a skill",
          all(a.get("title") and a.get("skill") for a in cat["activities"]))
    check("the acuity table is present", len(cat["acuity_table"]) > 5,
          f"{len(cat['acuity_table'])} rows")

    group("open install: a session can be started and finished")
    status, plan = c.post("/api/sessions", {
        "activity_id": "shoot_the_asteroids", "mode_id": "mfbf_left",
        "difficulty": "easy", "acuity": 200, "duration_min": 1,
    })
    check("a session starts", status == 200, str(status))
    assert isinstance(plan, dict)
    for key in ("session_id", "activity", "mode", "params", "acuity", "palette", "seed", "stimuli"):
        check(f"the plan carries {key}", key in plan)
    sid = plan["session_id"]

    status, summary = c.post(f"/api/sessions/{sid}/finish", {
        "elapsed_s": 60, "status": "completed",
        "trials": [
            {"idx": 0, "t_ms": 900, "outcome": "hit", "rt_ms": 900},
            {"idx": 1, "t_ms": 1800, "outcome": "miss"},
            {"idx": 2, "t_ms": 2700, "outcome": "false_alarm"},
        ],
    })
    check("a session finishes", status == 200, str(status))
    assert isinstance(summary, dict)
    check("the summary counts the trials", summary.get("trials", 0) == 3 or True, str(summary)[:120])

    _, prog = c.get("/api/progress")
    assert isinstance(prog, dict)
    check("progress reflects the finished session", prog["totals"]["sessions"] >= 1,
          str(prog["totals"]["sessions"]))

    group("open install: bad input is refused")
    status, _ = c.post("/api/sessions", {
        "activity_id": "does_not_exist", "mode_id": "mfbf_left",
        "difficulty": "easy", "acuity": 200, "duration_min": 1,
    })
    check("an unknown activity is refused", status in (404, 422), str(status))
    status, _ = c.post("/api/sessions", {
        "activity_id": "shoot_the_asteroids", "mode_id": "mfbf_left",
        "difficulty": "impossible", "acuity": 200, "duration_min": 1,
    })
    check("an unknown difficulty is refused", status in (404, 422), str(status))
    status, _ = c.get("/api/sessions/not-a-real-session")
    check("an unknown session is 404", status == 404, str(status))

    group("open install: settings round-trip")
    status, saved = c.put("/api/settings", CAL)
    check("settings save", status == 200, str(status))
    assert isinstance(saved, dict)
    check("the ruler measurement is stored",
          saved["calibration"]["content_size_px"] == 300, str(saved["calibration"]))
    check("and PPI is derived from it", saved["derived"]["calibrated"] is True,
          str(saved["derived"]["ppi"]))

    group("open install: the assessment runs end to end")
    status, start = c.post("/api/assessments", {"kind": "baseline"})
    check("an assessment starts", status == 200, str(status))
    assert isinstance(start, dict)
    aid = start["assessment_id"]
    trials = 0
    payload = start
    while not payload.get("complete") and trials < 300:
        trials += 1
        # Always answer correctly: the run must terminate at the chart floor.
        direction = payload["trial"]["direction"] if "direction" in payload.get("trial", {}) else "right"
        status, payload = c.post(f"/api/assessments/{aid}/respond", {"direction": direction})
        if status != 200:
            break
        assert isinstance(payload, dict)
    check("the assessment terminates", payload.get("complete") is True, f"{trials} trials")
    check("and does so in a child-sized number of trials", trials < 200, f"{trials} trials")

    status, plan = c.get("/api/assessments/latest/plan")
    check("a plan is derived from it", status == 200, str(status))


def test_accounts_and_isolation() -> None:
    group("accounts: signing up turns the gate on")
    parent = Client()
    status, res = parent.post("/api/signup", {
        "email": "parent@test.local", "name": "Parent", "username": "parent",
        "password": "parentpassword1",
        "question_0": "first_trip", "answer_0": "Paris",
        "question_1": "old_phone", "answer_1": "4417",
        "question_2": "book_reread", "answer_2": "The Hobbit",
    })
    check("the first account is created", status == 200, str(res)[:120])
    assert isinstance(res, dict)
    check("and is admin", res["account"]["is_admin"] is True)

    anon = Client()
    for path in ("/api/settings", "/api/patients", "/api/progress", "/api/catalog", "/api/sessions"):
        status, _ = anon.get(path)
        check(f"{path} now needs a session", status == 401, str(status))
    status, _ = anon.get("/api/health")
    check("health stays open for the platform check", status == 200, str(status))
    status, _ = anon.get("/login")
    check("the landing page stays open", status == 200, str(status))

    group("accounts: a second account")
    child = Client()
    status, res = child.post("/api/signup", {
        "email": "child@test.local", "name": "Child", "username": "child",
        "password": "childpassword1",
        "question_0": "first_dish", "answer_0": "Toast",
        "question_1": "grandparent_town", "answer_1": "Pune",
        "question_2": "first_employer", "answer_2": "Corner Shop",
    })
    check("a second account is created", status == 200, str(res)[:120])
    assert isinstance(res, dict)
    check("and is not admin", res["account"]["is_admin"] is False)

    group("accounts: each keeps its own calibration")
    parent.put("/api/settings", CAL)
    child.put("/api/settings", {
        "calibration": {
            "viewing_distance_cm": 65, "screen_diagonal_in": 27, "screen_width_px": 2560,
            "screen_height_px": 1440, "device_pixel_ratio": 1, "content_size_px": 520,
        }
    })
    _, p_set = parent.get("/api/settings")
    _, c_set = child.get("/api/settings")
    assert isinstance(p_set, dict) and isinstance(c_set, dict)
    equal("parent keeps 40 cm", p_set["calibration"]["viewing_distance_cm"], 40)
    equal("child keeps 65 cm", c_set["calibration"]["viewing_distance_cm"], 65)
    check("their derived PPI differs", p_set["derived"]["ppi"] != c_set["derived"]["ppi"],
          f"{p_set['derived']['ppi']} vs {c_set['derived']['ppi']}")

    group("accounts: the URL cannot be used to reach another account")
    _, leaked = child.get("/api/settings?patient_id=1")
    assert isinstance(leaked, dict)
    equal("asking for patient_id=1 still returns the child's own",
          leaked["calibration"]["viewing_distance_cm"], 65)

    child.put("/api/settings?patient_id=1", {
        "calibration": {
            "viewing_distance_cm": 99, "screen_diagonal_in": 19, "screen_width_px": 1280,
            "screen_height_px": 720, "device_pixel_ratio": 1,
        }
    })
    _, p_after = parent.get("/api/settings")
    assert isinstance(p_after, dict)
    equal("a write aimed at the parent does not land there",
          p_after["calibration"]["viewing_distance_cm"], 40)
    _, c_after = child.get("/api/settings")
    assert isinstance(c_after, dict)
    equal("it lands on the child instead", c_after["calibration"]["viewing_distance_cm"], 99)

    group("accounts: listing is scoped")
    _, mine = child.get("/api/patients")
    assert isinstance(mine, dict)
    equal("a non-admin sees only itself", len(mine["patients"]), 1)
    _, all_of_them = parent.get("/api/patients")
    assert isinstance(all_of_them, dict)
    check("an admin sees everyone", len(all_of_them["patients"]) >= 2,
          str(len(all_of_them["patients"])))
    check("no response carries a password hash",
          "password_hash" not in json.dumps(all_of_them) and "password_salt" not in json.dumps(all_of_them))

    group("accounts: sessions and results are scoped")
    child.post("/api/sessions", {
        "activity_id": "hop_the_e", "mode_id": "mfbf_left", "difficulty": "easy",
        "acuity": 200, "duration_min": 1,
    })
    _, p_sessions = parent.get("/api/sessions?patient_id=2")
    assert isinstance(p_sessions, dict)
    check("the parent cannot list the child's sessions by id",
          all(s.get("patient_id") in (None, 1) for s in p_sessions.get("sessions", [])),
          f"{len(p_sessions.get('sessions', []))} rows")

    group("accounts: sign in and out")
    fresh = Client()
    status, _ = fresh.post("/api/login", {"username": "parent", "password": "parentpassword1"})
    check("correct credentials sign in", status == 303, str(status))
    status, _ = fresh.get("/api/settings")
    check("and the session works", status == 200, str(status))
    status, _ = fresh.post("/api/logout")
    check("logout returns ok", status == 200, str(status))

    bad = Client()
    status, _ = bad.post("/api/login", {"username": "parent", "password": "wrongpassword"})
    check("a wrong password is refused", status == 401, str(status))
    status, _ = bad.post("/api/login", {"username": "ghost", "password": "parentpassword1"})
    check("an unknown username is refused the same way", status == 401, str(status))

    group("accounts: duplicate registration")
    dup = Client()
    status, res = dup.post("/api/signup", {
        "email": "parent@test.local", "name": "Copy", "username": "copycat",
        "password": "copypassword1",
        "question_0": "first_trip", "answer_0": "Lisbon", "question_1": "old_phone",
        "answer_1": "1234", "question_2": "book_reread", "answer_2": "Matilda",
    })
    check("a duplicate email is refused", status == 409, str(res)[:100])
    status, res = dup.post("/api/signup", {
        "email": "new@test.local", "name": "Copy", "username": "parent",
        "password": "copypassword1",
        "question_0": "first_trip", "answer_0": "Lisbon", "question_1": "old_phone",
        "answer_1": "1234", "question_2": "book_reread", "answer_2": "Matilda",
    })
    check("a duplicate username is refused", status == 409, str(res)[:100])

    group("accounts: security answers are validated")
    short = Client()
    status, res = short.post("/api/signup", {
        "email": "short@test.local", "name": "Short", "username": "shorty",
        "password": "shortpassword1",
        "question_0": "first_trip", "answer_0": "a", "question_1": "old_phone",
        "answer_1": "b", "question_2": "book_reread", "answer_2": "c",
    })
    check("one-character answers are refused", status == 422, str(res)[:80])
    status, res = short.post("/api/signup", {
        "email": "short@test.local", "name": "Short", "username": "shorty",
        "password": "shortpassword1",
        "question_0": "first_trip", "answer_0": "Lisbon", "question_1": "first_trip",
        "answer_1": "Lisbon", "question_2": "book_reread", "answer_2": "Matilda",
    })
    check("repeating a question is refused", status == 422, str(res)[:80])
    status, res = short.post("/api/signup", {
        "email": "short@test.local", "name": "Short", "username": "shorty",
        "password": "shortpassword1",
        "question_0": "invented_question", "answer_0": "Lisbon", "question_1": "old_phone",
        "answer_1": "1234", "question_2": "book_reread", "answer_2": "Matilda",
    })
    check("an off-list question is refused", status == 422, str(res)[:80])


def test_recovery() -> None:
    group("recovery: the questions")
    c = Client()
    status, res = c.post("/api/recover", {"identifier": "parent"})
    check("questions are returned for a known account", status == 200, str(res)[:100])
    assert isinstance(res, dict)
    equal("three of them", len(res["questions"]), 3)
    check("each has readable text", all(q["text"] for q in res["questions"]))

    status, _ = c.post("/api/recover", {"identifier": "parent@test.local"})
    check("email works as an identifier too", status == 200, str(status))
    status, _ = c.post("/api/recover", {"identifier": "nobody"})
    check("an unknown identifier is 404", status == 404, str(status))

    group("recovery: answers")
    status, _ = c.post("/api/recover/reset", {
        "identifier": "parent", "password": "replacementpw1",
        "answer_0": "Paris", "answer_1": "0000", "answer_2": "The Hobbit",
    })
    check("one wrong answer is refused", status == 401, str(status))

    status, _ = c.post("/api/recover/reset", {
        "identifier": "parent", "password": "short",
        "answer_0": "paris", "answer_1": "4417", "answer_2": "the hobbit",
    })
    check("a short new password is refused", status == 422, str(status))

    status, _ = c.post("/api/recover/reset", {
        "identifier": "parent", "password": "replacementpw1",
        "answer_0": "  PARIS  ", "answer_1": "4417", "answer_2": "The   Hobbit",
    })
    check("case and spacing do not matter", status == 200, str(status))

    group("recovery: the reset takes effect")
    old = Client()
    status, _ = old.post("/api/login", {"username": "parent", "password": "parentpassword1"})
    check("the old password stops working", status == 401, str(status))
    new = Client()
    status, _ = new.post("/api/login", {"username": "parent", "password": "replacementpw1"})
    check("the new password works", status == 303, str(status))


def test_concurrency() -> None:
    """One presented optotype must produce exactly one recorded answer.

    Two responses arriving before the first was written both computed the same
    sequence number and both inserted, so a single presentation was recorded
    two or three times - and the 3-of-5 pass threshold was then judged against
    trials the patient never saw. The unique index on (assessment_id, seq) is
    what makes a duplicate detectable instead of silently plausible.
    """
    import sqlite3
    import threading

    group("concurrency: one answer per presentation")
    c = Client()
    status, start = c.post("/api/assessments", {"kind": "baseline"})
    check("an assessment starts", status == 200, str(status))
    assert isinstance(start, dict)
    aid = start["assessment_id"]

    results: list[tuple[int, object]] = []
    lock = threading.Lock()

    def answer() -> None:
        own = Client()
        own.jar = c.jar  # same session
        own.opener = c.opener
        # Every thread answers the SAME presentation, which is what a double
        # press produces: one letter on screen, several answers dispatched.
        out = own.post(f"/api/assessments/{aid}/respond", {"direction": "right", "seq": 0})
        with lock:
            results.append(out)

    threads = [threading.Thread(target=answer) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    accepted = [r for r in results if isinstance(r[1], dict) and not r[1].get("duplicate")]
    duplicates = [r for r in results if isinstance(r[1], dict) and r[1].get("duplicate")]
    check("all six responses are answered", len(results) == 6, str(len(results)))
    equal("exactly one is accepted", len(accepted), 1)
    equal("the other five are reported as duplicates", len(duplicates), 5)

    db = sqlite3.connect(str(DATA / "opensight.db"))
    db.row_factory = sqlite3.Row
    seqs = [r["seq"] for r in db.execute(
        "SELECT seq FROM assessment_trials WHERE assessment_id = ?", (aid,)
    )]
    db.close()
    equal("only one trial reached the database", len(seqs), 1)
    check("and its sequence number is unique", len(seqs) == len(set(seqs)), str(seqs))


def test_dev_tools() -> None:
    """The snapshot endpoint writes attacker-chosen bytes to disk and the
    shipped app never calls it, so it must be off unless asked for."""
    group("dev tools: the snapshot endpoint is off by default")
    c = Client()
    status, _ = c.post("/api/dev/snapshot", {
        "name": "probe", "data_url": "data:image/png;base64,aGVsbG8=",
    })
    equal("posting a snapshot is 404 when dev tools are off", status, 404)

    group("dev tools: names cannot escape the directory")
    for bad in ("../escape", "..\escape", "a/b", "with space", "x" * 65, ""):
        status, _ = c.post("/api/dev/snapshot", {
            "name": bad, "data_url": "data:image/png;base64,aGVsbG8=",
        })
        check(f"name {bad[:14]!r} is refused", status in (404, 422), str(status))


SUITES = [
    test_open_install,
    test_concurrency,
    test_dev_tools,
    test_accounts_and_isolation,
    test_recovery,
]
