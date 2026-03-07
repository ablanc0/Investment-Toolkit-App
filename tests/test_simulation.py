"""
Tests for models.simulation — Rule 4% / Monte Carlo retirement simulation.
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.simulation import _run_simulation


# ── Test data helpers ───────────────────────────────────────────────────


def _make_simple_market_data(start_year=1970, end_year=2020):
    """Create simple market data with alternating good/bad returns."""
    returns_by_year = {}
    cpi_by_year = {}
    for yr in range(start_year, end_year + 1):
        # Alternate between +12% and -5% returns (avg ~3.5%)
        returns_by_year[yr] = 0.12 if yr % 2 == 0 else -0.05
        cpi_by_year[yr] = 0.03
    all_years = list(range(start_year, end_year + 1))
    return returns_by_year, cpi_by_year, all_years, end_year


def _make_strong_market_data(start_year=1970, end_year=2020):
    """Create consistently positive market data."""
    returns_by_year = {yr: 0.10 for yr in range(start_year, end_year + 1)}
    cpi_by_year = {yr: 0.03 for yr in range(start_year, end_year + 1)}
    all_years = list(range(start_year, end_year + 1))
    return returns_by_year, cpi_by_year, all_years, end_year


# ── _run_simulation tests ──────────────────────────────────────────────


class TestRunSimulation:
    def test_output_structure(self):
        ret, cpi, years, max_yr = _make_simple_market_data()
        result = _run_simulation(
            ret, cpi, years, max_yr,
            starting_balance=1_000_000,
            withdrawal_rate=0.04,
            horizon=30,
        )
        assert "successRate" in result
        assert "scenarios" in result
        assert "avgFinalBalance" in result
        assert "totalScenarios" in result
        assert "successCount" in result
        assert "failureCount" in result
        assert "worstStartYear" in result
        assert "bestStartYear" in result
        assert "horizon" in result
        assert result["horizon"] == 30

    def test_fixed_strategy_4pct(self):
        ret, cpi, years, max_yr = _make_strong_market_data()
        result = _run_simulation(
            ret, cpi, years, max_yr,
            starting_balance=1_000_000,
            withdrawal_rate=0.04,
            horizon=30,
            strategy="fixed",
        )
        # With consistent 10% returns, 4% withdrawal should have high success
        assert result["successRate"] > 50

    def test_high_withdrawal_rate(self):
        ret, cpi, years, max_yr = _make_simple_market_data()
        result = _run_simulation(
            ret, cpi, years, max_yr,
            starting_balance=1_000_000,
            withdrawal_rate=0.10,
            horizon=30,
        )
        # 10% withdrawal with avg ~3.5% return should have lower success
        assert result["successRate"] < 100

    def test_scenario_count(self):
        ret, cpi, years, max_yr = _make_simple_market_data(1970, 2020)
        result = _run_simulation(
            ret, cpi, years, max_yr,
            starting_balance=1_000_000,
            withdrawal_rate=0.04,
            horizon=30,
        )
        # Number of scenarios = years where start_year + 30 - 1 <= max_year
        # i.e. start_year <= 2020 - 29 = 1991 → years 1970..1991 = 22 scenarios
        assert result["totalScenarios"] == 22
        assert len(result["scenarios"]) == 22

    def test_scenario_yearly_data_length(self):
        ret, cpi, years, max_yr = _make_strong_market_data()
        result = _run_simulation(
            ret, cpi, years, max_yr,
            starting_balance=1_000_000,
            withdrawal_rate=0.04,
            horizon=30,
        )
        # Each scenario should have exactly `horizon` yearly data points
        for scenario in result["scenarios"]:
            assert len(scenario["data"]) == 30

    def test_guardrails_strategy(self):
        ret, cpi, years, max_yr = _make_strong_market_data()
        result = _run_simulation(
            ret, cpi, years, max_yr,
            starting_balance=1_000_000,
            withdrawal_rate=0.04,
            horizon=30,
            strategy="guardrails",
            guardrail_floor=0.8,
            guardrail_ceiling=1.2,
        )
        assert result["successRate"] > 0
        assert result["totalScenarios"] > 0

    def test_dividend_strategy(self):
        ret, cpi, years, max_yr = _make_strong_market_data()
        result = _run_simulation(
            ret, cpi, years, max_yr,
            starting_balance=1_000_000,
            withdrawal_rate=0.04,
            horizon=30,
            strategy="dividend",
            div_yield=0.03,
        )
        # Dividend strategy never sells principal, so all should survive
        assert result["successRate"] == 100.0

    def test_success_rate_bounds(self):
        ret, cpi, years, max_yr = _make_simple_market_data()
        result = _run_simulation(
            ret, cpi, years, max_yr,
            starting_balance=1_000_000,
            withdrawal_rate=0.04,
            horizon=30,
        )
        assert 0 <= result["successRate"] <= 100
