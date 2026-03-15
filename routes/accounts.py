"""Accounts Blueprint — multi-account portfolio CRUD and net-worth aggregation."""

import re
from datetime import datetime

from flask import Blueprint, jsonify, request

from services.data_store import (
    load_portfolio, save_portfolio,
    get_accounts, get_account, save_account, delete_account,
)
from services.yfinance_svc import fetch_all_quotes
from services.geo_svc import resolve_geo

bp = Blueprint('accounts', __name__)

VALID_TAX_TREATMENTS = {"taxable", "tax-deferred", "tax-free"}


def _slugify(name):
    """Generate a URL-safe id from account name."""
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return slug or 'account'


def _unique_id(name, existing_ids):
    """Generate a unique slug, appending -2, -3... if needed."""
    base = _slugify(name)
    slug = base
    counter = 2
    while slug in existing_ids:
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _enrich_positions(positions, quotes):
    """Enrich a list of raw positions with live quote data.

    Returns (enriched_list, totals_dict) where totals has
    marketValue, costBasis, dayChange.
    """
    enriched = []
    total_mv = 0
    total_cb = 0
    total_day = 0

    for p in positions:
        ticker = p["ticker"]
        q = quotes.get(ticker, {})
        price = q.get("price", 0)
        prev_close = q.get("previousClose", price)
        name = q.get("name", ticker)
        geo = resolve_geo(ticker, p.get("secType", "Stocks"))

        shares = float(p.get("shares", 0))
        avg_cost = float(p.get("avgCost", 0))
        cost_basis = shares * avg_cost
        market_value = shares * price
        market_return = market_value - cost_basis
        market_return_pct = (market_return / cost_basis * 100) if cost_basis > 0 else 0
        day_change_share = price - prev_close
        day_change_val = shares * day_change_share
        day_change_pct = q.get("changePercent", 0)

        div_rate = q.get("divRate", 0) or 0
        div_yield = q.get("divYield", 0) or 0
        if div_rate == 0 and div_yield > 0 and price > 0:
            div_rate = round(price * div_yield / 100, 4)
        annual_div_income = div_rate * shares

        total_mv += market_value
        total_cb += cost_basis
        total_day += day_change_val

        enriched.append({
            "ticker": ticker,
            "company": name,
            "shares": shares,
            "avgCost": avg_cost,
            "price": round(price, 2),
            "prevClose": round(prev_close, 2),
            "costBasis": round(cost_basis, 2),
            "marketValue": round(market_value, 2),
            "marketReturn": round(market_return, 2),
            "marketReturnPct": round(market_return_pct, 2),
            "dayChangeShare": round(day_change_share, 2),
            "dayChange": round(day_change_val, 2),
            "dayChangePct": round(day_change_pct, 2),
            "divYield": div_yield,
            "divRate": div_rate,
            "annualDivIncome": round(annual_div_income, 2),
            "category": p.get("category", ""),
            "sector": p.get("sector", ""),
            "secType": p.get("secType", "Stocks"),
            "country": geo.get("country", "Unknown"),
            "currency": geo.get("currency", "USD"),
            "pe": q.get("pe", 0),
            "beta": q.get("beta", 0),
            "marketCap": q.get("marketCap", 0),
            "fiftyTwoWeekHigh": q.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow": q.get("fiftyTwoWeekLow", 0),
        })

    # Calculate allocation weights
    total_portfolio = total_mv
    for pos in enriched:
        pos["allocation"] = round(
            (pos["marketValue"] / total_portfolio * 100) if total_portfolio > 0 else 0, 2
        )
        pos["weight"] = pos["allocation"]

    totals = {
        "marketValue": round(total_mv, 2),
        "costBasis": round(total_cb, 2),
        "dayChange": round(total_day, 2),
    }
    return enriched, totals


# ── Account CRUD ──────────────────────────────────────────────────────

@bp.route("/api/accounts")
def api_accounts_list():
    """List all accounts with basic totals (no live prices)."""
    accounts = get_accounts()
    result = []
    for acct in accounts:
        positions = acct.get("positions", [])
        cost_basis = sum(float(p.get("shares", 0)) * float(p.get("avgCost", 0)) for p in positions)
        result.append({
            "id": acct["id"],
            "name": acct["name"],
            "taxTreatment": acct.get("taxTreatment", "taxable"),
            "custodian": acct.get("custodian", ""),
            "positionCount": len(positions),
            "cash": acct.get("cash", 0),
            "costBasis": round(cost_basis, 2),
            "created": acct.get("created", ""),
        })
    return jsonify({"accounts": result, "lastUpdated": datetime.now().isoformat()})


