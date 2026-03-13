"""InvToolkit — COL provider quota tracking.

Persistent per-provider quota tracking stored in DATA_DIR/col_quota.json.
Supports auto-reset on new billing periods (monthly).
"""

import json
from datetime import datetime

from config import COL_QUOTA_FILE

# Default limits per provider
_PROVIDER_LIMITS = {
    "resettle": 100,  # 100 requests/month (free tier)
    "ditno": 5,       # 5 calls/month
}


def _load_quotas():
    """Load quota data from disk."""
    if COL_QUOTA_FILE.exists():
        try:
            return json.loads(COL_QUOTA_FILE.read_text())
        except Exception:
            pass
    return {}


def _save_quotas(data):
    """Persist quota data to disk."""
    try:
        COL_QUOTA_FILE.write_text(json.dumps(data, indent=2))
    except Exception as e:
        print(f"[Quota] Failed to save: {e}")


def _current_period():
    """Return current billing period as YYYY-MM string."""
    return datetime.now().strftime("%Y-%m")


def _ensure_provider(quotas, provider):
    """Ensure provider entry exists with defaults. Auto-resets if new period."""
    period = _current_period()
    if provider not in quotas:
        quotas[provider] = {
            "limit": _PROVIDER_LIMITS.get(provider, 100),
            "period": period,
            "used": 0,
            "lastCall": None,
        }
    elif quotas[provider].get("period") != period:
        # New billing period — reset counter
        quotas[provider]["used"] = 0
        quotas[provider]["period"] = period
    return quotas[provider]


def check_quota(provider):
    """Check if a provider has remaining quota.

    Returns {allowed: bool, remaining: int, limit: int, used: int}.
    Auto-resets counter if billing period has changed.
    """
    quotas = _load_quotas()
    entry = _ensure_provider(quotas, provider)
    _save_quotas(quotas)  # persist any auto-reset

    used = entry.get("used", 0)
    limit = entry.get("limit", _PROVIDER_LIMITS.get(provider, 100))
    remaining = max(0, limit - used)

    return {
        "allowed": remaining > 0,
        "remaining": remaining,
        "limit": limit,
        "used": used,
    }


def record_call(provider):
    """Record an API call for a provider. Returns updated quota dict."""
    quotas = _load_quotas()
    entry = _ensure_provider(quotas, provider)
    entry["used"] = entry.get("used", 0) + 1
    entry["lastCall"] = datetime.now().isoformat()
    _save_quotas(quotas)

    remaining = max(0, entry["limit"] - entry["used"])
    return {
        "allowed": remaining > 0,
        "remaining": remaining,
        "limit": entry["limit"],
        "used": entry["used"],
    }


def get_all_quotas():
    """Return full quota dict for all providers (for frontend display)."""
    quotas = _load_quotas()
    # Ensure all known providers are initialized
    for provider in _PROVIDER_LIMITS:
        _ensure_provider(quotas, provider)
    _save_quotas(quotas)
    return quotas
