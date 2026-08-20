"""Malformed and boundary input against every endpoint.

The bar is simple: a 500 is always a bug. Refusing bad input with a 4xx is
correct behaviour; crashing on it means an unhandled path, and an unhandled
path in the session or assessment routes is one that can lose a measurement.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from runner import check, group  # noqa: E402
from test_api import Client  # noqa: E402

# (method, path, body) - bodies chosen to be wrong in a different way each time.
CASES: list[tuple[str, str, object]] = [
    ("POST", "/api/sessions", {}),
    ("POST", "/api/sessions", {"activity_id": None, "mode_id": None}),
    ("POST", "/api/sessions", {"activity_id": "", "mode_id": "", "difficulty": "",
                               "acuity": 0, "duration_min": 0}),
    ("POST", "/api/sessions", {"activity_id": "shoot_the_asteroids", "mode_id": "mfbf_left",
                               "difficulty": "easy", "acuity": -5, "duration_min": 1}),
    ("POST", "/api/sessions", {"activity_id": "shoot_the_asteroids", "mode_id": "mfbf_left",
                               "difficulty": "easy", "acuity": 200, "duration_min": 99999}),
    ("POST", "/api/sessions", {"activity_id": "shoot_the_asteroids", "mode_id": "mfbf_left",
                               "difficulty": "easy", "acuity": 200, "duration_min": -1}),
    ("POST", "/api/sessions", {"activity_id": "x" * 5000, "mode_id": "mfbf_left",
                               "difficulty": "easy", "acuity": 200, "duration_min": 1}),
    ("POST", "/api/sessions", {"activity_id": "shoot_the_asteroids", "mode_id": "mfbf_left",
                               "difficulty": "easy", "acuity": 200, "duration_min": 1,
                               "device_pixel_ratio": 0}),
    ("POST", "/api/sessions", {"activity_id": "shoot_the_asteroids", "mode_id": "mfbf_left",
                               "difficulty": "easy", "acuity": 200, "duration_min": 1,
                               "seed": -99999999999}),
    ("POST", "/api/sessions/nope/finish", {"elapsed_s": 1, "status": "completed", "trials": []}),
    ("POST", "/api/sessions/nope/finish", {"elapsed_s": -1, "status": "banana", "trials": "not a list"}),
    ("GET", "/api/sessions?limit=-1", None),
    ("GET", "/api/sessions?limit=999999999", None),
    ("GET", "/api/sessions?patient_id=notanumber", None),
    ("GET", "/api/progress?patient_id=-1", None),
    ("GET", "/api/catalog/acuity?viewing_distance_cm=0", None),
    ("GET", "/api/catalog/acuity?viewing_distance_cm=-40", None),
    ("GET", "/api/catalog/acuity?viewing_distance_cm=1e309", None),
    ("GET", "/api/catalog/acuity?device_pixel_ratio=0", None),
    ("PUT", "/api/settings", {}),
    ("PUT", "/api/settings", {"calibration": None}),
    ("PUT", "/api/settings", {"calibration": {"viewing_distance_cm": 0}}),
    ("PUT", "/api/settings", {"calibration": {"viewing_distance_cm": -40, "screen_diagonal_in": 0}}),
    ("PUT", "/api/settings", {"calibration": {"screen_width_px": 0, "screen_height_px": 0}}),
    ("PUT", "/api/settings", {"vergence_alpha": 999}),
    ("PUT", "/api/settings", {"sound_volume": -50}),
    ("PUT", "/api/settings", {"anaglyph": {"left_filter": "green"}}),
    ("POST", "/api/assessments", {"kind": "nonsense"}),
    ("POST", "/api/assessments", {"patient_id": "abc"}),
    ("POST", "/api/assessments/nope/respond", {"direction": "right"}),
    ("POST", "/api/assessments/nope/respond", {"direction": "sideways"}),
    ("POST", "/api/assessments/nope/respond", {}),
    ("GET", "/api/assessments/nope", None),
    ("POST", "/api/patients", {}),
    ("POST", "/api/patients", {"name": ""}),
    ("POST", "/api/patients", {"name": "x" * 100000}),
    ("PUT", "/api/patients/999999", {"name": "ghost"}),
    ("DELETE", "/api/patients/999999", None),
    ("DELETE", "/api/patients/notanumber", None),
    ("POST", "/api/glasses", {}),
    ("POST", "/api/glasses", {"right_eye_sees": "purple", "left_eye_sees": "none", "channels": []}),
    ("POST", "/api/glasses", {"right_eye_sees": "red", "left_eye_sees": "none",
                              "channels": [{"background": "green", "channel": "red"}]}),
    ("GET", "/api/glasses/preview?background=chartreuse", None),
    ("POST", "/api/login", {}),
    ("POST", "/api/login", {"username": None, "password": None}),
    ("POST", "/api/signup", {}),
    ("POST", "/api/signup", {"email": "x" * 5000}),
    ("POST", "/api/recover", {}),
    ("POST", "/api/recover", {"identifier": None}),
    ("POST", "/api/recover/reset", {}),
    ("POST", "/api/dev/snapshot", {"name": "a", "data_url": "data:image/png;base64,!!!!"}),
]


def test_fuzz() -> None:
    group("fuzz: malformed input never crashes the server")
    c = Client()
    crashes: list[str] = []
    for method, path, body in CASES:
        try:
            status, payload = c.call(method, path, body)
        except Exception as exc:  # noqa: BLE001 - a transport error is a crash too
            crashes.append(f"{method} {path} raised {exc}")
            continue
        if status >= 500:
            crashes.append(f"{method} {path} -> {status} {str(payload)[:80]}")
    check(
        f"{len(CASES)} malformed requests, none returned 5xx",
        not crashes,
        "; ".join(crashes[:4]) if crashes else "all handled",
    )
    for line in crashes:
        check(line, False)

    group("fuzz: the server is still healthy afterwards")
    status, _ = c.get("/api/health")
    check("health still answers", status == 200, str(status))
    status, cat = c.get("/api/catalog")
    check("the catalogue still loads", status == 200, str(status))
    assert isinstance(cat, dict)
    check("and still has all twenty activities", len(cat["activities"]) == 20,
          str(len(cat["activities"])))


SUITES = [test_fuzz]
