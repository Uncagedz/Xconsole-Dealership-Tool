from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            os.environ.setdefault(key, value.strip().strip("'\""))


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw.strip())
    except Exception:
        return default


def _generated_bank_brain_exists() -> bool:
    return (
        (ROOT / "data" / "bank_profiles.generated.json").exists()
        and (ROOT / "data" / "routeone_docs.decoded_index.generated.json").exists()
        and (ROOT / "sales-assistant" / "data" / "banks.json").exists()
    )


def _bank_root_has_documents(bank_root: str) -> bool:
    root = Path(bank_root)
    if not root.exists():
        return False
    allowed = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".csv", ".html", ".htm", ".txt", ".ppt", ".pptx"}
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in allowed and "_xconsole" not in path.parts:
            return True
    return False


def _terminate(processes: list[subprocess.Popen[bytes]]) -> None:
    for process in processes:
        if process.poll() is None:
            process.terminate()

    deadline = time.time() + 10
    for process in processes:
        remaining = max(0.1, deadline - time.time())
        try:
            process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            process.kill()


def _rebuild_bank_brain_on_start() -> None:
    default_rebuild = not _generated_bank_brain_exists()
    if not _env_flag("XCONSOLE_REBUILD_BANK_BRAIN_ON_START", default_rebuild):
        return

    bank_root = os.getenv("BANK_DOCS_ROOT", str(ROOT / "Bank"))
    if _generated_bank_brain_exists() and not _bank_root_has_documents(bank_root):
        print(
            f"Bank Brain startup rebuild skipped: no RouteOne documents found in {bank_root}; using packaged generated profiles.",
            flush=True,
        )
        return

    command = [
        sys.executable,
        str(ROOT / "tools" / "rebuild_bank_brain.py"),
        "--bank-root",
        bank_root,
        "--max-link-depth",
        "0",
        "--max-links-per-resource",
        "0",
        "--json",
    ]
    print("Rebuilding Bank Brain profiles from RouteOne docs...", flush=True)
    try:
        result = subprocess.run(command, cwd=ROOT, text=True, timeout=_env_int("XCONSOLE_BANK_BRAIN_REBUILD_TIMEOUT", 1800))
    except Exception as exc:
        print(f"Bank Brain startup rebuild skipped: {exc}", flush=True)
        return

    if result.returncode != 0:
        print(
            f"Bank Brain startup rebuild returned exit code {result.returncode}; app will continue with fallback/generated profiles.",
            flush=True,
        )


def _prime_inventory_assets_on_start() -> None:
    if not _env_flag("XCONSOLE_PRIME_INVENTORY_ASSETS_ON_START", True):
        return
    try:
        from app.api import _inventory_count_summary, _load_inventory_candidates, _prime_inventory_asset_summaries

        items = _load_inventory_candidates()
        if not items:
            print("Inventory asset summary prime skipped: no packaged inventory cache found.", flush=True)
            return
        stats = _prime_inventory_asset_summaries(items)
        counts = _inventory_count_summary(items)
        print(
            "Inventory asset summaries primed: "
            f"items={len(items)} active={counts.get('active', 0)} "
            f"carfax={stats.get('with_carfax', 0)} errors={stats.get('errors', 0)}.",
            flush=True,
        )
    except Exception as exc:
        print(f"Inventory asset summary prime skipped: {exc}", flush=True)


def _restore_vehicle_asset_seed_on_start() -> None:
    if not _env_flag("XCONSOLE_RESTORE_VEHICLE_ASSET_SEED_ON_START", True):
        return
    seed_dir = ROOT / "data" / "vehicle_assets_seed"
    target_dir = ROOT / "runtime" / "vehicle_assets"
    if not seed_dir.exists():
        return
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        copied = 0
        for source in seed_dir.glob("*.json"):
            target = target_dir / source.name
            shutil.copy2(source, target)
            copied += 1
        print(f"Vehicle asset seed restored: {copied} cached VIN file(s) copied.", flush=True)
    except Exception as exc:
        print(f"Vehicle asset seed restore skipped: {exc}", flush=True)


def _restore_facebook_session_seed_on_start() -> None:
    if not _env_flag("XCONSOLE_RESTORE_FACEBOOK_SESSION_ON_START", True):
        return
    seed_file = ROOT / "data" / "facebook_session_cookies.json"
    target_file = ROOT / "runtime" / "facebook_session_cookies.json"
    if not seed_file.exists():
        return
    try:
        target_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(seed_file, target_file)
        print("Facebook session seed restored to runtime cookie file.", flush=True)
    except Exception as exc:
        print(f"Facebook session seed restore skipped: {exc}", flush=True)


def main() -> int:
    _load_dotenv()
    public_port = os.getenv("PORT", "8100")
    sales_port = os.getenv("SALES_BACKEND_PORT", "4300")
    sales_entrypoint = ROOT / "sales-assistant" / "backend" / "dist" / "index.js"

    _rebuild_bank_brain_on_start()
    _restore_vehicle_asset_seed_on_start()
    _restore_facebook_session_seed_on_start()

    processes: list[subprocess.Popen[bytes]] = []

    sales_env = os.environ.copy()
    sales_env["PORT"] = sales_port
    sales = subprocess.Popen(
        ["node", str(sales_entrypoint)],
        cwd=ROOT / "sales-assistant" / "backend",
        env=sales_env,
    )
    processes.append(sales)

    api_env = os.environ.copy()
    api_env["SALES_ASSISTANT_BACKEND_URL"] = f"http://127.0.0.1:{sales_port}"
    api = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(public_port),
            "--no-access-log",
        ],
        cwd=ROOT,
        env=api_env,
    )
    processes.append(api)

    def handle_signal(signum: int, _frame: object) -> None:
        print(f"Received signal {signum}; stopping xConsole stack.", flush=True)
        _terminate(processes)
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    print(
        f"xConsole running on 0.0.0.0:{public_port}; sales assistant backend on 127.0.0.1:{sales_port}.",
        flush=True,
    )

    threading.Thread(target=_prime_inventory_assets_on_start, name="inventory-asset-prime", daemon=True).start()

    while True:
        for process in processes:
            code = process.poll()
            if code is not None:
                _terminate(processes)
                return int(code or 1)
        time.sleep(1)


if __name__ == "__main__":
    raise SystemExit(main())
