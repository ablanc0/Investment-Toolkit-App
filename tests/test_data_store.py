"""Tests for services/data_store.py — portfolio persistence and CRUD helpers."""

import json
from unittest.mock import patch

import pytest


# ---------------------------------------------------------------------------
# load_portfolio / save_portfolio
# ---------------------------------------------------------------------------

def test_load_portfolio_missing_file(tmp_path):
    """load_portfolio returns template dict when file doesn't exist."""
    missing = tmp_path / "portfolio.json"
    with patch("services.data_store.PORTFOLIO_FILE", missing):
        from services.data_store import load_portfolio
        data = load_portfolio()

    assert isinstance(data, dict)
    assert data["positions"] == []
    assert data["watchlist"] == []
    assert data["cash"] == 0
    assert "goals" in data


def test_load_portfolio_reads_existing(tmp_portfolio):
    """load_portfolio reads JSON from disk when file exists."""
    tmp_path, portfolio_file, _ = tmp_portfolio
    with patch("services.data_store.PORTFOLIO_FILE", portfolio_file):
        from services.data_store import load_portfolio
        data = load_portfolio()

    assert data["cash"] == 5000
    assert len(data["positions"]) == 1
    assert data["positions"][0]["ticker"] == "AAPL"


def test_save_then_load_roundtrip(tmp_path):
    """save_portfolio then load_portfolio preserves data."""
    pf = tmp_path / "portfolio.json"
    pf.write_text(json.dumps({"positions": [], "cash": 0}))
    original = {"positions": [{"ticker": "GOOG", "shares": 5}], "cash": 999, "watchlist": []}

    with patch("services.data_store.PORTFOLIO_FILE", pf), \
         patch("services.backup.notify_backup"):
        from services.data_store import load_portfolio, save_portfolio
        save_portfolio(original)
        loaded = load_portfolio()

    assert loaded["cash"] == 999
    assert loaded["positions"][0]["ticker"] == "GOOG"


def test_save_portfolio_writes_json(tmp_path):
    """save_portfolio writes valid JSON to disk."""
    pf = tmp_path / "portfolio.json"
    pf.write_text("{}")
    data = {"positions": [], "cash": 42}

    with patch("services.data_store.PORTFOLIO_FILE", pf), \
         patch("services.backup.notify_backup"):
        from services.data_store import save_portfolio
        save_portfolio(data)

    raw = json.loads(pf.read_text())
    assert raw["cash"] == 42


# ---------------------------------------------------------------------------
# get_settings / save_settings
# ---------------------------------------------------------------------------

def test_get_settings_defaults(tmp_path):
    """get_settings returns DEFAULT_SETTINGS when no settings saved."""
    pf = tmp_path / "portfolio.json"
    pf.write_text(json.dumps({"positions": [], "settings": {}}))

    with patch("services.data_store.PORTFOLIO_FILE", pf):
        from services.data_store import get_settings
        settings = get_settings()

    assert "cacheTTL" in settings
    assert settings["cacheTTL"] == 300
    assert "display" in settings
    assert "signalThresholds" in settings


def test_save_settings_merges(tmp_path):
    """save_settings merges updates into existing settings."""
    pf = tmp_path / "portfolio.json"
    pf.write_text(json.dumps({"positions": [], "settings": {"cacheTTL": 300}}))

    with patch("services.data_store.PORTFOLIO_FILE", pf), \
         patch("services.backup.notify_backup"):
        from services.data_store import save_settings, get_settings
        result = save_settings({"cacheTTL": 600})

    assert result["cacheTTL"] == 600
    # Other defaults should still be present
    assert "display" in result


def test_save_settings_preserves_existing(tmp_path):
    """save_settings keeps keys not present in the update."""
    pf = tmp_path / "portfolio.json"
    pf.write_text(json.dumps({"positions": [], "settings": {"portfolioName": "Test"}}))

    with patch("services.data_store.PORTFOLIO_FILE", pf), \
         patch("services.backup.notify_backup"):
        from services.data_store import save_settings
        result = save_settings({"cacheTTL": 120})

    assert result["cacheTTL"] == 120
    assert result["portfolioName"] == "Test"


# ---------------------------------------------------------------------------
# CRUD helpers (need Flask app context for jsonify)
# ---------------------------------------------------------------------------

def test_crud_list(app, tmp_portfolio):
    """crud_list returns the list section from portfolio."""
    with app.app_context():
        from services.data_store import crud_list
        resp = crud_list("positions")
        data = resp.get_json()

    assert "positions" in data
    assert len(data["positions"]) == 1
    assert data["positions"][0]["ticker"] == "AAPL"


def test_crud_add(app, tmp_portfolio):
    """crud_add appends an item to the section."""
    with app.app_context():
        from services.data_store import crud_add, load_portfolio
        with patch("services.backup.notify_backup"):
            resp = crud_add("positions", {"ticker": "TSLA", "shares": 3})
        data = resp.get_json()

    assert data["ok"] is True
    assert data["item"]["ticker"] == "TSLA"


def test_crud_delete(app, tmp_portfolio):
    """crud_delete removes item at index."""
    with app.app_context():
        from services.data_store import crud_delete, load_portfolio
        with patch("services.backup.notify_backup"):
            resp = crud_delete("positions", 0)
        data = resp.get_json()

    assert data["ok"] is True
    assert data["removed"]["ticker"] == "AAPL"


def test_crud_delete_out_of_range(app, tmp_portfolio):
    """crud_delete returns 404 for out-of-range index."""
    with app.app_context():
        from services.data_store import crud_delete
        resp, status = crud_delete("positions", 99)
        data = resp.get_json()

    assert status == 404
    assert "error" in data
