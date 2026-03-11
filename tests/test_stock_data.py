"""Tests for services/stock_data.py — provider cascade orchestrator."""

from unittest.mock import patch, MagicMock

import pytest


# ---------------------------------------------------------------------------
# Fake data helpers
# ---------------------------------------------------------------------------

_FAKE_YF_INFO = {
    "currentPrice": 150.0,
    "regularMarketPrice": 150.0,
    "longName": "Test Corp",
    "sector": "Technology",
    "trailingEps": 6.0,
    "marketCap": 2_000_000_000,
}

_FAKE_EDGAR_FACTS = {"cik": "0001234567", "entityName": "Test Corp"}

_FAKE_INFO = {**_FAKE_YF_INFO, "totalRevenue": 100_000_000}

_FAKE_INCOME = {"2024": {"Pretax Income": 50_000_000, "Tax Provision": 10_000_000, "Interest Expense": 2_000_000}}
_FAKE_CASHFLOW = {"2024": {"Operating Cash Flow": 60_000_000, "Capital Expenditure": -15_000_000}}
_FAKE_BALANCE = {"2024": {"Total Debt": 30_000_000, "Cash And Cash Equivalents": 20_000_000, "Stockholders Equity": 100_000_000}}


# ---------------------------------------------------------------------------
# Provider cascade — fetch_stock_analysis
# ---------------------------------------------------------------------------

@patch("services.stock_data.is_circuit_open", return_value=False)
@patch("services.stock_data._fetch_edgar_facts", return_value=_FAKE_EDGAR_FACTS)
@patch("services.stock_data._edgar_to_info", return_value=_FAKE_INFO)
@patch("services.stock_data._edgar_to_financials", return_value=(_FAKE_INCOME, _FAKE_CASHFLOW, _FAKE_BALANCE))
@patch("services.stock_data.fetch_yfinance_profile", return_value=_FAKE_YF_INFO)
@patch("services.stock_data._get_cascade_order", return_value=["edgar", "fmp", "yfinance"])
def test_fetch_stock_analysis_edgar_success(mock_cascade, mock_yf, mock_edgar_fin, mock_edgar_info, mock_edgar_facts, mock_cb):
    """EDGAR returns data successfully — data_source is 'SEC EDGAR'."""
    from services.stock_data import fetch_stock_analysis

    result = fetch_stock_analysis("TEST")

    assert result is not None
    assert result["data_source"] == "SEC EDGAR"
    assert result["income"] == _FAKE_INCOME
    assert result["cashflow"] == _FAKE_CASHFLOW
    assert result["balance"] == _FAKE_BALANCE
    mock_edgar_facts.assert_called_once_with("TEST")


@patch("services.stock_data.is_circuit_open", return_value=False)
@patch("services.stock_data._fetch_edgar_facts", return_value=None)
@patch("services.stock_data._fetch_fmp_stock_data", return_value={"profile": "fmp_data"})
@patch("services.stock_data._fmp_to_info", return_value=_FAKE_INFO)
@patch("services.stock_data._fmp_to_financials", return_value=(_FAKE_INCOME, _FAKE_CASHFLOW, _FAKE_BALANCE))
@patch("services.stock_data.fetch_yfinance_profile", return_value=_FAKE_YF_INFO)
@patch("services.stock_data._get_cascade_order", return_value=["edgar", "fmp", "yfinance"])
def test_fetch_stock_analysis_edgar_fails_fmp_success(mock_cascade, mock_yf, mock_fmp_fin, mock_fmp_info, mock_fmp_fetch, mock_edgar, mock_cb):
    """EDGAR returns None, cascade falls through to FMP successfully."""
    from services.stock_data import fetch_stock_analysis

    result = fetch_stock_analysis("TEST")

    assert result is not None
    assert result["data_source"] == "FMP"
    mock_edgar.assert_called_once()
    mock_fmp_fetch.assert_called_once()


