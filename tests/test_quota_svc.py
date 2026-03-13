"""Tests for services/quota_svc.py — unified quota and rate limiting."""

import time
import json
from unittest.mock import patch
from collections import deque

import pytest


@pytest.fixture(autouse=True)
def _reset_quota_state():
    """Reset quota state before each test."""
    import services.quota_svc as qs
    qs._quotas = {}
    qs._rate_windows = {}
    yield
    qs._quotas = {}
    qs._rate_windows = {}


# ── Fixed-window quota tests ────────────────────────────────────────

def test_check_quota_fmp_allowed():
    """FMP with 0 used should be allowed with 250 remaining."""
    from services.quota_svc import check_quota
    result = check_quota("fmp")
    assert result["allowed"] is True
    assert result["remaining"] == 250
    assert result["used"] == 0
    assert result["limit"] == 250


def test_check_quota_fmp_exhausted():
    """FMP at limit should be blocked."""
    import services.quota_svc as qs
    from services.quota_svc import check_quota, _current_period
    with qs._quota_lock:
        qs._quotas["fmp"] = {"period": _current_period("daily"), "used": 250, "lastCall": None}
    result = check_quota("fmp")
    assert result["allowed"] is False
    assert result["remaining"] == 0


def test_record_call_increments():
    """record_call should increment the used counter."""
    from services.quota_svc import record_call, check_quota
    record_call("fmp")
    result = check_quota("fmp")
    assert result["used"] == 1
    assert result["remaining"] == 249


def test_record_call_multiple():
    """Multiple record_call should accumulate."""
    from services.quota_svc import record_call, check_quota
    for _ in range(5):
        record_call("rapidapi")
    result = check_quota("rapidapi")
    assert result["used"] == 5
    assert result["remaining"] == 0
    assert result["allowed"] is False


def test_auto_reset_on_new_day():
    """FMP quota should reset when date changes."""
    import services.quota_svc as qs
    from services.quota_svc import check_quota
    with qs._quota_lock:
        qs._quotas["fmp"] = {"period": "2020-01-01", "used": 200, "lastCall": None}
    result = check_quota("fmp")
    # Period changed → should auto-reset
    assert result["used"] == 0
    assert result["remaining"] == 250


def test_auto_reset_on_new_month():
    """Monthly quota should reset when month changes."""
    import services.quota_svc as qs
    from services.quota_svc import check_quota
    with qs._quota_lock:
        qs._quotas["rapidapi"] = {"period": "2020-01", "used": 5, "lastCall": None}
    result = check_quota("rapidapi")
    assert result["used"] == 0
    assert result["remaining"] == 5


# ── Sliding window rate limit tests ─────────────────────────────────

def test_edgar_rate_limit_allows_under_limit():
    """Under 10 calls/sec for EDGAR should be allowed."""
    from services.quota_svc import record_call, check_quota
    for _ in range(9):
        record_call("edgar")
    result = check_quota("edgar")
    assert result["allowed"] is True
    assert result["rate_limited"] is False


def test_edgar_rate_limit_blocks_at_limit():
    """At 10 calls/sec for EDGAR should be rate-limited."""
    from services.quota_svc import record_call, check_quota
    for _ in range(10):
        record_call("edgar")
    result = check_quota("edgar")
    assert result["allowed"] is False
    assert result["rate_limited"] is True
    assert result["rate_retry_after"] > 0


def test_edgar_rate_limit_clears_after_window():
    """After 1+ second, EDGAR rate window should clear."""
    import services.quota_svc as qs
    from services.quota_svc import check_quota

    # Simulate 10 calls 2 seconds ago
    past = time.time() - 2.0
    key = "edgar:1"
    with qs._quota_lock:
        qs._rate_windows[key] = deque([past] * 10)

    result = check_quota("edgar")
    assert result["allowed"] is True


def test_resettle_combined_quota_and_rate():
    """Resettle has both monthly quota and hourly rate limit."""
    from services.quota_svc import check_quota, record_call
    # Should start allowed
    result = check_quota("resettle")
    assert result["allowed"] is True
    assert result["remaining"] == 100
    assert result["limit"] == 100

    # Record some calls
    record_call("resettle")
    result = check_quota("resettle")
    assert result["used"] == 1
    assert result["remaining"] == 99


# ── Unlimited provider tests ────────────────────────────────────────

def test_unlimited_provider_always_allowed():
    """yfinance (no quota) should always be allowed."""
    from services.quota_svc import check_quota
    result = check_quota("yfinance")
    assert result["allowed"] is True
    assert result["remaining"] is None
    assert result["limit"] is None


def test_unknown_provider_allowed():
    """Unknown provider should be allowed (no quota config)."""
    from services.quota_svc import check_quota
    result = check_quota("nonexistent")
    assert result["allowed"] is True


# ── get_all_quotas tests ────────────────────────────────────────────

def test_get_all_quotas_returns_all_providers():
    """get_all_quotas should include all configured providers."""
    from services.quota_svc import get_all_quotas, PROVIDER_LIMITS
    result = get_all_quotas()
    for provider in PROVIDER_LIMITS:
        assert provider in result
        assert "label" in result[provider]
        assert "type" in result[provider]
        assert "used" in result[provider]


# ── Persistence tests ───────────────────────────────────────────────

def test_save_and_load_roundtrip(tmp_path):
    """Quotas should survive save/load cycle."""
    import services.quota_svc as qs
    from services.quota_svc import record_call, load_quotas

    # Override QUOTA_FILE to temp
    original_file = qs.QUOTA_FILE
    qs.QUOTA_FILE = tmp_path / "quota.json"
    try:
        record_call("fmp")
        record_call("fmp")
        record_call("rapidapi")

        # Reset in-memory and reload
        qs._quotas = {}
        load_quotas()

        assert qs._quotas["fmp"]["used"] == 2
        assert qs._quotas["rapidapi"]["used"] == 1
    finally:
        qs.QUOTA_FILE = original_file


# ── Migration tests ─────────────────────────────────────────────────

def test_migrate_from_col_quota(tmp_path):
    """Migration should read col_quota.json and populate quota.json."""
    import services.quota_svc as qs
    from datetime import datetime

    original_file = qs.QUOTA_FILE
    qs.QUOTA_FILE = tmp_path / "quota.json"

    # Create legacy col_quota.json
    col_quota_path = tmp_path / "col_quota.json"
    col_quota_path.write_text(json.dumps({
        "resettle": {"limit": 100, "period": datetime.now().strftime("%Y-%m"), "used": 15, "lastCall": None},
        "ditno": {"limit": 5, "period": datetime.now().strftime("%Y-%m"), "used": 3, "lastCall": None},
    }))

    try:
        with patch("config.COL_QUOTA_FILE", col_quota_path), \
             patch("config.CACHE_FILE", tmp_path / "nonexistent_cache.json"):
            qs.load_quotas()

        assert qs._quotas["resettle"]["used"] == 15
        assert qs._quotas["rapidapi"]["used"] == 3  # ditno → rapidapi
    finally:
        qs.QUOTA_FILE = original_file


# ── QuotaExhaustedError integration test ────────────────────────────

def test_quota_exhausted_error_attributes():
    """QuotaExhaustedError should carry provider info."""
    from services.http_client import QuotaExhaustedError
    err = QuotaExhaustedError("fmp", remaining=0, resets_at="2026-03-14T00:00:00")
    assert err.provider == "fmp"
    assert err.remaining == 0
    assert err.resets_at == "2026-03-14T00:00:00"
    assert "fmp" in str(err)
