"""A very small test runner.

pytest is not a dependency of this project and should not become one: the whole
point of the three-package requirements file is that a parent can install this
unattended. This is the least machinery that still gives a useful report.
"""

from __future__ import annotations

import sys
import traceback
from typing import Any, Callable

_RESULTS: list[tuple[str, str, str]] = []  # (group, name, detail) for failures
_PASSED = 0
_GROUP = ""


def group(name: str) -> None:
    global _GROUP
    _GROUP = name
    print(f"\n=== {name} ===")


def check(name: str, ok: bool, detail: str = "") -> bool:
    global _PASSED
    if ok:
        _PASSED += 1
        print(f"  PASS  {name}" + (f" -> {detail}" if detail else ""))
    else:
        _RESULTS.append((_GROUP, name, detail))
        print(f"  FAIL  {name}" + (f" -> {detail}" if detail else ""))
    return ok


def equal(name: str, got: Any, want: Any) -> bool:
    return check(name, got == want, f"got {got!r}, want {want!r}")


def close(name: str, got: float, want: float, tol: float) -> bool:
    ok = abs(got - want) <= tol
    return check(name, ok, f"got {got:.4f}, want {want:.4f} +/- {tol}")


def raises(name: str, fn: Callable[[], Any], exc: type[BaseException]) -> bool:
    try:
        fn()
    except exc:
        return check(name, True)
    except Exception as e:  # noqa: BLE001
        return check(name, False, f"raised {type(e).__name__}, want {exc.__name__}")
    return check(name, False, "did not raise")


def run(suites: list[Callable[[], None]]) -> int:
    for suite in suites:
        try:
            suite()
        except Exception:  # noqa: BLE001 - a crashed suite is a failed suite
            _RESULTS.append((_GROUP, f"{suite.__name__} crashed", traceback.format_exc(limit=3)))
            print(f"  FAIL  {suite.__name__} crashed")
            traceback.print_exc(limit=3)

    print(f"\n{'=' * 60}")
    print(f"  {_PASSED} passed, {len(_RESULTS)} failed")
    if _RESULTS:
        print("\n  Failures:")
        for grp, name, detail in _RESULTS:
            print(f"   - [{grp}] {name}")
            if detail:
                for line in detail.splitlines():
                    print(f"       {line}")
    return 1 if _RESULTS else 0


def main(suites: list[Callable[[], None]]) -> None:
    sys.exit(run(suites))
