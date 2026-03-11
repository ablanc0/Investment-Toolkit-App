"""InvToolkit — Numbeo cost-of-living scraper.

On-demand scraper: Numbeo is ALWAYS the primary source. The local DB
(col_data.json) is a fallback cache that grows as users explore cities.

Fetches the city page (numbeo.com/cost-of-living/in/{City}) to get:
  - 55 individual prices (rent, salary, groceries, transport, etc.)
  - monthlyCostsNoRent from Numbeo's summary text

Indices (colIndex, rentIndex, etc.) are ALWAYS computed by us from raw
prices using NYC = 100 baseline. This ensures consistency — every city
is measured with the same formula, making comparisons reliable.
"""

import re
from datetime import datetime
from html import unescape

import requests

# ── Constants ────────────────────────────────────────────────────────

# US state name → abbreviation (for consistency with existing ditno data)
_US_STATE_ABBREV = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
    "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    "district of columbia": "DC",
}

NUMBEO_BASE = "https://www.numbeo.com/cost-of-living/in"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 15

# Map Numbeo item names → our canonical field names (matching col_data schema)
FIELD_MAP = {
    # Rent
    "1 Bedroom Apartment in City Centre": "rent1brCity",
    "1 Bedroom Apartment Outside of City Centre": "rent1brSuburb",
    "3 Bedroom Apartment in City Centre": "rent3brCity",
    "3 Bedroom Apartment Outside of City Centre": "rent3brSuburb",
    # Salary
    "Average Monthly Net Salary (After Tax)": "avgNetSalary",
    # Utilities & connectivity
    "Basic Utilities for 915 Square Feet Apartment (Electricity, Heating, Cooling, Water, Garbage)": "utilities",
    "Mobile Phone Plan (Monthly, with Calls and 10GB+ Data)": "mobile",
    "Broadband Internet (Unlimited Data, 60 Mbps or Higher)": "internet",
    # Transport
    "Monthly Public Transport Pass (Regular Price)": "monthlyTransitPass",
    "Gasoline (1 Liter)": "gasoline",
    # Food
    "Meal at an Inexpensive Restaurant": "mealInexpensive",
    "Meal for Two at a Mid-Range Restaurant (Three Courses, Without Drinks)": "mealMidRange",
    # Lifestyle
    "Monthly Fitness Club Membership": "gym",
    "Private Full-Day Preschool or Kindergarten, Monthly Fee per Child": "preschool",
    # Real estate
    "Price per Square Feet to Buy Apartment in City Centre": "priceSqFtCity",
    "Price per Square Feet to Buy Apartment Outside of Centre": "priceSqFtSuburb",
    # Mortgage
    "Annual Mortgage Interest Rate (20-Year Fixed, in %)": "mortgageRate",
}

# Grocery items used for groceriesIndex computation
GROCERY_ITEMS = [
    "Milk (Regular, 1 Liter)", "Fresh White Bread (1 lb Loaf)",
    "White Rice (1 lb)", "Eggs (12, Large Size)", "Local Cheese (1 lb)",
    "Chicken Fillets (1 lb)", "Beef Round or Equivalent Back Leg Red Meat (1 lb)",
    "Apples (1 lb)", "Bananas (1 lb)", "Oranges (1 lb)",
    "Tomatoes (1 lb)", "Potatoes (1 lb)", "Onions (1 lb)", "Lettuce (1 Head)",
]

# Restaurant items for restaurantIndex computation
RESTAURANT_ITEMS = [
    "Meal at an Inexpensive Restaurant",
    "Meal for Two at a Mid-Range Restaurant (Three Courses, Without Drinks)",
    "Combo Meal at McDonald's (or Equivalent Fast-Food Meal)",
    "Cappuccino (Regular Size)",
    "Domestic Draft Beer (1 Pint)",
]


# ── Public API ───────────────────────────────────────────────────────

