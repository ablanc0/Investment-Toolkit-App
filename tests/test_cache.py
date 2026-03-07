"""Tests for services/cache.py — in-memory TTL cache with disk persistence."""

import json
import time
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _clear_cache():
    """Reset the module-level cache dict before each test."""
    import services.cache as cache_mod
    cache_mod._cache.clear()
    yield
    cache_mod._cache.clear()


def test_cache_set_then_get(tmp_path):
    """cache_set stores data; cache_get retrieves it."""
    cache_file = tmp_path / "cache.json"
    with patch("services.cache.CACHE_FILE", cache_file), \
         patch("services.cache._get_ttl", return_value=300):
        from services.cache import cache_set, cache_get
        cache_set("mykey", {"value": 42})
        result = cache_get("mykey")

    assert result == {"value": 42}


def test_cache_get_nonexistent(tmp_path):
    """cache_get returns None for a key that was never set."""
    cache_file = tmp_path / "cache.json"
    with patch("services.cache.CACHE_FILE", cache_file), \
         patch("services.cache._get_ttl", return_value=300):
        from services.cache import cache_get
        result = cache_get("no_such_key")

    assert result is None


def test_cache_expiry(tmp_path):
    """Expired cache entries return None."""
    cache_file = tmp_path / "cache.json"
    with patch("services.cache.CACHE_FILE", cache_file), \
         patch("services.cache._get_ttl", return_value=1):
        from services.cache import cache_set, cache_get
        cache_set("expire_me", "data")
        # Manually backdate the timestamp to simulate expiry
        import services.cache as cache_mod
        cache_mod._cache["expire_me"]["ts"] = time.time() - 10
        result = cache_get("expire_me")

    assert result is None


def test_cache_not_expired(tmp_path):
    """Non-expired cache entries are returned."""
    cache_file = tmp_path / "cache.json"
    with patch("services.cache.CACHE_FILE", cache_file), \
         patch("services.cache._get_ttl", return_value=9999):
        from services.cache import cache_set, cache_get
        cache_set("keep_me", [1, 2, 3])
        result = cache_get("keep_me")

    assert result == [1, 2, 3]


def test_cache_disk_persistence(tmp_path):
    """cache_set writes data to disk (CACHE_FILE)."""
    cache_file = tmp_path / "cache.json"
    with patch("services.cache.CACHE_FILE", cache_file), \
         patch("services.cache._get_ttl", return_value=300):
        from services.cache import cache_set
        cache_set("persist_key", "persist_val")

    assert cache_file.exists()
    disk_data = json.loads(cache_file.read_text())
    assert "persist_key" in disk_data
    assert disk_data["persist_key"]["data"] == "persist_val"


def test_load_disk_cache(tmp_path):
    """load_disk_cache restores cache from a JSON file."""
    cache_file = tmp_path / "cache.json"
    cache_file.write_text(json.dumps({
        "restored_key": {"ts": time.time(), "data": "hello"}
    }))

    with patch("services.cache.CACHE_FILE", cache_file), \
         patch("services.cache._get_ttl", return_value=300):
        import services.cache as cache_mod
        cache_mod.load_disk_cache()
        result = cache_mod.cache_get("restored_key")

    assert result == "hello"
