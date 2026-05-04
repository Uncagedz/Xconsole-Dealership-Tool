from __future__ import annotations

import base64
import hmac
import hashlib
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]

DEFAULT_PERMISSIONS: list[str] = [
    "inventory.view",
    "inventory.edit",
    "facebook.post",
    "facebook.leads",
    "offerup.post",
    "bankbrain.view",
    "bankbrain.train",
    "users.manage",
    "admin.full",
]

OPERATOR_PERMISSIONS: list[str] = [
    "inventory.view",
    "facebook.post",
    "facebook.leads",
    "offerup.post",
    "bankbrain.view",
]


def _security_path() -> Path:
    explicit = str(os.getenv("XCONSOLE_SECURITY_PATH", "")).strip()
    if explicit:
        return Path(explicit).resolve()
    state_dir = str(os.getenv("XCONSOLE_STATE_DIR", "")).strip()
    if state_dir:
        return (Path(state_dir).resolve() / "users.json")
    bank_root = Path(os.getenv("BANK_DOCS_ROOT", str(ROOT_DIR / "Bank"))).resolve()
    return bank_root / "_xconsole" / "users.json"


USERS_PATH = _security_path()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def _safe_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    password_text = str(password or "")
    salt_text = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password_text.encode("utf-8"),
        salt_text.encode("utf-8"),
        120_000,
    ).hex()
    return salt_text, digest


def _verify_password(password: str, salt: str, digest: str) -> bool:
    _, check = _hash_password(password, salt)
    return secrets.compare_digest(check, digest)


def _normalize_permissions(raw: Any, *, role: str | None = None) -> list[str]:
    if role == "admin":
        return list(DEFAULT_PERMISSIONS)
    if not isinstance(raw, list):
        raw = OPERATOR_PERMISSIONS
    allowed = set(DEFAULT_PERMISSIONS)
    normalized = [str(item).strip() for item in raw if str(item).strip() in allowed]
    return sorted(set(normalized), key=DEFAULT_PERMISSIONS.index)


def _default_admin_record(existing: dict[str, Any] | None = None) -> dict[str, Any]:
    username = str(os.getenv("XCONSOLE_BASIC_AUTH_USER", "admin")).strip() or "admin"
    password = str(os.getenv("XCONSOLE_BASIC_AUTH_PASSWORD", "adminnn")).strip() or "adminnn"
    salt, digest = _hash_password(password)
    now = _utc_now()
    base = dict(existing or {})
    base.update(
        {
            "username": username,
            "display_name": base.get("display_name") or "Admin",
            "role": "admin",
            "active": True,
            "permissions": list(DEFAULT_PERMISSIONS),
            "password_salt": salt,
            "password_hash": digest,
            "updated_at": now,
        }
    )
    base.setdefault("created_at", now)
    return base


