"""
Tests for models.invt_score — InvT Score fundamental quality scoring.
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.invt_score import (
    _invt_cagr,
    _invt_safe_avg,
    _invt_score_metric,
    _invt_label,
    _compute_invt_metrics,
    _compute_invt_category_scores,
    INVT_CATEGORIES_SCORED,
)


# ── _invt_cagr tests ────────────────────────────────────────────────────


class TestInvtCagr:
    def test_normal_growth(self):
        # (100 → 200 over 5 years) → ~14.87%
        result = _invt_cagr(100, 200, 5)
        assert result is not None
        assert abs(result - 14.87) < 0.1

    def test_zero_start(self):
        assert _invt_cagr(0, 200, 5) is None

    def test_negative_start_positive_end(self):
        # Can't compute CAGR across zero crossing
        assert _invt_cagr(-100, 200, 5) is None

    def test_both_negative(self):
        # Both negative: ratio = end/start = -50/-100 = 0.5
        result = _invt_cagr(-100, -50, 5)
        assert result is not None
        # Shrinking debt: (-50/-100)^(1/5) - 1 → negative CAGR
        assert result < 0

    def test_zero_years(self):
        assert _invt_cagr(100, 200, 0) is None

    def test_no_growth(self):
        result = _invt_cagr(100, 100, 5)
        assert result is not None
        assert abs(result) < 0.01

    def test_none_values(self):
        assert _invt_cagr(None, 200, 5) is None
        assert _invt_cagr(100, None, 5) is None


# ── _invt_safe_avg tests ────────────────────────────────────────────────


class TestInvtSafeAvg:
    def test_mixed_none(self):
        assert _invt_safe_avg([1, None, 3]) == 2.0

    def test_all_none(self):
        assert _invt_safe_avg([None, None]) is None

    def test_all_valid(self):
        assert _invt_safe_avg([2.0, 4.0, 6.0]) == 4.0

    def test_empty(self):
        assert _invt_safe_avg([]) is None


# ── _invt_score_metric tests ────────────────────────────────────────────


class TestInvtScoreMetric:
    def test_none_value(self):
        assert _invt_score_metric(None, "revenue_cagr") is None

    def test_revenue_cagr_low(self):
        # revenue_cagr < 0 → score 0
        assert _invt_score_metric(-1, "revenue_cagr") == 0

    def test_revenue_cagr_high(self):
        # revenue_cagr >= 14 → above all thresholds → max + 1 = 10
        assert _invt_score_metric(15, "revenue_cagr") == 10

    def test_revenue_cagr_mid(self):
        # Thresholds: [(0, 0), (1, 1), (3, 3), (6, 5), (9, 7), (14, 9)]
        # value=7: 7 < 9 → score 7
        assert _invt_score_metric(7, "revenue_cagr") == 7

    def test_inverted_metric_net_debt_cagr(self):
        # net_debt_cagr < -25 → first threshold → score 10
        assert _invt_score_metric(-30, "net_debt_cagr") == 10

    def test_inverted_metric_high_value(self):
        # net_debt_cagr >= 15 → above all thresholds → inverted → 0
        assert _invt_score_metric(20, "net_debt_cagr") == 0

    def test_div_yield_custom_scoring(self):
        # Custom scorer: 0 → 0, 1.5 → 5, 3 → 7
        assert _invt_score_metric(0, "div_yield") == 0
        assert _invt_score_metric(1.5, "div_yield") == 5
        assert _invt_score_metric(3, "div_yield") == 7
        assert _invt_score_metric(9, "div_yield") == 1  # distressed

    def test_payout_ratio_custom_scoring(self):
        # Sweet spot at 20-40 → 9
        assert _invt_score_metric(25, "payout_ratio") == 9
        assert _invt_score_metric(130, "payout_ratio") == 0

    def test_unknown_key(self):
        assert _invt_score_metric(10, "nonexistent_metric") is None


# ── _invt_label tests ───────────────────────────────────────────────────


class TestInvtLabel:
    def test_none(self):
        assert _invt_label(None) == "Insufficient Data"

    def test_elite(self):
        assert "Elite" in _invt_label(9.5)

    def test_high_quality(self):
        assert "High Quality" in _invt_label(8.5)

    def test_above_average(self):
        assert "Above Average" in _invt_label(7.0)
        assert "Above Average" in _invt_label(6.0)

    def test_below_average(self):
        assert "Below Average" in _invt_label(5.0)
        assert "Below Average" in _invt_label(4.0)

    def test_poor_quality(self):
        assert "Poor Quality" in _invt_label(2.0)
        assert "Poor Quality" in _invt_label(0)


# ── _compute_invt_metrics tests ─────────────────────────────────────────


def _make_yearly_data():
    """Create 6 years of realistic AAPL-like yearly data for metrics computation."""
    base_rev = 260_000_000_000
    data = []
    for i in range(6):
        rev = int(base_rev * (1.06 ** i))
        gp = int(rev * 0.44)
        ni = int(rev * 0.25)
        ebit = int(rev * 0.30)
        ocf = int(rev * 0.30)
        capex = int(rev * 0.03)
        fcf = ocf - capex
        shares = 16_000_000_000 - i * 200_000_000  # declining shares
        debt = 110_000_000_000 - i * 2_000_000_000
        cash = 30_000_000_000 + i * 1_000_000_000
        equity = 60_000_000_000 + i * 3_000_000_000
        assets = 350_000_000_000 + i * 5_000_000_000
        interest = 3_500_000_000
        pretax = ni * 1.2
        tax = pretax * 0.16
        divs_paid = 15_000_000_000 + i * 500_000_000
        data.append({
            "year": str(2018 + i),
            "revenue": rev,
            "grossProfit": gp,
            "netIncome": ni,
            "ebit": ebit,
            "eps": round(ni / shares, 2),
            "ocf": ocf,
            "capex": capex,
            "fcf": fcf,
            "totalDebt": debt,
            "cash": cash,
            "equity": equity,
            "totalAssets": assets,
            "interestExpense": interest,
            "pretaxIncome": pretax,
            "taxProvision": tax,
            "dividendsPaid": divs_paid,
            "sharesOutstanding": shares,
        })
    return data


class TestComputeInvtMetrics:
    def test_returns_dict(self):
        yearly = _make_yearly_data()
        result = _compute_invt_metrics(yearly, mode="5yr")
        assert isinstance(result, dict)

    def test_has_growth_metrics(self):
        yearly = _make_yearly_data()
        result = _compute_invt_metrics(yearly, mode="5yr")
        assert "revenue_cagr" in result
        assert "eps_cagr" in result
        assert "fcf_share_cagr" in result

    def test_has_profitability_metrics(self):
        yearly = _make_yearly_data()
        result = _compute_invt_metrics(yearly, mode="5yr")
        assert "gpm" in result
        assert "npm" in result
        assert "fcf_margin" in result

    def test_has_debt_metrics(self):
        yearly = _make_yearly_data()
        result = _compute_invt_metrics(yearly, mode="5yr")
        assert "net_debt_cagr" in result
        assert "net_debt_fcf" in result
        assert "interest_cov" in result

    def test_revenue_cagr_is_positive(self):
        yearly = _make_yearly_data()
        result = _compute_invt_metrics(yearly, mode="5yr")
        # Our data has 6% growth
        assert result["revenue_cagr"] is not None
        assert result["revenue_cagr"] > 0

    def test_empty_data(self):
        result = _compute_invt_metrics([], mode="5yr")
        assert result == {}

    def test_single_year(self):
        result = _compute_invt_metrics([_make_yearly_data()[0]], mode="5yr")
        assert result == {}


# ── _compute_invt_category_scores tests ─────────────────────────────────


class TestComputeInvtCategoryScores:
    def test_valid_scores(self):
        metric_scores = {
            "revenue_cagr": 5, "eps_cagr": 7, "fcf_share_cagr": 6,
            "gpm": 7, "npm": 5, "fcf_margin": 5,
            "net_debt_cagr": 7, "net_debt_fcf": 9, "interest_cov": 5,
            "roa": 7, "roe": 7, "roic": 7,
        }
        result = _compute_invt_category_scores(metric_scores, categories=INVT_CATEGORIES_SCORED)
        assert "growth" in result
        assert "profitability" in result
        assert "debt" in result
        assert "efficiency" in result
        # Growth: (5 + 7 + 6) / 3 = 6.0
        assert result["growth"] == 6.0

    def test_insufficient_metrics(self):
        # Only 1 valid metric for a 3-metric category → None (needs >= 2)
        metric_scores = {
            "revenue_cagr": 5, "eps_cagr": None, "fcf_share_cagr": None,
        }
        result = _compute_invt_category_scores(metric_scores, categories=INVT_CATEGORIES_SCORED)
        assert result["growth"] is None

    def test_two_valid_metrics_sufficient(self):
        metric_scores = {
            "revenue_cagr": 5, "eps_cagr": 7, "fcf_share_cagr": None,
            "gpm": None, "npm": None, "fcf_margin": None,
            "net_debt_cagr": None, "net_debt_fcf": None, "interest_cov": None,
            "roa": None, "roe": None, "roic": None,
        }
        result = _compute_invt_category_scores(metric_scores, categories=INVT_CATEGORIES_SCORED)
        # Growth has 2 valid → should compute
        assert result["growth"] is not None
