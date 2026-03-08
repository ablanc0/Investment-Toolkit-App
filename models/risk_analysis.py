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
    """Stress test portfolio against historical scenarios.

    Returns both Normal (beta × drop) and Max Stress (beta × drop × stressFactor)
    projections per position per scenario, plus per-position recovery time.
    """
    if scenarios is None:
        scenarios = STRESS_SCENARIOS

    results = []
    for scenario in scenarios:
        drop_pct = scenario["drop"]
        stress_factor = scenario.get("stressFactor", 1.0)
        recovery_yrs = scenario.get("recoveryYears", 1.0)
        pos_results = []
        normal_total_loss = 0
        max_stress_total_loss = 0
        total_recovery_yrs = 0

        for p in enriched_positions:
            beta = p.get("beta", 1) or 1
            mv = p.get("marketValue", 0)

            # Normal: beta × market drop
            normal_drop = max(beta * drop_pct, -100)
            normal_loss = mv * normal_drop / 100
            normal_value = max(mv + normal_loss, 0)

            # Max Stress: beta × market drop × VIX stress factor
            max_stress_drop = max(beta * drop_pct * stress_factor, -100)
            max_stress_loss = mv * max_stress_drop / 100
            max_stress_value = max(mv + max_stress_loss, 0)

            normal_total_loss += normal_loss
            max_stress_total_loss += max_stress_loss

            # Per-position recovery time: recoveryYears × (1 + beta) / 2
            pos_recovery = round(recovery_yrs * (1 + beta) / 2, 1)
            total_recovery_yrs += pos_recovery

            abs_loss = abs(max_stress_loss)
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
                "normalDrop": round(normal_drop, 2),
                "normalValue": round(normal_value, 2),
                "normalLoss": round(normal_loss, 2),
                "maxStressDrop": round(max_stress_drop, 2),
                "maxStressValue": round(max_stress_value, 2),
                "maxStressLoss": round(max_stress_loss, 2),
                "recoveryYears": pos_recovery,
                "priority": priority,
            })

        pos_results.sort(key=lambda x: x["normalLoss"])
        normal_stressed = max(total_market_value + normal_total_loss, 0)
        max_stress_stressed = max(total_market_value + max_stress_total_loss, 0)
        n_pos = len(enriched_positions)
        avg_recovery = round(total_recovery_yrs / n_pos, 1) if n_pos > 0 else 0

        results.append({
            "name": scenario["name"],
            "description": scenario.get("description", ""),
            "drop": drop_pct,
            "stressFactor": stress_factor,
            # Normal scenario aggregates
            "normalTotalLoss": round(normal_total_loss, 2),
            "normalStressedValue": round(normal_stressed, 2),
            "normalDropPct": round((normal_total_loss / total_market_value * 100) if total_market_value > 0 else 0, 2),
            # Max Stress scenario aggregates
            "maxStressTotalLoss": round(max_stress_total_loss, 2),
            "maxStressStressedValue": round(max_stress_stressed, 2),
            "maxStressDropPct": round((max_stress_total_loss / total_market_value * 100) if total_market_value > 0 else 0, 2),
            # Recovery
            "avgRecoveryYears": avg_recovery,
            # Backward compat (aliased to normal)
            "totalEstimatedLoss": round(normal_total_loss, 2),
            "stressedValue": round(normal_stressed, 2),
            "stressedDropPct": round((normal_total_loss / total_market_value * 100) if total_market_value > 0 else 0, 2),
            "positions": pos_results,
        })

    return results


def compute_recovery_projection(stress_results, total_market_value, annual_div_income, scenarios=None):
    """Estimate recovery timeline for each stress scenario.

    Builds dual recovery paths (Normal and Max Stress) factoring in:
    - Historical recovery duration (from scenario data)
    - Dividend reinvestment during recovery
    - V-shaped, U-shaped, L-shaped recovery curves
    """
    if scenarios is None:
        scenarios = STRESS_SCENARIOS

    scenario_map = {s["name"]: s for s in scenarios}
    monthly_divs = annual_div_income / 12
    projections = []

    def build_path(stressed_val, recovery_months, shape):
        """Build month-by-month recovery path from stressed value back to pre-crash."""
        gap = total_market_value - stressed_val
        path = []
        current = stressed_val

        for month in range(recovery_months + 1):
            pct = (current / total_market_value * 100) if total_market_value > 0 else 0
            path.append({"month": month, "value": round(current, 2), "pctRecovered": round(pct, 1)})

            if month < recovery_months:
                t = (month + 1) / recovery_months
                if shape == "V-shaped":
                    target_frac = t
                elif shape == "U-shaped":
                    target_frac = t * t
                else:  # L-shaped
                    target_frac = math.sqrt(t)

                target_value = stressed_val + gap * target_frac
                market_gain = target_value - current
                current = current + market_gain + monthly_divs

        divs_total = monthly_divs * recovery_months
        return path, round(current, 2), round(divs_total, 2)

    for result in stress_results:
        sc_data = scenario_map.get(result["name"], {})
        recovery_months = sc_data.get("recoveryMonths", 24)
        shape = sc_data.get("shape", "V-shaped")

        normal_stressed = result.get("normalStressedValue", result.get("stressedValue", 0))
        max_stress_stressed = result.get("maxStressStressedValue", normal_stressed)
        normal_loss = abs(result.get("normalTotalLoss", result.get("totalEstimatedLoss", 0)))
        max_stress_loss = abs(result.get("maxStressTotalLoss", normal_loss))
        avg_recovery_yrs = result.get("avgRecoveryYears", round(recovery_months / 12, 1))

        if total_market_value <= 0:
            continue
        if normal_loss <= 0 and max_stress_loss <= 0:
            continue

        # Build both recovery paths
        normal_path, normal_final, normal_divs = build_path(normal_stressed, recovery_months, shape)
        max_path, max_final, max_divs = build_path(max_stress_stressed, recovery_months, shape)

        projections.append({
            "name": result["name"],
            "shape": shape,
            "recoveryMonths": recovery_months,
            "recoveryYears": round(recovery_months / 12, 1),
            "preStressValue": round(total_market_value, 2),
            "avgPositionRecoveryYears": avg_recovery_yrs,
            "normal": {
                "stressedValue": round(normal_stressed, 2),
                "finalValue": normal_final,
                "dividendsDuringRecovery": normal_divs,
                "path": normal_path,
            },
            "maxStress": {
                "stressedValue": round(max_stress_stressed, 2),
                "finalValue": max_final,
                "dividendsDuringRecovery": max_divs,
                "path": max_path,
            },
            # Backward compat (aliased to normal)
            "stressedValue": round(normal_stressed, 2),
            "finalValue": normal_final,
            "dividendsDuringRecovery": normal_divs,
            "path": normal_path,
        })

    return projections


