"""InvToolkit — RapidAPI Cost of Living data service.

Fetches city-level cost data from the ditno Cities Cost of Living API
and persists to col_data.json (normalized) + col_raw.json (raw responses).
Follows the 13F history pattern (separate JSON, module-level state, startup loader).

Refresh is 2-phase to conserve the 5 calls/month budget:
  Phase 1 (check-cities): GET city list → detect new cities, store global list.
  Phase 2 (fetch-details): POST bulk details → update data, save raw backup.
"""

import json
import time
from datetime import datetime

from config import (
    COL_DATA_FILE,
    COL_RAW_FILE,
    RAPIDAPI_COL_HOST,
    RAPIDAPI_COL_URL,
    RAPIDAPI_COL_CITIES_URL,
)
from services.data_store import get_settings
from services.http_client import resilient_get, resilient_post

# ── Module-level state (loaded at startup) ────────────────────────────

_col_data = {}  # {"cities": [...], "cityNames": [...], "globalCityList": [...], ...}


def _get_rapidapi_key():
    """Get RapidAPI key from user settings."""
    settings = get_settings()
    return (settings.get("apiKeys") or {}).get("rapidapi", "")


# ── Disk I/O ──────────────────────────────────────────────────────────

def load_col_data():
    """Load stored COL API data from disk on startup."""
    global _col_data
    if COL_DATA_FILE.exists():
        try:
            data = json.loads(COL_DATA_FILE.read_text())
            _col_data.clear()
            _col_data.update(data)
            print(f"[COL] Loaded API data: {len(_col_data.get('cities', []))} cities")
        except Exception as e:
            print(f"[COL] Failed to load data: {e}")
            _col_data.clear()


def _save_col_data():
    """Persist normalized COL data to disk."""
    try:
        COL_DATA_FILE.write_text(json.dumps(_col_data, default=str))
    except Exception as e:
        print(f"[COL] Failed to save data: {e}")


def _save_raw(data, label=""):
    """Persist raw API response to col_raw.json for future formula improvements."""
    try:
        # Load existing raw data and append/update
        existing = {}
        if COL_RAW_FILE.exists():
            existing = json.loads(COL_RAW_FILE.read_text())
        existing[label] = {"data": data, "savedAt": datetime.now().isoformat()}
        COL_RAW_FILE.write_text(json.dumps(existing, default=str))
        print(f"[COL] Saved raw '{label}' to {COL_RAW_FILE}")
    except Exception as e:
        print(f"[COL] Failed to save raw data: {e}")


# ── Public accessors ──────────────────────────────────────────────────

def get_col_cities():
    """Return the stored list of normalized API cities (or empty list)."""
    return _col_data.get("cities", [])


def get_col_metadata():
    """Return metadata about the stored COL data."""
    global_list = _col_data.get("globalCityList", [])
    countries = set(c.get("country", "") for c in global_list if isinstance(c, dict))
    cities = _col_data.get("cities", [])
    # Last updated = most recent lastUpdated across all cities (includes Resettle/manual)
    last_updated = _col_data.get("fetchedAt")
    for c in cities:
        lu = c.get("lastUpdated", "")
        if lu and (not last_updated or lu > last_updated):
            last_updated = lu
    return {
        "cityCount": len(cities),
        "totalKnownCities": len(global_list),
        "totalCountries": len(countries),
        "usCityCount": len(_col_data.get("cityNames", [])),
        "fetchedAt": last_updated,
        "newCitiesAdded": _col_data.get("newCitiesAdded", 0),
    }


def lookup_city(city_name):
    """Find a city in stored API data by name (case-insensitive).
    Tries exact match first, then partial match.
    """
    cities = _col_data.get("cities", [])
    name_lower = city_name.lower().strip()
    for c in cities:
        if c["name"].lower() == name_lower:
            return c
    for c in cities:
        if name_lower in c["name"].lower():
            return c
    return None


