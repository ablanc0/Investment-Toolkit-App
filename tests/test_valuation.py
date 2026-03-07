"""
Tests for models.valuation — DCF, Graham, Relative, Scenarios, Summary, helpers.
"""

import sys
import os
import pytest

# Ensure project root is on sys.path so `from models.valuation import ...` works
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.valuation import (
    compute_dcf,
    compute_graham,
    compute_relative,
    compute_dcf_scenarios,
    compute_valuation_summary,
    _upside_signal,
    _trimmean,
    _compute_wacc,
)


# ── Fixtures (AAPL-like data) ───────────────────────────────────────────


def _make_info(**overrides):
    """Return an AAPL-like info dict with optional overrides."""
    base = {
        "currentPrice": 185.0,
        "beta": 1.24,
        "totalDebt": 111_000_000_000,
        "totalCash": 30_000_000_000,
        "marketCap": 2_900_000_000_000,
        "sharesOutstanding": 15_700_000_000,
        "freeCashflow": 110_000_000_000,
        "operatingCashflow": 120_000_000_000,
        "trailingEps": 6.42,
        "earningsGrowth": 0.15,  # decimal: 15%
        "sector": "Technology",
        "bookValue": 3.95,
        "enterpriseValue": 3_000_000_000_000,
        "enterpriseToEbitda": 24.0,
        "trailingPE": 28.8,
        "priceToBook": 46.8,
        "revenueGrowth": 0.08,  # decimal: 8%
        "dividendYield": 0.53,  # percentage directly
    }
    base.update(overrides)
    return base


def _make_income():
    return {
        "2023": {"Pretax Income": 115_000_000_000, "Tax Provision": 17_500_000_000, "Interest Expense": -3_800_000_000},
        "2022": {"Pretax Income": 119_000_000_000, "Tax Provision": 19_300_000_000, "Interest Expense": -3_600_000_000},
        "2021": {"Pretax Income": 109_000_000_000, "Tax Provision": 14_500_000_000, "Interest Expense": -2_600_000_000},
        "2020": {"Pretax Income": 67_000_000_000, "Tax Provision": 9_700_000_000, "Interest Expense": -2_900_000_000},
        "2019": {"Pretax Income": 66_000_000_000, "Tax Provision": 10_500_000_000, "Interest Expense": -3_600_000_000},
    }


def _make_balance():
    # Not deeply used by DCF, but the function signature requires it
    return {
        "2023": {"Total Assets": 350_000_000_000, "Total Equity": 62_000_000_000},
        "2022": {"Total Assets": 340_000_000_000, "Total Equity": 50_000_000_000},
    }


def _make_cashflow():
    return {
        "2019": {"Operating Cash Flow": 69_000_000_000, "Capital Expenditure": -10_000_000_000},
        "2020": {"Operating Cash Flow": 80_000_000_000, "Capital Expenditure": -7_300_000_000},
        "2021": {"Operating Cash Flow": 104_000_000_000, "Capital Expenditure": -11_000_000_000},
        "2022": {"Operating Cash Flow": 122_000_000_000, "Capital Expenditure": -10_700_000_000},
        "2023": {"Operating Cash Flow": 110_000_000_000, "Capital Expenditure": -11_000_000_000},
    }


# ── _upside_signal tests ────────────────────────────────────────────────


class TestUpsideSignal:
    def test_strong_buy(self):
        assert _upside_signal(51) == "Strong Buy"
        assert _upside_signal(100) == "Strong Buy"

    def test_buy(self):
        assert _upside_signal(21) == "Buy"
        assert _upside_signal(50) == "Buy"

    def test_hold(self):
        assert _upside_signal(0) == "Hold"
        assert _upside_signal(-9.9) == "Hold"
        assert _upside_signal(20) == "Hold"

    def test_expensive(self):
        assert _upside_signal(-10) == "Expensive"
        assert _upside_signal(-11) == "Expensive"
        assert _upside_signal(-29.9) == "Expensive"

    def test_overrated(self):
        assert _upside_signal(-31) == "Overrated"
        assert _upside_signal(-100) == "Overrated"


# ── _trimmean tests ─────────────────────────────────────────────────────


class TestTrimmean:
    def test_empty_list(self):
        assert _trimmean([]) == 0

    def test_single_value(self):
        assert _trimmean([5.0]) == 5.0

    def test_normal_list(self):
        # [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] — trim 20% means drop 1 from each end
        result = _trimmean([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], pct=0.2)
        # After trim: [2, 3, 4, 5, 6, 7, 8, 9] → mean = 5.5
        assert result == 5.5

    def test_two_values(self):
        # Two values with trim=1 → trimmed slice is empty, fallback to original
        result = _trimmean([3, 7])
        assert result == 5.0


