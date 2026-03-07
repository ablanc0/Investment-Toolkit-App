"""Analytics Blueprint — tax optimization, risk analysis, attribution, benchmark, dividends deep dive."""

from datetime import datetime
from flask import Blueprint, jsonify

from services.data_store import load_portfolio, get_settings
from services.yfinance_svc import fetch_all_quotes
from models.tax_optimization import compute_tax_positions, compute_tax_summary
from models.risk_analysis import (
    compute_sector_concentration, compute_stress_test,
    compute_risk_metrics, compute_correlation_matrix,
)
from models.analytics import (
    compute_performance_attribution, compute_benchmark_comparison,
    compute_monthly_tracker_stats, compute_dividend_deep_dive,
)

bp = Blueprint('analytics', __name__)


def _get_enriched_portfolio():
    """Shared helper: load portfolio, fetch quotes, return enriched positions + summary."""
    portfolio = load_portfolio()
    pos_list = portfolio.get("positions", [])
    tickers = [p["ticker"] for p in pos_list]
    quotes = fetch_all_quotes(tickers)

    # Build IV lookup
    iv_list = portfolio.get("intrinsicValues", [])
    iv_map = {iv.get("ticker", ""): iv for iv in iv_list if iv.get("ticker")}

    # Build total divs received from dividendLog
    div_log = portfolio.get("dividendLog", [])
    total_divs_received = {}
    for entry in div_log:
        for key, val in entry.items():
            if key not in ("year", "month", "cashInterest", "total") and val:
                total_divs_received[key] = total_divs_received.get(key, 0) + float(val or 0)

    enriched = []
    total_mv = 0
    total_cb = 0
    total_div_income = 0

    for p in pos_list:
        ticker = p["ticker"]
        q = quotes.get(ticker, {})
        price = q.get("price", 0)
        shares = p["shares"]
        avg_cost = p["avgCost"]
        cost_basis = shares * avg_cost
        market_value = shares * price
        div_rate = q.get("divRate", 0) or 0
        div_yield = q.get("divYield", 0) or 0
        if div_rate == 0 and div_yield > 0 and price > 0:
            div_rate = round(price * div_yield / 100, 4)
        annual_div = div_rate * shares
        yoc = (div_rate / avg_cost * 100) if avg_cost > 0 else 0
        divs_received = total_divs_received.get(ticker, 0)
        total_return = (market_value - cost_basis) + divs_received
        return_pct = (total_return / cost_basis * 100) if cost_basis > 0 else 0

        total_mv += market_value
        total_cb += cost_basis
        total_div_income += annual_div

        enriched.append({
            "ticker": ticker,
            "company": q.get("name", ticker),
            "shares": shares,
            "avgCost": avg_cost,
            "buyDate": p.get("buyDate", ""),
            "price": round(price, 2),
            "costBasis": round(cost_basis, 2),
            "marketValue": round(market_value, 2),
            "totalReturn": round(total_return, 2),
            "returnPercent": round(return_pct, 2),
            "divRate": div_rate,
            "divYield": div_yield,
            "yieldOnCost": round(yoc, 2),
            "annualDivIncome": round(annual_div, 2),
            "beta": q.get("beta", 1) or 1,
            "sector": p.get("sector", ""),
            "category": p.get("category", ""),
            "secType": p.get("secType", "Stocks"),
        })

    return enriched, portfolio, total_mv, total_div_income


# ── Tax Optimization ──────────────────────────────────────────────────

@bp.route("/api/tax-optimization")
def api_tax_optimization():
    enriched, _, _, _ = _get_enriched_portfolio()
    positions = compute_tax_positions(enriched)
    summary = compute_tax_summary(positions)
    return jsonify({
        "positions": positions,
        "summary": summary,
        "lastUpdated": datetime.now().isoformat(),
    })


# ── Risk Analysis ─────────────────────────────────────────────────────

