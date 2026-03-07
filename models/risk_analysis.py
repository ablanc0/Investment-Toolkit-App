"""Risk Analysis — portfolio risk metrics, stress testing, correlation."""

import math
from config import STRESS_SCENARIOS, CONCENTRATION_THRESHOLDS, RISK_FREE_RATE


def compute_sector_concentration(enriched_positions, total_market_value):
    """Sector concentration risk assessment."""
    sectors = {}
    for p in enriched_positions:
        sec = p.get("sector", "Unknown") or "Unknown"
        sectors[sec] = sectors.get(sec, 0) + p.get("marketValue", 0)

    result = []
    for sec, mv in sorted(sectors.items(), key=lambda x: -x[1]):
        weight = (mv / total_market_value * 100) if total_market_value > 0 else 0
        if weight >= CONCENTRATION_THRESHOLDS["high"]:
            risk_level = "HIGH"
            rec = f"Consider reducing {sec} exposure below {CONCENTRATION_THRESHOLDS['high']}%"
        elif weight >= CONCENTRATION_THRESHOLDS["medium"]:
            risk_level = "MEDIUM"
            rec = f"Monitor {sec} concentration"
        else:
            risk_level = "LOW"
            rec = "Well diversified"
        result.append({
            "sector": sec,
            "marketValue": round(mv, 2),
            "weight": round(weight, 2),
            "riskLevel": risk_level,
            "recommendation": rec,
        })
    return result


def compute_stress_test(enriched_positions, total_market_value, scenarios=None):
    """Stress test portfolio against historical scenarios."""
    if scenarios is None:
        scenarios = STRESS_SCENARIOS

    results = []
    for scenario in scenarios:
        drop_pct = scenario["drop"]
        pos_results = []
        total_loss = 0

        for p in enriched_positions:
            beta = p.get("beta", 1) or 1
            mv = p.get("marketValue", 0)
            adj_drop = beta * drop_pct
            est_loss = mv * adj_drop / 100
            total_loss += est_loss

            abs_loss = abs(est_loss)
            if abs_loss > mv * 0.5:
                priority = "HIGH"
            elif abs_loss > mv * 0.2:
                priority = "MEDIUM"
            else:
                priority = "LOW"

            pos_results.append({
                "ticker": p.get("ticker", ""),
                "beta": round(beta, 2),
                "marketValue": round(mv, 2),
                "adjustedDrop": round(adj_drop, 2),
                "estimatedLoss": round(est_loss, 2),
                "priority": priority,
            })

        pos_results.sort(key=lambda x: x["estimatedLoss"])
        stressed_value = total_market_value + total_loss

        results.append({
            "name": scenario["name"],
            "description": scenario.get("description", ""),
            "drop": drop_pct,
            "totalEstimatedLoss": round(total_loss, 2),
            "stressedValue": round(max(stressed_value, 0), 2),
            "stressedDropPct": round((total_loss / total_market_value * 100) if total_market_value > 0 else 0, 2),
            "positions": pos_results,
        })

    return results


