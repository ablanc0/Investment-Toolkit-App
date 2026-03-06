"""Lab Blueprint — My Lab multi-portfolio research routes."""

from datetime import datetime
from flask import Blueprint, jsonify, request

from services.data_store import load_portfolio, save_portfolio

bp = Blueprint('lab', __name__)


# ── My Lab (Multi-Portfolio) ──────────────────────────────────────────────────
@bp.route("/api/my-lab")
def api_my_lab():
    portfolio = load_portfolio()
    lab = portfolio.get("myLab", [])
    research = portfolio.get("labResearch", [])
    return jsonify({"myLab": lab, "labResearch": research, "lastUpdated": datetime.now().isoformat()})

@bp.route("/api/my-lab/research", methods=["POST"])
def api_my_lab_research():
    """Compile ticker frequency across all portfolios."""
    portfolio = load_portfolio()
    lab = portfolio.get("myLab", [])
    freq = {}
    for p in lab:
        seen = set()
        for h in p.get("holdings", []):
            t = h.get("ticker", "").upper().strip()
            if t and t not in seen:
                seen.add(t)
                if t not in freq:
                    freq[t] = {"ticker": t, "companyName": h.get("companyName", t), "count": 0, "portfolios": []}
                freq[t]["count"] += 1
                freq[t]["portfolios"].append(p.get("name", ""))
    result = sorted(freq.values(), key=lambda x: x["count"], reverse=True)
    # Save updated research data
    portfolio["labResearch"] = [{"ticker": r["ticker"], "frequency": r["count"]} for r in result]
    save_portfolio(portfolio)
    return jsonify({"research": result, "totalPortfolios": len(lab)})

@bp.route("/api/my-lab/add-portfolio", methods=["POST"])
def api_my_lab_add_portfolio():
    b = request.get_json()
    name = b.get("name", "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    portfolio = load_portfolio()
    lab = portfolio.get("myLab", [])
    lab.append({"name": name, "holdings": [], "totalHoldings": 0, "totalMarketValue": 0, "totalAnnualDividend": 0})
    portfolio["myLab"] = lab
    save_portfolio(portfolio)
    return jsonify({"ok": True, "index": len(lab) - 1})

@bp.route("/api/my-lab/add-holding", methods=["POST"])
def api_my_lab_add_holding():
    b = request.get_json()
    pi = int(b.get("portfolioIndex", -1))
    portfolio = load_portfolio()
    lab = portfolio.get("myLab", [])
    if pi < 0 or pi >= len(lab):
        return jsonify({"error": "Invalid portfolio index"}), 400
    holding = {
        "ticker": b.get("ticker", "").upper().strip(),
        "companyName": b.get("companyName", ""),
        "shares": float(b.get("shares", 0)),
        "sharePrice": float(b.get("sharePrice", 0)),
        "securityType": b.get("securityType", ""),
        "sector": b.get("sector", ""),
        "category": b.get("category", ""),
        "portfolioAllocation": 0, "annualDividend": 0, "dividendYield": 0,
        "marketValue": float(b.get("shares", 0)) * float(b.get("sharePrice", 0)),
        "annualDividendIncome": 0, "pctOfTotalIncome": 0,
    }
    lab[pi]["holdings"].append(holding)
    lab[pi]["totalHoldings"] = len(lab[pi]["holdings"])
    lab[pi]["totalMarketValue"] = round(sum(h.get("marketValue", 0) for h in lab[pi]["holdings"]), 2)
    lab[pi]["totalAnnualDividend"] = round(sum(h.get("annualDividendIncome", 0) for h in lab[pi]["holdings"]), 2)
    portfolio["myLab"] = lab
    save_portfolio(portfolio)
    return jsonify({"ok": True})

@bp.route("/api/my-lab/delete-holding", methods=["POST"])
def api_my_lab_delete_holding():
    b = request.get_json()
    pi = int(b.get("portfolioIndex", -1))
    hi = int(b.get("holdingIndex", -1))
    portfolio = load_portfolio()
    lab = portfolio.get("myLab", [])
    if pi < 0 or pi >= len(lab):
        return jsonify({"error": "Invalid portfolio"}), 400
    holdings = lab[pi].get("holdings", [])
    if hi < 0 or hi >= len(holdings):
        return jsonify({"error": "Invalid holding"}), 400
    holdings.pop(hi)
    lab[pi]["totalHoldings"] = len(holdings)
    lab[pi]["totalMarketValue"] = round(sum(h.get("marketValue", 0) for h in holdings), 2)
    lab[pi]["totalAnnualDividend"] = round(sum(h.get("annualDividendIncome", 0) for h in holdings), 2)
    save_portfolio(portfolio)
    return jsonify({"ok": True})

@bp.route("/api/my-lab/update-portfolio", methods=["POST"])
def api_my_lab_update_portfolio():
    b = request.get_json()
    pi = int(b.get("portfolioIndex", -1))
    portfolio = load_portfolio()
    lab = portfolio.get("myLab", [])
    if pi < 0 or pi >= len(lab):
        return jsonify({"error": "Invalid portfolio index"}), 400
    for field in ("name", "lastUpdate", "source"):
        if field in b:
            lab[pi][field] = b[field]
    portfolio["myLab"] = lab
    save_portfolio(portfolio)
    return jsonify({"ok": True})
