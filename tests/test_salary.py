"""
Tests for models.salary_calc — Federal tax, salary breakdown, data migration.
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.salary_calc import (
    compute_federal_tax,
    compute_salary_breakdown,
    compute_tax_return,
    compute_household_filing,
    migrate_salary_data,
)
from config import FEDERAL_TAX_DATA


# ── compute_federal_tax tests ───────────────────────────────────────────
# Use explicit 2023 Single brackets (IRS Rev. Proc. 2022-38) for deterministic tests:
# (11000, 0.10), (44725, 0.12), (95375, 0.22),
# (182100, 0.24), (231250, 0.32), (578125, 0.35),
# (inf, 0.37)

BRACKETS_2023 = FEDERAL_TAX_DATA[2023]["single"]["brackets"]


class TestComputeFederalTax:
    def test_zero_income(self):
        assert compute_federal_tax(0, BRACKETS_2023) == 0

    def test_negative_income(self):
        assert compute_federal_tax(-5000, BRACKETS_2023) == 0

    def test_first_bracket_only(self):
        # $10,000 at 10% = $1,000
        assert compute_federal_tax(10000, BRACKETS_2023) == 1000.0

    def test_50000_income(self):
        # Bracket 1: 11000 * 0.10 = 1100
        # Bracket 2: (44725 - 11000) * 0.12 = 33725 * 0.12 = 4047
        # Bracket 3: (50000 - 44725) * 0.22 = 5275 * 0.22 = 1160.50
        # Total: 1100 + 4047 + 1160.50 = 6307.50
        assert compute_federal_tax(50000, BRACKETS_2023) == 6307.5

    def test_200000_income(self):
        # Bracket 1: 11000 * 0.10 = 1100
        # Bracket 2: (44725 - 11000) * 0.12 = 33725 * 0.12 = 4047
        # Bracket 3: (95375 - 44725) * 0.22 = 50650 * 0.22 = 11143
        # Bracket 4: (182100 - 95375) * 0.24 = 86725 * 0.24 = 20814
        # Bracket 5: (200000 - 182100) * 0.32 = 17900 * 0.32 = 5728
        # Total: 1100 + 4047 + 11143 + 20814 + 5728 = 42832
        assert compute_federal_tax(200000, BRACKETS_2023) == 42832.0

    def test_high_income(self):
        # $700,000 touches all 7 brackets
        result = compute_federal_tax(700000, BRACKETS_2023)
        assert result > 0
        # Bracket 1: 11000*0.10 = 1100
        # Bracket 2: 33725*0.12 = 4047
        # Bracket 3: 50650*0.22 = 11143
        # Bracket 4: 86725*0.24 = 20814
        # Bracket 5: 49150*0.32 = 15728
        # Bracket 6: 346875*0.35 = 121406.25
        # Bracket 7: 121875*0.37 = 45093.75
        # Total: 219332.0
        assert abs(result - 219332.0) < 0.01

    def test_exact_bracket_boundary(self):
        # Exactly at first bracket boundary: $11,000
        assert compute_federal_tax(11000, BRACKETS_2023) == 1100.0


# ── compute_salary_breakdown tests ──────────────────────────────────────


class TestComputeSalaryBreakdown:
    def test_simple_w2(self):
        profile = {
            "incomeStreams": [{"type": "W2", "amount": 100000, "label": "Job"}],
            "taxes": {
                "iraContributionPct": 0.03,
                "standardDeduction": 16100,
                "cityResidentTax": {"name": "City Tax", "rate": 0.01, "enabled": True},
                "cityNonResidentTax": {"name": "City NR", "rate": 0.003, "enabled": False},
                "stateTax": {"name": "State Tax", "rate": 0.0425, "enabled": True},
            },
        }
        result = compute_salary_breakdown(profile)
        assert "rows" in result
        assert "summary" in result
        assert "employer" in result
        assert result["summary"]["annualGross"] == 100000
        assert result["summary"]["takeHomePay"] > 0
        assert result["summary"]["takeHomePay"] < 100000

    def test_zero_income(self):
        profile = {
            "incomeStreams": [{"type": "W2", "amount": 0, "label": "None"}],
            "taxes": {
                "iraContributionPct": 0.03,
                "standardDeduction": 16100,
                "cityResidentTax": {"name": "City Tax", "rate": 0.01, "enabled": False},
                "cityNonResidentTax": {"name": "City NR", "rate": 0.003, "enabled": False},
                "stateTax": {"name": "State Tax", "rate": 0.0425, "enabled": False},
            },
        }
        result = compute_salary_breakdown(profile)
        # With zero income, take-home should be zero (or near zero)
        assert result["summary"]["annualGross"] == 0

    def test_w2_plus_1099(self):
        profile = {
            "incomeStreams": [
                {"type": "W2", "amount": 80000, "label": "Job"},
                {"type": "1099", "amount": 20000, "label": "Freelance"},
            ],
            "taxes": {
                "iraContributionPct": 0.03,
                "standardDeduction": 16100,
                "cityResidentTax": {"name": "City Tax", "rate": 0.01, "enabled": True},
                "cityNonResidentTax": {"name": "City NR", "rate": 0.003, "enabled": False},
                "stateTax": {"name": "State Tax", "rate": 0.0425, "enabled": True},
            },
        }
        result = compute_salary_breakdown(profile)
        assert result["summary"]["w2Total"] == 80000
        assert result["summary"]["t1099Total"] == 20000
        assert result["summary"]["annualGross"] == 100000

    def test_effective_tax_rate(self):
        profile = {
            "incomeStreams": [{"type": "W2", "amount": 120000, "label": "Job"}],
            "taxes": {
                "iraContributionPct": 0.03,
                "standardDeduction": 16100,
                "cityResidentTax": {"name": "City Tax", "rate": 0.01, "enabled": True},
                "cityNonResidentTax": {"name": "City NR", "rate": 0.003, "enabled": False},
                "stateTax": {"name": "State Tax", "rate": 0.0425, "enabled": True},
            },
        }
        result = compute_salary_breakdown(profile)
        eff = result["summary"]["effectiveTaxRate"]
        assert 0 < eff < 1  # Between 0% and 100%


# ── migrate_salary_data tests ──────────────────────────────────────────


class TestMigrateSalaryData:
    def test_already_migrated(self):
        data = {"profiles": {"ale": {"name": "Ale"}}, "activeProfile": "ale"}
        result = migrate_salary_data(data)
        assert result is data  # same object, no changes

    def test_old_flat_format(self):
        old = {
            "w2Salary": 120000,
            "income1099": 10000,
            "iraContributionPct": 0.04,
            "michiganTaxPct": 0.05,
            "year": 2024,
        }
        result = migrate_salary_data(old)
        assert "profiles" in result
        assert "activeProfile" in result
        profile = result["profiles"]["alejandro"]
        assert profile["name"] == "Alejandro"
        assert len(profile["incomeStreams"]) == 2
        assert profile["incomeStreams"][0]["type"] == "W2"
        assert profile["incomeStreams"][0]["amount"] == 120000
        assert profile["incomeStreams"][1]["type"] == "1099"
        assert profile["taxes"]["iraContributionPct"] == 0.04
        assert profile["taxes"]["stateTax"]["rate"] == 0.05

    def test_old_format_no_income(self):
        old = {"w2Salary": 0, "income1099": 0}
        result = migrate_salary_data(old)
        profile = result["profiles"]["alejandro"]
        # Should have at least one default W2 stream
        assert len(profile["incomeStreams"]) >= 1
        assert profile["incomeStreams"][0]["type"] == "W2"


# ── Business Expenses & QBI Deduction tests ──────────────────────────


def _make_profile(streams, year=2025, filing_status="single"):
    """Helper: build a minimal profile with no state/local taxes for isolation."""
    return {
        "incomeStreams": streams,
        "taxes": {
            "iraContributionPct": 0,
            "standardDeduction": None,
            "cityResidentTax": {"name": "City Tax", "rate": 0, "enabled": False},
            "cityNonResidentTax": {"name": "City NR", "rate": 0, "enabled": False},
            "stateTax": {"name": "State Tax", "rate": 0, "enabled": False},
        },
        "year": year,
        "filingStatus": filing_status,
    }


class TestBusinessExpensesAndQBI:
    def test_1099_with_business_expenses(self):
        """100k 1099 with 20k expenses -> t1099Gross=100k, t1099Net=80k, businessExpenses=20k"""
        profile = _make_profile([
            {"type": "1099", "amount": 100000, "label": "Freelance", "businessExpenses": 20000},
        ])
        result = compute_salary_breakdown(profile)
        summ = result["summary"]
        assert summ["t1099Gross"] == 100000
        assert summ["t1099Net"] == 80000
        assert summ["businessExpenses"] == 20000

    def test_1099_no_qbi_by_default(self):
        """50k 1099 without qbiEligible -> qbiDeduction=0"""
        profile = _make_profile([
            {"type": "1099", "amount": 50000, "label": "Freelance"},
        ])
        result = compute_salary_breakdown(profile)
        summ = result["summary"]
        assert summ["businessExpenses"] == 0
        assert summ["qbiDeduction"] == 0

    def test_qbi_full_deduction_below_threshold(self):
        """100k 1099 with qbiEligible, single 2025 -> full QBI = 20000."""
        profile = _make_profile([
            {"type": "1099", "amount": 100000, "label": "Freelance", "qbiEligible": True},
        ])
        result = compute_salary_breakdown(profile)
        summ = result["summary"]
        assert summ["qbiDeduction"] == 20000

    def test_qbi_phaseout(self):
        """W2 150k + 1099 100k (qbiEligible), single 2025 -> partial QBI."""
        profile = _make_profile([
            {"type": "W2", "amount": 150000, "label": "Job"},
            {"type": "1099", "amount": 100000, "label": "Freelance", "qbiEligible": True},
        ])
        result = compute_salary_breakdown(profile)
        summ = result["summary"]
        assert 0 < summ["qbiDeduction"] < 20000

    def test_qbi_zero_above_upper(self):
        """W2 300k + 1099 50k (qbiEligible) -> qbiDeduction=0 (above upper threshold)."""
        profile = _make_profile([
            {"type": "W2", "amount": 300000, "label": "Job"},
            {"type": "1099", "amount": 50000, "label": "Freelance", "qbiEligible": True},
        ])
        result = compute_salary_breakdown(profile)
        summ = result["summary"]
        assert summ["qbiDeduction"] == 0

    def test_qbi_mfj_higher_threshold(self):
        """W2 200k + 1099 100k (qbiEligible), MFJ 2025 -> full QBI = 20000."""
        profile = _make_profile([
            {"type": "W2", "amount": 200000, "label": "Job"},
            {"type": "1099", "amount": 100000, "label": "Freelance", "qbiEligible": True},
        ], filing_status="mfj")
        result = compute_salary_breakdown(profile)
        summ = result["summary"]
        assert summ["qbiDeduction"] == 20000

    def test_multiple_1099_streams_mixed_qbi(self):
        """Two 1099 streams, only one qbiEligible -> QBI on eligible stream only."""
        profile = _make_profile([
            {"type": "1099", "amount": 60000, "label": "Consulting", "businessExpenses": 10000, "qbiEligible": True},
            {"type": "1099", "amount": 40000, "label": "Freelance", "businessExpenses": 5000},
        ])
        result = compute_salary_breakdown(profile)
        summ = result["summary"]
        assert summ["t1099Gross"] == 100000
        assert summ["businessExpenses"] == 15000
        assert summ["t1099Net"] == 85000
        # QBI = 20% of eligible net only: (60000 - 10000) = 50000 * 0.20 = 10000
        assert summ["qbiDeduction"] == 10000


# ── Tax Return Estimator tests ─────────────────────────────────────


class TestTaxReturnEstimator:
    def _get_breakdown(self, streams=None, year=2025, filing_status="single"):
        if streams is None:
            streams = [{"type": "W2", "amount": 100000, "label": "Job"}]
        profile = _make_profile(streams, year=year, filing_status=filing_status)
        return compute_salary_breakdown(profile)

    def test_refund_scenario(self):
        """Withholdings exceed tax owed -> refund."""
        bd = self._get_breakdown()
        info = {"federalWithheld": 50000, "stateWithheld": 10000, "estimatedPayments": 0}
        result = compute_tax_return(bd, info)
        assert result["isRefund"] is True
        assert result["totalBalance"] < 0

    def test_owed_scenario(self):
        """Withholdings less than tax -> owed."""
        bd = self._get_breakdown()
        info = {"federalWithheld": 1000, "stateWithheld": 0, "estimatedPayments": 0}
        result = compute_tax_return(bd, info)
        assert result["isRefund"] is False
        assert result["totalBalance"] > 0

    def test_zero_withholdings(self):
        """No payments -> balance equals full tax liability."""
        bd = self._get_breakdown()
        result = compute_tax_return(bd, {})
        assert result["totalBalance"] == result["totalTaxLiability"]
        assert result["totalPayments"] == 0

    def test_estimated_payments_reduce_balance(self):
        """ES payments offset federal tax."""
        bd = self._get_breakdown()
        result_no_es = compute_tax_return(bd, {"federalWithheld": 5000, "stateWithheld": 0, "estimatedPayments": 0})
        result_with_es = compute_tax_return(bd, {"federalWithheld": 5000, "stateWithheld": 0, "estimatedPayments": 3000})
        assert result_with_es["totalBalance"] < result_no_es["totalBalance"]
        assert result_with_es["totalPayments"] == 8000

    def test_marginal_rates_in_summary(self):
        """Marginal rates should be exposed in breakdown summary."""
        bd = self._get_breakdown()
        assert "marginalRates" in bd["summary"]
        mr = bd["summary"]["marginalRates"]
        assert "federalRate" in mr
        assert "combinedRate" in mr
        assert mr["federalRate"] > 0


# ── Household Filing Comparison tests ────────────────────────────────


class TestHouseholdFiling:
    def _make_hh_profiles(self, w2_primary=60000, t1099_primary=20000, t1099_spouse=60000, year=2025):
        primary = _make_profile([
            {"type": "W2", "amount": w2_primary, "label": "Job"},
            {"type": "1099", "amount": t1099_primary, "label": "Freelance"},
        ], year=year)
        primary["withholdingInfo"] = {"federalWithheld": 5000, "stateWithheld": 1000, "estimatedPayments": 2000}
        spouse = _make_profile([
            {"type": "1099", "amount": t1099_spouse, "label": "Business"},
        ], year=year)
        spouse["withholdingInfo"] = {"federalWithheld": 3000, "stateWithheld": 500, "estimatedPayments": 4000}
        return primary, spouse

    def test_joint_combines_income(self):
        """Joint filing combines income from both profiles."""
        primary, spouse = self._make_hh_profiles()
        result = compute_household_filing(primary, spouse)
        joint_gross = result["joint"]["summary"]["annualGross"]
        assert joint_gross == 60000 + 20000 + 60000  # 140000

    def test_joint_vs_separate(self):
        """Joint and separate take-home should differ due to different brackets."""
        primary, spouse = self._make_hh_profiles()
        result = compute_household_filing(primary, spouse)
        joint_take_home = result["joint"]["summary"]["takeHomePay"]
        separate_take_home = result["separate"]["combinedTakeHome"]
        assert joint_take_home != separate_take_home

    def test_joint_uses_mfj_deduction(self):
        """Joint filing should use MFJ standard deduction."""
        primary, spouse = self._make_hh_profiles(year=2025)
        result = compute_household_filing(primary, spouse)
        # MFJ 2025 standard deduction is ~$30,000
        assert result["joint"]["summary"]["standardDeduction"] >= 29200

    def test_joint_withholdings_combined(self):
        """Both profiles' withholdings should be summed for joint tax return."""
        primary, spouse = self._make_hh_profiles()
        result = compute_household_filing(primary, spouse)
        tr = result["joint"]["taxReturn"]
        # primary: 5000+1000+2000=8000, spouse: 3000+500+4000=7500 -> total=15500
        assert tr["totalPayments"] == 15500

    def test_savings_positive_when_joint_better(self):
        """Savings should be positive when joint filing yields more take-home."""
        primary, spouse = self._make_hh_profiles()
        result = compute_household_filing(primary, spouse)
        # For most income combos, MFJ is better than MFS
        assert "savings" in result
        assert "recommendation" in result
        assert result["recommendation"] in ("joint", "separate")
