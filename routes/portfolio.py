"""Portfolio Blueprint — core portfolio, watchlist, dividend, and CRUD routes."""

from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request

from services.data_store import load_portfolio, save_portfolio, get_settings, crud_add, crud_delete
from services.yfinance_svc import fetch_ticker_data, fetch_all_quotes, fetch_dividends
from services.cache import cache_get, cache_set
from services.validation import validate_ticker

bp = Blueprint('portfolio', __name__)


def _get_iv_signal(dist_pct, thresholds):
    """IV Signal: price vs intrinsic value. dist_pct is a ratio (0.05 = 5%)."""
    t = thresholds.get("iv", {})
    sb = t.get("strongBuy", -15) / 100
    b  = t.get("buy", 0) / 100
    e  = t.get("expensive", 15) / 100
    if dist_pct <= sb: return "Strong Buy"
    if dist_pct < b:   return "Buy"
    if dist_pct <= e:   return "Expensive"
    return "Overrated"


def _get_avgcost_signal(dist_pct, thresholds):
    """Avg Cost Signal: price vs avg cost. dist_pct is a ratio (0.05 = 5%)."""
    t = thresholds.get("avgCost", {})
    sb = t.get("strongBuy", -15) / 100
    b  = t.get("buy", -5) / 100
    ac = t.get("avgCost", 5) / 100
    oc = t.get("overcost", 15) / 100
    if dist_pct < sb:  return "Strong Buy"
    if dist_pct < b:   return "Buy"
    if dist_pct < ac:  return "Avg. Cost"
    if dist_pct <= oc: return "Overcost"
    return "Hold"


