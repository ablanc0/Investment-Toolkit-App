"""Planning Blueprint — cost of living, passive income, Rule 4%, and historic data routes."""

from datetime import datetime
from flask import Blueprint, jsonify, request

from services.data_store import load_portfolio, save_portfolio, crud_list, crud_add, crud_update, crud_delete
from models.simulation import load_historic_data, _run_simulation

bp = Blueprint('planning', __name__)


# ── Cost of Living ─────────────────────────────────────────────────────

def _default_col_config():
    return {
        "homeCityName": "East Lansing, MI",
        "referenceSalary": 140000,
        "referenceSalarySource": "manual",
        "currentRent": 1458,
        "housingWeight": 0.30,
        "comparisonSalary": 200000,
        "bedroomCount": 1,       # 1 or 3
        "locationType": "city",  # "city" or "suburb"
        # Home city COL parameters (for relative ratio formula)
        "homeColIndex": None,       # COL index for home city (None = legacy /100)
        "homeMonthlyCosts": None,   # non-housing monthly costs for home
        "homeColSource": "manual",  # "manual" | "proxy" | "stateAvg"
        "homeProxyCity": None,      # API city name if source is "proxy"
        "homeState": None,          # state name if source is "stateAvg"
        "homeCountry": "United States",
    }


def _resolve_home_col(config, api_cities):
    """Resolve homeColIndex and homeMonthlyCosts from the configured source."""
    source = config.get("homeColSource", "manual")

    if source == "manual":
        return config.get("homeColIndex"), config.get("homeMonthlyCosts")

    if source == "proxy":
        proxy_name = (config.get("homeProxyCity") or "").lower()
        if not proxy_name:
            return None, None
        for c in api_cities:
            if c["name"].lower() == proxy_name:
                return c.get("colIndex"), c.get("monthlyCostsNoRent")
        return None, None

    if source == "stateAvg":
        state = (config.get("homeState") or "").lower()
        if not state:
            return None, None
        state_cities = [c for c in api_cities if (c.get("state") or "").lower() == state.lower()]
        if not state_cities:
            return None, None
        avg_col = sum(c.get("colIndex", 0) for c in state_cities) / len(state_cities)
        avg_costs = sum(c.get("monthlyCostsNoRent", 0) for c in state_cities) / len(state_cities)
        return round(avg_col, 2), round(avg_costs, 2)

    return None, None


def _compute_col_entry(entry, config):
    """Recompute all derived fields from rent, API data, and config."""
    hw = config.get("housingWeight", 0.30)
    ref_salary = config.get("referenceSalary", 140000)
    comp_salary = config.get("comparisonSalary", 200000)
    current_rent = config.get("currentRent", 1458)
    home_costs = float(config.get("homeMonthlyCosts") or 0)

    # For API-sourced entries: derive rent from stored API data
    if entry.get("source") == "api":
        api_data = entry.get("apiData", {})
        # Select rent based on bedroomCount + locationType (unless user overrode)
        if not entry.get("rentOverride") and api_data:
            br = config.get("bedroomCount", 1)
            loc = config.get("locationType", "city")
            rent_key = f"rent{br}br{'City' if loc == 'city' else 'Suburb'}"
            entry["rent"] = api_data.get(rent_key, entry.get("rent", 0))
            entry["type"] = "Downtown" if loc == "city" else "Suburban"
        # Populate extra API metrics for display
        if api_data:
            entry["groceriesIndex"] = float(api_data.get("groceriesIndex", 0))
            entry["restaurantIndex"] = float(api_data.get("restaurantIndex", 0))
            entry["purchasingPower"] = float(api_data.get("purchasingPowerIndex", 0))
            entry["avgNetSalary"] = float(api_data.get("avgNetSalary", 0))
            entry["monthlyCostsNoRent"] = float(api_data.get("monthlyCostsNoRent", 0))
            entry["utilities"] = float(api_data.get("utilities", 0))

    city_rent = float(entry.get("rent", 0))
    city_costs = float(entry.get("monthlyCostsNoRent", 0))

    # Housing multiplier for display
    entry["housingMult"] = round(city_rent / current_rent, 2) if current_rent > 0 else 1.0

    # Non-housing multiplier for display
    if city_costs > 0 and home_costs > 0:
        entry["nonHousingMult"] = round(city_costs / home_costs, 2)
    elif not entry.get("nhmOverride") and entry.get("source") == "api":
        api_data = entry.get("apiData", {})
        col_index = float(api_data.get("colIndex", 100)) if api_data else 100
        home_col = float(config.get("homeColIndex") or 0)
        divisor = home_col if home_col > 0 else 100
        entry["nonHousingMult"] = round(col_index / divisor, 2) if col_index > 0 else 1.0

    nhm = float(entry.get("nonHousingMult", 1.0))

    # Choose formula
    if city_costs > 0 and home_costs > 0 and current_rent > 0 and city_rent > 0:
        # Direct cost ratio — uses actual dollar amounts
        factor = round((city_rent + city_costs) / (current_rent + home_costs), 2)
        entry["formulaUsed"] = "direct"
    else:
        # Fallback: weighted index formula
        hm = entry["housingMult"]
        factor = round(hm * hw + nhm * (1 - hw), 2)
        entry["formulaUsed"] = "weighted"

    entry["overallFactor"] = factor
    entry["equivalentSalary"] = round(ref_salary * factor)
    entry["elEquivalent"] = round(comp_salary / factor) if factor > 0 else 0
    # Total monthly cost (rent + non-housing costs)
    entry["totalMonthlyCost"] = round(city_rent + city_costs) if city_costs > 0 else 0