def _normalize_user_record(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    username = str(raw.get("username") or "").strip()
    if not username:
        return None
    role = str(raw.get("role") or "operator").strip().lower()
    if role not in {"admin", "manager", "operator"}:
        role = "operator"
    permissions = _normalize_permissions(raw.get("permissions"), role=role if role == "admin" else None)
    return {
        "username": username,
        "display_name": str(raw.get("display_name") or username).strip(),
        "role": role,
        "active": bool(raw.get("active", True)),
        "permissions": permissions,
        "password_salt": str(raw.get("password_salt") or ""),
        "password_hash": str(raw.get("password_hash") or ""),
        "created_at": raw.get("created_at") or _utc_now(),
        "updated_at": raw.get("updated_at") or _utc_now(),
    }


def ensure_user_store() -> dict[str, Any]:
    payload = _safe_read_json(USERS_PATH, {"users": []})
    raw_users = payload.get("users", []) if isinstance(payload, dict) else []
    if not isinstance(raw_users, list):
        raw_users = []

    users_by_name: dict[str, dict[str, Any]] = {}
    for raw in raw_users:
        normalized = _normalize_user_record(raw)
        if not normalized:
            continue
        users_by_name[normalized["username"].lower()] = normalized

    env_username = str(os.getenv("XCONSOLE_BASIC_AUTH_USER", "admin")).strip() or "admin"
    users_by_name[env_username.lower()] = _default_admin_record(users_by_name.get(env_username.lower()))

    users = sorted(users_by_name.values(), key=lambda item: (item.get("role") != "admin", item.get("username", "")))
    result = {
        "version": 1,
        "updated_at": _utc_now(),
        "users": users,
    }
    _safe_write_json(USERS_PATH, result)
    return result


def load_user_records() -> list[dict[str, Any]]:
    payload = ensure_user_store()
    users = payload.get("users", [])
    return users if isinstance(users, list) else []


def _public_user(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "username": record.get("username"),
        "display_name": record.get("display_name"),
        "role": record.get("role"),
        "active": bool(record.get("active", True)),
        "permissions": list(record.get("permissions") or []),
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
    }


def list_public_users() -> list[dict[str, Any]]:
    return [_public_user(record) for record in load_user_records()]


def upsert_user(
    *,
    username: str,
    password: str | None,
    display_name: str | None,
    role: str,
    permissions: list[str],
    active: bool,
) -> dict[str, Any]:
    clean_username = str(username or "").strip()
    if not clean_username:
        raise ValueError("username is required")
    normalized_role = str(role or "operator").strip().lower()
    if normalized_role not in {"admin", "manager", "operator"}:
        normalized_role = "operator"

    payload = ensure_user_store()
    users = payload.get("users", [])
    existing = next(
        (record for record in users if str(record.get("username", "")).lower() == clean_username.lower()),
        None,
    )
    if not existing and not password:
        raise ValueError("password is required for new users")

    now = _utc_now()
    record = dict(existing or {})
    record.update(
        {
            "username": clean_username,
            "display_name": str(display_name or clean_username).strip(),
            "role": normalized_role,
            "active": bool(active),
            "permissions": _normalize_permissions(permissions, role=normalized_role if normalized_role == "admin" else None),
            "updated_at": now,
        }
    )
    record.setdefault("created_at", now)
    if password:
        salt, digest = _hash_password(password)
        record["password_salt"] = salt
        record["password_hash"] = digest

    replaced = False
    next_users: list[dict[str, Any]] = []
    for item in users:
        if str(item.get("username", "")).lower() == clean_username.lower():
            next_users.append(record)
            replaced = True
        else:
            next_users.append(item)
    if not replaced:
        next_users.append(record)

    _safe_write_json(
        USERS_PATH,
        {
            "version": 1,
            "updated_at": now,
            "users": next_users,
        },
    )
    ensure_user_store()
    return _public_user(record)


def deactivate_user(username: str) -> dict[str, Any]:
    clean_username = str(username or "").strip()
    if not clean_username:
        raise ValueError("username is required")
    users = load_user_records()
    target = next(
        (record for record in users if str(record.get("username", "")).lower() == clean_username.lower()),
        None,
    )
    if not target:
        raise ValueError("user not found")
    target["active"] = False
    target["updated_at"] = _utc_now()
    _safe_write_json(USERS_PATH, {"version": 1, "updated_at": _utc_now(), "users": users})
    return _public_user(target)


def authenticate_basic_header(auth_header: str | None) -> dict[str, Any] | None:
    header = str(auth_header or "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "basic" or not token:
        return None
    try:
        decoded = base64.b64decode(token).decode("utf-8")
    except Exception:
        return None
    supplied_username, _, supplied_password = decoded.partition(":")
    if not supplied_username:
        return None

    for record in load_user_records():
        if str(record.get("username", "")).lower() != supplied_username.lower():
            continue
        if not bool(record.get("active", True)):
            return None
        salt = str(record.get("password_salt") or "")
        digest = str(record.get("password_hash") or "")
        if salt and digest and _verify_password(supplied_password, salt, digest):
            return _public_user(record)
    return None


def current_user_from_auth_header(auth_header: str | None) -> dict[str, Any] | None:
    return authenticate_basic_header(auth_header)


def _session_cookie_secret() -> str:
    explicit = str(os.getenv("XCONSOLE_SESSION_SECRET", "")).strip()
    if explicit:
        return explicit
    admin_user = str(os.getenv("XCONSOLE_BASIC_AUTH_USER", "admin")).strip() or "admin"
    admin_pass = str(os.getenv("XCONSOLE_BASIC_AUTH_PASSWORD", "adminnn")).strip() or "adminnn"
    return f"xconsole-session::{admin_user}::{admin_pass}"


def issue_session_cookie(username: str) -> str:
    clean_username = str(username or "").strip().lower()
    signature = hmac.new(
        _session_cookie_secret().encode("utf-8"),
        clean_username.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{clean_username}:{signature}"


def current_user_from_session_cookie(cookie_value: str | None) -> dict[str, Any] | None:
    raw = str(cookie_value or "").strip()
    username, sep, signature = raw.partition(":")
    if not username or not sep or not signature:
        return None
    expected = issue_session_cookie(username).partition(":")[2]
    if not hmac.compare_digest(signature, expected):
        return None
    for record in load_user_records():
        if str(record.get("username", "")).lower() == username.lower() and bool(record.get("active", True)):
            return _public_user(record)
    return None