@bp.route("/api/accounts", methods=["POST"])
def api_accounts_create():
    """Create a new account."""
    body = request.get_json()
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Account name required"}), 400

    tax_treatment = body.get("taxTreatment", "taxable")
    if tax_treatment not in VALID_TAX_TREATMENTS:
        return jsonify({"error": f"Invalid taxTreatment: {tax_treatment}"}), 400

    existing_ids = {a["id"] for a in get_accounts()}
    account_id = _unique_id(name, existing_ids)

    account = {
        "id": account_id,
        "name": name,
        "taxTreatment": tax_treatment,
        "custodian": (body.get("custodian") or "").strip(),
        "positions": [],
        "cash": float(body.get("cash", 0)),
        "created": datetime.now().strftime("%Y-%m-%d"),
    }
    save_account(account)
    return jsonify({"ok": True, "account": account}), 201


# ── Net Worth Aggregation ─────────────────────────────────────────────
# NOTE: Must be registered BEFORE /api/accounts/<account_id> routes
# to avoid Flask matching "net-worth" as an account_id.

@bp.route("/api/accounts/net-worth")
def api_net_worth():
    """Aggregate net worth across main portfolio + all accounts."""
    portfolio = load_portfolio()

    # Main portfolio
    main_positions = portfolio.get("positions", [])
    main_tickers = [p["ticker"] for p in main_positions]

    # All account positions
    accounts = portfolio.get("accounts", [])
    acct_tickers = []
    for acct in accounts:
        acct_tickers.extend(p["ticker"] for p in acct.get("positions", []))

    # Fetch all quotes in one batch
    all_tickers = list(set(main_tickers + acct_tickers))
    quotes = fetch_all_quotes(all_tickers) if all_tickers else {}

    # Main portfolio summary
    main_mv = 0
    main_cb = 0
    for p in main_positions:
        q = quotes.get(p["ticker"], {})
        price = q.get("price", 0)
        shares = float(p.get("shares", 0))
        avg_cost = float(p.get("avgCost", 0))
        main_mv += shares * price
        main_cb += shares * avg_cost

    main_cash = portfolio.get("cash", 0)
    main_gain = main_mv - main_cb
    main_gain_pct = (main_gain / main_cb * 100) if main_cb > 0 else 0

    # Category allocation for main
    main_cat = {}
    for p in main_positions:
        q = quotes.get(p["ticker"], {})
        mv = float(p.get("shares", 0)) * q.get("price", 0)
        cat = p.get("category", "Other")
        main_cat[cat] = main_cat.get(cat, 0) + mv

    result_accounts = [{
        "id": "_main",
        "name": "Taxable Brokerage",
        "taxTreatment": "taxable",
        "custodian": "",
        "marketValue": round(main_mv, 2),
        "costBasis": round(main_cb, 2),
        "cash": main_cash,
        "gain": round(main_gain, 2),
        "gainPct": round(main_gain_pct, 2),
        "positionCount": len(main_positions),
    }]

    total_nw = main_mv + main_cash
    by_tax = {"taxable": round(main_mv + main_cash, 2), "tax-deferred": 0, "tax-free": 0}
    aggregate_cat = dict(main_cat)

    # Each additional account
    for acct in accounts:
        positions = acct.get("positions", [])
        acct_mv = 0
        acct_cb = 0
        for p in positions:
            q = quotes.get(p["ticker"], {})
            price = q.get("price", 0)
            shares = float(p.get("shares", 0))
            avg_cost = float(p.get("avgCost", 0))
            acct_mv += shares * price
            acct_cb += shares * avg_cost

            cat = p.get("category", "Other")
            aggregate_cat[cat] = aggregate_cat.get(cat, 0) + (shares * price)

        acct_cash = acct.get("cash", 0)
        acct_gain = acct_mv - acct_cb
        acct_gain_pct = (acct_gain / acct_cb * 100) if acct_cb > 0 else 0
        acct_total = acct_mv + acct_cash

        total_nw += acct_total
        tax_key = acct.get("taxTreatment", "taxable")
        by_tax[tax_key] = round(by_tax.get(tax_key, 0) + acct_total, 2)

        result_accounts.append({
            "id": acct["id"],
            "name": acct["name"],
            "taxTreatment": acct.get("taxTreatment", "taxable"),
            "custodian": acct.get("custodian", ""),
            "marketValue": round(acct_mv, 2),
            "costBasis": round(acct_cb, 2),
            "cash": acct_cash,
            "gain": round(acct_gain, 2),
            "gainPct": round(acct_gain_pct, 2),
            "positionCount": len(positions),
        })

    # Aggregate allocation as percentages
    total_mv_all = sum(aggregate_cat.values())
    aggregate_alloc = {}
    for cat, mv in aggregate_cat.items():
        aggregate_alloc[cat] = round((mv / total_mv_all * 100) if total_mv_all > 0 else 0, 2)

    return jsonify({
        "totalNetWorth": round(total_nw, 2),
        "accounts": result_accounts,
        "byTaxTreatment": by_tax,
        "aggregateAllocation": aggregate_alloc,
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/accounts/<account_id>", methods=["PUT"])
def api_accounts_update(account_id):
    """Update account metadata (name, taxTreatment, custodian)."""
    acct = get_account(account_id)
    if not acct:
        return jsonify({"error": "Account not found"}), 404

    body = request.get_json()
    if "name" in body:
        acct["name"] = body["name"].strip()
    if "taxTreatment" in body:
        if body["taxTreatment"] not in VALID_TAX_TREATMENTS:
            return jsonify({"error": f"Invalid taxTreatment"}), 400
        acct["taxTreatment"] = body["taxTreatment"]
    if "custodian" in body:
        acct["custodian"] = body["custodian"].strip()

    save_account(acct)
    return jsonify({"ok": True, "account": acct})


@bp.route("/api/accounts/<account_id>", methods=["DELETE"])
def api_accounts_delete(account_id):
    """Delete an account."""
    if delete_account(account_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Account not found"}), 404


# ── Account Positions ─────────────────────────────────────────────────

@bp.route("/api/accounts/<account_id>/positions")
def api_account_positions(account_id):
    """Return enriched positions for a single account with live prices."""
    acct = get_account(account_id)
    if not acct:
        return jsonify({"error": "Account not found"}), 404

    positions = acct.get("positions", [])
    tickers = [p["ticker"] for p in positions]
    quotes = fetch_all_quotes(tickers) if tickers else {}

    enriched, totals = _enrich_positions(positions, quotes)

    cash = acct.get("cash", 0)
    total_portfolio = totals["marketValue"] + cash
    total_return = totals["marketValue"] - totals["costBasis"]
    total_return_pct = (total_return / totals["costBasis"] * 100) if totals["costBasis"] > 0 else 0

    # Category allocation
    cat_alloc = {}
    for pos in enriched:
        cat = pos["category"]
        cat_alloc[cat] = round(cat_alloc.get(cat, 0) + pos.get("allocation", 0), 2)

    return jsonify({
        "account": {
            "id": acct["id"],
            "name": acct["name"],
            "taxTreatment": acct.get("taxTreatment", "taxable"),
            "custodian": acct.get("custodian", ""),
        },
        "positions": enriched,
        "summary": {
            "marketValue": totals["marketValue"],
            "costBasis": totals["costBasis"],
            "totalReturn": round(total_return, 2),
            "totalReturnPct": round(total_return_pct, 2),
            "dayChange": totals["dayChange"],
            "cash": cash,
            "totalPortfolio": round(total_portfolio, 2),
            "holdings": len(enriched),
        },
        "allocations": {"category": cat_alloc},
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/accounts/<account_id>/positions", methods=["POST"])
def api_account_position_add(account_id):
    """Add a position to an account."""
    acct = get_account(account_id)
    if not acct:
        return jsonify({"error": "Account not found"}), 404

    body = request.get_json()
    ticker = (body.get("ticker") or "").upper().strip()
    if not ticker:
        return jsonify({"error": "Ticker required"}), 400

    # Check for duplicates
    for p in acct.get("positions", []):
        if p["ticker"] == ticker:
            return jsonify({"error": f"'{ticker}' already exists in this account"}), 400

    new_pos = {
        "ticker": ticker,
        "shares": float(body.get("shares", 0)),
        "avgCost": float(body.get("avgCost", 0)),
        "category": body.get("category", "Growth"),
        "sector": body.get("sector", ""),
        "secType": body.get("secType", "Stocks"),
    }
    acct.setdefault("positions", []).append(new_pos)
    save_account(acct)
    return jsonify({"ok": True, "position": new_pos}), 201


@bp.route("/api/accounts/<account_id>/positions/<int:idx>", methods=["PUT"])
def api_account_position_update(account_id, idx):
    """Update a position in an account by index."""
    acct = get_account(account_id)
    if not acct:
        return jsonify({"error": "Account not found"}), 404

    positions = acct.get("positions", [])
    if not (0 <= idx < len(positions)):
        return jsonify({"error": "Position index out of range"}), 404

    body = request.get_json()
    allowed = {"shares", "avgCost", "category", "sector", "secType"}
    for key in body:
        if key in allowed:
            if key in ("shares", "avgCost"):
                positions[idx][key] = float(body[key])
            else:
                positions[idx][key] = str(body[key])

    save_account(acct)
    return jsonify({"ok": True, "position": positions[idx]})


@bp.route("/api/accounts/<account_id>/positions/<int:idx>", methods=["DELETE"])
def api_account_position_delete(account_id, idx):
    """Delete a position from an account by index."""
    acct = get_account(account_id)
    if not acct:
        return jsonify({"error": "Account not found"}), 404

    positions = acct.get("positions", [])
    if not (0 <= idx < len(positions)):
        return jsonify({"error": "Position index out of range"}), 404

    removed = positions.pop(idx)
    save_account(acct)
    return jsonify({"ok": True, "removed": removed})


@bp.route("/api/accounts/<account_id>/cash", methods=["PUT"])
def api_account_cash_update(account_id):
    """Update cash balance for an account."""
    acct = get_account(account_id)
    if not acct:
        return jsonify({"error": "Account not found"}), 404

    body = request.get_json()
    acct["cash"] = float(body.get("cash", 0))
    save_account(acct)
    return jsonify({"ok": True, "cash": acct["cash"]})
