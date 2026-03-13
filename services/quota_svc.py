"""InvToolkit — Unified API quota and rate-limiting service.

Replaces fragmented FMP quota tracking in api_health.py and COL quota
tracking in col_quota.py with a single system.

Three limit types:
  - Fixed-window counters for daily/monthly quotas (simple, predictable reset)
  - Sliding window for per-hour and per-second rate limits (in-memory only)
  - None for unlimited providers (status tracking only, no enforcement)

Storage: DATA_DIR/quota.json (persistent, no TTL eviction)
Thread-safe: all operations use a threading.Lock
"""

import json
import time
import threading
from collections import deque
from datetime import date, datetime

from config import QUOTA_FILE

_quota_lock = threading.Lock()
_quotas = {}          # Loaded from disk — fixed-window counters
_rate_windows = {}    # In-memory sliding windows — {key: deque of timestamps}

# ── Provider limit definitions ─────────────────────────────────────────
# type: "daily" | "monthly" | "none"
# rate_limits: optional list of sliding-window constraints

PROVIDER_LIMITS = {
    "fmp": {
        "type": "daily",
        "limit": 250,
        "label": "FMP (Financial Modeling Prep)",
        "description": "250 calls/day (free tier)",
    },
    "rapidapi": {
        "type": "monthly",
        "limit": 5,
        "label": "ditno (RapidAPI COL)",
        "description": "5 calls/month (free tier)",
    },
    "resettle": {
        "type": "monthly",
        "limit": 100,
        "label": "Resettle (COL Search)",
        "description": "100 calls/month (free tier)",
        "rate_limits": [
            {"limit": 10, "window_seconds": 3600, "label": "10/hour"},
        ],
    },
    "edgar": {
        "type": "none",
        "label": "SEC EDGAR",
        "description": "Free, 10 req/s rate limit",
        "rate_limits": [
            {"limit": 10, "window_seconds": 1, "label": "10/sec"},
        ],
    },
    "yfinance": {
        "type": "none",
        "label": "Yahoo Finance",
        "description": "Free, no enforced limit",
    },
    "fred": {
        "type": "none",
        "label": "FRED",
        "description": "Free, generous limits",
    },
    "elbstream": {
        "type": "none",
        "label": "Elbstream (Logos)",
        "description": "Free, no enforced limit",
    },
}


# ── Period helpers ──────────────────────────────────────────────────────

def _current_period(limit_type):
    """Return period string: 'YYYY-MM-DD' for daily, 'YYYY-MM' for monthly."""
    if limit_type == "daily":
        return date.today().isoformat()
    if limit_type == "monthly":
        return datetime.now().strftime("%Y-%m")
    return ""


def _get_reset_time(limit_type):
    """Calculate ISO datetime of next reset for UI display."""
    now = datetime.now()
    if limit_type == "daily":
        from datetime import timedelta
        tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        return tomorrow.isoformat()
    if limit_type == "monthly":
        if now.month == 12:
            reset = now.replace(year=now.year + 1, month=1, day=1,
                                hour=0, minute=0, second=0, microsecond=0)
        else:
            reset = now.replace(month=now.month + 1, day=1,
                                hour=0, minute=0, second=0, microsecond=0)
        return reset.isoformat()
    return None


# ── Internal state management ──────────────────────────────────────────

def _ensure_provider(provider):
    """Initialize provider entry if missing; auto-reset if period changed.

    Must hold _quota_lock. Returns the provider's quota dict.
    """
    config = PROVIDER_LIMITS.get(provider, {})
    limit_type = config.get("type", "none")

    if provider not in _quotas:
        _quotas[provider] = {
            "period": _current_period(limit_type),
            "used": 0,
            "lastCall": None,
        }
        return _quotas[provider]

    entry = _quotas[provider]
    current = _current_period(limit_type)
    if limit_type in ("daily", "monthly") and entry.get("period") != current:
        entry["used"] = 0
        entry["period"] = current

    return entry


def _save_quotas():
    """Persist current counters to quota.json. Must hold _quota_lock."""
    try:
        # Only persist providers that have counters (daily/monthly)
        data = {}
        for provider, entry in _quotas.items():
            config = PROVIDER_LIMITS.get(provider, {})
            if config.get("type") in ("daily", "monthly"):
                data[provider] = entry
        QUOTA_FILE.write_text(json.dumps(data, indent=2))
    except Exception as e:
        print(f"[Quota] Failed to save: {e}")


