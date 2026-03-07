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
    migrate_salary_data,
)


# ── compute_federal_tax tests ───────────────────────────────────────────
# Brackets from config.py:
# (12400, 0.10), (50400, 0.12), (105700, 0.22),
# (201775, 0.24), (256225, 0.32), (640600, 0.35),
# (inf, 0.37)


class TestComputeFederalTax:
    def test_zero_income(self):
        assert compute_federal_tax(0) == 0

    def test_negative_income(self):
        assert compute_federal_tax(-5000) == 0

    def test_first_bracket_only(self):
        # $10,000 at 10% = $1,000
        assert compute_federal_tax(10000) == 1000.0

    def test_50000_income(self):
        # Bracket 1: 12400 * 0.10 = 1240
        # Bracket 2: (50000 - 12400) * 0.12 = 37600 * 0.12 = 4512
        # Total: 1240 + 4512 = 5752
        assert compute_federal_tax(50000) == 5752.0

    def test_200000_income(self):
        # Bracket 1: 12400 * 0.10 = 1240
        # Bracket 2: (50400 - 12400) * 0.12 = 38000 * 0.12 = 4560
        # Bracket 3: (105700 - 50400) * 0.22 = 55300 * 0.22 = 12166
        # Bracket 4: (200000 - 105700) * 0.24 = 94300 * 0.24 = 22632
        # Total: 1240 + 4560 + 12166 + 22632 = 40598
        assert compute_federal_tax(200000) == 40598.0

    def test_high_income(self):
        # $700,000 touches 6 brackets
        result = compute_federal_tax(700000)
        assert result > 0
        # Bracket 1: 12400*0.10 = 1240
        # Bracket 2: 38000*0.12 = 4560
        # Bracket 3: 55300*0.22 = 12166
        # Bracket 4: 96075*0.24 = 23058
        # Bracket 5: 54450*0.32 = 17424
        # Bracket 6: 384375*0.35 = 134531.25
        # Bracket 7: 59400*0.37 = 21978
        # Total: 214957.25
        assert abs(result - 214957.25) < 0.01

    def test_exact_bracket_boundary(self):
        # Exactly at first bracket boundary: $12,400
        assert compute_federal_tax(12400) == 1240.0


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
