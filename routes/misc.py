"""Misc Blueprint — intrinsic values, super investor buys, and status routes."""

from datetime import datetime
from flask import Blueprint, jsonify, request

from services.data_store import load_portfolio, save_portfolio, crud_list, crud_add, crud_update, crud_delete
from services.cache import _cache
from config import DATA_DIR, CACHE_FILE, PORTFOLIO_FILE

bp = Blueprint('misc', __name__)


# ── Intrinsic Values ───────────────────────────────────────────────────
@bp.route("/api/intrinsic-values")
def api_intrinsic_values():
    return crud_list("intrinsicValues")

@bp.route("/api/intrinsic-values/add", methods=["POST"])
def api_intrinsic_values_add():
    b = request.get_json()
    item = {
        "ticker": b.get("ticker", "").upper().strip(),
        "method": b.get("method", "DCF"),
        "intrinsicValue": float(b.get("intrinsicValue", 0)),
        "currentPrice": float(b.get("currentPrice", 0)),
        "marginOfSafety": float(b.get("marginOfSafety", 0)),
        "notes": b.get("notes", ""),
        "lastUpdated": b.get("lastUpdated", datetime.now().strftime("%Y-%m-%d")),
    }
    if item["intrinsicValue"] > 0 and item["currentPrice"] > 0:
        item["marginOfSafety"] = round((1 - item["currentPrice"] / item["intrinsicValue"]) * 100, 2)
    return crud_add("intrinsicValues", item)

@bp.route("/api/intrinsic-values/update", methods=["POST"])
def api_intrinsic_values_update():
    b = request.get_json()
    return crud_update("intrinsicValues", int(b.get("index", -1)), b.get("updates", {}))

@bp.route("/api/intrinsic-values/delete", methods=["POST"])
def api_intrinsic_values_delete():
    b = request.get_json()
    return crud_delete("intrinsicValues", int(b.get("index", -1)))


@bp.route("/api/intrinsic-values/upsert", methods=["POST"])
def api_intrinsic_values_upsert():
    """Insert or update an IV entry by ticker. Used by Stock Analyzer Summary tab."""
    b = request.get_json()
    ticker = b.get("ticker", "").upper().strip()
    if not ticker:
        return jsonify({"error": "ticker required"}), 400

    portfolio = load_portfolio()
    iv_list = portfolio.get("intrinsicValues", [])

    item = {
        "ticker": ticker,
        "companyName": b.get("companyName", ""),
        "currentPrice": float(b.get("currentPrice", 0)),
        "intrinsicValue": float(b.get("intrinsicValue", 0)),
        "targetPrice": float(b.get("targetPrice", 0)),
        "distanceFromIntrinsic": float(b.get("distanceFromIntrinsic", 0)),
        "invtScore": b.get("invtScore", ""),
        "week52Low": float(b.get("week52Low", 0)),
        "week52High": float(b.get("week52High", 0)),
        "securityType": b.get("securityType", "Stocks"),
        "sector": b.get("sector", ""),
        "category": b.get("category", ""),
        "peRatio": float(b.get("peRatio", 0)),
        "eps": float(b.get("eps", 0)),
        "annualDividend": float(b.get("annualDividend", 0)),
        "dividendYield": float(b.get("dividendYield", 0)),
        "signal": b.get("signal", ""),
        "updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    # Compute distanceFromIntrinsic if not provided
    if item["intrinsicValue"] > 0 and item["currentPrice"] > 0:
        item["distanceFromIntrinsic"] = round((item["currentPrice"] / item["intrinsicValue"]) - 1, 4)

    # Find existing entry by ticker
    found = -1
    for i, existing in enumerate(iv_list):
        if existing.get("ticker", "").upper() == ticker:
            found = i
            break

    if found >= 0:
        iv_list[found] = item
        action = "updated"
    else:
        iv_list.append(item)
        action = "added"

    portfolio["intrinsicValues"] = iv_list
    save_portfolio(portfolio)
    return jsonify({"ok": True, "action": action, "ticker": ticker})


# ── Super Investor Buys ────────────────────────────────────────────────
@bp.route("/api/super-investor-buys")
def api_super_investor_buys():
    return crud_list("superInvestorBuys")

@bp.route("/api/super-investor-buys/add", methods=["POST"])
def api_super_investor_buys_add():
    b = request.get_json()
    item = {
        "investor": b.get("investor", ""),
        "ticker": b.get("ticker", "").upper().strip(),
        "action": b.get("action", "Buy"),
        "shares": float(b.get("shares", 0)),
        "value": float(b.get("value", 0)),
        "date": b.get("date", ""),
        "quarter": b.get("quarter", ""),
        "source": b.get("source", "13F Filing"),
        "notes": b.get("notes", ""),
    }
    return crud_add("superInvestorBuys", item)

@bp.route("/api/super-investor-buys/update", methods=["POST"])
def api_super_investor_buys_update():
    b = request.get_json()
    return crud_update("superInvestorBuys", int(b.get("index", -1)), b.get("updates", {}))

@bp.route("/api/super-investor-buys/delete", methods=["POST"])
def api_super_investor_buys_delete():
    b = request.get_json()
    return crud_delete("superInvestorBuys", int(b.get("index", -1)))


# ── Status ─────────────────────────────────────────────────────────────
@bp.route("/api/status")
def api_status():
    """Health check."""
    return jsonify({
        "status": "ok",
        "dataSource": "yfinance",
        "dataDir": str(DATA_DIR),
        "cacheEntries": len(_cache),
        "portfolioFile": PORTFOLIO_FILE.exists(),
        "timestamp": datetime.now().isoformat(),
    })