# ── _compute_wacc tests ─────────────────────────────────────────────────


class TestComputeWacc:
    def test_valid_wacc(self):
        info = _make_info()
        income = _make_income()
        wacc, details = _compute_wacc(info, income)
        assert wacc is not None
        assert wacc >= 0.05  # min floor is 5%
        assert "beta" in details
        assert "costOfEquity" in details
        assert "taxRate" in details

    def test_zero_market_cap(self):
        info = _make_info(marketCap=0, totalDebt=0, totalCash=0)
        wacc, details = _compute_wacc(info, _make_income())
        assert wacc is None
        assert details is None

    def test_custom_val_defaults(self):
        info = _make_info()
        income = _make_income()
        vd = {"riskFreeRate": 5.0, "marketReturn": 12.0}
        wacc1, _ = _compute_wacc(info, income)
        wacc2, _ = _compute_wacc(info, income, val_defaults=vd)
        # Different risk-free and market return should produce different WACC
        assert wacc1 != wacc2


# ── compute_dcf tests ────────────────────────────────────────────────────


class TestComputeDcf:
    def test_valid_dcf(self):
        result = compute_dcf(_make_info(), _make_income(), _make_balance(), _make_cashflow())
        assert result is not None
        assert "ivPerShare" in result
        assert "wacc" in result
        assert "signal" in result
        assert "marginOfSafetyIv" in result
        assert result["ivPerShare"] > 0

    def test_dcf_has_expected_keys(self):
        result = compute_dcf(_make_info(), _make_income(), _make_balance(), _make_cashflow())
        expected_keys = {
            "riskFreeRate", "marketReturn", "beta", "costOfEquity", "costOfDebt",
            "wacc", "taxRate", "debtToCapital", "equityToCapital",
            "historicalFcf", "histAvgGrowth", "growthRate", "projectedFcf",
            "terminalValue", "pvTerminal", "enterpriseValue", "equityValue",
            "ivPerShare", "marginOfSafetyIv", "upside", "signal",
        }
        assert expected_keys.issubset(set(result.keys()))

    def test_dcf_empty_cashflow(self):
        result = compute_dcf(_make_info(freeCashflow=0, operatingCashflow=0), _make_income(), _make_balance(), {})
        assert result is None

    def test_dcf_zero_shares(self):
        result = compute_dcf(
            _make_info(sharesOutstanding=0),
            _make_income(), _make_balance(), _make_cashflow()
        )
        assert result is None

    def test_dcf_custom_val_defaults(self):
        vd = {"riskFreeRate": 5.0, "marginOfSafety": 30, "terminalGrowth": 2.0, "marketReturn": 11.0}
        r1 = compute_dcf(_make_info(), _make_income(), _make_balance(), _make_cashflow())
        r2 = compute_dcf(_make_info(), _make_income(), _make_balance(), _make_cashflow(), val_defaults=vd)
        assert r1 is not None and r2 is not None
        # Different margin of safety should produce different mos_iv
        assert r1["marginOfSafetyIv"] != r2["marginOfSafetyIv"]

    def test_dcf_projected_fcf_length(self):
        result = compute_dcf(_make_info(), _make_income(), _make_balance(), _make_cashflow())
        # 9 years of projected FCF
        assert len(result["projectedFcf"]) == 9


# ── compute_graham tests ────────────────────────────────────────────────


class TestComputeGraham:
    def test_positive_eps(self):
        result = compute_graham(_make_info())
        assert result is not None
        assert "ivPerShare" in result
        assert result["ivPerShare"] > 0
        assert "signal" in result

    def test_negative_eps(self):
        result = compute_graham(_make_info(trailingEps=-2.5))
        assert result is not None
        assert result.get("negativeEps") is True
        assert "ivPerShare" not in result

    def test_zero_eps(self):
        result = compute_graham(_make_info(trailingEps=0))
        assert result is not None
        assert result.get("negativeEps") is True

    def test_custom_aaa_yield(self):
        r1 = compute_graham(_make_info())
        r2 = compute_graham(_make_info(), aaa_yield_live=6.0)
        assert r1 is not None and r2 is not None
        # Higher AAA yield → lower bond adjustment → lower IV
        assert r2["ivPerShare"] < r1["ivPerShare"]

    def test_graham_has_expected_keys(self):
        result = compute_graham(_make_info())
        expected_keys = {
            "eps", "growthRate", "basePE", "cg", "adjustedMultiple",
            "aaaYieldBaseline", "aaaYieldCurrent", "bondAdjustment",
            "ivPerShare", "marginOfSafetyIv", "upside", "signal",
        }
        assert expected_keys.issubset(set(result.keys()))


