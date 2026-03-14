"""Super Investors Blueprint — SEC EDGAR 13F holdings routes."""

import statistics
import threading
from concurrent.futures import ThreadPoolExecutor

from flask import Blueprint, jsonify, request

from config import SUPER_INVESTORS
from services.edgar_13f import (
    _13f_history,
    _13f_progress,
    _get_latest_quarter,
    _get_current_quarter_label,
    _fetch_investor_13f,
    _save_13f_history,
)
from services.yfinance_svc import fetch_ticker_data

bp = Blueprint('super_investors', __name__)


@bp.route("/api/super-investors")
def api_super_investors_list():
    """List all available super investors."""
    result = []
    for k, v in SUPER_INVESTORS.items():
        latest = _get_latest_quarter(k)
        result.append({
            "key": k, "fund": v["fund"], "cik": v["cik"],
            "note": v.get("note", ""),
            "cached": latest is not None,
            "quarter": latest["quarter"] if latest else "",
            "holdingsCount": latest["holdingsCount"] if latest else 0,
        })
    return jsonify(result)


@bp.route("/api/super-investors/13f/<investor_key>")
def api_super_investor_13f(investor_key):
    """Fetch 13F holdings for one investor (reads from history, fetches if missing)."""
    latest = _get_latest_quarter(investor_key)
    if latest:
        return jsonify(latest)
    try:
        result = _fetch_investor_13f(investor_key)
        if result is None:
            return jsonify({"error": f"Unknown investor: {investor_key}"}), 404
        return jsonify(result)
    except Exception as e:
        print(f"[13F] Error fetching {investor_key}: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/api/super-investors/13f-all", methods=["POST"])
def api_super_investor_13f_all():
    """Fetch all investors in a background thread."""
    if _13f_progress.get("running"):
        return jsonify({"status": "already_running"})
    _13f_progress.update({"done": 0, "total": len(SUPER_INVESTORS),
                          "current": "", "results": {}, "running": True})
    def _bg():
        for i, key in enumerate(SUPER_INVESTORS):
            _13f_progress["current"] = key
            try:
                result = _fetch_investor_13f(key)
                _13f_progress["results"][key] = {
                    "ok": "error" not in (result or {}),
                    "holdingsCount": (result or {}).get("holdingsCount", 0),
                }
            except Exception as e:
                _13f_progress["results"][key] = {"ok": False, "error": str(e)}
            _13f_progress["done"] = i + 1
        _13f_progress["running"] = False
        _13f_progress["current"] = ""
        # Save history after all investors are done
        _save_13f_history()
    threading.Thread(target=_bg, daemon=True).start()
    return jsonify({"status": "started", "total": len(SUPER_INVESTORS)})


@bp.route("/api/super-investors/13f-progress")
def api_super_investor_13f_progress():
    """Poll progress for the background 13F fetch."""
    return jsonify(_13f_progress)


@bp.route("/api/super-investors/overlap", methods=["POST"])
def api_super_investor_overlap():
    """Compute ticker overlap across selected investors."""
    b = request.get_json()
    investors = b.get("investors", [])
    ticker_investors = {}  # ticker -> [{investor, value, shares}]
    for inv_key in investors:
        data = _get_latest_quarter(inv_key)
        if not data or "holdings" not in data:
            continue
        for h in data["holdings"]:
            tk = h.get("ticker", h.get("cusip", ""))
            if tk not in ticker_investors:
                ticker_investors[tk] = []
            ticker_investors[tk].append({
                "investor": inv_key,
                "value": h["value"],
                "shares": h["shares"],
                "name": h.get("name", ""),
            })
    # Only tickers held by 2+ investors
    overlap = []
    for tk, entries in ticker_investors.items():
        if len(entries) >= 2:
            overlap.append({
                "ticker": tk,
                "name": entries[0]["name"],
                "heldBy": [e["investor"] for e in entries],
                "heldByCount": len(entries),
                "combinedValue": sum(e["value"] for e in entries),
            })
    overlap.sort(key=lambda x: x["heldByCount"], reverse=True)
    return jsonify(overlap)


