"""Run everything: backend logic, the API, and all twenty activities.

    py -3.11 test.py

Starts its own server on a throwaway database, so nothing needs to be running
and the real data is never touched.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "tests"))
sys.path.insert(0, str(ROOT))

import runner  # noqa: E402
import test_api  # noqa: E402
import test_logic  # noqa: E402


def frontend() -> int:
    """The game harnesses. They need the API up, which we already have."""
    web = ROOT / "web"
    if not (web / "node_modules").is_dir():
        print("\n  (skipping the frontend suites: web/node_modules is not installed)")
        return 0
    failed = 0
    for script in ("check:games", "check:tracing", "check:contrast"):
        print(f"\n{'=' * 60}\n  npm run {script}\n{'=' * 60}")
        result = subprocess.run(
            ["npm.cmd" if sys.platform == "win32" else "npm", "run", script],
            cwd=str(web),
        )
        failed |= result.returncode
    return failed


def main() -> int:
    code = 0
    try:
        test_api.start_server()
    except Exception as exc:  # noqa: BLE001
        print(f"  could not start the API server: {exc}")
        return 1
    try:
        # The frontend harnesses need an ungated server to fetch session plans
        # from, and the API suite creates accounts - which turns the gate on.
        # So they run first, while the install is still open.
        code |= frontend()
        code |= runner.run(list(test_logic.SUITES) + list(test_api.SUITES))
    finally:
        test_api.stop_server()
        shutil.rmtree(test_api.DATA, ignore_errors=True)
    return code


if __name__ == "__main__":
    sys.exit(main())
