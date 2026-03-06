"""Projections Blueprint — growth projections and risk scenarios routes."""

from flask import Blueprint, jsonify, request

from models.projections_calc import _normalize_proj_config, _projections_response
from services.data_store import load_portfolio, save_portfolio

bp = Blueprint('projections', __name__)


@bp.route("/api/projections")
def api_projections():
    portfolio = load_portfolio()
    proj = _normalize_proj_config(portfolio.get("projections", {}))
    return jsonify(_projections_response(proj))

@bp.route("/api/projections/update", methods=["POST"])
def api_projections_update():
    b = request.get_json()
    portfolio = load_portfolio()
    proj = _normalize_proj_config(portfolio.get("projections", {}))
    for key in ["startingValue", "monthlyContribution", "expectedReturnPct", "years", "inflationPct", "dividendYieldPct"]:
        if key in b:
            proj[key] = float(b[key])
    portfolio["projections"] = proj
    save_portfolio(portfolio)
    return jsonify(_projections_response(proj))

@bp.route("/api/risk-scenarios/update", methods=["POST"])
def api_risk_scenarios_update():
    b = request.get_json()
    portfolio = load_portfolio()
    portfolio["riskScenarios"] = b.get("scenarios", [])
    save_portfolio(portfolio)
    return jsonify({"ok": True})
