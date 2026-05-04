from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.facebook_session_runtime import archive_runtime_session, ensure_runtime_session


def _running_on_windows() -> bool:
    return os.name == "nt" or sys.platform.startswith("win")


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _default_marketplace_location() -> str:
    return str(os.getenv("FACEBOOK_MARKETPLACE_LOCATION_LABEL") or "Plantation, Florida 33317").strip() or "Plantation, Florida 33317"


def _load_accounts(accounts_path: Path) -> list[dict]:
    env_id = str(os.getenv("FACEBOOK_LOGIN_ACCOUNT_ID") or os.getenv("FACEBOOK_ACCOUNT_ID") or "").strip()
    env_email = str(os.getenv("FACEBOOK_LOGIN_EMAIL") or os.getenv("FACEBOOK_ACCOUNT_EMAIL") or "").strip()
    env_password = str(os.getenv("FACEBOOK_LOGIN_PASSWORD") or os.getenv("FACEBOOK_ACCOUNT_PASSWORD") or "").strip()
    if env_id and env_email:
        return [
            {
                "id": env_id,
                "name": os.getenv("FACEBOOK_LOGIN_NAME") or "Facebook Login",
                "email": env_email,
                "password": env_password,
            }
        ]
    if not accounts_path.exists():
        return []
    try:
        payload = json.loads(accounts_path.read_text(encoding="utf-8"))
    except Exception:
        return []
    accounts = payload.get("accounts", []) if isinstance(payload, dict) else []
    return [entry for entry in accounts if isinstance(entry, dict)]


def _find_chromedriver(drivers_dir: Path) -> Path | None:
    env_driver = str(os.getenv("CHROMEDRIVER_PATH", "")).strip()
    if env_driver and Path(env_driver).exists():
        return Path(env_driver)
    if not _running_on_windows():
        for command in ("chromedriver", "chromium-driver"):
            resolved = shutil.which(command)
            if resolved:
                return Path(resolved)
    direct_names = ("chromedriver.exe", "chromedriver") if _running_on_windows() else ("chromedriver",)
    for direct_name in direct_names:
        direct = drivers_dir / direct_name
        if direct.exists():
            return direct
    if drivers_dir.exists():
        for candidate in drivers_dir.glob("chromedriver*"):
            if candidate.is_file() and (_running_on_windows() or candidate.suffix.lower() != ".exe"):
                return candidate
    for command in ("chromedriver", "chromedriver.exe"):
        resolved = shutil.which(command)
        if resolved:
            return Path(resolved)
    return None


def _set_linux_chrome_defaults() -> None:
    if _running_on_windows():
        return
    if not os.getenv("CHROME_BINARY"):
        for command in ("chromium", "chromium-browser", "google-chrome", "chrome"):
            resolved = shutil.which(command)
            if resolved:
                os.environ["CHROME_BINARY"] = resolved
                break
    if not os.getenv("CHROMEDRIVER_PATH"):
        for command in ("chromedriver", "chromium-driver"):
            resolved = shutil.which(command)
            if resolved:
                os.environ["CHROMEDRIVER_PATH"] = resolved
                break


def _configure_runtime_browser_paths(runtime_dir: Path) -> None:
    cookie_path = runtime_dir / "facebook_session_cookies.json"
    if _running_on_windows():
        profile_dir = runtime_dir / "facebook_auth_profile"
        os.environ.setdefault("FACEBOOK_CHROME_PROFILE_DIR", str(profile_dir))
    else:
        profile_dir = runtime_dir / "facebook_headless_profile"
        if profile_dir.exists():
            shutil.rmtree(profile_dir, ignore_errors=True)
        profile_dir.mkdir(parents=True, exist_ok=True)
        os.environ["FACEBOOK_CHROME_PROFILE_DIR"] = str(profile_dir)
    os.environ["FACEBOOK_COOKIE_FILE"] = str(cookie_path)


def _write_status(status_file: Path | None, payload: dict) -> None:
    if not status_file:
        return
    data = dict(payload)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        status_file.parent.mkdir(parents=True, exist_ok=True)
        status_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass


