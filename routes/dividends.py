"""Dividends Blueprint — sold positions, dividend log, monthly data, and annual data routes."""

from datetime import datetime
from flask import Blueprint, jsonify, request

from services.data_store import load_portfolio, save_portfolio, crud_list, crud_add, crud_update, crud_delete

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
        entry["totalReturnPct"] = round(((portfolio_value - accumulated) / accumulated) * 100, 2)
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
