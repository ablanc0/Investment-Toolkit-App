"""Tests for Cost of Living auto-compute logic — _compute_col_entry() and COL API routes."""

import json
from unittest.mock import patch

import pytest

from routes.planning import _compute_col_entry


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

MOCK_API_CITIES = [
    {
        "name": "New York",
        "monthlyCostsNoRent": 1728.09,
        "avgNetSalary": 5158.83,
        "rent1brCity": 4168.08,
        "rent1brSuburb": 2697.09,
        "rent3brCity": 8438.12,
        "rent3brSuburb": 5248.72,
        "colIndex": 100.0,
        "colPlusRentIndex": 100.0,
        "purchasingPowerIndex": 100.0,
    },
    {
        "name": "Detroit",
        "state": "MI",
        "country": "United States",
        "monthlyCostsNoRent": 1187,
        "avgNetSalary": 3200,
        "colIndex": 63.0,
    },
]

MOCK_CONFIG = {
    "housingWeight": 0.30,
    "referenceSalary": 60000,
    "currentRent": 1200,
    "bedroomCount": 1,
    "locationType": "suburb",
}


def _make_manual_entry(**overrides):
    """Build a manual COL entry with sensible defaults."""
    entry = {
        "metro": "Test City",
        "area": "",
        "type": "Suburban",
        "rent": 1200,
        "monthlyCostsNoRent": 1000,
        "nonHousingMult": 1.0,
        "housingMult": 0,
        "overallFactor": 0,
        "equivalentSalary": 0,
        "elEquivalent": 0,
        "source": "manual",
    }
    entry.update(overrides)
    return entry


def _make_api_entry(**overrides):
    """Build an API-sourced COL entry."""
    entry = _make_manual_entry(
        source="api",
        rentOverride=False,
        nhmOverride=False,
        apiData={
            "colIndex": 70.0,
            "purchasingPowerIndex": 120.0,
            "avgNetSalary": 4000,
            "monthlyCostsNoRent": 1100,
            "groceriesIndex": 65.0,
            "restaurantIndex": 55.0,
            "utilities": 150.0,
            "rent1brSuburb": 1500,
        },
    )
    entry.update(overrides)
    return entry


# ---------------------------------------------------------------------------
# COL Index auto-computation for manual entries
# ---------------------------------------------------------------------------

class TestColIndexComputation:
    """_compute_col_entry: COL index from monthly costs relative to NYC."""

    def test_col_index_basic(self):
        """costs=1000, NYC costs=1728.09 => colIndex = 1000/1728.09*100 ≈ 57.9."""
        entry = _make_manual_entry(monthlyCostsNoRent=1000, rent=1200)
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        assert entry["colIndex"] == pytest.approx(57.9, abs=0.1)

    def test_col_index_not_computed_for_api_source(self):
        """API-sourced entries keep their original colIndex untouched."""
        entry = _make_api_entry()
        original_col = entry.get("colIndex")
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        # API entries don't get colIndex overwritten by cost-based formula
        assert entry.get("colIndex") != pytest.approx(57.9, abs=1)

    def test_col_index_not_computed_when_costs_zero(self):
        """No COL auto-compute when monthlyCostsNoRent is 0."""
        entry = _make_manual_entry(monthlyCostsNoRent=0, rent=1200)
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        assert "colIndex" not in entry

    def test_col_index_not_computed_without_api_cities(self):
        """No COL auto-compute when api_cities is None."""
        entry = _make_manual_entry(monthlyCostsNoRent=1000, rent=1200)
        _compute_col_entry(entry, MOCK_CONFIG, api_cities=None)
        assert "colIndex" not in entry

    def test_col_index_exact_match_nyc(self):
        """If city costs = NYC costs, colIndex should be 100."""
        entry = _make_manual_entry(monthlyCostsNoRent=1728.09, rent=2697.09)
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        assert entry["colIndex"] == pytest.approx(100.0, abs=0.1)

    def test_col_index_double_nyc(self):
        """If city costs = 2x NYC costs, colIndex should be ~200."""
        entry = _make_manual_entry(monthlyCostsNoRent=3456.18, rent=2000)
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        assert entry["colIndex"] == pytest.approx(200.0, abs=0.1)


