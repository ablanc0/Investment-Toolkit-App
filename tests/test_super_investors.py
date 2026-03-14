"""Tests for Super Investors key stats computation and endpoint."""

import json
from unittest.mock import patch

import pytest

from routes.super_investors import _compute_key_stats


# ---------------------------------------------------------------------------
# Unit tests: _compute_key_stats
# ---------------------------------------------------------------------------

class TestComputeKeyStats:
    def test_empty_input(self):
        result = _compute_key_stats([])
        assert result["totalStocks"] == 0
        assert result["sectorCount"] == 0
        assert result["dividendPayers"] == 0
        assert result["avgPE"] == 0
        assert result["avgBeta"] == 0
        assert result["avgDivYield"] == 0
        assert result["yieldTiers"] == {"1pct": 0, "2pct": 0, "3pct": 0, "4pct": 0}

    def test_sector_counting(self):
        data = [
            {"sector": "Technology", "divYield": 0, "pe": 0, "beta": 0, "marketCap": 0},
            {"sector": "Technology", "divYield": 0, "pe": 0, "beta": 0, "marketCap": 0},
            {"sector": "Healthcare", "divYield": 0, "pe": 0, "beta": 0, "marketCap": 0},
        ]
        result = _compute_key_stats(data)
        assert result["sectorCount"] == 2
        # Sorted desc — Technology first
        assert result["sectors"][0] == ("Technology", 2)
        assert result["sectors"][1] == ("Healthcare", 1)

    def test_yield_tiers(self):
        data = [
            {"sector": "A", "divYield": 0.5, "pe": 0, "beta": 0, "marketCap": 0},
            {"sector": "A", "divYield": 1.5, "pe": 0, "beta": 0, "marketCap": 0},
            {"sector": "A", "divYield": 2.5, "pe": 0, "beta": 0, "marketCap": 0},
            {"sector": "A", "divYield": 3.5, "pe": 0, "beta": 0, "marketCap": 0},
            {"sector": "A", "divYield": 4.5, "pe": 0, "beta": 0, "marketCap": 0},
        ]
        result = _compute_key_stats(data)
        assert result["yieldTiers"]["1pct"] == 4  # 1.5, 2.5, 3.5, 4.5
        assert result["yieldTiers"]["2pct"] == 3  # 2.5, 3.5, 4.5
        assert result["yieldTiers"]["3pct"] == 2  # 3.5, 4.5
        assert result["yieldTiers"]["4pct"] == 1  # 4.5
        assert result["dividendPayers"] == 5  # all > 0

    def test_averages_exclude_zeros(self):
        data = [
            {"sector": "A", "divYield": 3.0, "pe": 20, "beta": 1.2, "marketCap": 1e9},
            {"sector": "B", "divYield": 0, "pe": 0, "beta": 0, "marketCap": 0},
            {"sector": "C", "divYield": 5.0, "pe": 30, "beta": 0.8, "marketCap": 2e9},
        ]
        result = _compute_key_stats(data)
        # Only non-zero values: divYield avg of 3.0 and 5.0
        assert result["avgDivYield"] == 4.0
        assert result["avgPE"] == 25.0
        assert result["avgBeta"] == 1.0
        assert result["dividendPayers"] == 2

    def test_unknown_sector_fallback(self):
        data = [
            {"sector": "", "divYield": 0, "pe": 0, "beta": 0, "marketCap": 0},
            {"sector": None, "divYield": 0, "pe": 0, "beta": 0, "marketCap": 0},
        ]
        result = _compute_key_stats(data)
        assert result["sectorCount"] == 1
        assert result["sectors"][0] == ("Unknown", 2)


# ---------------------------------------------------------------------------
# Integration tests: POST /api/super-investors/key-stats
# ---------------------------------------------------------------------------

def test_key_stats_endpoint(client):
    mock_data = {"price": 150, "sector": "Technology", "divYield": 1.5,
                 "pe": 25, "beta": 1.1, "marketCap": 2e12}
    with patch("routes.super_investors.fetch_ticker_data", return_value=mock_data):
        resp = client.post("/api/super-investors/key-stats",
                           data=json.dumps({"tickers": ["AAPL", "MSFT"]}),
                           content_type="application/json")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["tickerCount"] == 2
    assert data["stats"]["sectorCount"] == 1
    assert data["stats"]["avgPE"] == 25.0


def test_key_stats_empty_tickers(client):
    resp = client.post("/api/super-investors/key-stats",
                       data=json.dumps({"tickers": []}),
                       content_type="application/json")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["tickerCount"] == 0
    assert data["stats"]["totalStocks"] == 0
