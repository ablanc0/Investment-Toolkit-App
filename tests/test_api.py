"""Tests for API routes — Flask test client hitting the blueprint endpoints."""

from unittest.mock import patch, MagicMock

import pytest


# ---------------------------------------------------------------------------
# /api/status
# ---------------------------------------------------------------------------

def test_status_returns_200(client):
    resp = client.get("/api/status")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert "dataSource" in data
    assert "timestamp" in data


def test_status_has_cache_entries(client):
    resp = client.get("/api/status")
    data = resp.get_json()
    assert "cacheEntries" in data


# ---------------------------------------------------------------------------
# /api/health
# ---------------------------------------------------------------------------

def test_health_returns_200(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "apis" in data
    assert "quotas" in data


# ---------------------------------------------------------------------------
# /api/settings  (GET + POST)
# ---------------------------------------------------------------------------

def test_settings_get_defaults(client):
    """GET /api/settings returns default settings keys."""
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "cacheTTL" in data
    assert "display" in data
    assert "signalThresholds" in data
    assert "valuationDefaults" in data


def test_settings_post_update(client):
    """POST /api/settings merges updates and returns updated settings."""
    resp = client.post("/api/settings", json={"cacheTTL": 600})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["cacheTTL"] == 600


def test_settings_post_persists(client):
    """After POST, GET reflects the updated value."""
    client.post("/api/settings", json={"cacheTTL": 900})
    resp = client.get("/api/settings")
    data = resp.get_json()
    assert data["cacheTTL"] == 900


def test_settings_post_invalid_body(client):
    """POST /api/settings with non-dict body returns 400."""
    resp = client.post("/api/settings", json="not a dict")
    assert resp.status_code == 400


def test_settings_api_key_masked(client):
    """POST with API key returns masked key in response."""
    client.post("/api/settings", json={"apiKeys": {"fmp": "abcdefgh1234"}})
    resp = client.get("/api/settings")
    data = resp.get_json()
    fmp_key = data["apiKeys"]["fmp"]
    assert fmp_key.startswith("****")
    assert fmp_key.endswith("1234")
    assert "abcdefgh" not in fmp_key


# ---------------------------------------------------------------------------
# /api/portfolio  (mocked external APIs)
# ---------------------------------------------------------------------------

@patch("routes.portfolio.fetch_all_quotes", return_value={})
@patch("routes.portfolio.fetch_dividends", return_value=[])
def test_portfolio_get(mock_div, mock_quotes, client):
    """GET /api/portfolio returns 200 with expected structure."""
    resp = client.get("/api/portfolio")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "positions" in data
    assert "summary" in data
    assert "allocations" in data
    assert isinstance(data["positions"], list)


@patch("routes.portfolio.fetch_all_quotes", return_value={
    "AAPL": {
        "price": 180.0,
        "previousClose": 178.0,
        "changePercent": 1.12,
        "name": "Apple Inc.",
        "divRate": 0.96,
        "divYield": 0.53,
        "pe": 28.5,
        "marketCap": 2800000000000,
        "beta": 1.2,
        "fiftyTwoWeekHigh": 200,
        "fiftyTwoWeekLow": 140,
        "targetMeanPrice": 195,
        "sector": "Technology",
    }
})
@patch("routes.portfolio.fetch_dividends", return_value=[])
def test_portfolio_enriched_data(mock_div, mock_quotes, client):
    """GET /api/portfolio enriches positions with live prices."""
    resp = client.get("/api/portfolio")
    data = resp.get_json()
    pos = data["positions"][0]
    assert pos["ticker"] == "AAPL"
    assert pos["price"] == 180.0
    assert pos["company"] == "Apple Inc."
    assert pos["marketValue"] == 1800.0  # 10 shares * $180
    assert pos["costBasis"] == 1500.0    # 10 shares * $150


# ---------------------------------------------------------------------------
# /api/cash/update
# ---------------------------------------------------------------------------

def test_cash_update(client):
    """POST /api/cash/update sets the cash balance."""
    resp = client.post("/api/cash/update", json={"cash": 10000})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["cash"] == 10000


# ---------------------------------------------------------------------------
# /api/watchlist/add + /api/watchlist/delete
# ---------------------------------------------------------------------------

def test_watchlist_add(client):
    """POST /api/watchlist/add adds a ticker."""
    resp = client.post("/api/watchlist/add", json={"ticker": "GOOG"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True


def test_watchlist_add_duplicate(client):
    """Adding an existing ticker returns 400."""
    resp = client.post("/api/watchlist/add", json={"ticker": "MSFT"})
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data


def test_watchlist_delete(client):
    """POST /api/watchlist/delete removes a ticker."""
    # First add then delete
    client.post("/api/watchlist/add", json={"ticker": "GOOG"})
    resp = client.post("/api/watchlist/delete", json={"ticker": "GOOG"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True


def test_watchlist_delete_nonexistent(client):
    """Deleting a ticker not on watchlist returns 404."""
    resp = client.post("/api/watchlist/delete", json={"ticker": "ZZZZ"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /api/position/add + /api/position/delete
# ---------------------------------------------------------------------------

def test_position_add(client):
    """POST /api/position/add creates a new position."""
    resp = client.post("/api/position/add", json={
        "ticker": "TSLA", "shares": 5, "avgCost": 250,
        "category": "Growth", "sector": "Consumer Cyclical", "secType": "Stocks"
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["position"]["ticker"] == "TSLA"


def test_position_add_duplicate(client):
    """Adding a duplicate ticker returns 400."""
    resp = client.post("/api/position/add", json={"ticker": "AAPL", "shares": 1, "avgCost": 100})
    assert resp.status_code == 400


def test_position_delete(client):
    """POST /api/position/delete removes a position."""
    resp = client.post("/api/position/delete", json={"ticker": "AAPL"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True


def test_position_delete_nonexistent(client):
    """Deleting a position not in portfolio returns 404."""
    resp = client.post("/api/position/delete", json={"ticker": "ZZZZ"})
    assert resp.status_code == 404