# ── compute_relative tests ──────────────────────────────────────────────


class TestComputeRelative:
    def test_known_sector_technology(self):
        result = compute_relative(_make_info())
        assert result is not None
        assert "ivPerShare" in result
        assert result["sector"] == "Technology"
        # Technology sector defaults: pe=30, evEbitda=20, pb=8
        assert result["sectorDefaults"]["pe"] == 30

    def test_unknown_sector_fallback(self):
        # A completely unknown sector still gets default averages
        result = compute_relative(_make_info(sector="AlienTech"))
        assert result is not None
        # Falls through to default: pe=20, evEbitda=13, pb=3
        assert result["sectorDefaults"]["pe"] == 20

    def test_no_eps_or_book(self):
        # If EPS, bookValue, and ebitda per share are all zero → no implied prices → None
        result = compute_relative(_make_info(
            trailingEps=0, bookValue=0, enterpriseToEbitda=0, enterpriseValue=0
        ))
        assert result is None

    def test_relative_has_metrics(self):
        result = compute_relative(_make_info())
        assert "metrics" in result
        assert len(result["metrics"]) == 3  # P/E, EV/EBITDA, P/B


# ── compute_dcf_scenarios tests ─────────────────────────────────────────


class TestComputeDcfScenarios:
    def test_valid_scenarios(self):
        result = compute_dcf_scenarios(_make_info(), _make_income(), _make_balance(), _make_cashflow())
        assert result is not None
        assert "scenarios" in result
        assert "base" in result["scenarios"]
        assert "best" in result["scenarios"]
        assert "worst" in result["scenarios"]
        assert "compositeIv" in result
        assert "signal" in result

    def test_scenario_structure(self):
        result = compute_dcf_scenarios(_make_info(), _make_income(), _make_balance(), _make_cashflow())
        for name in ("base", "best", "worst"):
            sc = result["scenarios"][name]
            assert "ivPerShare" in sc
            assert "growth1_5" in sc
            assert "growth6_10" in sc
            assert "terminalFactor" in sc
            assert "probability" in sc
            assert "yearByYear" in sc
            assert len(sc["yearByYear"]) == 10

    def test_zero_fcf(self):
        result = compute_dcf_scenarios(
            _make_info(freeCashflow=0), _make_income(), _make_balance(), _make_cashflow()
        )
        assert result is None

    def test_probabilities_sum_to_100(self):
        result = compute_dcf_scenarios(_make_info(), _make_income(), _make_balance(), _make_cashflow())
        total = sum(result["scenarios"][s]["probability"] for s in ("base", "best", "worst"))
        assert total == 100


# ── compute_valuation_summary tests ─────────────────────────────────────


class TestComputeValuationSummary:
    def _build_models(self):
        info = _make_info()
        dcf = compute_dcf(info, _make_income(), _make_balance(), _make_cashflow())
        graham = compute_graham(info)
        relative = compute_relative(info)
        dcf_sc = compute_dcf_scenarios(info, _make_income(), _make_balance(), _make_cashflow())
        return dcf, graham, relative, dcf_sc, info

    def test_all_models(self):
        dcf, graham, relative, dcf_sc, info = self._build_models()
        result = compute_valuation_summary(dcf, graham, relative, dcf_sc, info)
        assert result is not None
        assert "compositeIv" in result
        assert "signal" in result
        assert "category" in result
        assert "weights" in result

    def test_no_models(self):
        info = _make_info()
        result = compute_valuation_summary(None, None, None, None, info)
        assert result is None

    def test_growth_category(self):
        # pe > 22 and revenueGrowth > 12% → Growth
        info = _make_info(trailingPE=30, revenueGrowth=0.15)
        dcf, graham, relative, dcf_sc, _ = self._build_models()
        result = compute_valuation_summary(dcf, graham, relative, dcf_sc, info)
        assert result["category"] == "Growth"

    def test_value_category(self):
        # pe < 16 → Value
        info = _make_info(trailingPE=12, revenueGrowth=0.03, dividendYield=2.5)
        dcf, graham, relative, dcf_sc, _ = self._build_models()
        result = compute_valuation_summary(dcf, graham, relative, dcf_sc, info)
        assert result["category"] == "Value"
