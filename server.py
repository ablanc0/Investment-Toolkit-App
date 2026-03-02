"""
Portfolio Fidelity 2024 — Standalone Investment Dashboard Server
Pulls live market data from Yahoo Finance via yfinance.
"""

import json
import time
import threading
from pathlib import Path
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory

import yfinance as yf

# ── Config ──────────────────────────────────────────────────────────────
import os
import platform

BASE_DIR = Path(__file__).parent

def _resolve_data_dir():
    """Resolve the data directory: env var > config.json > Google Drive default > local."""
    # 1. Environment variable override
    env_dir = os.environ.get("INVTOOLKIT_DATA_DIR")
    if env_dir:
        p = Path(env_dir)
        if p.exists():
            return p

    # 2. config.json in the app folder
    config_file = BASE_DIR / "config.json"
    if config_file.exists():
        try:
            cfg = json.loads(config_file.read_text())
            p = Path(cfg.get("dataDir", ""))
            if p.exists():
                return p
        except Exception:
            pass

    # 3. Google Drive default paths (Mac / Windows)
    home = Path.home()
    gdrive_candidates = [
        # macOS Google Drive
        home / "Library" / "CloudStorage" / "GoogleDrive-ale.blancoglez91@gmail.com" / "My Drive" / "Investments" / "portfolio-app",
        # Windows Google Drive (stream)
        Path("G:/My Drive/Investments/portfolio-app"),
        # Windows Google Drive (mirror)
        home / "Google Drive" / "My Drive" / "Investments" / "portfolio-app",
    ]
    for candidate in gdrive_candidates:
        if candidate.exists():
            return candidate

    # 4. Fallback: local directory (for development)
    return BASE_DIR

DATA_DIR = _resolve_data_dir()
PORTFOLIO_FILE = DATA_DIR / "portfolio.json"
CACHE_FILE = DATA_DIR / "cache.json"
CACHE_TTL = 300  # 5 minutes

app = Flask(__name__, static_folder="static")

# ── Cache ───────────────────────────────────────────────────────────────
_cache = {}
_cache_lock = threading.Lock()


def load_disk_cache():
    global _cache
    if CACHE_FILE.exists():
        try:
            _cache = json.loads(CACHE_FILE.read_text())
        except Exception:
            _cache = {}


def save_disk_cache():
    try:
        CACHE_FILE.write_text(json.dumps(_cache, default=str))
    except Exception:
        pass


def cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (time.time() - entry.get("ts", 0)) < CACHE_TTL:
            return entry["data"]
    return None


def cache_set(key, data):
    with _cache_lock:
        _cache[key] = {"ts": time.time(), "data": data}
        save_disk_cache()


# ── Portfolio I/O ───────────────────────────────────────────────────────
def load_portfolio():
    if PORTFOLIO_FILE.exists():
        return json.loads(PORTFOLIO_FILE.read_text())
    return {"positions": [], "watchlist": [], "cash": 0, "goals": {}, "targets": {}, "strategy": []}


def save_portfolio(data):
    PORTFOLIO_FILE.write_text(json.dumps(data, indent=2))


# ── yfinance helpers ────────────────────────────────────────────────────
def fetch_ticker_data(ticker):
    """Fetch quote data for a single ticker via yfinance, with cache."""
    cached = cache_get(f"yf_{ticker}")
    if cached:
        return cached

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        # yfinance returns a lot — we extract what we need
        data = {
            "price": info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose", 0),
            "previousClose": info.get("previousClose") or info.get("regularMarketPreviousClose", 0),
            "name": info.get("longName") or info.get("shortName", ticker),
            "marketCap": info.get("marketCap", 0),
            "pe": info.get("trailingPE", 0),
            "forwardPE": info.get("forwardPE", 0),
            "sector": info.get("sector", ""),
            "industry": info.get("industry", ""),
            "divYield": round(info.get("dividendYield") or info.get("trailingAnnualDividendYield") or 0, 2),
            "divRate": info.get("dividendRate") or info.get("trailingAnnualDividendRate", 0),
            "beta": info.get("beta", 0),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow", 0),
            "targetMeanPrice": info.get("targetMeanPrice", 0),
        }

        # Calculate day change %
        price = data["price"]
        prev = data["previousClose"]
        if prev and prev > 0:
            data["changePercent"] = round((price - prev) / prev * 100, 2)
        else:
            data["changePercent"] = 0

        cache_set(f"yf_{ticker}", data)
        return data

    except Exception as e:
        print(f"[yfinance] Error fetching {ticker}: {e}")
        # Return stale cache if available
        with _cache_lock:
            entry = _cache.get(f"yf_{ticker}")
            if entry:
                return entry["data"]
        return {"price": 0, "previousClose": 0, "name": ticker, "changePercent": 0}


def fetch_all_quotes(tickers):
    """Fetch quotes for a list of tickers."""
    results = {}
    for ticker in tickers:
        results[ticker] = fetch_ticker_data(ticker)
    return results


def fetch_dividends(ticker):
    """Fetch dividend history for a ticker."""
    cached = cache_get(f"divs_{ticker}")
    if cached is not None:
        return cached

    try:
        t = yf.Ticker(ticker)
        divs = t.dividends  # pandas Series indexed by date
        result = []
        for date, amount in divs.items():
            result.append({
                "date": date.strftime("%Y-%m-%d"),
                "dividend": float(amount),
            })
        cache_set(f"divs_{ticker}", result)
        return result
    except Exception as e:
        print(f"[yfinance] Error fetching dividends for {ticker}: {e}")
        return []


# ── Routes ──────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory("static", "dashboard.html")


