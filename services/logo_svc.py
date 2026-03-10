"""
InvToolkit — Ticker logo cache service.
Downloads logos from Elbstream API, caches as files on disk.
Always requests PNG at 128px for consistent retina-quality rendering.
"""

from pathlib import Path
import requests as http_requests

LOGO_DIR = Path(__file__).resolve().parent.parent / "data" / "logos"
ELBSTREAM_URL = "https://api.elbstream.com/logos/symbol"


def get_logo_path(ticker):
    """Return (Path, mimetype) to cached logo file, fetching from Elbstream if needed.
    Returns (None, None) if logo unavailable.
    """
    LOGO_DIR.mkdir(parents=True, exist_ok=True)

    # Check for existing cached file (png first, then legacy svg)
    for ext in ("png", "svg"):
        path = LOGO_DIR / f"{ticker}.{ext}"
        if path.exists():
            mime = "image/png" if ext == "png" else "image/svg+xml"
            return path, mime

    try:
        resp = http_requests.get(
            f"{ELBSTREAM_URL}/{ticker}",
            params={"format": "png", "size": 128},
            timeout=10,
        )
        if resp.status_code == 200 and len(resp.content) > 100:
            path = LOGO_DIR / f"{ticker}.png"
            path.write_bytes(resp.content)
            return path, "image/png"
    except Exception:
        pass
    return None, None