# ── Sliding window rate limiting ───────────────────────────────────────

def _check_rate_limit(provider):
    """Check all sliding-window rate limits for a provider.

    Returns (allowed: bool, retry_after_secs: float).
    Must hold _quota_lock.
    """
    config = PROVIDER_LIMITS.get(provider, {})
    rate_limits = config.get("rate_limits", [])
    if not rate_limits:
        return True, 0.0

    now = time.time()
    worst_retry = 0.0

    for rl in rate_limits:
        window = rl["window_seconds"]
        limit = rl["limit"]
        key = f"{provider}:{window}"

        if key not in _rate_windows:
            _rate_windows[key] = deque()

        dq = _rate_windows[key]

        # Prune expired entries
        cutoff = now - window
        while dq and dq[0] < cutoff:
            dq.popleft()

        if len(dq) >= limit:
            retry_after = dq[0] + window - now
            worst_retry = max(worst_retry, retry_after)

    return worst_retry <= 0, worst_retry


def _record_rate_window(provider):
    """Add current timestamp to all rate windows for this provider.

    Must hold _quota_lock.
    """
    config = PROVIDER_LIMITS.get(provider, {})
    rate_limits = config.get("rate_limits", [])
    if not rate_limits:
        return

    now = time.time()
    for rl in rate_limits:
        window = rl["window_seconds"]
        key = f"{provider}:{window}"
        if key not in _rate_windows:
            _rate_windows[key] = deque()
        _rate_windows[key].append(now)


# ── Public API ─────────────────────────────────────────────────────────

def check_quota(provider):
    """Pre-flight check: can we make a call to this provider right now?

    Checks both fixed-window quota (daily/monthly) and sliding-window
    rate limits. Returns dict with:
        allowed, remaining, limit, used, resets_at,
        rate_limited, rate_retry_after
    """
    config = PROVIDER_LIMITS.get(provider, {})
    limit_type = config.get("type", "none")

    with _quota_lock:
        entry = _ensure_provider(provider)
        used = entry.get("used", 0)

        # Fixed-window check
        limit = config.get("limit")
        if limit_type in ("daily", "monthly") and limit is not None:
            remaining = max(0, limit - used)
            if remaining <= 0:
                return {
                    "allowed": False,
                    "remaining": 0,
                    "limit": limit,
                    "used": used,
                    "resets_at": _get_reset_time(limit_type),
                    "rate_limited": False,
                    "rate_retry_after": 0,
                }
        else:
            remaining = None
            limit = None

        # Sliding-window rate limit check
        rate_ok, retry_after = _check_rate_limit(provider)
        if not rate_ok:
            return {
                "allowed": False,
                "remaining": remaining,
                "limit": limit,
                "used": used,
                "resets_at": _get_reset_time(limit_type),
                "rate_limited": True,
                "rate_retry_after": round(retry_after, 2),
            }

        return {
            "allowed": True,
            "remaining": remaining,
            "limit": limit,
            "used": used,
            "resets_at": _get_reset_time(limit_type),
            "rate_limited": False,
            "rate_retry_after": 0,
        }


def record_call(provider):
    """Record a consumed API call. Updates both counter and rate window.

    Returns updated quota dict (same shape as check_quota).
    """
    config = PROVIDER_LIMITS.get(provider, {})
    limit_type = config.get("type", "none")

    with _quota_lock:
        entry = _ensure_provider(provider)

        # Increment fixed-window counter
        if limit_type in ("daily", "monthly"):
            entry["used"] = entry.get("used", 0) + 1
            entry["lastCall"] = datetime.now().isoformat()
            _save_quotas()

        # Record in sliding window
        _record_rate_window(provider)

        # Return current state
        used = entry.get("used", 0)
        limit = config.get("limit")
        remaining = max(0, limit - used) if limit is not None else None

        return {
            "allowed": remaining is None or remaining > 0,
            "remaining": remaining,
            "limit": limit,
            "used": used,
            "resets_at": _get_reset_time(limit_type),
            "rate_limited": False,
            "rate_retry_after": 0,
        }