@bp.route("/api/cost-of-living")
def api_cost_of_living():
    portfolio = load_portfolio()
    config = portfolio.get("colConfig", _default_col_config())
    # Migrate: homeCityIndex → homeCityName
    if "homeCityName" not in config:
        config["homeCityName"] = _default_col_config()["homeCityName"]
        config.pop("homeCityIndex", None)
    # Migrate: add homeCountry if missing
    if "homeCountry" not in config:
        config["homeCountry"] = "United States"
    # Migrate: "salary" → active profile ID
    if config.get("referenceSalarySource") == "salary":
        from models.salary_calc import _get_salary_data
        sal = _get_salary_data(portfolio)
        config["referenceSalarySource"] = sal.get("activeProfile", "alejandro")
    # Resolve salary source
    salary_profiles = []
    source = config.get("referenceSalarySource", "manual")
    if source != "manual":
        from models.salary_calc import _get_salary_data, compute_salary_breakdown
        salary = _get_salary_data(portfolio)
        profiles = salary.get("profiles", {})
        salary_profiles = [{"id": pid, "name": p.get("name", pid)} for pid, p in profiles.items()]
        if source == "household":
            total = 0
            for pid, p in profiles.items():
                bd = compute_salary_breakdown(p)
                total += bd["summary"].get("takeHomePay", 0)
            config["referenceSalary"] = round(total, 2)
        elif source in profiles:
            bd = compute_salary_breakdown(profiles[source])
            config["referenceSalary"] = round(bd["summary"].get("takeHomePay", 0), 2)
    else:
        from models.salary_calc import _get_salary_data
        salary = _get_salary_data(portfolio)
        salary_profiles = [{"id": pid, "name": p.get("name", pid)} for pid, p in salary.get("profiles", {}).items()]
    return jsonify({
        "costOfLiving": portfolio.get("costOfLiving", []),
        "colConfig": config,
        "salaryProfiles": salary_profiles,
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/cost-of-living/add", methods=["POST"])
def api_cost_of_living_add():
    b = request.get_json()
    source = b.get("source", "manual")
    item = {
        "metro": b.get("metro", ""),
        "area": b.get("area", ""),
        "type": b.get("type", "Downtown"),
        "rent": float(b.get("rent", 0)),
        "nonHousingMult": float(b.get("nonHousingMult", 1.0)),
        "monthlyCostsNoRent": float(b.get("monthlyCostsNoRent", 0)),
        "housingMult": 0,
        "overallFactor": 0,
        "equivalentSalary": 0,
        "elEquivalent": 0,
    }
    if source == "api":
        item["source"] = "api"
        item["rentOverride"] = False
        item["nhmOverride"] = False
        item["apiData"] = b.get("apiData", {})
    # Prevent duplicate metro names
    portfolio = load_portfolio()
    existing = portfolio.get("costOfLiving", [])
    metro_lower = item["metro"].lower().strip()
    if any(c.get("metro", "").lower().strip() == metro_lower for c in existing):
        return jsonify({"ok": False, "error": f"{item['metro']} already exists"}), 400
    config = portfolio.get("colConfig", _default_col_config())
    _compute_col_entry(item, config)
    return crud_add("costOfLiving", item)


@bp.route("/api/cost-of-living/update", methods=["POST"])
def api_cost_of_living_update():
    b = request.get_json()
    index = int(b.get("index", -1))
    updates = b.get("updates", {})
    # Track manual overrides on API-sourced entries
    portfolio = load_portfolio()
    items = portfolio.get("costOfLiving", [])
    if 0 <= index < len(items) and items[index].get("source") == "api":
        if "rent" in updates:
            updates["rentOverride"] = True
        if "nonHousingMult" in updates:
            updates["nhmOverride"] = True
    return crud_update("costOfLiving", index, updates)


@bp.route("/api/cost-of-living/delete", methods=["POST"])
def api_cost_of_living_delete():
    b = request.get_json()
    return crud_delete("costOfLiving", int(b.get("index", -1)))


@bp.route("/api/cost-of-living/config/update", methods=["POST"])
def api_col_config_update():
    b = request.get_json()
    portfolio = load_portfolio()
    config = portfolio.get("colConfig", _default_col_config())
    for key in ("referenceSalary", "currentRent", "housingWeight", "comparisonSalary"):
        if key in b:
            config[key] = float(b[key])
    if "bedroomCount" in b:
        config["bedroomCount"] = int(b["bedroomCount"])
    if "locationType" in b:
        config["locationType"] = b["locationType"]
    if "homeCityName" in b:
        config["homeCityName"] = b["homeCityName"]
    # Home COL parameters
    if "homeColSource" in b:
        config["homeColSource"] = b["homeColSource"]
    if "homeProxyCity" in b:
        config["homeProxyCity"] = b["homeProxyCity"]
    if "homeState" in b:
        config["homeState"] = b["homeState"]
    if "homeColIndex" in b:
        val = b["homeColIndex"]
        config["homeColIndex"] = float(val) if val is not None else None
    if "homeMonthlyCosts" in b:
        val = b["homeMonthlyCosts"]
        config["homeMonthlyCosts"] = float(val) if val is not None else None
    if "homeCountry" in b:
        config["homeCountry"] = b["homeCountry"]
    # Auto-resolve from proxy/stateAvg
    if config.get("homeColSource") in ("proxy", "stateAvg"):
        from services.col_api import get_col_cities
        resolved_col, resolved_costs = _resolve_home_col(config, get_col_cities())
        if resolved_col is not None:
            config["homeColIndex"] = resolved_col
        if resolved_costs is not None:
            config["homeMonthlyCosts"] = resolved_costs
    if "referenceSalarySource" in b:
        source = b["referenceSalarySource"]
        config["referenceSalarySource"] = source
        if source != "manual":
            from models.salary_calc import _get_salary_data, compute_salary_breakdown
            salary = _get_salary_data(portfolio)
            profiles = salary.get("profiles", {})
            if source == "household":
                total = 0
                for pid, p in profiles.items():
                    bd = compute_salary_breakdown(p)
                    total += bd["summary"].get("takeHomePay", 0)
                config["referenceSalary"] = round(total, 2)
            elif source in profiles:
                bd = compute_salary_breakdown(profiles[source])
                config["referenceSalary"] = round(bd["summary"].get("takeHomePay", 0), 2)
    portfolio["colConfig"] = config
    # Recompute all cities
    cities = portfolio.get("costOfLiving", [])
    for city in cities:
        _compute_col_entry(city, config)
    portfolio["costOfLiving"] = cities
    save_portfolio(portfolio)
    return jsonify({"ok": True, "colConfig": config, "costOfLiving": cities})


@bp.route("/api/cost-of-living/recompute", methods=["POST"])
def api_col_recompute():
    portfolio = load_portfolio()
    config = portfolio.get("colConfig", _default_col_config())
    cities = portfolio.get("costOfLiving", [])
    for city in cities:
        _compute_col_entry(city, config)
    portfolio["costOfLiving"] = cities
    save_portfolio(portfolio)
    return jsonify({"ok": True, "costOfLiving": cities, "colConfig": config})


# ── Cost of Living API Data ────────────────────────────────────────────

@bp.route("/api/cost-of-living/check-cities", methods=["POST"])
def api_col_check_cities():
    """Phase 1: Check for new cities (1 API call). Returns discovery results."""
    from services.col_api import check_for_new_cities
    result = check_for_new_cities()
    if result.get("error"):
        return jsonify({"ok": False, "error": result["error"]}), 400
    return jsonify({
        "ok": True,
        "totalAll": result["totalAll"],
        "totalUS": result["totalUS"],
        "totalCountries": result.get("totalCountries", 0),
        "newCities": result["newCities"],
        "newCount": len(result["newCities"]),
    })


@bp.route("/api/cost-of-living/fetch-details", methods=["POST"])
def api_col_fetch_details():
    """Phase 2: Bulk-fetch city details (1 API call). Uses stored city names."""
    from services.col_api import fetch_city_details, get_col_metadata
    cities, error = fetch_city_details()
    if error:
        return jsonify({"ok": False, "error": error}), 400
    meta = get_col_metadata()
    return jsonify({
        "ok": True,
        "cityCount": meta["cityCount"],
        "fetchedAt": meta["fetchedAt"],
        "newCitiesAdded": meta.get("newCitiesAdded", 0),
    })


@bp.route("/api/cost-of-living/upgrade", methods=["POST"])
def api_col_upgrade():
    """Match existing manual cities against API data and upgrade them."""
    from services.col_api import get_col_cities

    api_cities = get_col_cities()
    if not api_cities:
        return jsonify({"ok": False, "error": "No API data available. Click 'Refresh API Data' first."}), 400

    # Build lookup: lowercase name → api city
    api_lookup = {c["name"].lower(): c for c in api_cities}
    # Add common aliases
    api_lookup["new york city"] = api_lookup.get("new york", {})
    api_lookup["washington, dc"] = api_lookup.get("washington", {})
    api_lookup["san francisco bay area"] = api_lookup.get("san francisco", {})

    portfolio = load_portfolio()
    config = portfolio.get("colConfig", _default_col_config())
    cities = portfolio.get("costOfLiving", [])

    upgraded = 0
    for city in cities:
        if city.get("source") == "api":
            continue  # Already API-sourced
        metro_lower = city["metro"].lower()
        api_match = api_lookup.get(metro_lower)
        if not api_match:
            # Try partial match
            for api_name, api_city in api_lookup.items():
                if api_city and (metro_lower in api_name or api_name in metro_lower):
                    api_match = api_city
                    break
        if api_match and api_match.get("name"):
            city["source"] = "api"
            city["rentOverride"] = False
            city["nhmOverride"] = False
            city["apiData"] = api_match
            city["area"] = api_match.get("state", city.get("area", ""))
            _compute_col_entry(city, config)
            upgraded += 1

    portfolio["costOfLiving"] = cities
    save_portfolio(portfolio)
    return jsonify({"ok": True, "upgraded": upgraded, "costOfLiving": cities})


@bp.route("/api/cost-of-living/dedup", methods=["POST"])
def api_col_dedup():
    """Remove duplicate cities, keeping the first occurrence of each metro name."""
    portfolio = load_portfolio()
    cities = portfolio.get("costOfLiving", [])
    seen = set()
    unique = []
    removed = 0
    for city in cities:
        key = city.get("metro", "").lower().strip()
        if key in seen:
            removed += 1
            continue
        seen.add(key)
        unique.append(city)
    portfolio["costOfLiving"] = unique
    save_portfolio(portfolio)
    return jsonify({"ok": True, "removed": removed, "remaining": len(unique), "costOfLiving": unique})


@bp.route("/api/cost-of-living/api-cities")
def api_col_api_cities():
    """Return stored API city data for the city picker."""
    from services.col_api import get_col_cities, get_col_metadata, get_global_city_list
    q = request.args.get("q", "").lower()
    cities = get_col_cities()
    if q:
        cities = [c for c in cities if q in c["name"].lower() or q in c.get("state", "").lower()]
    meta = get_col_metadata()
    result = {"cities": cities, "meta": meta}
    if request.args.get("include_global"):
        result["globalCities"] = get_global_city_list()
    return jsonify(result)


# ── Passive Income ─────────────────────────────────────────────────────

@bp.route("/api/passive-income")
def api_passive_income():
    return crud_list("passiveIncome")

@bp.route("/api/passive-income/add", methods=["POST"])
def api_passive_income_add():
    b = request.get_json()
    item = {
        "source": b.get("source", ""),
        "type": b.get("type", "Dividend"),
        "amount": float(b.get("amount", 0)),
        "frequency": b.get("frequency", "Monthly"),
        "startDate": b.get("startDate", ""),
        "active": b.get("active", True),
        "notes": b.get("notes", ""),
    }
    freq_mult = {"Monthly": 12, "Quarterly": 4, "Semi-Annual": 2, "Annual": 1, "Weekly": 52}
    item["annualized"] = round(item["amount"] * freq_mult.get(item["frequency"], 12), 2)
    return crud_add("passiveIncome", item)

@bp.route("/api/passive-income/update", methods=["POST"])
def api_passive_income_update():
    b = request.get_json()
    return crud_update("passiveIncome", int(b.get("index", -1)), b.get("updates", {}))

@bp.route("/api/passive-income/delete", methods=["POST"])
def api_passive_income_delete():
    b = request.get_json()
    return crud_delete("passiveIncome", int(b.get("index", -1)))


# ── Rule 4% ───────────────────────────────────────────────────────────

@bp.route("/api/rule4pct")
def api_rule4pct():
    portfolio = load_portfolio()
    return jsonify({
        "rule4Pct": portfolio.get("rule4Pct", {}),
        "lastUpdated": datetime.now().isoformat(),
    })

@bp.route("/api/rule4pct/update", methods=["POST"])
def api_rule4pct_update():
    b = request.get_json()
    portfolio = load_portfolio()
    r4 = portfolio.get("rule4Pct", {})
    for key in ["annualExpenses", "inflationPct", "withdrawalPct", "currentPortfolio", "monthlyContribution", "expectedReturnPct"]:
        if key in b:
            r4[key] = float(b[key])
    portfolio["rule4Pct"] = r4
    save_portfolio(portfolio)
    return jsonify({"ok": True, "rule4Pct": r4})

@bp.route("/api/rule4pct/simulate")
def api_rule4pct_simulate():
    """Run Rule 4% historical simulation across all possible starting years."""
    starting_balance = float(request.args.get("balance", 1000000))
    withdrawal_rate = float(request.args.get("rate", 4)) / 100
    strategy = request.args.get("strategy", "fixed")  # fixed, guardrails, dividend, combined
    cash_buffer = int(request.args.get("cashBuffer", 0))
    div_yield = float(request.args.get("divYield", 4)) / 100
    div_growth = float(request.args.get("divGrowth", 5.6)) / 100
    guardrail_floor = float(request.args.get("grFloor", 80)) / 100
    guardrail_ceiling = float(request.args.get("grCeiling", 120)) / 100

    historic = load_historic_data()
    if not historic:
        return jsonify({"error": "No historic data available"}), 404

    returns_by_year = {h["year"]: h["annualReturn"] for h in historic}
    cpi_by_year = {h["year"]: h["cpi"] for h in historic}
    all_years = sorted(returns_by_year.keys())
    max_year = all_years[-1]

    results = {}
    for horizon in [20, 30, 40]:
        results[str(horizon)] = _run_simulation(
            returns_by_year, cpi_by_year, all_years, max_year,
            starting_balance, withdrawal_rate, horizon,
            strategy=strategy,
            guardrail_floor=guardrail_floor,
            guardrail_ceiling=guardrail_ceiling,
            cash_buffer_years=cash_buffer,
            div_yield=div_yield,
            div_growth=div_growth,
        )

    return jsonify({
        "startingBalance": starting_balance,
        "withdrawalRate": withdrawal_rate * 100,
        "strategy": strategy,
        "results": results,
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/rule4pct/compare")
def api_rule4pct_compare():
    """Compare multiple strategies side by side for a specific horizon and starting year."""
    starting_balance = float(request.args.get("balance", 1000000))
    rate = float(request.args.get("rate", 4)) / 100
    horizon = int(request.args.get("horizon", 20))
    div_yield = float(request.args.get("divYield", 4)) / 100
    cash_buffer = int(request.args.get("cashBuffer", 0))

    historic = load_historic_data()
    if not historic:
        return jsonify({"error": "No historic data available"}), 404

    returns_by_year = {h["year"]: h["annualReturn"] for h in historic}
    cpi_by_year = {h["year"]: h["cpi"] for h in historic}
    all_years = sorted(returns_by_year.keys())
    max_year = all_years[-1]

    comparison = {}
    for strat in ["fixed", "guardrails", "dividend", "combined"]:
        comparison[strat] = _run_simulation(
            returns_by_year, cpi_by_year, all_years, max_year,
            starting_balance, rate, horizon,
            strategy=strat,
            cash_buffer_years=cash_buffer,
            div_yield=div_yield,
        )

    return jsonify({
        "startingBalance": starting_balance,
        "withdrawalRate": rate * 100,
        "horizon": horizon,
        "divYield": div_yield * 100,
        "comparison": comparison,
        "lastUpdated": datetime.now().isoformat(),
    })


# ── Historic S&P 500 Data ─────────────────────────────────────────────

@bp.route("/api/historic-data")
def api_historic_data():
    data = load_historic_data()
    return jsonify({
        "historicData": data,
        "lastUpdated": datetime.now().isoformat(),
    })
