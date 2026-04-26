from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .api import router as api_router
from .security import authenticate_basic_header

APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
ADMIN_DIR = APP_DIR / "static" / "admin"
ADMIN_ASSETS_DIR = ADMIN_DIR / "assets"
SALES_ASSISTANT_DIST_DIR = ROOT_DIR / "sales-assistant" / "frontend" / "dist"
SALES_ASSISTANT_ASSETS_DIR = SALES_ASSISTANT_DIST_DIR / "assets"

app = FastAPI(title="xConsole Command Center", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.middleware("http")
async def optional_basic_auth(request: Request, call_next):
    if request.url.path == "/api/health":
        return await call_next(request)

    if authenticate_basic_header(request.headers.get("authorization", "")):
        return await call_next(request)

    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="xConsole"'},
        content="Authentication required",
    )

if ADMIN_ASSETS_DIR.exists():
    app.mount(
        "/static/admin/assets",
        StaticFiles(directory=str(ADMIN_ASSETS_DIR)),
        name="admin-assets",
    )

if SALES_ASSISTANT_ASSETS_DIR.exists():
    app.mount(
        "/sales-assistant/assets",
        StaticFiles(directory=str(SALES_ASSISTANT_ASSETS_DIR)),
        name="sales-assistant-assets",
    )


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/admin")


@app.get("/admin")
def admin_index() -> FileResponse:
    index_file = ADMIN_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Admin bundle missing. Run start-local-stack.ps1.")
    return FileResponse(str(index_file))


@app.get("/admin/{path:path}")
def admin_spa(path: str) -> FileResponse:
    index_file = ADMIN_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Admin bundle missing. Run start-local-stack.ps1.")
    return FileResponse(str(index_file))


@app.get("/sales-assistant")
def sales_assistant_index() -> FileResponse:
    index_file = SALES_ASSISTANT_DIST_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Sales-assistant bundle missing. Run start-local-stack.ps1.",
        )
    return FileResponse(str(index_file))


@app.get("/sales-assistant/{path:path}")
def sales_assistant_spa(path: str) -> FileResponse:
    index_file = SALES_ASSISTANT_DIST_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Sales-assistant bundle missing. Run start-local-stack.ps1.",
        )
    return FileResponse(str(index_file))
