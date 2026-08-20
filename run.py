"""Launcher: build check, then serve the app and open a browser."""

from __future__ import annotations

import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn

from backend.config import HOST, PORT

BASE = Path(__file__).resolve().parent
DIST = BASE / "web" / "dist"


def main() -> int:
    if not DIST.is_dir():
        print("The UI has not been built yet. Run:\n")
        print("    cd web && npm install && npm run build\n")
        print("Serving the API only; the UI route will return a JSON notice.")
    url = f"http://{HOST}:{PORT}/"
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    print("OpenSight - Home Edition")
    print("Developed by Avtansh Sharma - built for the community, free to use.")
    print(f"  ->  {url}")
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
