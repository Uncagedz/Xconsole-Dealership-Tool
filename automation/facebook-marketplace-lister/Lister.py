import json
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from Helpers import read_json
try:
    from colorama import Fore, Style
except Exception:
    class _NoColor:
        BLACK = RED = GREEN = YELLOW = BLUE = MAGENTA = CYAN = WHITE = RESET = RESET_ALL = ""
        BRIGHT = DIM = NORMAL = ""

    Fore = Style = _NoColor()
from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait


def _running_on_windows():
    return os.name == "nt" or sys.platform.startswith("win")


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


class Lister:
    def __init__(self):
        self.driver_file = "chromedriver.exe"
        self.sleep_time = float(os.getenv("FACEBOOK_FORM_SLEEP_SECONDS") or "0.22")
        self.field_wait_seconds = float(os.getenv("FACEBOOK_FIELD_WAIT_SECONDS") or str(self.sleep_time))
        self.post_navigation_wait_seconds = float(os.getenv("FACEBOOK_POST_NAV_WAIT_SECONDS") or "1.1")
        self.account_chooser_wait_seconds = float(os.getenv("FACEBOOK_ACCOUNT_CHOOSER_WAIT_SECONDS") or "0.45")
        self.publish_confirm_wait_seconds = int(_env_float("FACEBOOK_PUBLISH_CONFIRM_SECONDS", 30))
        self.quick_session_wait = _env_float("FACEBOOK_SESSION_CHECK_WAIT_SECONDS", 1.2)
        self.login_wait_seconds = int(_env_float("FACEBOOK_LOGIN_WAIT_SECONDS", 24))
        self.profile_dir = Path(os.getenv("FACEBOOK_CHROME_PROFILE_DIR") or "chrome-profile").resolve()
        self.cookie_file = Path(os.getenv("FACEBOOK_COOKIE_FILE") or "facebook_session_cookies.json").resolve()
        self.marketplace_vehicle_url = "https://www.facebook.com/marketplace/create/vehicle"
        self._vehicle_form_verified_at = 0.0
        self._pending_listing_title = ""
        self.headless = (
            not _running_on_windows()
            or os.getenv("FACEBOOK_HEADLESS", "").strip().lower() in {"1", "true", "yes"}
        )
        self.profile_dir.mkdir(parents=True, exist_ok=True)

        chrome_binary = self._find_chrome_binary()

        driver_path = self._find_chromedriver()
        if not driver_path:
            raise FileNotFoundError("Missing ChromeDriver. Set CHROMEDRIVER_PATH or install chromedriver.")

        chrome_service = Service(executable_path=str(driver_path))
        try:
            self.driver = webdriver.Chrome(
                service=chrome_service,
                options=self._build_chrome_options(self.profile_dir, chrome_binary),
            )
        except Exception:
            if not self.headless or _running_on_windows():
                raise
            fallback_dir = (self.profile_dir.parent / "facebook_auth_profile_headless").resolve()
            try:
                if fallback_dir.exists():
                    shutil.rmtree(fallback_dir, ignore_errors=True)
                fallback_dir.mkdir(parents=True, exist_ok=True)
            except Exception:
                raise
            self.profile_dir = fallback_dir
            self.driver = webdriver.Chrome(
                service=chrome_service,
                options=self._build_chrome_options(self.profile_dir, chrome_binary),
            )
        self.driver.set_page_load_timeout(int(_env_float("FACEBOOK_PAGE_LOAD_TIMEOUT_SECONDS", 18)))
        self.driver.implicitly_wait(_env_float("FACEBOOK_IMPLICIT_WAIT_SECONDS", 1.0))
        try:
            self.driver.execute_cdp_cmd(
                "Page.addScriptToEvaluateOnNewDocument",
                {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"},
            )
        except Exception:
            pass

    def _build_chrome_options(self, profile_dir, chrome_binary):
        chrome_options = webdriver.ChromeOptions()
        prefs = {"profile.default_content_setting_values.notifications": 2}
        chrome_options.add_experimental_option("prefs", prefs)
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option("useAutomationExtension", False)
        chrome_options.add_argument(f"--user-data-dir={Path(profile_dir).resolve()}")
        chrome_options.add_argument("--profile-directory=Default")
        chrome_options.add_argument("--disable-notifications")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--disable-background-networking")
        chrome_options.add_argument("--remote-debugging-port=0")
        chrome_options.page_load_strategy = "eager"
        if self.headless:
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--disable-software-rasterizer")
            chrome_options.add_argument("--window-size=1600,1200")
        else:
            chrome_options.add_argument("--start-maximized")
        if chrome_binary:
            chrome_options.binary_location = chrome_binary
        return chrome_options

    def _wait_for_page_ready(self, seconds: float) -> None:
        wait_seconds = max(0.2, float(seconds or 0.0))
        try:
            WebDriverWait(self.driver, wait_seconds).until(
                lambda driver: (driver.execute_script("return document.readyState") or "").strip().lower() == "complete"
            )
        except Exception:
            time.sleep(wait_seconds)

    def _safe_get(self, url: str, *, wait_seconds: float | None = None) -> None:
        try:
            self.driver.get(url)
        except TimeoutException:
            try:
                self.driver.execute_script("window.stop();")
            except Exception:
                pass
        self._wait_for_page_ready(wait_seconds if wait_seconds is not None else self.quick_session_wait)

    def _load_saved_cookies(self):
        if not self.cookie_file.exists():
            return False
        try:
            payload = json.loads(self.cookie_file.read_text(encoding="utf-8"))
        except Exception:
            return False
        cookies = payload.get("cookies") if isinstance(payload, dict) else payload
        if not isinstance(cookies, list) or not cookies:
            return False
        try:
            self._safe_get("https://www.facebook.com/", wait_seconds=self.quick_session_wait)
            added = 0
            for cookie in cookies:
                if not isinstance(cookie, dict) or not cookie.get("name") or cookie.get("value") is None:
                    continue
                clean_cookie = {
                    key: cookie[key]
                    for key in ("name", "value", "domain", "path", "secure", "httpOnly", "expiry", "sameSite")
                    if key in cookie and cookie[key] not in (None, "")
                }
                domain = str(clean_cookie.get("domain") or "")
                if domain and "facebook.com" not in domain:
                    continue
                if not clean_cookie.get("domain"):
                    clean_cookie["domain"] = ".facebook.com"
                if not clean_cookie.get("path"):
                    clean_cookie["path"] = "/"
                try:
                    self.driver.add_cookie(clean_cookie)
                    added += 1
                except Exception:
                    continue
            if added:
                self._safe_get(self.marketplace_vehicle_url, wait_seconds=self.quick_session_wait)
                return True
        except Exception:
            return False
        return False

    def save_cookies(self):
        try:
            cookies = self.driver.get_cookies()
        except Exception:
            return False
        if not cookies:
            return False
        self.cookie_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "saved_at": datetime.now().isoformat(),
            "source_url": self.driver.current_url,
            "cookies": cookies,
        }
        self.cookie_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return True

    def _find_chromedriver(self):
        env_driver = os.getenv("CHROMEDRIVER_PATH", "").strip()
        if env_driver and Path(env_driver).exists():
            return Path(env_driver)
        if not _running_on_windows():
            for command in ("chromedriver", "chromium-driver"):
                resolved = shutil.which(command)
                if resolved:
                    return Path(resolved)
        candidates = [Path("drivers") / "chromedriver.exe", Path("drivers") / "chromedriver"] if _running_on_windows() else [Path("drivers") / "chromedriver"]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        for candidate in (Path("drivers").glob("chromedriver*") if Path("drivers").exists() else []):
            if candidate.is_file():
                if not _running_on_windows() and candidate.suffix.lower() == ".exe":
                    continue
                return candidate
        commands = ("chromedriver", "chromedriver.exe") if _running_on_windows() else ("chromedriver", "chromium-driver")
        for command in commands:
            resolved = shutil.which(command)
            if resolved:
                return Path(resolved)
        return None

    def _find_chrome_binary(self):
        env_binary = os.getenv("CHROME_BINARY", "").strip()
        if env_binary and Path(env_binary).exists():
            return env_binary

        if not _running_on_windows():
            for command in ("chromium", "chromium-browser", "google-chrome", "chrome"):
                resolved = shutil.which(command)
                if resolved:
                    return resolved

        local_candidates = [
            Path("chrome-for-testing") / "chrome-win64" / "chrome.exe",
            Path("chrome-114") / "chrome-win64" / "chrome.exe",
            Path("chrome-win64") / "chrome.exe",
        ] if _running_on_windows() else []
        for candidate in local_candidates:
            if candidate.exists():
                return str(candidate.resolve())

        system_candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
        for candidate in system_candidates:
            if Path(candidate).exists():
                return candidate

        commands = ("chrome", "chrome.exe", "chromium", "chromium-browser", "google-chrome") if _running_on_windows() else ("chromium", "chromium-browser", "google-chrome", "chrome")
        for command in commands:
            resolved = shutil.which(command)
            if resolved:
                return resolved
        return None

    def read_accounts(self):
        account_id = os.getenv("FACEBOOK_LOGIN_ACCOUNT_ID") or os.getenv("FACEBOOK_ACCOUNT_ID")
        email = os.getenv("FACEBOOK_LOGIN_EMAIL") or os.getenv("FACEBOOK_ACCOUNT_EMAIL")
        password = os.getenv("FACEBOOK_LOGIN_PASSWORD") or os.getenv("FACEBOOK_ACCOUNT_PASSWORD")
        if account_id and email:
            return [
                {
                    "id": account_id,
                    "name": os.getenv("FACEBOOK_LOGIN_NAME") or "Facebook Login",
                    "email": email,
                    "password": password or "",
                }
            ]
        return read_json("accounts")["accounts"]

    def _dismiss_cookie_banner(self):
        cookie_selectors = [
            (By.XPATH, "//button[contains(., 'Allow all cookies')]"),
            (By.XPATH, "//button[contains(., 'Accept all')]"),
            (By.XPATH, "//button[contains(., 'Only allow essential cookies')]"),
            (By.XPATH, "//button[contains(., 'Allow essential and optional cookies')]"),
            (By.XPATH, "//div[@role='button' and contains(., 'Accept')]"),
        ]
        try:
            original_wait = _env_float("FACEBOOK_IMPLICIT_WAIT_SECONDS", 1.0)
            self.driver.implicitly_wait(0.2)
            for by, query in cookie_selectors:
                try:
                    button = self.driver.find_element(by, query)
                    if button.is_displayed() and button.is_enabled():
                        button.click()
                        time.sleep(self.field_wait_seconds)
                        return True
                except Exception:
                    continue
            return False
        finally:
            try:
                self.driver.implicitly_wait(original_wait)
            except Exception:
                pass

    def _summarize_inputs(self):
        snippets = []
        try:
            inputs = self.driver.find_elements(By.TAG_NAME, "input")[:20]
            for element in inputs:
                try:
                    snippets.append(
                        {
                            "id": element.get_attribute("id"),
                            "name": element.get_attribute("name"),
                            "type": element.get_attribute("type"),
                            "autocomplete": element.get_attribute("autocomplete"),
                            "placeholder": element.get_attribute("placeholder"),
                            "aria_label": element.get_attribute("aria-label"),
                        }
                    )
                except Exception:
                    continue
        except Exception:
            pass
        return snippets

    def _summarize_buttons(self):
        snippets = []
        try:
            elements = self.driver.find_elements(By.CSS_SELECTOR, "button, [role='button'], a")[:80]
            for element in elements:
                try:
                    text = (element.text or element.get_attribute("aria-label") or "").strip()
                    href = (element.get_attribute("href") or "").strip()
                    if not text and not href:
                        continue
                    snippets.append(
                        {
                            "text": text[:120],
                            "href": href[:240],
                            "displayed": element.is_displayed(),
                            "enabled": element.is_enabled(),
                        }
                    )
                except Exception:
                    continue
        except Exception:
            pass
        return snippets[:40]

    def _visible_named_input(self, name):
        for element in self.driver.find_elements(By.NAME, name):
            try:
                if element.is_displayed():
                    return element
            except Exception:
                continue
        return None

    def _page_has_login_form(self):
        return bool(self._visible_named_input("email") and self._visible_named_input("pass"))

    def _body_text(self):
        try:
            return (self.driver.find_element(By.TAG_NAME, "body").text or "").strip()
        except Exception:
            return ""

    def _account_hint_values(self, account_info=None):
        values = []
        if isinstance(account_info, dict):
            for key in ("name", "email"):
                raw = str(account_info.get(key) or "").strip()
                if raw:
                    values.append(raw)
            name = str(account_info.get("name") or "").strip()
            if name:
                first = name.split()[0].strip()
                if first and first.lower() not in {item.lower() for item in values}:
                    values.append(first)
        return values

    def _looks_like_account_chooser(self, account_info=None):
        text = self._body_text()
        lowered = text.lower()
        if self._page_has_login_form():
            return False
        if "login as" in lowered or "log in as" in lowered or "continue as" in lowered:
            return True
        if "not you" in lowered or "switch account" in lowered or "use another account" in lowered:
            hints = self._account_hint_values(account_info)
            return not hints or any(hint.lower() in lowered for hint in hints)
        return False

    def _click_account_chooser(self, account_info=None):
        hints = self._account_hint_values(account_info)
        label_terms = []
        for hint in hints:
            label_terms.extend(
                [
                    f"log in as {hint}",
                    f"login as {hint}",
                    f"continue as {hint}",
                    hint,
                ]
            )
        label_terms.extend(["continue as", "log in as", "login as", "continue"])

        try:
            elements = self.driver.find_elements(By.CSS_SELECTOR, "button, [role='button'], a")
        except Exception:
            elements = []

        best = None
        best_score = -1
        for element in elements:
            try:
                if not element.is_displayed() or not element.is_enabled():
                    continue
                text = (element.text or element.get_attribute("aria-label") or "").strip()
            except Exception:
                continue
            if not text:
                continue
            lowered = re.sub(r"\s+", " ", text).strip().lower()
            score = -1
            for hint in hints:
                hint_lower = hint.lower()
                if hint_lower and hint_lower in lowered:
                    score = max(score, 80)
                    if "continue" in lowered or "log in" in lowered or "login" in lowered:
                        score = max(score, 100)
            if any(term in lowered for term in ["continue as", "log in as", "login as"]):
                score = max(score, 70)
            elif lowered == "continue":
                score = max(score, 40)
            if "create new account" in lowered or "forgot" in lowered or "not you" in lowered or "another account" in lowered:
                score -= 60
            if score > best_score:
                best = element
                best_score = score

        if best is None or best_score < 35:
            # If confidence is low, still honor any visible Continue / Login action.
            for fallback in elements:
                try:
                    if not fallback.is_displayed() or not fallback.is_enabled():
                        continue
                    text = (fallback.text or fallback.get_attribute("aria-label") or "").strip().lower()
                    compact = re.sub(r"\s+", " ", text).strip()
                    if any(token in compact for token in ["continue", "log in", "login", "continue as"]):
                        if not any(block in compact for block in ["create new account", "another account", "forgot"]):
                            return self._click_element(fallback)
                except Exception:
                    continue
            return False
        return self._click_element(best)

    def _looks_like_vehicle_form(self):
        body_text = self._body_text().lower()
        if "sell a vehicle" in body_text or "vehicle details" in body_text:
            return True
        try:
            if self.driver.find_elements(By.CSS_SELECTOR, "input[type='file']"):
                return True
        except Exception:
            pass
        return bool(
            self._find_field_candidate(["price"], prefer_multiline=False, include_textboxes=False)
            or self._find_field_candidate(["mileage", "odometer"], prefer_multiline=False, include_textboxes=False)
            or self._find_field_candidate(["description"], prefer_multiline=True, include_textboxes=True)
        )

    def _session_status(self, *, quick_check: bool = False):
        current_url = (self.driver.current_url or "").lower()
        if quick_check and "marketplace/create/vehicle" in current_url:
            pass
        else:
            self._safe_get(self.marketplace_vehicle_url, wait_seconds=self.quick_session_wait if quick_check else 1.35)
        probe_wait = self.quick_session_wait if quick_check else 1.35
        self._dismiss_cookie_banner()

        current_url = self.driver.current_url or ""
        lowered_url = current_url.lower()
        body_preview = self._body_text()[:600]
        if "two_factor" in lowered_url or "checkpoint" in lowered_url or "remember_browser" in lowered_url:
            return {
                "ok": False,
                "authenticated": False,
                "state": "checkpoint",
                "current_url": current_url,
                "title": self.driver.title,
                "message": "Facebook requires one-time checkpoint/two-factor completion in the saved browser profile.",
                "inputs": self._summarize_inputs(),
                "body_preview": body_preview,
            }

        if self._page_has_login_form():
            return {
                "ok": False,
                "authenticated": False,
                "state": "login_required",
                "current_url": current_url,
                "title": self.driver.title,
                "inputs": self._summarize_inputs(),
                "body_preview": body_preview,
            }

        if self._looks_like_account_chooser():
            return {
                "ok": False,
                "authenticated": False,
                "state": "account_chooser",
                "current_url": current_url,
                "title": self.driver.title,
                "message": "Facebook is showing a saved-account chooser instead of Marketplace.",
                "buttons": self._summarize_buttons(),
                "body_preview": body_preview,
            }

        form_ready = self._looks_like_vehicle_form()
        if form_ready:
            self._vehicle_form_verified_at = time.time()
        return {
            "ok": True,
            "authenticated": True,
            "vehicle_form_ready": bool(form_ready),
            "state": "vehicle_form_ready" if form_ready else "authenticated_no_form",
            "current_url": current_url,
            "title": self.driver.title,
            "body_preview": body_preview,
        }

    def _wait_for_vehicle_form(self, timeout_seconds: float = 8.0):
        deadline = time.time() + max(2.5, timeout_seconds)
        while time.time() < deadline:
            status = self._session_status(quick_check=True)
            if status.get("state") == "checkpoint" or status.get("state") == "login_required":
                return status
            if status.get("vehicle_form_ready"):
                return status
            time.sleep(self.field_wait_seconds)
        return self._session_status(quick_check=False)

    def _ensure_vehicle_form(self, allow_recent=True):
        if allow_recent and self._vehicle_form_verified_at and time.time() - self._vehicle_form_verified_at < 45:
            if self._looks_like_vehicle_form() and not self._page_has_login_form():
                return {
                    "ok": True,
                    "authenticated": True,
                    "state": "vehicle_form_ready",
                    "current_url": self.driver.current_url,
                    "title": self.driver.title,
                    "body_preview": self._body_text()[:600],
                }

        status = self._session_status(quick_check=True)
        if status.get("authenticated") and status.get("ok"):
            return self._wait_for_vehicle_form()

        if status.get("state") == "login_required":
            self._load_saved_cookies()
            status = self._session_status(quick_check=False)
            if status.get("authenticated") and status.get("ok"):
                return self._wait_for_vehicle_form()

        if status.get("state") == "account_chooser":
            if self._click_account_chooser():
                time.sleep(self.account_chooser_wait_seconds)
                status = self._wait_for_vehicle_form(timeout_seconds=10.0)
                if status.get("authenticated") and status.get("ok"):
                    self.save_cookies()
                    return status

        return status

    def _scroll_into_view(self, element):
        try:
            self.driver.execute_script(
                "arguments[0].scrollIntoView({block:'center', inline:'nearest'});",
                element,
            )
        except Exception:
            pass

    def _click_element(self, element):
        self._scroll_into_view(element)
        try:
            element.click()
            return True
        except Exception:
            try:
                self.driver.execute_script("arguments[0].click();", element)
                return True
            except Exception:
                return False

    def _type_value(self, element, value, *, multiline=False):
        text = str(value or "").strip()
        if not text:
            return False
        self._scroll_into_view(element)
        tag_name = (element.tag_name or "").lower()
        content_editable = (element.get_attribute("contenteditable") or "").lower() == "true"
        self._click_element(element)
        try:
            element.send_keys(Keys.CONTROL, "a")
            element.send_keys(Keys.BACKSPACE)
        except Exception:
            pass
        try:
            if tag_name in {"input", "textarea"}:
                element.clear()
        except Exception:
            pass
        try:
            element.send_keys(text)
            return True
        except Exception:
            pass

        try:
            if content_editable or tag_name == "div":
                self.driver.execute_script(
                    """
                    const el = arguments[0];
                    const value = arguments[1];
                    el.focus();
                    el.textContent = value;
                    el.dispatchEvent(new InputEvent('input', {bubbles: true, data: value}));
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                    """,
                    element,
                    text,
                )
            else:
                self.driver.execute_script(
                    """
                    const el = arguments[0];
                    const value = arguments[1];
                    el.focus();
                    el.value = value;
                    el.dispatchEvent(new Event('input', {bubbles: true}));
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                    """,
                    element,
                    text,
                )
            return True
        except Exception:
            return False

    def _find_labeled_control(self, terms, *, clickable_only=False, prefer_multiline=False, include_textboxes=True):
        normalized = [str(term or "").strip().lower() for term in terms if str(term or "").strip()]
        if not normalized:
            return None

        control_selectors = [
            "input:not([type='hidden']):not([type='file'])",
            "textarea",
            "[role='combobox']",
            "[aria-haspopup='listbox']",
            "button",
            "[role='button']",
        ]
        if include_textboxes:
            control_selectors.extend(["[role='textbox']", "[contenteditable='true']"])
        if clickable_only:
            control_selectors = [
                "[role='combobox']",
                "[aria-haspopup='listbox']",
                "button",
                "[role='button']",
                "input:not([type='hidden']):not([type='file'])",
            ]

        script = """
        const terms = arguments[0];
        const clickableOnly = arguments[1];
        const preferMultiline = arguments[2];
        const controlSelector = arguments[3];
        const labels = Array.from(document.querySelectorAll('label, span, div, p, strong'));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const isVisible = (element) => {
          if (!element || !element.isConnected) return false;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return false;
          const style = window.getComputedStyle(element);
          return style.visibility !== 'hidden' && style.display !== 'none';
        };
        const scoreLabel = (text) => {
          if (!text || text.length > 80) return -1;
          let score = -1;
          for (const term of terms) {
            if (text === term) score = Math.max(score, 120);
            else if (text.startsWith(term)) score = Math.max(score, 95);
            else if (text.includes(term)) score = Math.max(score, 72);
          }
          return score;
        };
        const scoreControl = (control) => {
          if (!control || !isVisible(control)) return -1;
          const role = (control.getAttribute('role') || '').toLowerCase();
          const tag = (control.tagName || '').toLowerCase();
          let score = 0;
          if (role === 'combobox') score += 8;
          if (control.getAttribute('aria-haspopup') === 'listbox') score += 6;
          if (preferMultiline && (tag === 'textarea' || role === 'textbox' || control.getAttribute('contenteditable') === 'true')) score += 8;
          if (!preferMultiline && tag === 'input') score += 4;
          if (clickableOnly && (tag === 'button' || role === 'button')) score += 3;
          return score;
        };

        let best = null;
        let bestScore = -1;

        for (const label of labels) {
          if (!isVisible(label)) continue;
          const labelText = normalize(label.innerText || label.textContent || label.getAttribute('aria-label') || '');
          const labelScore = scoreLabel(labelText);
          if (labelScore < 0) continue;

          const candidateContainers = [
            label,
            label.closest('label'),
            label.closest('div'),
            label.closest('section'),
            label.parentElement,
            label.parentElement ? label.parentElement.parentElement : null,
          ].filter(Boolean);

          for (const container of candidateContainers) {
            const controls = Array.from(container.querySelectorAll(controlSelector));
            for (const control of controls) {
              const controlScore = scoreControl(control);
              if (controlScore < 0) continue;
              const total = labelScore + controlScore;
              if (total > bestScore) {
                best = control;
                bestScore = total;
              }
            }
          }
        }
        return best;
        """
        try:
            return self.driver.execute_script(
                script,
                normalized,
                clickable_only,
                prefer_multiline,
                ",".join(control_selectors),
            )
        except Exception:
            return None

    def _find_field_candidate(self, terms, *, prefer_multiline=False, include_textboxes=True):
        normalized = [str(term or "").strip().lower() for term in terms if str(term or "").strip()]
        if not normalized:
            return None

        selector = [
            "input:not([type='hidden']):not([type='file'])",
            "textarea",
        ]
        if include_textboxes:
            selector.extend(["[role='textbox']", "[contenteditable='true']"])

        direct_script = """
        const terms = arguments[0];
        const preferMultiline = arguments[1];
        const selector = arguments[2];
        const nodes = Array.from(document.querySelectorAll(selector));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();

        const scoreElement = (element) => {
          if (!element || !element.isConnected) return -1;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return -1;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') return -1;

          const tagName = (element.tagName || '').toLowerCase();
          const role = (element.getAttribute('role') || '').toLowerCase();
          const pieces = [
            element.getAttribute('aria-label') || '',
            element.getAttribute('placeholder') || '',
            element.getAttribute('name') || '',
            ((element.closest('div, form, section, label') || {}).innerText || '').slice(0, 140),
          ];
          const haystack = normalize(pieces.join(' '));
          if (!haystack || haystack.includes('search facebook')) return -1;

          let score = -1;
          for (const term of terms) {
            if (haystack === term) score = Math.max(score, 120);
            else if (haystack.startsWith(term)) score = Math.max(score, 100);
            else if (haystack.includes(term)) score = Math.max(score, 72);
          }
          if (score < 0) return -1;
          if (preferMultiline && (tagName === 'textarea' || role === 'textbox' || element.getAttribute('contenteditable') === 'true')) score += 10;
          if (!preferMultiline && tagName === 'input') score += 6;
          return score;
        };

        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          const score = scoreElement(element);
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            direct = self.driver.execute_script(direct_script, normalized, prefer_multiline, ",".join(selector))
        except Exception:
            direct = None
        if direct:
            return direct

        labeled = self._find_labeled_control(
            terms,
            clickable_only=False,
            prefer_multiline=prefer_multiline,
            include_textboxes=include_textboxes,
        )
        if labeled:
            return labeled

        script = """
        const terms = arguments[0];
        const preferMultiline = arguments[1];
        const selector = arguments[2];
        const nodes = Array.from(document.querySelectorAll(selector));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();

        const scoreElement = (element) => {
          if (!element || !element.isConnected) return -1;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return -1;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') return -1;

          let context = '';
          context += ' ' + (element.getAttribute('aria-label') || '');
          context += ' ' + (element.getAttribute('placeholder') || '');
          context += ' ' + (element.getAttribute('name') || '');
          context += ' ' + (element.getAttribute('id') || '');

          const wrappingLabel = element.closest('label');
          if (wrappingLabel) context += ' ' + wrappingLabel.innerText;
          if (element.id) {
            const forLabel = document.querySelector(`label[for="${element.id.replace(/"/g, '\\"')}"]`);
            if (forLabel) context += ' ' + forLabel.innerText;
          }
          const container = element.closest('div, form, section, label');
          if (container) context += ' ' + container.innerText.slice(0, 350);

          const haystack = normalize(context);
          if (!haystack) return -1;

          let score = 0;
          for (const term of terms) {
            if (haystack.includes(term)) {
              score += haystack.indexOf(term) < 120 ? 6 : 3;
            }
          }
          if (!score) return -1;

          const tagName = (element.tagName || '').toLowerCase();
          if (preferMultiline && (tagName === 'textarea' || (element.getAttribute('role') || '') === 'textbox')) {
            score += 6;
          }
          if (!preferMultiline && tagName === 'input') {
            score += 4;
          }
          return score;
        };

        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          const score = scoreElement(element);
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            return self.driver.execute_script(script, normalized, prefer_multiline, ",".join(selector))
        except Exception:
            return None

    def _find_clickable_candidate(self, terms):
        normalized = [str(term or "").strip().lower() for term in terms if str(term or "").strip()]
        if not normalized:
            return None

        labeled = self._find_labeled_control(
            terms,
            clickable_only=True,
            prefer_multiline=False,
            include_textboxes=False,
        )
        if labeled:
            return labeled

        selector = ",".join(
            [
                "[role='combobox']",
                "[aria-haspopup='listbox']",
                "button",
                "[role='button']",
                "input:not([type='hidden']):not([type='file'])",
            ]
        )
        script = """
        const terms = arguments[0];
        const selector = arguments[1];
        const nodes = Array.from(document.querySelectorAll(selector));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();

        const scoreElement = (element) => {
          if (!element || !element.isConnected) return -1;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return -1;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') return -1;

          let context = '';
          context += ' ' + (element.innerText || '');
          context += ' ' + (element.getAttribute('aria-label') || '');
          context += ' ' + (element.getAttribute('placeholder') || '');
          context += ' ' + (element.getAttribute('name') || '');
          context += ' ' + (element.getAttribute('id') || '');
          const container = element.closest('div, form, section, label');
          if (container) context += ' ' + container.innerText.slice(0, 350);
          const haystack = normalize(context);
          if (!haystack) return -1;

          let score = 0;
          for (const term of terms) {
            if (haystack.includes(term)) {
              score += haystack.indexOf(term) < 120 ? 5 : 2;
            }
          }
          if (!score) return -1;

          const role = (element.getAttribute('role') || '').toLowerCase();
          if (role === 'combobox') score += 5;
          if (element.getAttribute('aria-haspopup') === 'listbox') score += 3;
          if ((element.tagName || '').toLowerCase() === 'button') score += 2;
          return score;
        };

        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          const score = scoreElement(element);
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            return self.driver.execute_script(script, normalized, selector)
        except Exception:
            return None

    def _find_button_by_text(self, labels):
        normalized = [str(label or "").strip().lower() for label in labels if str(label or "").strip()]
        if not normalized:
            return None
        script = """
        const labels = arguments[0];
        const nodes = Array.from(document.querySelectorAll("button, [role='button'], a"));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();

        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          if (!element || !element.isConnected) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          const text = normalize(element.innerText || element.getAttribute('aria-label') || '');
          if (!text || text.length > 80) continue;
          let score = -1;
          for (const label of labels) {
            if (text === label) score = Math.max(score, 120);
            else if (text.startsWith(label)) score = Math.max(score, 90);
          }
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            return self.driver.execute_script(script, normalized)
        except Exception:
            return None

    def _find_option_candidate(self, values):
        normalized = [str(value or "").strip().lower() for value in values if str(value or "").strip()]
        if not normalized:
            return None

        selector = ",".join(["[role='option']", "li", "button", "[role='button']", "span", "div"])
        script = """
        const values = arguments[0];
        const selector = arguments[1];
        const nodes = Array.from(document.querySelectorAll(selector));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();

        const scoreElement = (element) => {
          if (!element || !element.isConnected) return -1;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return -1;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') return -1;

          const text = normalize(element.innerText || element.getAttribute('aria-label') || '');
          if (!text || text.length > 220) return -1;
          let score = -1;
          for (const value of values) {
            if (text === value) score = Math.max(score, 100);
            else if (text.startsWith(value)) score = Math.max(score, 90);
            else if (text.includes(value)) score = Math.max(score, 70);
          }
          return score;
        };

        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          const score = scoreElement(element);
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            return self.driver.execute_script(script, normalized, selector)
        except Exception:
            return None

    def _select_option(self, values):
        option = self._find_option_candidate(values)
        if not option:
            return False
        option_text = self._element_text_value(option)
        textual_targets = [str(value or "").strip() for value in values if re.search(r"[A-Za-z]", str(value or ""))]
        if textual_targets and self._looks_like_numeric_id(option_text):
            return False
        return self._click_element(option)

    def _ensure_checkbox_checked(self, terms):
        normalized = [str(term or "").strip().lower() for term in terms if str(term or "").strip()]
        if not normalized:
            return False
        script = """
        const terms = arguments[0];
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const nodes = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));
        const scoreElement = (element) => {
          if (!element || !element.isConnected) return -1;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return -1;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') return -1;
          let context = '';
          context += ' ' + (element.getAttribute('aria-label') || '');
          context += ' ' + (element.getAttribute('name') || '');
          const wrappingLabel = element.closest('label');
          if (wrappingLabel) context += ' ' + wrappingLabel.innerText;
          const container = element.closest('div, form, section, label');
          if (container) context += ' ' + container.innerText.slice(0, 260);
          const haystack = normalize(context);
          let score = 0;
          for (const term of terms) {
            if (haystack.includes(term)) score += haystack.indexOf(term) < 120 ? 8 : 3;
          }
          return score || -1;
        };
        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          const score = scoreElement(element);
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            checkbox = self.driver.execute_script(script, normalized)
        except Exception:
            checkbox = None
        if not checkbox:
            return False
        try:
            checked = checkbox.is_selected() or str(checkbox.get_attribute("aria-checked") or "").lower() == "true"
        except Exception:
            checked = False
        if checked:
            return True
        return self._click_element(checkbox)

    def _set_vehicle_type(self, value):
        expected = str(value or "Car/Truck").strip()
        if not expected:
            expected = "Car/Truck"
        field = self._find_clickable_candidate(["vehicle type"])
        if not field or not self._click_element(field):
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "required facebook vehicle field was not found",
                        "field_terms": ["vehicle type"],
                        "value": expected,
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )
        time.sleep(self.field_wait_seconds)
        if not self._select_option([expected]):
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "required facebook vehicle dropdown option was not selected",
                        "field_terms": ["vehicle type"],
                        "value": expected,
                        "option_values": [expected],
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": self._body_text()[:1200],
                    }
                )
            )
        deadline = time.time() + 8.0
        expected_text = expected.lower()
        while time.time() < deadline:
            body_text = re.sub(r"\s+", " ", self._body_text().lower())
            if (
                f"vehicle type {expected_text}" in body_text
                and ("body style" in body_text or "mileage" in body_text)
            ):
                return True
            time.sleep(max(self.field_wait_seconds, 0.35))
        body_text = re.sub(r"\s+", " ", self._body_text().lower())
        if f"vehicle type {expected_text}" not in body_text or ("body style" not in body_text and "mileage" not in body_text):
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook vehicle type did not switch to the expected vehicle form",
                        "expected": expected,
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": self._body_text()[:1200],
                    }
                )
            )
        return True

    def _set_verified_dropdown_value(self, terms, expected, *, option_values=None, required=False):
        clean_expected = str(expected or "").strip()
        if not clean_expected:
            return False
        clickable = self._find_clickable_candidate(terms)
        if not clickable or not self._click_element(clickable):
            if required:
                raise RuntimeError(
                    json.dumps(
                        {
                            "message": "required facebook vehicle field was not found",
                            "field_terms": terms,
                            "value": clean_expected,
                            "current_url": self.driver.current_url,
                            "title": self.driver.title,
                            "inputs": self._summarize_inputs(),
                        }
                    )
                )
            return False
        time.sleep(self.field_wait_seconds)
        values = option_values or [clean_expected]
        if not self._select_option_or_keyboard(clickable, values):
            if required:
                raise RuntimeError(
                    json.dumps(
                        {
                            "message": "required facebook vehicle dropdown option was not selected",
                            "field_terms": terms,
                            "value": clean_expected,
                            "option_values": values,
                            "current_url": self.driver.current_url,
                            "title": self.driver.title,
                            "inputs": self._summarize_inputs(),
                            "buttons": self._summarize_buttons(),
                            "body_preview": self._body_text()[:1200],
                        }
                    )
                )
            return False
        deadline = time.time() + 6.0
        while time.time() < deadline:
            body_text = re.sub(r"\s+", " ", self._body_text().lower())
            expected_text = clean_expected.lower()
            if any(f"{term.lower()} {expected_text}" in body_text for term in terms):
                return True
            candidate = self._find_clickable_candidate(terms)
            if candidate and self._value_matches_expected(self._element_text_value(candidate), clean_expected):
                return True
            time.sleep(max(self.field_wait_seconds, 0.3))
        if required:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook dropdown value did not stick after selection",
                        "field_terms": terms,
                        "value": clean_expected,
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": self._body_text()[:1200],
                    }
                )
            )
        return False

    def _set_description_value(self, value):
        text = str(value or "").strip()
        if not text:
            return False
        try:
            candidate = self.driver.execute_script(
                """
                const nodes = Array.from(document.querySelectorAll('textarea, [role="textbox"], [contenteditable="true"]'));
                for (const element of nodes) {
                  if (!element || !element.isConnected) continue;
                  const rect = element.getBoundingClientRect();
                  if (rect.width < 2 || rect.height < 2) continue;
                  const style = window.getComputedStyle(element);
                  if (style.visibility === 'hidden' || style.display === 'none') continue;
                  const tag = (element.tagName || '').toLowerCase();
                  if (tag === 'textarea') return element;
                }
                return null;
                """
            )
        except Exception:
            candidate = None
        if not candidate:
            candidate = self._find_field_candidate(
                ["description"],
                prefer_multiline=True,
                include_textboxes=True,
            )
        if not candidate:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "required facebook vehicle field was not found",
                        "field_terms": ["description"],
                        "value": text[:120],
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )
        if not self._type_value(candidate, text, multiline=True):
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook description field could not be typed",
                        "field_terms": ["description"],
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )
        try:
            self.driver.execute_script(
                """
                const element = arguments[0];
                const value = arguments[1];
                element.focus();
                if ('value' in element) {
                  const proto = Object.getPrototypeOf(element);
                  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
                  if (descriptor && descriptor.set) descriptor.set.call(element, value);
                  else element.value = value;
                } else {
                  element.textContent = value;
                }
                element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
                """,
                candidate,
                text,
            )
        except Exception:
            pass
        deadline = time.time() + 6.0
        first_line = text.splitlines()[0].strip().lower()
        while time.time() < deadline:
            body_text = self._body_text().lower()
            if first_line and first_line in body_text:
                return True
            if self._field_has_expected_value(["description"], text, multiline=True, include_textboxes=True):
                return True
            time.sleep(max(self.field_wait_seconds, 0.3))
        raise RuntimeError(
            json.dumps(
                {
                    "message": "facebook description did not stick after typing",
                    "field_terms": ["description"],
                    "current_url": self.driver.current_url,
                    "title": self.driver.title,
                    "inputs": self._summarize_inputs(),
                    "buttons": self._summarize_buttons(),
                    "body_preview": self._body_text()[:1200],
                }
            )
        )

    def _select_option_or_keyboard(self, element, values):
        if self._select_option(values):
            current_value = self._element_text_value(element)
            if self._value_matches_any_option(current_value, values):
                return True
        for _ in range(3):
            try:
                element.send_keys(Keys.ARROW_DOWN)
                time.sleep(self.field_wait_seconds)
                element.send_keys(Keys.ENTER)
                time.sleep(self.field_wait_seconds)
                current_value = self._element_text_value(element)
                if self._value_matches_any_option(current_value, values):
                    return True
            except Exception:
                break
        return False

    def _normalize_compare_value(self, value):
        return re.sub(r"\s+", " ", str(value or "").strip()).lower()

    def _value_matches_expected(self, actual, expected):
        actual_text = str(actual or "").strip()
        expected_text = str(expected or "").strip()
        if not actual_text or not expected_text:
            return False

        actual_digits = re.sub(r"[^\d]", "", actual_text)
        expected_digits = re.sub(r"[^\d]", "", expected_text)
        if actual_digits and expected_digits and actual_digits == expected_digits:
            return True

        normalized_actual = self._normalize_compare_value(actual_text)
        normalized_expected = self._normalize_compare_value(expected_text)
        if normalized_actual == normalized_expected:
            return True
        if normalized_expected in normalized_actual or normalized_actual in normalized_expected:
            return True
        return False

    def _value_matches_any_option(self, actual, values):
        for value in values or []:
            if self._value_matches_expected(actual, value):
                return True
        return False

    def _field_has_expected_value(self, terms, expected, *, multiline=False, include_textboxes=True):
        candidate = self._find_field_candidate(
            terms,
            prefer_multiline=multiline,
            include_textboxes=include_textboxes,
        )
        if candidate:
            actual_value = self._element_text_value(candidate)
            if self._value_matches_expected(actual_value, expected):
                return True
        clickable = self._find_clickable_candidate(terms)
        if clickable:
            actual_value = self._element_text_value(clickable)
            if self._value_matches_expected(actual_value, expected):
                return True
        return False

    def _element_text_value(self, element):
        if not element:
            return ""
        try:
            value = self.driver.execute_script(
                """
                const element = arguments[0];
                if (!element) return '';
                const normalize = (part) => (part || '').replace(/\\s+/g, ' ').trim();
                const role = (element.getAttribute('role') || '').toLowerCase();
                const isCombo = role === 'combobox' || element.getAttribute('aria-haspopup') === 'listbox';
                if (isCombo) {
                  const labelIds = (element.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean);
                  const labelTexts = labelIds
                    .map((id) => document.getElementById(id))
                    .filter(Boolean)
                    .map((node) => normalize(node.innerText || node.textContent || ''))
                    .filter(Boolean);
                  const descendants = Array.from(element.querySelectorAll('span, div, input, button'));
                  for (const node of descendants) {
                    const text = normalize(
                      node.value ||
                      node.getAttribute('aria-label') ||
                      node.innerText ||
                      node.textContent ||
                      ''
                    );
                    if (!text || labelTexts.includes(text)) continue;
                    if (text === 'Choose an option') continue;
                    return text;
                  }
                }
                const pieces = [
                  element.value || '',
                  element.getAttribute('aria-label') || '',
                  element.innerText || '',
                  element.textContent || '',
                ];
                return pieces.map((part) => normalize(part)).filter(Boolean)[0] || '';
                """,
                element,
            )
            return str(value or "").strip()
        except Exception:
            return ""

    def _looks_like_numeric_id(self, value):
        return bool(re.fullmatch(r"\d{8,}", str(value or "").strip()))

    def _normalized_marketplace_location(self, value):
        default_location = (
            str(os.getenv("FACEBOOK_MARKETPLACE_LOCATION_LABEL") or "Plantation, FL 33317").strip()
            or "Plantation, FL 33317"
        )
        clean_value = str(value or "").strip()
        if not clean_value:
            return default_location
        lowered = clean_value.lower()
        if "33317" in lowered:
            if "fort lauderdale" in lowered:
                return "Fort Lauderdale, FL 33317"
            return "Plantation, FL 33317"
        if "plantation" in lowered:
            return "Plantation, FL 33317"
        if "fort lauderdale" in lowered:
            return "Fort Lauderdale, FL 33317"
        return default_location

    def _location_value_acceptable(self, value):
        lowered = str(value or "").strip().lower()
        if not lowered:
            return False
        return any(token in lowered for token in ["plantation", "fort lauderdale", "33317"])

    def _find_location_input(self):
        script = """
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const nodes = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='file'])"));
        for (const element of nodes) {
          if (!element || !element.isConnected) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          const aria = normalize(element.getAttribute('aria-label') || '');
          const placeholder = normalize(element.getAttribute('placeholder') || '');
          const name = normalize(element.getAttribute('name') || '');
          const context = normalize((element.closest('div, form, section, label') || {}).innerText || '');
          if (
            aria === 'location'
            || placeholder === 'enter a city'
            || name === 'location'
            || (context.includes('location') && (aria === 'location' || placeholder.includes('city')))
          ) {
            return element;
          }
        }
        return null;
        """
        try:
            return self.driver.execute_script(script)
        except Exception:
            return None

    def _select_allowed_location_option(self):
        script = """
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const allowed = ['plantation', 'fort lauderdale', '33317'];
        const blocked = ['villaviciosa', 'asturias', ', as', 'spain'];
        const nodes = Array.from(document.querySelectorAll("[role='option'], li, button, [role='button'], span, div"));

        const scoreElement = (element) => {
          if (!element || !element.isConnected) return -1;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return -1;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') return -1;
          const text = normalize(element.innerText || element.getAttribute('aria-label') || '');
          if (!text || text.length > 180) return -1;
          if (blocked.some((token) => text.includes(token))) return -1;
          let score = 0;
          for (const token of allowed) {
            if (text.includes(token)) score += token === '33317' ? 8 : 12;
          }
          if (!score) return -1;
          if (text.includes('plantation, fl 33317')) score += 30;
          else if (text.includes('fort lauderdale, fl 33317')) score += 28;
          else if (text.includes('plantation')) score += 16;
          else if (text.includes('fort lauderdale')) score += 14;
          return score;
        };

        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          const score = scoreElement(element);
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            option = self.driver.execute_script(script)
        except Exception:
            option = None
        if not option:
            return False
        return self._click_element(option)

    def _set_location_value(self, value):
        clean_value = self._normalized_marketplace_location(value)
        option_values = [
            "Plantation, FL",
            "Plantation, FL 33317",
            "Fort Lauderdale, FL",
            "Fort Lauderdale, FL 33317",
            "33317",
        ]
        if clean_value not in option_values:
            option_values.append(clean_value)
        typed_values = ["33317", "Plantation, FL 33317", "Fort Lauderdale, FL 33317", clean_value]

        for typed in typed_values:
            text_candidate = self._find_location_input()
            if not text_candidate:
                text_candidate = self._find_field_candidate(
                    ["location", "city"],
                    prefer_multiline=False,
                    include_textboxes=False,
                )
            if not text_candidate:
                text_candidate = self._find_clickable_candidate(["location", "city"])
            if not text_candidate:
                continue
            if not self._type_value(text_candidate, typed, multiline=False):
                continue
            time.sleep(self.field_wait_seconds)
            if self._select_allowed_location_option():
                time.sleep(self.field_wait_seconds)
                current_value = self._element_text_value(text_candidate)
                if self._location_value_acceptable(current_value):
                    return True
            if self._select_option(option_values):
                time.sleep(self.field_wait_seconds)
                current_value = self._element_text_value(text_candidate)
                if self._location_value_acceptable(current_value):
                    return True
            if self._select_option_or_keyboard(text_candidate, option_values):
                time.sleep(self.field_wait_seconds)
                current_value = self._element_text_value(text_candidate)
                if self._location_value_acceptable(current_value):
                    return True

        raise RuntimeError(
            json.dumps(
                {
                    "message": "facebook marketplace location could not be selected",
                    "field": "location",
                    "value": clean_value,
                    "tried": typed_values,
                    "current_url": self.driver.current_url,
                    "title": self.driver.title,
                    "inputs": self._summarize_inputs(),
                    "body_preview": self._body_text()[:800],
                }
            )
        )

    def _set_field_value(self, terms, value, *, required=False, multiline=False, option_values=None):
        clean_value = str(value or "").strip()
        if not clean_value:
            return False

        if option_values and not multiline:
            clickable = self._find_clickable_candidate(terms)
            if clickable and self._click_element(clickable):
                time.sleep(self.field_wait_seconds)
                if self._select_option(option_values or [clean_value]):
                    time.sleep(self.field_wait_seconds)
                    if self._field_has_expected_value(terms, clean_value, multiline=multiline, include_textboxes=not bool(option_values) or multiline):
                        return True

        text_candidate = self._find_field_candidate(
            terms,
            prefer_multiline=multiline,
            include_textboxes=not bool(option_values) or multiline,
        )
        if text_candidate and self._type_value(text_candidate, clean_value, multiline=multiline):
            time.sleep(self.field_wait_seconds)
            if option_values:
                if self._select_option_or_keyboard(text_candidate, option_values):
                    time.sleep(self.field_wait_seconds)
                    if self._field_has_expected_value(terms, clean_value, multiline=multiline, include_textboxes=not bool(option_values) or multiline):
                        return True
                if required:
                    raise RuntimeError(
                        json.dumps(
                            {
                                "message": "required facebook vehicle dropdown option was not selected",
                                "field_terms": terms,
                                "value": clean_value,
                                "option_values": option_values,
                                "current_url": self.driver.current_url,
                                "title": self.driver.title,
                                "inputs": self._summarize_inputs(),
                                "buttons": self._summarize_buttons(),
                                "body_preview": self._body_text()[:1200],
                            }
                        )
                    )
            if self._field_has_expected_value(terms, clean_value, multiline=multiline, include_textboxes=not bool(option_values) or multiline):
                return True

        clickable = self._find_clickable_candidate(terms)
        if clickable and self._click_element(clickable):
            time.sleep(self.field_wait_seconds)
            if self._select_option(option_values or [clean_value]):
                time.sleep(self.field_wait_seconds)
                if self._field_has_expected_value(terms, clean_value, multiline=multiline, include_textboxes=not bool(option_values) or multiline):
                    return True

        if required:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "required facebook vehicle field was not found",
                        "field_terms": terms,
                        "value": clean_value,
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )
        return False

    def _parse_title_parts(self, title):
        text = str(title or "").strip()
        match = re.match(r"^(?P<year>(?:19|20)\d{2})\s+(?P<rest>.+)$", text)
        if not match:
            return {"year": "", "make": "", "model": "", "trim": ""}
        rest_tokens = match.group("rest").split()
        if len(rest_tokens) >= 3 and rest_tokens[1].lower() == "wrangler" and rest_tokens[2].lower() == "unlimited":
            return {
                "year": match.group("year"),
                "make": rest_tokens[0],
                "model": "Wrangler Unlimited",
                "trim": " ".join(rest_tokens[3:]),
            }
        if len(rest_tokens) >= 3 and rest_tokens[1].lower() == "grand" and rest_tokens[2].lower() == "cherokee":
            return {
                "year": match.group("year"),
                "make": rest_tokens[0],
                "model": "Grand Cherokee",
                "trim": " ".join(rest_tokens[3:]),
            }
        return {
            "year": match.group("year"),
            "make": rest_tokens[0] if len(rest_tokens) > 0 else "",
            "model": rest_tokens[1] if len(rest_tokens) > 1 else "",
            "trim": " ".join(rest_tokens[2:]) if len(rest_tokens) > 2 else "",
        }

    def _model_candidates(self, item, title_parts):
        candidates = []

        def add(value):
            clean = str(value or "").strip()
            if clean and not self._looks_like_numeric_id(clean) and clean not in candidates:
                candidates.append(clean)

        raw_model = str(item.get("model") or "").strip()
        model = str(title_parts.get("model") or "").strip()
        trim = str(title_parts.get("trim") or "").strip()
        trim_tokens = trim.split()

        add(raw_model)
        add(model)

        if model and trim_tokens:
            add(f"{model} {trim_tokens[0]}")

        if model.lower() == "wrangler unlimited":
            add("Wrangler")
        if model.lower() == "grand cherokee":
            add("Cherokee")

        return candidates or ([model] if model else [])

    def _normalized_transmission(self, value):
        lowered = str(value or "").strip().lower()
        if not lowered:
            return ""
        if "auto" in lowered or "cvt" in lowered:
            return "Automatic"
        if "manual" in lowered:
            return "Manual"
        return str(value or "").strip()

    def _normalized_price(self, value):
        digits = re.sub(r"[^\d]", "", str(value or ""))
        return digits or str(value or "").strip()

    def _normalized_mileage(self, value):
        digits = re.sub(r"[^\d]", "", str(value or ""))
        return digits

    def _infer_body_style(self, title):
        lowered = str(title or "").lower()
        if any(token in lowered for token in ["convertible", "roadster", "spyder", "cabriolet", "z4", "sl-class", "sl 55", "sl 63"]):
            return "Convertible"
        if any(token in lowered for token in ["coupe", "4 series", "m4", "mustang", "challenger", "camaro"]):
            return "Coupe"
        if any(token in lowered for token in ["wagon", "avant"]):
            return "Wagon"
        if any(token in lowered for token in ["hatchback", "liftback"]):
            return "Hatchback"
        if any(token in lowered for token in ["pacifica", "voyager", "caravan", "minivan"]):
            return "Minivan"
        if any(
            token in lowered
            for token in [
                "aviator",
                "armada",
                "bronco",
                "compass",
                "cx-9",
                "defender",
                "durango",
                "edge",
                "escape",
                "explorer",
                "expedition",
                "gls",
                "gle",
                "grand cherokee",
                "highlander",
                "hornet",
                "journey",
                "nautilus",
                "navigator",
                "palisade",
                "cayenne",
                "macan",
                "qx60",
                "pilot",
                "q5",
                "q7",
                "q8",
                "sahara",
                "suburban",
                "sq5",
                "sq7",
                "sq8",
                "suv",
                "telluride",
                "tahoe",
                "titan",
                "traverse",
                "wagoneer",
                "wrangler",
                "x5",
                "x6",
                "x3",
                "yukon",
            ]
        ):
            return "SUV"
        if any(token in lowered for token in ["charger", "dart", "300", "sedan"]):
            return "Sedan"
        if any(token in lowered for token in ["1500", "2500", "3500", "truck", "pickup", "ram"]):
            return "Truck"
        return ""

    def _normalized_body_style(self, value):
        lowered = str(value or "").strip().lower()
        if not lowered:
            return ""
        if any(token in lowered for token in ["convertible", "roadster", "cabriolet", "spyder", "soft top"]):
            return "Convertible"
        if "coupe" in lowered:
            return "Coupe"
        if any(token in lowered for token in ["hatchback", "liftback"]):
            return "Hatchback"
        if "wagon" in lowered:
            return "Wagon"
        if "minivan" in lowered:
            return "Minivan"
        if any(token in lowered for token in ["van", "cargo van", "passenger van"]) and "minivan" not in lowered:
            return "Van"
        if any(token in lowered for token in ["truck", "pickup", "supercrew", "crew cab", "super cab", "double cab", "quad cab", "king cab"]):
            return "Truck"
        if any(token in lowered for token in ["suv", "sport utility", "utility", "crossover"]):
            return "SUV"
        if "sedan" in lowered:
            return "Sedan"
        return str(value or "").strip()

    def _infer_fuel_type(self, item):
        blob = " ".join(
            [
                str(item.get("title") or ""),
                str(item.get("engine") or ""),
                str(item.get("description") or ""),
            ]
        ).lower()
        if any(token in blob for token in ["diesel", "eco diesel", "ecodiesel", "tdi", "duramax", "cummins", "power stroke"]):
            return "Diesel"
        if any(token in blob for token in ["electric", "ev", "bev"]):
            return "Electric"
        if any(token in blob for token in ["hybrid", "plug-in", "plug in", "phev", "4xe"]):
            return "Hybrid"
        return "Gasoline"

    def _normalized_fuel_type(self, value):
        lowered = str(value or "").strip().lower()
        if not lowered:
            return ""
        if any(token in lowered for token in ["electric", "bev", "ev"]):
            return "Electric"
        if any(token in lowered for token in ["hybrid", "plug-in", "plug in", "phev", "4xe"]):
            return "Hybrid"
        if any(token in lowered for token in ["diesel", "tdi", "duramax", "cummins", "power stroke", "ecodiesel"]):
            return "Diesel"
        if any(token in lowered for token in ["gasoline", "regular unleaded", "premium unleaded", "unleaded", "flex fuel"]):
            return "Gasoline"
        return str(value or "").strip()

    def _normalize_color(self, value):
        lowered = str(value or "").strip().lower()
        if not lowered:
            return ""

        token_map = [
            ("black", "Black"),
            ("white", "White"),
            ("ivory", "White"),
            ("pearl", "White"),
            ("silver", "Silver"),
            ("gray", "Gray"),
            ("grey", "Gray"),
            ("granite", "Gray"),
            ("charcoal", "Gray"),
            ("graphite", "Gray"),
            ("blue", "Blue"),
            ("navy", "Blue"),
            ("red", "Red"),
            ("burgundy", "Red"),
            ("maroon", "Red"),
            ("green", "Green"),
            ("olive", "Green"),
            ("brown", "Brown"),
            ("tan", "Brown"),
            ("beige", "Beige"),
            ("orange", "Orange"),
            ("yellow", "Yellow"),
            ("gold", "Gold"),
            ("purple", "Purple"),
            ("violet", "Purple"),
        ]
        for token, label in token_map:
            if token in lowered:
                return label
        return str(value or "").strip()

    def _upload_images(self, item):
        images = item.get("images") or []
        paths = [os.path.abspath(f"images/{image['file']}") for image in images if image.get("file")]
        if not paths:
            raise RuntimeError(json.dumps({"message": "no images supplied for facebook vehicle publish"}))

        log("Uploading Images", "main")
        upload = WebDriverWait(self.driver, 30).until(
            lambda driver: driver.find_element(By.CSS_SELECTOR, "input[type='file']")
        )
        self.driver.execute_script(
            """
            arguments[0].removeAttribute('hidden');
            arguments[0].style.display = 'block';
            arguments[0].style.visibility = 'visible';
            arguments[0].style.opacity = 1;
            """,
            upload,
        )
        upload.send_keys("\n".join(paths[:20]))
        log("Uploaded Images Successfully.", "success")

    def _required_publish_fields(self):
        return getattr(self, "_pending_publish_fields", []) or []

    def _required_publish_checkboxes(self):
        return getattr(self, "_pending_publish_checkboxes", []) or []

    def _element_is_interactive_enabled(self, element):
        if not element:
            return False
        try:
            if not element.is_displayed() or not element.is_enabled():
                return False
            aria_disabled = str(element.get_attribute("aria-disabled") or "").strip().lower()
            disabled_attr = str(element.get_attribute("disabled") or "").strip().lower()
            classes = str(element.get_attribute("class") or "").strip().lower()
            if aria_disabled == "true":
                return False
            if disabled_attr not in {"", "false", "none"}:
                return False
            if "disabled" in classes and "not-disabled" not in classes:
                return False
            return True
        except Exception:
            return False

    def _assert_ready_to_publish(self):
        body_text = self._body_text()
        lowered_body = body_text.lower()
        blockers = []
        blocker_tokens = [
            "please choose a body style",
            "please choose",
            "required",
            "must include",
            "enter a city",
        ]
        for token in blocker_tokens:
            if token in lowered_body:
                blockers.append(token)

        missing_fields = []
        for field in self._required_publish_fields():
            terms = field.get("terms") or []
            expected = field.get("expected") or ""
            multiline = bool(field.get("multiline"))
            include_textboxes = bool(field.get("include_textboxes", True))
            if not terms or not expected:
                continue
            if not self._field_has_expected_value(terms, expected, multiline=multiline, include_textboxes=include_textboxes):
                missing_fields.append(
                    {
                        "terms": terms,
                        "expected": expected,
                    }
                )

        unchecked_boxes = []
        for checkbox in self._required_publish_checkboxes():
            terms = checkbox.get("terms") or []
            if terms and not self._ensure_checkbox_checked(terms):
                unchecked_boxes.append({"terms": terms})

        if blockers or missing_fields or unchecked_boxes:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook vehicle form still has required fields before publish",
                        "blockers": blockers,
                        "missing_fields": missing_fields,
                        "unchecked_boxes": unchecked_boxes,
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": body_text[:1600],
                    }
                )
            )

    def _looks_like_publish_review_step(self):
        lowered_url = str(self.driver.current_url or "").strip().lower()
        body_text = self._body_text().lower()
        return (
            "step=audience" in lowered_url
            or "list in more places" in body_text
            or "list publicly" in body_text
            or "seller information" in body_text
        )

    def _assert_publish_review_ready(self):
        body_text = self._body_text()
        lowered_body = body_text.lower()
        blockers = []
        blocker_tokens = [
            "please choose",
            "required",
            "must include",
            "enter a city",
            "select a location",
        ]
        for token in blocker_tokens:
            if token in lowered_body:
                blockers.append(token)

        publish_button = self._find_button_by_text(["publish"]) or self._find_button_by_text(["post", "list"]) or self._find_clickable_candidate(["publish", "post", "list"])
        if not publish_button:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "publish button not found on facebook publish review step",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": body_text[:1600],
                    }
                )
            )
        if blockers:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook publish review step still shows validation blockers",
                        "blockers": blockers,
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": body_text[:1600],
                    }
                )
            )
        if not self._element_is_interactive_enabled(publish_button):
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook publish button is present but not enabled",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": body_text[:1600],
                    }
                )
            )
        return publish_button

    def _publish(self):
        self._assert_ready_to_publish()
        next_labels = ["next", "continue"]
        publish_labels = ["publish", "post", "list"]

        next_button = self._find_button_by_text(next_labels) or self._find_clickable_candidate(next_labels)
        if next_button:
            log("Clicking Next", "main")
            self._click_element(next_button)
            time.sleep(max(self.field_wait_seconds, 1.0))
        publish_button = None
        if self._looks_like_publish_review_step():
            publish_button = self._assert_publish_review_ready()
        else:
            self._assert_ready_to_publish()
            publish_button = self._find_button_by_text(["publish"]) or self._find_button_by_text(publish_labels) or self._find_clickable_candidate(publish_labels)
        if not publish_button:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "publish button not found on facebook vehicle form",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )
        if not self._element_is_interactive_enabled(publish_button):
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook publish button is present but not enabled",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": self._body_text()[:1600],
                    }
                )
            )

        log("Clicking Publish", "main")
        self._click_element(publish_button)

        try:
            return WebDriverWait(self.driver, self.publish_confirm_wait_seconds).until(
                lambda driver: self._publish_confirmation()
            )
        except TimeoutException as exc:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook publish was not confirmed by Marketplace",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": self._body_text()[:1200],
                    }
                )
            ) from exc

    def _canonical_marketplace_item_url(self, url):
        text = str(url or "").strip()
        if not text:
            return ""
        match = re.search(r"(https://www\.facebook\.com/marketplace/item/\d+)", text, flags=re.IGNORECASE)
        if match:
            return match.group(1)
        return text

    def _pending_title_tokens(self):
        title = str(self._pending_listing_title or "").strip().lower()
        return [token for token in re.findall(r"[a-z0-9]+", title) if len(token) > 2][:6]

    def _text_matches_pending_title(self, text, *, minimum_tokens=2):
        tokens = self._pending_title_tokens()
        if not tokens:
            return False
        lowered = str(text or "").strip().lower()
        if not lowered:
            return False
        matches = sum(1 for token in tokens if token in lowered)
        needed = min(max(1, minimum_tokens), len(tokens))
        return matches >= needed

    def _matching_selling_listing(self):
        title_tokens = self._pending_title_tokens()
        if not title_tokens:
            return None
        try:
            cards = self.driver.find_elements(By.CSS_SELECTOR, "a[href*='/marketplace/item/'], div, section, article, li")
        except Exception:
            cards = []

        best = None
        best_score = -1
        for element in cards:
            try:
                text = (element.text or "").strip()
                href = (element.get_attribute("href") or "").strip()
            except Exception:
                continue
            if not text:
                continue
            lowered = text.lower()
            score = sum(1 for token in title_tokens if token in lowered)
            if score <= 0:
                continue
            if "listed on marketplace" in lowered:
                score += 4
            if "being reviewed" in lowered or "active" in lowered:
                score += 3
            if href and "/marketplace/item/" in href.lower():
                score += 2
            if score > best_score:
                best = {"text": text, "href": href, "score": score}
                best_score = score
        return best if best_score >= min(2, len(title_tokens)) else None

    def _verify_marketplace_listing_visible(self, url):
        canonical_url = self._canonical_marketplace_item_url(url)
        if not canonical_url:
            return {"visible": False, "listing_url": "", "reason": "missing_item_url"}

        current_url = self.driver.current_url or ""
        try:
            self._safe_get(canonical_url, wait_seconds=max(self.post_navigation_wait_seconds, 1.8))
            time.sleep(max(self.field_wait_seconds, 0.4))
        except Exception:
            pass

        body_text = self._body_text()
        lowered_body = body_text.lower()
        title = str(self._pending_listing_title or "").strip().lower()
        title_tokens = [token for token in re.findall(r"[a-z0-9]+", title) if len(token) > 2][:5]
        title_matches = sum(1 for token in title_tokens if token in lowered_body)
        blocked_tokens = [
            "content isn't available",
            "this content isn't available",
            "may have been removed",
            "not available right now",
            "log into facebook",
            "log in to facebook",
            "you must log in",
            "sign up for facebook",
            "something went wrong",
            "marketplace isn't available",
        ]
        if any(token in lowered_body for token in blocked_tokens):
            return {
                "visible": False,
                "listing_url": canonical_url,
                "reason": "item_page_blocked",
                "current_url": self.driver.current_url,
                "body_preview": body_text[:800],
            }

        visible_tokens = [
            "message seller",
            "seller information",
            "vehicle details",
            "about this vehicle",
            "condition",
            "description",
        ]
        visible_signal = any(token in lowered_body for token in visible_tokens)
        looks_visible = title_matches >= min(2, len(title_tokens)) and visible_signal
        result = {
            "visible": looks_visible,
            "listing_url": canonical_url,
            "current_url": self.driver.current_url,
            "title_matches": title_matches,
            "body_preview": body_text[:800],
        }

        try:
            self._safe_get(current_url or self.marketplace_vehicle_url, wait_seconds=self.quick_session_wait)
        except Exception:
            pass
        return result

    def _publish_confirmation(self):
        current_url = self.driver.current_url or ""
        lowered_url = current_url.lower()
        body_text = self._body_text()
        lowered_body = body_text.lower()

        if "/marketplace/item/" in lowered_url:
            verified = self._verify_marketplace_listing_visible(current_url)
            if not verified.get("visible"):
                return {
                    "confirmed": True,
                    "confirmation": "marketplace_item_url_unverified",
                    "marketplace_status": "processing",
                    "listing_url": "",
                    "verification": verified,
                }
            return {
                "confirmed": True,
                "confirmation": "marketplace_item_url",
                "marketplace_status": "live",
                "listing_url": verified.get("listing_url") or self._canonical_marketplace_item_url(current_url),
                "verification": verified,
            }

        try:
            links = self.driver.find_elements(By.CSS_SELECTOR, "a[href*='/marketplace/item/']")
            for link in links:
                href = (link.get_attribute("href") or "").strip()
                if href:
                    try:
                        context_text = " ".join(
                            filter(
                                None,
                                [
                                    link.text,
                                    (link.find_element(By.XPATH, "./ancestor::*[self::div or self::article or self::li][1]").text or ""),
                                ],
                            )
                        )
                    except Exception:
                        context_text = link.text or ""
                    if not self._text_matches_pending_title(context_text, minimum_tokens=2):
                        continue
                    verified = self._verify_marketplace_listing_visible(href)
                    if not verified.get("visible"):
                        return {
                            "confirmed": True,
                            "confirmation": "marketplace_item_link_unverified",
                            "marketplace_status": "processing",
                            "listing_url": "",
                            "verification": verified,
                        }
                    return {
                        "confirmed": True,
                        "confirmation": "marketplace_item_link",
                        "marketplace_status": "live",
                        "listing_url": verified.get("listing_url") or self._canonical_marketplace_item_url(href),
                        "verification": verified,
                    }
        except Exception:
            pass

        success_tokens = [
            "your listing is now live",
            "listing is now live",
            "your listing has been published",
            "your listing was published",
            "successfully published",
            "successfully posted",
            "pending review",
            "view listing",
        ]
        if any(token in lowered_body for token in success_tokens):
            return {
                "confirmed": True,
                "confirmation": "success_text",
                "marketplace_status": "processing",
                "listing_url": "",
                "current_url": current_url,
            }

        if "/marketplace/you/selling" in lowered_url:
            matched_listing = self._matching_selling_listing()
            if matched_listing:
                listing_text = str(matched_listing.get("text") or "").lower()
                listing_href = self._canonical_marketplace_item_url(matched_listing.get("href") or "")
                if listing_href:
                    verified = self._verify_marketplace_listing_visible(listing_href)
                    if verified.get("visible"):
                        return {
                            "confirmed": True,
                            "confirmation": "selling_page_matching_item_link",
                            "marketplace_status": "live",
                            "listing_url": verified.get("listing_url") or listing_href,
                            "verification": verified,
                        }
                if "being reviewed" in listing_text or "active" in listing_text or "listed on marketplace" in listing_text:
                    return {
                        "confirmed": True,
                        "confirmation": "selling_page_matching_listing",
                        "marketplace_status": "processing",
                        "listing_url": listing_href or "",
                        "current_url": current_url,
                        "matched_listing": matched_listing,
                    }
            else:
                raise RuntimeError(
                    json.dumps(
                        {
                            "message": "facebook returned to selling dashboard without creating the expected listing",
                            "pending_title": self._pending_listing_title,
                            "current_url": current_url,
                            "title": self.driver.title,
                            "body_preview": body_text[:1600],
                        }
                    )
                )

        if self._text_matches_pending_title(lowered_body, minimum_tokens=2):
            selling_confirmation = (
                "listed on marketplace" in lowered_body
                and (
                    "this listing is being reviewed" in lowered_body
                    or "being reviewed" in lowered_body
                    or "active" in lowered_body
                )
            )
            if selling_confirmation:
                return {
                    "confirmed": True,
                    "confirmation": "selling_page_listing_reviewed",
                    "marketplace_status": "processing",
                    "listing_url": "",
                    "current_url": current_url,
                }

        error_tokens = [
            "there was a problem",
            "something went wrong",
            "couldn't publish",
            "could not publish",
            "required",
            "must include",
        ]
        if any(token in lowered_body for token in error_tokens):
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook publish showed an error or validation issue",
                        "current_url": current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": body_text[:1200],
                    }
                )
            )

        return False

    def login(self, account_id):
        registered_accounts = self.read_accounts()
        account_info = list(filter(lambda acc: acc["id"] == account_id, registered_accounts))[0]
        log('Checking Facebook session for "%s" ..' % account_info["name"], "main")

        cookies_loaded = self._load_saved_cookies()
        profile_present = bool((self.profile_dir / "Default").exists())
        if cookies_loaded or profile_present:
            log(
                f"Saved Facebook session detected (cookies={'yes' if cookies_loaded else 'no'}, profile={'yes' if profile_present else 'no'}); checking Marketplace session.",
                "sub",
            )
        else:
            log("Saved Facebook session not found; checking Marketplace session.", "sub")
        status = self._session_status(quick_check=True)
        log(
            f"Session probe state: {status.get('state') or 'unknown'}"
            + (f" @ {status.get('current_url')}" if status.get("current_url") else ""),
            "sub",
        )

        if status.get("authenticated") and status.get("ok"):
            log("Existing authenticated session detected.", "success")
            self.save_cookies()
            return True
        if status.get("state") == "account_chooser":
            log(f"Facebook account chooser detected. Trying saved session for {account_info.get('name') or account_id}.", "main")
            if self._click_account_chooser(account_info):
                time.sleep(self.account_chooser_wait_seconds)
                status = self._session_status(quick_check=False)
                log(f"Account chooser result: {status.get('state') or 'unknown'}", "sub")
                if status.get("authenticated") and status.get("ok"):
                    log("Saved Facebook account session accepted.", "success")
                    self.save_cookies()
                    return True
        if status.get("state") == "checkpoint":
            raise RuntimeError(json.dumps(status))

        if os.getenv("FACEBOOK_REQUIRE_SAVED_SESSION", "").strip().lower() in {"1", "true", "yes"}:
            status["message"] = "Saved Facebook session is required. Authorize once and save cookies before live posting."
            raise RuntimeError(json.dumps(status))

        log("Saved session was not ready; opening Facebook login.", "main")
        self._safe_get("https://www.facebook.com/login", wait_seconds=self.post_navigation_wait_seconds)
        self._dismiss_cookie_banner()
        log("Facebook login page opened.", "sub")
        current_url = (self.driver.current_url or "").lower()
        if "two_factor" in current_url or "checkpoint" in current_url or "remember_browser" in current_url:
            raise RuntimeError(
                json.dumps(
                    {
                        "ok": False,
                        "authenticated": False,
                        "state": "checkpoint",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "message": "Facebook requires one-time checkpoint/two-factor completion in the saved browser profile.",
                        "inputs": self._summarize_inputs(),
                    }
                )
            )

        if self._looks_like_account_chooser(account_info):
            log(f"Facebook is asking to continue as {account_info.get('name') or account_id}.", "main")
            if self._click_account_chooser(account_info):
                time.sleep(self.account_chooser_wait_seconds)
                status = self._wait_for_vehicle_form(timeout_seconds=8.0)
                log(f"Saved-account continue result: {status.get('state') or 'unknown'}", "sub")
                if status.get("authenticated") and status.get("ok"):
                    log("Logged in through saved Facebook account chooser.", "success")
                    self.save_cookies()
                    return True

        email_input = self._visible_named_input("email")
        password_input = self._visible_named_input("pass")
        if not email_input or not password_input:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook login form was not found",
                        "state": "account_chooser" if self._looks_like_account_chooser(account_info) else "login_form_missing",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                        "buttons": self._summarize_buttons(),
                        "body_preview": self._body_text()[:1200],
                    }
                )
            )

        log("Submitting Facebook credentials.", "main")
        self._type_value(email_input, account_info["email"])
        self._type_value(password_input, account_info["password"])
        password_input.send_keys(Keys.ENTER)

        try:
            WebDriverWait(self.driver, self.login_wait_seconds).until(
                lambda driver: (
                    "login" not in (driver.current_url or "").lower()
                    or "two_factor" in (driver.current_url or "").lower()
                    or "checkpoint" in (driver.current_url or "").lower()
                    or self._looks_like_account_chooser(account_info)
                )
            )
        except TimeoutException:
            pass

        if self._looks_like_account_chooser(account_info):
            log(f"Facebook login landed on saved account chooser for {account_info.get('name') or account_id}.", "main")
            if self._click_account_chooser(account_info):
                time.sleep(self.account_chooser_wait_seconds)
        status = self._session_status(quick_check=False)
        if status.get("state") == "authenticated_no_form":
            try:
                self._safe_get(self.marketplace_vehicle_url, wait_seconds=self.post_navigation_wait_seconds)
                status = self._wait_for_vehicle_form(timeout_seconds=10.0)
            except Exception:
                pass
        elif status.get("state") == "login_required":
            time.sleep(max(1.0, self.account_chooser_wait_seconds))
            retry = self._session_status(quick_check=False)
            if retry.get("authenticated") and retry.get("ok"):
                status = retry
        log(f"Post-login session result: {status.get('state') or 'unknown'}", "sub")
        if status.get("authenticated") and status.get("ok"):
            log("Logged in Successfully.", "success")
            self.save_cookies()
            return True
        raise RuntimeError(json.dumps(status))

    def list(self, item):
        self._pending_listing_title = str(item.get("title") or "")
        status = self._ensure_vehicle_form()
        if not status.get("authenticated") or not status.get("ok"):
            raise RuntimeError(json.dumps(status))

        self._safe_get(self.marketplace_vehicle_url, wait_seconds=self.post_navigation_wait_seconds)

        if not self._looks_like_vehicle_form():
            status = self._wait_for_vehicle_form(timeout_seconds=8.0)
            if status.get("vehicle_form_ready"):
                pass
            else:
                raise RuntimeError(
                    json.dumps(
                        {
                            "message": "facebook vehicle form did not load",
                            "current_url": self.driver.current_url,
                            "title": self.driver.title,
                            "inputs": self._summarize_inputs(),
                        }
                    )
                )

        if not self._looks_like_vehicle_form():
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook vehicle form did not load",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )

        title_parts = self._parse_title_parts(item.get("title"))
        model_candidates = self._model_candidates(item, title_parts)
        exterior_color = self._normalize_color(item.get("exterior"))
        interior_color = self._normalize_color(item.get("interior"))
        transmission_value = self._normalized_transmission(item.get("transmission"))
        body_style_value = self._normalized_body_style(item.get("body_style") or self._infer_body_style(item.get("title")))
        fuel_type_value = self._normalized_fuel_type(item.get("fuel_type") or self._infer_fuel_type(item))
        self._set_vehicle_type(item.get("vehicle_type") or "Car/Truck")
        time.sleep(self.field_wait_seconds)

        location = self._normalized_marketplace_location(item.get("location"))
        log(f"Selecting Marketplace location: {location}", "main")
        self._set_location_value(location)
        time.sleep(self.field_wait_seconds)

        self._upload_images(item)
        time.sleep(self.field_wait_seconds)

        self._set_field_value(["price"], self._normalized_price(item.get("price")), required=True)
        time.sleep(self.field_wait_seconds)

        self._set_field_value(["year"], title_parts.get("year"), required=True)
        self._set_field_value(
            ["make"],
            title_parts.get("make"),
            required=True,
            option_values=[title_parts.get("make", "")],
        )
        self._set_field_value(
            ["model"],
            model_candidates[0] if model_candidates else title_parts.get("model"),
            required=True,
            option_values=model_candidates,
        )
        model_field = self._find_field_candidate(["model"], prefer_multiline=False, include_textboxes=True)
        model_display = self._element_text_value(model_field)
        if self._looks_like_numeric_id(model_display):
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook marketplace selected an invalid model value",
                        "field": "model",
                        "value": model_display,
                        "model_candidates": model_candidates,
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )
        self._set_field_value(["mileage", "odometer"], self._normalized_mileage(item.get("mileage")))
        self._set_field_value(
            ["body style"],
            body_style_value,
            required=True,
            option_values=[body_style_value],
        )
        self._set_field_value(
            ["vehicle condition", "condition"],
            item.get("condition") or "Good",
            option_values=[item.get("condition") or "Good", "Good", "Used"],
        )
        self._set_verified_dropdown_value(
            ["fuel type"],
            fuel_type_value,
            required=True,
            option_values=[fuel_type_value],
        )
        self._set_field_value(
            ["transmission"],
            transmission_value,
            option_values=[transmission_value or "", "Automatic", "Manual"],
        )
        self._set_verified_dropdown_value(
            ["exterior color", "exterior"],
            exterior_color,
            option_values=[exterior_color or ""],
            required=bool(exterior_color),
        )
        self._set_verified_dropdown_value(
            ["interior color", "interior"],
            interior_color,
            option_values=[interior_color or ""],
            required=False,
        )
        self._ensure_checkbox_checked(["clean title", "this vehicle has a clean title"])
        self._set_description_value(item.get("description"))
        self._pending_publish_fields = [
            {"terms": ["location", "city"], "expected": location, "include_textboxes": False},
            {"terms": ["price"], "expected": self._normalized_price(item.get("price")), "include_textboxes": False},
            {"terms": ["year"], "expected": title_parts.get("year"), "include_textboxes": False},
            {"terms": ["make"], "expected": title_parts.get("make"), "include_textboxes": False},
            {"terms": ["model"], "expected": model_candidates[0] if model_candidates else title_parts.get("model"), "include_textboxes": False},
            {"terms": ["body style"], "expected": body_style_value, "include_textboxes": False},
            {"terms": ["vehicle condition", "condition"], "expected": item.get("condition") or "Good", "include_textboxes": False},
            {"terms": ["fuel type"], "expected": fuel_type_value, "include_textboxes": False},
            {"terms": ["transmission"], "expected": transmission_value, "include_textboxes": False},
            {"terms": ["exterior color", "exterior"], "expected": exterior_color, "include_textboxes": False},
        ]
        self._pending_publish_checkboxes = [
            {"terms": ["clean title", "this vehicle has a clean title"]},
        ]

        confirmation = self._publish()
        self.save_cookies()
        status = str((confirmation or {}).get("marketplace_status") or "").strip().lower() if isinstance(confirmation, dict) else ""
        if status == "live":
            log("Marketplace listing confirmed live.", "success")
        elif status == "processing":
            log("Marketplace submission completed. Waiting for Facebook to expose a live item URL.", "main")
        else:
            log("Marketplace submission completed.", "main")
        return confirmation or {"confirmed": True}

    def close(self):
        try:
            self.driver.quit()
        except Exception:
            pass


def _write_live_status(message, type=None):
    status_file = os.getenv("FACEBOOK_PUBLISH_STATUS_FILE", "").strip()
    if not status_file:
        return
    try:
        path = Path(status_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "ok": True,
            "vin": os.getenv("FACEBOOK_PUBLISH_VIN", "").strip(),
            "title": os.getenv("FACEBOOK_PUBLISH_TITLE", "").strip(),
            "stage": str(message or ""),
            "type": type or "",
            "updated_at": datetime.now().isoformat(),
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except Exception:
        pass


def log(msg, type=None):
    _write_live_status(msg, type)
    now = datetime.now()
    current_time = now.strftime("%H:%M:%S")
    msg = "[%s] : %s" % (current_time, msg)
    if type is not None:
        if type == "failure":
            msg = Fore.RED + "\t- " + msg + Style.RESET_ALL
        elif type == "success":
            msg = Fore.GREEN + "\t+ " + msg + Style.RESET_ALL
        elif type == "sub":
            msg = Fore.WHITE + "\t> " + msg + Style.RESET_ALL
        elif type == "main":
            msg = Fore.WHITE + ">> " + msg + Style.RESET_ALL
        else:
            msg = msg + Style.RESET_ALL
    else:
        msg = msg + Style.RESET_ALL
    print(msg)