@bp.route("/api/super-investors/most-popular")
def api_super_investor_most_popular():
    """Top 50 most held stocks across investors with the latest quarter, ranked by investor count."""
    current_q = _get_current_quarter_label()
    ticker_data = {}  # ticker -> {name, investors: set, totalValue, totalShares}
    matched_investors = 0
    for inv_key in SUPER_INVESTORS:
        hist = _13f_history.get(inv_key)
        if not hist or not hist.get("quarters"):
            continue
        latest = hist["quarters"][0]
        if current_q and latest.get("quarter") != current_q:
            continue  # skip investors whose latest quarter doesn't match
        matched_investors += 1
        for h in latest.get("holdings", []):
            tk = h.get("ticker", h.get("cusip", ""))
            if not tk or tk == h.get("cusip", ""):
                continue  # skip unresolved CUSIPs
            if tk not in ticker_data:
                ticker_data[tk] = {"name": h.get("name", ""), "investors": set(),
                                   "totalValue": 0, "totalShares": 0}
            ticker_data[tk]["investors"].add(inv_key)
            ticker_data[tk]["totalValue"] += h["value"]
            ticker_data[tk]["totalShares"] += h["shares"]
    # Convert to list, sort by investor count desc, then value desc
    popular = []
    for tk, d in ticker_data.items():
        popular.append({
            "ticker": tk, "name": d["name"],
            "investorCount": len(d["investors"]),
            "investors": sorted(d["investors"]),
            "totalValue": d["totalValue"],
            "totalShares": d["totalShares"],
        })
    popular.sort(key=lambda x: (x["investorCount"], x["totalValue"]), reverse=True)
    return jsonify({
        "popular": popular[:50],
        "cachedInvestors": matched_investors,
        "totalInvestors": len(SUPER_INVESTORS),
        "quarter": current_q or "",
    })


@bp.route("/api/super-investors/history/<investor_key>")
def api_super_investor_history(investor_key):
    """Return quarterly summary for portfolio value chart (no holdings array)."""
    hist = _13f_history.get(investor_key)
    if not hist:
        return jsonify({"error": "No history data", "quarters": []})
    summary = [{
        "quarter": q["quarter"],
        "filingDate": q.get("filingDate", ""),
        "totalValue": q.get("totalValue", 0),
        "holdingsCount": q.get("holdingsCount", 0),
        "top10pct": q.get("top10pct", 0),
    } for q in hist.get("quarters", [])]
    return jsonify({"investor": investor_key, "fund": hist.get("fund", ""), "quarters": summary})


@bp.route("/api/super-investors/activity/<investor_key>")
def api_super_investor_activity(investor_key):
    """Compare latest vs previous quarter to show buys/sells/changes."""
    hist = _13f_history.get(investor_key)
    if not hist or len(hist.get("quarters", [])) < 2:
        return jsonify({"error": "Need at least 2 quarters of history", "buys": [], "sells": [], "increased": [], "decreased": []})
    quarters = hist["quarters"]  # sorted most recent first
    current = {h["ticker"]: h for h in quarters[0].get("holdings", []) if h.get("ticker")}
    previous = {h["ticker"]: h for h in quarters[1].get("holdings", []) if h.get("ticker")}
    buys, sells, increased, decreased = [], [], [], []
    for ticker, h in current.items():
        if ticker not in previous:
            buys.append({"ticker": ticker, "name": h.get("name", ""), "shares": h["shares"], "value": h["value"], "pctPortfolio": h.get("pctPortfolio", 0)})
        else:
            prev_shares = previous[ticker]["shares"]
            if h["shares"] > prev_shares:
                change_pct = round((h["shares"] - prev_shares) / prev_shares * 100, 1) if prev_shares else 0
                increased.append({"ticker": ticker, "name": h.get("name", ""), "shares": h["shares"], "prevShares": prev_shares, "changePct": change_pct, "value": h["value"]})
            elif h["shares"] < prev_shares:
                change_pct = round((h["shares"] - prev_shares) / prev_shares * 100, 1) if prev_shares else 0
                decreased.append({"ticker": ticker, "name": h.get("name", ""), "shares": h["shares"], "prevShares": prev_shares, "changePct": change_pct, "value": h["value"]})
    for ticker, h in previous.items():
        if ticker not in current:
            sells.append({"ticker": ticker, "name": h.get("name", ""), "shares": h["shares"], "value": h["value"]})
    # Build per-ticker lookup for inline activity badges
    by_ticker = {}
    for b in buys: by_ticker[b["ticker"]] = {"type": "new"}
    for s in sells: by_ticker[s["ticker"]] = {"type": "sold"}
    for i in increased:
        prev_val = previous[i["ticker"]]["value"]
        val_chg = round((i["value"] - prev_val) / prev_val * 100, 1) if prev_val else 0
        by_ticker[i["ticker"]] = {"type": "increased", "changePct": i["changePct"], "valueChangePct": val_chg}
    for d in decreased:
        prev_val = previous[d["ticker"]]["value"]
        val_chg = round((d["value"] - prev_val) / prev_val * 100, 1) if prev_val else 0
        by_ticker[d["ticker"]] = {"type": "decreased", "changePct": d["changePct"], "valueChangePct": val_chg}
    # Unchanged holdings (same shares but value may differ due to price movement)
    for ticker, h in current.items():
        if ticker in previous and ticker not in by_ticker:
            prev_val = previous[ticker]["value"]
            val_chg = round((h["value"] - prev_val) / prev_val * 100, 1) if prev_val else 0
            by_ticker[ticker] = {"type": "unchanged", "valueChangePct": val_chg}

    return jsonify({
        "currentQuarter": quarters[0].get("quarter", ""),
        "previousQuarter": quarters[1].get("quarter", ""),
        "buys": sorted(buys, key=lambda x: x["value"], reverse=True),
        "sells": sorted(sells, key=lambda x: x["value"], reverse=True),
        "increased": sorted(increased, key=lambda x: abs(x["changePct"]), reverse=True),
        "decreased": sorted(decreased, key=lambda x: abs(x["changePct"]), reverse=True),
        "buysCount": len(buys),
        "sellsCount": len(sells),
        "byTicker": by_ticker,
    })


