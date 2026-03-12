"""InvToolkit — Resettle Place API service.

Provides on-demand city cost-of-living lookups via the Resettle Place API
(RapidAPI). Two calls per city: search (get place_id) → cost-of-living (get data).

Free tier: 100 requests/month, 10/hour rate limit.
"""

from datetime import datetime

from config import RESETTLE_API_BASE, RESETTLE_API_HOST
from services.data_store import get_settings
from services.http_client import resilient_get


def _get_rapidapi_key():
    """Get RapidAPI key from user settings."""
    settings = get_settings()
    return (settings.get("apiKeys") or {}).get("rapidapi", "")


def search_place(city_name, country_code=None):
    """Search for a city by name. Returns {place_id, name, country_code} or None.

    Uses 1 API call.
    """
    key = _get_rapidapi_key()
    if not key:
        return None

    headers = {"x-rapidapi-host": RESETTLE_API_HOST, "x-rapidapi-key": key}
    params = {"q": city_name, "scope": "cost-of-living", "limit": "5"}
    if country_code:
        params["country_code"] = country_code

    try:
        r = resilient_get(
            f"{RESETTLE_API_BASE}/place/search",
            provider="rapidapi",
            headers=headers,
            params=params,
            timeout=15,
            max_retries=1,
        )
        if r.status_code != 200:
            print(f"[Resettle] Search failed HTTP {r.status_code}: {r.text[:200]}")
            return None

        data = r.json()
        results = data if isinstance(data, list) else data.get("results", data.get("data", []))

        if not results:
            print(f"[Resettle] No results for '{city_name}'")
            return None

        # Return first match
        place = results[0]
        return {
            "place_id": place.get("place_id") or place.get("id"),
            "name": place.get("name", city_name),
            "country_code": place.get("country_code", country_code or ""),
        }

    except Exception as e:
        print(f"[Resettle] Search error: {e}")
        return None


def fetch_cost_of_living(place_id):
    """Fetch cost-of-living data for a place_id. Returns raw API dict or None.

    Uses 1 API call.
    """
    key = _get_rapidapi_key()
    if not key:
        return None

    headers = {"x-rapidapi-host": RESETTLE_API_HOST, "x-rapidapi-key": key}
    params = {"place_id": place_id, "currency_code": "USD"}

    try:
        r = resilient_get(
            f"{RESETTLE_API_BASE}/place/query/cost-of-living",
            provider="rapidapi",
            headers=headers,
            params=params,
            timeout=20,
            max_retries=1,
        )
        if r.status_code != 200:
            print(f"[Resettle] COL fetch failed HTTP {r.status_code}: {r.text[:200]}")
            return None

        return r.json()

    except Exception as e:
        print(f"[Resettle] COL fetch error: {e}")
        return None


def _safe_float(val):
    """Safely convert a value to float, returning None for null/invalid."""
    if val is None:
        return None
    try:
        return round(float(val), 2)
    except (ValueError, TypeError):
        return None


def _get_nested(data, *keys):
    """Safely traverse nested dict keys, returning None if missing."""
    current = data
    for k in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(k)
    return current