def compute_risk_metrics(monthly_data, enriched_positions):
    """Compute portfolio-level risk metrics from monthly data."""
    monthly_returns = []
    for i in range(1, len(monthly_data)):
        prev_val = monthly_data[i - 1].get("portfolioValue", 0)
        curr_val = monthly_data[i].get("portfolioValue", 0)
        contrib = monthly_data[i].get("contributions", 0)
        if prev_val > 0:
            ret = (curr_val - prev_val - contrib) / prev_val
            monthly_returns.append(ret)

    if len(monthly_returns) < 2:
        return {
            "annualizedReturn": 0, "annualizedVolatility": 0,
            "sharpeRatio": 0, "sortinoRatio": 0,
            "maxDrawdown": 0, "maxDrawdownPeriod": "",
            "portfolioBeta": 0, "monthCount": len(monthly_returns),
        }

    # Annualized return (geometric)
    cum = 1
    for r in monthly_returns:
        cum *= (1 + r)
    n_months = len(monthly_returns)
    ann_return = (cum ** (12 / n_months) - 1) if n_months > 0 else 0

    # Annualized volatility
    mean_r = sum(monthly_returns) / n_months
    variance = sum((r - mean_r) ** 2 for r in monthly_returns) / (n_months - 1)
    std = math.sqrt(variance)
    ann_vol = std * math.sqrt(12)

    # Sharpe ratio
    rf_monthly = (1 + RISK_FREE_RATE) ** (1 / 12) - 1
    sharpe = ((mean_r - rf_monthly) / std * math.sqrt(12)) if std > 0 else 0

    # Sortino ratio (downside deviation)
    downside_returns = [r for r in monthly_returns if r < rf_monthly]
    if downside_returns:
        downside_var = sum((r - rf_monthly) ** 2 for r in downside_returns) / len(downside_returns)
        downside_dev = math.sqrt(downside_var) * math.sqrt(12)
        sortino = ((ann_return - RISK_FREE_RATE) / downside_dev) if downside_dev > 0 else 0
    else:
        sortino = 0

    # Max drawdown
    peak = 0
    max_dd = 0
    dd_start = ""
    dd_end = ""
    current_dd_start = ""
    for i, entry in enumerate(monthly_data):
        val = entry.get("portfolioValue", 0)
        if val > peak:
            peak = val
            current_dd_start = f"{entry.get('month', '')} {entry.get('year', '')}"
        if peak > 0:
            dd = (val - peak) / peak
            if dd < max_dd:
                max_dd = dd
                dd_start = current_dd_start
                dd_end = f"{entry.get('month', '')} {entry.get('year', '')}"

    # Portfolio beta (weighted average)
    total_mv = sum(p.get("marketValue", 0) for p in enriched_positions)
    if total_mv > 0:
        port_beta = sum(
            (p.get("beta", 1) or 1) * p.get("marketValue", 0) / total_mv
            for p in enriched_positions
        )
    else:
        port_beta = 1

    dd_period = f"{dd_start} - {dd_end}".strip(" -") if dd_start else ""

    return {
        "annualizedReturn": round(ann_return * 100, 2),
        "annualizedVolatility": round(ann_vol * 100, 2),
        "sharpeRatio": round(sharpe, 2),
        "sortinoRatio": round(sortino, 2),
        "maxDrawdown": round(max_dd * 100, 2),
        "maxDrawdownPeriod": dd_period,
        "portfolioBeta": round(port_beta, 2),
        "monthCount": n_months,
    }


def compute_correlation_matrix(price_data, tickers):
    """Compute NxN Pearson correlation matrix from price data.
    price_data: dict of ticker -> list of prices (same length, aligned dates)
    """
    n = len(tickers)
    if n == 0:
        return {"tickers": [], "matrix": []}

    # Compute returns
    returns = {}
    min_len = min(len(price_data[t]) for t in tickers)
    for t in tickers:
        prices = price_data[t][:min_len]
        rets = []
        for i in range(1, len(prices)):
            if prices[i - 1] > 0:
                rets.append((prices[i] - prices[i - 1]) / prices[i - 1])
            else:
                rets.append(0)
        returns[t] = rets

    def pearson(x, y):
        n = len(x)
        if n < 2:
            return 0
        mx = sum(x) / n
        my = sum(y) / n
        num = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
        dx = math.sqrt(sum((xi - mx) ** 2 for xi in x))
        dy = math.sqrt(sum((yi - my) ** 2 for yi in y))
        if dx == 0 or dy == 0:
            return 0
        return num / (dx * dy)

    matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            if i == j:
                row.append(1.0)
            else:
                corr = pearson(returns[tickers[i]], returns[tickers[j]])
                row.append(round(corr, 3))
        matrix.append(row)

    return {"tickers": tickers, "matrix": matrix}
