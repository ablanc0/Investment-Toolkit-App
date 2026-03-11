"""Dividends Blueprint — sold positions, dividend log, monthly data, annual data, and dividend calendar routes."""

from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request

from services.data_store import load_portfolio, save_portfolio, crud_list, crud_add, crud_update, crud_delete
from services.yfinance_svc import fetch_sp500_annual_returns, fetch_dividends, fetch_dividend_calendar

bp = Blueprint('dividends', __name__)


# ── Sold Positions ──────────────────────────────────────────────────────
@bp.route("/api/sold-positions")
def api_sold_positions():
    return crud_list("soldPositions")

@bp.route("/api/sold-positions/add", methods=["POST"])
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

@bp.route("/api/sold-positions/update", methods=["POST"])
def api_sold_positions_update():
    b = request.get_json()
    return crud_update("soldPositions", int(b.get("index", -1)), b.get("updates", {}))

@bp.route("/api/sold-positions/delete", methods=["POST"])
def api_sold_positions_delete():
    b = request.get_json()
    return crud_delete("soldPositions", int(b.get("index", -1)))


# ── Dividend Log ────────────────────────────────────────────────────────
@bp.route("/api/dividend-log")
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

@bp.route("/api/dividend-log/update", methods=["POST"])
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

@bp.route("/api/dividend-log/add-year", methods=["POST"])
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
@bp.route("/api/monthly-data")
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

@bp.route("/api/monthly-data/update", methods=["POST"])
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
        entry["totalReturnPct"] = round((portfolio_value - accumulated) / accumulated, 6)
    else:
        entry["totalReturnPct"] = 0

    save_portfolio(portfolio)
    return jsonify({"ok": True, "entry": entry})


# ── Annual Data (computed from monthly and dividend log) ─────────────────────────────────
@bp.route("/api/annual-data")
def api_annual_data():
    """GET: Computes annual summary from monthlyData and dividendLog."""
    portfolio = load_portfolio()
    monthly_data = portfolio.get("monthlyData", [])
    dividend_log = portfolio.get("dividendLog", [])
    existing_annual = portfolio.get("annualData", [])

    # Fetch live S&P 500 annual returns from yfinance (returns %, e.g. 23.31)
    # Convert to decimal (0.2331) to match stored format used by frontend
    sp500_live = fetch_sp500_annual_returns()
    sp500_map = {y: round(r / 100, 6) for y, r in sp500_live.items()}

    # Fallback to stored data for any years not covered by live data
    for item in existing_annual:
        year = item.get("year")
        sp500_yield = item.get("sp500YieldPct", 0)
        if year and str(year) not in sp500_map and sp500_yield:
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
    prev_year_end_value = 0
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
        # Fallback for current/partial year: use previous year's end value as baseline
        if last_accumulated > 0:
            total_return_pct = total_return / last_accumulated
        elif prev_year_end_value > 0:
            total_return = portfolio_value - prev_year_end_value - annual_contributions
            total_return_pct = total_return / prev_year_end_value
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
        prev_year_end_value = portfolio_value

    return jsonify({"annualData": result, "lastUpdated": datetime.now().isoformat()})


# ── Dividend Calendar ──────────────────────────────────────────────

def _detect_frequency(div_history):
    """Analyze dividend intervals to detect payment frequency.
    Returns: 'monthly', 'quarterly', 'semi-annual', 'annual', or 'unknown'.
    """
    if len(div_history) < 2:
        return "unknown"

    dates = sorted(datetime.strptime(d["date"], "%Y-%m-%d") for d in div_history)
    # Use last 8 intervals max for recent pattern
    recent = dates[-9:]
    intervals = [(recent[i+1] - recent[i]).days for i in range(len(recent)-1)]
    if not intervals:
        return "unknown"

    avg = sum(intervals) / len(intervals)
    if avg < 45:
        return "monthly"
    elif avg < 135:
        return "quarterly"
    elif avg < 270:
        return "semi-annual"
    else:
        return "annual"


_FREQ_DAYS = {
    "monthly": 30,
    "quarterly": 91,
    "semi-annual": 182,
    "annual": 365,
}


