"""Tax Optimization — tax-loss harvesting and capital gains analysis."""

from datetime import datetime
from config import LTCG_RATE, STCG_RATE, HARVEST_LOSS_THRESHOLD, TRIM_GAIN_THRESHOLD, HOLDING_PERIOD_DAYS


def _compute_days_held(position):
    """Compute days held from entryDate (YYYY-MM) or buyDate (YYYY-MM-DD)."""
    now = datetime.now()

    # Prefer entryDate (YYYY-MM format)
    entry_date = position.get("entryDate", "")
    if entry_date:
        try:
            ed = datetime.strptime(entry_date, "%Y-%m")
            return (now - ed).days
        except (ValueError, TypeError):
            pass

    # Fallback to buyDate (YYYY-MM-DD format)
    buy_date = position.get("buyDate", "")
    if buy_date:
        try:
            bd = datetime.strptime(buy_date, "%Y-%m-%d")
            return (now - bd).days
        except (ValueError, TypeError):
            pass

    return 0


def compute_tax_positions(enriched_positions):
    """Compute tax impact and harvest opportunities for each position."""
    results = []
    for p in enriched_positions:
        cost_basis = p.get("costBasis", 0)
        market_value = p.get("marketValue", 0)
        unrealized_gl = market_value - cost_basis
        gl_pct = (unrealized_gl / cost_basis * 100) if cost_basis > 0 else 0

        days_held = _compute_days_held(p)
        if days_held > 0:
            holding = "Long-term" if days_held >= HOLDING_PERIOD_DAYS else "Short-term"
        else:
            holding = "Long-term"  # default when no date info

        tax_rate = LTCG_RATE if holding == "Long-term" else STCG_RATE
        tax_impact = round(max(unrealized_gl * tax_rate, 0), 2)

        harvest = unrealized_gl < 0

        if gl_pct <= HARVEST_LOSS_THRESHOLD:
            action = "Sell to harvest loss"
        elif gl_pct >= TRIM_GAIN_THRESHOLD:
            action = "Consider trimming"
        else:
            action = "Hold"

        results.append({
            "ticker": p.get("ticker", ""),
            "company": p.get("company", p.get("ticker", "")),
            "shares": p.get("shares", 0),
            "costBasis": round(cost_basis, 2),
            "marketValue": round(market_value, 2),
            "unrealizedGL": round(unrealized_gl, 2),
            "gainLossPct": round(gl_pct, 2),
            "taxImpact": tax_impact,
            "harvestOpportunity": harvest,
            "holdingPeriod": holding,
            "daysHeld": days_held,
            "action": action,
        })

    results.sort(key=lambda x: x["unrealizedGL"])
    return results


def compute_tax_summary(tax_positions):
    """Aggregate tax summary from position-level data."""
    total_gains = sum(p["unrealizedGL"] for p in tax_positions if p["unrealizedGL"] > 0)
    total_losses = sum(abs(p["unrealizedGL"]) for p in tax_positions if p["unrealizedGL"] < 0)
    net = total_gains - total_losses
    tax_liability = sum(p["taxImpact"] for p in tax_positions)
    savings = round(total_losses * LTCG_RATE, 2)
    harvestable = sum(1 for p in tax_positions if p["harvestOpportunity"])

    return {
        "totalGains": round(total_gains, 2),
        "totalLosses": round(total_losses, 2),
        "netUnrealized": round(net, 2),
        "estTaxLiability": round(tax_liability, 2),
        "potentialTaxSavings": savings,
        "harvestableCount": harvestable,
        "totalPositions": len(tax_positions),
    }