def scrape_city(city_name, nyc_data=None):
    """Scrape cost-of-living data for a single city from Numbeo.

    Args:
        city_name: City name (e.g. "New York", "Salt Lake City").
        nyc_data: NYC reference dict for index computation.
                  Must include monthlyCostsNoRent, rent1brCity, avgNetSalary,
                  and details dict with grocery/restaurant items.

    Returns:
        dict with normalized fields matching col_data schema, or
        dict with "error" key on failure.
    """
    slug = _city_to_slug(city_name)
    url = f"{NUMBEO_BASE}/{slug}"

    try:
        resp = _http_get(url)
        if resp.status_code == 404:
            return {"name": city_name, "error": f"City not found on Numbeo: {slug}"}
        if resp.status_code == 403:
            return {"name": city_name, "error": "Numbeo blocked the request (403)"}
        resp.raise_for_status()
    except requests.RequestException as e:
        return {"name": city_name, "error": str(e)[:200]}

    html = resp.text
    items = _parse_price_table(html)
    if not items:
        # Disambiguation page? Follow the first matching link.
        alt_slug = _find_disambiguation(html, slug)
        if alt_slug:
            try:
                resp2 = _http_get(f"{NUMBEO_BASE}/{alt_slug}")
                resp2.raise_for_status()
                html = resp2.text
                items = _parse_price_table(html)
            except requests.RequestException:
                pass
    if not items:
        return {"name": city_name, "error": "No price data found in page"}

    result = _normalize(city_name, items, html)

    # Compute indices if NYC reference is available
    if nyc_data:
        compute_indices(result, nyc_data)

    return result


def compute_indices(city, nyc):
    """Compute all indices from raw prices using NYC = 100 baseline.

    Same formula for every city — ensures consistent comparisons.
    Modifies city dict in place.
    """
    nyc_costs = nyc.get("monthlyCostsNoRent", 0)
    nyc_rent = nyc.get("rent1brCity", 0)
    nyc_salary = nyc.get("avgNetSalary", 0)

    city_costs = city.get("monthlyCostsNoRent", 0)
    city_rent = city.get("rent1brCity", 0)

    # COL index: monthly living costs ratio (excludes rent)
    city["colIndex"] = round((city_costs / nyc_costs) * 100, 1) if nyc_costs > 0 and city_costs > 0 else 0

    # Rent index: 1BR city centre rent ratio
    city["rentIndex"] = round((city_rent / nyc_rent) * 100, 1) if nyc_rent > 0 and city_rent > 0 else 0

    # Groceries index: basket of 14 common grocery items
    city_groc = _basket_total(city.get("details", {}), GROCERY_ITEMS)
    nyc_groc = _basket_total(nyc.get("details", {}), GROCERY_ITEMS)
    city["groceriesIndex"] = round((city_groc / nyc_groc) * 100, 1) if nyc_groc > 0 and city_groc > 0 else 0

    # Restaurant index: basket of 5 dining items
    city_rest = _basket_total(city.get("details", {}), RESTAURANT_ITEMS)
    nyc_rest = _basket_total(nyc.get("details", {}), RESTAURANT_ITEMS)
    city["restaurantIndex"] = round((city_rest / nyc_rest) * 100, 1) if nyc_rest > 0 and city_rest > 0 else 0

    # COL + Rent composite
    col = city.get("colIndex", 0)
    rent = city.get("rentIndex", 0)
    city["colPlusRentIndex"] = round((col + rent) / 2, 1) if col > 0 and rent > 0 else 0

    # Purchasing Power Index
    cpr = city.get("colPlusRentIndex", 0)
    salary = city.get("avgNetSalary", 0)
    if salary > 0 and cpr > 0 and nyc_salary > 0:
        city["purchasingPowerIndex"] = round(
            (salary / cpr) / (nyc_salary / 100) * 100, 1)
    else:
        city["purchasingPowerIndex"] = 0


# ── HTML parsing ─────────────────────────────────────────────────────

_PRICE_ROW_RE = re.compile(
    r'<tr><td[^>]*>(.*?)</td>\s*'
    r'<td[^>]*class="priceValue[^"]*"[^>]*>\s*'
    r'<span class="first_currency">(.*?)</span>',
    re.DOTALL,
)

_SINGLE_COST_RE = re.compile(
    r'single person.*?<span class="emp_number">([\d,]+\.?\d*)\s*(?:&#36;|\$)',
    re.DOTALL,
)

_FAMILY_COST_RE = re.compile(
    r'family of four.*?<span class="emp_number">([\d,]+\.?\d*)\s*(?:&#36;|\$)',
    re.DOTALL,
)

_COUNTRY_RE = re.compile(r'country_result\.jsp\?country=([^"&]+)')
_TITLE_RE = re.compile(r'<title>Cost of Living in ([^<]+)</title>')
_STATE_RE = re.compile(r'^[\w\s-]+,\s*([\w\s]+)\.')
_DISAMBIG_RE = re.compile(r'cost-of-living/in/([\w-]+)', re.IGNORECASE)


