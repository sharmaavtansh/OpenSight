"""Run every backend suite.

    py -3.11 tests/run.py

Starts and stops its own server on a throwaway database, so it never touches
the real one and needs nothing running beforehand.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import runner  # noqa: E402
import test_api  # noqa: E402
import test_logic  # noqa: E402


def main() -> int:
    suites = list(test_logic.SUITES)
    code = 0
    try:
        test_api.start_server()
        suites += test_api.SUITES
    except Exception as exc:  # noqa: BLE001
        print(f"  could not start the API server: {exc}")
        code = 1

    try:
        code = runner.run(suites) or code
    finally:
        test_api.stop_server()
        shutil.rmtree(test_api.DATA, ignore_errors=True)
    return code


if __name__ == "__main__":
    sys.exit(main())
