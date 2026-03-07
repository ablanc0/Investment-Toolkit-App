"""Analytics — attribution, benchmark, monthly tracker, dividend deep dive."""

import math
from config import DIVIDEND_KINGS, DIVIDEND_ARISTOCRATS


def compute_performance_attribution(enriched_positions):
    """Group position returns by category and sector."""
    def group_by(positions, key):
        groups = {}
        for p in positions:
            name = p.get(key, "Unknown") or "Unknown"
            if name not in groups:
                groups[name] = {"invested": 0, "marketValue": 0, "divIncome": 0}
            groups[name]["invested"] += p.get("costBasis", 0)
            groups[name]["marketValue"] += p.get("marketValue", 0)
            groups[name]["divIncome"] += p.get("annualDivIncome", 0)

        total_mv = sum(g["marketValue"] for g in groups.values())
        result = []
        for name, g in sorted(groups.items(), key=lambda x: -x[1]["marketValue"]):
            ret_val = g["marketValue"] - g["invested"]
            ret_pct = (ret_val / g["invested"] * 100) if g["invested"] > 0 else 0
            weight = (g["marketValue"] / total_mv * 100) if total_mv > 0 else 0
            result.append({
                "name": name,
                "invested": round(g["invested"], 2),
                "marketValue": round(g["marketValue"], 2),
                "returnVal": round(ret_val, 2),
                "returnPct": round(ret_pct, 2),
                "weight": round(weight, 2),
                "divIncome": round(g["divIncome"], 2),
            })
        return result

    return {
        "byCategory": group_by(enriched_positions, "category"),
        "bySector": group_by(enriched_positions, "sector"),
    }


def compute_benchmark_comparison(annual_data, historic_data):
    """Year-by-year portfolio vs S&P 500 comparison."""
    sp500_map = {}
    for h in historic_data:
        year = h.get("year")
        if year:
            sp500_map[str(year)] = h.get("annualReturn", 0)

    result = []
    total_alpha = 0
    for entry in annual_data:
        year = str(entry.get("year", ""))
        port_ret = entry.get("totalReturnPct", 0)
        if isinstance(port_ret, (int, float)) and abs(port_ret) < 1:
            port_ret = port_ret * 100

        sp500_ret = sp500_map.get(year, 0)
        if isinstance(sp500_ret, (int, float)) and abs(sp500_ret) < 1:
            sp500_ret = sp500_ret * 100

        alpha = port_ret - sp500_ret
        total_alpha += alpha

        port_div = entry.get("dividendYield", 0)
        if isinstance(port_div, (int, float)) and abs(port_div) < 0.5:
            port_div = port_div * 100
        sp500_div = entry.get("sp500YieldPct", 0)
        if isinstance(sp500_div, (int, float)) and abs(sp500_div) < 0.5:
            sp500_div = sp500_div * 100

        result.append({
            "year": year,
            "portfolioReturn": round(port_ret, 2),
            "sp500Return": round(sp500_ret, 2),
            "alpha": round(alpha, 2),
            "portfolioDivYield": round(port_div, 2),
            "sp500DivYield": round(sp500_div, 2),
            "yieldAdvantage": round(port_div - sp500_div, 2),
        })

    avg_alpha = round(total_alpha / len(result), 2) if result else 0

    return {
        "years": result,
        "summary": {
            "cumulativeAlpha": round(total_alpha, 2),
            "avgAlpha": avg_alpha,
            "yearsTracked": len(result),
        }
    }