@bp.route("/api/portfolio")
def api_portfolio():
    """Main endpoint: returns enriched portfolio data with live prices."""
    portfolio = load_portfolio()
    thresholds = get_settings().get("signalThresholds", {})
    pos_list = portfolio.get("positions", [])
    tickers = [p["ticker"] for p in pos_list]

    quotes = fetch_all_quotes(tickers)

    # Build IV lookup from intrinsicValues
    iv_list = portfolio.get("intrinsicValues", [])
    iv_map = {}
    for iv in iv_list:
        t = iv.get("ticker", "")
        if t:
            iv_map[t] = iv

    # Build total dividends received lookup from dividendLog
    div_log = portfolio.get("dividendLog", [])
    total_divs_received = {}
    for entry in div_log:
        for key, val in entry.items():
            if key not in ("year", "month", "cashInterest", "total") and val:
                total_divs_received[key] = total_divs_received.get(key, 0) + float(val or 0)

    enriched = []
    total_market_value = 0
    total_cost_basis = 0
    total_day_change = 0
    total_annual_div_income = 0

    for p in pos_list:
        ticker = p["ticker"]
        q = quotes.get(ticker, {})

        price = q.get("price", 0)
        prev_close = q.get("previousClose", price)
        day_change_pct = q.get("changePercent", 0)
        name = q.get("name", ticker)

        shares = p["shares"]
        avg_cost = p["avgCost"]
        cost_basis = shares * avg_cost
        market_value = shares * price
        market_return = market_value - cost_basis
        market_return_pct = (market_return / cost_basis * 100) if cost_basis > 0 else 0
        day_change_share = price - prev_close
        day_change_val = shares * day_change_share

        # Dividend fields
        div_rate = q.get("divRate", 0) or 0
        div_yield = q.get("divYield", 0) or 0
        # For ETFs where divRate is missing but divYield exists, derive rate from price
        if div_rate == 0 and div_yield > 0 and price > 0:
            div_rate = round(price * div_yield / 100, 4)
        annual_div_income = div_rate * shares
        yield_on_cost = (div_rate / avg_cost * 100) if avg_cost > 0 else 0
        divs_received = total_divs_received.get(ticker, 0)
        total_return_val = market_return + divs_received
        total_return_pct = (total_return_val / cost_basis * 100) if cost_basis > 0 else 0
        annual_shares_purch = (annual_div_income / price) if price > 0 else 0

        # IV fields
        iv_data = iv_map.get(ticker, {})
        intrinsic_value = iv_data.get("intrinsicValue", 0) or 0
        invt_score_data = iv_data.get("invtScore", 0)
        invt_score = invt_score_data.get("score", 0) if isinstance(invt_score_data, dict) else (float(invt_score_data) if invt_score_data else 0)
        dist_from_iv = ((price - intrinsic_value) / intrinsic_value) if intrinsic_value > 0 else 0
        dist_from_avg = ((price - avg_cost) / avg_cost) if avg_cost > 0 else 0

        # IV Signal
        iv_signal = _get_iv_signal(dist_from_iv, thresholds) if intrinsic_value > 0 else ""

        # Avg Cost Signal
        avg_cost_signal = _get_avgcost_signal(dist_from_avg, thresholds)

        total_market_value += market_value
        total_cost_basis += cost_basis
        total_day_change += day_change_val
        total_annual_div_income += annual_div_income

        enriched.append({
            "ticker": ticker,
            "company": name,
            "name": name,
            "shares": shares,
            "avgCost": avg_cost,
            "price": round(price, 2),
            "prevClose": round(prev_close, 2),
            "costBasis": round(cost_basis, 2),
            "marketValue": round(market_value, 2),
            "mktValue": round(market_value, 2),
            "marketReturn": round(market_return, 2),
            "marketReturnPct": round(market_return_pct, 2),
            "totalReturn": round(total_return_val, 2),
            "returnPercent": round(total_return_pct, 2),
            "totalRetPct": round(total_return_pct, 2),
            "dayChangeShare": round(day_change_share, 2),
            "dayChange": round(day_change_val, 2),
            "dayChangePercent": round(day_change_pct, 2),
            "dayChangePct": round(day_change_pct, 2),
            "weight": 0,
            "allocation": 0,
            "secType": p.get("secType", "Stocks"),
            "sector": p.get("sector", ""),
            "category": p.get("category", ""),
            "signal": "",
            "divYield": div_yield,
            "divRate": div_rate,
            "yieldOnCost": round(yield_on_cost, 2),
            "annualDivIncome": round(annual_div_income, 2),
            "totalDivsReceived": round(divs_received, 2),
            "annualSharesPurch": round(annual_shares_purch, 3),
            "intrinsicValue": round(intrinsic_value, 2),
            "invtScore": round(invt_score, 1),
            "distFromIV": round(dist_from_iv * 100, 2),
            "ivSignal": iv_signal,
            "distFromAvgCost": round(dist_from_avg * 100, 2),
            "avgCostSignal": avg_cost_signal,
            "pe": q.get("pe", 0),
            "marketCap": q.get("marketCap", 0),
            "beta": q.get("beta", 0),
            "fiftyTwoWeekHigh": q.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow": q.get("fiftyTwoWeekLow", 0),
            "targetPrice": q.get("targetMeanPrice", 0),
        })

    cash = portfolio.get("cash", 0)
    total_portfolio = total_market_value + cash
    total_return = total_market_value - total_cost_basis
    total_return_pct = (total_return / total_cost_basis * 100) if total_cost_basis > 0 else 0

    # Calculate allocations and weights
    for pos in enriched:
        alloc = round((pos["marketValue"] / total_portfolio * 100) if total_portfolio > 0 else 0, 2)
        pos["allocation"] = alloc
        pos["weight"] = alloc

    # Category allocation
    cat_alloc = {}
    for pos in enriched:
        cat = pos["category"]
        cat_alloc[cat] = round(cat_alloc.get(cat, 0) + pos["allocation"], 2)

    # Sector allocation
    sec_alloc = {}
    for pos in enriched:
        sec = pos["sector"]
        sec_alloc[sec] = round(sec_alloc.get(sec, 0) + pos["allocation"], 2)

    # Security type allocation
    type_alloc = {}
    for pos in enriched:
        st = pos["secType"]
        type_alloc[st] = round(type_alloc.get(st, 0) + pos["allocation"], 2)

    # Signals based on valuation
    for pos in enriched:
        pos["signal"] = _get_avgcost_signal(pos["returnPercent"] / 100, thresholds)

    # Percent of total dividend income
    for pos in enriched:
        pos["pctOfTotalIncome"] = round((pos["annualDivIncome"] / total_annual_div_income * 100) if total_annual_div_income > 0 else 0, 2)

    # Goals array
    raw_goals = portfolio.get("goals", {})
    goals_array = []
    if raw_goals.get("portfolioTarget"):
        goals_array.append({"name": f"${raw_goals['portfolioTarget']:,} Portfolio Goal", "current": round(total_market_value, 2), "target": raw_goals["portfolioTarget"]})
    if raw_goals.get("dividendTarget"):
        goals_array.append({"name": f"${raw_goals['dividendTarget']:,} Annual Dividend Goal", "current": round(total_annual_div_income, 2), "target": raw_goals["dividendTarget"]})
    if raw_goals.get("maxHoldings"):
        goals_array.append({"name": f"Diversification ({raw_goals['maxHoldings']} Holdings Max)", "current": len(enriched), "target": raw_goals["maxHoldings"]})

    day_change_pct_total = round((total_day_change / (total_market_value - total_day_change) * 100) if (total_market_value - total_day_change) > 0 else 0, 2)

    # Portfolio-level dividend metrics
    cash_weight = round((cash / total_portfolio * 100) if total_portfolio > 0 else 0, 2)
    portfolio_div_yield = round((total_annual_div_income / total_market_value * 100) if total_market_value > 0 else 0, 2)
    portfolio_yoc = round((total_annual_div_income / total_cost_basis * 100) if total_cost_basis > 0 else 0, 2)
    lifetime_divs = round(sum(total_divs_received.values()), 2)

    # Portfolio-level weighted P/E and Beta
    pe_weight_sum = 0.0
    pe_alloc_sum = 0.0
    beta_weight_sum = 0.0
    beta_alloc_sum = 0.0
    for pos in enriched:
        alloc = pos.get("allocation", 0)
        pe_val = pos.get("pe", 0)
        beta_val = pos.get("beta", 0)
        if pe_val and pe_val > 0:
            pe_weight_sum += pe_val * alloc
            pe_alloc_sum += alloc
        if beta_val and beta_val > 0:
            beta_weight_sum += beta_val * alloc
            beta_alloc_sum += alloc
    portfolio_pe = round(pe_weight_sum / pe_alloc_sum, 1) if pe_alloc_sum > 0 else 0
    portfolio_beta = round(beta_weight_sum / beta_alloc_sum, 2) if beta_alloc_sum > 0 else 0

    # Sold positions summary
    sold_list = portfolio.get("soldPositions", [])
    sold_market_return = 0
    for sp in sold_list:
        shares_s = float(sp.get("shares", 0))
        sell_price = float(sp.get("sellPrice", 0))
        buy_cost = float(sp.get("avgCost", 0))
        sold_market_return += (sell_price - buy_cost) * shares_s
    sold_total_return = round(sold_market_return, 2)

    return jsonify({
        "positions": enriched,
        "summary": {
            "marketValue": round(total_market_value, 2),
            "totalMarketValue": round(total_market_value, 2),
            "costBasis": round(total_cost_basis, 2),
            "totalCostBasis": round(total_cost_basis, 2),
            "totalReturn": round(total_return, 2),
            "totalReturnPct": round(total_return_pct, 2),
            "totalReturnPercent": round(total_return_pct, 2),
            "marketReturnPercent": round(total_return_pct, 2),
            "dayChange": round(total_day_change, 2),
            "dayChangePct": day_change_pct_total,
            "dayChangePercent": day_change_pct_total,
            "cash": cash,
            "cashWeight": cash_weight,
            "holdings": len(enriched),
            "totalPortfolio": round(total_portfolio, 2),
            "annualDivIncome": round(total_annual_div_income, 2),
            "monthlyDivIncome": round(total_annual_div_income / 12, 2),
            "weeklyDivIncome": round(total_annual_div_income / 52, 2),
            "dailyDivIncome": round(total_annual_div_income / 365, 2),
            "portfolioDivYield": portfolio_div_yield,
            "portfolioYOC": portfolio_yoc,
            "lifetimeDivsReceived": lifetime_divs,
            "soldReturn": sold_total_return,
            "soldPositionsCount": len(sold_list),
            "portfolioPE": portfolio_pe,
            "portfolioBeta": portfolio_beta,
        },
        "allocations": {
            "category": cat_alloc,
            "sector": sec_alloc,
            "securityType": type_alloc,
        },
        "targets": portfolio.get("targets", {}),
        "goals": goals_array,
        "goals_raw": raw_goals,
        "strategy": portfolio.get("strategy", []),
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/watchlist")
def api_watchlist():
    """Watchlist with live quotes."""
    portfolio = load_portfolio()
    wl = portfolio.get("watchlist", [])
    tickers = [w["ticker"] if isinstance(w, dict) else w for w in wl]
    priorities = {(w["ticker"] if isinstance(w, dict) else w): (w.get("priority", "Low") if isinstance(w, dict) else "Low") for w in wl}

    quotes = fetch_all_quotes(tickers)

    # Build IV lookup for enrichment
    iv_list = portfolio.get("intrinsicValues", [])
    iv_map = {}
    for iv in iv_list:
        t = iv.get("ticker", "")
        if t:
            iv_map[t] = iv

    result = []
    for ticker in tickers:
        q = quotes.get(ticker, {})
        price = q.get("price", 0)
        prev_close = q.get("previousClose", price)
        target_price = q.get("targetMeanPrice", 0)
        div_rate = q.get("divRate", 0) or 0
        div_yield = q.get("divYield", 0) or 0
        if div_rate == 0 and div_yield > 0 and price > 0:
            div_rate = round(price * div_yield / 100, 4)
        annual_income_100 = round(div_rate * 100, 2) if div_rate else 0
        cost_100_shares = round(price * 100, 2) if price else 0
        eps = q.get("pe", 0)
        pe = q.get("pe", 0)
        # EPS = Price / PE
        eps_val = round(price / pe, 2) if pe and pe > 0 else 0

        # Enrich with IV list data if available
        iv_entry = iv_map.get(ticker, {})
        iv_val = iv_entry.get("intrinsicValue", 0) or 0
        if iv_val > 0:
            intrinsic = iv_val
        else:
            intrinsic = target_price
        dist_pct = round(((price - intrinsic) / intrinsic * 100) if intrinsic > 0 else 0, 2)

        # InvT Score from IV list
        invt_score_data = iv_entry.get("invtScore", 0)
        invt_score = invt_score_data.get("score", 0) if isinstance(invt_score_data, dict) else (float(invt_score_data) if invt_score_data else 0)

        result.append({
            "ticker": ticker,
            "company": q.get("name", ticker),
            "name": q.get("name", ticker),
            "price": round(price, 2),
            "intrinsicValue": round(intrinsic, 2),
            "iv": round(intrinsic, 2),
            "pe": pe,
            "eps": eps_val,
            "marketCap": q.get("marketCap", 0),
            "priority": priorities.get(ticker, "Low"),
            "distance": dist_pct,
            "dist": dist_pct,
            "invtScore": round(invt_score, 1),
            "dayChangeShare": round(price - prev_close, 2),
            "dayChange": q.get("changePercent", 0),
            "dayChangePct": q.get("changePercent", 0),
            "sector": q.get("sector", ""),
            "industry": q.get("industry", ""),
            "divYield": div_yield,
            "divRate": div_rate,
            "annualIncome100": annual_income_100,
            "cost100Shares": cost_100_shares,
            "fiftyTwoWeekHigh": q.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow": q.get("fiftyTwoWeekLow", 0),
            "beta": q.get("beta", 0),
        })

    return jsonify({"watchlist": result, "lastUpdated": datetime.now().isoformat()})


@bp.route("/api/dividends")
def api_dividends():
    """Dividend data for all holdings."""
    portfolio = load_portfolio()
    tickers = [p["ticker"] for p in portfolio.get("positions", [])]

    all_dividends = {}
    monthly_totals = {}
    total_received = 0

    for ticker in tickers:
        divs = fetch_dividends(ticker)
        shares = next((p["shares"] for p in portfolio["positions"] if p["ticker"] == ticker), 0)

        ticker_total = 0
        for d in divs:
            amount = d.get("dividend", 0) * shares
            ticker_total += amount
            total_received += amount

            date_str = d.get("date", "")
            if date_str:
                try:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                    key = dt.strftime("%Y-%m")
                    monthly_totals[key] = monthly_totals.get(key, 0) + amount
                except ValueError:
                    pass

        all_dividends[ticker] = round(ticker_total, 2)

    now = datetime.now()
    one_year_ago = now - timedelta(days=365)
    annual_estimate = sum(v for k, v in monthly_totals.items()
                         if k >= one_year_ago.strftime("%Y-%m"))

    return jsonify({
        "byHolding": all_dividends,
        "monthlyTotals": {k: round(v, 2) for k, v in sorted(monthly_totals.items())},
        "totalReceived": round(total_received, 2),
        "annualEstimate": round(annual_estimate, 2),
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/quote/<ticker>")
def api_quote(ticker):
    """Single ticker quote."""
    ticker = validate_ticker(ticker)
    if not ticker:
        return jsonify({"error": "Invalid ticker symbol"}), 400
    data = fetch_ticker_data(ticker)
    if data and data.get("price", 0) > 0:
        return jsonify(data)
    return jsonify({"error": "Not found"}), 404


@bp.route("/api/position/update", methods=["POST"])
def api_position_update():
    """Update a field on a position. Body: {ticker, field, value}"""
    body = request.get_json()
    ticker = body.get("ticker")
    field = body.get("field")
    value = body.get("value")

    if not ticker or not field:
        return jsonify({"error": "ticker and field required"}), 400

    allowed_fields = {"shares", "avgCost", "category", "sector", "secType", "buyDate"}
    if field not in allowed_fields:
        return jsonify({"error": f"Field '{field}' not editable"}), 400

    portfolio = load_portfolio()
    for p in portfolio["positions"]:
        if p["ticker"] == ticker:
            if field in ("shares", "avgCost"):
                p[field] = float(value)
            else:
                p[field] = str(value)
            save_portfolio(portfolio)
            return jsonify({"ok": True, "position": p})

    return jsonify({"error": f"Ticker '{ticker}' not found"}), 404


@bp.route("/api/position/add", methods=["POST"])
def api_position_add():
    """Add a new position. Body: {ticker, shares, avgCost, category, sector, secType}"""
    body = request.get_json()
    ticker = validate_ticker(body.get("ticker", ""))
    if not ticker:
        return jsonify({"error": "Invalid ticker symbol"}), 400

    portfolio = load_portfolio()

    # Check for duplicates
    for p in portfolio["positions"]:
        if p["ticker"] == ticker:
            return jsonify({"error": f"'{ticker}' already exists"}), 400

    now = datetime.now()
    new_pos = {
        "ticker": ticker,
        "shares": float(body.get("shares", 0)),
        "avgCost": float(body.get("avgCost", 0)),
        "category": body.get("category", "Growth"),
        "sector": body.get("sector", ""),
        "secType": body.get("secType", "Stocks"),
        "buyDate": body.get("buyDate", ""),
        "entryDate": body.get("entryDate", now.strftime("%Y-%m")),
    }
    portfolio["positions"].append(new_pos)
    save_portfolio(portfolio)
    return jsonify({"ok": True, "position": new_pos})


@bp.route("/api/position/delete", methods=["POST"])
def api_position_delete():
    """Delete a position. Body: {ticker}"""
    body = request.get_json()
    ticker = validate_ticker(body.get("ticker", ""))
    if not ticker:
        return jsonify({"error": "Invalid ticker symbol"}), 400

    portfolio = load_portfolio()
    original_len = len(portfolio["positions"])
    portfolio["positions"] = [p for p in portfolio["positions"] if p["ticker"] != ticker]

    if len(portfolio["positions"]) == original_len:
        return jsonify({"error": f"'{ticker}' not found"}), 404

    save_portfolio(portfolio)
    return jsonify({"ok": True})


@bp.route("/api/watchlist/add", methods=["POST"])
def api_watchlist_add():
    """Add to watchlist. Body: {ticker, priority}"""
    body = request.get_json()
    ticker = validate_ticker(body.get("ticker", ""))
    if not ticker:
        return jsonify({"error": "Invalid ticker symbol"}), 400

    portfolio = load_portfolio()
    for w in portfolio.get("watchlist", []):
        t = w["ticker"] if isinstance(w, dict) else w
        if t == ticker:
            return jsonify({"error": f"'{ticker}' already on watchlist"}), 400

    portfolio.setdefault("watchlist", []).append({
        "ticker": ticker,
        "priority": body.get("priority", "Low"),
    })
    save_portfolio(portfolio)
    return jsonify({"ok": True})


@bp.route("/api/watchlist/delete", methods=["POST"])
def api_watchlist_delete():
    """Remove from watchlist. Body: {ticker}"""
    body = request.get_json()
    ticker = validate_ticker(body.get("ticker", ""))
    if not ticker:
        return jsonify({"error": "Invalid ticker symbol"}), 400

    portfolio = load_portfolio()
    original = portfolio.get("watchlist", [])
    portfolio["watchlist"] = [w for w in original if (w["ticker"] if isinstance(w, dict) else w) != ticker]

    if len(portfolio["watchlist"]) == len(original):
        return jsonify({"error": f"'{ticker}' not on watchlist"}), 404

    save_portfolio(portfolio)
    return jsonify({"ok": True})


@bp.route("/api/watchlist/update", methods=["POST"])
def api_watchlist_update():
    """Update watchlist item priority. Body: {ticker, priority}"""
    body = request.get_json()
    ticker = validate_ticker(body.get("ticker", ""))
    if not ticker:
        return jsonify({"error": "Invalid ticker symbol"}), 400
    priority = body.get("priority", "Low")

    portfolio = load_portfolio()
    for w in portfolio.get("watchlist", []):
        if isinstance(w, dict) and w["ticker"] == ticker:
            w["priority"] = priority
            save_portfolio(portfolio)
            return jsonify({"ok": True})

    return jsonify({"error": f"'{ticker}' not on watchlist"}), 404


@bp.route("/api/cash/update", methods=["POST"])
def api_cash_update():
    """Update cash balance. Body: {cash}"""
    body = request.get_json()
    portfolio = load_portfolio()
    portfolio["cash"] = float(body.get("cash", 0))
    save_portfolio(portfolio)
    return jsonify({"ok": True, "cash": portfolio["cash"]})


@bp.route("/api/goals/update", methods=["POST"])
def api_goals_update():
    """Update goals. Body: {portfolioTarget, dividendTarget, maxHoldings}"""
    body = request.get_json()
    portfolio = load_portfolio()
    goals = portfolio.get("goals", {})
    for key in ["portfolioTarget", "dividendTarget", "maxHoldings", "cashReserveMin", "cashReserveMax"]:
        if key in body:
            goals[key] = float(body[key])
    portfolio["goals"] = goals
    save_portfolio(portfolio)
    return jsonify({"ok": True, "goals": goals})


@bp.route("/api/targets/update", methods=["POST"])
def api_targets_update():
    """Update target allocations. Body: {category: {Cat1: %, Cat2: %}}"""
    body = request.get_json()
    portfolio = load_portfolio()
    targets = portfolio.get("targets", {})
    if "category" in body and isinstance(body["category"], dict):
        targets["category"] = body["category"]
    portfolio["targets"] = targets
    save_portfolio(portfolio)
    return jsonify({"ok": True, "targets": targets})


@bp.route("/api/strategy/add", methods=["POST"])
def api_strategy_add():
    """Add a strategy note. Body: {"note": "text"}"""
    body = request.get_json()
    note = body.get("note", "").strip()
    if not note:
        return jsonify({"error": "Note text required"}), 400
    crud_add("strategy", note)
    return jsonify({"ok": True})


@bp.route("/api/strategy/update", methods=["POST"])
def api_strategy_update():
    """Update a strategy note. Body: {"index": N, "note": "new text"}"""
    body = request.get_json()
    index = body.get("index")
    note = body.get("note", "").strip()
    if index is None or not note:
        return jsonify({"error": "Index and note text required"}), 400
    portfolio = load_portfolio()
    items = portfolio.get("strategy", [])
    idx = int(index)
    if 0 <= idx < len(items):
        items[idx] = note
        save_portfolio(portfolio)
        return jsonify({"ok": True})
    return jsonify({"error": "Index out of range"}), 404


@bp.route("/api/strategy/delete", methods=["POST"])
def api_strategy_delete():
    """Delete a strategy note. Body: {"index": N}"""
    body = request.get_json()
    index = body.get("index")
    if index is None:
        return jsonify({"error": "Index required"}), 400
    crud_delete("strategy", int(index))
    return jsonify({"ok": True})


# ── Find the Dip (SMA analysis) ────────────────────────────────────────

@bp.route("/api/find-the-dip")
def api_find_the_dip():
    """Compute SMA distances for all holdings. Returns positions trading below moving averages."""
    import yfinance as yf

    cached = cache_get("find_the_dip")
    if cached:
        return jsonify(cached)

    portfolio = load_portfolio()
    positions = portfolio.get("positions", [])
    tickers = [p["ticker"] for p in positions if p.get("ticker")]
    if not tickers:
        return jsonify({"holdings": []})

    windows = [10, 50, 100, 200]
    results = []

    try:
        data = yf.download(tickers, period="1y", interval="1d", progress=False)
        close = data["Close"] if "Close" in data.columns else None
        if close is None:
            return jsonify({"holdings": []})

        for pos in positions:
            ticker = pos["ticker"]
            try:
                if hasattr(close, 'columns') and ticker in close.columns:
                    series = close[ticker].dropna()
                elif not hasattr(close, 'columns') and len(tickers) == 1:
                    series = close.dropna()
                else:
                    continue

                if len(series) < 10:
                    continue

                current_price = float(series.iloc[-1])
                sma_data = {}
                for w in windows:
                    if len(series) >= w:
                        sma_val = float(series.rolling(window=w).mean().iloc[-1])
                        dist = round((current_price / sma_val - 1) * 100, 2)
                        sma_data[f"sma{w}"] = round(sma_val, 2)
                        sma_data[f"dist{w}"] = dist

                results.append({
                    "ticker": ticker,
                    "price": round(current_price, 2),
                    "category": pos.get("category", ""),
                    **sma_data,
                })
            except Exception:
                continue

    except Exception as e:
        print(f"[find-the-dip] Error: {e}")
        return jsonify({"holdings": []})

    response = {"holdings": results, "lastUpdated": datetime.now().isoformat()}
    cache_set("find_the_dip", response)
    return jsonify(response)
