from __future__ import annotations

import argparse
import json
import os
import sys
import shutil
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
    if not drivers_dir.exists():
        for command in ("chromedriver", "chromedriver.exe"):
            resolved = shutil.which(command)
            if resolved:
                return Path(resolved)
        return None
    direct_names = ("chromedriver.exe", "chromedriver") if _running_on_windows() else ("chromedriver",)
    for direct_name in direct_names:
        direct = drivers_dir / direct_name
        if direct.exists():
            return direct
    for candidate in drivers_dir.glob("chromedriver*"):
        if candidate.is_file():
            if not _running_on_windows() and candidate.suffix.lower() == ".exe":
                continue
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish a Facebook Marketplace listing via recovered lister.")
    parser.add_argument("--payload", required=True, help="Path to a JSON payload file.")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    payload_path = Path(args.payload)
    if not payload_path.exists():
        print(json.dumps({"ok": False, "error": f"Missing payload file: {payload_path}"}))
        return 2

    payload = json.loads(payload_path.read_text(encoding="utf-8-sig"))
    account_id = str(payload.get("account_id") or "").strip()
    images = payload.get("images") or []
    if not account_id:
        print(json.dumps({"ok": False, "error": "account_id is required for live publish"}))
        return 2
    if not images:
        print(json.dumps({"ok": False, "error": "images list is required for live publish"}))
        return 2

    lister_dir = root / "automation" / "facebook-marketplace-lister"
    if not lister_dir.exists():
        print(json.dumps({"ok": False, "error": f"Missing lister directory: {lister_dir}"}))
        return 2

    accounts_path = lister_dir / "accounts.json"
    images_dir = lister_dir / "images"
    drivers_dir = lister_dir / "drivers"

    accounts = _load_accounts(accounts_path)
    account = next((entry for entry in accounts if str(entry.get("id", "")).strip() == account_id), None)
    if not account:
        print(json.dumps({"ok": False, "error": f"account_id '{account_id}' not found in accounts.json or FACEBOOK_LOGIN_* env"}))
        return 2
    if not account.get("password") and os.environ.get("FACEBOOK_REQUIRE_SAVED_SESSION", "1").strip().lower() not in {"1", "true", "yes"}:
        print(json.dumps({"ok": False, "error": f"account_id '{account_id}' has no password in accounts.json or FACEBOOK_LOGIN_PASSWORD env"}))
        return 2

    images_dir.mkdir(parents=True, exist_ok=True)
    missing_images = [name for name in images if not (images_dir / str(name)).exists()]
    if missing_images:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Missing image files",
                    "missing": missing_images,
                    "images_dir": str(images_dir),
                }
            )
        )
        return 2

    chromedriver_path = _find_chromedriver(drivers_dir)
    if not chromedriver_path:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "ChromeDriver not found",
                    "drivers_dir": str(drivers_dir),
                }
            )
        )
        return 2

    sys.path.insert(0, str(lister_dir))
    try:
        from Lister import Lister  # type: ignore
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Failed to import Lister: {exc}"}))
        return 2

    # Lister uses relative paths ("drivers", "images", "accounts"), so use its directory as CWD.
    original_cwd = Path.cwd()
    lister = None
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
        logged_in = lister.login(account_id)
        if not logged_in:
            print(json.dumps({"ok": False, "error": "Facebook login failed"}))
            return 3

        item = {
            "title": payload.get("title", ""),
            "price": str(payload.get("price", "")),
            "images": [{"file": image} for image in images],
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
        confirmation = lister.list(item)
        marketplace_status = ""
        listing_url = ""
        if isinstance(confirmation, dict):
            marketplace_status = str(confirmation.get("marketplace_status") or "").strip().lower()
            listing_url = str(confirmation.get("listing_url") or "").strip()
        has_item_url = bool(listing_url and "/marketplace/item/" in listing_url.lower())
        submitted = bool(isinstance(confirmation, dict) and confirmation.get("confirmed"))
        posted = has_item_url or marketplace_status == "live"
        ok = posted or (submitted and marketplace_status == "processing")
        print(
            json.dumps(
                {
                    "ok": ok,
                    "submitted": submitted,
                    "posted": posted,
                    "confirmation": confirmation,
                    "marketplace_status": marketplace_status or None,
                    "listing_url": listing_url if has_item_url else "",
                }
            )
        )
        return 0 if ok else 4
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 5
    finally:
        if lister is not None:
            keep_open = _env_flag("FACEBOOK_KEEP_BROWSER_OPEN", False) or _env_flag("FACEBOOK_KEEP_BROWSER_OPEN_ON_ERROR", False)
            if keep_open:
                print(
                    "facebook browser left open because FACEBOOK_KEEP_BROWSER_OPEN is enabled",
                    file=sys.stderr,
                )
            else:
                try:
                    lister.close()
                except Exception:
                    pass
                try:
                    archived = archive_runtime_session(root)
                except Exception:
                    pass
        os.chdir(original_cwd)


if __name__ == "__main__":
    raise SystemExit(main())
