from __future__ import annotations

import base64
import html
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from .security import (
    DEFAULT_PERMISSIONS,
    current_user_from_auth_header,
    deactivate_user,
    list_public_users,
    upsert_user,
)

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service as ChromeService
    from selenium.webdriver.common.by import By
except Exception:  # pragma: no cover - selenium is optional at import time
    webdriver = None
    ChromeService = None
    By = None

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
RUNTIME_DIR = ROOT_DIR / "runtime"
FACEBOOK_POSTS_DIR = RUNTIME_DIR / "facebook_posts"
FML_DIR = ROOT_DIR / "automation" / "facebook-marketplace-lister"
FML_ACCOUNTS_PATH = FML_DIR / "accounts.json"
FML_IMAGES_DIR = FML_DIR / "images"
FML_DRIVERS_DIR = FML_DIR / "drivers"
ADMIN_BUNDLE_INDEX = ROOT_DIR / "app" / "static" / "admin" / "index.html"
SALES_FRONTEND_INDEX = ROOT_DIR / "sales-assistant" / "frontend" / "dist" / "index.html"
SALES_BACKEND_ENTRYPOINT = ROOT_DIR / "sales-assistant" / "backend" / "dist" / "index.js"
DEFAULT_SALES_ASSISTANT_BACKEND_URL = "http://127.0.0.1:4300"
INVENTORY_SNAPSHOT_PATH = DATA_DIR / "latest" / "inventory_porsche_wb.json"
INVENTORY_LIVE_CACHE_PATH = DATA_DIR / "latest" / "inventory_dealership_live.json"
INVENTORY_LIVE_META_PATH = DATA_DIR / "latest" / "inventory_dealership_live_meta.json"
INVENTORY_MANUAL_PATH = DATA_DIR / "latest" / "inventory_manual.json"
DEFAULT_DEALERSHIP_INVENTORY_URL = "https://www.tavernachryslerdodgejeepramfiat.com/used-inventory/index.htm"
DEFAULT_DEALERSHIP_NEW_INVENTORY_URL = "https://www.tavernachryslerdodgejeepramfiat.com/new-inventory/index.htm"
FACEBOOK_POST_STATUS_PATH = RUNTIME_DIR / "facebook_post_status.json"
VEHICLE_ASSETS_CACHE_DIR = RUNTIME_DIR / "vehicle_assets"
BANK_BRAIN_HISTORY_PATH = RUNTIME_DIR / "bank_brain_history.json"
BANK_BRAIN_AUDIT_PATH = RUNTIME_DIR / "bank_brain_audit.json"
BANK_PROFILES_GENERATED_PATH = DATA_DIR / "bank_profiles.generated.json"
SALES_ASSISTANT_BANKS_PATH = ROOT_DIR / "sales-assistant" / "data" / "banks.json"
BANK_DOCS_ROOT = Path(os.getenv("BANK_DOCS_ROOT", str(ROOT_DIR / "Bank"))).resolve()
BANK_DOCS_DECODED_DIR = RUNTIME_DIR / "routeone_docs" / "decoded"
BANK_DOCS_INDEX_PATH = RUNTIME_DIR / "routeone_docs" / "decoded_index.json"
BANK_DOCS_LINK_CACHE_DIR = RUNTIME_DIR / "routeone_docs" / "linked_cache"
XCONSOLE_STATE_DIR = Path(
    os.getenv("XCONSOLE_STATE_DIR", str(BANK_DOCS_ROOT / "_xconsole"))
).resolve()
LEADS_PATH = DATA_DIR / "post_lead" / "leads.json"
LEAD_RESPONSES_PATH = XCONSOLE_STATE_DIR / "lead_responses.json"
OFFERUP_STATUS_PATH = XCONSOLE_STATE_DIR / "offerup_status.json"
OFFERUP_POSTS_DIR = XCONSOLE_STATE_DIR / "offerup_posts"
VIN_DECODE_CACHE_DIR = XCONSOLE_STATE_DIR / "vin_decode"
CARFAX_SUMMARY_DIR = DATA_DIR / "carfax_summaries"

router = APIRouter()


class FacebookPostRequest(BaseModel):
    vin: str = Field(..., min_length=3)
    title: str = Field(..., min_length=3)
    price: str | int | float = Field(...)
    mileage: str | int | None = None
    drivetrain: str | None = None
    engine: str | None = None
    transmission: str | None = None
    location: str | None = None
    exterior: str | None = None
    interior: str | None = None
    detail_url: str | None = None
    description: str | None = None
    highlights: list[str] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list)
    account_id: str | None = None
    mode: str = Field(default="draft", pattern="^(draft|live)$")


class FacebookPreflightRequest(BaseModel):
    account_id: str | None = None
    images: list[str] = Field(default_factory=list)
    vin: str | None = None


class FacebookBootstrapRequest(BaseModel):
    create_template_account_if_missing: bool = True


class FacebookVehicleImageImportRequest(BaseModel):
    vin: str = Field(..., min_length=3)
    limit: int = Field(default=20, ge=1, le=60)
    overwrite: bool = False


class FacebookPrepareLivePostRequest(BaseModel):
    vin: str = Field(..., min_length=3)
    account_id: str | None = None
    import_missing_images: bool = True
    image_limit: int = Field(default=20, ge=1, le=60)
    overwrite_images: bool = False


class FacebookRelinkImagesRequest(BaseModel):
    vin: str = Field(..., min_length=3)
    images: list[str] = Field(default_factory=list)
    include_vin_matches: bool = False
    overwrite: bool = False
    delete_source: bool = False


class FacebookFullRepairRequest(BaseModel):
    vin: str | None = None
    ensure_placeholder_images: bool = True
    placeholder_count: int = Field(default=6, ge=1, le=30)


class WireEverythingRequest(BaseModel):
    vin: str | None = None
    ensure_placeholder_images: bool = True
    placeholder_count: int = Field(default=6, ge=1, le=30)
    reload_sales_data: bool = True


class InventoryLiveSyncRequest(BaseModel):
    source_url: str | None = None
    timeout_seconds: int = Field(default=25, ge=5, le=90)
    persist: bool = True


class ManualVehicleAddRequest(BaseModel):
    vin: str = Field(..., min_length=3)
    title: str = Field(..., min_length=3)
    price: str | int | float | None = None
    mileage: str | int | float | None = None
    drivetrain: str | None = None
    engine: str | None = None
    transmission: str | None = None
    location: str | None = None
    detail_url: str | None = None
    exterior: str | None = None
    interior: str | None = None
    photos: list[str] = Field(default_factory=list)


class FacebookOneClickPostRequest(BaseModel):
    vin: str = Field(..., min_length=3)
    account_id: str | None = None
    selected_photo_indexes: list[int] = Field(default_factory=list)
    skip_photo_indexes: list[int] = Field(default_factory=lambda: [0, 2])
    caption_override: str | None = None
    mode: str = Field(default="live", pattern="^(draft|live)$")
    auto_import_photos: bool = True
    photo_limit: int = Field(default=24, ge=1, le=60)


class BankBrainAnalyzeRequest(BaseModel):
    report_text: str | None = None
    structured_data: dict[str, Any] = Field(default_factory=dict)
    requested_amount: float | None = None


class CreditStructureRequest(BaseModel):
    vin: str | None = None
    vehicle_price: float = Field(..., ge=0)
    taxes: float = Field(default=0, ge=0)
    fees: float = Field(default=0, ge=0)
    backend_products: float = Field(default=0, ge=0)
    down_payment: float = Field(default=0, ge=0)
    term_months: int = Field(default=72, ge=12, le=96)
    apr: float = Field(default=9.99, ge=0, le=35)
    monthly_income: float | None = Field(default=None, ge=0)
    current_dti: float | None = Field(default=None, ge=0, le=100)
    credit_score: int | None = Field(default=None, ge=300, le=850)
    tradelines: int | None = Field(default=None, ge=0, le=200)
    derogatories: int | None = Field(default=None, ge=0, le=50)
    utilization: float | None = Field(default=None, ge=0, le=100)


class BankBrainDecisionRequest(BaseModel):
    vin: str | None = None
    bank_code: str = Field(..., min_length=2)
    outcome: str = Field(..., pattern="^(approved|declined|countered)$")
    notes: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)


class BankBrainDocsRebuildRequest(BaseModel):
    reload_sales_data: bool = True
    max_link_depth: int = Field(default=1, ge=0, le=3)
    max_links_per_resource: int = Field(default=12, ge=0, le=80)


class XconsoleUserRequest(BaseModel):
    username: str = Field(..., min_length=2)
    password: str | None = None
    display_name: str | None = None
    role: str = Field(default="operator", pattern="^(admin|manager|operator)$")
    permissions: list[str] = Field(default_factory=list)
    active: bool = True


class LeadManualAddRequest(BaseModel):
    customer_name: str = Field(default="Unknown Lead")
    channel: str = Field(default="facebook")
    message: str = Field(..., min_length=1)
    vehicle_vin: str | None = None
    source: str = Field(default="manual")


class LeadRespondRequest(BaseModel):
    lead_id: str = Field(..., min_length=1)
    response_text: str = Field(..., min_length=1)
    channel: str = Field(default="facebook")
    mark_status: str = Field(default="responded")


class OfferUpPostRequest(BaseModel):
    vin: str = Field(..., min_length=3)
    caption_override: str | None = None
    mode: str = Field(default="draft", pattern="^(draft|live)$")


def _safe_read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def _safe_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT_DIR)).replace("\\", "/")
    except Exception:
        return str(path)


def _sanitize_doc_segment(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", value.strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ._-")
    return cleaned[:140] or fallback


def _default_inventory_source_url() -> str:
    return ", ".join(_default_inventory_source_urls())


def _split_inventory_source_urls(raw: str | None) -> list[str]:
    text = str(raw or "").strip()
    if not text:
        return []
    candidates = re.split(r"[\r\n,]+", text)
    urls = []
    seen = set()
    for candidate in candidates:
        url = candidate.strip()
        if not url or not re.match(r"^https?://", url, flags=re.IGNORECASE):
            continue
        lowered = url.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        urls.append(url)
    return urls


def _default_inventory_source_urls() -> list[str]:
    multi = _split_inventory_source_urls(os.getenv("DEALERSHIP_INVENTORY_URLS"))
    if multi:
        return multi
    used = str(os.getenv("DEALERSHIP_INVENTORY_URL", DEFAULT_DEALERSHIP_INVENTORY_URL)).strip()
    new = str(os.getenv("DEALERSHIP_NEW_INVENTORY_URL", DEFAULT_DEALERSHIP_NEW_INVENTORY_URL)).strip()
    return _split_inventory_source_urls(", ".join([used, new])) or [DEFAULT_DEALERSHIP_INVENTORY_URL]


def _to_price_text(value: str | int | float) -> str:
    if isinstance(value, (int, float)):
        return f"${value:,.0f}"
    stripped = str(value).strip()
    if stripped.startswith("$"):
        return stripped
    digits = re.sub(r"[^\d.]", "", stripped)
    if not digits:
        return stripped
    try:
        numeric = float(digits)
        return f"${numeric:,.0f}"
    except ValueError:
        return stripped


def _render_listing_text(payload: FacebookPostRequest) -> str:
    lines: list[str] = []
    lines.append(payload.title.strip())
    lines.append(f"Price: {_to_price_text(payload.price)}")

    if payload.mileage:
        lines.append(f"Mileage: {payload.mileage} miles")
    if payload.drivetrain:
        lines.append(f"Drivetrain: {payload.drivetrain}")
    if payload.engine:
        lines.append(f"Engine: {payload.engine}")
    if payload.transmission:
        lines.append(f"Transmission: {payload.transmission}")
    if payload.location:
        lines.append(f"Location: {payload.location}")
    if payload.exterior:
        lines.append(f"Exterior: {payload.exterior}")
    if payload.interior:
        lines.append(f"Interior: {payload.interior}")

    for item in payload.highlights[:3]:
        cleaned = item.strip()
        if cleaned:
            lines.append(f"- {cleaned}")

    if payload.detail_url:
        lines.append(payload.detail_url.strip())

    return "\n".join(lines) + "\n"


def _write_listing_text(vin: str, text: str) -> Path:
    timestamp = int(time.time())
    target_dir = FACEBOOK_POSTS_DIR / f"{vin}_{timestamp}"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / "facebook_listing.txt"
    target_file.write_text(text, encoding="utf-8")
    return target_file


def _extract_line_value(lines: list[str], label: str) -> str | None:
    needle = f"{label.lower()}:"
    for line in lines:
        if line.lower().startswith(needle):
            return line.split(":", 1)[1].strip()
    return None