@bp.route("/api/super-investors/prices", methods=["POST"])
def api_super_investor_prices():
    """Fetch current prices for a list of tickers (max 50)."""
    body = request.get_json(force=True) or {}
    tickers = body.get("tickers", [])[:50]
    if not tickers:
        return jsonify({"prices": {}})
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(fetch_ticker_data, tickers))
    prices = {}
    for ticker, data in zip(tickers, results):
        if data and data.get("price"):
            prices[ticker] = {"price": data["price"], "changePercent": data.get("changePercent", 0)}
    return jsonify({"prices": prices})


def _compute_key_stats(enriched):
    """Compute aggregate stats from enriched ticker data."""
    sectors = {}
    yields_list = []
    pe_list = []
    beta_list = []
    mcap_list = []
    dividend_payers = 0

    for t in enriched:
        sector = t.get("sector") or "Unknown"
        sectors[sector] = sectors.get(sector, 0) + 1

        dy = t.get("divYield")
        if dy and dy > 0:
            yields_list.append(dy)
            dividend_payers += 1

        pe = t.get("pe")
        if pe and pe > 0:
            pe_list.append(pe)

        b = t.get("beta")
        if b and b > 0:
            beta_list.append(b)

        mc = t.get("marketCap")
        if mc and mc > 0:
            mcap_list.append(mc)

    # Sector counts sorted descending
    sorted_sectors = sorted(sectors.items(), key=lambda x: x[1], reverse=True)

    # Yield tiers
    total = len(enriched)
    yield_tiers = {
        "1pct": len([y for y in yields_list if y >= 1]),
        "2pct": len([y for y in yields_list if y >= 2]),
        "3pct": len([y for y in yields_list if y >= 3]),
        "4pct": len([y for y in yields_list if y >= 4]),
    }

    return {
        "sectors": sorted_sectors,
        "sectorCount": len(sectors),
        "yieldTiers": yield_tiers,
        "avgDivYield": round(statistics.mean(yields_list), 2) if yields_list else 0,
        "medianDivYield": round(statistics.median(yields_list), 2) if yields_list else 0,
        "avgPE": round(statistics.mean(pe_list), 1) if pe_list else 0,
        "medianPE": round(statistics.median(pe_list), 1) if pe_list else 0,
        "avgBeta": round(statistics.mean(beta_list), 2) if beta_list else 0,
        "avgMarketCap": round(statistics.mean(mcap_list)) if mcap_list else 0,
        "dividendPayers": dividend_payers,
        "totalStocks": total,
    }


@bp.route("/api/super-investors/key-stats", methods=["POST"])
def api_super_investor_key_stats():
    """Fetch enrichment data for tickers and compute aggregate key stats."""
    body = request.get_json(force=True) or {}
    tickers = body.get("tickers", [])[:50]
    if not tickers:
        return jsonify({"stats": _compute_key_stats([]), "tickerCount": 0})
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(fetch_ticker_data, tickers))
    enriched = []
    for ticker, data in zip(tickers, results):
        if data:
            enriched.append({
                "ticker": ticker,
                "sector": data.get("sector", ""),
                "divYield": data.get("divYield", 0),
                "pe": data.get("pe", 0),
                "beta": data.get("beta", 0),
                "marketCap": data.get("marketCap", 0),
            })
    return jsonify({"stats": _compute_key_stats(enriched), "tickerCount": len(enriched)})


@bp.route("/api/super-investors/holding-history/<investor_key>/<ticker>")
def api_super_investor_holding_history(investor_key, ticker):
    """Return a holding's value/shares across all historical quarters."""
    hist = _13f_history.get(investor_key)
    if not hist:
        return jsonify({"ticker": ticker, "history": []})
    history = []
    for q in hist.get("quarters", []):
        for h in q.get("holdings", []):
            if h.get("ticker") == ticker:
                history.append({
                    "quarter": q.get("quarter", ""),
                    "value": h.get("value", 0),
                    "shares": h.get("shares", 0),
                    "pctPortfolio": h.get("pctPortfolio", 0),
                })
                break
    return jsonify({"ticker": ticker, "history": history})
