"""API Health Tracking — monitors external service status.

Quota tracking is handled by services/quota_svc.py (unified system).
This module only tracks health status (ok/error/exhausted) and latency.
"""

import time
import threading
from datetime import datetime

_health_lock = threading.Lock()

_DEFAULT_API = {"status": "unknown", "lastSuccess": None, "lastError": None, "lastErrorMsg": "", "latencyMs": None}

_api_health = {
    "fmp": dict(_DEFAULT_API),
    "yfinance": dict(_DEFAULT_API),
    "fred": dict(_DEFAULT_API),
    "edgar": dict(_DEFAULT_API),
    "rapidapi": dict(_DEFAULT_API),
    "resettle": dict(_DEFAULT_API),
    "elbstream": dict(_DEFAULT_API),
}


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
            # Detect quota exhaustion (monthly message, 429, or explicit)
            if "MONTHLY" in msg.upper() or "429" in msg or "exhausted" in msg.lower():
                h["status"] = "exhausted"
            else:
                h["status"] = "error"
            h["lastError"] = now
            h["lastErrorMsg"] = msg


def get_health_summary():
    """Return full health dict for /api/health endpoint.

    Includes unified quota data from quota_svc.
    """
    import copy
    with _health_lock:
        summary = {"apis": copy.deepcopy(_api_health)}

    # Attach unified quota data (outside health_lock to avoid deadlock)
    try:
        from services.quota_svc import get_all_quotas
        summary["quotas"] = get_all_quotas()
    except Exception:
        summary["quotas"] = {}

    return summary


def run_health_check():
    """Ping free/unlimited APIs only. Returns updated health summary.

    Quota-limited providers (FMP, RapidAPI, Resettle) are SKIPPED — their status
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

    # FMP (250/day), RapidAPI (~5/month), Resettle (~100/month) — status
    # tracked passively from real usage. No dedicated health ping needed.

    return get_health_summary()
