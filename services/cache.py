"""
InvToolkit — In-memory + disk cache for yfinance and other API responses.
TTL-based cache with thread-safe access and JSON persistence.
"""

import json
import time
import threading

from config import CACHE_FILE, CACHE_TTL

_cache = {}
_cache_lock = threading.Lock()


def load_disk_cache():
    global _cache
    if CACHE_FILE.exists():
        try:
            _cache = json.loads(CACHE_FILE.read_text())
        except Exception:
            _cache = {}


def save_disk_cache():
    try:
        CACHE_FILE.write_text(json.dumps(_cache, default=str))
    except Exception:
        pass


def _get_ttl():
    """Get cache TTL from user settings, falling back to config constant."""
    try:
        from services.data_store import get_settings
        return get_settings().get("cacheTTL", CACHE_TTL)
    except Exception:
        return CACHE_TTL


def cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (time.time() - entry.get("ts", 0)) < _get_ttl():
            return entry["data"]
    return None


def cache_set(key, data):
    with _cache_lock:
        _cache[key] = {"ts": time.time(), "data": data}
        save_disk_cache()