def _parse_price_table(html):
    """Extract all (item_name, value) pairs from the Numbeo price table."""
    items = {}
    for match in _PRICE_ROW_RE.finditer(html):
        raw_name = re.sub(r"<[^>]+>", "", match.group(1)).strip()
        raw_name = unescape(raw_name)
        raw_val = re.sub(r"<[^>]+>", "", match.group(2))
        raw_val = unescape(raw_val).replace("\xa0", " ").strip()
        val = _parse_value(raw_val)
        if raw_name and val is not None:
            items[raw_name] = val
    return items


def _parse_monthly_costs(html):
    """Extract estimated monthly costs from Numbeo summary section.

    Returns (single_person_costs, family_costs) or (0, 0) if not found.
    """
    single = 0.0
    family = 0.0
    m = _SINGLE_COST_RE.search(html)
    if m:
        single = _parse_value(m.group(1)) or 0.0
    m = _FAMILY_COST_RE.search(html)
    if m:
        family = _parse_value(m.group(1)) or 0.0
    return single, family


def _parse_value(val_str):
    """Parse price string like '4,368.38 $' or '6.73' to float."""
    s = val_str.replace(",", "").replace("$", "").replace("%", "").strip()
    try:
        return round(float(s), 2)
    except (ValueError, TypeError):
        return None


# ── Normalization ────────────────────────────────────────────────────

def _normalize(city_name, items, html):
    """Transform raw Numbeo items into our canonical col_data schema."""
    country, state = _parse_location(html)
    result = {
        "name": city_name,
        "country": country,
        "state": state,
        "source": "numbeo",
        "lastScraped": datetime.now().isoformat(),
        "lastUpdated": datetime.now().isoformat(),
    }

    # Map known fields
    for numbeo_name, canon_field in FIELD_MAP.items():
        result[canon_field] = items.get(numbeo_name, 0)

    # Extract monthly costs from Numbeo's summary
    single, family = _parse_monthly_costs(html)
    result["monthlyCostsNoRent"] = single
    result["familyCostsNoRent"] = family

    # Initialize indices to 0 (computed later with NYC reference)
    result["colIndex"] = 0
    result["rentIndex"] = 0
    result["colPlusRentIndex"] = 0
    result["groceriesIndex"] = 0
    result["restaurantIndex"] = 0
    result["purchasingPowerIndex"] = 0

    # Store ALL raw items in details dict
    result["details"] = items

    return result


# ── Helpers ──────────────────────────────────────────────────────────

def _parse_location(html):
    """Extract country and state/region from the Numbeo page.

    Country from the country_result link, state from the page title.
    US states are abbreviated to match existing ditno format (e.g. "CO").
    Returns (country, state) — e.g. ("United States", "CO").
    """
    country = ""
    m = _COUNTRY_RE.search(html)
    if m:
        country = m.group(1).replace("+", " ")

    state = ""
    m = _TITLE_RE.search(html)
    if m:
        m2 = _STATE_RE.match(m.group(1))
        if m2:
            state = m2.group(1).strip()

    # Abbreviate US states for consistency with ditno data
    if country == "United States" and state:
        state = _US_STATE_ABBREV.get(state.lower(), state)

    return country or "United States", state


def _find_disambiguation(html, original_slug):
    """Find a disambiguated city slug on a Numbeo disambiguation page.

    When Numbeo can't resolve a short slug like "East-Lansing", it shows
    a page with links to full slugs like "East-Lansing-MI-United-States".
    Returns the first matching slug, or None.
    """
    slug_lower = original_slug.lower()
    for m in _DISAMBIG_RE.finditer(html):
        candidate = m.group(1)
        if candidate.lower().startswith(slug_lower) and candidate.lower() != slug_lower:
            return candidate
    return None


def _basket_total(details, item_names):
    """Sum prices for a basket of items from the details dict."""
    total = 0
    for name in item_names:
        val = details.get(name, 0)
        if isinstance(val, (int, float)) and val > 0:
            total += val
    return total


def _http_get(url):
    """GET request with browser User-Agent."""
    return requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)


def _city_to_slug(city_name):
    """Convert city name to Numbeo URL slug.

    "New York" → "New-York", "Salt Lake City" → "Salt-Lake-City"
    """
    return city_name.strip().replace(" ", "-")