# ---------------------------------------------------------------------------
# PPI auto-computation for manual entries
# ---------------------------------------------------------------------------

class TestPPIComputation:
    """_compute_col_entry: Purchasing Power Index via colPlusRentIndex formula."""

    def test_ppi_full_calculation(self):
        """Known-value PPI check.

        costs=1000, rent=1200 (1brSuburb), NYC costs=1728.09, NYC rent=2697.09
        colIndex = 1000/1728.09*100 ≈ 57.87
        rentIndex = 1200/2697.09*100 ≈ 44.49
        colPlusRentIndex = (57.87 + 44.49) / 2 ≈ 51.18
        With avgNetSalary fallback = referenceSalary/12 = 60000/12 = 5000
        (no state match, no stored salary)
        PPI = (5000 / 51.18) / (5158.83 / 100) * 100 ≈ 189.5
        """
        entry = _make_manual_entry(monthlyCostsNoRent=1000, rent=1200)
        config = {**MOCK_CONFIG, "referenceSalary": 60000}
        _compute_col_entry(entry, config, MOCK_API_CITIES)
        assert entry["colPlusRentIndex"] == pytest.approx(51.2, abs=0.2)
        assert entry["rentIndex"] == pytest.approx(44.5, abs=0.2)
        assert entry["purchasingPower"] == pytest.approx(189.5, abs=1.0)

    def test_ppi_with_stored_salary(self):
        """Uses stored avgNetSalary when > 0 instead of fallback.

        Same costs/rent => colPlusRentIndex ≈ 51.18
        avgNetSalary = 4155
        PPI = (4155/51.18) / (5158.83/100) * 100 ≈ 157.4
        """
        entry = _make_manual_entry(
            monthlyCostsNoRent=1000, rent=1200, avgNetSalary=4155,
        )
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        assert entry["purchasingPower"] == pytest.approx(157.4, abs=1.0)

    def test_ppi_with_state_salary_fallback(self):
        """Falls back to state average salary when no stored salary.

        Detroit is in MI with avgNetSalary=3200.
        Entry area="MI" matches Detroit's state.
        salary = 3200 (state avg from Detroit)
        colPlusRentIndex ≈ 51.18
        PPI = (3200/51.18) / (5158.83/100) * 100 ≈ 121.2
        """
        entry = _make_manual_entry(
            monthlyCostsNoRent=1000, rent=1200, area="MI",
            country="United States",
        )
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        assert entry["avgNetSalary"] == pytest.approx(3200, abs=0.1)
        assert entry["purchasingPower"] == pytest.approx(121.2, abs=1.0)

    def test_ppi_salary_fallback_reference(self):
        """Falls back to referenceSalary/12 when no state match and no stored salary.

        referenceSalary = 60000 => monthly = 5000
        """
        entry = _make_manual_entry(
            monthlyCostsNoRent=1000, rent=1200, area="XX",
        )
        config = {**MOCK_CONFIG, "referenceSalary": 60000}
        _compute_col_entry(entry, config, MOCK_API_CITIES)
        assert entry["avgNetSalary"] == pytest.approx(5000, abs=0.1)

    def test_ppi_not_computed_for_api_source(self):
        """API entries should not get their purchasingPower recomputed."""
        entry = _make_api_entry()
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        # purchasingPower comes from apiData, not the manual formula
        assert entry.get("purchasingPower") == 120.0

    def test_ppi_not_computed_when_col_index_zero(self):
        """No PPI when colIndex is 0 (costs=0 → colIndex never set)."""
        entry = _make_manual_entry(monthlyCostsNoRent=0, rent=1200)
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        assert "purchasingPower" not in entry

    def test_ppi_rent_zero_uses_col_only(self):
        """When rent=0, rentIndex=0 so colPlusRentIndex falls back to colIndex only."""
        entry = _make_manual_entry(monthlyCostsNoRent=1000, rent=0)
        config = {**MOCK_CONFIG, "referenceSalary": 60000}
        _compute_col_entry(entry, config, MOCK_API_CITIES)
        # colIndex ≈ 57.9, rentIndex = 0, so cpr_idx = colIndex = 57.9
        assert entry["colPlusRentIndex"] == pytest.approx(57.9, abs=0.2)
        assert entry["rentIndex"] == 0