def _item_from_payload(payload: dict) -> dict:
    return {
        "title": payload.get("title", ""),
        "price": str(payload.get("price", "")),
        "images": [{"file": image} for image in (payload.get("images") or [])],
        "location": payload.get("location") or _default_marketplace_location(),
        "description": payload.get("description") or "",
        "vin": payload.get("vin") or "",
        "sku": payload.get("vin") or "",
        "mileage": payload.get("mileage"),
        "drivetrain": payload.get("drivetrain") or "",
        "engine": payload.get("engine") or "",
        "transmission": payload.get("transmission") or "",
        "exterior": payload.get("exterior") or "",
        "interior": payload.get("interior") or "",
        "detail_url": payload.get("detail_url") or "",
        "hide_from_friends": bool(payload.get("hide_from_friends", False)),
    }


def _batch_marketplace_state(confirmation: object) -> dict:
    if confirmation is True:
        return {"marketplace_status": "processing", "listing_url": "", "confirmed": True}
    if not isinstance(confirmation, dict):
        return {"marketplace_status": "needs_review", "listing_url": "", "confirmed": False}
    listing_url = str(confirmation.get("listing_url") or "").strip()
    has_item_url = bool(listing_url and "/marketplace/item/" in listing_url.lower())
    status = str(confirmation.get("marketplace_status") or "").strip().lower()
    if has_item_url:
        return {"marketplace_status": "live", "listing_url": listing_url, "confirmed": True}
    if status in {"processing", "needs_review", "failed", "draft"}:
        return {"marketplace_status": status, "listing_url": "", "confirmed": bool(confirmation.get("confirmed"))}
    if bool(confirmation.get("confirmed")):
        return {"marketplace_status": "processing", "listing_url": "", "confirmed": True}
    return {"marketplace_status": "needs_review", "listing_url": "", "confirmed": False}


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish multiple Facebook Marketplace vehicle listings in one browser session.")
    parser.add_argument("--payload", required=True, help="Path to a JSON batch payload file.")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    payload_path = Path(args.payload)
    if not payload_path.exists():
        print(json.dumps({"ok": False, "error": f"Missing payload file: {payload_path}"}))
        return 2

    payload = json.loads(payload_path.read_text(encoding="utf-8-sig"))
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        print(json.dumps({"ok": False, "error": "batch payload requires a non-empty items list"}))
        return 2
    account_id = str(payload.get("account_id") or items[0].get("account_id") or "").strip()
    if not account_id:
        print(json.dumps({"ok": False, "error": "account_id is required for live batch publish"}))
        return 2

    lister_dir = root / "automation" / "facebook-marketplace-lister"
    accounts_path = lister_dir / "accounts.json"
    images_dir = lister_dir / "images"
    drivers_dir = lister_dir / "drivers"
    status_file_raw = os.getenv("FACEBOOK_PUBLISH_STATUS_FILE", "").strip()
    status_file = Path(status_file_raw) if status_file_raw else None

    accounts = _load_accounts(accounts_path)
    account = next((entry for entry in accounts if str(entry.get("id", "")).strip() == account_id), None)
    if not account:
        print(json.dumps({"ok": False, "error": f"account_id '{account_id}' not found in accounts.json or FACEBOOK_LOGIN_* env"}))
        return 2
    if not account.get("password") and os.environ.get("FACEBOOK_REQUIRE_SAVED_SESSION", "1").strip().lower() not in {"1", "true", "yes"}:
        print(json.dumps({"ok": False, "error": f"account_id '{account_id}' has no password in accounts.json or FACEBOOK_LOGIN_PASSWORD env"}))
        return 2

    missing_images: list[str] = []
    for item in items:
        for image in item.get("images") or []:
            if not (images_dir / str(image)).exists():
                missing_images.append(str(image))
    if missing_images:
        print(json.dumps({"ok": False, "error": "Missing image files", "missing": missing_images[:30]}))
        return 2

    chromedriver_path = _find_chromedriver(drivers_dir)
    if not chromedriver_path:
        print(json.dumps({"ok": False, "error": "ChromeDriver not found", "drivers_dir": str(drivers_dir)}))
        return 2

    sys.path.insert(0, str(lister_dir))
    try:
        from Lister import Lister  # type: ignore
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Failed to import Lister: {exc}"}))
        return 2

    original_cwd = Path.cwd()
    lister = None
    results: list[dict] = []
    posted = 0
    failed = 0
    try:
        _set_linux_chrome_defaults()
        runtime_dir = root / "runtime"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        session_state = ensure_runtime_session(root, force_restore=False)
        require_saved_session = not bool(account.get("password")) and bool(session_state.get("ok"))
        _configure_runtime_browser_paths(runtime_dir)
        os.environ["FACEBOOK_REQUIRE_SAVED_SESSION"] = "1" if require_saved_session else "0"
        os.environ["FACEBOOK_SESSION_CHECK_WAIT_SECONDS"] = "0.75"
        os.environ["FACEBOOK_LOGIN_WAIT_SECONDS"] = "16"
        os.environ["FACEBOOK_FORM_SLEEP_SECONDS"] = "0.22"
        os.environ["FACEBOOK_FIELD_WAIT_SECONDS"] = "0.22"
        os.environ["FACEBOOK_ACCOUNT_CHOOSER_WAIT_SECONDS"] = "0.45"
        os.environ["FACEBOOK_POST_NAV_WAIT_SECONDS"] = "1.1"
        os.environ["FACEBOOK_PUBLISH_CONFIRM_SECONDS"] = "60"
        if _env_flag("FACEBOOK_REQUIRE_SAVED_SESSION_DEFAULT", False) and require_saved_session:
            os.environ["FACEBOOK_REQUIRE_SAVED_SESSION"] = "1"
        os.chdir(lister_dir)
        lister = Lister()
        if not lister.login(account_id):
            print(json.dumps({"ok": False, "error": "Facebook login failed"}))
            return 3

        total = len(items)
        for index, payload_item in enumerate(items, start=1):
            vin = str(payload_item.get("vin") or "").strip().upper()
            title = str(payload_item.get("title") or vin or "vehicle").strip()
            _write_status(
                status_file,
                {
                    "ok": True,
                    "type": "main",
                    "vin": vin,
                    "title": title,
                    "stage": f"Facebook batch {index}/{total}: filling {title}.",
                    "batch_current": index,
                    "batch_total": total,
                    "posted": posted,
                    "failed": failed,
                },
            )
            try:
                confirmation = lister.list(_item_from_payload(payload_item))
                state = _batch_marketplace_state(confirmation)
                confirmed_live = str(state.get("marketplace_status") or "") == "live"
                if confirmed_live:
                    posted += 1
                elif str(state.get("marketplace_status") or "") not in {"processing"}:
                    failed += 1
                results.append(
                    {
                        "vin": vin,
                        "posted": confirmed_live,
                        "marketplace_status": state.get("marketplace_status"),
                        "listing_url": state.get("listing_url"),
                        "confirmation": confirmation,
                    }
                )
            except Exception as exc:
                failed += 1
                results.append({"vin": vin, "posted": False, "error": str(exc)})
                try:
                    lister.driver.get(lister.marketplace_vehicle_url)
                except Exception:
                    pass
            _write_status(
                status_file,
                {
                    "ok": failed == 0,
                    "type": "main" if failed == 0 else "failure",
                    "vin": vin,
                    "title": title,
                    "stage": f"Facebook batch {index}/{total}: posted {posted}, failed {failed}.",
                    "batch_current": index,
                    "batch_total": total,
                    "posted": posted,
                    "failed": failed,
                },
            )

        print(json.dumps({"ok": failed == 0, "posted": posted, "failed": failed, "results": results}))
        return 0 if failed == 0 else 4
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc), "posted": posted, "failed": failed, "results": results}))
        return 5
    finally:
        if lister is not None and not (_env_flag("FACEBOOK_KEEP_BROWSER_OPEN", False) or _env_flag("FACEBOOK_KEEP_BROWSER_OPEN_ON_ERROR", False)):
            try:
                lister.close()
            except Exception:
                pass
            try:
                archive_runtime_session(root)
            except Exception:
                pass
        os.chdir(original_cwd)


if __name__ == "__main__":
    raise SystemExit(main())
