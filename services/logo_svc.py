"""
InvToolkit — Ticker logo cache service.
Downloads logos from Elbstream API, caches as files on disk.
"""

import requests as http_requests
from config import DATA_DIR

LOGO_DIR = DATA_DIR / "logos"
ELBSTREAM_URL = "https://api.elbstream.com/logos/symbol"


def get_logo_path(ticker):
    """Return Path to cached logo file, fetching from Elbstream if needed.
    Returns None if logo unavailable.
    """
    LOGO_DIR.mkdir(exist_ok=True)
    path = LOGO_DIR / f"{ticker}.png"

    if path.exists():
        return path

    try:
        resp = http_requests.get(f"{ELBSTREAM_URL}/{ticker}", timeout=10)
        if resp.status_code == 200 and len(resp.content) > 100:
            path.write_bytes(resp.content)
            return path
    except Exception:
        pass
    return None
