"""
InvToolkit — Investment projections computation.
Year-by-year compound growth projections with bull/base/bear scenarios.
"""


def compute_projections(config, return_pct_override=None):
    """Compute year-by-year projection with monthly compounding."""
    start = config.get("startingValue", 0)
    monthly_add = config.get("monthlyContribution", 0)
    annual_return = (return_pct_override if return_pct_override is not None
                     else config.get("expectedReturnPct", 8)) / 100
    div_yield = config.get("dividendYieldPct", 0) / 100
    inflation = config.get("inflationPct", 0) / 100
    years = int(config.get("years", 20))
    monthly_rate = annual_return / 12

    rows = []
    balance = start
    total_contributions = start
    total_dividends = 0.0

    for year in range(0, years + 1):
        div_income = round(balance * div_yield, 2)
        real = round(balance / ((1 + inflation) ** year), 2) if inflation > 0 and year > 0 else round(balance, 2)
        rows.append({
            "year": year,
            "balance": round(balance, 2),
            "realBalance": real,
            "contributions": round(total_contributions, 2),
            "growth": round(balance - total_contributions, 2),
            "divIncome": div_income,
            "totalDividends": round(total_dividends, 2),
        })
        if year < years:
            for _ in range(12):
                balance = balance * (1 + monthly_rate) + monthly_add
            total_contributions += monthly_add * 12
            total_dividends += div_income

    return rows


def _projections_response(proj):
    """Build projections API response (no live yfinance calls)."""
    base_return = proj.get("expectedReturnPct", 8)
    table = {
        "base": compute_projections(proj),
        "bull": compute_projections(proj, return_pct_override=base_return + 2),
        "bear": compute_projections(proj, return_pct_override=max(base_return - 2, 0)),
    }
    return {"config": proj, "table": table}


def _normalize_proj_config(proj):
    """Normalize legacy projection config keys to standard names."""
    mapping = {
        "currentValue": "startingValue",
        "expectedGrowth": "expectedReturnPct",
        "dividendYield": "dividendYieldPct",
    }
    for old_key, new_key in mapping.items():
        if old_key in proj and new_key not in proj:
            val = proj.pop(old_key)
            # expectedGrowth was stored as decimal (0.07), convert to pct
            if old_key == "expectedGrowth":
                val = round(val * 100, 4) if val < 1 else val
            if old_key == "dividendYield":
                val = round(val * 100, 4) if val < 1 else val
            proj[new_key] = val
    # Defaults
    proj.setdefault("startingValue", 0)
    proj.setdefault("monthlyContribution", 0)
    proj.setdefault("expectedReturnPct", 8)
    proj.setdefault("dividendYieldPct", 0)
    proj.setdefault("inflationPct", 3)
    proj.setdefault("years", 20)
    return proj