def compute_risk_metrics(monthly_data, enriched_positions):
    """Compute portfolio-level risk metrics from monthly data."""
    # Filter to entries with actual portfolio values (skip empty/future rows)
    valid_data = [e for e in monthly_data if e.get("portfolioValue", 0) > 0]

    monthly_returns = []
    for i in range(1, len(valid_data)):
        prev_val = valid_data[i - 1].get("portfolioValue", 0)
        curr_val = valid_data[i].get("portfolioValue", 0)
        contrib = valid_data[i].get("contributions", 0)
        if prev_val > 0:
            # Modified Dietz: assume contributions happen mid-month
            base = prev_val + 0.5 * contrib
            ret = (curr_val - prev_val - contrib) / base
            monthly_returns.append(ret)

    if len(monthly_returns) < 2:
        return {
            "twr": 0, "annualizedReturn": 0, "annualizedVolatility": 0,
            "sharpeRatio": 0, "sortinoRatio": 0,
            "maxDrawdown": 0, "maxDrawdownPeriod": "",
            "portfolioBeta": 0, "monthCount": len(monthly_returns),
        }

    # TWR (cumulative) and annualized return (geometric)
    cum = 1
    for r in monthly_returns:
        cum *= (1 + r)
    twr = (cum - 1)  # cumulative TWR
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

    # Max drawdown (only over valid data)
    peak = 0
    max_dd = 0
    dd_start = ""
    dd_end = ""
    current_dd_start = ""
    for entry in valid_data:
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
        "twr": round(twr * 100, 2),
        "annualizedReturn": round(ann_return * 100, 2),
        "annualizedVolatility": round(ann_vol * 100, 2),
        "sharpeRatio": round(sharpe, 2),
        "sortinoRatio": round(sortino, 2),
        "maxDrawdown": round(max_dd * 100, 2),
        "maxDrawdownPeriod": dd_period,
        "portfolioBeta": round(port_beta, 2),
        "monthCount": n_months,
    }


def compute_market_metrics(monthly_prices):
    """Compute risk metrics for a market benchmark (e.g. SPY) from monthly prices."""
    if len(monthly_prices) < 3:
        return {
            "twr": 0, "annualizedReturn": 0, "annualizedVolatility": 0,
            "sharpeRatio": 0, "sortinoRatio": 0, "maxDrawdown": 0,
        }

    monthly_returns = []
    for i in range(1, len(monthly_prices)):
        if monthly_prices[i - 1] > 0:
            monthly_returns.append((monthly_prices[i] - monthly_prices[i - 1]) / monthly_prices[i - 1])

    if len(monthly_returns) < 2:
        return {
            "twr": 0, "annualizedReturn": 0, "annualizedVolatility": 0,
            "sharpeRatio": 0, "sortinoRatio": 0, "maxDrawdown": 0,
        }

    n = len(monthly_returns)
    cum = 1
    for r in monthly_returns:
        cum *= (1 + r)
    twr = cum - 1
    ann_return = (cum ** (12 / n) - 1) if n > 0 else 0

    mean_r = sum(monthly_returns) / n
    variance = sum((r - mean_r) ** 2 for r in monthly_returns) / (n - 1)
    std = math.sqrt(variance)
    ann_vol = std * math.sqrt(12)

    rf_monthly = (1 + RISK_FREE_RATE) ** (1 / 12) - 1
    sharpe = ((mean_r - rf_monthly) / std * math.sqrt(12)) if std > 0 else 0

    downside = [r for r in monthly_returns if r < rf_monthly]
    if downside:
        dd_var = sum((r - rf_monthly) ** 2 for r in downside) / len(downside)
        dd_dev = math.sqrt(dd_var) * math.sqrt(12)
        sortino = ((ann_return - RISK_FREE_RATE) / dd_dev) if dd_dev > 0 else 0
    else:
        sortino = 0

    peak = 0
    max_dd = 0
    for price in monthly_prices:
        if price > peak:
            peak = price
        if peak > 0:
            dd = (price - peak) / peak
            if dd < max_dd:
                max_dd = dd

    return {
        "twr": round(twr * 100, 2),
        "annualizedReturn": round(ann_return * 100, 2),
        "annualizedVolatility": round(ann_vol * 100, 2),
        "sharpeRatio": round(sharpe, 2),
        "sortinoRatio": round(sortino, 2),
        "maxDrawdown": round(max_dd * 100, 2),
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
