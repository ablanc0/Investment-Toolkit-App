"""Planning Blueprint — cost of living, passive income, Rule 4%, and historic data routes."""

from datetime import datetime
from flask import Blueprint, jsonify, request

from services.data_store import load_portfolio, save_portfolio, crud_list, crud_add, crud_update, crud_delete
from models.simulation import load_historic_data, _run_simulation

bp = Blueprint('planning', __name__)


# ── Cost of Living ─────────────────────────────────────────────────────

def _default_col_config():
    return {
        "homeCityIndex": 0,
        "referenceSalary": 140000,
        "referenceSalarySource": "manual",
        "currentRent": 1458,
        "housingWeight": 0.30,
        "comparisonSalary": 200000,
    }


def _compute_col_entry(entry, config):
    """Recompute overallFactor, equivalentSalary, elEquivalent from multipliers + config."""
    hw = config.get("housingWeight", 0.30)
    ref_salary = config.get("referenceSalary", 140000)
    comp_salary = config.get("comparisonSalary", 200000)
    hm = float(entry.get("housingMult", 1.0))
    nhm = float(entry.get("nonHousingMult", 1.0))
    factor = round(hm * hw + nhm * (1 - hw), 2)
    entry["overallFactor"] = factor
    entry["equivalentSalary"] = round(ref_salary * factor)
    entry["elEquivalent"] = round(comp_salary / factor) if factor > 0 else 0


@bp.route("/api/cost-of-living")
def api_cost_of_living():
    portfolio = load_portfolio()
    config = portfolio.get("colConfig", _default_col_config())
    # Auto-link salary if source is "salary"
    if config.get("referenceSalarySource") == "salary":
        from models.salary_calc import _get_salary_data, compute_salary_breakdown
        salary = _get_salary_data(portfolio)
        pid = salary.get("activeProfile", "alejandro")
        profile = salary.get("profiles", {}).get(pid, {})
        bd = compute_salary_breakdown(profile)
        config["referenceSalary"] = round(bd["summary"].get("takeHomePay", 0), 2)
    return jsonify({
        "costOfLiving": portfolio.get("costOfLiving", []),
        "colConfig": config,
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/cost-of-living/add", methods=["POST"])
def api_cost_of_living_add():
    b = request.get_json()
    item = {
        "metro": b.get("metro", ""),
        "area": b.get("area", ""),
        "type": b.get("type", "Downtown"),
        "rent": float(b.get("rent", 0)),
        "housingMult": float(b.get("housingMult", 1.0)),
        "nonHousingMult": float(b.get("nonHousingMult", 1.0)),
        "overallFactor": 0,
        "equivalentSalary": 0,
        "elEquivalent": 0,
    }
    portfolio = load_portfolio()
    config = portfolio.get("colConfig", _default_col_config())
    _compute_col_entry(item, config)
    return crud_add("costOfLiving", item)


@bp.route("/api/cost-of-living/update", methods=["POST"])
def api_cost_of_living_update():
    b = request.get_json()
    return crud_update("costOfLiving", int(b.get("index", -1)), b.get("updates", {}))


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
    if "homeCityIndex" in b:
        config["homeCityIndex"] = int(b["homeCityIndex"])
    if "referenceSalarySource" in b:
        config["referenceSalarySource"] = b["referenceSalarySource"]
        if b["referenceSalarySource"] == "salary":
            from models.salary_calc import _get_salary_data, compute_salary_breakdown
            salary = _get_salary_data(portfolio)
            pid = salary.get("activeProfile", "alejandro")
            profile = salary.get("profiles", {}).get(pid, {})
            bd = compute_salary_breakdown(profile)
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
