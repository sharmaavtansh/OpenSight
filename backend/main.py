"""OpenSight application server.

Serves the JSON API and, in a packaged install, the built React bundle. During
development Vite serves the UI on its own port and proxies /api back here.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import BASE_DIR
from .db import init_db
from . import auth
from .routers import (
    assessment,
    catalog,
    glasses,
    patients,
    progress,
    sessions,
    settings,
    snapshots,
)

WEB_DIST = BASE_DIR / "web" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="OpenSight — Home Edition",
    version=__version__,
    description=(
        "Vision therapy platform: monocular and MFBF activity delivery. "
        "Developed by Avtansh Sharma. Built for the community, free to use."
    ),
    lifespan=lifespan,
)

# The Vite dev server runs on a different origin during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registered after CORS, which in Starlette means it runs first: refuse an
# unauthenticated request before any router touches the database.
app.middleware("http")(auth.gate)
app.include_router(auth.router)

app.include_router(settings.router)
app.include_router(catalog.router)
app.include_router(sessions.router)
app.include_router(progress.router)
app.include_router(patients.router)
app.include_router(assessment.router)
app.include_router(glasses.router)
app.include_router(snapshots.router)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": __version__,
        "author": "Avtansh Sharma",
        "licence": "Built for the community, free to use.",
        "ui_built": WEB_DIST.is_dir(),
    }


def _mount_ui() -> None:
    """Serve the built SPA when it exists, with a history fallback."""
    if not WEB_DIST.is_dir():
        return

    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = (WEB_DIST / full_path).resolve()
        # Only serve files that really live inside dist.
        if full_path and WEB_DIST in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(WEB_DIST / "index.html")


_mount_ui()


@app.get("/", include_in_schema=False)
def root():
    index = WEB_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse(
        {
            "app": "OpenSight — Home Edition",
            "author": "Avtansh Sharma",
            "licence": "Built for the community, free to use.",
            "version": __version__,
            "ui": "not built - run `npm run build` in web/, or `npm run dev` for the dev server",
            "docs": "/docs",
        }
    )