def get_global_city_list():
    """Return the stored global city list (all countries) or empty list."""
    return _col_data.get("globalCityList", [])


# ── Manual city entries ───────────────────────────────────────────────

def save_manual_city(city_data):
    """Save or update a manual city entry in col_data.json.

    Manual entries have source='manual' and coexist with API entries.
    If a manual entry with the same name already exists, it is updated.
    Returns the saved city dict.
    """
    city_data["source"] = "manual"
    cities = _col_data.get("cities", [])

    # Check if manual entry with same name exists → update it
    name_lower = city_data["name"].lower().strip()
    for i, c in enumerate(cities):
        if c["name"].lower() == name_lower and c.get("source") == "manual":
            cities[i] = city_data
            _col_data["cities"] = cities
            _col_data["cityCount"] = len(cities)
            _save_col_data()
            return city_data

    # New manual entry — append
    cities.append(city_data)
    cities.sort(key=lambda c: c["name"])
    _col_data["cities"] = cities
    _col_data["cityCount"] = len(cities)
    _save_col_data()
    return city_data


def delete_manual_city(city_name):
    """Delete a manual city entry by name. Only deletes source='manual'."""
    cities = _col_data.get("cities", [])
    name_lower = city_name.lower().strip()
    original_len = len(cities)
    cities = [c for c in cities if not (c["name"].lower() == name_lower and c.get("source") == "manual")]
    if len(cities) < original_len:
        _col_data["cities"] = cities
        _col_data["cityCount"] = len(cities)
        _save_col_data()
        return True
    return False


# ── Fetch from RapidAPI ───────────────────────────────────────────────

def check_for_new_cities():
    """Phase 1: GET /get_cities_list — discover all cities globally.

    Stores the full global city list, extracts US names, compares
    against stored names to detect new additions.  Uses 1 API call.
    Returns dict: {newCities, totalAll, totalUS, totalCountries, usNames, error}.
    """
    key = _get_rapidapi_key()
    if not key:
        return {"error": "No RapidAPI key configured. Add it in Settings > API Keys."}

    headers = {"x-rapidapi-host": RAPIDAPI_COL_HOST, "x-rapidapi-key": key}
    try:
        r = resilient_get(RAPIDAPI_COL_CITIES_URL, provider="rapidapi",
                          headers=headers, timeout=30, max_retries=0)
        if r.status_code != 200:
            return {"error": f"Cities list HTTP {r.status_code}: {r.text[:200]}"}

        data = r.json()

        if "message" in data and isinstance(data["message"], str):
            return {"error": data["message"]}

        all_cities = data.get("cities", data) if isinstance(data, dict) else data

        # Save raw global list
        _save_raw(all_cities, "cityList")

        # Extract US cities
        us_names = sorted(c["name"] for c in all_cities
                          if isinstance(c, dict) and c.get("country") == "United States")

        # Count countries
        countries = set(c.get("country", "") for c in all_cities if isinstance(c, dict))

        # Compare against cached
        cached_names = set(_col_data.get("cityNames", []))
        new_names = [n for n in us_names if n not in cached_names]

        # Store the full global list + updated US names
        _col_data["globalCityList"] = all_cities
        _col_data["totalKnownCities"] = len(all_cities)
        _col_data["cityNames"] = us_names
        _save_col_data()

        return {
            "totalAll": len(all_cities),
            "totalUS": len(us_names),
            "totalCountries": len(countries),
            "newCities": new_names,
            "usNames": us_names,
        }

    except Exception as e:
        return {"error": str(e)}


