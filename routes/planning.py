"""Planning Blueprint — cost of living, passive income, Rule 4%, and historic data routes."""

from datetime import datetime
from flask import Blueprint, jsonify, request

from services.data_store import load_portfolio, save_portfolio, crud_list, crud_add, crud_update, crud_delete
from models.simulation import load_historic_data, _run_simulation

bp = Blueprint('planning', __name__)


# ── Cost of Living ─────────────────────────────────────────────────────

@bp.route("/api/cost-of-living")
def api_cost_of_living():
    return crud_list("costOfLiving")

@bp.route("/api/cost-of-living/add", methods=["POST"])
def api_cost_of_living_add():
    b = request.get_json()
    item = {
        "city": b.get("city", ""),
        "state": b.get("state", ""),
        "rent": float(b.get("rent", 0)),
        "food": float(b.get("food", 0)),
        "transport": float(b.get("transport", 0)),
        "utilities": float(b.get("utilities", 0)),
        "insurance": float(b.get("insurance", 0)),
        "other": float(b.get("other", 0)),
        "notes": b.get("notes", ""),
    }
    item["total"] = round(sum(item[k] for k in ["rent", "food", "transport", "utilities", "insurance", "other"]), 2)
    return crud_add("costOfLiving", item)

@bp.route("/api/cost-of-living/update", methods=["POST"])
def api_cost_of_living_update():
    b = request.get_json()
    return crud_update("costOfLiving", int(b.get("index", -1)), b.get("updates", {}))

@bp.route("/api/cost-of-living/delete", methods=["POST"])
def api_cost_of_living_delete():
    b = request.get_json()
    return crud_delete("costOfLiving", int(b.get("index", -1)))


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
