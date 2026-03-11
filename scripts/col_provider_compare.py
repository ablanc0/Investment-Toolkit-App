#!/usr/bin/env python3
"""COL Provider Comparison — fetches 20 US cities from 4 RapidAPI providers
and compares data quality against Numbeo ground truth.

Usage:
    python scripts/col_provider_compare.py [--providers ditno,traveltables,zyla,resettle]
                                           [--cities 5]   # limit city count for testing
                                           [--dry-run]    # show config, don't call APIs

Requires: RAPIDAPI_KEY env var (or reads from portfolio.json settings).

Issue: #160
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Add project root so we can import config
sys.path.insert(0, str(Path(__file__).parent.parent))

import requests

# ── Configuration ─────────────────────────────────────────────────────

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")

# 20 US cities: 10 major + 10 mid-size
SAMPLE_CITIES = [
    # Major
    {"name": "New York", "country": "United States", "state": "NY"},
    {"name": "San Francisco", "country": "United States", "state": "CA"},
    {"name": "Chicago", "country": "United States", "state": "IL"},
    {"name": "Los Angeles", "country": "United States", "state": "CA"},
    {"name": "Houston", "country": "United States", "state": "TX"},
    {"name": "Miami", "country": "United States", "state": "FL"},
    {"name": "Seattle", "country": "United States", "state": "WA"},
    {"name": "Boston", "country": "United States", "state": "MA"},
    {"name": "Denver", "country": "United States", "state": "CO"},
    {"name": "Austin", "country": "United States", "state": "TX"},
    # Mid-size
    {"name": "Nashville", "country": "United States", "state": "TN"},
    {"name": "Portland", "country": "United States", "state": "OR"},
    {"name": "Minneapolis", "country": "United States", "state": "MN"},
    {"name": "Tampa", "country": "United States", "state": "FL"},
    {"name": "Raleigh", "country": "United States", "state": "NC"},
    {"name": "Salt Lake City", "country": "United States", "state": "UT"},
    {"name": "Pittsburgh", "country": "United States", "state": "PA"},
    {"name": "Columbus", "country": "United States", "state": "OH"},
    {"name": "Indianapolis", "country": "United States", "state": "IN"},
    {"name": "Charlotte", "country": "United States", "state": "NC"},
]

# Numbeo ground truth (manually collected Mar 2026)
# Fields: rent1br, avgNetSalary, utilities, mealInexpensive, monthlyTransit, colIndex
NUMBEO_BASELINE = {
    "New York":       {"rent1br": 4399, "avgNetSalary": 5254, "utilities": 200, "mealInexpensive": 25, "monthlyTransit": 132, "colIndex": 100},
    "San Francisco":  {"rent1br": 3413, "avgNetSalary": 7288, "utilities": 191, "mealInexpensive": 25, "monthlyTransit": 98,  "colIndex": 93},
    "Chicago":        {"rent1br": 2208, "avgNetSalary": 4621, "utilities": 155, "mealInexpensive": 20, "monthlyTransit": 105, "colIndex": 79},
    "Los Angeles":    {"rent1br": 2642, "avgNetSalary": 5069, "utilities": 170, "mealInexpensive": 22, "monthlyTransit": 100, "colIndex": 83},
    "Houston":        {"rent1br": 1436, "avgNetSalary": 4340, "utilities": 164, "mealInexpensive": 18, "monthlyTransit": 44,  "colIndex": 67},
    "Miami":          {"rent1br": 2498, "avgNetSalary": 3741, "utilities": 168, "mealInexpensive": 22, "monthlyTransit": 112, "colIndex": 80},
    "Seattle":        {"rent1br": 2335, "avgNetSalary": 6207, "utilities": 163, "mealInexpensive": 22, "monthlyTransit": 99,  "colIndex": 82},
    "Boston":         {"rent1br": 3074, "avgNetSalary": 5409, "utilities": 195, "mealInexpensive": 22, "monthlyTransit": 90,  "colIndex": 91},
    "Denver":         {"rent1br": 1815, "avgNetSalary": 4852, "utilities": 150, "mealInexpensive": 20, "monthlyTransit": 114, "colIndex": 76},
    "Austin":         {"rent1br": 1716, "avgNetSalary": 4813, "utilities": 173, "mealInexpensive": 18, "monthlyTransit": 41,  "colIndex": 72},
}

# Canonical fields to compare (available across most providers)
COMPARE_FIELDS = ["rent1br", "avgNetSalary", "utilities", "mealInexpensive", "monthlyTransit"]


def get_api_key():
    """Get RapidAPI key from env or portfolio.json settings."""
    if RAPIDAPI_KEY:
        return RAPIDAPI_KEY
    # Try reading from portfolio.json settings
    try:
        from config import PORTFOLIO_FILE
        data = json.loads(PORTFOLIO_FILE.read_text())
        return data.get("settings", {}).get("apiKeys", {}).get("rapidapi", "")
    except Exception:
        return ""


# ── Provider Implementations ──────────────────────────────────────────

class ProviderBase:
    """Base class for COL API providers."""
    name = "base"
    host = ""
    calls_used = 0

    def __init__(self, api_key):
        self.api_key = api_key
        self.headers = {
            "x-rapidapi-host": self.host,
            "x-rapidapi-key": api_key,
        }

    def fetch_cities(self, cities):
        """Fetch COL data for list of cities. Returns list of normalized dicts."""
        raise NotImplementedError

    def _get(self, url, params=None):
        """Make a GET request and count it. Raises on 429 (let caller handle)."""
        self.calls_used += 1
        r = requests.get(url, headers=self.headers, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def _post(self, url, data=None, json_data=None):
        """Make a POST request and count it."""
        self.calls_used += 1
        r = requests.post(url, headers=self.headers, data=data, json=json_data, timeout=120)
        r.raise_for_status()
        return r.json()


class DitnoProvider(ProviderBase):
    """Current provider — ditno Cities Cost of Living (bulk POST)."""
    name = "ditno"
    host = "cities-cost-of-living1.p.rapidapi.com"

    def fetch_cities(self, cities):
        url = f"https://{self.host}/dev/get_cities_details_by_name"
        self.headers["Content-Type"] = "application/x-www-form-urlencoded"
        payload = {
            "cities": json.dumps([{"name": c["name"], "country": c["country"]} for c in cities]),
            "currencies": json.dumps(["USD"]),
        }
        raw = self._post(url, data=payload)
        raw_cities = raw.get("data", raw) if isinstance(raw, dict) else raw

        results = []
        for city in raw_cities:
            if not isinstance(city, dict):
                continue
            details = {}
            for block in city.get("cost_of_living_details", []):
                if block.get("currency") != "USD":
                    continue
                for d in block.get("details", []):
                    details[d["Item"]] = _pf(d.get("Value", "0"))

            results.append({
                "name": city.get("name", ""),
                "rent1br": details.get("Apartment (1 bedroom) in City Centre", 0),
                "avgNetSalary": details.get("Average Monthly Net Salary (After Tax)", 0),
                "utilities": details.get("Basic (Electricity, Heating, Cooling, Water, Garbage) for 915 sq ft Apartment", 0),
                "mealInexpensive": details.get("Meal, Inexpensive Restaurant", 0),
                "monthlyTransit": details.get("Monthly Pass (Regular Price)", 0),
                "colIndex": _pf(city.get("cost_of_living_index", 0)),
                "lastUpdated": city.get("last_updated_timestamp", ""),
            })
        return results


class TravelTablesProvider(ProviderBase):
    """TravelTables — per-city GET, 1,000 free/mo."""
    name = "traveltables"
    host = "cost-of-living-and-prices.p.rapidapi.com"

    # Field name mapping: TravelTables item name → our canonical field
    FIELD_MAP = {
        "One bedroom apartment in city centre": "rent1br",
        "Average Monthly Net Salary, After Tax": "avgNetSalary",
        "Basic utilities for 85 square meter Apartment including Electricity, Heating or Cooling, Water and Garbage": "utilities",
        "Meal in Inexpensive Restaurant": "mealInexpensive",
        "Monthly Pass, Regular Price": "monthlyTransit",
    }

    def fetch_cities(self, cities):
        results = []
        for i, city in enumerate(cities):
            try:
                data = self._get(
                    f"https://{self.host}/prices",
                    params={"city_name": city["name"], "country_name": city["country"]}
                )
                # Check for rate limit message in JSON body (TravelTables returns 200 with error)
                if isinstance(data, dict) and "exceeded" in str(data.get("message", "")).lower():
                    print(f"  [{self.name}] Rate limited at city {i+1}/{len(cities)}")
                    results.append({"name": city["name"], "error": "rate_limited"})
                    break  # Stop — hourly quota burned
                # Detect soft rate limit: 200 OK but empty prices array
                if isinstance(data, dict) and not data.get("prices"):
                    print(f"  [{self.name}] Empty response for {city['name']} (soft rate limit?)")
                    results.append({"name": city["name"], "error": "empty_response"})
                    continue
                results.append(self._normalize(city["name"], data))
                # 10 req/hour = ~7s between requests minimum
                if i < len(cities) - 1:
                    time.sleep(8)
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 429:
                    print(f"  [{self.name}] Rate limited at city {i+1}/{len(cities)}")
                    results.append({"name": city["name"], "error": "rate_limited"})
                    break
                print(f"  [{self.name}] Failed {city['name']}: {e}")
                results.append({"name": city["name"], "error": str(e)})
            except Exception as e:
                print(f"  [{self.name}] Failed {city['name']}: {e}")
                results.append({"name": city["name"], "error": str(e)})
        return results

    def _normalize(self, city_name, data):
        """Extract fields from TravelTables response."""
        result = {"name": city_name, "colIndex": 0, "lastUpdated": ""}
        prices = data.get("prices", [])
        for item in prices:
            item_name = item.get("item_name", "")
            if item_name in self.FIELD_MAP:
                field = self.FIELD_MAP[item_name]
                # Use avg of min/max, or just the value
                val = item.get("avg", item.get("min", 0))
                result[field] = _pf(val)

        # Try to get COL index from the response
        result["colIndex"] = _pf(data.get("cost_of_living_index", 0))
        # Fill missing fields with 0
        for f in COMPARE_FIELDS:
            result.setdefault(f, 0)
        return result


class ZylaLabsProvider(ProviderBase):
    """Zyla Labs — Cities Cost of Living and Average Prices API. Per-city GET, 100 free/mo."""
    name = "zyla"
    host = "cities-cost-of-living-and-average-prices-api.p.rapidapi.com"

    FIELD_MAP = {
        "Apartment (1 bedroom) in City Centre": "rent1br",
        "Average Monthly Net Salary (After Tax)": "avgNetSalary",
        "Basic (Electricity, Heating, Cooling, Water, Garbage) for 85m2 Apartment": "utilities",
        "Basic (Electricity, Heating, Cooling, Water, Garbage) for 915 sq ft Apartment": "utilities",
        "Meal, Inexpensive Restaurant": "mealInexpensive",
        "Monthly Pass (Regular Price)": "monthlyTransit",
    }

    def fetch_cities(self, cities):
        results = []
        for city in cities:
            try:
                # Zyla uses slug format: "new-york-ny" or "austin-tx"
                city_slug = city["name"].lower().replace(" ", "-")
                if city.get("state"):
                    city_slug += f"-{city['state'].lower()}"
                country_slug = city["country"].lower().replace(" ", "-")

                data = self._get(
                    f"https://{self.host}/cost_of_living",
                    params={"country": country_slug, "city": city_slug}
                )
                results.append(self._normalize(city["name"], data))
                time.sleep(0.5)
            except Exception as e:
                print(f"  [{self.name}] Failed {city['name']}: {e}")
                results.append({"name": city["name"], "error": str(e)})
        return results

    def _normalize(self, city_name, data):
        result = {"name": city_name, "colIndex": 0, "lastUpdated": ""}
        # Zyla returns a list of price items
        prices = data.get("prices", data.get("cost_of_living", []))
        if isinstance(prices, list):
            for item in prices:
                item_name = item.get("item_name", item.get("name", ""))
                if item_name in self.FIELD_MAP:
                    field = self.FIELD_MAP[item_name]
                    val = item.get("avg", item.get("value", item.get("min", 0)))
                    result[field] = _pf(val)
        elif isinstance(prices, dict):
            # Some responses use dict format
            for key, val in prices.items():
                if key in self.FIELD_MAP:
                    result[self.FIELD_MAP[key]] = _pf(val)

        result["colIndex"] = _pf(data.get("cost_of_living_index", 0))
        for f in COMPARE_FIELDS:
            result.setdefault(f, 0)
        return result


class ZylaGlobalProvider(ProviderBase):
    """Zyla Labs — Global City Cost API. Per-city GET, 20 free/mo.

    Response is a flat dict with keys like:
      "1 Bedroom Apartment in City Centre": "1,697.82 $"
      "Average Monthly Net Salary (After Tax)": "4,252.41 $"
    """
    name = "zyla-global"
    host = "global-city-cost-api.p.rapidapi.com"

    # Maps Zyla Global field names → our canonical names
    FIELD_MAP = {
        "1 Bedroom Apartment in City Centre": "rent1br",
        "Average Monthly Net Salary (After Tax)": "avgNetSalary",
        "Basic Utilities for 915 Square Feet Apartment (Electricity, Heating, Cooling, Water, Garbage)": "utilities",
        "Meal at an Inexpensive Restaurant": "mealInexpensive",
        "Monthly Public Transport Pass (Regular Price)": "monthlyTransit",
    }

    def fetch_cities(self, cities):
        results = []
        for city in cities:
            try:
                # URL path uses %2B (encoded +) — requests will double-encode if we pass literal +
                url = f"https://{self.host}/cost%2Bof%2Bliving%2Bby%2Bcity%2Bv2"
                data = self._get(url, params={"country": city["country"], "city": city["name"]})
                results.append(self._normalize(city["name"], data))
                time.sleep(0.5)
            except Exception as e:
                print(f"  [{self.name}] Failed {city['name']}: {e}")
                results.append({"name": city["name"], "error": str(e)})
        return results

    def _normalize(self, city_name, data):
        """Parse flat dict response with currency-symbol values."""
        result = {"name": city_name, "colIndex": 0, "lastUpdated": ""}
        if not isinstance(data, dict) or not data.get("Success"):
            return {**result, "error": f"API returned Success=False"}

        for api_key, canon_field in self.FIELD_MAP.items():
            val = data.get(api_key, "0")
            result[canon_field] = _pf(val)

        for f in COMPARE_FIELDS:
            result.setdefault(f, 0)
        return result


class ResettleProvider(ProviderBase):
    """Resettle Place API — per-city GET with place_id lookup, 100 free/mo."""
    name = "resettle"
    host = "resettle-place-api.p.rapidapi.com"

    def fetch_cities(self, cities):
        results = []
        for i, city in enumerate(cities):
            try:
                # Step 1: Search for city to get place_id
                search_data = self._get(
                    f"https://{self.host}/place/search",
                    params={"q": city["name"], "scope": "cost-of-living", "country_code": "US"}
                )
                place_id = self._extract_place_id(search_data, city["name"])
                if not place_id:
                    print(f"  [{self.name}] No place_id for {city['name']}")
                    results.append({"name": city["name"], "error": "place_id not found"})
                    continue

                time.sleep(2)

                # Step 2: Fetch COL data
                col_data = self._get(
                    f"https://{self.host}/place/query/cost-of-living",
                    params={"place_id": place_id, "currency_code": "USD"}
                )
                results.append(self._normalize(city["name"], col_data))
                # 2 calls per city, space them out
                if i < len(cities) - 1:
                    time.sleep(5)
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 429:
                    print(f"  [{self.name}] Rate limited at city {i+1}/{len(cities)}")
                    results.append({"name": city["name"], "error": "rate_limited"})
                    break
                print(f"  [{self.name}] Failed {city['name']}: {e}")
                results.append({"name": city["name"], "error": str(e)})
            except Exception as e:
                print(f"  [{self.name}] Failed {city['name']}: {e}")
                results.append({"name": city["name"], "error": str(e)})
        return results

    def _extract_place_id(self, data, city_name):
        """Extract place_id from search results."""
        results = data.get("results", data.get("data", []))
        if isinstance(results, list):
            for r in results:
                if isinstance(r, dict):
                    return r.get("place_id", r.get("id", ""))
        if isinstance(data, dict) and data.get("place_id"):
            return data["place_id"]
        return None

    def _normalize(self, city_name, data):
        """Parse structured Resettle response with nested categories."""
        result = {"name": city_name, "colIndex": 0, "lastUpdated": ""}
        col = data.get("data", data)
        if not isinstance(col, dict):
            return {**result, "error": "unexpected response format"}

        # Direct field extraction from structured response
        housing = col.get("housing", {})
        result["rent1br"] = _pf(housing.get("rent_city_center_1_bedroom", 0))

        income = col.get("income", {})
        result["avgNetSalary"] = _pf(income.get("average_monthly_net_salary", 0))

        utilities = col.get("utilities", {})
        result["utilities"] = _pf(utilities.get("basic", 0))

        dining = col.get("dining", {})
        result["mealInexpensive"] = _pf(dining.get("inexpensive", 0))

        transport = col.get("transportation", {})
        result["monthlyTransit"] = _pf(transport.get("monthly_pass", 0))

        for f in COMPARE_FIELDS:
            result.setdefault(f, 0)
        return result


# ── Helpers ───────────────────────────────────────────────────────────

def _pf(val):
    """Parse float from various formats (strips currency symbols, commas)."""
    try:
        s = str(val).replace(",", "")
        # Strip common currency symbols and whitespace
        for ch in ("$", "€", "£", "¥", "₹", "%"):
            s = s.replace(ch, "")
        return round(float(s.strip()), 2)
    except (ValueError, TypeError):
        return 0.0


def compute_scores(provider_results, baseline=NUMBEO_BASELINE):
    """Compute quality scores for a provider's results.

    Returns dict with:
      - freshness: avg days since last_updated (lower = better)
      - completeness: % of non-zero fields across all cities
      - accuracy: avg absolute % deviation from Numbeo (lower = better)
      - city_details: per-city breakdown
    """
    now = datetime.now()
    total_fields = 0
    nonzero_fields = 0
    deviations = []
    freshness_days = []
    city_details = []

    for city_data in provider_results:
        name = city_data.get("name", "")
        if city_data.get("error"):
            city_details.append({"name": name, "error": city_data["error"]})
            continue

        detail = {"name": name}

        # Freshness
        last_updated = city_data.get("lastUpdated", "")
        if last_updated:
            try:
                dt = datetime.fromisoformat(str(last_updated).replace("Z", "+00:00"))
                days = (now - dt.replace(tzinfo=None)).days
                freshness_days.append(days)
                detail["daysOld"] = days
            except Exception:
                detail["daysOld"] = None
        else:
            detail["daysOld"] = None

        # Completeness
        for field in COMPARE_FIELDS:
            total_fields += 1
            val = city_data.get(field, 0)
            if val and val > 0:
                nonzero_fields += 1

        # Accuracy (only for cities in Numbeo baseline)
        if name in baseline:
            nb = baseline[name]
            city_devs = {}
            for field in COMPARE_FIELDS:
                api_val = city_data.get(field, 0)
                nb_val = nb.get(field, 0)
                if nb_val > 0 and api_val > 0:
                    pct_dev = abs(api_val - nb_val) / nb_val * 100
                    deviations.append(pct_dev)
                    city_devs[field] = {"api": api_val, "numbeo": nb_val, "devPct": round(pct_dev, 1)}
                elif nb_val > 0 and api_val == 0:
                    deviations.append(100)  # Missing = 100% deviation
                    city_devs[field] = {"api": 0, "numbeo": nb_val, "devPct": 100}
            detail["accuracy"] = city_devs

        city_details.append(detail)

    completeness = (nonzero_fields / total_fields * 100) if total_fields > 0 else 0
    avg_freshness = sum(freshness_days) / len(freshness_days) if freshness_days else None
    avg_accuracy = sum(deviations) / len(deviations) if deviations else None

    return {
        "freshnessDays": round(avg_freshness, 1) if avg_freshness is not None else "N/A",
        "completeness": round(completeness, 1),
        "accuracyPctDev": round(avg_accuracy, 1) if avg_accuracy is not None else "N/A",
        "citiesFetched": len([c for c in provider_results if not c.get("error")]),
        "citiesFailed": len([c for c in provider_results if c.get("error")]),
        "callsUsed": 0,  # filled in by caller
        "cityDetails": city_details,
    }


def print_report(all_scores):
    """Print a comparison report to console."""
    print("\n" + "=" * 80)
    print("COL PROVIDER COMPARISON REPORT")
    print(f"Generated: {datetime.now().isoformat()}")
    print("=" * 80)

    # Summary table
    print(f"\n{'Provider':<16} {'Cities':>7} {'Failed':>7} {'Complete%':>10} {'Accuracy':>10} {'Freshness':>10} {'API Calls':>10}")
    print("-" * 80)
    for name, scores in all_scores.items():
        fresh = f"{scores['freshnessDays']}d" if scores['freshnessDays'] != "N/A" else "N/A"
        acc = f"{scores['accuracyPctDev']}%" if scores['accuracyPctDev'] != "N/A" else "N/A"
        print(f"{name:<16} {scores['citiesFetched']:>7} {scores['citiesFailed']:>7} "
              f"{scores['completeness']:>9.1f}% {acc:>10} {fresh:>10} {scores['callsUsed']:>10}")

    # Per-city accuracy details (only for Numbeo baseline cities)
    print(f"\n{'--- Per-City Accuracy vs Numbeo ---':^80}")
    for name, scores in all_scores.items():
        print(f"\n  [{name}]")
        for city in scores["cityDetails"]:
            if city.get("error"):
                print(f"    {city['name']}: ERROR - {city['error']}")
                continue
            acc = city.get("accuracy", {})
            if acc:
                devs = [f"{f}={d['devPct']}%" for f, d in acc.items()]
                avg_dev = sum(d["devPct"] for d in acc.values()) / len(acc) if acc else 0
                print(f"    {city['name']}: avg={avg_dev:.1f}%  [{', '.join(devs)}]")

    # Winner
    print(f"\n{'--- RECOMMENDATION ---':^80}")
    # Rank by: completeness (higher=better), accuracy (lower=better), freshness (lower=better)
    ranked = []
    for name, scores in all_scores.items():
        comp = scores["completeness"]
        acc = scores["accuracyPctDev"] if scores["accuracyPctDev"] != "N/A" else 999
        fresh = scores["freshnessDays"] if scores["freshnessDays"] != "N/A" else 9999
        # Composite score: normalize each metric (lower = better)
        score = (100 - comp) + acc + (fresh / 30)  # penalize stale data
        ranked.append((name, score, comp, acc, fresh))
    ranked.sort(key=lambda x: x[1])

    for i, (name, score, comp, acc, fresh) in enumerate(ranked):
        marker = " <<<< WINNER" if i == 0 else ""
        print(f"  #{i+1} {name}: composite={score:.1f} (completeness={comp}%, accuracy={acc}%, freshness={fresh}d){marker}")

    print("\n" + "=" * 80)


# ── Main ──────────────────────────────────────────────────────────────

PROVIDERS = {
    "ditno": DitnoProvider,
    "traveltables": TravelTablesProvider,
    # "zyla": ZylaLabsProvider,  # ELIMINATED: 401 Unauthorized even from RapidAPI playground
    "zyla-global": ZylaGlobalProvider,
    "resettle": ResettleProvider,
}


def main():
    parser = argparse.ArgumentParser(description="Compare COL API providers")
    parser.add_argument("--providers", default="ditno,traveltables,zyla-global,resettle",
                        help="Comma-separated provider names")
    parser.add_argument("--cities", type=int, default=20,
                        help="Number of cities to test (default: 20)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show config without making API calls")
    parser.add_argument("--output", default=None,
                        help="Save JSON report to file")
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        print("ERROR: No RapidAPI key. Set RAPIDAPI_KEY env var or configure in app settings.")
        sys.exit(1)

    provider_names = [p.strip() for p in args.providers.split(",")]
    cities = SAMPLE_CITIES[:args.cities]

    print(f"COL Provider Comparison")
    print(f"  Providers: {', '.join(provider_names)}")
    print(f"  Cities: {len(cities)} ({', '.join(c['name'] for c in cities)})")
    print(f"  Numbeo baseline: {len(NUMBEO_BASELINE)} cities")
    print(f"  API key: ...{api_key[-6:]}")

    if args.dry_run:
        print("\n[DRY RUN] Would make the following API calls:")
        for name in provider_names:
            if name == "ditno":
                print(f"  {name}: 1 bulk POST (up to 50 cities)")
            elif name == "resettle":
                print(f"  {name}: {len(cities) * 2} GET calls (search + COL per city)")
            else:
                print(f"  {name}: {len(cities)} GET calls (per-city prices)")
        return

    all_scores = {}
    all_raw = {}

    for name in provider_names:
        if name not in PROVIDERS:
            print(f"\n  SKIP: Unknown provider '{name}'")
            continue

        print(f"\n{'─' * 60}")
        print(f"  Fetching from [{name}]...")
        provider = PROVIDERS[name](api_key)

        try:
            start = time.time()
            results = provider.fetch_cities(cities)
            elapsed = time.time() - start
            print(f"  [{name}] Done: {len(results)} cities in {elapsed:.1f}s ({provider.calls_used} API calls)")
        except Exception as e:
            print(f"  [{name}] FAILED: {e}")
            all_scores[name] = {
                "freshnessDays": "N/A", "completeness": 0,
                "accuracyPctDev": "N/A", "citiesFetched": 0,
                "citiesFailed": len(cities), "callsUsed": provider.calls_used,
                "cityDetails": [],
            }
            continue

        scores = compute_scores(results)
        scores["callsUsed"] = provider.calls_used
        all_scores[name] = scores
        all_raw[name] = results

    # Print report
    print_report(all_scores)

    # Save JSON output
    output_path = args.output or f"scripts/col_compare_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
    report = {
        "generatedAt": datetime.now().isoformat(),
        "cities": [c["name"] for c in cities],
        "numbeoBaseline": NUMBEO_BASELINE,
        "scores": {k: {kk: vv for kk, vv in v.items() if kk != "cityDetails"} for k, v in all_scores.items()},
        "details": all_scores,
        "raw": all_raw,
    }
    Path(output_path).write_text(json.dumps(report, indent=2, default=str))
    print(f"\nJSON report saved to: {output_path}")


if __name__ == "__main__":
    main()