def compute_monthly_tracker_stats(monthly_data):
    """Compute enhanced monthly performance statistics."""
    if len(monthly_data) < 2:
        return {"monthlyReturns": [], "summary": {}}

    monthly_returns = []
    for i in range(1, len(monthly_data)):
        prev = monthly_data[i - 1]
        curr = monthly_data[i]
        prev_val = prev.get("portfolioValue", 0)
        curr_val = curr.get("portfolioValue", 0)
        contrib = curr.get("contributions", 0)
        if prev_val > 0:
            ret = ((curr_val - prev_val - contrib) / prev_val) * 100
        else:
            ret = 0
        label = f"{curr.get('month', '')}".split(" ")[0][:3]
        year = curr.get("year", "")
        monthly_returns.append({
            "month": f"{label} {year}" if year else label,
            "return": round(ret, 2),
            "portfolioValue": curr_val,
            "contributions": contrib,
            "dividendIncome": curr.get("dividendIncome", 0),
        })

    returns_only = [m["return"] for m in monthly_returns]
    positive = [r for r in returns_only if r > 0]
    negative = [r for r in returns_only if r <= 0]
    total_months = len(returns_only)

    # Best/worst
    best_idx = returns_only.index(max(returns_only))
    worst_idx = returns_only.index(min(returns_only))

    # Max drawdown
    peak = 0
    max_dd = 0
    dd_start = ""
    dd_end = ""
    curr_start = ""
    for m in monthly_returns:
        val = m["portfolioValue"]
        if val > peak:
            peak = val
            curr_start = m["month"]
        if peak > 0:
            dd = ((val - peak) / peak) * 100
            if dd < max_dd:
                max_dd = dd
                dd_start = curr_start
                dd_end = m["month"]

    # TWR (chain-linked)
    twr = 1
    for m in monthly_returns:
        twr *= (1 + m["return"] / 100)
    twr = (twr - 1) * 100

    # Totals
    total_contribs = sum(m.get("contributions", 0) for m in monthly_data[1:])
    total_divs = sum(m.get("dividendIncome", 0) for m in monthly_data[1:])
    last_val = monthly_data[-1].get("portfolioValue", 0)
    first_val = monthly_data[0].get("portfolioValue", 0)
    total_market_gains = last_val - first_val - total_contribs

    return {
        "monthlyReturns": monthly_returns,
        "summary": {
            "bestMonth": {"month": monthly_returns[best_idx]["month"], "return": monthly_returns[best_idx]["return"]},
            "worstMonth": {"month": monthly_returns[worst_idx]["month"], "return": monthly_returns[worst_idx]["return"]},
            "avgMonthlyReturn": round(sum(returns_only) / total_months, 2) if total_months else 0,
            "positiveMonths": len(positive),
            "negativeMonths": len(negative),
            "winRate": round(len(positive) / total_months * 100, 1) if total_months else 0,
            "maxDrawdown": round(max_dd, 2),
            "maxDrawdownPeriod": f"{dd_start} - {dd_end}" if dd_start else "",
            "totalContributions": round(total_contribs, 2),
            "totalMarketGains": round(total_market_gains, 2),
            "totalDividends": round(total_divs, 2),
            "timeWeightedReturn": round(twr, 2),
        }
    }


def compute_dividend_deep_dive(enriched_positions, total_annual_div_income):
    """Enhanced dividend analysis per position."""
    result = []
    for p in enriched_positions:
        div_rate = p.get("divRate", 0) or 0
        if div_rate <= 0:
            continue

        ticker = p.get("ticker", "")
        annual_income = p.get("annualDivIncome", 0)
        monthly_income = annual_income / 12
        pct_of_total = (annual_income / total_annual_div_income * 100) if total_annual_div_income > 0 else 0
        div_yield = p.get("divYield", 0) or 0
        yoc = p.get("yieldOnCost", 0) or 0

        # Payout safety
        if div_yield < 2:
            safety = "Safe"
        elif div_yield < 4:
            safety = "Moderate"
        else:
            safety = "Watch"

        # Dividend status
        consec_years = 0
        status = "-"
        if ticker in DIVIDEND_KINGS:
            consec_years = DIVIDEND_KINGS[ticker]
            status = "Dividend King"
        elif ticker in DIVIDEND_ARISTOCRATS:
            consec_years = DIVIDEND_ARISTOCRATS[ticker]
            if consec_years >= 50:
                status = "Dividend King"
            elif consec_years >= 25:
                status = "Dividend Aristocrat"
            elif consec_years >= 10:
                status = "Dividend Achiever"

        # 5-year future value (assuming 5% div growth)
        growth = 0.05
        fv_5yr = sum(annual_income * (1 + growth) ** yr for yr in range(1, 6))

        result.append({
            "ticker": ticker,
            "company": p.get("company", ticker),
            "shares": p.get("shares", 0),
            "divPerShare": round(div_rate, 4),
            "currentYield": round(div_yield, 2),
            "yieldOnCost": round(yoc, 2),
            "annualIncome": round(annual_income, 2),
            "monthlyIncome": round(monthly_income, 2),
            "pctOfTotal": round(pct_of_total, 2),
            "payoutSafety": safety,
            "consecutiveYears": consec_years,
            "dividendStatus": status,
            "futureValue5yr": round(fv_5yr, 2),
        })

    result.sort(key=lambda x: -x["annualIncome"])

    # Totals
    total_annual = sum(r["annualIncome"] for r in result)
    total_monthly = total_annual / 12
    total_fv = sum(r["futureValue5yr"] for r in result)

    return {
        "positions": result,
        "totals": {
            "totalAnnualIncome": round(total_annual, 2),
            "totalMonthlyIncome": round(total_monthly, 2),
            "totalFutureValue5yr": round(total_fv, 2),
            "dividendPayerCount": len(result),
        }
    }