# ---------------------------------------------------------------------------
# Salary resolution priority
# ---------------------------------------------------------------------------

class TestSalaryResolution:
    """_compute_col_entry: salary resolution order for PPI formula."""

    def test_uses_stored_salary_first(self):
        """Stored avgNetSalary > 0 takes priority over state avg and fallback."""
        entry = _make_manual_entry(
            monthlyCostsNoRent=1000, rent=1200,
            avgNetSalary=7000, area="MI", country="United States",
        )
        _compute_col_entry(entry, MOCK_CONFIG, MOCK_API_CITIES)
        # Should use 7000, NOT Detroit's 3200
        # PPI = (7000 / 51.18) / (5158.83 / 100) * 100 ≈ 265.2
        assert entry["purchasingPower"] == pytest.approx(265.2, abs=1.5)

    def test_state_match_beats_reference_fallback(self):
        """State avg (Detroit MI = 3200) beats referenceSalary/12 = 5000."""
        entry = _make_manual_entry(
            monthlyCostsNoRent=1000, rent=1200,
            area="MI", country="United States",
        )
        config = {**MOCK_CONFIG, "referenceSalary": 60000}
        _compute_col_entry(entry, config, MOCK_API_CITIES)
        assert entry["avgNetSalary"] == pytest.approx(3200, abs=0.1)

    def test_no_state_match_falls_back_to_reference(self):
        """Unknown state falls back to referenceSalary / 12."""
        entry = _make_manual_entry(
            monthlyCostsNoRent=1000, rent=1200, area="ZZ",
        )
        config = {**MOCK_CONFIG, "referenceSalary": 84000}
        _compute_col_entry(entry, config, MOCK_API_CITIES)
        assert entry["avgNetSalary"] == pytest.approx(7000, abs=0.1)  # 84000/12


# ---------------------------------------------------------------------------
# Derived fields: housing multiplier, non-housing multiplier, overall factor
# ---------------------------------------------------------------------------

class TestDerivedFields:
    """_compute_col_entry: housingMult, overallFactor, equivalentSalary."""

    def test_housing_multiplier(self):
        """housingMult = cityRent / currentRent."""
        entry = _make_manual_entry(rent=2400)
        config = {**MOCK_CONFIG, "currentRent": 1200}
        _compute_col_entry(entry, config, MOCK_API_CITIES)
        assert entry["housingMult"] == 2.0

    def test_housing_multiplier_zero_current_rent(self):
        """housingMult defaults to 1.0 when currentRent = 0."""
        entry = _make_manual_entry(rent=2400)
        config = {**MOCK_CONFIG, "currentRent": 0}
        _compute_col_entry(entry, config, api_cities=None)
        assert entry["housingMult"] == 1.0

    def test_direct_formula_used(self):
        """When all costs available, uses direct cost ratio formula."""
        entry = _make_manual_entry(rent=2000, monthlyCostsNoRent=1500)
        config = {**MOCK_CONFIG, "currentRent": 1200, "homeMonthlyCosts": 900}
        _compute_col_entry(entry, config, MOCK_API_CITIES)
        assert entry["formulaUsed"] == "direct"
        # (2000 + 1500) / (1200 + 900) = 3500 / 2100 ≈ 1.67
        assert entry["overallFactor"] == pytest.approx(1.67, abs=0.01)


