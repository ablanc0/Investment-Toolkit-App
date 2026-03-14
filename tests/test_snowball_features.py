"""
Tests for snowball gap features — find-the-dip (SMA analysis) and dividend-safety endpoints.
"""

import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
import pandas as pd
import numpy as np


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_PORTFOLIO = {
    "positions": [
        {
            "ticker": "AAPL",
            "shares": 10,
            "avgCost": 150,
            "category": "Tech",
            "sector": "Technology",
            "secType": "Stock",
        },
        {
            "ticker": "MSFT",
            "shares": 5,
            "avgCost": 300,
            "category": "Tech",
            "sector": "Technology",
            "secType": "Stock",
        },
    ],
    "watchlist": [],
    "cash": 5000,
    "goals": {},
    "targets": {},
    "settings": {},
}


def _make_price_series(length, start=100.0, trend=0.1):
    """Create a realistic daily price series."""
    np.random.seed(42)
    dates = pd.bdate_range(end=pd.Timestamp.now(), periods=length)
    prices = [start]
    for i in range(1, len(dates)):
        change = np.random.normal(trend, 1.5)
        prices.append(max(prices[-1] + change, 1.0))
    return pd.Series(prices, index=dates, name="Close")


def _make_multi_ticker_df(tickers, length=250, prices=None):
    """Create a multi-ticker DataFrame matching yfinance download format."""
    data = {}
    for i, ticker in enumerate(tickers):
        if prices and ticker in prices:
            series = _make_price_series(length, start=prices[ticker])
        else:
            series = _make_price_series(length, start=100 + i * 50)
        data[ticker] = series
    df = pd.DataFrame(data)
    # yfinance returns MultiIndex columns: (Close, ticker)
    df.columns = pd.MultiIndex.from_tuples(
        [("Close", t) for t in tickers]
    )
    return df


def _make_analyzer_store(tickers_data):
    """Build a fake analyzer.json store.

    tickers_data: dict of ticker -> {payout_ratio, fcf_payout, dps_cagr, interest_cov}
    """
    store = {}
    for ticker, metrics in tickers_data.items():
        sr_metrics = []
        for key in ("payout_ratio", "fcf_payout", "dps_cagr"):
            val = metrics.get(key)
            sr_metrics.append({"key": key, "value5yr": val, "value10yr": None})

        debt_metrics = []
        cov = metrics.get("interest_cov")
        debt_metrics.append({"key": "interest_cov", "value5yr": cov, "value10yr": None})

        store[ticker] = {
            "invtScore": {
                "categories": {
                    "shareholder_returns": {"metrics": sr_metrics},
                    "debt": {"metrics": debt_metrics},
                }
            }
        }
    return store


# ===========================================================================
# /api/find-the-dip
# ===========================================================================