def _project_dividends(ticker, div_history, frequency, shares, months_ahead, declared_info=None):
    """Project future dividend events based on history and frequency.
    Forward-looking only — past dividends live in the dividend log.
    Returns list of event dicts.
    """
    events = []
    today = datetime.now().date()
    horizon = today + timedelta(days=months_ahead * 31)

    # Last known dividend amount
    if not div_history:
        return events
    sorted_divs = sorted(div_history, key=lambda d: d["date"])
    last_div = sorted_divs[-1]
    last_amount = last_div["dividend"]
    last_date = datetime.strptime(last_div["date"], "%Y-%m-%d").date()

    # Declared dates from yfinance calendar override projections
    declared_set = set()
    if declared_info:
        ex_date = declared_info.get("exDate")
        pay_date = declared_info.get("paymentDate")
        # Show if either payment date or ex-date is still in the future
        latest_date = pay_date or ex_date
        if ex_date and latest_date and today < latest_date <= horizon:
            events.append({
                "ticker": ticker,
                "date": (pay_date or ex_date).isoformat(),
                "exDate": ex_date.isoformat(),
                "paymentDate": pay_date.isoformat() if pay_date else None,
                "amount": round(last_amount, 4),
                "shares": shares,
                "income": round(last_amount * shares, 2),
                "status": "declared",
                "frequency": frequency,
            })
            declared_set.add(ex_date)

    # Project forward at detected frequency
    interval = _FREQ_DAYS.get(frequency)
    if not interval:
        return events

    next_date = last_date + timedelta(days=interval)
    while next_date <= horizon:
        if next_date > today and next_date not in declared_set:
            events.append({
                "ticker": ticker,
                "date": next_date.isoformat(),
                "exDate": next_date.isoformat(),
                "paymentDate": None,
                "amount": round(last_amount, 4),
                "shares": shares,
                "income": round(last_amount * shares, 2),
                "status": "estimated",
                "frequency": frequency,
            })
        next_date += timedelta(days=interval)

    return events


def _get_declared_info(ticker):
    """Fetch next ex-dividend and payment dates from yfinance calendar.
    Returns dict with exDate and paymentDate, or None.
    """
    try:
        cal = fetch_dividend_calendar(ticker)
        if not cal:
            return None

        def _parse_date(val):
            if val is None:
                return None
            from datetime import date as _date
            if isinstance(val, _date):
                return val
            if hasattr(val, "date"):
                return val.date() if callable(val.date) else val
            if isinstance(val, str):
                return datetime.strptime(val, "%Y-%m-%d").date()
            return None

        ex_date = _parse_date(cal.get("Ex-Dividend Date"))
        pay_date = _parse_date(cal.get("Dividend Date"))
        if not ex_date:
            return None
        return {"exDate": ex_date, "paymentDate": pay_date}
    except Exception:
        return None


@bp.route("/api/dividend-calendar")
def api_dividend_calendar():
    """GET: Returns dividend events (paid, declared, estimated) for calendar view."""
    months = int(request.args.get("months", 12))
    portfolio = load_portfolio()
    positions = portfolio.get("positions", [])

    all_events = []
    for pos in positions:
        ticker = pos.get("ticker", "")
        shares = pos.get("shares", 0)
        if not ticker or shares <= 0:
            continue

        # Fetch historical dividends (skip tickers with no history)
        div_history = fetch_dividends(ticker)
        if not div_history:
            continue

        frequency = _detect_frequency(div_history)
        declared = _get_declared_info(ticker)
        events = _project_dividends(ticker, div_history, frequency, shares, months, declared)
        all_events.extend(events)

    # Sort by date
    all_events.sort(key=lambda e: e["date"])

    # Build monthly totals
    monthly_totals = {}
    for ev in all_events:
        month_key = ev["date"][:7]  # "2026-03"
        monthly_totals[month_key] = round(monthly_totals.get(month_key, 0) + ev["income"], 2)

    # Annual estimate (all events are future)
    annual_estimate = sum(ev["income"] for ev in all_events)

    # Next payout
    next_payout = all_events[0] if all_events else None

    return jsonify({
        "events": all_events,
        "summary": {
            "monthlyTotals": monthly_totals,
            "annualEstimate": round(annual_estimate, 2),
            "nextPayout": next_payout,
            "totalEvents": len(all_events),
        },
        "lastUpdated": datetime.now().isoformat(),
    })
