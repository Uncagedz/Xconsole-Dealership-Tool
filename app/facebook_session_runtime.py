from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any


def runtime_dir(root: Path) -> Path:
    return root / "runtime"


def active_profile_dir(root: Path) -> Path:
    return runtime_dir(root) / "facebook_auth_profile"


def active_cookie_file(root: Path) -> Path:
    return runtime_dir(root) / "facebook_session_cookies.json"


def saved_sessions_dir(root: Path) -> Path:
    return runtime_dir(root) / "facebook_saved_sessions"


def _read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def cookie_file_looks_valid(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    payload = _read_json(path)
    cookies = payload.get("cookies")
    return isinstance(cookies, list) and any(isinstance(item, dict) and item.get("name") for item in cookies)


def profile_dir_looks_valid(path: Path) -> bool:
    if not path.exists() or not path.is_dir():
        return False
    markers = [
        path / "Default" / "Network" / "Cookies",
        path / "Default" / "IndexedDB" / "https_www.facebook.com_0.indexeddb.leveldb",
        path / "Default" / "Local Storage" / "leveldb",
    ]
    return any(marker.exists() for marker in markers)


def runtime_session_available(root: Path) -> bool:
    return cookie_file_looks_valid(active_cookie_file(root)) or profile_dir_looks_valid(active_profile_dir(root))


def latest_saved_session(root: Path) -> dict[str, Any] | None:
    archive_root = saved_sessions_dir(root)
    if not archive_root.exists():
        return None
    candidates: list[dict[str, Any]] = []
    for entry in archive_root.iterdir():
        if not entry.is_dir():
            continue
        cookie_path = entry / "facebook_session_cookies.json"
        profile_path = entry / "facebook_auth_profile"
        if not cookie_file_looks_valid(cookie_path) and not profile_dir_looks_valid(profile_path):
            continue
        timestamp = max(
            [
                cookie_path.stat().st_mtime if cookie_path.exists() else 0.0,
                profile_path.stat().st_mtime if profile_path.exists() else 0.0,
                entry.stat().st_mtime,
            ]
        )
        candidates.append(
            {
                "session_dir": entry,
                "cookie_path": cookie_path if cookie_path.exists() else None,
                "profile_path": profile_path if profile_path.exists() else None,
                "timestamp": timestamp,
            }
        )
    if not candidates:
        return None
    candidates.sort(key=lambda item: float(item.get("timestamp") or 0.0), reverse=True)
    return candidates[0]


def ensure_runtime_session(root: Path, *, force_restore: bool = False) -> dict[str, Any]:
    runtime = runtime_dir(root)
    runtime.mkdir(parents=True, exist_ok=True)
    active_cookie = active_cookie_file(root)
    active_profile = active_profile_dir(root)
    current_valid = runtime_session_available(root)
    saved = latest_saved_session(root)
    if current_valid and not force_restore:
        return {
            "ok": True,
            "restored": False,
            "source": "runtime",
            "cookie_path": str(active_cookie) if active_cookie.exists() else "",
            "profile_path": str(active_profile) if active_profile.exists() else "",
        }
    if not saved:
        return {
            "ok": current_valid,
            "restored": False,
            "source": "missing",
            "cookie_path": str(active_cookie) if active_cookie.exists() else "",
            "profile_path": str(active_profile) if active_profile.exists() else "",
        }

    restored_cookie = False
    restored_profile = False
    saved_cookie = saved.get("cookie_path")
    saved_profile = saved.get("profile_path")

    if isinstance(saved_cookie, Path) and cookie_file_looks_valid(saved_cookie):
        active_cookie.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(saved_cookie, active_cookie)
        restored_cookie = True
    if isinstance(saved_profile, Path) and profile_dir_looks_valid(saved_profile):
        if active_profile.exists():
            shutil.rmtree(active_profile, ignore_errors=True)
        shutil.copytree(saved_profile, active_profile, dirs_exist_ok=True)
        restored_profile = True

    return {
        "ok": runtime_session_available(root),
        "restored": restored_cookie or restored_profile,
        "source": str(saved.get("session_dir") or ""),
        "restored_cookie": restored_cookie,
        "restored_profile": restored_profile,
        "cookie_path": str(active_cookie) if active_cookie.exists() else "",
        "profile_path": str(active_profile) if active_profile.exists() else "",
    }


def archive_runtime_session(root: Path) -> dict[str, Any]:
    runtime = runtime_dir(root)
    runtime.mkdir(parents=True, exist_ok=True)
    archive_root = saved_sessions_dir(root)
    archive_root.mkdir(parents=True, exist_ok=True)
    active_cookie = active_cookie_file(root)
    active_profile = active_profile_dir(root)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = archive_root / stamp
    destination.mkdir(parents=True, exist_ok=True)

    copied_cookie = False
    copied_profile = False
    if cookie_file_looks_valid(active_cookie):
        shutil.copy2(active_cookie, destination / "facebook_session_cookies.json")
        copied_cookie = True
    if profile_dir_looks_valid(active_profile):
        shutil.copytree(active_profile, destination / "facebook_auth_profile", dirs_exist_ok=True)
        copied_profile = True

    return {
        "ok": copied_cookie or copied_profile,
        "destination": str(destination),
        "copied_cookie": copied_cookie,
        "copied_profile": copied_profile,
    }
