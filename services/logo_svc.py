"""
InvToolkit — Ticker logo cache service.
Downloads logos from Elbstream API (primary) with FMP CDN fallback.
Caches as files on disk. Always requests PNG at 250px for retina quality.
"""

import time
from pathlib import Path
import requests as http_requests

LOGO_DIR = Path(__file__).resolve().parent.parent / "data" / "logos"
ELBSTREAM_URL = "https://api.elbstream.com/logos/symbol"
FMP_IMAGE_URL = "https://images.financialmodelingprep.com/symbol"


def get_logo_path(ticker):
    """Return (Path, mimetype) to cached logo file, fetching from APIs if needed.
    Cascade: disk cache → Elbstream → FMP CDN.
    Returns (None, None) if logo unavailable from all sources.
    """
    LOGO_DIR.mkdir(parents=True, exist_ok=True)

    # Check for existing cached file (png first, then legacy svg)
    for ext in ("png", "svg"):
        path = LOGO_DIR / f"{ticker}.{ext}"
        if path.exists():
            mime = "image/png" if ext == "png" else "image/svg+xml"
            return path, mime

    # Try Elbstream (primary)
    result = _fetch_elbstream(ticker)
    if result:
        return result

    # Try FMP CDN (fallback, no API key needed)
    result = _fetch_fmp(ticker)
    if result:
        return result

    return None, None


def _fetch_elbstream(ticker):
    """Try Elbstream API. Returns (Path, mimetype) or None."""
    from services.api_health import record_api_call
    start = time.time()
    try:
        resp = http_requests.get(
            f"{ELBSTREAM_URL}/{ticker}",
            params={"format": "png", "size": 250},
            timeout=10,
        )
        latency = int((time.time() - start) * 1000)
        if resp.status_code == 200 and len(resp.content) > 100:
            path = LOGO_DIR / f"{ticker}.png"
            path.write_bytes(resp.content)
            record_api_call("elbstream", success=True, latency_ms=latency)
            return path, "image/png"
        record_api_call("elbstream", success=False, latency_ms=latency, error_msg=f"HTTP {resp.status_code}")
    except Exception as e:
        record_api_call("elbstream", success=False, latency_ms=int((time.time() - start) * 1000), error_msg=str(e)[:80])
    return None


def _fetch_fmp(ticker):
    """Try FMP image CDN (no API key). Returns (Path, mimetype) or None."""
    try:
        resp = http_requests.get(f"{FMP_IMAGE_URL}/{ticker}.png", timeout=10)
        if resp.status_code == 200 and len(resp.content) > 100:
            path = LOGO_DIR / f"{ticker}.png"
            path.write_bytes(resp.content)
            return path, "image/png"
    except Exception:
        pass
    return None