@app.route("/api/portfolio")
def api_portfolio():
    """Main endpoint: returns enriched portfolio data with live prices."""
    portfolio = load_portfolio()
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
        invt_score = iv_data.get("invtScore", 0) or 0
        dist_from_iv = ((price - intrinsic_value) / intrinsic_value) if intrinsic_value > 0 else 0
        dist_from_avg = ((price - avg_cost) / avg_cost) if avg_cost > 0 else 0

        # IV Signal
        if intrinsic_value > 0:
            if dist_from_iv > 0.50:
                iv_signal = "Overrated"
            elif dist_from_iv > 0.20:
                iv_signal = "Expensive"
            elif dist_from_iv < -0.05:
                iv_signal = "Strong Buy"
            elif dist_from_iv < 0.05:
                iv_signal = "Buy"
            else:
                iv_signal = "Hold"
        else:
            iv_signal = ""

        # Avg Cost Signal
        if dist_from_avg > 0.50:
            avg_cost_signal = "Overrated"
        elif dist_from_avg > 0.20:
            avg_cost_signal = "Expensive"
        elif dist_from_avg < -0.05:
            avg_cost_signal = "Strong Buy"
        elif dist_from_avg < 0.05:
            avg_cost_signal = "Buy"
        else:
            avg_cost_signal = "Hold"

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
            "invtScore": round(invt_score, 2),
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
        ret_pct = pos["returnPercent"]
        if ret_pct > 50:
            pos["signal"] = "Overrated"
        elif ret_pct > 20:
            pos["signal"] = "Expensive"
        elif ret_pct < -5:
            pos["signal"] = "Strong Buy"
        elif ret_pct < 5:
            pos["signal"] = "Buy"
        else:
            pos["signal"] = "Hold"

    # Percent of total dividend income
    for pos in enriched:
        pos["pctOfTotalIncome"] = round((pos["annualDivIncome"] / total_annual_div_income * 100) if total_annual_div_income > 0 else 0, 2)

    # Goals array
    raw_goals = portfolio.get("goals", {})
    goals_array = []
    if raw_goals.get("portfolioTarget"):
        goals_array.append({"name": f"${raw_goals['portfolioTarget']:,} Portfolio Goal", "current": round(total_market_value, 2), "target": raw_goals["portfolioTarget"]})
    if raw_goals.get("dividendTarget"):
        goals_array.append({"name": f"${raw_goals['dividendTarget']:,} Annual Dividend Goal", "current": 0, "target": raw_goals["dividendTarget"]})
    if raw_goals.get("maxHoldings"):
        goals_array.append({"name": f"Diversification ({raw_goals['maxHoldings']} Holdings Max)", "current": len(enriched), "target": raw_goals["maxHoldings"]})

    day_change_pct_total = round((total_day_change / (total_market_value - total_day_change) * 100) if (total_market_value - total_day_change) > 0 else 0, 2)

    # Portfolio-level dividend metrics
    cash_weight = round((cash / total_portfolio * 100) if total_portfolio > 0 else 0, 2)
    portfolio_div_yield = round((total_annual_div_income / total_market_value * 100) if total_market_value > 0 else 0, 2)
    portfolio_yoc = round((total_annual_div_income / total_cost_basis * 100) if total_cost_basis > 0 else 0, 2)
    lifetime_divs = round(sum(total_divs_received.values()), 2)

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
        },
        "allocations": {
            "category": cat_alloc,
            "sector": sec_alloc,
            "securityType": type_alloc,
        },
        "targets": portfolio.get("targets", {}),
        "goals": goals_array,
        "strategy": portfolio.get("strategy", []),
        "lastUpdated": datetime.now().isoformat(),
    })


