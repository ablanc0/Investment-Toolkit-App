"""
InvToolkit — Auto-backup service.
Copies critical data files from DATA_DIR → backups/ in the repo root.
SHA256 hash comparison skips unchanged files. Thread-safe debounced trigger.
"""

import hashlib
import shutil
import threading
from datetime import datetime
from pathlib import Path

from config import BASE_DIR, DATA_DIR

# ── Configuration ─────────────────────────────────────────────────────

BACKUP_DIR = BASE_DIR / "backups"
BACKUP_FILES = [
    "portfolio.json",
    "analyzer.json",
    "Investments Toolkit-v1.0.xlsx",
    # Excluded from git backup (still copied locally as safety net):
    #   cache.json — ephemeral TTL cache, auto-regenerated
    #   13f_history.json — 50+ MB, grows quarterly, too large for git
]
DEBOUNCE_SECONDS = 30

# ── State ─────────────────────────────────────────────────────────────

_backup_lock = threading.Lock()
_debounce_timer = None
_status = {
    "lastBackup": None,
    "filesCopied": 0,
    "filesSkipped": 0,
    "error": None,
    "running": False,
}


def _sha256(path):
    """Return hex digest of a file, or None if missing."""
    if not path.exists():
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def run_backup():
    """Copy changed files from DATA_DIR → backups/. Returns status dict."""
    with _backup_lock:
        if _status["running"]:
            return _status
        _status["running"] = True

    try:
        BACKUP_DIR.mkdir(exist_ok=True)
        copied = 0
        skipped = 0

        for fname in BACKUP_FILES:
            src = DATA_DIR / fname
            dst = BACKUP_DIR / fname
            if not src.exists():
                skipped += 1
                continue
            if _sha256(src) == _sha256(dst):
                skipped += 1
                continue
            shutil.copy2(src, dst)
            copied += 1

        with _backup_lock:
            _status["lastBackup"] = datetime.now().isoformat()
            _status["filesCopied"] = copied
            _status["filesSkipped"] = skipped
            _status["error"] = None

        label = f"{copied} copied, {skipped} skipped"
        print(f"[Backup] Completed: {label}")

    except Exception as exc:
        with _backup_lock:
            _status["error"] = str(exc)
        print(f"[Backup] Error: {exc}")

    finally:
        with _backup_lock:
            _status["running"] = False

    return _status


def notify_backup():
    """Debounced backup trigger — resets 30 s timer on every call."""
    global _debounce_timer
    with _backup_lock:
        if _debounce_timer is not None:
            _debounce_timer.cancel()
        _debounce_timer = threading.Timer(DEBOUNCE_SECONDS, run_backup)
        _debounce_timer.daemon = True
        _debounce_timer.start()


def get_backup_status():
    """Return a snapshot of the current backup state."""
    with _backup_lock:
        return dict(_status)