# ---------------------------------------------------------------------------
# API route integration tests
# ---------------------------------------------------------------------------

class TestCOLRoutes:
    """Integration tests for /api/cost-of-living endpoints using Flask test client."""

    def test_add_manual_city_returns_computed_ppi(self, client):
        """POST /api/cost-of-living/add with manual city returns auto-computed PPI."""
        with patch("services.col_api.get_col_cities", return_value=MOCK_API_CITIES):
            resp = client.post("/api/cost-of-living/add", json={
                "metro": "Test Town",
                "area": "",
                "rent": 1200,
                "monthlyCostsNoRent": 1000,
                "source": "manual",
            })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        item = data["item"]
        assert "colIndex" in item
        assert item["colIndex"] == pytest.approx(57.9, abs=0.2)
        assert "purchasingPower" in item
        assert item["purchasingPower"] > 0

    def test_add_manual_city_no_costs_no_ppi(self, client):
        """POST without monthlyCostsNoRent => no auto-computed colIndex or PPI."""
        with patch("services.col_api.get_col_cities", return_value=MOCK_API_CITIES):
            resp = client.post("/api/cost-of-living/add", json={
                "metro": "No Cost City",
                "area": "",
                "rent": 1200,
                "monthlyCostsNoRent": 0,
                "source": "manual",
            })
        assert resp.status_code == 200
        item = resp.get_json()["item"]
        assert "colIndex" not in item or item.get("colIndex", 0) == 0
        assert "purchasingPower" not in item

    def test_get_col_includes_home_purchasing_power(self, client):
        """GET /api/cost-of-living includes colConfig.homePurchasingPower."""
        # Set up portfolio with homeColIndex so homePurchasingPower is computed
        from services.data_store import load_portfolio, save_portfolio
        portfolio = load_portfolio()
        portfolio["colConfig"] = {
            **_default_col_config_for_test(),
            "homeColIndex": 65.0,
            "homeState": "MI",
            "homeCountry": "United States",
        }
        save_portfolio(portfolio)

        with patch("services.col_api.get_col_cities", return_value=MOCK_API_CITIES):
            resp = client.get("/api/cost-of-living")
        assert resp.status_code == 200
        data = resp.get_json()
        config = data["colConfig"]
        assert "homePurchasingPower" in config
        assert config["homePurchasingPower"] is not None
        assert config["homePurchasingPower"] > 0

    def test_add_duplicate_metro_rejected(self, client):
        """Adding the same metro name twice should return 400."""
        # Pre-seed portfolio with costOfLiving key so appended entries persist
        from services.data_store import load_portfolio, save_portfolio
        portfolio = load_portfolio()
        portfolio["costOfLiving"] = []
        save_portfolio(portfolio)

        with patch("services.col_api.get_col_cities", return_value=MOCK_API_CITIES):
            resp1 = client.post("/api/cost-of-living/add", json={
                "metro": "Duplicate City", "rent": 1000,
                "monthlyCostsNoRent": 800, "source": "manual",
            })
            assert resp1.status_code == 200
            resp = client.post("/api/cost-of-living/add", json={
                "metro": "Duplicate City", "rent": 1100,
                "monthlyCostsNoRent": 900, "source": "manual",
            })
        assert resp.status_code == 400
        assert "already exists" in resp.get_json()["error"]


def _default_col_config_for_test():
    """Minimal COL config for integration tests."""
    return {
        "homeCityName": "East Lansing, MI",
        "referenceSalary": 60000,
        "referenceSalarySource": "manual",
        "currentRent": 1200,
        "housingWeight": 0.30,
        "comparisonSalary": 200000,
        "bedroomCount": 1,
        "locationType": "suburb",
        "homeColIndex": None,
        "homeMonthlyCosts": None,
        "homeColSource": "manual",
        "homeProxyCity": None,
        "homeState": None,
        "homeCountry": "United States",
    }