def _parse_listing_file(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    title = lines[0] if lines else path.parent.name
    vin = path.parent.name.split("_", 1)[0]
    ts_raw = path.parent.name.split("_", 1)[1] if "_" in path.parent.name else "0"

    return {
        "vin": vin,
        "timestamp": int(re.sub(r"[^\d]", "", ts_raw) or "0"),
        "title": title,
        "price": _extract_line_value(lines, "Price"),
        "mileage": _extract_line_value(lines, "Mileage"),
        "drivetrain": _extract_line_value(lines, "Drivetrain"),
        "engine": _extract_line_value(lines, "Engine"),
        "transmission": _extract_line_value(lines, "Transmission"),
        "location": _extract_line_value(lines, "Location"),
        "detail_url": next((line for line in reversed(lines) if line.startswith("http")), None),
        "file": str(path.relative_to(ROOT_DIR)).replace("\\", "/"),
        "text": text,
    }


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if value is None:
        return None
    cleaned = re.sub(r"[^0-9.\-]+", "", str(value))
    if cleaned in {"", ".", "-", "-."}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _public_permission_catalog() -> list[dict[str, str]]:
    labels = {
        "inventory.view": "View inventory",
        "inventory.edit": "Edit inventory",
        "facebook.post": "Post to Facebook",
        "facebook.leads": "Read/respond to Facebook leads",
        "offerup.post": "Create OfferUp drafts",
        "bankbrain.view": "Use Bank Brain",
        "bankbrain.train": "Upload RouteOne forms",
        "users.manage": "Manage users",
        "admin.full": "Full admin",
    }
    return [{"id": item, "label": labels.get(item, item)} for item in DEFAULT_PERMISSIONS]


def _lead_id(seed: str) -> str:
    return hashlib.sha1(seed.encode("utf-8", errors="ignore")).hexdigest()[:16]


def _normalize_lead(raw: Any, index: int = 0) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    message = str(
        raw.get("message")
        or raw.get("last_message")
        or raw.get("body")
        or raw.get("text")
        or ""
    ).strip()
    customer_name = str(
        raw.get("customer_name")
        or raw.get("name")
        or raw.get("sender_name")
        or raw.get("from")
        or "Unknown Lead"
    ).strip()
    vehicle_vin = str(raw.get("vehicle_vin") or raw.get("vin") or "").strip().upper()
    channel = str(raw.get("channel") or raw.get("source") or "facebook").strip().lower()
    created_at = str(raw.get("created_at") or raw.get("timestamp") or raw.get("created_time") or _utc_now())
    seed = "|".join([customer_name, vehicle_vin, message, created_at, str(index)])
    return {
        "id": str(raw.get("id") or raw.get("lead_id") or _lead_id(seed)),
        "customer_name": customer_name,
        "channel": channel,
        "message": message or "No message captured yet.",
        "vehicle_vin": vehicle_vin,
        "source": str(raw.get("source") or channel).strip(),
        "status": str(raw.get("status") or "new").strip().lower(),
        "created_at": created_at,
        "last_message_at": raw.get("last_message_at") or created_at,
        "conversation_id": raw.get("conversation_id"),
        "profile_id": raw.get("profile_id"),
    }


def _load_leads() -> list[dict[str, Any]]:
    payload = _safe_read_json(LEADS_PATH, [])
    raw_items = payload.get("items", []) if isinstance(payload, dict) else payload
    if not isinstance(raw_items, list):
        raw_items = []
    leads = [lead for lead in (_normalize_lead(item, index) for index, item in enumerate(raw_items)) if lead]
    response_payload = _safe_read_json(LEAD_RESPONSES_PATH, {"responses": []})
    responses = response_payload.get("responses", []) if isinstance(response_payload, dict) else []
    if isinstance(responses, list):
        responded_ids = {str(item.get("lead_id")) for item in responses if isinstance(item, dict)}
        for lead in leads:
            if lead["id"] in responded_ids and lead.get("status") == "new":
                lead["status"] = "responded"
    return sorted(leads, key=lambda item: str(item.get("last_message_at") or ""), reverse=True)


def _save_leads(leads: list[dict[str, Any]]) -> None:
    _safe_write_json(
        LEADS_PATH,
        {
            "items": leads,
            "updated_at": _utc_now(),
        },
    )


def _append_lead_response(*, lead_id: str, channel: str, response_text: str, author: str | None) -> dict[str, Any]:
    payload = _safe_read_json(LEAD_RESPONSES_PATH, {"responses": []})
    responses = payload.get("responses", []) if isinstance(payload, dict) else []
    if not isinstance(responses, list):
        responses = []
    entry = {
        "id": _lead_id(f"{lead_id}|{response_text}|{time.time()}"),
        "lead_id": lead_id,
        "channel": channel,
        "response_text": response_text,
        "author": author or "xconsole",
        "created_at": _utc_now(),
        "delivery_status": "logged",
    }
    responses.append(entry)
    _safe_write_json(LEAD_RESPONSES_PATH, {"responses": responses[-1000:], "updated_at": _utc_now()})
    return entry


def _facebook_lead_connection_status() -> dict[str, Any]:
    token = str(os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN", "")).strip()
    page_id = str(os.getenv("FACEBOOK_PAGE_ID", "")).strip()
    app_id = str(os.getenv("FACEBOOK_APP_ID", "")).strip()
    missing = []
    if not token:
        missing.append("FACEBOOK_PAGE_ACCESS_TOKEN")
    if not page_id:
        missing.append("FACEBOOK_PAGE_ID")
    return {
        "configured": not missing,
        "missing": missing,
        "page_id_configured": bool(page_id),
        "token_configured": bool(token),
        "app_id_configured": bool(app_id),
    }


def _sync_facebook_leads() -> dict[str, Any]:
    connection = _facebook_lead_connection_status()
    if not connection.get("configured"):
        return {
            "ok": False,
            "mode": "not_connected",
            "connection": connection,
            "imported": 0,
            "guidance": [
                "Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN on Railway to enable Graph lead pull.",
                "Until connected, use Manual Lead to keep Messenger conversations visible in Xconsole.",
            ],
        }

    # Marketplace lead message APIs vary by account/page permissions. Keep the
    # endpoint safe: verify token connectivity and expose the next missing scope
    # instead of deleting or mutating live conversations.
    page_id = str(os.getenv("FACEBOOK_PAGE_ID", "")).strip()
    token = str(os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN", "")).strip()
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                f"https://graph.facebook.com/v19.0/{page_id}",
                params={"fields": "id,name", "access_token": token},
            )
        payload = response.json()
    except Exception as exc:
        return {
            "ok": False,
            "mode": "connection_error",
            "connection": connection,
            "error": str(exc),
            "imported": 0,
        }

    if response.status_code >= 400:
        return {
            "ok": False,
            "mode": "graph_rejected",
            "connection": connection,
            "graph_status": response.status_code,
            "graph_response": payload,
            "imported": 0,
        }

    return {
        "ok": True,
        "mode": "token_verified",
        "connection": connection,
        "page": payload,
        "imported": 0,
        "guidance": [
            "Page token is valid. Add Facebook lead/conversation permissions to import Messenger threads automatically.",
        ],
    }


def _load_offerup_status() -> dict[str, Any]:
    payload = _safe_read_json(OFFERUP_STATUS_PATH, {"posts": {}})
    posts = payload.get("posts", {}) if isinstance(payload, dict) else {}
    if not isinstance(posts, dict):
        posts = {}
    return {
        "ok": True,
        "ready_for_live": False,
        "mode": "draft",
        "reason": "OfferUp has no connected live API/session in this build; Xconsole creates one-click drafts.",
        "posts": posts,
        "drafts_count": len(posts),
        "updated_at": payload.get("updated_at") if isinstance(payload, dict) else None,
    }


def _save_offerup_post(vin: str, post: dict[str, Any]) -> None:
    status = _load_offerup_status()
    posts = status.get("posts", {})
    if not isinstance(posts, dict):
        posts = {}
    posts[vin] = post
    _safe_write_json(OFFERUP_STATUS_PATH, {"posts": posts, "updated_at": _utc_now()})


def _offerup_post_from_inventory(request: OfferUpPostRequest) -> dict[str, Any]:
    clean_vin = str(request.vin or "").strip().upper()
    vehicle = _find_vehicle_by_vin(clean_vin)
    if not vehicle:
        raise HTTPException(status_code=404, detail={"message": f"Vehicle not found for VIN {clean_vin}"})
    caption = _build_caption_from_vehicle(vehicle, caption_override=request.caption_override)
    OFFERUP_POSTS_DIR.mkdir(parents=True, exist_ok=True)
    target = OFFERUP_POSTS_DIR / f"{clean_vin}_{int(time.time())}.txt"
    target.write_text(caption, encoding="utf-8")
    post = {
        "vin": clean_vin,
        "mode": request.mode,
        "status": "drafted" if request.mode == "draft" else "live_not_connected",
        "draft_file": _display_path(target),
        "caption": caption,
        "created_at": _utc_now(),
    }
    _save_offerup_post(clean_vin, post)
    _append_audit_event("offerup_post", {"vin": clean_vin, "mode": request.mode, "status": post["status"]})
    return {
        "ok": request.mode == "draft",
        "vin": clean_vin,
        "post": post,
        "live_success": False,
        "live_detail": "OfferUp live posting is not connected. Draft was created for operator review.",
        "status": _load_offerup_status(),
    }


def _vin_decode_cache_path(vin: str) -> Path:
    clean_vin = re.sub(r"[^A-Z0-9]", "", str(vin or "").upper()) or "UNKNOWN"
    VIN_DECODE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return VIN_DECODE_CACHE_DIR / f"{clean_vin}.json"


def _decode_vin_values(vin: str) -> dict[str, Any]:
    clean_vin = re.sub(r"[^A-Z0-9]", "", str(vin or "").upper())
    if len(clean_vin) < 11:
        raise HTTPException(status_code=400, detail={"message": "VIN must be at least 11 characters"})
    cache_path = _vin_decode_cache_path(clean_vin)
    cached = _safe_read_json(cache_path, None)
    if isinstance(cached, dict) and cached.get("vin") == clean_vin:
        return cached

    decoded: dict[str, Any] = {
        "vin": clean_vin,
        "ok": False,
        "source": "fallback",
        "decoded_at": _utc_now(),
        "fields": {},
        "raw": None,
    }
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            response = client.get(
                f"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/{clean_vin}",
                params={"format": "json"},
            )
        payload = response.json()
        result = (payload.get("Results") or [{}])[0] if isinstance(payload, dict) else {}
        if isinstance(result, dict):
            fields = {
                "year": result.get("ModelYear"),
                "make": result.get("Make"),
                "model": result.get("Model"),
                "trim": result.get("Trim") or result.get("Series"),
                "body_class": result.get("BodyClass"),
                "vehicle_type": result.get("VehicleType"),
                "drive_type": result.get("DriveType"),
                "engine": " ".join(
                    str(part)
                    for part in [
                        result.get("EngineCylinders") and f"{result.get('EngineCylinders')} cyl",
                        result.get("DisplacementL") and f"{result.get('DisplacementL')}L",
                        result.get("FuelTypePrimary"),
                    ]
                    if part
                ),
                "manufacturer": result.get("Manufacturer"),
                "plant_country": result.get("PlantCountry"),
                "gvwr": result.get("GVWR"),
            }
            decoded.update({"ok": True, "source": "nhtsa_vpic", "fields": fields, "raw": result})
    except Exception as exc:
        decoded["error"] = str(exc)

    if not decoded.get("ok"):
        vehicle = _find_vehicle_by_vin(clean_vin)
        title = str(vehicle.get("title") or "") if vehicle else ""
        parts = title.split()
        decoded["fields"] = {
            "year": next((part for part in parts if re.fullmatch(r"20[0-9]{2}|19[0-9]{2}", part)), None),
            "make": parts[1] if len(parts) > 1 else None,
            "model": parts[2] if len(parts) > 2 else None,
            "trim": " ".join(parts[3:]) if len(parts) > 3 else None,
        }
    _safe_write_json(cache_path, decoded)
    return decoded


def _carfax_summary_for_vin(vin: str) -> dict[str, Any] | None:
    clean_vin = str(vin or "").strip().upper()
    if not clean_vin:
        return None
    candidates = [CARFAX_SUMMARY_DIR / f"{clean_vin}.json", CARFAX_SUMMARY_DIR / f"{clean_vin.lower()}.json"]
    for path in candidates:
        payload = _safe_read_json(path, None)
        if isinstance(payload, dict):
            return payload
    return None


def _vehicle_bank_brain(vin: str) -> dict[str, Any]:
    clean_vin = str(vin or "").strip().upper()
    vehicle = _find_vehicle_by_vin(clean_vin)
    if not vehicle:
        raise HTTPException(status_code=404, detail={"message": f"Vehicle not found for VIN {clean_vin}"})
    decoded = _decode_vin_values(clean_vin)
    fields = decoded.get("fields") if isinstance(decoded, dict) else {}
    if not isinstance(fields, dict):
        fields = {}
    price = _to_float(vehicle.get("price")) or 0.0
    mileage = _to_float(vehicle.get("mileage")) or 0.0
    year = _to_float(fields.get("year"))
    current_year = datetime.now(timezone.utc).year
    age = max(0, current_year - int(year)) if year else None
    down = max(1000.0, round(price * 0.08, 2)) if price else 0.0

    structure_request = CreditStructureRequest(
        vin=clean_vin,
        vehicle_price=price,
        taxes=round(price * 0.07, 2),
        fees=1199,
        backend_products=2500,
        down_payment=down,
        term_months=72,
        apr=11.99,
        monthly_income=None,
        current_dti=None,
        credit_score=None,
        tradelines=None,
        derogatories=None,
        utilization=None,
    )
    structure_result = _simulate_credit_structure(structure_request)
    recommendation = dict(structure_result.get("recommendation") or {})
    ranked = list(recommendation.get("ranked_banks") or [])

    collateral_flags: list[str] = []
    adjustment = 0.0
    if age is not None and age >= 8:
        collateral_flags.append("Older collateral: some prime banks may cap term/LTV.")
        adjustment -= 7.0
    if mileage >= 100_000:
        collateral_flags.append("High-mileage collateral: expect stricter advance and term caps.")
        adjustment -= 8.0
    if price >= 75_000:
        collateral_flags.append("High-ticket unit: down payment and bureau strength matter more.")
        adjustment -= 3.0

    adjusted_ranked: list[dict[str, Any]] = []
    for item in ranked:
        if not isinstance(item, dict):
            continue
        row = dict(item)
        base_confidence = _to_float(row.get("confidence")) or 0.0
        row["confidence"] = max(1.0, min(99.0, round(base_confidence + adjustment, 1)))
        row.setdefault("reasons", [])
        if collateral_flags:
            row["reasons"] = list(row.get("reasons") or []) + collateral_flags[:1]
        adjusted_ranked.append(row)
    adjusted_ranked.sort(key=lambda item: item.get("confidence", 0), reverse=True)
    if adjusted_ranked:
        recommendation["ranked_banks"] = adjusted_ranked
        recommendation["best_bank"] = adjusted_ranked[0]
        recommendation["backup_bank"] = adjusted_ranked[1] if len(adjusted_ranked) > 1 else None
    recommendation["collateral_flags"] = collateral_flags

    carfax_summary = _carfax_summary_for_vin(clean_vin)
    packet = [
        "Pull/attach credit app before final lender selection.",
        "Attach bookout, invoice/sticker if available, proof of income, proof of residence, insurance, and trade payoff if applicable.",
    ]
    if collateral_flags:
        packet.append("Pre-empt collateral concerns with stronger down payment or shorter term.")

    return {
        "ok": True,
        "vin": clean_vin,
        "vehicle": vehicle,
        "decode": decoded,
        "carfax_summary": carfax_summary,
        "default_structure": structure_result.get("structure"),
        "recommendation": recommendation,
        "packet_guidance": packet,
        "assumptions": [
            "No customer bureau attached yet, so confidence is collateral/deal-structure based.",
            "Final approval probability should be recalculated after credit report upload.",
        ],
    }


def _load_runtime_posts() -> list[dict[str, Any]]:
    if not FACEBOOK_POSTS_DIR.exists():
        return []
    posts: list[dict[str, Any]] = []
    for file_path in FACEBOOK_POSTS_DIR.glob("*/*facebook_listing.txt"):
        try:
            posts.append(_parse_listing_file(file_path))
        except Exception:
            continue
    posts.sort(key=lambda item: item.get("timestamp", 0), reverse=True)
    return posts


def _vin_candidate(value: Any) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return ""
    if re.fullmatch(r"[A-HJ-NPR-Z0-9]{11,17}", raw):
        return raw
    return ""


def _extract_vin_from_text(value: Any) -> str:
    text = str(value or "").upper()
    match = re.search(r"\b[A-HJ-NPR-Z0-9]{17}\b", text)
    return match.group(0) if match else ""


def _value_for_keys(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    lower_map = {str(key).lower(): key for key in item.keys()}
    for key in keys:
        found = lower_map.get(key.lower())
        if found is not None:
            return item.get(found)
    return None


def _schema_types(item: dict[str, Any]) -> set[str]:
    value = item.get("@type")
    if isinstance(value, str):
        return {value.lower()}
    if isinstance(value, list):
        return {str(entry).lower() for entry in value}
    return set()


def _extract_json_block_after(text: str, start_index: int) -> str | None:
    length = len(text)
    index = start_index
    while index < length and text[index] in " \t\r\n=:":
        index += 1
    if index >= length or text[index] not in "{[":
        return None

    opener = text[index]
    closer = "}" if opener == "{" else "]"
    depth = 0
    in_string = False
    escape_next = False

    for cursor in range(index, length):
        char = text[cursor]
        if in_string:
            if escape_next:
                escape_next = False
            elif char == "\\":
                escape_next = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue
        if char == opener:
            depth += 1
            continue
        if char == closer:
            depth -= 1
            if depth == 0:
                return text[index : cursor + 1]

    return None


def _walk_json_dicts(payload: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            found.append(node)
            for value in node.values():
                _walk(value)
            return
        if isinstance(node, list):
            for value in node:
                _walk(value)

    _walk(payload)
    return found


def _looks_like_vehicle_record(item: dict[str, Any]) -> bool:
    keys = {str(key).lower() for key in item.keys()}
    schema_types = _schema_types(item)

    # JSON-LD vehicle blocks (for example Product/Car with offers)
    if {"car", "product"}.intersection(schema_types):
        has_vehicle_payload = bool(
            keys.intersection(
                {
                    "name",
                    "vehicleidentificationnumber",
                    "offers",
                    "image",
                    "vehicleconfiguration",
                    "vehiclemodeldate",
                    "vehicleengine",
                }
            )
        )
        if has_vehicle_payload:
            return True

    if {"year", "make", "model"}.issubset(keys):
        return True
    if "vin" in keys or "vehicle_vin" in keys or "vehiclevin" in keys or "vehicleidentificationnumber" in keys:
        return True
    score = 0
    for bucket in [
        {"price", "internet_price", "msrp", "sale_price"},
        {"mileage", "odometer", "mileagefromodometer"},
        {"photos", "images", "media", "gallery", "image"},
        {"detail_url", "vehicle_url", "vdp_url", "url", "href"},
    ]:
        if keys.intersection(bucket):
            score += 1
    return score >= 2


def _extract_inventory_dicts_from_payload(payload: Any) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for node in _walk_json_dicts(payload):
        if _looks_like_vehicle_record(node):
            candidates.append(node)
    return candidates


def _extract_inventory_dicts_from_html(html_text: str) -> tuple[list[dict[str, Any]], list[str]]:
    payloads: list[Any] = []
    notes: list[str] = []

    script_matches = re.findall(
        r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>",
        html_text,
        flags=re.IGNORECASE | re.DOTALL,
    )

    assignment_tokens = [
        "__NEXT_DATA__",
        "__PRELOADED_STATE__",
        "__INITIAL_STATE__",
        "inventoryData",
        "inventoryState",
        "vehicleData",
    ]

    for attrs, body in script_matches:
        attrs_lower = attrs.lower()
        body_text = body.strip()
        if not body_text:
            continue

        is_json_script = "application/ld+json" in attrs_lower or "application/json" in attrs_lower
        if is_json_script or "__next_data__" in attrs_lower:
            try:
                payloads.append(json.loads(body_text))
                continue
            except Exception:
                pass

        for token in assignment_tokens:
            if token not in body_text:
                continue
            token_index = body_text.find(token)
            equals_index = body_text.find("=", token_index)
            if equals_index < 0:
                continue
            json_block = _extract_json_block_after(body_text, equals_index + 1)
            if not json_block:
                continue
            try:
                payloads.append(json.loads(json_block))
                break
            except Exception:
                continue

    records: list[dict[str, Any]] = []
    for payload in payloads:
        records.extend(_extract_inventory_dicts_from_payload(payload))

    notes.append(f"script_payloads={len(payloads)}")
    notes.append(f"candidate_records={len(records)}")
    return records, notes


def _proxy_markdown_url_for_source(source_url: str) -> str:
    raw = str(source_url or "").strip()
    if not raw:
        return "https://r.jina.ai/http://"
    without_scheme = re.sub(r"^https?://", "", raw, flags=re.IGNORECASE)
    return f"https://r.jina.ai/http://{without_scheme}"


def _synthetic_vin_from_detail_url(detail_url: str) -> str:
    parsed = urlparse(detail_url)
    tail = parsed.path.rsplit("/", 1)[-1]
    tail = tail.rsplit(".", 1)[0]
    token = re.sub(r"[^A-Z0-9]", "", str(tail).upper())
    digest = hashlib.sha1(str(detail_url).encode("utf-8")).hexdigest().upper()
    synthetic = (token + digest)[:17]
    return synthetic if synthetic else digest[:17]


def _extract_inventory_dicts_from_markdown_proxy(
    markdown_text: str,
    *,
    source_url: str | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    text = str(markdown_text or "")
    records: list[dict[str, Any]] = []
    notes: list[str] = []

    image_by_detail: dict[str, list[str]] = {}
    image_pattern = re.compile(
        r"\[!\[[^\]]*\]\((https?://[^)\s]+)\)\]\((https?://[^)\s]+/used/[^)\s]+\.htm)\)",
        flags=re.IGNORECASE,
    )
    for image_url, detail_url in image_pattern.findall(text):
        clean_detail = detail_url.strip()
        clean_image = image_url.strip()
        if clean_detail.startswith("http://"):
            clean_detail = "https://" + clean_detail[len("http://") :]
        if clean_image.startswith("http://"):
            clean_image = "https://" + clean_image[len("http://") :]
        bucket = image_by_detail.setdefault(clean_detail, [])
        lowered = {entry.lower() for entry in bucket}
        if clean_image.lower() not in lowered:
            bucket.append(clean_image)

    listing_pattern = re.compile(
        r"\[(\d{4}\s+[^\]]+?)\]\((https?://[^)\s]+/used/[^)\s]+\.htm)\)\$([0-9,]+)",
        flags=re.IGNORECASE,
    )

    seen: set[str] = set()
    for match in listing_pattern.finditer(text):
        title = str(match.group(1) or "").strip()
        detail_url = str(match.group(2) or "").strip()
        price_raw = str(match.group(3) or "").replace(",", "").strip()

        if detail_url.startswith("http://"):
            detail_url = "https://" + detail_url[len("http://") :]
        if source_url and detail_url.startswith("/"):
            detail_url = urljoin(source_url, detail_url)

        unique_key = detail_url.lower() or title.lower()
        if not unique_key or unique_key in seen:
            continue
        seen.add(unique_key)

        mileage_raw: int | None = None
        window = text[match.end() : match.end() + 320]
        mileage_match = re.search(r"([0-9][0-9,]{0,9})\s+miles", window, flags=re.IGNORECASE)
        if mileage_match:
            try:
                mileage_raw = int(mileage_match.group(1).replace(",", ""))
            except Exception:
                mileage_raw = None

        price_value: int | str | None
        try:
            price_value = int(price_raw) if price_raw else None
        except Exception:
            price_value = price_raw or None

        photos = image_by_detail.get(detail_url, [])
        records.append(
            {
                "vin": _synthetic_vin_from_detail_url(detail_url),
                "title": title,
                "price": price_value,
                "mileage": mileage_raw,
                "detail_url": detail_url,
                "photos": photos,
                "status_label": "In Stock",
            }
        )

    notes.append(f"proxy_image_links={sum(len(value) for value in image_by_detail.values())}")
    notes.append(f"proxy_candidate_records={len(records)}")
    return records, notes


def _dedupe_urls(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        candidate = html.unescape(str(raw or "").strip())
        if not candidate:
            continue
        if candidate.startswith("//"):
            candidate = f"https:{candidate}"
        if candidate.startswith("http://"):
            candidate = "https://" + candidate[len("http://") :]
        lowered = candidate.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(candidate)
    return normalized


def _extract_vehicle_photo_urls_from_html(html_text: str, *, base_url: str | None = None) -> list[str]:
    candidates = re.findall(
        r"""(?:src|data-src|data-zoom-image|content)\s*=\s*["']([^"']+)["']""",
        html_text,
        flags=re.IGNORECASE,
    )
    absolute: list[str] = []
    for raw in candidates:
        candidate = str(raw or "").strip()
        if not candidate:
            continue
        if candidate.startswith("//"):
            candidate = f"https:{candidate}"
        elif base_url and candidate.startswith("/"):
            candidate = urljoin(base_url, candidate)
        lowered = candidate.lower()
        if "pictures.dealer.com" not in lowered:
            continue
        if not re.search(r"\.(?:jpe?g|png|webp)(?:[?#].*)?$", lowered):
            continue
        absolute.append(candidate)
    return _dedupe_urls(absolute)


def _extract_detail_facts_from_markdown_proxy(markdown_text: str) -> dict[str, Any]:
    text = str(markdown_text or "")
    compact = re.sub(r"\s+", " ", text)
    facts: dict[str, Any] = {}

    title_match = re.search(r"##\s+(?:Used\s+)?(\d{4}\s+[^\n]+)", text)
    if title_match:
        facts["title"] = title_match.group(1).strip()

    vin_match = re.search(r"\bVIN\s+([A-HJ-NPR-Z0-9]{17})\b", compact, flags=re.IGNORECASE)
    if vin_match:
        facts["vin"] = vin_match.group(1).strip().upper()

    stock_match = re.search(r"\bStock Number\s+([A-Z0-9-]+)\b", compact, flags=re.IGNORECASE)
    if stock_match:
        facts["stock_number"] = stock_match.group(1).strip().upper()

    mileage_match = re.search(r"\bOdometer\s+([0-9,]+)\s+miles\b", compact, flags=re.IGNORECASE)
    if mileage_match:
        try:
            facts["mileage"] = int(mileage_match.group(1).replace(",", ""))
        except Exception:
            pass

    field_patterns = {
        "exterior": r"\bExterior Color\s+(.+?)\s+Interior Color\b",
        "interior": r"\bInterior Color\s+(.+?)\s+Odometer\b",
        "transmission": r"\bTransmission\s+(.+?)\s+Drivetrain\b",
        "drivetrain": r"\bDrivetrain\s+(.+?)\s+Engine\b",
        "engine": r"\bEngine\s+(.+?)\s+VIN\b",
    }
    for key, pattern in field_patterns.items():
        match = re.search(pattern, compact, flags=re.IGNORECASE)
        if match:
            facts[key] = match.group(1).strip()

    highlights_match = re.search(
        r"###\s+Highlighted Features\s+(.*?)(?:###\s+Included Packages|###\s+Detailed Specifications|###\s+KBB\.com Consumer Reviews|\Z)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if highlights_match:
        highlights = [
            re.sub(r"\s+", " ", line).strip(" -*")
            for line in highlights_match.group(1).splitlines()
            if line.strip().startswith("*")
        ]
        highlights = [item for item in highlights if item]
        if highlights:
            facts["highlights"] = highlights[:24]

    return facts


def _fetch_detail_markdown_via_proxy(
    *,
    detail_url: str,
    client: httpx.Client,
) -> tuple[str | None, list[str]]:
    proxy_url = _proxy_markdown_url_for_source(detail_url)
    response = client.get(proxy_url)
    notes = [
        f"detail_proxy_url={proxy_url}",
        f"detail_proxy_status={response.status_code}",
    ]
    if response.status_code >= 400:
        return None, notes
    return response.text, notes


def _merge_detail_payload_into_record(
    record: dict[str, Any],
    detail_payload: dict[str, Any],
) -> dict[str, Any]:
    merged = dict(record)
    if detail_payload.get("vin"):
        merged["vin"] = detail_payload["vin"]

    for key in (
        "title",
        "mileage",
        "drivetrain",
        "engine",
        "transmission",
        "exterior",
        "interior",
        "stock_number",
        "highlights",
    ):
        value = detail_payload.get(key)
        if value in (None, "", [], {}):
            continue
        if key == "mileage":
            merged[key] = value
            continue
        if not merged.get(key):
            merged[key] = value
            continue
        if key == "title" and str(merged.get(key) or "").strip().lower() == str(record.get("vin") or "").strip().lower():
            merged[key] = value

    return merged


def _enrich_inventory_records_from_proxy_detail_pages(
    records: list[dict[str, Any]],
    *,
    timeout_seconds: int,
) -> tuple[list[dict[str, Any]], list[str]]:
    enriched: list[dict[str, Any]] = []
    diagnostics: list[str] = []
    started_at = time.time()
    budget_seconds = max(12.0, float(timeout_seconds) * 1.25)

    if not records:
        return enriched, diagnostics

    with httpx.Client(
        timeout=max(4.0, min(6.0, float(timeout_seconds))),
        follow_redirects=True,
        headers={
            "user-agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            "accept": "text/plain,text/markdown,text/html;q=0.9,*/*;q=0.8",
        },
    ) as client:
        for index, record in enumerate(records):
            if time.time() - started_at > budget_seconds:
                diagnostics.append(f"detail_proxy_budget_exhausted_at={index}")
                enriched.extend(dict(item) for item in records[index:])
                break
            detail_url = str(record.get("detail_url") or "").strip()
            if not detail_url:
                enriched.append(dict(record))
                continue

            merged = dict(record)
            try:
                markdown_text, notes = _fetch_detail_markdown_via_proxy(detail_url=detail_url, client=client)
                diagnostics.extend(notes)
                if markdown_text:
                    merged = _merge_detail_payload_into_record(
                        merged,
                        _extract_detail_facts_from_markdown_proxy(markdown_text),
                    )
            except Exception as exc:
                diagnostics.append(f"detail_proxy_error={detail_url}|{exc}")
            enriched.append(merged)

    diagnostics.append(f"detail_proxy_enriched={len(enriched)}")
    return enriched, diagnostics


def _fetch_live_inventory_records_via_proxy_markdown(*, source_url: str, timeout_seconds: int) -> dict[str, Any]:
    proxy_url = _proxy_markdown_url_for_source(source_url)
    with httpx.Client(
        timeout=float(timeout_seconds),
        follow_redirects=True,
        headers={
            "user-agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            "accept": "text/plain,text/markdown,text/html,application/json;q=0.9,*/*;q=0.8",
        },
    ) as client:
        response = client.get(proxy_url)

    content_type = str(response.headers.get("content-type", "")).lower()
    notes: list[str] = [
        "source_mode=proxy_markdown",
        f"proxy_url={proxy_url}",
        f"proxy_status={response.status_code}",
        f"proxy_content_type={content_type}",
    ]
    if response.status_code >= 400:
        return {
            "source_url": source_url,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "items": [],
            "items_count": 0,
            "diagnostics": notes,
        }

    records, parse_notes = _extract_inventory_dicts_from_markdown_proxy(
        response.text,
        source_url=source_url,
    )
    notes.extend(parse_notes)
    records, detail_notes = _enrich_inventory_records_from_proxy_detail_pages(
        records,
        timeout_seconds=timeout_seconds,
    )
    notes.extend(detail_notes)
    return {
        "source_url": source_url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "items": records,
        "items_count": len(records),
        "diagnostics": notes,
    }


def _normalize_photo_entries(value: Any) -> list[str]:
    raw_items = value if isinstance(value, list) else [value]
    normalized: list[str] = []
    seen: set[str] = set()

    for entry in raw_items:
        candidate: str | None = None
        if isinstance(entry, str):
            stripped = entry.strip()
            if stripped.startswith(("http://", "https://")):
                candidate = stripped
        elif isinstance(entry, dict):
            for key in ("url", "src", "image", "photo"):
                value_at_key = entry.get(key)
                if isinstance(value_at_key, str):
                    stripped = value_at_key.strip()
                    if stripped.startswith(("http://", "https://")):
                        candidate = stripped
                        break
        if not candidate:
            continue
        lowered = candidate.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(candidate)
    return normalized


def _normalize_mileage_value(raw: Any) -> Any:
    if isinstance(raw, dict):
        for key in ("value", "amount"):
            candidate = raw.get(key)
            if candidate is not None:
                return candidate
        return None
    return raw


def _normalize_status_label(item: dict[str, Any], offers: dict[str, Any] | None) -> str:
    raw = _value_for_keys(item, ("status_label", "status", "availability", "inventory_status"))
    if raw is None and offers:
        raw = offers.get("availability")
    text = str(raw or "").strip()
    lowered = text.lower()
    if "instock" in lowered or "in stock" in lowered:
        return "In Stock"
    if "outofstock" in lowered or "out of stock" in lowered:
        return "Out of Stock"
    if "preorder" in lowered or "pre-order" in lowered:
        return "Preorder"
    if text:
        return text
    return "Ready"


def _normalize_text_value(raw: Any) -> Any:
    if isinstance(raw, dict):
        for key in ("name", "label", "text", "description", "value"):
            candidate = raw.get(key)
            if isinstance(candidate, (str, int, float)) and str(candidate).strip():
                return candidate
        return None
    return raw


def _normalize_inventory_records(records: list[dict[str, Any]], *, source_url: str | None = None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in records:
        if not isinstance(item, dict):
            continue

        offers_raw = _value_for_keys(item, ("offers", "offer"))
        offers: dict[str, Any] | None = None
        if isinstance(offers_raw, dict):
            offers = offers_raw
        elif isinstance(offers_raw, list):
            offers = next((entry for entry in offers_raw if isinstance(entry, dict)), None)

        offer_url = offers.get("url") if isinstance(offers, dict) else None
        offer_price = offers.get("price") if isinstance(offers, dict) else None
        seller_name = None
        if isinstance(offers, dict) and isinstance(offers.get("seller"), dict):
            seller_name = offers["seller"].get("name")

        vin = _vin_candidate(
            _value_for_keys(
                item,
                (
                    "vin",
                    "vehicle_vin",
                    "vehicleVin",
                    "VIN",
                    "vehicleIdentificationNumber",
                    "vehicle_identification_number",
                ),
            )
        ) or _extract_vin_from_text(_value_for_keys(item, ("title", "name", "vehicleName", "description")))

        year_from_model_date = _value_for_keys(item, ("vehicleModelDate",))
        year_candidate = ""
        if year_from_model_date:
            matched_year = re.search(r"\b(19|20)\d{2}\b", str(year_from_model_date))
            year_candidate = matched_year.group(0) if matched_year else ""

        title = str(
            _value_for_keys(item, ("title", "name", "vehicleName", "vehicle_title"))
            or " ".join(
                str(_value_for_keys(item, (part,)) or "").strip()
                for part in ("year", "make", "model", "trim", "vehicleConfiguration")
                if str(_value_for_keys(item, (part,)) or "").strip()
            )
        ).strip()
        if not title and year_candidate:
            make = str(_value_for_keys(item, ("make", "brand")) or "").strip()
            model = str(_value_for_keys(item, ("model", "vehicleConfiguration")) or "").strip()
            title = " ".join(part for part in [year_candidate, make, model] if part).strip()

        if not vin and not title:
            continue

        detail_url_raw = _value_for_keys(
            item,
            ("detail_url", "vehicle_url", "vdp_url", "url", "href", "permalink"),
        )
        detail_url = str(detail_url_raw).strip() if detail_url_raw else (str(offer_url).strip() if offer_url else None)
        if detail_url and source_url and detail_url.startswith("/"):
            detail_url = urljoin(source_url, detail_url)

        photos = _normalize_photo_entries(
            _value_for_keys(item, ("photos", "images", "media", "gallery", "image"))
        )

        output = {
            "vin": vin or "UNKNOWN",
            "title": title or (vin or "UNKNOWN"),
            "price": _value_for_keys(
                item,
                ("price", "internet_price", "internetPrice", "sale_price", "msrp"),
            )
            or offer_price,
            "mileage": _normalize_mileage_value(
                _value_for_keys(item, ("mileage", "odometer", "mileageFromOdometer"))
            ),
            "drivetrain": _normalize_text_value(
                _value_for_keys(item, ("drivetrain", "drive_train", "driveWheelConfiguration"))
            ),
            "engine": _normalize_text_value(
                _value_for_keys(item, ("engine", "engine_description", "vehicleEngine"))
            ),
            "transmission": _normalize_text_value(
                _value_for_keys(item, ("transmission", "transmission_description", "vehicleTransmission"))
            ),
            "location": _normalize_text_value(
                _value_for_keys(item, ("location", "dealer_name", "store_name")) or seller_name
            ),
            "detail_url": detail_url,
            "exterior": _value_for_keys(item, ("exterior", "ext_color", "exterior_color", "color")),
            "interior": _value_for_keys(
                item,
                ("interior", "int_color", "interior_color", "vehicleInteriorColor"),
            ),
            "photos": photos,
            "status_label": _normalize_status_label(item, offers),
        }

        unique_key = output["vin"] if output["vin"] != "UNKNOWN" else (
            output["detail_url"] or f"{output['title']}|{output.get('price')}"
        )
        unique_key = str(unique_key).strip().lower()
        if not unique_key or unique_key in seen:
            continue
        seen.add(unique_key)
        normalized.append(output)

    return normalized


def _normalize_inventory_blob(blob: Any, *, source_url: str | None = None) -> list[dict[str, Any]]:
    if isinstance(blob, list):
        return _normalize_inventory_records(
            [entry for entry in blob if isinstance(entry, dict)],
            source_url=source_url,
        )

    if isinstance(blob, dict):
        for key in ("items", "vehicles", "inventory", "results", "data"):
            value = blob.get(key)
            if isinstance(value, list):
                return _normalize_inventory_records(
                    [entry for entry in value if isinstance(entry, dict)],
                    source_url=source_url,
                )
        return _normalize_inventory_records([blob], source_url=source_url)

    return []


def _read_vehicle_assets_cache(vin: str) -> dict[str, Any]:
    clean_vin = str(vin or "").strip().upper()
    if not clean_vin:
        return {}
    cache_path = _vehicle_assets_cache_path(clean_vin)
    cached = _safe_read_json(cache_path, {})
    return cached if isinstance(cached, dict) else {}


def _merge_cached_vehicle_assets(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for item in items:
        row = dict(item)
        cached = _read_vehicle_assets_cache(str(row.get("vin") or ""))
        photos = cached.get("photos")
        if isinstance(photos, list) and photos:
            row["photos"] = photos
        for key in ("sticker_url", "carfax_url", "main_photo", "photos_count"):
            value = cached.get(key)
            if value not in (None, "", [], {}):
                row[key] = value
        merged.append(row)
    return merged


def _load_inventory_candidates() -> list[dict[str, Any]]:
    manual_items = _load_manual_inventory()
    for path in [INVENTORY_LIVE_CACHE_PATH, INVENTORY_SNAPSHOT_PATH]:
        normalized = _normalize_inventory_blob(_safe_read_json(path, []))
        if normalized:
            return _merge_cached_vehicle_assets(_merge_inventory_sources(normalized, manual_items))

    latest_by_vin: dict[str, dict[str, Any]] = {}
    for post in _load_runtime_posts():
        vin = str(post.get("vin", "")).strip().upper()
        if not vin:
            continue
        if vin in latest_by_vin:
            continue
        latest_by_vin[vin] = {
            "vin": vin,
            "title": post.get("title"),
            "price": post.get("price"),
            "mileage": post.get("mileage"),
            "drivetrain": post.get("drivetrain"),
            "engine": post.get("engine"),
            "transmission": post.get("transmission"),
            "location": post.get("location"),
            "detail_url": post.get("detail_url"),
            "photos": [],
            "status_label": "Ready",
        }
    return _merge_cached_vehicle_assets(_merge_inventory_sources(list(latest_by_vin.values()), manual_items))


def _fetch_live_inventory_records(*, source_url: str, timeout_seconds: int) -> dict[str, Any]:
    with httpx.Client(
        timeout=float(timeout_seconds),
        follow_redirects=True,
        headers={
            "user-agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        },
    ) as client:
        response = client.get(source_url)

    content_type = str(response.headers.get("content-type", "")).lower()
    diagnostics: list[str] = [f"http_status={response.status_code}", f"content_type={content_type}"]

    if response.status_code >= 400:
        if response.status_code in {401, 403}:
            proxy_payload = _fetch_live_inventory_records_via_proxy_markdown(
                source_url=source_url,
                timeout_seconds=timeout_seconds,
            )
            diagnostics.extend(list(proxy_payload.get("diagnostics") or []))
            proxy_records = list(proxy_payload.get("items") or [])
            normalized_proxy = _normalize_inventory_records(proxy_records, source_url=source_url)
            diagnostics.append(f"normalized_records={len(normalized_proxy)}")
            if normalized_proxy:
                return {
                    "source_url": source_url,
                    "fetched_at": proxy_payload.get("fetched_at") or datetime.now(timezone.utc).isoformat(),
                    "items": normalized_proxy,
                    "items_count": len(normalized_proxy),
                    "diagnostics": diagnostics,
                }
            browser_payload = _fetch_live_inventory_records_via_browser_html(
                source_url=source_url,
                timeout_seconds=timeout_seconds,
            )
            diagnostics.extend(list(browser_payload.get("diagnostics") or []))
            browser_records = list(browser_payload.get("items") or [])
            normalized_browser = _normalize_inventory_records(browser_records, source_url=source_url)
            diagnostics.append(f"browser_normalized_records={len(normalized_browser)}")
            if normalized_browser:
                return {
                    "source_url": source_url,
                    "fetched_at": browser_payload.get("fetched_at") or datetime.now(timezone.utc).isoformat(),
                    "items": normalized_browser,
                    "items_count": len(normalized_browser),
                    "diagnostics": diagnostics,
                }
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Dealership inventory source returned a non-success HTTP status",
                "source_url": source_url,
                "status_code": response.status_code,
                "diagnostics": diagnostics,
            },
        )

    if "json" in content_type:
        payload = response.json()
        raw_records = _extract_inventory_dicts_from_payload(payload)
        diagnostics.append(f"payload_records={len(raw_records)}")
    else:
        html_text = response.text
        raw_records, html_notes = _extract_inventory_dicts_from_html(html_text)
        diagnostics.extend(html_notes)

    normalized = _normalize_inventory_records(raw_records, source_url=source_url)
    diagnostics.append(f"normalized_records={len(normalized)}")
    return {
        "source_url": source_url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "items": normalized,
        "items_count": len(normalized),
        "diagnostics": diagnostics,
    }


def _persist_inventory_live_cache(
    *,
    source_url: str,
    fetched_at: str,
    items: list[dict[str, Any]],
    diagnostics: list[str],
) -> None:
    _safe_write_json(INVENTORY_LIVE_CACHE_PATH, items)
    _safe_write_json(
        INVENTORY_LIVE_META_PATH,
        {
            "source_url": source_url,
            "fetched_at": fetched_at,
            "items_count": len(items),
            "diagnostics": diagnostics,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )


def _inventory_source_status() -> dict[str, Any]:
    live_payload = _safe_read_json(INVENTORY_LIVE_CACHE_PATH, [])
    snapshot_payload = _safe_read_json(INVENTORY_SNAPSHOT_PATH, [])
    meta = _safe_read_json(INVENTORY_LIVE_META_PATH, {})

    live_items = _normalize_inventory_blob(live_payload)
    snapshot_items = _normalize_inventory_blob(snapshot_payload)

    source = "runtime_posts"
    if live_items:
        source = "live_cache"
    elif snapshot_items:
        source = "snapshot"

    return {
        "configured_url": _default_inventory_source_url(),
        "active_source": source,
        "live_cache_path": str(INVENTORY_LIVE_CACHE_PATH),
        "snapshot_path": str(INVENTORY_SNAPSHOT_PATH),
        "live_cache_exists": INVENTORY_LIVE_CACHE_PATH.exists(),
        "snapshot_exists": INVENTORY_SNAPSHOT_PATH.exists(),
        "live_cache_count": len(live_items),
        "snapshot_count": len(snapshot_items),
        "last_synced_at": meta.get("fetched_at") if isinstance(meta, dict) else None,
        "last_source_url": meta.get("source_url") if isinstance(meta, dict) else None,
        "last_sync_diagnostics": meta.get("diagnostics") if isinstance(meta, dict) else None,
    }


def _sync_live_inventory(
    *,
    source_url: str | None,
    timeout_seconds: int,
    persist: bool,
) -> dict[str, Any]:
    target_sources = _split_inventory_source_urls(source_url) or _default_inventory_source_urls()
    fetched_payloads: list[dict[str, Any]] = []
    diagnostics: list[str] = []
    errors: list[dict[str, Any]] = []

    for target_source in target_sources:
        try:
            fetched = _fetch_live_inventory_records(
                source_url=target_source,
                timeout_seconds=timeout_seconds,
            )
            fetched_payloads.append(fetched)
            diagnostics.extend([f"{target_source}: {item}" for item in list(fetched.get("diagnostics") or [])])
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            errors.append({"source_url": target_source, "detail": detail})
            diagnostics.append(f"{target_source}: error={detail}")
        except Exception as exc:
            errors.append({"source_url": target_source, "error": str(exc)})
            diagnostics.append(f"{target_source}: error={exc}")

    if not fetched_payloads:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Failed to fetch every dealership inventory source",
                "source_urls": target_sources,
                "errors": errors,
            },
        )

    merged_items = _merge_inventory_sources(
        [
            item
            for fetched in fetched_payloads
            for item in list(fetched.get("items") or [])
            if isinstance(item, dict)
        ],
        [],
    )
    fetched_at = datetime.now(timezone.utc).isoformat()
    joined_source = ", ".join(target_sources)

    if persist and merged_items:
        _persist_inventory_live_cache(
            source_url=joined_source,
            fetched_at=fetched_at,
            items=merged_items,
            diagnostics=diagnostics,
        )

    return {
        "ok": bool(merged_items),
        "source_url": joined_source,
        "source_urls": target_sources,
        "fetched_at": fetched_at,
        "items_count": len(merged_items),
        "items": merged_items,
        "persisted": bool(persist and merged_items),
        "diagnostics": diagnostics,
        "errors": errors,
        "source_status": _inventory_source_status(),
    }


def _load_manual_inventory() -> list[dict[str, Any]]:
    payload = _safe_read_json(INVENTORY_MANUAL_PATH, {"items": []})
    if isinstance(payload, dict):
        source_items = payload.get("items", [])
    else:
        source_items = payload
    if not isinstance(source_items, list):
        source_items = []
    return _normalize_inventory_blob(source_items)


def _merge_inventory_sources(
    base_items: list[dict[str, Any]],
    manual_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged_by_key: dict[str, dict[str, Any]] = {}
    order: list[str] = []

    def _put(item: dict[str, Any]) -> None:
        vin = str(item.get("vin", "")).strip().upper()
        key = vin if vin and vin != "UNKNOWN" else str(item.get("detail_url") or item.get("title") or "")
        key = key.strip().lower()
        if not key:
            return
        if key not in merged_by_key:
            order.append(key)
        merged_by_key[key] = item

    for entry in base_items:
        _put(entry)
    for entry in manual_items:
        _put(entry)

    return [merged_by_key[key] for key in order]


def _load_facebook_post_status() -> dict[str, dict[str, Any]]:
    payload = _safe_read_json(FACEBOOK_POST_STATUS_PATH, {"posts": {}})
    if not isinstance(payload, dict):
        return {}
    posts = payload.get("posts", {})
    if not isinstance(posts, dict):
        return {}
    normalized: dict[str, dict[str, Any]] = {}
    for key, value in posts.items():
        if not isinstance(value, dict):
            continue
        vin = str(key or "").strip().upper()
        if not vin:
            continue
        normalized[vin] = value
    return normalized


def _save_facebook_post_status(posts: dict[str, dict[str, Any]]) -> None:
    _safe_write_json(
        FACEBOOK_POST_STATUS_PATH,
        {
            "posts": posts,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )


def _mark_vehicle_posted(
    *,
    vin: str,
    mode: str,
    status_label: str = "Posted",
    detail: str | None = None,
) -> None:
    clean_vin = str(vin or "").strip().upper()
    if not clean_vin:
        return
    posts = _load_facebook_post_status()
    posts[clean_vin] = {
        "posted": True,
        "posted_status": status_label,
        "posted_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "detail": detail,
    }
    _save_facebook_post_status(posts)


def _enrich_inventory_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    status_map = _load_facebook_post_status()
    enriched: list[dict[str, Any]] = []
    for item in items:
        row = dict(item)
        vin = str(row.get("vin", "")).strip().upper()
        state = status_map.get(vin, {})
        posted = bool(state.get("posted"))
        row["posted"] = posted
        row["posted_status"] = state.get("posted_status") if posted else "Not Posted"
        row["posted_at"] = state.get("posted_at")
        enriched.append(row)
    return enriched


def _find_vehicle_by_vin(vin: str) -> dict[str, Any] | None:
    clean_vin = str(vin or "").strip().upper()
    if not clean_vin:
        return None
    return next(
        (
            item
            for item in _load_inventory_candidates()
            if str(item.get("vin", "")).strip().upper() == clean_vin
        ),
        None,
    )


def _vehicle_assets_cache_path(vin: str) -> Path:
    clean_vin = re.sub(r"[^A-Z0-9]", "", str(vin or "").upper()) or "UNKNOWN"
    VEHICLE_ASSETS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return VEHICLE_ASSETS_CACHE_DIR / f"{clean_vin}.json"


def _extract_asset_links_from_html(html_text: str, *, base_url: str | None = None) -> dict[str, str | None]:
    hrefs = re.findall(
        r"""(?:href|src)\s*=\s*["']([^"']+)["']""",
        html_text,
        flags=re.IGNORECASE,
    )
    absolute_candidates: list[str] = []
    seen: set[str] = set()
    for href in hrefs:
        candidate = html.unescape(href.strip())
        if not candidate:
            continue
        if candidate.startswith("//"):
            candidate = f"https:{candidate}"
        elif base_url and candidate.startswith("/"):
            candidate = urljoin(base_url, candidate)
        lowered = candidate.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        absolute_candidates.append(candidate)

    sticker_url = next(
        (
            url
            for url in absolute_candidates
            if ("sticker" in url.lower() or "monroney" in url.lower())
            and (url.lower().startswith("http://") or url.lower().startswith("https://"))
        ),
        None,
    )
    carfax_url = next(
        (
            url
            for url in absolute_candidates
            if "carfax" in url.lower()
            and (url.lower().startswith("http://") or url.lower().startswith("https://"))
        ),
        None,
    )
    return {"sticker_url": sticker_url, "carfax_url": carfax_url}


def _build_browser_options() -> Any:
    chrome_binary = _find_chrome_binary()
    if webdriver is None or ChromeService is None or not chrome_binary:
        return None

    chrome_options = webdriver.ChromeOptions()
    chrome_options.binary_location = str(chrome_binary)
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1600,1200")
    chrome_options.add_argument("--disable-background-networking")
    chrome_options.add_argument("--disable-notifications")
    chrome_options.add_argument("--blink-settings=imagesEnabled=false")
    chrome_options.page_load_strategy = "eager"
    return chrome_options


def _open_headless_browser(timeout_seconds: float = 18.0) -> Any:
    if webdriver is None or ChromeService is None:
        raise RuntimeError("selenium_unavailable")
    chromedriver = _find_chromedriver()
    if not chromedriver:
        raise RuntimeError("chromedriver_missing")
    chrome_options = _build_browser_options()
    if chrome_options is None:
        raise RuntimeError("chrome_binary_missing")

    driver = webdriver.Chrome(
        service=ChromeService(executable_path=str(chromedriver)),
        options=chrome_options,
    )
    driver.set_page_load_timeout(max(10, int(timeout_seconds)))
    return driver


def _fetch_live_inventory_records_via_browser_html(
    *,
    source_url: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    notes: list[str] = ["source_mode=browser_html"]
    driver = None
    records: list[dict[str, Any]] = []

    try:
        driver = _open_headless_browser(timeout_seconds=max(18.0, float(timeout_seconds)))
        driver.get(source_url)
        time.sleep(6)

        anchors = driver.find_elements(
            By.XPATH,
            "//a[contains(@href,'/used/') and normalize-space(.)!='' and not(contains(normalize-space(.), 'Details'))]",
        )
        seen: set[str] = set()
        for anchor in anchors:
            try:
                detail_url = str(anchor.get_attribute("href") or "").strip()
                title = str(anchor.text or "").strip()
                if not detail_url or not title:
                    continue
                key = detail_url.lower()
                if key in seen:
                    continue
                seen.add(key)

                card = anchor.find_element(By.XPATH, "ancestor::li[contains(@class,'vehicle-card')][1]")
                card_text = str(card.text or "").strip()
                price_match = re.search(r"\$([0-9,]+)", card_text)
                mileage_match = re.search(r"([0-9][0-9,]{0,9})\s+miles", card_text, flags=re.IGNORECASE)
                photo_urls = _dedupe_urls(
                    [
                        src
                        for image in card.find_elements(By.TAG_NAME, "img")
                        if (src := image.get_attribute("src"))
                        and "pictures.dealer.com" in str(src).lower()
                    ]
                )
                records.append(
                    {
                        "vin": _synthetic_vin_from_detail_url(detail_url),
                        "title": title,
                        "price": int(price_match.group(1).replace(",", "")) if price_match else None,
                        "mileage": int(mileage_match.group(1).replace(",", "")) if mileage_match else None,
                        "detail_url": detail_url,
                        "photos": photo_urls,
                        "status_label": "In Stock",
                    }
                )
            except Exception:
                continue
        notes.append(f"browser_listing_records={len(records)}")
    except Exception as exc:
        notes.append(f"browser_html_error={exc}")
        return {
            "source_url": source_url,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "items": [],
            "items_count": 0,
            "diagnostics": notes,
        }
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass

    records, detail_notes = _enrich_inventory_records_from_proxy_detail_pages(
        records,
        timeout_seconds=timeout_seconds,
    )
    notes.extend(detail_notes)
    return {
        "source_url": source_url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "items": records,
        "items_count": len(records),
        "diagnostics": notes,
    }


def _fetch_vehicle_asset_bundle_from_browser(
    *,
    detail_url: str,
    timeout_seconds: float = 18.0,
) -> dict[str, Any]:
    if webdriver is None or ChromeService is None:
        return {"ok": False, "error": "selenium_unavailable"}

    driver = None
    try:
        driver = _open_headless_browser(timeout_seconds=timeout_seconds)
        driver.get(detail_url)
        time.sleep(2)
        html_text = driver.page_source
        links = _extract_asset_links_from_html(html_text, base_url=detail_url)
        photos = _extract_vehicle_photo_urls_from_html(html_text, base_url=detail_url)
        return {
            "ok": True,
            "source_mode": "browser_html",
            "current_url": driver.current_url,
            "page_title": driver.title,
            "photos": photos,
            "photos_count": len(photos),
            "main_photo": photos[0] if photos else None,
            "sticker_url": links.get("sticker_url"),
            "carfax_url": links.get("carfax_url"),
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "source_mode": "browser_html",
        }
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass


def _load_vehicle_assets(vin: str, *, refresh: bool = False) -> dict[str, Any]:
    clean_vin = str(vin or "").strip().upper()
    if not clean_vin:
        raise HTTPException(status_code=400, detail={"message": "vin is required"})

    vehicle = _find_vehicle_by_vin(clean_vin)
    if not vehicle:
        raise HTTPException(status_code=404, detail={"message": f"Vehicle not found for VIN {clean_vin}"})

    cache_path = _vehicle_assets_cache_path(clean_vin)
    if cache_path.exists() and not refresh:
        cached = _safe_read_json(cache_path, {})
        if isinstance(cached, dict) and cached.get("vin") == clean_vin:
            return cached

    photos = vehicle.get("photos") if isinstance(vehicle.get("photos"), list) else []
    detail_url = vehicle.get("detail_url")
    payload: dict[str, Any] = {
        "vin": clean_vin,
        "detail_url": detail_url,
        "photos": photos,
        "photos_count": len(photos),
        "main_photo": photos[0] if photos else None,
        "sticker_url": None,
        "carfax_url": None,
        "loaded_at": datetime.now(timezone.utc).isoformat(),
    }

    if detail_url and isinstance(detail_url, str):
        browser_bundle = _fetch_vehicle_asset_bundle_from_browser(detail_url=detail_url)
        if browser_bundle.get("ok"):
            payload["detail_source_mode"] = browser_bundle.get("source_mode")
            payload["photos"] = list(browser_bundle.get("photos") or payload["photos"])
            payload["photos_count"] = len(payload["photos"])
            payload["main_photo"] = payload["photos"][0] if payload["photos"] else None
            payload["sticker_url"] = browser_bundle.get("sticker_url")
            payload["carfax_url"] = browser_bundle.get("carfax_url")
            payload["detail_fetch_url"] = browser_bundle.get("current_url")
            payload["detail_page_title"] = browser_bundle.get("page_title")
        else:
            payload["detail_fetch_error"] = browser_bundle.get("error")
        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(detail_url)
            if response.status_code < 400:
                links = _extract_asset_links_from_html(response.text, base_url=detail_url)
                if not payload.get("sticker_url"):
                    payload["sticker_url"] = links.get("sticker_url")
                if not payload.get("carfax_url"):
                    payload["carfax_url"] = links.get("carfax_url")
                payload["detail_fetch_status"] = response.status_code
            else:
                payload["detail_fetch_status"] = response.status_code
        except Exception as exc:
            if not payload.get("detail_fetch_error"):
                payload["detail_fetch_error"] = str(exc)

    payload["photos"] = _dedupe_urls(
        [url for url in (_extract_photo_url(entry) for entry in (payload.get("photos") or [])) if url]
    )
    payload["photos_count"] = len(payload["photos"])
    payload["main_photo"] = payload["photos"][0] if payload["photos"] else None

    _safe_write_json(cache_path, payload)
    return payload


def _load_accounts() -> list[dict[str, Any]]:
    payload = _safe_read_json(FML_ACCOUNTS_PATH, {"accounts": []})
    accounts = payload.get("accounts", []) if isinstance(payload, dict) else []
    redacted: list[dict[str, Any]] = []
    for account in accounts:
        if not isinstance(account, dict):
            continue
        redacted.append(
            {
                "id": account.get("id"),
                "name": account.get("name"),
                "email": account.get("email"),
                "has_password": bool(account.get("password")),
            }
        )
    return redacted


def _load_accounts_full() -> list[dict[str, Any]]:
    payload = _safe_read_json(FML_ACCOUNTS_PATH, {"accounts": []})
    accounts = payload.get("accounts", []) if isinstance(payload, dict) else []
    return [entry for entry in accounts if isinstance(entry, dict)]


def _resolve_default_account_id() -> str | None:
    accounts = _load_accounts_full()
    preferred = next(
        (
            str(entry.get("id", "")).strip()
            for entry in accounts
            if str(entry.get("id", "")).strip() and entry.get("password")
        ),
        "",
    )
    if preferred:
        return preferred

    fallback = next(
        (str(entry.get("id", "")).strip() for entry in accounts if str(entry.get("id", "")).strip()),
        "",
    )
    return fallback or None


def _normalize_image_names(images: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in images:
        item = str(raw or "").strip()
        if not item:
            continue
        lowered = item.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(item)
    return normalized


def _list_facebook_images(limit: int = 200) -> tuple[list[str], int]:
    if not FML_IMAGES_DIR.exists():
        return [], 0
    allowed_ext = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
    candidates = [
        path.name
        for path in FML_IMAGES_DIR.iterdir()
        if path.is_file()
        and not path.name.startswith(".")
        and path.suffix.lower() in allowed_ext
    ]
    candidates.sort(key=str.casefold)
    return candidates[:limit], len(candidates)


def _suggest_images_for_vin(vin: str, limit: int = 20) -> list[str]:
    clean_vin = str(vin or "").strip().upper()
    if not clean_vin or not FML_IMAGES_DIR.exists():
        return []

    first8 = clean_vin[:8]
    last8 = clean_vin[-8:] if len(clean_vin) >= 8 else clean_vin

    scored: list[tuple[int, str]] = []
    for image_path in FML_IMAGES_DIR.iterdir():
        if not image_path.is_file():
            continue
        name = image_path.name
        lowered = name.lower()
        score = 0
        if clean_vin.lower() in lowered:
            score += 100
        if first8 and first8.lower() in lowered:
            score += 20
        if last8 and last8.lower() in lowered:
            score += 30
        if score > 0:
            scored.append((score, name))

    scored.sort(key=lambda item: (-item[0], item[1].casefold()))
    return [name for _, name in scored[:limit]]


def _extract_photo_url(item: Any) -> str | None:
    if isinstance(item, str):
        candidate = item.strip()
        return candidate if candidate.startswith(("http://", "https://")) else None
    if isinstance(item, dict):
        for key in ("url", "src", "image", "photo"):
            value = item.get(key)
            if isinstance(value, str):
                candidate = value.strip()
                if candidate.startswith(("http://", "https://")):
                    return candidate
    return None


def _collect_vehicle_photo_urls(vin: str) -> list[str]:
    clean_vin = str(vin or "").strip().upper()
    if not clean_vin:
        return []

    vehicle = next(
        (item for item in _load_inventory_candidates() if str(item.get("vin", "")).strip().upper() == clean_vin),
        None,
    )
    if not vehicle:
        return []

    def _collect_from_payload(payload: Any) -> list[str]:
        photos_raw = payload if isinstance(payload, list) else [payload]
        collected: list[str] = []
        seen: set[str] = set()
        for entry in photos_raw:
            url = _extract_photo_url(entry)
            if not url:
                continue
            lowered = url.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            collected.append(url)
        return collected

    cached = _read_vehicle_assets_cache(clean_vin)
    cached_photos = _collect_from_payload(cached.get("photos"))
    if cached_photos:
        return cached_photos

    inventory_photos = _collect_from_payload(vehicle.get("photos") or vehicle.get("images") or [])
    if inventory_photos:
        return inventory_photos

    try:
        assets = _load_vehicle_assets(clean_vin, refresh=False)
    except Exception:
        return []
    return _collect_from_payload(assets.get("photos"))


def _image_extension_from_url_and_content_type(url: str, content_type: str | None) -> str:
    path_ext = Path(urlparse(url).path).suffix.lower()
    if path_ext in {".jpg", ".jpeg", ".png", ".webp"}:
        return ".jpg" if path_ext == ".jpeg" else path_ext

    value = (content_type or "").lower()
    if "png" in value:
        return ".png"
    if "webp" in value:
        return ".webp"
    return ".jpg"


def _import_vehicle_images(
    *,
    vin: str,
    limit: int,
    overwrite: bool = False,
) -> dict[str, Any]:
    clean_vin = str(vin or "").strip().upper()
    urls = _collect_vehicle_photo_urls(clean_vin)
    if not urls:
        raise HTTPException(
            status_code=404,
            detail={
                "message": f"No source photo URLs found for VIN {clean_vin}",
                "vin": clean_vin,
            },
        )

    FML_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    imported: list[str] = []
    skipped_existing: list[str] = []
    errors: list[str] = []

    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        for index, url in enumerate(urls[:limit], start=1):
            try:
                response = client.get(url)
                if response.status_code >= 400:
                    raise RuntimeError(f"HTTP {response.status_code}")

                extension = _image_extension_from_url_and_content_type(
                    url,
                    response.headers.get("content-type"),
                )
                filename = f"{clean_vin}_{index:02d}{extension}"
                target = FML_IMAGES_DIR / filename

                if target.exists() and not overwrite:
                    skipped_existing.append(filename)
                    continue

                target.write_bytes(response.content)
                imported.append(filename)
            except Exception as exc:
                errors.append(f"{url} -> {exc}")

    return {
        "ok": len(errors) == 0,
        "vin": clean_vin,
        "source_urls_found": len(urls),
        "attempted": min(limit, len(urls)),
        "imported_count": len(imported),
        "imported": imported,
        "skipped_existing_count": len(skipped_existing),
        "skipped_existing": skipped_existing,
        "errors_count": len(errors),
        "errors": errors,
    }


def _seed_placeholder_images_for_vin(
    *,
    vin: str,
    count: int,
    overwrite: bool = False,
) -> dict[str, Any]:
    clean_vin = str(vin or "").strip().upper()
    if not clean_vin:
        raise HTTPException(status_code=400, detail={"message": "vin is required"})

    FML_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zk1YAAAAASUVORK5CYII="
    image_bytes = base64.b64decode(png_base64)

    created: list[str] = []
    skipped_existing: list[str] = []
    for index in range(1, max(1, int(count)) + 1):
        name = f"{clean_vin}_{index:02d}.png"
        target = FML_IMAGES_DIR / name
        if target.exists() and not overwrite:
            skipped_existing.append(name)
            continue
        target.write_bytes(image_bytes)
        created.append(name)

    return {
        "ok": True,
        "vin": clean_vin,
        "created_count": len(created),
        "created": created,
        "skipped_existing_count": len(skipped_existing),
        "skipped_existing": skipped_existing,
    }


def _relink_images_to_vin(
    *,
    vin: str,
    images: list[str],
    include_vin_matches: bool = False,
    overwrite: bool = False,
    delete_source: bool = False,
) -> dict[str, Any]:
    clean_vin = str(vin or "").strip().upper()
    if not clean_vin:
        raise HTTPException(status_code=400, detail={"message": "vin is required"})

    FML_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    source_names = _normalize_image_names(images)
    if include_vin_matches:
        source_names = _normalize_image_names(
            source_names + _suggest_images_for_vin(vin=clean_vin, limit=200)
        )

    if not source_names:
        all_images, _ = _list_facebook_images(limit=2000)
        source_names = all_images

    if not source_names:
        return {
            "ok": False,
            "vin": clean_vin,
            "message": "No source images found to relink",
            "linked_count": 0,
            "linked": [],
            "missing_count": 0,
            "missing": [],
            "skipped_existing_count": 0,
            "skipped_existing": [],
            "already_linked_count": 0,
            "already_linked": [],
            "errors_count": 0,
            "errors": [],
        }

    linked: list[str] = []
    missing: list[str] = []
    skipped_existing: list[str] = []
    already_linked: list[str] = []
    errors: list[str] = []

    target_index = 1
    for source_name in source_names:
        source_path = FML_IMAGES_DIR / source_name
        if not source_path.exists() or not source_path.is_file():
            missing.append(source_name)
            continue

        extension = source_path.suffix.lower() or ".jpg"
        if extension == ".jpeg":
            extension = ".jpg"
        target_name = f"{clean_vin}_{target_index:02d}{extension}"
        target_index += 1
        target_path = FML_IMAGES_DIR / target_name

        if source_path.name.lower() == target_name.lower():
            already_linked.append(source_path.name)
            linked.append(target_name)
            continue

        if target_path.exists() and not overwrite:
            skipped_existing.append(target_name)
            continue

        try:
            if delete_source:
                if target_path.exists():
                    target_path.unlink()
                source_path.rename(target_path)
            else:
                shutil.copy2(source_path, target_path)
            linked.append(target_name)
        except Exception as exc:
            errors.append(f"{source_name} -> {exc}")

    return {
        "ok": len(errors) == 0,
        "vin": clean_vin,
        "linked_count": len(linked),
        "linked": linked,
        "missing_count": len(missing),
        "missing": missing,
        "skipped_existing_count": len(skipped_existing),
        "skipped_existing": skipped_existing,
        "already_linked_count": len(already_linked),
        "already_linked": already_linked,
        "errors_count": len(errors),
        "errors": errors,
    }


def _find_chromedriver() -> Path | None:
    if not FML_DRIVERS_DIR.exists():
        return None
    direct = FML_DRIVERS_DIR / "chromedriver.exe"
    if direct.exists():
        return direct
    for candidate in FML_DRIVERS_DIR.glob("chromedriver*"):
        if candidate.is_file():
            return candidate
    return None


def _find_chrome_binary() -> Path | None:
    env_binary = str(os.getenv("CHROME_BINARY", "")).strip()
    if env_binary:
        candidate = Path(env_binary)
        if candidate.exists():
            return candidate

    local_candidates = [
        FML_DIR / "chrome-for-testing" / "chrome-win64" / "chrome.exe",
        FML_DIR / "chrome-114" / "chrome-win64" / "chrome.exe",
        FML_DIR / "chrome-win64" / "chrome.exe",
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    ]
    for candidate in local_candidates:
        if candidate.exists():
            return candidate

    for command in ("chrome.exe", "chrome"):
        resolved = shutil.which(command)
        if resolved:
            return Path(resolved)
    return None


def _chromedriver_details(chromedriver: Path | None) -> dict[str, Any]:
    if not chromedriver:
        return {
            "found": False,
            "path": None,
            "version": None,
            "error": None,
        }

    details: dict[str, Any] = {
        "found": True,
        "path": str(chromedriver),
        "version": None,
        "error": None,
    }
    try:
        completed = subprocess.run(
            [str(chromedriver), "--version"],
            capture_output=True,
            text=True,
            check=False,
            timeout=3,
        )
        output = (completed.stdout or completed.stderr or "").strip()
        if completed.returncode == 0 and output:
            details["version"] = output.splitlines()[0].strip()
        elif output:
            details["error"] = output.splitlines()[0].strip()
        else:
            details["error"] = f"chromedriver exited with code {completed.returncode}"
    except Exception as exc:
        details["error"] = str(exc)

    return details


def _chrome_binary_details(binary: Path | None) -> dict[str, Any]:
    if not binary:
        return {
            "found": False,
            "path": None,
            "version": None,
            "error": None,
        }

    details: dict[str, Any] = {
        "found": True,
        "path": str(binary),
        "version": None,
        "error": None,
    }
    try:
        completed = subprocess.run(
            [str(binary), "--version"],
            capture_output=True,
            text=True,
            check=False,
            timeout=3,
        )
        output = (completed.stdout or completed.stderr or "").strip()
        if completed.returncode == 0 and output:
            details["version"] = output.splitlines()[0].strip()
        elif output:
            details["error"] = output.splitlines()[0].strip()
        else:
            details["error"] = f"chrome exited with code {completed.returncode}"
    except Exception as exc:
        details["error"] = str(exc)

    return details


def _bootstrap_facebook_lister(
    *,
    create_template_account_if_missing: bool = True,
) -> dict[str, Any]:
    created_dirs: list[str] = []
    created_files: list[str] = []

    for path in [FML_DIR, FML_IMAGES_DIR, FML_DRIVERS_DIR, FML_DIR / "jobs"]:
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            created_dirs.append(str(path))

    if create_template_account_if_missing and not FML_ACCOUNTS_PATH.exists():
        template = {
            "accounts": [
                {
                    "id": "REPLACE_WITH_FACEBOOK_ACCOUNT_ID",
                    "name": "Replace Me",
                    "email": "you@example.com",
                    "password": "",
                }
            ]
        }
        FML_ACCOUNTS_PATH.write_text(
            json.dumps(template, indent=2),
            encoding="utf-8",
        )
        created_files.append(str(FML_ACCOUNTS_PATH))

    for marker_dir in [FML_IMAGES_DIR, FML_DRIVERS_DIR]:
        marker = marker_dir / ".keep"
        if not marker.exists():
            marker.write_text("", encoding="utf-8")
            created_files.append(str(marker))

    return {
        "ok": True,
        "created_dirs": created_dirs,
        "created_files": created_files,
        "live_requirements": _live_requirements_status(),
    }


def _live_requirements_status() -> dict[str, Any]:
    accounts = _load_accounts_full()
    accounts_with_password = [
        entry for entry in accounts if str(entry.get("id", "")).strip() and entry.get("password")
    ]
    chromedriver = _find_chromedriver()
    chromedriver_details = _chromedriver_details(chromedriver)
    chrome_binary = _find_chrome_binary()
    chrome_binary_details = _chrome_binary_details(chrome_binary)
    return {
        "accounts_file_exists": FML_ACCOUNTS_PATH.exists(),
        "images_dir_exists": FML_IMAGES_DIR.exists(),
        "drivers_dir_exists": FML_DRIVERS_DIR.exists(),
        "chromedriver_found": bool(chromedriver_details.get("found")),
        "chromedriver_path": chromedriver_details.get("path"),
        "chromedriver_version": chromedriver_details.get("version"),
        "chromedriver_error": chromedriver_details.get("error"),
        "chrome_binary_found": bool(chrome_binary_details.get("found")),
        "chrome_binary_path": chrome_binary_details.get("path"),
        "chrome_binary_version": chrome_binary_details.get("version"),
        "chrome_binary_error": chrome_binary_details.get("error"),
        "accounts_with_password": len(accounts_with_password),
    }


def _sales_backend_base_url() -> str:
    raw = str(
        os.getenv("SALES_ASSISTANT_BACKEND_URL", DEFAULT_SALES_ASSISTANT_BACKEND_URL)
    ).strip()
    return raw.rstrip("/") or DEFAULT_SALES_ASSISTANT_BACKEND_URL


def _sales_backend_request(
    method: str,
    path: str,
    *,
    json_payload: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    base_url = _sales_backend_base_url()
    target_url = f"{base_url}{path}"

    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.request(method=method, url=target_url, json=json_payload)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Sales-assistant backend is unreachable",
                "backend_url": base_url,
                "error": str(exc),
            },
        ) from exc

    try:
        payload: Any = response.json()
    except ValueError:
        payload = {"raw": (response.text or "").strip()}

    return response.status_code, payload


def _sales_backend_proxy(
    method: str,
    path: str,
    *,
    json_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    status_code, payload = _sales_backend_request(method, path, json_payload=json_payload)
    if status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={
                "message": f"Sales-assistant backend returned HTTP {status_code}",
                "backend_url": _sales_backend_base_url(),
                "backend_path": path,
                "backend_response": payload,
            },
        )
    if isinstance(payload, dict):
        return payload
    return {"payload": payload}


def _sales_assistant_health_status() -> dict[str, Any]:
    health: dict[str, Any] = {
        "ok": False,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "backend_url": _sales_backend_base_url(),
        "reachable": False,
        "backend_status": None,
        "banks_count": 0,
        "factors_status": None,
        "factors_total_banks": None,
    }

    try:
        banks_status, banks_payload = _sales_backend_request("GET", "/api/banks")
    except HTTPException as exc:
        health["error"] = exc.detail
        return health

    health["reachable"] = True
    health["backend_status"] = banks_status

    if banks_status >= 400:
        health["error"] = {
            "message": "Sales-assistant banks endpoint returned an error",
            "backend_status": banks_status,
            "backend_response": banks_payload,
        }
        return health

    policies = banks_payload.get("policies") if isinstance(banks_payload, dict) else None
    if isinstance(policies, list):
        health["banks_count"] = len(policies)

    try:
        factors_status, factors_payload = _sales_backend_request("GET", "/api/banks/factors")
        health["factors_status"] = factors_status
        if factors_status >= 400:
            health["factors_error"] = {
                "message": "Sales-assistant bank factors endpoint returned an error",
                "backend_status": factors_status,
                "backend_response": factors_payload,
            }
        elif isinstance(factors_payload, dict):
            total_banks = factors_payload.get("totalBanks")
            if isinstance(total_banks, int):
                health["factors_total_banks"] = total_banks
    except HTTPException as exc:
        health["factors_error"] = exc.detail

    health["ok"] = (
        health["reachable"]
        and (health.get("backend_status") or 0) < 400
        and (health.get("factors_status") or 0) < 400
        and not health.get("factors_error")
    )
    return health


def _iter_bank_doc_files() -> list[Path]:
    allowed = {".pdf", ".docx", ".doc", ".xlsx", ".xlsm", ".xls", ".csv", ".htm", ".html", ".txt"}
    if not BANK_DOCS_ROOT.exists():
        return []
    return sorted(
        path
        for path in BANK_DOCS_ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() in allowed and not path.name.startswith(".")
    )


def _routeone_docs_status() -> dict[str, Any]:
    doc_files = _iter_bank_doc_files()
    index_payload = _safe_read_json(BANK_DOCS_INDEX_PATH, {})
    generated_payload = _safe_read_json(BANK_PROFILES_GENERATED_PATH, {})
    sales_payload = _safe_read_json(SALES_ASSISTANT_BANKS_PATH, {})

    generated_profiles = generated_payload.get("profiles") if isinstance(generated_payload, dict) else None
    sales_policies = sales_payload.get("policies") if isinstance(sales_payload, dict) else None
    decoded_documents = index_payload.get("documents") if isinstance(index_payload, dict) else None

    by_bank: dict[str, int] = {}
    for path in doc_files:
        try:
            bank = path.relative_to(BANK_DOCS_ROOT).parts[0]
        except Exception:
            bank = "_Inbox"
        by_bank[bank] = by_bank.get(bank, 0) + 1

    return {
        "ok": bool(doc_files) and bool(generated_profiles or sales_policies),
        "bank_docs_root": _display_path(BANK_DOCS_ROOT),
        "doc_count": len(doc_files),
        "docs_by_bank": dict(sorted(by_bank.items())),
        "decoded_index_exists": BANK_DOCS_INDEX_PATH.exists(),
        "decoded_doc_count": len(decoded_documents) if isinstance(decoded_documents, list) else 0,
        "generated_profiles_count": len(generated_profiles) if isinstance(generated_profiles, list) else 0,
        "sales_assistant_policies_count": len(sales_policies) if isinstance(sales_policies, list) else 0,
        "last_decoded_at": index_payload.get("generated_at") if isinstance(index_payload, dict) else None,
        "index_path": _display_path(BANK_DOCS_INDEX_PATH),
        "profiles_path": _display_path(BANK_PROFILES_GENERATED_PATH),
        "sales_banks_path": _display_path(SALES_ASSISTANT_BANKS_PATH),
    }


def _reload_sales_assistant_bank_data() -> dict[str, Any]:
    result: dict[str, Any] = {
        "ok": False,
        "banks_status": None,
        "factors_status": None,
        "error": None,
    }
    try:
        banks_status, banks_payload = _sales_backend_request("POST", "/api/banks/reload")
        factors_status, factors_payload = _sales_backend_request("POST", "/api/banks/factors/reload")
        result.update(
            {
                "ok": banks_status < 400 and factors_status < 400,
                "banks_status": banks_status,
                "banks_response": banks_payload,
                "factors_status": factors_status,
                "factors_response": factors_payload,
            }
        )
    except HTTPException as exc:
        result["error"] = exc.detail
    return result


def _run_bank_docs_rebuild(
    *,
    reload_sales_data: bool,
    max_link_depth: int = 1,
    max_links_per_resource: int = 12,
) -> dict[str, Any]:
    command = [
        sys.executable,
        str(ROOT_DIR / "tools" / "rebuild_bank_brain.py"),
        "--bank-root",
        str(BANK_DOCS_ROOT),
        "--decoded-dir",
        str(BANK_DOCS_DECODED_DIR),
        "--index-path",
        str(BANK_DOCS_INDEX_PATH),
        "--profiles-path",
        str(BANK_PROFILES_GENERATED_PATH),
        "--sales-banks-path",
        str(SALES_ASSISTANT_BANKS_PATH),
        "--link-cache-dir",
        str(BANK_DOCS_LINK_CACHE_DIR),
        "--max-link-depth",
        str(max_link_depth),
        "--max-links-per-resource",
        str(max_links_per_resource),
        "--json",
    ]

    try:
        process = subprocess.run(
            command,
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            timeout=600,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(
            status_code=504,
            detail={
                "message": "Bank Brain rebuild timed out while decoding RouteOne documents",
                "timeout_seconds": 600,
                "stdout": exc.stdout,
                "stderr": exc.stderr,
            },
        ) from exc

    stdout = (process.stdout or "").strip()
    stderr = (process.stderr or "").strip()
    rebuild_payload: Any = None
    if stdout:
        try:
            rebuild_payload = json.loads(stdout)
        except ValueError:
            rebuild_payload = {"raw": stdout}

    acceptable_exit = process.returncode in {0, 2}
    sales_reload = _reload_sales_assistant_bank_data() if reload_sales_data else {"ok": None, "skipped": True}
    status = _routeone_docs_status()

    return {
        "ok": acceptable_exit and (not reload_sales_data or sales_reload.get("ok") or sales_reload.get("skipped")),
        "returncode": process.returncode,
        "had_decode_errors": process.returncode == 2,
        "rebuild": rebuild_payload,
        "stderr": stderr,
        "sales_reload": sales_reload,
        "status": status,
    }


def _unique_upload_target(directory: Path, filename: str) -> Path:
    stem = _sanitize_doc_segment(Path(filename).stem, "routeone_document")
    suffix = Path(filename).suffix.lower()
    if not suffix:
        suffix = ".pdf"
    candidate = directory / f"{stem}{suffix}"
    counter = 2
    while candidate.exists():
        candidate = directory / f"{stem}_{counter}{suffix}"
        counter += 1
    return candidate


def _stack_readiness_status() -> dict[str, Any]:
    live_requirements = _live_requirements_status()
    accounts_ready = bool(live_requirements.get("accounts_with_password", 0))
    live_ready = (
        bool(live_requirements.get("accounts_file_exists"))
        and bool(live_requirements.get("images_dir_exists"))
        and bool(live_requirements.get("drivers_dir_exists"))
        and bool(live_requirements.get("chromedriver_found"))
        and accounts_ready
    )

    stack_core_ready = (
        ADMIN_BUNDLE_INDEX.exists()
        and SALES_FRONTEND_INDEX.exists()
        and SALES_BACKEND_ENTRYPOINT.exists()
    )

    return {
        "ok": stack_core_ready,
        "ready_for_live_facebook_posting": live_ready,
        "components": {
            "admin_bundle_exists": ADMIN_BUNDLE_INDEX.exists(),
            "sales_frontend_bundle_exists": SALES_FRONTEND_INDEX.exists(),
            "sales_backend_entrypoint_exists": SALES_BACKEND_ENTRYPOINT.exists(),
            "sales_backend_url": _sales_backend_base_url(),
            "live_requirements": live_requirements,
        },
    }


def _validate_live_requirements(
    *,
    account_id: str | None,
    images: list[str],
) -> list[str]:
    errors: list[str] = []

    if not account_id:
        errors.append("account_id is required for live posting")

    accounts = _load_accounts_full()
    if not FML_ACCOUNTS_PATH.exists():
        errors.append(f"Missing accounts file: {FML_ACCOUNTS_PATH}")
    elif account_id:
        match = next(
            (entry for entry in accounts if str(entry.get("id", "")).strip() == account_id.strip()),
            None,
        )
        if not match:
            errors.append(f"account_id '{account_id}' was not found in accounts.json")
        elif not match.get("password"):
            errors.append(f"account_id '{account_id}' is missing password in accounts.json")

    if not images:
        errors.append("images list is required for live posting")
    if not FML_IMAGES_DIR.exists():
        errors.append(f"Missing images directory: {FML_IMAGES_DIR}")
    else:
        for image_name in images:
            clean = str(image_name).strip()
            if not clean:
                continue
            image_path = FML_IMAGES_DIR / clean
            if not image_path.exists():
                errors.append(
                    "Missing image file in facebook lister images directory: "
                    f"{image_path.name}"
                )

    chromedriver_path = _find_chromedriver()
    if not FML_DRIVERS_DIR.exists():
        errors.append(f"Missing drivers directory: {FML_DRIVERS_DIR}")
    elif not chromedriver_path:
        errors.append(
            "ChromeDriver was not found. Place chromedriver.exe in "
            "automation/facebook-marketplace-lister/drivers"
        )

    return errors


def _publish_live(payload: FacebookPostRequest) -> tuple[bool, str]:
    python_bin = ROOT_DIR / ".venv" / "Scripts" / "python.exe"
    helper_script = ROOT_DIR / "tools" / "facebook_publish.py"
    if not python_bin.exists():
        return False, "Python runtime missing at .venv/Scripts/python.exe"
    if not helper_script.exists():
        return False, "Missing tools/facebook_publish.py"

    requirement_errors = _validate_live_requirements(
        account_id=payload.account_id,
        images=payload.images,
    )
    if requirement_errors:
        return False, " | ".join(requirement_errors)

    request_file = RUNTIME_DIR / "live_publish_request.json"
    request_file.parent.mkdir(parents=True, exist_ok=True)
    request_file.write_text(payload.model_dump_json(indent=2), encoding="utf-8")

    cmd = [
        str(python_bin),
        str(helper_script),
        "--payload",
        str(request_file),
    ]
    completed = subprocess.run(
        cmd,
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        check=False,
    )
    output = (completed.stdout or "").strip()
    error_text = (completed.stderr or "").strip()
    if completed.returncode != 0:
        return False, error_text or output or f"publish command failed with code {completed.returncode}"
    return True, output or "live publish command completed"


def _run_live_preflight(
    *,
    account_id: str | None,
    images: list[str],
    vin: str | None = None,
) -> dict[str, Any]:
    normalized_images = [str(item).strip() for item in images if str(item).strip()]
    errors = _validate_live_requirements(
        account_id=account_id,
        images=normalized_images,
    )
    suggestions: list[str] = []
    if vin:
        suggestions = _suggest_images_for_vin(vin=vin, limit=20)

    warnings: list[str] = []
    if vin and not normalized_images and suggestions:
        warnings.append("No image filenames selected yet, but matching VIN image files were found.")

    return {
        "ok": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "account_id": account_id,
        "images_count": len(normalized_images),
        "vin": vin,
        "suggested_images": suggestions,
        "live_requirements": _live_requirements_status(),
    }


def _prepare_live_post(
    *,
    vin: str,
    account_id: str | None,
    import_missing_images: bool,
    image_limit: int,
    overwrite_images: bool,
) -> dict[str, Any]:
    clean_vin = str(vin or "").strip().upper()
    resolved_account_id = (account_id or "").strip() or _resolve_default_account_id()
    import_result: dict[str, Any] | None = None
    import_error: dict[str, Any] | None = None

    if import_missing_images:
        try:
            import_result = _import_vehicle_images(
                vin=clean_vin,
                limit=image_limit,
                overwrite=overwrite_images,
            )
        except HTTPException as exc:
            import_error = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}

    selected_images = _suggest_images_for_vin(vin=clean_vin, limit=image_limit)
    preflight = _run_live_preflight(
        account_id=resolved_account_id,
        images=selected_images,
        vin=clean_vin,
    )

    guidance: list[str] = []
    if not resolved_account_id:
        guidance.append("No usable account_id found. Add an account with id/password in accounts.json.")
    if not selected_images:
        guidance.append(
            "No image filenames selected. Import VIN photos or place image files in "
            "automation/facebook-marketplace-lister/images."
        )
    if not preflight.get("ok"):
        guidance.append("Resolve preflight errors shown below before publishing live.")
    if import_error and not preflight.get("ok"):
        guidance.append("Image import did not complete cleanly; review import_error details.")

    return {
        "ok": bool(preflight.get("ok")),
        "vin": clean_vin,
        "account_id": resolved_account_id,
        "selected_images": selected_images,
        "selected_images_count": len(selected_images),
        "import_result": import_result,
        "import_error": import_error,
        "preflight": preflight,
        "live_requirements": _live_requirements_status(),
        "guidance": guidance,
    }


def _resolve_repair_vin(explicit_vin: str | None) -> str:
    if explicit_vin and str(explicit_vin).strip():
        return str(explicit_vin).strip().upper()

    from_inventory = next(
        (
            str(item.get("vin", "")).strip().upper()
            for item in _load_inventory_candidates()
            if str(item.get("vin", "")).strip()
        ),
        "",
    )
    if from_inventory:
        return from_inventory

    from_posts = next(
        (
            str(item.get("vin", "")).strip().upper()
            for item in _load_runtime_posts()
            if str(item.get("vin", "")).strip()
        ),
        "",
    )
    if from_posts:
        return from_posts

    return "2C4RC1L78NR164218"


def _full_repair_and_relink(
    *,
    vin: str | None,
    ensure_placeholder_images: bool,
    placeholder_count: int,
) -> dict[str, Any]:
    target_vin = _resolve_repair_vin(vin)

    bootstrap = _bootstrap_facebook_lister(create_template_account_if_missing=True)

    placeholder_result: dict[str, Any] | None = None
    if ensure_placeholder_images and not _suggest_images_for_vin(vin=target_vin, limit=1):
        placeholder_result = _seed_placeholder_images_for_vin(
            vin=target_vin,
            count=placeholder_count,
            overwrite=False,
        )

    relink_result: dict[str, Any] | None = None
    if not _suggest_images_for_vin(vin=target_vin, limit=1):
        all_images, _ = _list_facebook_images(limit=2000)
        if all_images:
            relink_result = _relink_images_to_vin(
                vin=target_vin,
                images=all_images[:placeholder_count],
                include_vin_matches=False,
                overwrite=False,
                delete_source=False,
            )

    prepared = _prepare_live_post(
        vin=target_vin,
        account_id=None,
        import_missing_images=True,
        image_limit=max(placeholder_count, 6),
        overwrite_images=False,
    )
    stack = _stack_readiness_status()

    return {
        "ok": bool(prepared.get("ok")) and bool(stack.get("ready_for_live_facebook_posting")),
        "vin": target_vin,
        "bootstrap": bootstrap,
        "placeholder_result": placeholder_result,
        "relink_result": relink_result,
        "prepared": prepared,
        "stack_readiness": stack,
    }


def _wire_everything(
    *,
    vin: str | None,
    ensure_placeholder_images: bool,
    placeholder_count: int,
    reload_sales_data: bool,
) -> dict[str, Any]:
    target_vin = _resolve_repair_vin(vin)
    started_at = datetime.now(timezone.utc).isoformat()

    full_repair = _full_repair_and_relink(
        vin=target_vin,
        ensure_placeholder_images=ensure_placeholder_images,
        placeholder_count=placeholder_count,
    )
    prepared = full_repair.get("prepared") if isinstance(full_repair, dict) else {}
    if not isinstance(prepared, dict):
        prepared = {}

    sales_health_before = _sales_assistant_health_status()
    sales_reload: dict[str, Any] = {
        "requested": reload_sales_data,
        "performed": False,
        "banks_status": None,
        "factors_status": None,
        "banks_response": None,
        "factors_response": None,
        "error": None,
    }

    def _attempt_sales_reload(max_attempts: int = 3) -> dict[str, Any]:
        result: dict[str, Any] = {
            "requested": True,
            "performed": False,
            "banks_status": None,
            "factors_status": None,
            "banks_response": None,
            "factors_response": None,
            "error": None,
            "attempts": 0,
        }
        for attempt in range(1, max_attempts + 1):
            result["attempts"] = attempt
            try:
                banks_status, banks_payload = _sales_backend_request("POST", "/api/banks/reload")
                factors_status, factors_payload = _sales_backend_request(
                    "POST",
                    "/api/banks/factors/reload",
                )
                result.update(
                    {
                        "performed": True,
                        "banks_status": banks_status,
                        "factors_status": factors_status,
                        "banks_response": banks_payload,
                        "factors_response": factors_payload,
                        "error": None,
                    }
                )
                if banks_status < 400 and factors_status < 400:
                    return result
                result["error"] = {
                    "message": "Sales backend reload returned non-success status.",
                    "banks_status": banks_status,
                    "factors_status": factors_status,
                }
            except HTTPException as exc:
                result["error"] = exc.detail

            if attempt < max_attempts:
                time.sleep(0.7)
        return result

    if reload_sales_data:
        sales_reload = _attempt_sales_reload(max_attempts=3)

    sales_health_after = _sales_assistant_health_status()
    stack_after = _stack_readiness_status()
    finished_at = datetime.now(timezone.utc).isoformat()

    selected_images = prepared.get("selected_images") if isinstance(prepared, dict) else []
    if not isinstance(selected_images, list):
        selected_images = []
    account_id = prepared.get("account_id") if isinstance(prepared, dict) else None

    guidance: list[str] = []
    if not stack_after.get("ready_for_live_facebook_posting"):
        guidance.append("Live Facebook posting is still not fully ready. Check live_requirements.")
    if not prepared.get("ok"):
        guidance.append("Prepare live post did not fully pass. Resolve preflight issues before posting.")
    if reload_sales_data and not sales_health_after.get("ok"):
        guidance.append("Sales-assistant service is not healthy after reload. Check /api/sales-assistant/health.")
    if sales_reload.get("error"):
        guidance.append("Sales data reload reported an error.")

    ok = bool(prepared.get("ok")) and bool(stack_after.get("ready_for_live_facebook_posting"))
    if reload_sales_data:
        ok = ok and bool(sales_health_after.get("ok")) and not bool(sales_reload.get("error"))

    return {
        "ok": ok,
        "vin": target_vin,
        "started_at": started_at,
        "finished_at": finished_at,
        "full_repair": full_repair,
        "prepared_account_id": account_id,
        "prepared_images": selected_images,
        "prepared_images_count": len(selected_images),
        "sales_health_before": sales_health_before,
        "sales_reload": sales_reload,
        "sales_health_after": sales_health_after,
        "stack_readiness_after": stack_after,
        "guidance": guidance,
    }


def _append_audit_event(event_type: str, payload: dict[str, Any]) -> None:
    existing = _safe_read_json(BANK_BRAIN_AUDIT_PATH, {"events": []})
    events = existing.get("events", []) if isinstance(existing, dict) else []
    if not isinstance(events, list):
        events = []
    events.append(
        {
            "event_type": event_type,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
    )
    _safe_write_json(BANK_BRAIN_AUDIT_PATH, {"events": events[-500:]})


def _build_caption_from_vehicle(vehicle: dict[str, Any], caption_override: str | None = None) -> str:
    if caption_override and caption_override.strip():
        return caption_override.strip()

    title = str(vehicle.get("title") or vehicle.get("vin") or "Vehicle").strip()
    price_text = _to_price_text(vehicle.get("price") or "")
    mileage = vehicle.get("mileage")
    location = vehicle.get("location")
    detail_url = vehicle.get("detail_url")
    lines = [title, f"Price: {price_text}"]
    if mileage:
        lines.append(f"Mileage: {mileage}")
    if location:
        lines.append(f"Location: {location}")
    if detail_url:
        lines.append(str(detail_url))
    return "\n".join(lines)


def _select_vehicle_photo_urls(
    *,
    vehicle: dict[str, Any],
    selected_indexes: list[int],
    skip_indexes: list[int],
    limit: int,
) -> tuple[list[str], list[int], list[str]]:
    photos_raw = vehicle.get("photos") if isinstance(vehicle.get("photos"), list) else []
    urls = [url for url in (_extract_photo_url(entry) for entry in photos_raw) if url]
    skip = {index for index in skip_indexes if index >= 0}
    if selected_indexes:
        indexes = [index for index in selected_indexes if 0 <= index < len(urls)]
    else:
        indexes = [index for index in range(len(urls)) if index not in skip]
    indexes = indexes[: max(1, int(limit))]
    selected_urls = [urls[index] for index in indexes]
    return selected_urls, indexes, urls


def _import_image_urls_for_vin(
    *,
    vin: str,
    urls: list[str],
    overwrite: bool = False,
) -> dict[str, Any]:
    clean_vin = str(vin or "").strip().upper()
    FML_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    imported: list[str] = []
    skipped_existing: list[str] = []
    errors: list[str] = []

    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        for index, url in enumerate(urls, start=1):
            try:
                response = client.get(url)
                if response.status_code >= 400:
                    raise RuntimeError(f"HTTP {response.status_code}")
                extension = _image_extension_from_url_and_content_type(
                    url,
                    response.headers.get("content-type"),
                )
                filename = f"{clean_vin}_FB_{index:02d}{extension}"
                target = FML_IMAGES_DIR / filename
                if target.exists() and not overwrite:
                    skipped_existing.append(filename)
                    continue
                target.write_bytes(response.content)
                imported.append(filename)
            except Exception as exc:
                errors.append(f"{url} -> {exc}")

    return {
        "ok": len(errors) == 0,
        "vin": clean_vin,
        "attempted": len(urls),
        "imported_count": len(imported),
        "imported": imported,
        "skipped_existing_count": len(skipped_existing),
        "skipped_existing": skipped_existing,
        "errors_count": len(errors),
        "errors": errors,
    }


def _one_click_post_from_inventory(request: FacebookOneClickPostRequest) -> dict[str, Any]:
    clean_vin = str(request.vin or "").strip().upper()
    vehicle = _find_vehicle_by_vin(clean_vin)
    if not vehicle:
        raise HTTPException(status_code=404, detail={"message": f"Vehicle not found for VIN {clean_vin}"})

    vehicle_for_post = dict(vehicle)
    cached_assets = _read_vehicle_assets_cache(clean_vin)
    cached_asset_photos = cached_assets.get("photos") if isinstance(cached_assets.get("photos"), list) else []
    if cached_asset_photos and not vehicle_for_post.get("photos"):
        vehicle_for_post["photos"] = cached_asset_photos
    if request.auto_import_photos and not vehicle_for_post.get("photos"):
        try:
            assets = _load_vehicle_assets(clean_vin, refresh=False)
            if isinstance(assets.get("photos"), list) and assets.get("photos"):
                vehicle_for_post["photos"] = assets.get("photos")
        except Exception:
            pass

    selected_urls, selected_indexes, all_urls = _select_vehicle_photo_urls(
        vehicle=vehicle_for_post,
        selected_indexes=request.selected_photo_indexes,
        skip_indexes=request.skip_photo_indexes,
        limit=request.photo_limit,
    )
    selection_fallback_used = False
    selection_fallback_reason: str | None = None
    if not selected_urls and all_urls and not request.selected_photo_indexes:
        # If the default thumbnail skip rule removes every photo (for example only one
        # photo at index 0), relax selection so live posting can still proceed.
        fallback_indexes = [index for index in range(len(all_urls)) if index != 2]
        if not fallback_indexes:
            fallback_indexes = [0]
        fallback_indexes = fallback_indexes[: max(1, int(request.photo_limit))]
        selected_indexes = fallback_indexes
        selected_urls = [all_urls[index] for index in selected_indexes]
        selection_fallback_used = True
        selection_fallback_reason = "skip_indexes_removed_all_photos"

    import_result: dict[str, Any] | None = None
    images_for_post: list[str] = []
    if request.auto_import_photos and selected_urls:
        import_result = _import_image_urls_for_vin(vin=clean_vin, urls=selected_urls, overwrite=False)
        images_for_post = _normalize_image_names(
            list(import_result.get("imported") or []) + list(import_result.get("skipped_existing") or [])
        )

    if not images_for_post:
        images_for_post = _suggest_images_for_vin(vin=clean_vin, limit=request.photo_limit)
    if request.mode == "live" and not images_for_post:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No postable images resolved for live posting.",
                "vin": clean_vin,
                "all_photo_count": len(all_urls),
                "selected_photo_indexes": selected_indexes,
                "selected_photo_urls_count": len(selected_urls),
                "skip_photo_indexes": request.skip_photo_indexes,
                "guidance": [
                    "Import vehicle photos into automation/facebook-marketplace-lister/images",
                    "Provide explicit selected_photo_indexes in request",
                    "Verify detail page photos are reachable over HTTP",
                ],
            },
        )

    caption = _build_caption_from_vehicle(vehicle_for_post, caption_override=request.caption_override)
    account_id = str(request.account_id or "").strip() or _resolve_default_account_id()

    post_request = FacebookPostRequest(
        vin=clean_vin,
        title=str(vehicle_for_post.get("title") or clean_vin),
        price=vehicle_for_post.get("price") or "",
        mileage=vehicle_for_post.get("mileage"),
        drivetrain=vehicle_for_post.get("drivetrain"),
        engine=vehicle_for_post.get("engine"),
        transmission=vehicle_for_post.get("transmission"),
        location=vehicle_for_post.get("location"),
        exterior=vehicle_for_post.get("exterior"),
        interior=vehicle_for_post.get("interior"),
        detail_url=vehicle_for_post.get("detail_url"),
        description=caption,
        images=images_for_post,
        account_id=account_id,
        mode=request.mode,
    )

    result = facebook_post(post_request)
    if request.mode == "live" and result.get("live_success"):
        _mark_vehicle_posted(
            vin=clean_vin,
            mode="live",
            status_label="Posted",
            detail=str(result.get("live_detail") or ""),
        )

    _append_audit_event(
        "facebook_one_click_post",
        {
            "vin": clean_vin,
            "mode": request.mode,
            "selected_indexes": selected_indexes,
            "selected_urls_count": len(selected_urls),
            "selection_fallback_used": selection_fallback_used,
            "selection_fallback_reason": selection_fallback_reason,
            "images_for_post_count": len(images_for_post),
            "live_success": bool(result.get("live_success")) if request.mode == "live" else None,
        },
    )

    return {
        "ok": True,
        "vin": clean_vin,
        "caption": caption,
        "all_photo_count": len(all_urls),
        "selected_photo_indexes": selected_indexes,
        "selected_photo_urls": selected_urls,
        "selection_fallback_used": selection_fallback_used,
        "selection_fallback_reason": selection_fallback_reason,
        "images_for_post": images_for_post,
        "import_result": import_result,
        "post_result": result,
    }


DEFAULT_BANK_PROFILES: list[dict[str, Any]] = [
    {
        "code": "ALLY",
        "name": "Ally",
        "min_score": 620,
        "max_ltv": 130,
        "max_pti": 18,
        "max_dti": 52,
        "max_derogatories": 3,
        "max_utilization": 88,
    },
    {
        "code": "CAP1",
        "name": "Capital One Auto",
        "min_score": 600,
        "max_ltv": 125,
        "max_pti": 17,
        "max_dti": 50,
        "max_derogatories": 4,
        "max_utilization": 90,
    },
    {
        "code": "CHASE",
        "name": "Chase Auto",
        "min_score": 660,
        "max_ltv": 120,
        "max_pti": 16,
        "max_dti": 48,
        "max_derogatories": 2,
        "max_utilization": 75,
    },
    {
        "code": "CU_LOCAL",
        "name": "Local Credit Union",
        "min_score": 640,
        "max_ltv": 115,
        "max_pti": 15,
        "max_dti": 45,
        "max_derogatories": 2,
        "max_utilization": 70,
    },
]


def _coerce_generated_bank_profile(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or raw.get("bank") or "").strip()
    code = str(raw.get("code") or "").strip().upper()
    if not name or not code:
        return None

    def as_int(key: str, fallback: int) -> int:
        try:
            return int(float(raw.get(key, fallback)))
        except Exception:
            return fallback

    return {
        "code": code,
        "name": name,
        "min_score": as_int("min_score", 620),
        "max_ltv": as_int("max_ltv", 125),
        "max_pti": as_int("max_pti", 17),
        "max_dti": as_int("max_dti", 48),
        "max_derogatories": as_int("max_derogatories", 3),
        "max_utilization": as_int("max_utilization", 80),
        "max_term_months": as_int("max_term_months", 84),
        "weight": float(raw.get("weight", 1.0) or 1.0),
        "tier": raw.get("tier"),
        "confidence": raw.get("confidence"),
        "source_files": raw.get("source_files") if isinstance(raw.get("source_files"), list) else [],
        "source_links": raw.get("source_links") if isinstance(raw.get("source_links"), list) else [],
        "stips": raw.get("stips") if isinstance(raw.get("stips"), list) else [],
        "restrictions": raw.get("restrictions") if isinstance(raw.get("restrictions"), list) else [],
        "notes": raw.get("notes") if isinstance(raw.get("notes"), list) else [],
        "decoded_doc_count": as_int("decoded_doc_count", 0),
        "decoded_link_count": as_int("decoded_link_count", 0),
        "decoded_evidence_count": as_int("decoded_evidence_count", 0),
    }


def _load_generated_bank_profiles() -> list[dict[str, Any]]:
    candidates = [
        _safe_read_json(BANK_PROFILES_GENERATED_PATH, {}),
        _safe_read_json(SALES_ASSISTANT_BANKS_PATH, {}),
    ]
    for payload in candidates:
        items = []
        if isinstance(payload, dict):
            raw_items = payload.get("profiles")
            if not isinstance(raw_items, list):
                raw_items = payload.get("policies")
            if isinstance(raw_items, list):
                items = raw_items
        elif isinstance(payload, list):
            items = payload
        profiles = [profile for profile in (_coerce_generated_bank_profile(item) for item in items) if profile]
        if profiles:
            return profiles
    return []


def _active_bank_profiles() -> list[dict[str, Any]]:
    generated = _load_generated_bank_profiles()
    return generated or DEFAULT_BANK_PROFILES


def _load_bank_brain_history() -> list[dict[str, Any]]:
    payload = _safe_read_json(BANK_BRAIN_HISTORY_PATH, {"items": []})
    if isinstance(payload, dict):
        items = payload.get("items", [])
    else:
        items = payload
    if not isinstance(items, list):
        return []
    return [entry for entry in items if isinstance(entry, dict)]


def _append_bank_brain_history(entry: dict[str, Any]) -> None:
    items = _load_bank_brain_history()
    items.append(entry)
    _safe_write_json(BANK_BRAIN_HISTORY_PATH, {"items": items[-1000:]})


def _bank_bias_scores() -> dict[str, float]:
    history = _load_bank_brain_history()
    grouped: dict[str, list[str]] = {}
    for entry in history:
        bank = str(entry.get("bank_code", "")).strip().upper()
        outcome = str(entry.get("outcome", "")).strip().lower()
        if not bank or outcome not in {"approved", "declined", "countered"}:
            continue
        grouped.setdefault(bank, []).append(outcome)

    bias: dict[str, float] = {}
    for bank, outcomes in grouped.items():
        approved = outcomes.count("approved")
        ratio = approved / len(outcomes)
        bias[bank] = (ratio - 0.5) * 20
    return bias


def _extract_first_number(text: str, pattern: str) -> float | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return float(match.group(1))
    except Exception:
        return None


def _extract_credit_metrics(report_text: str, structured_data: dict[str, Any]) -> dict[str, Any]:
    text = report_text or ""
    score = structured_data.get("score")
    if score is None:
        score_match = re.search(
            r"(?:fico|credit)\s*score[^0-9]{0,8}([3-8][0-9]{2})",
            text,
            flags=re.IGNORECASE,
        )
        if score_match:
            score = int(score_match.group(1))

    tradelines = structured_data.get("tradelines")
    if tradelines is None:
        value = _extract_first_number(text, r"tradelines?\s*[:\-]?\s*([0-9]{1,3})")
        tradelines = int(value) if value is not None else None

    derogatories = structured_data.get("derogatories")
    if derogatories is None:
        value = _extract_first_number(text, r"derogator(?:y|ies)\s*[:\-]?\s*([0-9]{1,2})")
        if value is None:
            hits = re.findall(
                r"charge[-\s]?off|collection|repossession|bankruptcy|foreclosure|late\s+90",
                text,
                flags=re.IGNORECASE,
            )
            derogatories = len(hits)
        else:
            derogatories = int(value)

    utilization = structured_data.get("utilization")
    if utilization is None:
        utilization = _extract_first_number(text, r"utilization\s*[:\-]?\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*%?")

    dti = structured_data.get("dti")
    if dti is None:
        dti = _extract_first_number(text, r"(?:dti|debt\s*to\s*income)\s*[:\-]?\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*%?")

    flags: list[str] = []
    for keyword, label in [
        ("thin file", "Thin-file profile"),
        ("bankruptcy", "Bankruptcy noted"),
        ("repossession", "Repossession noted"),
        ("collection", "Collections present"),
        ("late payment", "Late payment history"),
    ]:
        if keyword in text.lower():
            flags.append(label)

    return {
        "score": int(score) if score is not None else None,
        "tradelines": int(tradelines) if tradelines is not None else None,
        "derogatories": int(derogatories) if derogatories is not None else None,
        "utilization": float(utilization) if utilization is not None else None,
        "dti": float(dti) if dti is not None else None,
        "risk_flags": flags,
    }


def _estimate_monthly_payment(principal: float, apr: float, term_months: int) -> float:
    if principal <= 0 or term_months <= 0:
        return 0.0
    monthly_rate = (apr / 100) / 12
    if monthly_rate <= 0:
        return principal / term_months
    numerator = principal * monthly_rate * ((1 + monthly_rate) ** term_months)
    denominator = ((1 + monthly_rate) ** term_months) - 1
    if denominator == 0:
        return principal / term_months
    return numerator / denominator


def _recommend_banks(metrics: dict[str, Any], structure: dict[str, Any]) -> dict[str, Any]:
    score = metrics.get("score")
    derogatories = metrics.get("derogatories")
    utilization = metrics.get("utilization")
    dti = structure.get("dti")
    ltv = structure.get("ltv")
    pti = structure.get("pti")
    bias = _bank_bias_scores()

    ranked: list[dict[str, Any]] = []
    high_risk_flags: list[str] = list(metrics.get("risk_flags") or [])

    for profile in _active_bank_profiles():
        confidence = 75.0
        reasons: list[str] = []
        if score is not None and score < profile["min_score"]:
            confidence -= (profile["min_score"] - score) * 0.25
            reasons.append(f"Score below {profile['name']} floor ({profile['min_score']})")
        if ltv is not None and ltv > profile["max_ltv"]:
            confidence -= (ltv - profile["max_ltv"]) * 0.9
            reasons.append(f"LTV above {profile['max_ltv']}%")
        if pti is not None and pti > profile["max_pti"]:
            confidence -= (pti - profile["max_pti"]) * 2.0
            reasons.append(f"PTI above {profile['max_pti']}%")
        if dti is not None and dti > profile["max_dti"]:
            confidence -= (dti - profile["max_dti"]) * 1.4
            reasons.append(f"DTI above {profile['max_dti']}%")
        if derogatories is not None and derogatories > profile["max_derogatories"]:
            confidence -= (derogatories - profile["max_derogatories"]) * 6.0
            reasons.append("Derogatory depth above comfort level")
        if utilization is not None and utilization > profile["max_utilization"]:
            confidence -= (utilization - profile["max_utilization"]) * 0.8
            reasons.append("Utilization is elevated")

        confidence += bias.get(profile["code"], 0.0)
        confidence = max(1.0, min(99.0, round(confidence, 1)))

        ranked.append(
            {
                "bank_code": profile["code"],
                "bank_name": profile["name"],
                "confidence": confidence,
                "reasons": reasons,
            }
        )

    ranked.sort(key=lambda item: item["confidence"], reverse=True)
    best = ranked[0] if ranked else None
    backup = ranked[1] if len(ranked) > 1 else None

    suggestions: list[str] = []
    if ltv is not None and ltv > 120:
        suggestions.append("Reduce amount financed or raise down payment to bring LTV closer to 110-120%.")
        high_risk_flags.append("High LTV")
    if pti is not None and pti > 17:
        suggestions.append("Stretch term or reduce payment target to bring PTI under 17%.")
        high_risk_flags.append("High PTI")
    if score is not None and score < 620:
        suggestions.append("Lead with subprime-friendly lenders and add stip-ready docs up front.")
        high_risk_flags.append("Sub-620 score")
    if derogatories is not None and derogatories > 3:
        suggestions.append("Prepare proof-of-income/residence before submission; stip load likely.")
        high_risk_flags.append("Heavy derogatory profile")

    return {
        "ranked_banks": ranked,
        "best_bank": best,
        "backup_bank": backup,
        "high_risk_flags": sorted(set(high_risk_flags)),
        "suggested_changes": suggestions,
    }


def _analyze_bank_brain(report_text: str, structured_data: dict[str, Any]) -> dict[str, Any]:
    metrics = _extract_credit_metrics(report_text=report_text, structured_data=structured_data)
    recommendation = _recommend_banks(metrics=metrics, structure={})
    result = {
        "ok": True,
        "metrics": metrics,
        "recommendation": recommendation,
        "summary": {
            "best_bank": recommendation.get("best_bank"),
            "backup_bank": recommendation.get("backup_bank"),
            "risk_flags": recommendation.get("high_risk_flags", []),
        },
    }
    _append_audit_event(
        "bank_brain_analyze",
        {
            "metrics": metrics,
            "best_bank": recommendation.get("best_bank"),
        },
    )
    return result


def _simulate_credit_structure(request: CreditStructureRequest) -> dict[str, Any]:
    financed_amount = max(
        0.0,
        (
            float(request.vehicle_price)
            + float(request.taxes)
            + float(request.fees)
            + float(request.backend_products)
            - float(request.down_payment)
        ),
    )
    ltv = (financed_amount / request.vehicle_price * 100.0) if request.vehicle_price > 0 else None
    payment = _estimate_monthly_payment(financed_amount, request.apr, request.term_months)
    pti = (
        (payment / request.monthly_income * 100.0)
        if request.monthly_income is not None and request.monthly_income > 0
        else None
    )
    dti = None
    if request.current_dti is not None and pti is not None:
        dti = request.current_dti + pti
    elif request.current_dti is not None:
        dti = request.current_dti
    elif pti is not None:
        dti = pti

    metrics = {
        "score": request.credit_score,
        "tradelines": request.tradelines,
        "derogatories": request.derogatories,
        "utilization": request.utilization,
        "risk_flags": [],
    }
    structure = {
        "vin": request.vin,
        "vehicle_price": request.vehicle_price,
        "taxes": request.taxes,
        "fees": request.fees,
        "backend_products": request.backend_products,
        "down_payment": request.down_payment,
        "term_months": request.term_months,
        "apr": request.apr,
        "financed_amount": round(financed_amount, 2),
        "estimated_payment": round(payment, 2),
        "ltv": round(ltv, 2) if ltv is not None else None,
        "pti": round(pti, 2) if pti is not None else None,
        "dti": round(dti, 2) if dti is not None else None,
    }
    recommendation = _recommend_banks(metrics=metrics, structure=structure)

    result = {
        "ok": True,
        "structure": structure,
        "recommendation": recommendation,
    }
    _append_audit_event(
        "bank_brain_structure",
        {
            "vin": request.vin,
            "structure": structure,
            "best_bank": recommendation.get("best_bank"),
        },
    )
    return result


def _eligible_for_posting(vehicle: dict[str, Any]) -> bool:
    status = str(vehicle.get("status_label") or vehicle.get("status") or "").strip().lower()
    photos = vehicle.get("photos") or vehicle.get("images") or []
    return status == "ready" and bool(photos)


def _require_permission(request: Request, permission: str) -> dict[str, Any]:
    user = current_user_from_auth_header(request.headers.get("authorization", ""))
    if not user:
        raise HTTPException(status_code=401, detail={"message": "Authentication required"})
    permissions = set(user.get("permissions") or [])
    if "admin.full" in permissions or permission in permissions:
        return user
    raise HTTPException(
        status_code=403,
        detail={
            "message": f"Missing permission: {permission}",
            "user": user.get("username"),
        },
    )


@router.get("/me")
def me(request: Request) -> dict[str, Any]:
    user = current_user_from_auth_header(request.headers.get("authorization", ""))
    return {
        "ok": bool(user),
        "user": user,
        "permissions": _public_permission_catalog(),
    }


@router.get("/admin/users")
def admin_users(request: Request) -> dict[str, Any]:
    _require_permission(request, "users.manage")
    return {
        "ok": True,
        "items": list_public_users(),
        "permissions": _public_permission_catalog(),
    }


@router.post("/admin/users")
def admin_users_create(request: Request, payload: XconsoleUserRequest) -> dict[str, Any]:
    _require_permission(request, "users.manage")
    try:
        user = upsert_user(
            username=payload.username,
            password=payload.password,
            display_name=payload.display_name,
            role=payload.role,
            permissions=payload.permissions,
            active=payload.active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    return {"ok": True, "user": user, "items": list_public_users()}


@router.put("/admin/users/{username}")
def admin_users_update(username: str, request: Request, payload: XconsoleUserRequest) -> dict[str, Any]:
    _require_permission(request, "users.manage")
    try:
        user = upsert_user(
            username=username,
            password=payload.password,
            display_name=payload.display_name,
            role=payload.role,
            permissions=payload.permissions,
            active=payload.active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    return {"ok": True, "user": user, "items": list_public_users()}


@router.delete("/admin/users/{username}")
def admin_users_delete(username: str, request: Request) -> dict[str, Any]:
    _require_permission(request, "users.manage")
    try:
        user = deactivate_user(username)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc
    return {"ok": True, "user": user, "items": list_public_users()}


@router.get("/leads/inbox")
def leads_inbox(request: Request) -> dict[str, Any]:
    _require_permission(request, "facebook.leads")
    leads = _load_leads()
    connection = _facebook_lead_connection_status()
    return {
        "ok": True,
        "items": leads,
        "count": len(leads),
        "new_count": len([item for item in leads if item.get("status") == "new"]),
        "responded_count": len([item for item in leads if item.get("status") == "responded"]),
        "facebook_connection": connection,
    }


@router.post("/leads/manual-add")
def leads_manual_add(request: Request, payload: LeadManualAddRequest) -> dict[str, Any]:
    user = _require_permission(request, "facebook.leads")
    leads = _load_leads()
    entry = {
        "id": _lead_id(f"{payload.customer_name}|{payload.message}|{time.time()}"),
        "customer_name": payload.customer_name.strip() or "Unknown Lead",
        "channel": payload.channel.strip().lower() or "facebook",
        "message": payload.message.strip(),
        "vehicle_vin": str(payload.vehicle_vin or "").strip().upper(),
        "source": payload.source.strip() or "manual",
        "status": "new",
        "created_at": _utc_now(),
        "last_message_at": _utc_now(),
        "created_by": user.get("username"),
    }
    leads.insert(0, entry)
    _save_leads(leads)
    return {"ok": True, "lead": entry, "items": _load_leads()}


@router.post("/leads/respond")
def leads_respond(request: Request, payload: LeadRespondRequest) -> dict[str, Any]:
    user = _require_permission(request, "facebook.leads")
    leads = _load_leads()
    target = next((item for item in leads if str(item.get("id")) == payload.lead_id), None)
    if not target:
        raise HTTPException(status_code=404, detail={"message": "Lead not found"})
    response = _append_lead_response(
        lead_id=payload.lead_id,
        channel=payload.channel,
        response_text=payload.response_text.strip(),
        author=str(user.get("username") or "xconsole"),
    )
    for item in leads:
        if str(item.get("id")) == payload.lead_id:
            item["status"] = payload.mark_status or "responded"
            item["last_response_at"] = response["created_at"]
    _save_leads(leads)
    return {
        "ok": True,
        "lead_id": payload.lead_id,
        "response": response,
        "delivery_note": "Response is logged in Xconsole. Add Facebook Page token/scopes for live Messenger send.",
        "items": _load_leads(),
    }


@router.post("/leads/sync-facebook")
def leads_sync_facebook(request: Request) -> dict[str, Any]:
    _require_permission(request, "facebook.leads")
    result = _sync_facebook_leads()
    result["items"] = _load_leads()
    return result


@router.get("/offerup/status")
def offerup_status(request: Request) -> dict[str, Any]:
    _require_permission(request, "offerup.post")
    return _load_offerup_status()


@router.post("/offerup/post/from-inventory")
def offerup_post_from_inventory(request: Request, payload: OfferUpPostRequest) -> dict[str, Any]:
    _require_permission(request, "offerup.post")
    return _offerup_post_from_inventory(payload)


@router.get("/vehicles/{vin}/decode")
def vehicles_decode(vin: str, request: Request) -> dict[str, Any]:
    _require_permission(request, "inventory.view")
    return _decode_vin_values(vin)


@router.get("/bank-brain/vehicle/{vin}")
def bank_brain_vehicle(vin: str, request: Request) -> dict[str, Any]:
    _require_permission(request, "bankbrain.view")
    return _vehicle_bank_brain(vin)


@router.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "utc": datetime.now(timezone.utc).isoformat()}


@router.get("/status")
def status() -> dict[str, Any]:
    vehicles = _load_inventory_candidates()
    posts = _load_runtime_posts()
    accounts = _load_accounts()
    stack_readiness = _stack_readiness_status()
    return {
        "ok": True,
        "vehicles_count": len(vehicles),
        "posts_count": len(posts),
        "accounts_count": len(accounts),
        "facebook_lister_path": str(FML_DIR),
        "live_requirements": _live_requirements_status(),
        "stack_readiness": stack_readiness,
        "sales_assistant": _sales_assistant_health_status(),
        "inventory_source": _inventory_source_status(),
    }


@router.get("/sales-assistant/health")
def sales_assistant_health() -> dict[str, Any]:
    return _sales_assistant_health_status()


@router.get("/sales-assistant/banks")
def sales_assistant_banks() -> dict[str, Any]:
    return _sales_backend_proxy("GET", "/api/banks")


@router.post("/sales-assistant/banks/reload")
def sales_assistant_banks_reload() -> dict[str, Any]:
    return _sales_backend_proxy("POST", "/api/banks/reload")


@router.get("/sales-assistant/banks/factors")
def sales_assistant_banks_factors() -> dict[str, Any]:
    return _sales_backend_proxy("GET", "/api/banks/factors")


@router.post("/sales-assistant/banks/factors/reload")
def sales_assistant_banks_factors_reload() -> dict[str, Any]:
    return _sales_backend_proxy("POST", "/api/banks/factors/reload")


@router.get("/stack/readiness")
def stack_readiness() -> dict[str, Any]:
    return _stack_readiness_status()


@router.get("/inventory/source-status")
def inventory_source_status() -> dict[str, Any]:
    return _inventory_source_status()


@router.post("/inventory/sync-live")
def inventory_sync_live(request: InventoryLiveSyncRequest) -> dict[str, Any]:
    return _sync_live_inventory(
        source_url=request.source_url,
        timeout_seconds=request.timeout_seconds,
        persist=request.persist,
    )


@router.get("/inventory/active")
def inventory_active() -> dict[str, Any]:
    items = _enrich_inventory_items(_load_inventory_candidates())
    return {
        "items": items,
        "count": len(items),
        "source_status": _inventory_source_status(),
    }


@router.get("/facebook/accounts")
def facebook_accounts() -> dict[str, Any]:
    return {"items": _load_accounts()}


@router.get("/facebook/images")
def facebook_images(limit: int = 200) -> dict[str, Any]:
    normalized_limit = max(1, min(int(limit), 2000))
    items, total = _list_facebook_images(limit=normalized_limit)
    return {
        "items": items,
        "total": total,
        "returned": len(items),
        "limit": normalized_limit,
    }


@router.post("/facebook/bootstrap")
def facebook_bootstrap(request: FacebookBootstrapRequest) -> dict[str, Any]:
    return _bootstrap_facebook_lister(
        create_template_account_if_missing=request.create_template_account_if_missing
    )


@router.post("/facebook/images/import-from-vehicle")
def facebook_images_import_from_vehicle(request: FacebookVehicleImageImportRequest) -> dict[str, Any]:
    return _import_vehicle_images(
        vin=request.vin,
        limit=request.limit,
        overwrite=request.overwrite,
    )


@router.post("/facebook/images/relink")
def facebook_images_relink(request: FacebookRelinkImagesRequest) -> dict[str, Any]:
    return _relink_images_to_vin(
        vin=request.vin,
        images=request.images,
        include_vin_matches=request.include_vin_matches,
        overwrite=request.overwrite,
        delete_source=request.delete_source,
    )


@router.get("/facebook/images/suggest")
def facebook_images_suggest(vin: str, limit: int = 20) -> dict[str, Any]:
    normalized_limit = max(1, min(int(limit), 200))
    items = _suggest_images_for_vin(vin=vin, limit=normalized_limit)
    _, available_total = _list_facebook_images(limit=1)
    return {
        "vin": vin.strip().upper(),
        "items": items,
        "total_matches": len(items),
        "available_total": available_total,
    }


@router.get("/facebook/live-requirements")
def facebook_live_requirements() -> dict[str, Any]:
    return _live_requirements_status()


@router.post("/facebook/live-preflight")
def facebook_live_preflight(request: FacebookPreflightRequest) -> dict[str, Any]:
    return _run_live_preflight(
        account_id=request.account_id,
        images=request.images,
        vin=request.vin,
    )


@router.post("/facebook/prepare-live-post")
def facebook_prepare_live_post(request: FacebookPrepareLivePostRequest) -> dict[str, Any]:
    return _prepare_live_post(
        vin=request.vin,
        account_id=request.account_id,
        import_missing_images=request.import_missing_images,
        image_limit=request.image_limit,
        overwrite_images=request.overwrite_images,
    )


@router.post("/facebook/full-repair")
def facebook_full_repair(request: FacebookFullRepairRequest) -> dict[str, Any]:
    return _full_repair_and_relink(
        vin=request.vin,
        ensure_placeholder_images=request.ensure_placeholder_images,
        placeholder_count=request.placeholder_count,
    )


@router.post("/wire-everything")
def wire_everything(request: WireEverythingRequest) -> dict[str, Any]:
    return _wire_everything(
        vin=request.vin,
        ensure_placeholder_images=request.ensure_placeholder_images,
        placeholder_count=request.placeholder_count,
        reload_sales_data=request.reload_sales_data,
    )


@router.get("/facebook/posts")
def facebook_posts() -> dict[str, Any]:
    return {"items": _load_runtime_posts()}


@router.get("/vehicles")
def vehicles() -> dict[str, Any]:
    items = _enrich_inventory_items(_load_inventory_candidates())
    return {
        "items": items,
        "count": len(items),
        "source_status": _inventory_source_status(),
    }


@router.post("/vehicles/manual-add")
def vehicles_manual_add(request: ManualVehicleAddRequest) -> dict[str, Any]:
    payload = _safe_read_json(INVENTORY_MANUAL_PATH, {"items": []})
    items = payload.get("items", []) if isinstance(payload, dict) else []
    if not isinstance(items, list):
        items = []

    clean_vin = str(request.vin).strip().upper()
    items = [
        entry
        for entry in items
        if not (
            isinstance(entry, dict)
            and str(entry.get("vin", "")).strip().upper() == clean_vin
        )
    ]
    items.append(
        {
            "vin": clean_vin,
            "title": request.title.strip(),
            "price": request.price,
            "mileage": request.mileage,
            "drivetrain": request.drivetrain,
            "engine": request.engine,
            "transmission": request.transmission,
            "location": request.location,
            "detail_url": request.detail_url,
            "exterior": request.exterior,
            "interior": request.interior,
            "photos": request.photos,
            "status_label": "Ready",
            "manual_added_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    _safe_write_json(
        INVENTORY_MANUAL_PATH,
        {
            "items": items,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {
        "ok": True,
        "vin": clean_vin,
        "items_count": len(items),
        "items": _enrich_inventory_items(_load_inventory_candidates()),
    }


@router.get("/vehicles/{vin}/assets")
def vehicles_assets(vin: str, refresh: bool = False) -> dict[str, Any]:
    return _load_vehicle_assets(vin=vin, refresh=refresh)


@router.post("/facebook/post")
def facebook_post(request: FacebookPostRequest) -> dict[str, Any]:
    text = _render_listing_text(request)
    listing_file = _write_listing_text(request.vin.strip().upper(), text)

    response: dict[str, Any] = {
        "ok": True,
        "mode": request.mode,
        "listing_file": str(listing_file.relative_to(ROOT_DIR)).replace("\\", "/"),
        "text": text,
    }

    if request.mode == "live":
        success, detail = _publish_live(request)
        response["live_success"] = success
        response["live_detail"] = detail
        if not success:
            raise HTTPException(status_code=400, detail=response)
        _mark_vehicle_posted(
            vin=request.vin,
            mode="live",
            status_label="Posted",
            detail=str(detail),
        )

    return response


@router.post("/facebook/post/from-inventory")
def facebook_post_from_inventory(request: FacebookOneClickPostRequest) -> dict[str, Any]:
    return _one_click_post_from_inventory(request)


@router.post("/bank-brain/analyze")
def bank_brain_analyze(request: BankBrainAnalyzeRequest) -> dict[str, Any]:
    return _analyze_bank_brain(
        report_text=request.report_text or "",
        structured_data=request.structured_data or {},
    )


@router.post("/bank-brain/analyze-upload")
async def bank_brain_analyze_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    report_text = raw.decode("utf-8", errors="ignore")
    return _analyze_bank_brain(report_text=report_text, structured_data={})


@router.post("/bank-brain/structure")
def bank_brain_structure(request: CreditStructureRequest) -> dict[str, Any]:
    return _simulate_credit_structure(request)


@router.post("/bank-brain/decision")
def bank_brain_decision(request: BankBrainDecisionRequest) -> dict[str, Any]:
    entry = {
        "vin": request.vin,
        "bank_code": request.bank_code.strip().upper(),
        "outcome": request.outcome,
        "notes": request.notes,
        "metrics": request.metrics,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _append_bank_brain_history(entry)
    _append_audit_event("bank_brain_decision", entry)
    return {"ok": True, "entry": entry, "history_count": len(_load_bank_brain_history())}


@router.get("/bank-brain/history")
def bank_brain_history(limit: int = 200) -> dict[str, Any]:
    history = _load_bank_brain_history()
    normalized_limit = max(1, min(int(limit), 1000))
    return {"items": history[-normalized_limit:], "total": len(history)}


@router.get("/bank-brain/lenders")
def bank_brain_lenders() -> dict[str, Any]:
    return {"items": _active_bank_profiles()}


@router.get("/bank-brain/docs/status")
def bank_brain_docs_status() -> dict[str, Any]:
    return _routeone_docs_status()


@router.post("/bank-brain/docs/rebuild")
def bank_brain_docs_rebuild(request: BankBrainDocsRebuildRequest) -> dict[str, Any]:
    return _run_bank_docs_rebuild(
        reload_sales_data=request.reload_sales_data,
        max_link_depth=request.max_link_depth,
        max_links_per_resource=request.max_links_per_resource,
    )


@router.post("/bank-brain/docs/upload")
async def bank_brain_docs_upload(
    files: list[UploadFile] = File(...),
    bank: str | None = Form(default=None),
    rebuild: bool = Form(default=True),
    reload_sales_data: bool = Form(default=True),
) -> dict[str, Any]:
    bank_folder = _sanitize_doc_segment(bank or "_Inbox", "_Inbox")
    target_dir = BANK_DOCS_ROOT / bank_folder
    target_dir.mkdir(parents=True, exist_ok=True)

    saved: list[dict[str, Any]] = []
    for upload in files:
        source_name = Path(upload.filename or "routeone_document.pdf").name
        target = _unique_upload_target(target_dir, source_name)
        raw = await upload.read()
        target.write_bytes(raw)
        saved.append(
            {
                "filename": source_name,
                "stored_as": _display_path(target),
                "bank": bank_folder,
                "bytes": len(raw),
            }
        )

    rebuild_result = None
    if rebuild and saved:
        rebuild_result = _run_bank_docs_rebuild(
            reload_sales_data=reload_sales_data,
            max_link_depth=1,
            max_links_per_resource=12,
        )

    return {
        "ok": bool(saved) and (rebuild_result is None or bool(rebuild_result.get("ok"))),
        "saved": saved,
        "rebuild": rebuild_result,
        "status": _routeone_docs_status(),
    }
