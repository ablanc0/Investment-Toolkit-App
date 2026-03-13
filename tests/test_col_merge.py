"""Tests for COL smart merge logic in services/col_api.py."""

import json
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest


# ── _should_update tests ──────────────────────────────────────────────

def test_should_update_manual_never_overwritten():
    """Manual entries should never be overwritten regardless of timestamp."""
    from services.col_api import _should_update
    existing = {"source": "manual", "lastUpdated": "2020-01-01T00:00:00"}
    incoming = {"source": "api", "lastUpdated": "2026-12-31T00:00:00"}
    assert _should_update(existing, incoming) is False


def test_should_update_newer_timestamp_wins():
    """Incoming with newer timestamp should replace existing."""
    from services.col_api import _should_update
    existing = {"source": "api", "lastUpdated": "2026-01-01T00:00:00"}
    incoming = {"source": "api", "lastUpdated": "2026-06-01T00:00:00"}
    assert _should_update(existing, incoming) is True


def test_should_update_older_timestamp_keeps_existing():
    """Incoming with older timestamp should NOT replace existing."""
    from services.col_api import _should_update
    existing = {"source": "resettle", "lastUpdated": "2026-06-01T00:00:00"}
    incoming = {"source": "api", "lastUpdated": "2026-01-01T00:00:00"}
    assert _should_update(existing, incoming) is False


def test_should_update_incoming_has_timestamp_existing_does_not():
    """If only incoming has timestamp, update (existing is undated)."""
    from services.col_api import _should_update
    existing = {"source": "api", "lastUpdated": ""}
    incoming = {"source": "api", "lastUpdated": "2026-03-01T00:00:00"}
    assert _should_update(existing, incoming) is True


def test_should_update_existing_has_timestamp_incoming_does_not():
    """If only existing has timestamp, keep it (conservative)."""
    from services.col_api import _should_update
    existing = {"source": "resettle", "lastUpdated": "2026-03-01T00:00:00"}
    incoming = {"source": "api", "lastUpdated": ""}
    assert _should_update(existing, incoming) is False


def test_should_update_no_timestamps_more_complete_wins():
    """Without timestamps, more complete data wins."""
    from services.col_api import _should_update
    existing = {"source": "api", "lastUpdated": "", "rent1brCity": 1000}
    incoming = {"source": "api", "lastUpdated": "", "rent1brCity": 1200, "avgNetSalary": 5000, "utilities": 150}
    assert _should_update(existing, incoming) is True


def test_should_update_no_timestamps_tie_keeps_existing():
    """Without timestamps and equal completeness, keep existing."""
    from services.col_api import _should_update
    existing = {"source": "api", "lastUpdated": "", "rent1brCity": 1000}
    incoming = {"source": "api", "lastUpdated": "", "rent1brCity": 1200}
    assert _should_update(existing, incoming) is False


# ── Bulk merge preserves fresher data ─────────────────────────────────

@pytest.fixture(autouse=True)
def _reset_col_state():
    """Reset col_api module state before each test."""
    import services.col_api as ca
    ca._col_data = {}
    yield
    ca._col_data = {}


def test_bulk_merge_preserves_fresher_resettle():
    """ditno bulk fetch should NOT overwrite a fresher Resettle entry."""
    import services.col_api as ca

    # Pre-populate with a Resettle entry from last week
    recent_ts = (datetime.now() - timedelta(days=2)).isoformat()
    ca._col_data = {
        "cities": [
            {"name": "Madrid", "country": "Spain", "source": "resettle",
             "lastUpdated": recent_ts, "rent1brCity": 1200, "avgNetSalary": 2500},
        ],
        "cityNames": [],
    }

    # Incoming ditno data with older timestamp
    old_ts = (datetime.now() - timedelta(days=180)).isoformat()
    incoming = {"name": "Madrid", "country": "Spain", "source": "api",
                "lastUpdated": old_ts, "rent1brCity": 1000, "avgNetSalary": 2200}

    assert ca._should_update(ca._col_data["cities"][0], incoming) is False


def test_bulk_merge_updates_stale_entry():
    """ditno bulk fetch SHOULD update when incoming is fresher."""
    import services.col_api as ca

    old_ts = (datetime.now() - timedelta(days=180)).isoformat()
    ca._col_data = {
        "cities": [
            {"name": "Madrid", "country": "Spain", "source": "api",
             "lastUpdated": old_ts, "rent1brCity": 1000},
        ],
        "cityNames": [],
    }

    recent_ts = datetime.now().isoformat()
    incoming = {"name": "Madrid", "country": "Spain", "source": "api",
                "lastUpdated": recent_ts, "rent1brCity": 1200}

    assert ca._should_update(ca._col_data["cities"][0], incoming) is True


def test_upsert_uses_should_update(tmp_path):
    """_upsert_city should use timestamp logic, not inflation heuristic."""
    import services.col_api as ca

    # Mock save to avoid file I/O
    ca._col_data = {
        "cities": [
            {"name": "Berlin", "country": "Germany", "source": "resettle",
             "lastUpdated": "2026-06-01T00:00:00", "rent1brCity": 900},
        ],
    }

    with patch.object(ca, '_save_col_data'):
        # Try to upsert with older data — should be rejected
        older = {"name": "Berlin", "country": "Germany", "source": "api",
                 "lastUpdated": "2026-01-01T00:00:00", "rent1brCity": 800}
        result = ca._upsert_city(older)
        assert result["source"] == "resettle"  # Kept existing

        # Try to upsert with newer data — should replace
        newer = {"name": "Berlin", "country": "Germany", "source": "api",
                 "lastUpdated": "2026-12-01T00:00:00", "rent1brCity": 950}
        result = ca._upsert_city(newer)
        assert result["source"] == "api"  # Replaced


# ── Auto-refresh tests ────────────────────────────────────────────────

def test_auto_refresh_skips_when_fresh():
    """Auto-refresh should skip when data is less than 30 days old."""
    import services.col_api as ca

    ca._col_data = {"fetchedAt": datetime.now().isoformat()}

    with patch.object(ca, 'check_for_new_cities') as mock_check:
        ca.auto_refresh_if_stale()
        mock_check.assert_not_called()


def test_auto_refresh_skips_when_no_quota():
    """Auto-refresh should skip when ditno quota is exhausted."""
    import services.col_api as ca

    old = (datetime.now() - timedelta(days=60)).isoformat()
    ca._col_data = {"fetchedAt": old}

    with patch('services.quota_svc.check_quota', return_value={"allowed": False, "remaining": 0}), \
         patch.object(ca, 'check_for_new_cities') as mock_check:
        ca.auto_refresh_if_stale()
        mock_check.assert_not_called()


def test_auto_refresh_triggers_when_stale_with_quota():
    """Auto-refresh should trigger when data is stale and quota allows."""
    import services.col_api as ca
    import threading

    old = (datetime.now() - timedelta(days=60)).isoformat()
    ca._col_data = {"fetchedAt": old}

    with patch('services.quota_svc.check_quota', return_value={"allowed": True, "remaining": 5}), \
         patch.object(ca, 'check_for_new_cities') as mock_check, \
         patch.object(ca, 'fetch_city_details') as mock_fetch, \
         patch.object(threading, 'Thread') as mock_thread:
        mock_thread.return_value = MagicMock()
        ca.auto_refresh_if_stale()
        mock_thread.assert_called_once()