def fetch_city_details(city_names=None):
    """Phase 2: POST bulk-fetch details for all cities.

    Uses stored cityNames (US) if none provided.  Saves raw response
    to col_raw.json for future formula improvements.  Uses 1 API call.
    Returns (normalized_cities_list, error_string_or_None).
    """
    key = _get_rapidapi_key()
    if not key:
        return None, "No RapidAPI key configured."

    if not city_names:
        city_names = _col_data.get("cityNames", [])
    if not city_names:
        return None, "No city names available. Run 'Check for cities' first."

    headers = {
        "x-rapidapi-host": RAPIDAPI_COL_HOST,
        "x-rapidapi-key": key,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    payload = {
        "cities": json.dumps([{"name": n, "country": "United States"} for n in city_names]),
        "currencies": json.dumps(["USD"]),
    }

    try:
        r = resilient_post(RAPIDAPI_COL_URL, provider="rapidapi",
                           headers=headers, data=payload, timeout=120, max_retries=0)

        if r.status_code != 200:
            return None, f"API returned HTTP {r.status_code}: {r.text[:200]}"

        raw = r.json()

        if "message" in raw and isinstance(raw["message"], str):
            return None, raw["message"]

        raw_cities = raw.get("data", raw) if isinstance(raw, dict) else raw

        # Save raw response for future formula improvements
        _save_raw(raw_cities, "cityDetails")

        new_cities = _normalize_cities(raw_cities)

        # Merge: update API entries, preserve manual entries untouched
        manual_cities = [c for c in _col_data.get("cities", []) if c.get("source") == "manual"]
        existing_api = {c["name"]: c for c in _col_data.get("cities", []) if c.get("source") != "manual"}
        merged = list(manual_cities)  # Always keep manual entries
        new_count = 0
        for city in new_cities:
            if city["name"] not in existing_api:
                new_count += 1
            city["source"] = "api"
            merged.append(city)
        # Keep API cities no longer returned by the fetch
        fetched_names = {c["name"] for c in new_cities}
        for name, city in existing_api.items():
            if name not in fetched_names:
                merged.append(city)
        merged.sort(key=lambda c: c["name"])

        _col_data.update({
            "cities": merged,
            "cityNames": city_names,
            "fetchedAt": datetime.now().isoformat(),
            "cityCount": len(merged),
            "newCitiesAdded": new_count,
        })
        _save_col_data()

        return merged, None

    except Exception as e:
        return None, str(e)


def fetch_all_global_details(batch_size=50):
    """Fetch details for ALL cities globally in batches.

    Sends cities in batches to avoid API timeouts. Each batch is one API call.
    Saves raw + normalized data after all batches complete.
    Returns (normalized_cities_list, error_string_or_None).
    """
    key = _get_rapidapi_key()
    if not key:
        return None, "No RapidAPI key configured."

    global_list = _col_data.get("globalCityList", [])
    if not global_list:
        return None, "No global city list. Run 'Check for cities' first."

    cities_payload = []
    for c in global_list:
        if isinstance(c, dict) and c.get("name") and c.get("country"):
            cities_payload.append({"name": c["name"], "country": c["country"]})

    if not cities_payload:
        return None, "Global city list has no valid entries."

    headers = {
        "x-rapidapi-host": RAPIDAPI_COL_HOST,
        "x-rapidapi-key": key,
        "Content-Type": "application/x-www-form-urlencoded",
    }

    # Split into batches
    batches = [cities_payload[i:i + batch_size]
               for i in range(0, len(cities_payload), batch_size)]

    all_raw = []
    all_normalized = []
    total_start = time.time()

    for idx, batch in enumerate(batches):
        print(f"[COL] Batch {idx + 1}/{len(batches)}: fetching {len(batch)} cities...")
        payload = {
            "cities": json.dumps(batch),
            "currencies": json.dumps(["USD"]),
        }
        start = time.time()
        try:
            r = resilient_post(RAPIDAPI_COL_URL, provider="rapidapi",
                               headers=headers, data=payload, timeout=120, max_retries=0)
            latency = int((time.time() - start) * 1000)

            if r.status_code != 200:
                print(f"[COL] Batch {idx + 1} failed: HTTP {r.status_code}")
                continue  # Skip failed batch, keep going

            raw = r.json()

            if "message" in raw and isinstance(raw["message"], str):
                print(f"[COL] Batch {idx + 1} error: {raw['message']}")
                continue

            raw_cities = raw.get("data", raw) if isinstance(raw, dict) else raw
            all_raw.extend(raw_cities)
            all_normalized.extend(_normalize_cities(raw_cities))
            print(f"[COL] Batch {idx + 1} OK: {len(raw_cities)} cities in {latency}ms")

        except Exception as e:
            print(f"[COL] Batch {idx + 1} exception: {e}")
            continue

        # Brief pause between batches to be polite to the API
        if idx < len(batches) - 1:
            time.sleep(1)

    if not all_normalized:
        return None, "All batches failed. Check API key and quota."

    # Save raw response
    _save_raw(all_raw, "globalDetails")

    # Deduplicate API entries by city name (last occurrence wins)
    seen = {}
    for c in all_normalized:
        c["source"] = "api"
        seen[c["name"]] = c
    all_normalized = sorted(seen.values(), key=lambda c: c["name"])

    # Preserve manual entries
    manual_cities = [c for c in _col_data.get("cities", []) if c.get("source") == "manual"]
    combined = manual_cities + all_normalized
    combined.sort(key=lambda c: c["name"])

    _col_data.update({
        "cities": combined,
        "fetchedAt": datetime.now().isoformat(),
        "cityCount": len(all_normalized),
    })
    _save_col_data()

    total_ms = int((time.time() - total_start) * 1000)
    print(f"[COL] Fetched {len(all_normalized)} global cities total in {total_ms}ms "
          f"({len(batches)} batches)")
    return all_normalized, None


# ── Normalization ─────────────────────────────────────────────────────

def _normalize_cities(raw_list):
    """Transform raw API response into normalized schema.

    Keeps backward-compatible top-level keys used by the app AND stores
    the full details dict with all 87 raw items for future use.
    """
    cities = []
    for city in raw_list:
        if not isinstance(city, dict):
            continue
        all_details = _extract_details(city)
        cities.append({
            "name": city.get("name", ""),
            "country": city.get("country", ""),
            "state": city.get("us_state", ""),
            # Indices (relative to NYC = 100)
            "colIndex": _parse_value(city.get("cost_of_living_index", 0)),
            "rentIndex": _parse_value(city.get("rent_index", 0)),
            "groceriesIndex": _parse_value(city.get("groceries_index", 0)),
            "restaurantIndex": _parse_value(city.get("restaurant_price_index", 0)),
            "colPlusRentIndex": _parse_value(city.get("cost_of_living_plus_rent_index", 0)),
            "purchasingPowerIndex": _parse_value(city.get("local_purchasing_power_index", 0)),
            # Rent variants
            "rent1brCity": all_details.get("Apartment (1 bedroom) in City Centre", 0),
            "rent1brSuburb": all_details.get("Apartment (1 bedroom) Outside of Centre", 0),
            "rent3brCity": all_details.get("Apartment (3 bedrooms) in City Centre", 0),
            "rent3brSuburb": all_details.get("Apartment (3 bedrooms) Outside of Centre", 0),
            # Cost & salary
            "monthlyCostsNoRent": all_details.get("Estimated Monthly Costs Without Rent", 0),
            "avgNetSalary": all_details.get("Average Monthly Net Salary (After Tax)", 0),
            # Utilities & transport
            "utilities": all_details.get("Basic (Electricity, Heating, Cooling, Water, Garbage) for 915 sq ft Apartment", 0),
            "internet": all_details.get("Internet (60 Mbps or More, Unlimited Data, Cable/ADSL)", 0),
            "monthlyTransitPass": all_details.get("Monthly Pass (Regular Price)", 0),
            "gasoline": all_details.get("Gasoline (1 gallon)", 0),
            # Lifestyle
            "mealInexpensive": all_details.get("Meal, Inexpensive Restaurant", 0),
            "mealMidRange": all_details.get("Meal for 2 People, Mid-range Restaurant, Three-course", 0),
            "gym": all_details.get("Fitness Club, Monthly Fee for 1 Adult", 0),
            "preschool": all_details.get("Preschool (or Kindergarten), Full Day, Private, Monthly for 1 Child", 0),
            # Real estate
            "priceSqFtCity": all_details.get("Price per Square Feet to Buy Apartment in City Centre", 0),
            "priceSqFtSuburb": all_details.get("Price per Square Feet to Buy Apartment Outside of Centre", 0),
            "mortgageRate": all_details.get("Mortgage Interest Rate in Percentages (%), Yearly, for 20 Years Fixed-Rate", 0),
            "lastUpdated": city.get("last_updated_timestamp", ""),
            # Full details — all 87 raw items preserved
            "details": all_details,
        })
    return sorted(cities, key=lambda c: c["name"])


def _extract_details(city):
    """Extract price items from cost_of_living_details → {Item: float_value}."""
    items = {}
    for block in city.get("cost_of_living_details", []):
        if block.get("currency") != "USD":
            continue
        for d in block.get("details", []):
            items[d["Item"]] = _parse_value(d.get("Value", "0"))
    return items


def _parse_value(val_str):
    """Parse a string value like '4168.08' to float."""
    try:
        return round(float(str(val_str).replace(",", "")), 2)
    except (ValueError, TypeError):
        return 0.0


# ── On-demand city lookup (Resettle) ──────────────────────────────────

def _find_city(city_name):
    """Find a city in stored data by name (case-insensitive, exact then partial).

    Prefers non-manual (API/resettle) entries so that having a manual entry
    doesn't prevent API lookups or shadow the API data.
    """
    cities = _col_data.get("cities", [])
    name_lower = city_name.lower().strip()
    # Exact match — prefer non-manual
    for c in cities:
        if c["name"].lower() == name_lower and c.get("source") != "manual":
            return c
    for c in cities:
        if c["name"].lower() == name_lower:
            return c
    # Partial match — prefer non-manual
    for c in cities:
        if name_lower in c["name"].lower() and c.get("source") != "manual":
            return c
    for c in cities:
        if name_lower in c["name"].lower():
            return c
    return None


def _get_nyc_reference():
    """Get New York city data for index computation."""
    cities = _col_data.get("cities", [])
    for c in cities:
        if c["name"].lower() == "new york":
            return c
    return None


def compute_indices(city, nyc):
    """Compute relative indices (NYC = 100) for a city entry."""
    if not nyc:
        return

    # COL index from monthly costs
    nyc_costs = float(nyc.get("monthlyCostsNoRent", 0))
    city_costs = float(city.get("monthlyCostsNoRent", 0))
    if nyc_costs > 0 and city_costs > 0:
        city["colIndex"] = round((city_costs / nyc_costs) * 100, 1)

    # Rent index from 1BR city rent
    nyc_rent = float(nyc.get("rent1brCity", 0))
    city_rent = float(city.get("rent1brCity", 0))
    if nyc_rent > 0 and city_rent > 0:
        city["rentIndex"] = round((city_rent / nyc_rent) * 100, 1)

    # COL + Rent combined index
    col_idx = float(city.get("colIndex", 0))
    rent_idx = float(city.get("rentIndex", 0))
    if col_idx > 0 and rent_idx > 0:
        city["colPlusRentIndex"] = round((col_idx + rent_idx) / 2, 1)

    # Purchasing power index
    nyc_salary = float(nyc.get("avgNetSalary", 0))
    city_salary = float(city.get("avgNetSalary", 0))
    cpr_idx = float(city.get("colPlusRentIndex", 0))
    if nyc_salary > 0 and city_salary > 0 and cpr_idx > 0:
        city["purchasingPowerIndex"] = round(
            (city_salary / cpr_idx) / (nyc_salary / 100) * 100, 1
        )


def _upsert_city(city):
    """Insert or update a city in the stored data.

    Rules:
    1. source='manual' entries are never overwritten
    2. New city → always insert
    3. Existing city → inflation heuristic: compare rent1brCity,
       higher rent = more recent data (update); otherwise keep existing
    """
    cities = _col_data.get("cities", [])
    name_lower = city["name"].lower().strip()

    for i, existing in enumerate(cities):
        if existing["name"].lower() == name_lower:
            # Skip manual entries — they coexist with API entries
            if existing.get("source") == "manual":
                continue

            # Inflation heuristic: compare rent1brCity
            existing_rent = float(existing.get("rent1brCity", 0))
            new_rent = float(city.get("rent1brCity", 0))

            if new_rent > 0 and existing_rent > 0:
                if new_rent > existing_rent:
                    # New data is likely more recent — update
                    cities[i] = city
                    _col_data["cities"] = cities
                    _save_col_data()
                    return city
                else:
                    # Existing data is likely more current — keep it
                    return existing
            elif new_rent > 0 and existing_rent == 0:
                # New data has rent info, existing doesn't — update
                cities[i] = city
                _col_data["cities"] = cities
                _save_col_data()
                return city
            else:
                # Compare completeness
                new_nonnull = sum(1 for v in city.values() if v and v != 0)
                old_nonnull = sum(1 for v in existing.values() if v and v != 0)
                if new_nonnull > old_nonnull:
                    cities[i] = city
                    _col_data["cities"] = cities
                    _save_col_data()
                    return city
                return existing

    # New city — insert
    cities.append(city)
    cities.sort(key=lambda c: c["name"])
    _col_data["cities"] = cities
    _col_data["cityCount"] = len(cities)
    _save_col_data()
    return city


def lookup_or_fetch(city_name, country=None, force=False):
    """Look up a city locally, or fetch from Resettle API if not found.

    Args:
        force: If True, skip local DB check and always fetch from Resettle.
               Used when user explicitly clicks "Search Online".

    Returns city dict on success, or dict with 'error' key on failure.
    """
    # 1. Check local DB (skip if force=True — user wants fresh data)
    if not force:
        existing = _find_city(city_name)
        if existing:
            return existing

    # 2. Check Resettle quota
    from services.col_quota import check_quota, record_call
    quota = check_quota("resettle")
    if not quota["allowed"]:
        return {
            "error": "quota_exhausted",
            "message": "Resettle API monthly quota exhausted",
            "remaining": 0,
            "limit": quota["limit"],
        }

    # 3. Search Resettle for place_id
    from services.resettle_svc import search_place, fetch_cost_of_living, normalize_resettle
    place = search_place(city_name, country_code=country)
    record_call("resettle")  # search uses 1 call

    if not place:
        return {"error": "city_not_found", "message": f"'{city_name}' not found on Resettle"}

    # 4. Fetch COL data
    raw = fetch_cost_of_living(place["place_id"])
    record_call("resettle")  # COL fetch uses 1 call

    if not raw:
        return {"error": "fetch_failed", "message": f"Failed to fetch COL data for '{city_name}'"}

    # 5. Normalize + compute indices + upsert
    city = normalize_resettle(city_name, raw, country_code=place.get("country_code", ""))
    # Use the canonical name from the API if available
    if place.get("name"):
        city["name"] = place["name"]

    nyc = _get_nyc_reference()
    if nyc:
        compute_indices(city, nyc)

    result = _upsert_city(city)
    print(f"[COL] Fetched '{city['name']}' from Resettle: rent1br=${city.get('rent1brCity', 0)}, "
          f"salary=${city.get('avgNetSalary', 0)}, completeness={city.get('dataCompleteness', 0)}")
    return result


# Backward compatibility alias
lookup_or_scrape = lookup_or_fetch