def get_all_quotas():
    """Return quota status for all providers (for unified UI).

    Returns dict keyed by provider name with full status.
    """
    result = {}
    now = time.time()

    with _quota_lock:
        for provider, config in PROVIDER_LIMITS.items():
            limit_type = config.get("type", "none")
            entry = _ensure_provider(provider)
            used = entry.get("used", 0)
            limit = config.get("limit")
            remaining = max(0, limit - used) if limit is not None else None

            # Rate limit info
            rate_info = []
            for rl in config.get("rate_limits", []):
                window = rl["window_seconds"]
                key = f"{provider}:{window}"
                dq = _rate_windows.get(key, deque())
                cutoff = now - window
                current = sum(1 for t in dq if t >= cutoff)
                rate_info.append({
                    "label": rl["label"],
                    "current": current,
                    "limit": rl["limit"],
                    "window_seconds": window,
                })

            result[provider] = {
                "label": config.get("label", provider),
                "description": config.get("description", ""),
                "type": limit_type,
                "used": used,
                "limit": limit,
                "remaining": remaining,
                "period": entry.get("period", ""),
                "resets_at": _get_reset_time(limit_type),
                "rate_limits": rate_info,
                "lastCall": entry.get("lastCall"),
            }

    return result


# ── Startup / Migration ───────────────────────────────────────────────

def load_quotas():
    """Load quota counters from quota.json on startup.

    On first run, migrates from legacy systems (col_quota.json, cache.json).
    """
    global _quotas
    with _quota_lock:
        if QUOTA_FILE.exists():
            try:
                _quotas = json.loads(QUOTA_FILE.read_text())
                # Auto-reset any expired periods
                for provider in list(_quotas.keys()):
                    _ensure_provider(provider)
                _save_quotas()
                count = sum(1 for p in _quotas if PROVIDER_LIMITS.get(p, {}).get("type") in ("daily", "monthly"))
                print(f"[Quota] Loaded {count} provider quotas from {QUOTA_FILE.name}")
                return
            except Exception as e:
                print(f"[Quota] Failed to load {QUOTA_FILE.name}: {e}")
                _quotas = {}

        # First run — attempt migration from legacy systems
        _migrate_legacy()
        _save_quotas()


def _migrate_legacy():
    """One-time migration from col_quota.json + cache.json → quota.json."""
    from config import COL_QUOTA_FILE, CACHE_FILE

    migrated = []

    # 1. Migrate COL quotas (resettle, ditno → rapidapi)
    if COL_QUOTA_FILE.exists():
        try:
            old = json.loads(COL_QUOTA_FILE.read_text())
            for provider, data in old.items():
                if not isinstance(data, dict):
                    continue
                target = "rapidapi" if provider == "ditno" else provider
                config = PROVIDER_LIMITS.get(target)
                if config and config.get("type") in ("daily", "monthly"):
                    _quotas[target] = {
                        "period": data.get("period", _current_period(config["type"])),
                        "used": data.get("used", 0),
                        "lastCall": data.get("lastCall"),
                    }
                    migrated.append(f"{provider}→{target}")
        except Exception as e:
            print(f"[Quota] Failed to migrate from col_quota.json: {e}")

    # 2. Migrate FMP quota from cache.json
    if CACHE_FILE.exists():
        try:
            cache = json.loads(CACHE_FILE.read_text())
            fmp_entry = cache.get("_fmp_quota", {})
            if isinstance(fmp_entry, dict):
                # cache.json wraps data in {"data": ..., "ts": ...}
                fmp_data = fmp_entry.get("data", fmp_entry)
                if fmp_data.get("date"):
                    _quotas["fmp"] = {
                        "period": fmp_data["date"],
                        "used": fmp_data.get("count", 0),
                        "lastCall": None,
                    }
                    migrated.append(f"fmp({fmp_data.get('count', 0)}/250)")
        except Exception as e:
            print(f"[Quota] Failed to migrate FMP from cache.json: {e}")

    if migrated:
        print(f"[Quota] Migrated legacy quotas: {', '.join(migrated)}")
    else:
        print("[Quota] No legacy quotas found — starting fresh")
