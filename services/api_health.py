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
            h["status"] = "error"
            h["lastError"] = now
            h["lastErrorMsg"] = error_msg or ""
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
    """Ping each API with lightweight test calls. Returns updated health summary."""
    import requests as http_requests
    import yfinance as yf
    from config import FMP_BASE
    from services.fmp import _get_fmp_key

    # FMP
    start = time.time()
    try:
        r = http_requests.get(f"{FMP_BASE}/profile", params={"symbol": "AAPL", "apikey": _get_fmp_key()}, timeout=10)
        latency = int((time.time() - start) * 1000)
        data = r.json()
        ok = isinstance(data, list) and len(data) > 0
        record_api_call("fmp", success=ok, latency_ms=latency, error_msg=None if ok else "Invalid response")
    except Exception as e:
        record_api_call("fmp", success=False, latency_ms=int((time.time() - start) * 1000), error_msg=str(e)[:80])

    # yfinance
    start = time.time()
    try:
        info = yf.Ticker("AAPL").info or {}
        latency = int((time.time() - start) * 1000)
        ok = bool(info.get("currentPrice") or info.get("regularMarketPrice"))
        record_api_call("yfinance", success=ok, latency_ms=latency, error_msg=None if ok else "No price data")
    except Exception as e:
        record_api_call("yfinance", success=False, latency_ms=int((time.time() - start) * 1000), error_msg=str(e)[:80])

    # FRED
    start = time.time()
    try:
        r = http_requests.head("https://fred.stlouisfed.org/graph/fredgraph.csv?id=AAA", timeout=10)
        latency = int((time.time() - start) * 1000)
        record_api_call("fred", success=r.status_code == 200, latency_ms=latency,
                        error_msg=None if r.status_code == 200 else f"HTTP {r.status_code}")
    except Exception as e:
        record_api_call("fred", success=False, latency_ms=int((time.time() - start) * 1000), error_msg=str(e)[:80])

    # EDGAR
    start = time.time()
    try:
        from config import EDGAR_USER_AGENT
        r = http_requests.get("https://www.sec.gov/files/company_tickers.json",
                              headers={"User-Agent": EDGAR_USER_AGENT}, timeout=10)
        latency = int((time.time() - start) * 1000)
        record_api_call("edgar", success=r.status_code == 200, latency_ms=latency,
                        error_msg=None if r.status_code == 200 else f"HTTP {r.status_code}")
    except Exception as e:
        record_api_call("edgar", success=False, latency_ms=int((time.time() - start) * 1000), error_msg=str(e)[:80])

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
