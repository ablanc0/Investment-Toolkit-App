"""Salary Blueprint — salary profiles, tax breakdown, and history routes."""

from datetime import datetime
from flask import Blueprint, jsonify, request

from models.salary_calc import _get_salary_data, compute_salary_breakdown, compute_retirement_plan, _default_taxes
from services.data_store import load_portfolio, save_portfolio

bp = Blueprint('salary', __name__)


@bp.route("/api/salary")
def api_salary():
    portfolio = load_portfolio()
    salary = _get_salary_data(portfolio)
    profile_id = request.args.get("profile", salary.get("activeProfile", "alejandro"))
    profile = salary.get("profiles", {}).get(profile_id, {})
    breakdown = compute_salary_breakdown(profile)
    # Household summary
    household = {"annualGross": 0, "takeHomePay": 0, "profileCount": 0}
    for pid, p in salary.get("profiles", {}).items():
        bd = compute_salary_breakdown(p)
        household["annualGross"] += bd["summary"]["annualGross"]
        household["takeHomePay"] += bd["summary"]["takeHomePay"]
        household["profileCount"] += 1
    household["annualGross"] = round(household["annualGross"], 2)
    household["takeHomePay"] = round(household["takeHomePay"], 2)
    # Retirement plan — compute portfolio totals from raw positions
    retirement_config = salary.get("retirement", {})
    positions = portfolio.get("positions", [])
    cash = float(portfolio.get("cash", 0))
    total_mv = sum(float(p.get("shares", 0)) * float(p.get("currentPrice", p.get("avgCost", 0))) for p in positions)
    total_cb = sum(float(p.get("shares", 0)) * float(p.get("avgCost", 0)) for p in positions)
    total_portfolio = round(total_mv + cash, 2)
    total_return_pct = round(((total_mv - total_cb) / total_cb) * 100, 2) if total_cb > 0 else 0
    portfolio_summary = {"totalPortfolio": total_portfolio, "totalReturnPct": total_return_pct}
    retirement = compute_retirement_plan(breakdown["summary"], retirement_config, portfolio_summary)

    return jsonify({
        "salary": salary,
        "profile": profile,
        "profileId": profile_id,
        "breakdown": breakdown,
        "household": household,
        "retirement": retirement,
        "retirementConfig": retirement_config,
        "costOfLiving": portfolio.get("costOfLiving", []),
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/salary/update", methods=["POST"])
def api_salary_update():
    b = request.get_json()
    portfolio = load_portfolio()
    salary = _get_salary_data(portfolio)
    profile_id = b.get("profileId", salary.get("activeProfile", "alejandro"))
    profile = salary.get("profiles", {}).get(profile_id, {})

    # Update income streams
    if "incomeStreams" in b:
        profile["incomeStreams"] = b["incomeStreams"]
    # Update tax config
    if "taxes" in b:
        profile["taxes"] = b["taxes"]
    # Update simple fields
    for key in ("year", "projectedSalary", "hsaExtraIncome", "name"):
        if key in b:
            profile[key] = int(b[key]) if key == "year" else b[key]
    # Update shared fields
    for key in ("savedMoney", "pctSavingsToInvest", "pctIncomeCanSave"):
        if key in b:
            salary[key] = float(b[key])
    # Update retirement config
    if "retirement" in b:
        salary["retirement"] = b["retirement"]

    salary["profiles"][profile_id] = profile
    portfolio["salary"] = salary
    save_portfolio(portfolio)
    breakdown = compute_salary_breakdown(profile)
    return jsonify({"ok": True, "profile": profile, "breakdown": breakdown})


@bp.route("/api/salary/profile", methods=["POST"])
def api_salary_profile_create():
    b = request.get_json()
    portfolio = load_portfolio()
    salary = _get_salary_data(portfolio)
    name = b.get("name", "New Profile")
    pid = name.lower().replace(" ", "_")
    # Avoid collisions
    base_pid = pid
    n = 1
    while pid in salary.get("profiles", {}):
        pid = f"{base_pid}_{n}"
        n += 1
    salary.setdefault("profiles", {})[pid] = {
        "name": name,
        "year": datetime.now().year,
        "incomeStreams": [{"type": "W2", "amount": 0, "label": "Main Job"}],
        "taxes": _default_taxes(),
        "projectedSalary": 0,
        "history": [],
    }
    salary["activeProfile"] = pid
    portfolio["salary"] = salary
    save_portfolio(portfolio)
    return jsonify({"ok": True, "profileId": pid, "salary": salary})


@bp.route("/api/salary/profile/<pid>", methods=["DELETE"])
def api_salary_profile_delete(pid):
    portfolio = load_portfolio()
    salary = _get_salary_data(portfolio)
    profiles = salary.get("profiles", {})
    if pid in profiles and len(profiles) > 1:
        del profiles[pid]
        if salary.get("activeProfile") == pid:
            salary["activeProfile"] = next(iter(profiles))
        portfolio["salary"] = salary
        save_portfolio(portfolio)
        return jsonify({"ok": True, "salary": salary})
    return jsonify({"ok": False, "error": "Cannot delete last profile"}), 400


@bp.route("/api/salary/history/save", methods=["POST"])
def api_salary_history_save():
    b = request.get_json()
    portfolio = load_portfolio()
    salary = _get_salary_data(portfolio)
    profile_id = b.get("profileId", salary.get("activeProfile", "alejandro"))
    profile = salary.get("profiles", {}).get(profile_id, {})
    bd = compute_salary_breakdown(profile)
    summ = bd["summary"]
    year = profile.get("year", datetime.now().year)
    history = profile.get("history", [])
    # Replace if year exists, else append
    history = [h for h in history if h.get("year") != year]
    history.append({
        "year": year,
        "annualPayroll": summ["annualGross"],
        "monthlyPayroll": round(summ["annualGross"] / 12, 2),
        "takeHomePay": summ["takeHomePay"],
        "effectiveTaxRate": summ["effectiveTaxRate"],
    })
    history.sort(key=lambda h: h["year"])
    profile["history"] = history
    salary["profiles"][profile_id] = profile
    portfolio["salary"] = salary
    save_portfolio(portfolio)
    return jsonify({"ok": True, "history": history})


@bp.route("/api/salary/history/<int:year>", methods=["DELETE"])
def api_salary_history_delete(year):
    b = request.get_json() or {}
    portfolio = load_portfolio()
    salary = _get_salary_data(portfolio)
    profile_id = b.get("profileId", salary.get("activeProfile", "alejandro"))
    profile = salary.get("profiles", {}).get(profile_id, {})
    history = profile.get("history", [])
    profile["history"] = [h for h in history if h.get("year") != year]
    salary["profiles"][profile_id] = profile
    portfolio["salary"] = salary
    save_portfolio(portfolio)
    return jsonify({"ok": True, "history": profile["history"]})