@bp.route("/api/risk-analysis")
def api_risk_analysis():
    enriched, portfolio, total_mv, _ = _get_enriched_portfolio()
    monthly_data = portfolio.get("monthlyData", [])

    concentration = compute_sector_concentration(enriched, total_mv)
    stress = compute_stress_test(enriched, total_mv)
    metrics = compute_risk_metrics(monthly_data, enriched)

    return jsonify({
        "sectorConcentration": concentration,
        "stressTests": stress,
        "riskMetrics": metrics,
        "totalMarketValue": round(total_mv, 2),
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/risk-analysis/correlation")
def api_risk_correlation():
    from services.yfinance_svc import fetch_historical_prices
    from services.cache import cache_get, cache_set

    portfolio = load_portfolio()
    tickers = [p["ticker"] for p in portfolio.get("positions", [])]
    if not tickers:
        return jsonify({"tickers": [], "matrix": []})

    cache_key = f"correlation_{'_'.join(sorted(tickers))}"
    cached = cache_get(cache_key)
    if cached:
        return jsonify(cached)

    price_data = fetch_historical_prices(tickers)
    # Filter to tickers that have enough data
    valid_tickers = [t for t in tickers if t in price_data and len(price_data[t]) >= 10]
    if len(valid_tickers) < 2:
        return jsonify({"tickers": valid_tickers, "matrix": []})

    result = compute_correlation_matrix(price_data, valid_tickers)
    result["lastUpdated"] = datetime.now().isoformat()
    cache_set(cache_key, result)
    return jsonify(result)


# ── Monthly Tracker ───────────────────────────────────────────────────

@bp.route("/api/monthly-tracker-stats")
def api_monthly_tracker_stats():
    portfolio = load_portfolio()
    monthly_data = portfolio.get("monthlyData", [])
    stats = compute_monthly_tracker_stats(monthly_data)
    return jsonify({"stats": stats, "lastUpdated": datetime.now().isoformat()})


# ── Performance Attribution ───────────────────────────────────────────

@bp.route("/api/performance-attribution")
def api_performance_attribution():
    enriched, _, _, _ = _get_enriched_portfolio()
    attribution = compute_performance_attribution(enriched)
    return jsonify({
        "attribution": attribution,
        "lastUpdated": datetime.now().isoformat(),
    })


# ── Portfolio vs Benchmark ────────────────────────────────────────────

@bp.route("/api/portfolio-benchmark")
def api_portfolio_benchmark():
    portfolio = load_portfolio()
    # Compute annual data (reuse logic from dividends route)
    monthly_data = portfolio.get("monthlyData", [])
    historic_data = portfolio.get("historicData", [])

    # Build simple annual data from monthlyData
    annual_map = {}
    for entry in monthly_data:
        year = entry.get("year")
        if not year:
            continue
        year_str = str(year)
        if year_str not in annual_map:
            annual_map[year_str] = {
                "year": year_str,
                "portfolioValue": 0,
                "totalReturnPct": 0,
                "dividendYield": 0,
                "sp500YieldPct": 0,
            }
        annual_map[year_str]["portfolioValue"] = entry.get("portfolioValue", 0)
        annual_map[year_str]["totalReturnPct"] = entry.get("totalReturnPct", 0)
        if entry.get("dividendIncome"):
            pv = entry.get("portfolioValue", 1)
            annual_map[year_str]["dividendYield"] = entry.get("dividendIncome", 0) / pv * 100 if pv > 0 else 0

    annual_data = sorted(annual_map.values(), key=lambda x: x["year"])
    comparison = compute_benchmark_comparison(annual_data, historic_data)
    return jsonify({
        "benchmark": comparison,
        "lastUpdated": datetime.now().isoformat(),
    })


# ── Dividend Deep Dive ────────────────────────────────────────────────

@bp.route("/api/dividend-deep-dive")
def api_dividend_deep_dive():
    enriched, _, _, total_div_income = _get_enriched_portfolio()
    result = compute_dividend_deep_dive(enriched, total_div_income)
    return jsonify({
        "deepDive": result,
        "lastUpdated": datetime.now().isoformat(),
    })
