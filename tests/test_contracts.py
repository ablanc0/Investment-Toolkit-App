"""Tests for services/contracts.py — data contracts and validation helpers."""

import pytest

from services.contracts import (
    QUOTE_FIELDS,
    INFO_FIELDS,
    INCOME_FIELDS,
    CASHFLOW_FIELDS,
    BALANCE_FIELDS,
    validate_quote,
    validate_info,
    validate_financials,
)


# ---------------------------------------------------------------------------
# QUOTE_FIELDS contract
# ---------------------------------------------------------------------------

def test_quote_fields_has_required_keys():
    """QUOTE_FIELDS contains all keys needed by the frontend portfolio display."""
    required = {"price", "name", "sector", "divYield", "pe", "marketCap",
                "previousClose", "changePercent", "beta", "fiftyTwoWeekHigh",
                "fiftyTwoWeekLow", "targetMeanPrice", "divRate"}
    assert required.issubset(QUOTE_FIELDS.keys())


# ---------------------------------------------------------------------------
# INFO_FIELDS contract
# ---------------------------------------------------------------------------

def test_info_fields_has_required_keys():
    """INFO_FIELDS contains keys consumed by valuation models and analyzer."""
    required = {"currentPrice", "trailingEps", "totalDebt", "freeCashflow",
                "marketCap", "enterpriseValue", "sharesOutstanding", "bookValue",
                "returnOnEquity", "dividendYield", "operatingCashflow",
                "totalRevenue", "profitMargins", "operatingMargins"}
    assert required.issubset(INFO_FIELDS.keys())


# ---------------------------------------------------------------------------
# validate_quote()
# ---------------------------------------------------------------------------

def test_validate_quote_fills_defaults():
    """Passing an empty dict fills all QUOTE_FIELDS keys with defaults."""
    result = validate_quote({})

    for key, default in QUOTE_FIELDS.items():
        assert key in result
        assert result[key] == default


def test_validate_quote_preserves_values():
    """Values present in data are kept."""
    data = {"price": 150.0, "name": "Apple Inc.", "sector": "Technology"}
    result = validate_quote(data)

    assert result["price"] == 150.0
    assert result["name"] == "Apple Inc."
    assert result["sector"] == "Technology"
    # Missing keys still get defaults
    assert result["beta"] == 0


def test_validate_quote_strips_extras():
    """Extra keys not in QUOTE_FIELDS are removed (strict shape)."""
    data = {"price": 100.0, "unknownField": "should_be_gone", "pegRatio": 1.5}
    result = validate_quote(data)

    assert "unknownField" not in result
    assert "pegRatio" not in result
    assert result["price"] == 100.0


# ---------------------------------------------------------------------------
# validate_info()
# ---------------------------------------------------------------------------

def test_validate_info_fills_defaults():
    """Passing an empty dict fills all INFO_FIELDS keys with their defaults."""
    result = validate_info({})

    for key, default in INFO_FIELDS.items():
        assert key in result
        assert result[key] == default


def test_validate_info_preserves_extras():
    """Extra keys not in INFO_FIELDS are preserved (permissive shape)."""
    data = {"currentPrice": 200.0, "pegRatio": 1.5, "customMetric": 42}
    result = validate_info(data)

    assert result["currentPrice"] == 200.0
    assert result["pegRatio"] == 1.5
    assert result["customMetric"] == 42
    # Missing defaults still filled
    assert result["totalDebt"] == 0
    assert result["freeCashflow"] == 0


# ---------------------------------------------------------------------------
# validate_financials()
# ---------------------------------------------------------------------------

def test_validate_financials_income():
    """validate_financials with income statement fills all INCOME_FIELDS."""
    year_data = {"Pretax Income": 5_000_000}
    result = validate_financials(year_data, "income")

    assert result["Pretax Income"] == 5_000_000
    assert result["Tax Provision"] == 0
    assert result["Interest Expense"] == 0
    assert set(result.keys()) == set(INCOME_FIELDS.keys())


def test_validate_financials_fills_missing():
    """Missing financial fields get the default value of 0."""
    # Empty dict for cashflow
    result = validate_financials({}, "cashflow")

    for key, default in CASHFLOW_FIELDS.items():
        assert key in result
        assert result[key] == default

    # Balance sheet with partial data
    result_bal = validate_financials({"Total Debt": 1_000_000}, "balance")
    assert result_bal["Total Debt"] == 1_000_000
    assert result_bal["Cash And Cash Equivalents"] == 0
    assert result_bal["Stockholders Equity"] == 0
