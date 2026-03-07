"""
Tests for models.projections_calc — Investment projection computations.
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.projections_calc import compute_projections, _projections_response


# ── compute_projections tests ───────────────────────────────────────────


class TestComputeProjections:
    def test_basic_growth(self):
        config = {
            "startingValue": 10000,
            "monthlyContribution": 500,
            "expectedReturnPct": 8,
            "dividendYieldPct": 0,
            "inflationPct": 0,
            "years": 20,
        }
        rows = compute_projections(config)
        # 21 rows (year 0 through year 20)
        assert len(rows) == 21
        # Final balance should be much larger than starting
        assert rows[-1]["balance"] > 10000
        # Year 0 should equal starting value
        assert rows[0]["balance"] == 10000

    def test_zero_contribution(self):
        config = {
            "startingValue": 10000,
            "monthlyContribution": 0,
            "expectedReturnPct": 8,
            "dividendYieldPct": 0,
            "inflationPct": 0,
            "years": 10,
        }
        rows = compute_projections(config)
        # Balance should still grow from returns alone
        assert rows[-1]["balance"] > 10000
        # Contributions should stay at starting value
        assert rows[-1]["contributions"] == 10000

    def test_inflation_adjusted(self):
        config = {
            "startingValue": 10000,
            "monthlyContribution": 500,
            "expectedReturnPct": 8,
            "dividendYieldPct": 0,
            "inflationPct": 3,
            "years": 20,
        }
        rows = compute_projections(config)
        final = rows[-1]
        # Real balance should be less than nominal balance
        assert final["realBalance"] < final["balance"]
        # Both should be positive
        assert final["realBalance"] > 0

    def test_year_zero_real_equals_nominal(self):
        config = {
            "startingValue": 10000,
            "monthlyContribution": 500,
            "expectedReturnPct": 8,
            "dividendYieldPct": 0,
            "inflationPct": 3,
            "years": 10,
        }
        rows = compute_projections(config)
        # At year 0, realBalance should equal balance
        assert rows[0]["realBalance"] == rows[0]["balance"]

    def test_row_structure(self):
        config = {
            "startingValue": 5000,
            "monthlyContribution": 100,
            "expectedReturnPct": 7,
            "dividendYieldPct": 2,
            "inflationPct": 2,
            "years": 5,
        }
        rows = compute_projections(config)
        for row in rows:
            assert "year" in row
            assert "balance" in row
            assert "realBalance" in row
            assert "contributions" in row
            assert "growth" in row
            assert "divIncome" in row
            assert "totalDividends" in row

    def test_override_return_pct(self):
        config = {
            "startingValue": 10000,
            "monthlyContribution": 0,
            "expectedReturnPct": 8,
            "dividendYieldPct": 0,
            "inflationPct": 0,
            "years": 10,
        }
        rows_base = compute_projections(config)
        rows_high = compute_projections(config, return_pct_override=12)
        # Higher return should produce larger final balance
        assert rows_high[-1]["balance"] > rows_base[-1]["balance"]


# ── _projections_response tests ─────────────────────────────────────────


class TestProjectionsResponse:
    def test_has_three_scenarios(self):
        proj = {
            "startingValue": 10000,
            "monthlyContribution": 500,
            "expectedReturnPct": 8,
            "dividendYieldPct": 0,
            "inflationPct": 3,
            "years": 20,
        }
        result = _projections_response(proj)
        assert "table" in result
        assert "base" in result["table"]
        assert "bull" in result["table"]
        assert "bear" in result["table"]
        assert "config" in result

    def test_bull_beats_base_beats_bear(self):
        proj = {
            "startingValue": 10000,
            "monthlyContribution": 500,
            "expectedReturnPct": 8,
            "dividendYieldPct": 0,
            "inflationPct": 0,
            "years": 20,
        }
        result = _projections_response(proj)
        bull_final = result["table"]["bull"][-1]["balance"]
        base_final = result["table"]["base"][-1]["balance"]
        bear_final = result["table"]["bear"][-1]["balance"]
        assert bull_final > base_final > bear_final