@app.route("/api/watchlist")
def api_watchlist():
    """Watchlist with live quotes."""
    portfolio = load_portfolio()
    wl = portfolio.get("watchlist", [])
    tickers = [w["ticker"] if isinstance(w, dict) else w for w in wl]
    priorities = {(w["ticker"] if isinstance(w, dict) else w): (w.get("priority", "Low") if isinstance(w, dict) else "Low") for w in wl}

    quotes = fetch_all_quotes(tickers)

    result = []
    for ticker in tickers:
        q = quotes.get(ticker, {})
        price = q.get("price", 0)
        prev_close = q.get("previousClose", price)
        target_price = q.get("targetMeanPrice", 0)
        dist_pct = round(((price - target_price) / target_price * 100) if target_price > 0 else 0, 2)
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

        result.append({
            "ticker": ticker,
            "company": q.get("name", ticker),
            "name": q.get("name", ticker),
            "price": round(price, 2),
            "intrinsicValue": round(target_price, 2),
            "iv": round(target_price, 2),
            "pe": pe,
            "eps": eps_val,
            "marketCap": q.get("marketCap", 0),
            "priority": priorities.get(ticker, "Low"),
            "distance": dist_pct,
            "dist": dist_pct,
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


@app.route("/api/dividends")
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


@app.route("/api/quote/<ticker>")
def api_quote(ticker):
    """Single ticker quote."""
    data = fetch_ticker_data(ticker.upper())
    if data and data.get("price", 0) > 0:
        return jsonify(data)
    return jsonify({"error": "Not found"}), 404


# ── CRUD Endpoints for Inline Editing ───────────────────────────────────
@app.route("/api/position/update", methods=["POST"])
def api_position_update():
    """Update a field on a position. Body: {ticker, field, value}"""
    body = request.get_json()
    ticker = body.get("ticker")
    field = body.get("field")
    value = body.get("value")

    if not ticker or not field:
        return jsonify({"error": "ticker and field required"}), 400

    allowed_fields = {"shares", "avgCost", "category", "sector", "secType"}
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


@app.route("/api/position/add", methods=["POST"])
def api_position_add():
    """Add a new position. Body: {ticker, shares, avgCost, category, sector, secType}"""
    body = request.get_json()
    ticker = body.get("ticker", "").upper().strip()
    if not ticker:
        return jsonify({"error": "ticker required"}), 400

    portfolio = load_portfolio()

    # Check for duplicates
    for p in portfolio["positions"]:
        if p["ticker"] == ticker:
            return jsonify({"error": f"'{ticker}' already exists"}), 400

    new_pos = {
        "ticker": ticker,
        "shares": float(body.get("shares", 0)),
        "avgCost": float(body.get("avgCost", 0)),
        "category": body.get("category", "Growth"),
        "sector": body.get("sector", ""),
        "secType": body.get("secType", "Stocks"),
    }
    portfolio["positions"].append(new_pos)
    save_portfolio(portfolio)
    return jsonify({"ok": True, "position": new_pos})


@app.route("/api/position/delete", methods=["POST"])
def api_position_delete():
    """Delete a position. Body: {ticker}"""
    body = request.get_json()
    ticker = body.get("ticker", "").upper().strip()
    if not ticker:
        return jsonify({"error": "ticker required"}), 400

    portfolio = load_portfolio()
    original_len = len(portfolio["positions"])
    portfolio["positions"] = [p for p in portfolio["positions"] if p["ticker"] != ticker]

    if len(portfolio["positions"]) == original_len:
        return jsonify({"error": f"'{ticker}' not found"}), 404

    save_portfolio(portfolio)
    return jsonify({"ok": True})


@app.route("/api/watchlist/add", methods=["POST"])
def api_watchlist_add():
    """Add to watchlist. Body: {ticker, priority}"""
    body = request.get_json()
    ticker = body.get("ticker", "").upper().strip()
    if not ticker:
        return jsonify({"error": "ticker required"}), 400

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


@app.route("/api/watchlist/delete", methods=["POST"])
def api_watchlist_delete():
    """Remove from watchlist. Body: {ticker}"""
    body = request.get_json()
    ticker = body.get("ticker", "").upper().strip()
    if not ticker:
        return jsonify({"error": "ticker required"}), 400

    portfolio = load_portfolio()
    original = portfolio.get("watchlist", [])
    portfolio["watchlist"] = [w for w in original if (w["ticker"] if isinstance(w, dict) else w) != ticker]

    if len(portfolio["watchlist"]) == len(original):
        return jsonify({"error": f"'{ticker}' not on watchlist"}), 404

    save_portfolio(portfolio)
    return jsonify({"ok": True})


@app.route("/api/watchlist/update", methods=["POST"])
def api_watchlist_update():
    """Update watchlist item priority. Body: {ticker, priority}"""
    body = request.get_json()
    ticker = body.get("ticker", "").upper().strip()
    priority = body.get("priority", "Low")

    portfolio = load_portfolio()
    for w in portfolio.get("watchlist", []):
        if isinstance(w, dict) and w["ticker"] == ticker:
            w["priority"] = priority
            save_portfolio(portfolio)
            return jsonify({"ok": True})

    return jsonify({"error": f"'{ticker}' not on watchlist"}), 404


@app.route("/api/cash/update", methods=["POST"])
def api_cash_update():
    """Update cash balance. Body: {cash}"""
    body = request.get_json()
    portfolio = load_portfolio()
    portfolio["cash"] = float(body.get("cash", 0))
    save_portfolio(portfolio)
    return jsonify({"ok": True, "cash": portfolio["cash"]})


@app.route("/api/goals/update", methods=["POST"])
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


# ── Generic CRUD helper ─────────────────────────────────────────────────
def crud_list(section):
    """GET: return a list section from portfolio.json."""
    portfolio = load_portfolio()
    return jsonify({section: portfolio.get(section, []), "lastUpdated": datetime.now().isoformat()})

def crud_add(section, item):
    """Add an item to a list section."""
    portfolio = load_portfolio()
    portfolio.setdefault(section, []).append(item)
    save_portfolio(portfolio)
    return jsonify({"ok": True, "item": item})

def crud_update(section, index, updates):
    """Update an item at index in a list section."""
    portfolio = load_portfolio()
    items = portfolio.get(section, [])
    if 0 <= index < len(items):
        items[index].update(updates)
        save_portfolio(portfolio)
        return jsonify({"ok": True, "item": items[index]})
    return jsonify({"error": "Index out of range"}), 404

def crud_delete(section, index):
    """Delete an item at index in a list section."""
    portfolio = load_portfolio()
    items = portfolio.get(section, [])
    if 0 <= index < len(items):
        removed = items.pop(index)
        save_portfolio(portfolio)
        return jsonify({"ok": True, "removed": removed})
    return jsonify({"error": "Index out of range"}), 404

def crud_replace(section, data):
    """Replace entire list section."""
    portfolio = load_portfolio()
    portfolio[section] = data
    save_portfolio(portfolio)
    return jsonify({"ok": True})


# ── Sold Positions ──────────────────────────────────────────────────────
@app.route("/api/sold-positions")
def api_sold_positions():
    return crud_list("soldPositions")

@app.route("/api/sold-positions/add", methods=["POST"])
def api_sold_positions_add():
    b = request.get_json()
    item = {
        "ticker": b.get("ticker", "").upper().strip(),
        "shares": float(b.get("shares", 0)),
        "buyDate": b.get("buyDate", ""),
        "sellDate": b.get("sellDate", ""),
        "avgCost": float(b.get("avgCost", 0)),
        "sellPrice": float(b.get("sellPrice", 0)),
        "category": b.get("category", ""),
        "notes": b.get("notes", ""),
    }
    item["gain"] = round((item["sellPrice"] - item["avgCost"]) * item["shares"], 2)
    item["gainPct"] = round(((item["sellPrice"] - item["avgCost"]) / item["avgCost"] * 100) if item["avgCost"] > 0 else 0, 2)
    return crud_add("soldPositions", item)

@app.route("/api/sold-positions/update", methods=["POST"])
def api_sold_positions_update():
    b = request.get_json()
    return crud_update("soldPositions", int(b.get("index", -1)), b.get("updates", {}))

@app.route("/api/sold-positions/delete", methods=["POST"])
def api_sold_positions_delete():
    b = request.get_json()
    return crud_delete("soldPositions", int(b.get("index", -1)))


# ── Dividend Log ────────────────────────────────────────────────────────
@app.route("/api/dividend-log")
def api_dividend_log():
    """GET: Returns full dividendLog array plus the list of active tickers from positions."""
    portfolio = load_portfolio()
    dividend_log = portfolio.get("dividendLog", [])
    
    # Get active tickers from positions
    positions = portfolio.get("positions", [])
    active_tickers = [p.get("ticker") for p in positions if p.get("ticker")]
    
    return jsonify({
        "dividendLog": dividend_log,
        "activeTickers": active_tickers,
        "lastUpdated": datetime.now().isoformat()
    })

@app.route("/api/dividend-log/update", methods=["POST"])
def api_dividend_log_update():
    """POST: Updates a specific cell in dividendLog: {year, month, ticker, value}."""
    b = request.get_json()
    year = b.get("year")
    month = b.get("month")
    ticker = b.get("ticker")
    value = float(b.get("value", 0))
    
    portfolio = load_portfolio()
    dividend_log = portfolio.get("dividendLog", [])
    
    # Find the matching entry
    entry = None
    for item in dividend_log:
        if item.get("year") == year and item.get("month") == month:
            entry = item
            break
    
    if not entry:
        return jsonify({"error": "Entry not found"}), 404
    
    # Update the ticker value
    if ticker in entry:
        entry[ticker] = value
    else:
        return jsonify({"error": f"Ticker {ticker} not found in entry"}), 404
    
    # Recalculate total for that month
    total = 0
    ticker_list = ["GOOGL", "MSFT", "DIS", "TGT", "SBUX", "JPM", "KO", "O", "VICI", "UNH", "VGT", "VOO", "VTI", "SCHD", "VIG", "VXUS", "BND"]
    for t in ticker_list:
        total += entry.get(t, 0)
    total += entry.get("cashInterest", 0)
    entry["total"] = round(total, 2)
    
    save_portfolio(portfolio)
    return jsonify({"ok": True, "entry": entry})

@app.route("/api/dividend-log/add-year", methods=["POST"])
def api_dividend_log_add_year():
    """POST: Adds a new year (12 months of empty entries): {year}."""
    b = request.get_json()
    year = b.get("year")
    
    if not year:
        return jsonify({"error": "Year is required"}), 400
    
    portfolio = load_portfolio()
    dividend_log = portfolio.get("dividendLog", [])
    
    # Check if year already exists
    months_in_year = [item for item in dividend_log if item.get("year") == year]
    if len(months_in_year) > 0:
        return jsonify({"error": f"Year {year} already exists"}), 400
    
    # Add 12 months for the new year
    month_names = ["January", "February", "March", "April", "May", "June", 
                   "July", "August", "September", "October", "November", "December"]
    ticker_list = ["GOOGL", "MSFT", "DIS", "TGT", "SBUX", "JPM", "KO", "O", "VICI", "UNH", "VGT", "VOO", "VTI", "SCHD", "VIG", "VXUS", "BND"]
    
    for month_name in month_names:
        entry = {"year": year, "month": month_name}
        for ticker in ticker_list:
            entry[ticker] = 0
        entry["cashInterest"] = 0.0
        entry["total"] = 0.0
        dividend_log.append(entry)
    
    portfolio["dividendLog"] = dividend_log
    save_portfolio(portfolio)
    return jsonify({"ok": True, "year": year, "monthsAdded": 12})


# ── Monthly Data ────────────────────────────────────────────────────────
@app.route("/api/monthly-data")
def api_monthly_data():
    """GET: Returns full monthlyData array. For each month, compute dividendIncome from dividendLog."""
    portfolio = load_portfolio()
    monthly_data = portfolio.get("monthlyData", [])
    dividend_log = portfolio.get("dividendLog", [])
    
    # Compute dividendIncome from dividendLog for each month
    for month_entry in monthly_data:
        year = month_entry.get("year")
        month_raw = month_entry.get("month", "")
        # monthlyData has "January 24", dividendLog has "January" — extract just month name
        month_name = month_raw.split(" ")[0] if month_raw else ""

        # Find matching dividend log entry by year + month name
        dividend_total = 0.0
        for div_entry in dividend_log:
            if div_entry.get("year") == year and div_entry.get("month") == month_name:
                dividend_total = div_entry.get("total", 0.0)
                break

        month_entry["dividendIncome"] = round(dividend_total, 2)
    
    # Build monthly income distribution matrix: months x years
    month_names = ["January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"]
    now = datetime.now()
    current_year = now.year
    current_month_idx = now.month  # 1-based
    years = sorted(set(e.get("year") for e in monthly_data if e.get("year")))
    income_matrix = []
    for m_idx, m_name in enumerate(month_names, 1):
        row = {"month": m_name}
        prev_val = None
        for y in years:
            val = 0.0
            for e in monthly_data:
                if e.get("year") == y and e.get("month", "").startswith(m_name):
                    val = e.get("dividendIncome", 0.0)
                    break
            row[str(y)] = round(val, 2)
            # Only compute YOY if this month has already occurred in year y
            month_has_passed = y < current_year or (y == current_year and m_idx <= current_month_idx)
            if prev_val is not None and prev_val > 0 and month_has_passed:
                row[f"yoy_{y}"] = round((val - prev_val) / prev_val * 100, 1)
            prev_val = val
        income_matrix.append(row)

    # Yearly totals row
    totals = {"month": "Total"}
    prev_total = None
    for y in years:
        total = sum(r[str(y)] for r in income_matrix)
        totals[str(y)] = round(total, 2)
        if prev_total is not None and prev_total > 0 and y <= current_year:
            totals[f"yoy_{y}"] = round((total - prev_total) / prev_total * 100, 1)
        prev_total = total
    income_matrix.append(totals)

    return jsonify({
        "monthlyData": monthly_data,
        "incomeDistribution": income_matrix,
        "years": years,
        "lastUpdated": datetime.now().isoformat()
    })

@app.route("/api/monthly-data/update", methods=["POST"])
def api_monthly_data_update():
    """POST: Updates a specific cell: {index, field, value}. Only portfolioValue, contributions, accumulatedInvestment are editable."""
    b = request.get_json()
    index = int(b.get("index", -1))
    field = b.get("field")
    value = b.get("value")
    
    editable_fields = ["portfolioValue", "contributions", "accumulatedInvestment"]
    
    if field not in editable_fields:
        return jsonify({"error": f"Field {field} is not editable"}), 400
    
    portfolio = load_portfolio()
    monthly_data = portfolio.get("monthlyData", [])
    
    if not (0 <= index < len(monthly_data)):
        return jsonify({"error": "Index out of range"}), 404
    
    entry = monthly_data[index]
    entry[field] = float(value)
    
    # Recalculate totalReturn and totalReturnPct
    accumulated = entry.get("accumulatedInvestment", 0)
    portfolio_value = entry.get("portfolioValue", 0)
    
    entry["totalReturn"] = round(portfolio_value - accumulated, 2)
    
    if accumulated > 0:
        entry["totalReturnPct"] = round(((portfolio_value - accumulated) / accumulated) * 100, 2)
    else:
        entry["totalReturnPct"] = 0
    
    save_portfolio(portfolio)
    return jsonify({"ok": True, "entry": entry})


# ── Annual Data (computed from monthly and dividend log) ─────────────────────────────────
@app.route("/api/annual-data")
def api_annual_data():
    """GET: Computes annual summary from monthlyData and dividendLog."""
    portfolio = load_portfolio()
    monthly_data = portfolio.get("monthlyData", [])
    dividend_log = portfolio.get("dividendLog", [])
    existing_annual = portfolio.get("annualData", [])
    
    # Build a map of existing sp500YieldPct by year
    sp500_map = {}
    for item in existing_annual:
        year = item.get("year")
        sp500_yield = item.get("sp500YieldPct", 0)
        if year:
            sp500_map[str(year)] = sp500_yield
    
    # Group monthly data by year
    annual_by_year = {}
    for month_entry in monthly_data:
        year = month_entry.get("year")
        if not year:
            continue
        
        year_str = str(year)
        if year_str not in annual_by_year:
            annual_by_year[year_str] = []
        annual_by_year[year_str].append(month_entry)
    
    # Compute annual summaries
    result = []
    for year_str in sorted(annual_by_year.keys()):
        months = annual_by_year[year_str]
        
        # portfolioValue = last non-zero portfolioValue in that year
        portfolio_value = 0
        for month_entry in reversed(months):
            pv = month_entry.get("portfolioValue", 0)
            if pv != 0:
                portfolio_value = pv
                break
        
        # annualContributions = sum of contributions
        annual_contributions = sum(m.get("contributions", 0) for m in months)
        
        # dividendIncome = sum of dividendIncome from dividendLog for that year
        dividend_income = 0.0
        for div_entry in dividend_log:
            if div_entry.get("year") == int(year_str):
                dividend_income += div_entry.get("total", 0)
        
        # accumulatedInvestment of last month in that year
        last_accumulated = 0
        if months:
            last_accumulated = months[-1].get("accumulatedInvestment", 0)
        
        # totalReturn = portfolioValue - accumulatedInvestment
        total_return = portfolio_value - last_accumulated
        
        # totalReturnPct = totalReturn / accumulatedInvestment (as decimal, e.g. 0.06)
        if last_accumulated > 0:
            total_return_pct = total_return / last_accumulated
        else:
            total_return_pct = 0

        # Get sp500YieldPct from existing data
        sp500_yield = sp500_map.get(year_str, 0)

        annual_entry = {
            "year": year_str,
            "portfolioValue": round(portfolio_value, 2),
            "annualContributions": round(annual_contributions, 2),
            "dividendIncome": round(dividend_income, 2),
            "totalReturn": round(total_return, 2),
            "totalReturnPct": round(total_return_pct, 6),
            "dividendYield": round(dividend_income / portfolio_value if portfolio_value > 0 else 0, 6),
            "portfolioYieldPct": round(total_return_pct, 6),
            "sp500YieldPct": sp500_yield
        }
        
        result.append(annual_entry)
    
    return jsonify({"annualData": result, "lastUpdated": datetime.now().isoformat()})


# ── My Lab (Multi-Portfolio) ──────────────────────────────────────────────────
@app.route("/api/my-lab")
def api_my_lab():
    portfolio = load_portfolio()
    lab = portfolio.get("myLab", [])
    research = portfolio.get("labResearch", [])
    return jsonify({"myLab": lab, "labResearch": research, "lastUpdated": datetime.now().isoformat()})

@app.route("/api/my-lab/research", methods=["POST"])
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

@app.route("/api/my-lab/add-portfolio", methods=["POST"])
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

@app.route("/api/my-lab/add-holding", methods=["POST"])
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

@app.route("/api/my-lab/delete-holding", methods=["POST"])
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

@app.route("/api/my-lab/update-portfolio", methods=["POST"])
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


# ── Intrinsic Values ───────────────────────────────────────────────────
@app.route("/api/intrinsic-values")
def api_intrinsic_values():
    return crud_list("intrinsicValues")

@app.route("/api/intrinsic-values/add", methods=["POST"])
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

@app.route("/api/intrinsic-values/update", methods=["POST"])
def api_intrinsic_values_update():
    b = request.get_json()
    return crud_update("intrinsicValues", int(b.get("index", -1)), b.get("updates", {}))

@app.route("/api/intrinsic-values/delete", methods=["POST"])
def api_intrinsic_values_delete():
    b = request.get_json()
    return crud_delete("intrinsicValues", int(b.get("index", -1)))


# ── Super Investor Buys ────────────────────────────────────────────────
@app.route("/api/super-investor-buys")
def api_super_investor_buys():
    return crud_list("superInvestorBuys")

@app.route("/api/super-investor-buys/add", methods=["POST"])
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

@app.route("/api/super-investor-buys/update", methods=["POST"])
def api_super_investor_buys_update():
    b = request.get_json()
    return crud_update("superInvestorBuys", int(b.get("index", -1)), b.get("updates", {}))

@app.route("/api/super-investor-buys/delete", methods=["POST"])
def api_super_investor_buys_delete():
    b = request.get_json()
    return crud_delete("superInvestorBuys", int(b.get("index", -1)))


# ── Projections & Risk Scenarios ────────────────────────────────────────
@app.route("/api/projections")
def api_projections():
    portfolio = load_portfolio()
    proj = portfolio.get("projections", {})
    scenarios = portfolio.get("riskScenarios", [])
    return jsonify({"projections": proj, "riskScenarios": scenarios, "lastUpdated": datetime.now().isoformat()})

@app.route("/api/projections/update", methods=["POST"])
def api_projections_update():
    b = request.get_json()
    portfolio = load_portfolio()
    proj = portfolio.get("projections", {})
    for key in ["startingValue", "monthlyContribution", "expectedReturnPct", "years", "inflationPct", "dividendYieldPct"]:
        if key in b:
            proj[key] = float(b[key])
    portfolio["projections"] = proj
    save_portfolio(portfolio)
    return jsonify({"ok": True, "projections": proj})

@app.route("/api/risk-scenarios/update", methods=["POST"])
def api_risk_scenarios_update():
    b = request.get_json()
    portfolio = load_portfolio()
    portfolio["riskScenarios"] = b.get("scenarios", [])
    save_portfolio(portfolio)
    return jsonify({"ok": True})


# ── Stock Analyzer ──────────────────────────────────────────────────────
@app.route("/api/stock-analyzer/<ticker>")
def api_stock_analyzer(ticker):
    """Deep analysis of a single stock using yfinance."""
    ticker = ticker.upper().strip()
    cached = cache_get(f"analyzer_{ticker}")
    if cached:
        return jsonify(cached)

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        # Financials
        income = {}
        try:
            inc_stmt = t.income_stmt
            if inc_stmt is not None and not inc_stmt.empty:
                for col in inc_stmt.columns[:4]:
                    year = str(col.year) if hasattr(col, 'year') else str(col)[:4]
                    income[year] = {}
                    for row in inc_stmt.index:
                        val = inc_stmt.loc[row, col]
                        income[year][row] = float(val) if val == val else 0
        except Exception:
            pass

        balance = {}
        try:
            bal_sheet = t.balance_sheet
            if bal_sheet is not None and not bal_sheet.empty:
                for col in bal_sheet.columns[:4]:
                    year = str(col.year) if hasattr(col, 'year') else str(col)[:4]
                    balance[year] = {}
                    for row in bal_sheet.index:
                        val = bal_sheet.loc[row, col]
                        balance[year][row] = float(val) if val == val else 0
        except Exception:
            pass

        cashflow = {}
        try:
            cf_stmt = t.cashflow
            if cf_stmt is not None and not cf_stmt.empty:
                for col in cf_stmt.columns[:4]:
                    year = str(col.year) if hasattr(col, 'year') else str(col)[:4]
                    cashflow[year] = {}
                    for row in cf_stmt.index:
                        val = cf_stmt.loc[row, col]
                        cashflow[year][row] = float(val) if val == val else 0
        except Exception:
            pass

        # Key ratios
        price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        result = {
            "ticker": ticker,
            "name": info.get("longName", ticker),
            "sector": info.get("sector", ""),
            "industry": info.get("industry", ""),
            "price": price,
            "marketCap": info.get("marketCap", 0),
            "enterpriseValue": info.get("enterpriseValue", 0),
            "trailingPE": info.get("trailingPE", 0),
            "forwardPE": info.get("forwardPE", 0),
            "pegRatio": info.get("pegRatio", 0),
            "priceToBook": info.get("priceToBook", 0),
            "priceToSales": info.get("priceToSalesTrailing12Months", 0),
            "evToEbitda": info.get("enterpriseToEbitda", 0),
            "evToRevenue": info.get("enterpriseToRevenue", 0),
            "profitMargin": round((info.get("profitMargins") or 0) * 100, 2),
            "operatingMargin": round((info.get("operatingMargins") or 0) * 100, 2),
            "grossMargin": round((info.get("grossMargins") or 0) * 100, 2),
            "returnOnEquity": round((info.get("returnOnEquity") or 0) * 100, 2),
            "returnOnAssets": round((info.get("returnOnAssets") or 0) * 100, 2),
            "debtToEquity": info.get("debtToEquity", 0),
            "currentRatio": info.get("currentRatio", 0),
            "quickRatio": info.get("quickRatio", 0),
            "beta": info.get("beta", 0),
            "dividendYield": round(info.get("dividendYield") or 0, 2),
            "dividendRate": info.get("dividendRate", 0),
            "payoutRatio": round((info.get("payoutRatio") or 0) * 100, 2),
            "fiveYearAvgDivYield": info.get("fiveYearAvgDividendYield", 0),
            "revenueGrowth": round((info.get("revenueGrowth") or 0) * 100, 2),
            "earningsGrowth": round((info.get("earningsGrowth") or 0) * 100, 2),
            "targetMeanPrice": info.get("targetMeanPrice", 0),
            "targetHighPrice": info.get("targetHighPrice", 0),
            "targetLowPrice": info.get("targetLowPrice", 0),
            "recommendationKey": info.get("recommendationKey", ""),
            "numberOfAnalysts": info.get("numberOfAnalystOpinions", 0),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow", 0),
            "fiftyDayAvg": info.get("fiftyDayAverage", 0),
            "twoHundredDayAvg": info.get("twoHundredDayAverage", 0),
            "sharesOutstanding": info.get("sharesOutstanding", 0),
            "floatShares": info.get("floatShares", 0),
            "shortRatio": info.get("shortRatio", 0),
            "bookValue": info.get("bookValue", 0),
            "earningsPerShare": info.get("trailingEps", 0),
            "forwardEps": info.get("forwardEps", 0),
            "revenuePerShare": info.get("revenuePerShare", 0),
            "totalRevenue": info.get("totalRevenue", 0),
            "totalDebt": info.get("totalDebt", 0),
            "totalCash": info.get("totalCash", 0),
            "freeCashflow": info.get("freeCashflow", 0),
            "operatingCashflow": info.get("operatingCashflow", 0),
            "income": income,
            "balance": balance,
            "cashflow": cashflow,
            "lastUpdated": datetime.now().isoformat(),
        }

        cache_set(f"analyzer_{ticker}", result)
        return jsonify(result)

    except Exception as e:
        print(f"[Analyzer] Error for {ticker}: {e}")
        return jsonify({"error": str(e)}), 500


# ── Salary & Retirement ────────────────────────────────────────────────
@app.route("/api/salary")
def api_salary():
    portfolio = load_portfolio()
    return jsonify({
        "salary": portfolio.get("salary", {}),
        "costOfLiving": portfolio.get("costOfLiving", []),
        "lastUpdated": datetime.now().isoformat(),
    })

@app.route("/api/salary/update", methods=["POST"])
def api_salary_update():
    b = request.get_json()
    portfolio = load_portfolio()
    salary = portfolio.get("salary", {})
    for key in ["annualGross", "monthlyNet", "currency", "retirement401k", "employerMatch",
                "employerMatchPct", "iraContribution", "monthlyInvestment"]:
        if key in b:
            salary[key] = float(b[key]) if key != "currency" else b[key]
    portfolio["salary"] = salary
    save_portfolio(portfolio)
    return jsonify({"ok": True, "salary": salary})

@app.route("/api/cost-of-living")
def api_cost_of_living():
    return crud_list("costOfLiving")

@app.route("/api/cost-of-living/add", methods=["POST"])
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

@app.route("/api/cost-of-living/update", methods=["POST"])
def api_cost_of_living_update():
    b = request.get_json()
    return crud_update("costOfLiving", int(b.get("index", -1)), b.get("updates", {}))

@app.route("/api/cost-of-living/delete", methods=["POST"])
def api_cost_of_living_delete():
    b = request.get_json()
    return crud_delete("costOfLiving", int(b.get("index", -1)))


# ── Passive Income Tracking ────────────────────────────────────────────
@app.route("/api/passive-income")
def api_passive_income():
    return crud_list("passiveIncome")

@app.route("/api/passive-income/add", methods=["POST"])
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

@app.route("/api/passive-income/update", methods=["POST"])
def api_passive_income_update():
    b = request.get_json()
    return crud_update("passiveIncome", int(b.get("index", -1)), b.get("updates", {}))

@app.route("/api/passive-income/delete", methods=["POST"])
def api_passive_income_delete():
    b = request.get_json()
    return crud_delete("passiveIncome", int(b.get("index", -1)))


# ── Rule 4% ────────────────────────────────────────────────────────────
@app.route("/api/rule4pct")
def api_rule4pct():
    portfolio = load_portfolio()
    return jsonify({
        "rule4Pct": portfolio.get("rule4Pct", {}),
        "lastUpdated": datetime.now().isoformat(),
    })

@app.route("/api/rule4pct/update", methods=["POST"])
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


# ── Historic S&P 500 Data ──────────────────────────────────────────────
def load_historic_data():
    """Load S&P 500 historic data from portfolio or import from Excel."""
    portfolio = load_portfolio()
    historic = portfolio.get("historicData")
    if historic and len(historic) > 50:
        return historic

    # Try importing from Excel
    xlsx_path = os.path.join(DATA_DIR, "Investments Toolkit-v1.0.xlsx")
    if not os.path.exists(xlsx_path):
        return []

    try:
        import openpyxl
        wb = openpyxl.load_workbook(xlsx_path, data_only=True)
        ws = wb["Historic_Data"]
        data = []
        for r in range(2, ws.max_row + 1):
            year = ws.cell(r, 1).value
            if year is None or not isinstance(year, (int, float)) or year < 1900:
                continue
            data.append({
                "year": int(year),
                "avgClosing": ws.cell(r, 2).value or 0,
                "yearOpen": ws.cell(r, 3).value or 0,
                "yearHigh": ws.cell(r, 4).value or 0,
                "yearLow": ws.cell(r, 5).value or 0,
                "yearClose": ws.cell(r, 6).value or 0,
                "annualReturn": ws.cell(r, 7).value or 0,
                "cpi": ws.cell(r, 8).value or 0,
            })
        wb.close()
        # Cache in portfolio
        portfolio["historicData"] = data
        save_portfolio(portfolio)
        return data
    except Exception as e:
        print(f"Error importing historic data: {e}")
        return []


@app.route("/api/historic-data")
def api_historic_data():
    data = load_historic_data()
    return jsonify({
        "historicData": data,
        "lastUpdated": datetime.now().isoformat(),
    })


@app.route("/api/rule4pct/simulate")
def api_rule4pct_simulate():
    """Run Rule 4% historical simulation across all possible starting years."""
    starting_balance = float(request.args.get("balance", 1000000))
    withdrawal_rate = float(request.args.get("rate", 4)) / 100

    historic = load_historic_data()
    if not historic:
        return jsonify({"error": "No historic data available"}), 404

    # Build return/CPI lookup by year
    returns_by_year = {h["year"]: h["annualReturn"] for h in historic}
    cpi_by_year = {h["year"]: h["cpi"] for h in historic}
    all_years = sorted(returns_by_year.keys())
    min_year = all_years[0]
    max_year = all_years[-1]

    results = {}
    for horizon in [20, 30, 40]:
        scenarios = []
        success_count = 0
        total_count = 0

        for start_year in all_years:
            end_year = start_year + horizon - 1
            if end_year > max_year:
                break

            total_count += 1
            balance = starting_balance
            annual_withdrawal = starting_balance * withdrawal_rate
            yearly_data = []
            survived = True

            for yr_offset in range(horizon):
                yr = start_year + yr_offset
                ret = returns_by_year.get(yr, 0)
                cpi = cpi_by_year.get(yr, 0.03)

                # Apply return first, then withdraw
                balance = balance * (1 + ret)
                balance -= annual_withdrawal

                yearly_data.append({
                    "year": yr,
                    "retirementYear": yr_offset + 1,
                    "balance": round(balance, 2),
                    "returnPct": ret,
                    "withdrawalAmount": round(annual_withdrawal, 2),
                    "inflationPct": cpi,
                })

                if balance <= 0:
                    survived = False
                    # Mark remaining years as depleted
                    for remaining in range(yr_offset + 1, horizon):
                        yearly_data.append({
                            "year": start_year + remaining,
                            "retirementYear": remaining + 1,
                            "balance": 0,
                            "returnPct": returns_by_year.get(start_year + remaining, 0),
                            "withdrawalAmount": 0,
                            "inflationPct": cpi_by_year.get(start_year + remaining, 0),
                        })
                    break

                # Adjust withdrawal for inflation
                annual_withdrawal *= (1 + cpi)

            if survived:
                success_count += 1

            scenarios.append({
                "startYear": start_year,
                "endYear": end_year,
                "survived": survived,
                "finalBalance": round(yearly_data[-1]["balance"], 2),
                "data": yearly_data,
            })

        success_rate = round(success_count / total_count * 100, 1) if total_count > 0 else 0
        avg_final = round(sum(s["finalBalance"] for s in scenarios if s["survived"]) / max(success_count, 1), 2)
        worst_scenario = min(scenarios, key=lambda s: s["finalBalance"]) if scenarios else None
        best_scenario = max(scenarios, key=lambda s: s["finalBalance"]) if scenarios else None

        results[str(horizon)] = {
            "horizon": horizon,
            "totalScenarios": total_count,
            "successCount": success_count,
            "failureCount": total_count - success_count,
            "successRate": success_rate,
            "avgFinalBalance": avg_final,
            "worstStartYear": worst_scenario["startYear"] if worst_scenario else None,
            "worstFinalBalance": worst_scenario["finalBalance"] if worst_scenario else None,
            "bestStartYear": best_scenario["startYear"] if best_scenario else None,
            "bestFinalBalance": best_scenario["finalBalance"] if best_scenario else None,
            "scenarios": scenarios,
        }

    return jsonify({
        "startingBalance": starting_balance,
        "withdrawalRate": withdrawal_rate * 100,
        "results": results,
        "lastUpdated": datetime.now().isoformat(),
    })


@app.route("/api/status")
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


# ── Main ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    load_disk_cache()
    print("\n" + "=" * 55)
    print("  InvToolkit — Investment Dashboard")
    print("=" * 55)
    print("  Data source: Yahoo Finance (yfinance)")
    print(f"  Data dir:    {DATA_DIR}")
    print(f"  Portfolio:   {PORTFOLIO_FILE}")
    print(f"  Dashboard:   http://localhost:5050")
    print("=" * 55 + "\n")
    app.run(host="0.0.0.0", port=5050, debug=True)
