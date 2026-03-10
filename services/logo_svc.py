"""
InvToolkit — Ticker logo cache service.
Downloads logos from Elbstream API, caches as files on disk.
"""

from pathlib import Path
import requests as http_requests

LOGO_DIR = Path(__file__).resolve().parent.parent / "logos"
ELBSTREAM_URL = "https://api.elbstream.com/logos/symbol"


def get_logo_path(ticker):
    """Return (Path, mimetype) to cached logo file, fetching from Elbstream if needed.
    Returns (None, None) if logo unavailable.
    """
    LOGO_DIR.mkdir(exist_ok=True)

    # Check for existing cached file (svg or png)
    for ext in ("svg", "png"):
        path = LOGO_DIR / f"{ticker}.{ext}"
        if path.exists():
            mime = "image/svg+xml" if ext == "svg" else "image/png"
            return path, mime

    try:
        resp = http_requests.get(f"{ELBSTREAM_URL}/{ticker}", timeout=10)
        if resp.status_code == 200 and len(resp.content) > 100:
            ct = resp.headers.get("Content-Type", "")
            ext = "svg" if "svg" in ct else "png"
            mime = "image/svg+xml" if ext == "svg" else "image/png"
            path = LOGO_DIR / f"{ticker}.{ext}"
            path.write_bytes(resp.content)
            return path, mime
    except Exception:
        pass
    return None, None