@patch("services.stock_data.is_circuit_open", return_value=False)
@patch("services.stock_data._fetch_edgar_facts", return_value=None)
@patch("services.stock_data._fetch_fmp_stock_data", return_value={})
@patch("services.stock_data._fmp_to_info", return_value=_FAKE_YF_INFO)
@patch("services.stock_data._fmp_to_financials", return_value=({}, {}, {}))
@patch("services.stock_data.fetch_yfinance_profile", return_value=_FAKE_YF_INFO)
@patch("services.stock_data._get_cascade_order", return_value=["edgar", "fmp"])
def test_fetch_stock_analysis_all_fail_returns_profile(mock_cascade, mock_yf, mock_fmp_fin, mock_fmp_info, mock_fmp_fetch, mock_edgar, mock_cb):
    """All providers fail — returns yfinance profile with empty financials."""
    from services.stock_data import fetch_stock_analysis

    result = fetch_stock_analysis("TEST")

    assert result is not None
    assert result["data_source"] == "Yahoo Finance (profile only)"
    assert result["income"] == {}
    assert result["cashflow"] == {}
    assert result["balance"] == {}


@patch("services.stock_data.fetch_yfinance_profile", return_value={})
def test_fetch_stock_analysis_ticker_not_found(mock_yf):
    """yfinance returns no price data — fetch_stock_analysis returns None."""
    from services.stock_data import fetch_stock_analysis

    result = fetch_stock_analysis("INVALID")

    assert result is None


@patch("services.stock_data.is_circuit_open")
@patch("services.stock_data._fetch_edgar_facts")
@patch("services.stock_data._fetch_fmp_stock_data", return_value={"profile": "data"})
@patch("services.stock_data._fmp_to_info", return_value=_FAKE_INFO)
@patch("services.stock_data._fmp_to_financials", return_value=(_FAKE_INCOME, _FAKE_CASHFLOW, _FAKE_BALANCE))
@patch("services.stock_data.fetch_yfinance_profile", return_value=_FAKE_YF_INFO)
@patch("services.stock_data._get_cascade_order", return_value=["edgar", "fmp", "yfinance"])
def test_fetch_stock_analysis_skips_open_circuit(mock_cascade, mock_yf, mock_fmp_fin, mock_fmp_info, mock_fmp_fetch, mock_edgar, mock_cb):
    """EDGAR circuit is open — skips EDGAR, uses FMP instead."""
    # Return True (open) for edgar, False for everything else
    mock_cb.side_effect = lambda prov: prov == "edgar"

    from services.stock_data import fetch_stock_analysis

    result = fetch_stock_analysis("TEST")

    assert result is not None
    assert result["data_source"] == "FMP"
    # EDGAR fetch should never have been called
    mock_edgar.assert_not_called()


# ---------------------------------------------------------------------------
# Cascade order
# ---------------------------------------------------------------------------

@patch("services.data_store.get_settings", return_value={})
def test_get_cascade_order_default(mock_settings):
    """Default cascade order is ['edgar', 'fmp', 'yfinance']."""
    from services.stock_data import _get_cascade_order

    order = _get_cascade_order()
    assert order == ["edgar", "fmp", "yfinance"]


@patch("services.data_store.get_settings", return_value={
    "providerConfig": {"financials": ["fmp", "edgar"]}
})
def test_get_cascade_order_from_settings(mock_settings):
    """Custom cascade order from user settings is used."""
    from services.stock_data import _get_cascade_order

    order = _get_cascade_order()
    assert order == ["fmp", "edgar"]


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

def test_provider_registry_has_all_providers():
    """_PROVIDERS has entries for edgar, fmp, and yfinance."""
    from services.stock_data import _PROVIDERS

    assert "edgar" in _PROVIDERS
    assert "fmp" in _PROVIDERS
    assert "yfinance" in _PROVIDERS
    for name, entry in _PROVIDERS.items():
        assert "fetch" in entry, f"Provider '{name}' missing 'fetch' key"
        assert callable(entry["fetch"]), f"Provider '{name}' fetch is not callable"


# ---------------------------------------------------------------------------
# fetch_yfinance_profile
# ---------------------------------------------------------------------------

@patch("services.stock_data.yf")
def test_fetch_yfinance_profile_error_returns_empty(mock_yf):
    """yfinance raising an exception returns empty dict."""
    mock_yf.Ticker.side_effect = Exception("network error")

    from services.stock_data import fetch_yfinance_profile

    result = fetch_yfinance_profile("FAIL")
    assert result == {}