def normalize_resettle(city_name, raw_data, country_code=""):
    """Transform raw Resettle API response into our canonical city schema.

    Returns a dict with the same shape as ditno/API entries.
    Skips null fields — only stores values that are actually available.
    """
    city = {
        "name": city_name,
        "country": "",
        "state": "",
        "source": "resettle",
        "lastUpdated": datetime.now().isoformat(),
    }

    if country_code:
        city["countryCode"] = country_code

    # Extract category dicts from response
    housing = _get_nested(raw_data, "housing") or {}
    income = _get_nested(raw_data, "income") or {}
    utilities = _get_nested(raw_data, "utilities") or {}
    transport = _get_nested(raw_data, "transportation") or {}
    dining = _get_nested(raw_data, "dining") or {}
    entertainment = _get_nested(raw_data, "entertainment") or {}
    education = _get_nested(raw_data, "education") or {}
    grocery = _get_nested(raw_data, "grocery") or {}
    mortgage = _get_nested(raw_data, "mortgage") or {}

    # ── Field mapping (Resettle → canonical) ──
    field_map = {
        "rent1brCity": _safe_float(housing.get("rent_city_center_1_bedroom")),
        "rent1brSuburb": _safe_float(housing.get("rent_outside_of_center_1_bedroom")),
        "rent3brCity": _safe_float(housing.get("rent_city_center_3_bedrooms")),
        "rent3brSuburb": _safe_float(housing.get("rent_outside_of_center_3_bedrooms")),
        "avgNetSalary": _safe_float(income.get("average_monthly_net_salary")),
        "utilities": _safe_float(utilities.get("basic")),
        "internet": _safe_float(utilities.get("internet")),
        "monthlyTransitPass": _safe_float(transport.get("monthly_pass")),
        "gasoline": _safe_float(transport.get("gasoline")),
        "mealInexpensive": _safe_float(dining.get("inexpensive")),
        "mealMidRange": _safe_float(dining.get("mid_tier")),
        "gym": _safe_float(entertainment.get("fitness_club")),
        "preschool": _safe_float(education.get("preschool")),
        "priceSqFtCity": _safe_float(housing.get("buy_city_center")),
        "priceSqFtSuburb": _safe_float(housing.get("buy_outside_of_center")),
        "mortgageRate": _safe_float(mortgage.get("interest_rate")),
    }

    # Only store non-null values
    non_null_count = 0
    total_fields = len(field_map)
    for key, val in field_map.items():
        if val is not None:
            city[key] = val
            non_null_count += 1
        else:
            city[key] = 0

    # ── Compute monthlyCostsNoRent from available items ──
    cost_items = []

    # Utilities
    basic_util = _safe_float(utilities.get("basic"))
    if basic_util is not None:
        cost_items.append(basic_util)
    internet_val = _safe_float(utilities.get("internet"))
    if internet_val is not None:
        cost_items.append(internet_val)
    mobile_val = _safe_float(utilities.get("mobile"))
    if mobile_val is not None:
        cost_items.append(mobile_val)

    # Transportation
    transit = _safe_float(transport.get("monthly_pass"))
    if transit is not None:
        cost_items.append(transit)

    # Grocery basket estimate — sum available items × monthly factor
    grocery_monthly = _estimate_monthly_grocery(grocery)
    if grocery_monthly > 0:
        cost_items.append(grocery_monthly)

    # Dining estimate — 8 inexpensive meals + 2 mid-range per month
    inexp = _safe_float(dining.get("inexpensive"))
    midrange = _safe_float(dining.get("mid_tier"))
    dining_monthly = 0
    if inexp is not None:
        dining_monthly += inexp * 8
    if midrange is not None:
        dining_monthly += midrange * 2
    if dining_monthly > 0:
        cost_items.append(round(dining_monthly, 2))

    city["monthlyCostsNoRent"] = round(sum(cost_items), 2) if cost_items else 0

    # Data quality metric
    city["dataCompleteness"] = round(non_null_count / total_fields, 2) if total_fields > 0 else 0

    # Initialize indices to 0 — will be computed later via compute_indices
    city["colIndex"] = 0
    city["rentIndex"] = 0
    city["groceriesIndex"] = 0
    city["restaurantIndex"] = 0
    city["colPlusRentIndex"] = 0
    city["purchasingPowerIndex"] = 0

    # Store empty details dict for compatibility with ditno schema
    city["details"] = {}

    return city


def _estimate_monthly_grocery(grocery):
    """Estimate monthly grocery cost from per-item prices.

    Uses typical monthly consumption quantities for a single person.
    """
    if not grocery:
        return 0

    # Item → monthly consumption units
    consumption = {
        "milk": 4,              # 4 liters
        "bread": 8,             # 8 loaves
        "rice": 2,              # 2 kg
        "eggs": 3,              # 3 dozen
        "cheese": 1,            # 1 kg
        "chicken": 3,           # 3 kg
        "beef": 2,              # 2 kg
        "apples": 4,            # 4 kg
        "banana": 4,            # 4 kg
        "oranges": 3,           # 3 kg
        "tomato": 3,            # 3 kg
        "potato": 3,            # 3 kg
        "onion": 2,             # 2 kg
        "lettuce": 4,           # 4 heads
        "water": 15,            # 15 bottles (1.5L)
    }

    total = 0
    for item, qty in consumption.items():
        price = _safe_float(grocery.get(item))
        if price is not None:
            total += price * qty

    return round(total, 2)
