from __future__ import annotations

from pathlib import Path

import traceback
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api import router as api_router
from .security import authenticate_basic_header

APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
ADMIN_DIR = APP_DIR / "static" / "admin"
ADMIN_ASSETS_DIR = ADMIN_DIR / "assets"
SALES_ASSISTANT_DIST_DIR = ROOT_DIR / "sales-assistant" / "frontend" / "dist"
SALES_ASSISTANT_ASSETS_DIR = SALES_ASSISTANT_DIST_DIR / "assets"
NO_STORE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}

app = FastAPI(title="xConsole Command Center", version="1.0.0")


def _read_text_if_exists(path: Path) -> str | None:
    try:
        if path.exists():
            return path.read_text(encoding="utf-8")
    except Exception:
        return None
    return None


ADMIN_INDEX_FILE = ADMIN_DIR / "index.html"
SALES_INDEX_FILE = SALES_ASSISTANT_DIST_DIR / "index.html"
ADMIN_INDEX_HTML = _read_text_if_exists(ADMIN_INDEX_FILE)
SALES_INDEX_HTML = _read_text_if_exists(SALES_INDEX_FILE)


def _json_safe_error_payload(*, message: str, path: str, status_code: int | None = None, details: object | None = None) -> dict[str, object]:
    payload: dict[str, object] = {
        "ok": False,
        "error": "request_error",
        "message": message,
        "path": path,
    }
    if status_code is not None:
        payload["status_code"] = status_code
    if details is not None:
        payload["details"] = details
    return payload


@app.exception_handler(StarletteHTTPException)
@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    message = str(exc.detail) if not isinstance(exc.detail, dict) else str(exc.detail.get("message", exc.detail))
    details = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
    return JSONResponse(
        status_code=getattr(exc, "status_code", 500),
        content=_json_safe_error_payload(
            message=message,
            path=str(request.url.path),
            status_code=getattr(exc, "status_code", 500),
            details=details,
        ),
    )


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=_json_safe_error_payload(
            message="Request validation failed.",
            path=str(request.url.path),
            status_code=422,
            details=exc.errors(),
        ),
    )


@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "error": "internal_server_error",
            "message": str(exc) or "An unexpected error occurred.",
            "path": str(request.url.path),
            "type": exc.__class__.__name__,
        },
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


def _is_uncached_app_path(path: str) -> bool:
    return (
        path.startswith("/api/")
        or path == "/admin"
        or path.startswith("/admin/")
        or path.startswith("/static/admin/")
        or path == "/sales-assistant"
        or path.startswith("/sales-assistant/")
    )


def _with_no_store_headers(path: str, response: Response) -> Response:
    if _is_uncached_app_path(path):
        response.headers.update(NO_STORE_HEADERS)
    return response


@app.middleware("http")
async def optional_basic_auth(request: Request, call_next):
    if request.url.path == "/api/health":
        response = await call_next(request)
        return _with_no_store_headers(request.url.path, response)

    if authenticate_basic_header(request.headers.get("authorization", "")):
        response = await call_next(request)
        return _with_no_store_headers(request.url.path, response)

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
async def root() -> RedirectResponse:
    return RedirectResponse(url="/admin")


@app.get("/admin")
async def admin_index() -> HTMLResponse:
    if ADMIN_INDEX_HTML is None:
        raise HTTPException(status_code=404, detail="Admin bundle missing. Run start-local-stack.ps1.")
    return HTMLResponse(ADMIN_INDEX_HTML, headers=NO_STORE_HEADERS)


@app.get("/admin/{path:path}")
async def admin_spa(path: str) -> HTMLResponse:
    if ADMIN_INDEX_HTML is None:
        raise HTTPException(status_code=404, detail="Admin bundle missing. Run start-local-stack.ps1.")
    return HTMLResponse(ADMIN_INDEX_HTML, headers=NO_STORE_HEADERS)


@app.get("/sales-assistant")
async def sales_assistant_index() -> HTMLResponse:
    if SALES_INDEX_HTML is None:
        raise HTTPException(
            status_code=404,
            detail="Sales-assistant bundle missing. Run start-local-stack.ps1.",
        )
    return HTMLResponse(SALES_INDEX_HTML, headers=NO_STORE_HEADERS)


@app.get("/sales-assistant/{path:path}")
async def sales_assistant_spa(path: str) -> HTMLResponse:
    if SALES_INDEX_HTML is None:
        raise HTTPException(
            status_code=404,
            detail="Sales-assistant bundle missing. Run start-local-stack.ps1.",
        )
    return HTMLResponse(SALES_INDEX_HTML, headers=NO_STORE_HEADERS)
