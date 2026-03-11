"""API Health Tracking — monitors external service status and FMP quota."""

import time
import threading
from datetime import date, datetime

_health_lock = threading.Lock()

_DEFAULT_API = {"status": "unknown", "lastSuccess": None, "lastError": None, "lastErrorMsg": "", "latencyMs": None}

_api_health = {
    "fmp": dict(_DEFAULT_API),
    "yfinance": dict(_DEFAULT_API),
    "fred": dict(_DEFAULT_API),
    "edgar": dict(_DEFAULT_API),
    "rapidapi": dict(_DEFAULT_API),
    "elbstream": dict(_DEFAULT_API),
}

_fmp_quota = {"date": None, "count": 0, "limit": 250}


def record_api_call(api_name, success, latency_ms=None, error_msg=None):
    """Record an API call result. Thread-safe."""
    with _health_lock:
        h = _api_health.get(api_name)
        if not h:
            return
        now = datetime.now().isoformat()
        h["latencyMs"] = latency_ms
        if success:
            h["status"] = "ok"
            h["lastSuccess"] = now
        else:
            msg = error_msg or ""
            # Detect quota exhaustion for RapidAPI (monthly message or 429 rate limit)
            if api_name == "rapidapi" and ("MONTHLY" in msg.upper() or "429" in msg):
                h["status"] = "exhausted"
            else:
                h["status"] = "error"
            h["lastError"] = now
            h["lastErrorMsg"] = msg
        # Track FMP quota
        if api_name == "fmp":
            _check_quota_reset()
            _fmp_quota["count"] += 1
            _persist_quota()


def get_fmp_quota():
    """Return current FMP quota state. Auto-resets if date changed."""
    with _health_lock:
        _check_quota_reset()
        return {
            "used": _fmp_quota["count"],
            "limit": _fmp_quota["limit"],
            "remaining": max(0, _fmp_quota["limit"] - _fmp_quota["count"]),
            "date": _fmp_quota["date"],
        }


def _check_quota_reset():
    """Reset quota counter if date changed. Must hold _health_lock."""
    today = date.today().isoformat()
    if _fmp_quota["date"] != today:
        _fmp_quota["date"] = today
        _fmp_quota["count"] = 0


def get_health_summary():
    """Return full health dict for /api/health endpoint."""
    import copy
    with _health_lock:
        _check_quota_reset()
        return {
            "apis": copy.deepcopy(_api_health),
            "fmpQuota": {
                "used": _fmp_quota["count"],
                "limit": _fmp_quota["limit"],
                "remaining": max(0, _fmp_quota["limit"] - _fmp_quota["count"]),
                "date": _fmp_quota["date"],
            },
        }


def run_health_check():
    """Ping free/unlimited APIs only. Returns updated health summary.

    Quota-limited providers (FMP, RapidAPI) are SKIPPED — their status
    is tracked passively from real usage via resilient_get/resilient_post.
    This avoids wasting limited API calls on health pings.
    """
    import yfinance as yf
    from services.http_client import resilient_get

    # yfinance — free, unlimited
    start = time.time()
    try:
        info = yf.Ticker("AAPL").info or {}
        latency = int((time.time() - start) * 1000)
        ok = bool(info.get("currentPrice") or info.get("regularMarketPrice"))
        record_api_call("yfinance", success=ok, latency_ms=latency, error_msg=None if ok else "No price data")
    except Exception as e:
        record_api_call("yfinance", success=False, latency_ms=int((time.time() - start) * 1000), error_msg=str(e)[:80])

    # FRED — free, generous limits
    try:
        resilient_get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=AAA",
                       provider="fred", timeout=10, max_retries=0)
    except Exception as e:
        record_api_call("fred", success=False, error_msg=str(e)[:80])

    # EDGAR — free, 10 req/s
    try:
        from config import EDGAR_USER_AGENT
        resilient_get("https://www.sec.gov/files/company_tickers.json",
                       provider="edgar",
                       headers={"User-Agent": EDGAR_USER_AGENT},
                       timeout=10, max_retries=0)
    except Exception as e:
        record_api_call("edgar", success=False, error_msg=str(e)[:80])

    # Elbstream (Logos) — free
    try:
        from services.logo_svc import ELBSTREAM_URL
        r = resilient_get(f"{ELBSTREAM_URL}/AAPL", provider="elbstream",
                          params={"format": "png", "size": 250},
                          timeout=10, max_retries=0)
        if not (r.status_code == 200 and len(r.content) > 100):
            record_api_call("elbstream", success=False, error_msg=f"HTTP {r.status_code}")
    except Exception as e:
        record_api_call("elbstream", success=False, error_msg=str(e)[:80])

    # FMP (250/day) and RapidAPI (~100/month) — status tracked passively
    # from real usage. No dedicated health ping needed.

    return get_health_summary()


def load_quota_from_cache():
    """Restore FMP quota from cache.json on startup."""
    from services.cache import cache_get
    cached = cache_get("_fmp_quota")
    if cached and isinstance(cached, dict):
        with _health_lock:
            _fmp_quota["date"] = cached.get("date")
            _fmp_quota["count"] = cached.get("count", 0)
            _check_quota_reset()


def _persist_quota():
    """Save FMP quota to cache.json. Must hold _health_lock."""
    from services.cache import cache_set
    try:
        cache_set("_fmp_quota", {"date": _fmp_quota["date"], "count": _fmp_quota["count"]})
    except Exception:
        pass