class TestFindTheDip:
    """Tests for GET /api/find-the-dip endpoint."""

    @patch("routes.portfolio.cache_get", return_value=None)
    @patch("routes.portfolio.cache_set")
    @patch("routes.portfolio.load_portfolio")
    @patch("yfinance.download")
    def test_returns_200_with_holdings(self, mock_yf_dl, mock_load, mock_cache_set, mock_cache_get, client):
        """Endpoint returns 200 and a list of holdings with SMA data."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        tickers = ["AAPL", "MSFT"]
        mock_yf_dl.return_value = _make_multi_ticker_df(tickers, length=250)

        resp = client.get("/api/find-the-dip")

        assert resp.status_code == 200
        data = resp.get_json()
        assert "holdings" in data
        assert len(data["holdings"]) == 2

    @patch("routes.portfolio.cache_get", return_value=None)
    @patch("routes.portfolio.cache_set")
    @patch("routes.portfolio.load_portfolio")
    @patch("yfinance.download")
    def test_sma_fields_present(self, mock_yf_dl, mock_load, mock_cache_set, mock_cache_get, client):
        """Each holding has SMA values and distance fields."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        tickers = ["AAPL", "MSFT"]
        mock_yf_dl.return_value = _make_multi_ticker_df(tickers, length=250)

        resp = client.get("/api/find-the-dip")

        data = resp.get_json()
        holding = data["holdings"][0]

        assert "ticker" in holding
        assert "price" in holding
        assert "sma10" in holding
        assert "dist10" in holding
        assert "sma50" in holding
        assert "dist50" in holding
        assert "sma200" in holding
        assert "dist200" in holding

    @patch("routes.portfolio.cache_get", return_value=None)
    @patch("routes.portfolio.cache_set")
    @patch("routes.portfolio.load_portfolio")
    @patch("yfinance.download")
    def test_sma_distance_calculation(self, mock_yf_dl, mock_load, mock_cache_set, mock_cache_get, client):
        """Distance is computed as (price / SMA - 1) * 100."""
        mock_load.return_value = {
            **SAMPLE_PORTFOLIO,
            "positions": [{"ticker": "AAPL", "shares": 10, "avgCost": 150, "category": "Tech"}],
        }

        # Create a single-ticker series
        series = _make_price_series(250, start=100)
        df = pd.DataFrame({"Close": series})
        mock_yf_dl.return_value = df

        resp = client.get("/api/find-the-dip")

        data = resp.get_json()
        assert len(data["holdings"]) == 1
        h = data["holdings"][0]

        # Verify dist = (price / sma - 1) * 100
        expected_dist10 = round((h["price"] / h["sma10"] - 1) * 100, 2)
        assert h["dist10"] == expected_dist10

    @patch("routes.portfolio.cache_get", return_value=None)
    @patch("routes.portfolio.cache_set")
    @patch("routes.portfolio.load_portfolio")
    def test_empty_portfolio(self, mock_load, mock_cache_set, mock_cache_get, client):
        """Returns empty holdings for portfolio with no positions."""
        mock_load.return_value = {**SAMPLE_PORTFOLIO, "positions": []}
        resp = client.get("/api/find-the-dip")

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["holdings"] == []

    @patch("routes.portfolio.cache_get")
    @patch("routes.portfolio.load_portfolio")
    def test_returns_cached_response(self, mock_load, mock_cache_get, client):
        """When cache has data, return it without calling yfinance."""
        cached_data = {
            "holdings": [{"ticker": "AAPL", "price": 180, "sma50": 170, "dist50": 5.88}],
            "lastUpdated": "2026-03-09T12:00:00",
        }
        mock_cache_get.return_value = cached_data

        resp = client.get("/api/find-the-dip")

        assert resp.status_code == 200
        data = resp.get_json()
        assert data == cached_data
        mock_load.assert_not_called()

    @patch("routes.portfolio.cache_get", return_value=None)
    @patch("routes.portfolio.cache_set")
    @patch("routes.portfolio.load_portfolio")
    @patch("yfinance.download")
    def test_yfinance_error_returns_empty(self, mock_yf_dl, mock_load, mock_cache_set, mock_cache_get, client):
        """If yfinance download fails, return empty holdings."""
        mock_load.return_value = SAMPLE_PORTFOLIO
        mock_yf_dl.side_effect = Exception("Network error")

        resp = client.get("/api/find-the-dip")

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["holdings"] == []

    @patch("routes.portfolio.cache_get", return_value=None)
    @patch("routes.portfolio.cache_set")
    @patch("routes.portfolio.load_portfolio")
    @patch("yfinance.download")
    def test_short_series_skipped(self, mock_yf_dl, mock_load, mock_cache_set, mock_cache_get, client):
        """Tickers with fewer than 10 data points are skipped."""
        mock_load.return_value = {
            **SAMPLE_PORTFOLIO,
            "positions": [{"ticker": "AAPL", "shares": 10, "avgCost": 150, "category": "Tech"}],
        }

        # Only 5 data points — below the 10-day minimum
        series = _make_price_series(5, start=100)
        df = pd.DataFrame({"Close": series})
        mock_yf_dl.return_value = df

        resp = client.get("/api/find-the-dip")

        data = resp.get_json()
        assert data["holdings"] == []

    @patch("routes.portfolio.cache_get", return_value=None)
    @patch("routes.portfolio.cache_set")
    @patch("routes.portfolio.load_portfolio")
    @patch("yfinance.download")
    def test_category_included(self, mock_yf_dl, mock_load, mock_cache_set, mock_cache_get, client):
        """Each holding includes the category from the position."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        tickers = ["AAPL", "MSFT"]
        mock_yf_dl.return_value = _make_multi_ticker_df(tickers, length=250)

        resp = client.get("/api/find-the-dip")

        data = resp.get_json()
        for h in data["holdings"]:
            assert "category" in h
            assert h["category"] == "Tech"


# ===========================================================================
# /api/dividend-safety
# ===========================================================================


class TestDividendSafety:
    """Tests for GET /api/dividend-safety endpoint."""

    @patch("routes.portfolio.load_portfolio")
    def test_returns_200(self, mock_load, client, tmp_path):
        """Endpoint returns 200 with holdings and distribution."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        store = _make_analyzer_store({
            "AAPL": {"payout_ratio": 25, "fcf_payout": 20, "dps_cagr": 10, "interest_cov": 8},
            "MSFT": {"payout_ratio": 30, "fcf_payout": 25, "dps_cagr": 12, "interest_cov": 10},
        })

        analyzer_file = tmp_path / "analyzer.json"
        analyzer_file.write_text(json.dumps(store))

        with patch("routes.portfolio.ANALYZER_FILE", analyzer_file):
            resp = client.get("/api/dividend-safety")

        assert resp.status_code == 200
        data = resp.get_json()
        assert "holdings" in data
        assert "distribution" in data
        assert "lastUpdated" in data

    @patch("routes.portfolio.load_portfolio")
    def test_reliable_dividend_score(self, mock_load, client, tmp_path):
        """Low payout + high coverage = Reliable label."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        store = _make_analyzer_store({
            "AAPL": {"payout_ratio": 25, "fcf_payout": 20, "dps_cagr": 15, "interest_cov": 12},
        })

        analyzer_file = tmp_path / "analyzer.json"
        analyzer_file.write_text(json.dumps(store))

        with patch("routes.portfolio.ANALYZER_FILE", analyzer_file):
            resp = client.get("/api/dividend-safety")

        data = resp.get_json()
        aapl = next(h for h in data["holdings"] if h["ticker"] == "AAPL")
        assert aapl["score"] >= 80
        assert aapl["label"] == "Reliable"

    @patch("routes.portfolio.load_portfolio")
    def test_risky_dividend_score(self, mock_load, client, tmp_path):
        """High payout + low coverage = Risky label."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        store = _make_analyzer_store({
            "AAPL": {"payout_ratio": 95, "fcf_payout": 90, "dps_cagr": -3, "interest_cov": 1},
        })

        analyzer_file = tmp_path / "analyzer.json"
        analyzer_file.write_text(json.dumps(store))

        with patch("routes.portfolio.ANALYZER_FILE", analyzer_file):
            resp = client.get("/api/dividend-safety")

        data = resp.get_json()
        aapl = next(h for h in data["holdings"] if h["ticker"] == "AAPL")
        assert aapl["score"] < 40
        assert aapl["label"] == "Risky"

    @patch("routes.portfolio.load_portfolio")
    def test_no_analyzer_data(self, mock_load, client, tmp_path):
        """When analyzer.json is missing, returns empty holdings."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        analyzer_file = tmp_path / "analyzer.json"
        # File does not exist

        with patch("routes.portfolio.ANALYZER_FILE", analyzer_file):
            resp = client.get("/api/dividend-safety")

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["holdings"] == []

    @patch("routes.portfolio.load_portfolio")
    def test_partial_metrics(self, mock_load, client, tmp_path):
        """Holdings with some None metrics still get scored."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        store = _make_analyzer_store({
            "AAPL": {"payout_ratio": 30, "fcf_payout": None, "dps_cagr": 8, "interest_cov": None},
        })

        analyzer_file = tmp_path / "analyzer.json"
        analyzer_file.write_text(json.dumps(store))

        with patch("routes.portfolio.ANALYZER_FILE", analyzer_file):
            resp = client.get("/api/dividend-safety")

        data = resp.get_json()
        assert len(data["holdings"]) == 1
        aapl = data["holdings"][0]
        assert aapl["score"] > 0
        assert aapl["payoutRatio"] == 30.0
        assert aapl["fcfPayout"] is None

    @patch("routes.portfolio.load_portfolio")
    def test_distribution_counts(self, mock_load, client, tmp_path):
        """Distribution dict counts each label category."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        store = _make_analyzer_store({
            "AAPL": {"payout_ratio": 25, "fcf_payout": 20, "dps_cagr": 15, "interest_cov": 12},
            "MSFT": {"payout_ratio": 95, "fcf_payout": 90, "dps_cagr": -3, "interest_cov": 1},
        })

        analyzer_file = tmp_path / "analyzer.json"
        analyzer_file.write_text(json.dumps(store))

        with patch("routes.portfolio.ANALYZER_FILE", analyzer_file):
            resp = client.get("/api/dividend-safety")

        data = resp.get_json()
        dist = data["distribution"]
        assert "Reliable" in dist
        assert "Safe" in dist
        assert "OK" in dist
        assert "Risky" in dist
        total = dist["Reliable"] + dist["Safe"] + dist["OK"] + dist["Risky"]
        assert total == len(data["holdings"])

    @patch("routes.portfolio.load_portfolio")
    def test_sorted_by_score_descending(self, mock_load, client, tmp_path):
        """Holdings are returned sorted by score, highest first."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        store = _make_analyzer_store({
            "AAPL": {"payout_ratio": 80, "fcf_payout": 75, "dps_cagr": 2, "interest_cov": 3},
            "MSFT": {"payout_ratio": 25, "fcf_payout": 20, "dps_cagr": 15, "interest_cov": 12},
        })

        analyzer_file = tmp_path / "analyzer.json"
        analyzer_file.write_text(json.dumps(store))

        with patch("routes.portfolio.ANALYZER_FILE", analyzer_file):
            resp = client.get("/api/dividend-safety")

        data = resp.get_json()
        scores = [h["score"] for h in data["holdings"]]
        assert scores == sorted(scores, reverse=True)

    @patch("routes.portfolio.load_portfolio")
    def test_ticker_with_no_dividend_data_skipped(self, mock_load, client, tmp_path):
        """Tickers without any dividend metrics are excluded."""
        mock_load.return_value = SAMPLE_PORTFOLIO

        store = _make_analyzer_store({
            "AAPL": {"payout_ratio": None, "fcf_payout": None, "dps_cagr": None, "interest_cov": None},
            "MSFT": {"payout_ratio": 30, "fcf_payout": 25, "dps_cagr": 10, "interest_cov": 8},
        })

        analyzer_file = tmp_path / "analyzer.json"
        analyzer_file.write_text(json.dumps(store))

        with patch("routes.portfolio.ANALYZER_FILE", analyzer_file):
            resp = client.get("/api/dividend-safety")

        data = resp.get_json()
        tickers = [h["ticker"] for h in data["holdings"]]
        assert "AAPL" not in tickers
        assert "MSFT" in tickers

    @patch("routes.portfolio.load_portfolio")
    def test_empty_portfolio_returns_empty(self, mock_load, client, tmp_path):
        """Empty portfolio returns empty holdings."""
        mock_load.return_value = {**SAMPLE_PORTFOLIO, "positions": []}

        analyzer_file = tmp_path / "analyzer.json"
        analyzer_file.write_text(json.dumps({}))

        with patch("routes.portfolio.ANALYZER_FILE", analyzer_file):
            resp = client.get("/api/dividend-safety")

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["holdings"] == []


# ===========================================================================
# _div_safety_score_component unit tests
# ===========================================================================


class TestDivSafetyScoreComponent:
    """Unit tests for the scoring helper function."""

    def test_none_returns_none(self):
        from routes.portfolio import _div_safety_score_component
        assert _div_safety_score_component(None, [(50, 100)]) is None

    def test_below_first_threshold(self):
        from routes.portfolio import _div_safety_score_component
        thresholds = [(30, 100), (50, 70), (80, 40)]
        assert _div_safety_score_component(20, thresholds) == 100

    def test_between_thresholds(self):
        from routes.portfolio import _div_safety_score_component
        thresholds = [(30, 100), (50, 70), (80, 40)]
        assert _div_safety_score_component(40, thresholds) == 70

    def test_above_all_thresholds(self):
        from routes.portfolio import _div_safety_score_component
        thresholds = [(30, 100), (50, 70), (80, 40)]
        assert _div_safety_score_component(100, thresholds) == 40

    def test_exact_threshold_value(self):
        from routes.portfolio import _div_safety_score_component
        thresholds = [(30, 100), (50, 70), (80, 40)]
        assert _div_safety_score_component(30, thresholds) == 100
