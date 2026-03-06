"""
InvToolkit — InvT Score fundamental quality scoring computation.
Scores companies 0-10 across Growth, Profitability, Debt, Efficiency,
and Shareholder Returns categories using 5yr/10yr historical data.
"""

from services.edgar import (
    _fetch_edgar_facts,
    _edgar_annual_values,
    _edgar_merge_tags,
)
from services.fmp import _fetch_fmp_stock_data


# ── InvT Score Constants ─────────────────────────────────────────────────

INVT_THRESHOLDS = {
    # Growth (CAGR %): higher is better
    "revenue_cagr":   [(0, 0), (1, 1), (3, 3), (6, 5), (9, 7), (14, 9)],
    "eps_cagr":       [(-10, 0), (0, 1), (3, 3), (6, 5), (9, 7), (13, 9)],
    "fcf_share_cagr": [(-10, 0), (0, 1), (3, 3), (6, 5), (9, 7), (18, 9)],
    # Profitability (%): higher is better
    "gpm":            [(0, 0), (20, 1), (30, 3), (40, 5), (50, 7), (60, 9)],
    "npm":            [(0, 0), (3, 1), (6, 3), (10, 5), (15, 7), (20, 9)],
    "fcf_margin":     [(0, 0), (5, 1), (8, 3), (12, 5), (18, 7), (25, 9)],
    # Debt: lower/negative is better (inverted)
    "net_debt_cagr":  [(-25, 10), (-15, 9), (0, 7), (5, 5), (10, 3), (15, 1)],
    "net_debt_fcf":   [(0, 10), (1, 9), (2, 7), (3, 5), (4, 3), (5, 1)],
    # Debt: higher is better
    "interest_cov":   [(5, 0), (7, 1), (9, 3), (11, 5), (13, 7), (16, 9)],
    # Dividends: DPS growth — higher is better
    "dps_cagr":       [(-5, 0), (0, 1), (4, 3), (8, 5), (12, 7), (16, 9)],
    # Dividends: FCF Payout — lower is better (inverted)
    "fcf_payout":     [(30, 10), (40, 9), (50, 7), (60, 5), (70, 3), (80, 1)],
    # Buybacks: share count declining is better (inverted)
    "shares_cagr":    [(-2.5, 10), (-2, 9), (-1.5, 7), (-1, 5), (-0.5, 3), (0.5, 1), (2, 0)],
    # Capital Efficiency (%): higher is better
    "roa":            [(0, 0), (2, 1), (4, 3), (6, 5), (8, 7), (10, 9)],
    "roe":            [(0, 0), (5, 1), (10, 3), (15, 5), (20, 7), (25, 9)],
    "roic":           [(0, 0), (5, 1), (8, 3), (10, 5), (12, 7), (15, 9)],
}

# Categories that contribute to the overall InvT Score
INVT_CATEGORIES_SCORED = {
    "growth":        {"metrics": ["revenue_cagr", "eps_cagr", "fcf_share_cagr"],
                      "weights": [1/3, 1/3, 1/3], "label": "Growth"},
    "profitability": {"metrics": ["gpm", "npm", "fcf_margin"],
                      "weights": [1/3, 1/3, 1/3], "label": "Profitability"},
    "debt":          {"metrics": ["net_debt_cagr", "net_debt_fcf", "interest_cov"],
                      "weights": [1/3, 1/3, 1/3], "label": "Debt"},
    "efficiency":    {"metrics": ["roa", "roe", "roic"],
                      "weights": [1/3, 1/3, 1/3], "label": "Capital Efficiency"},
}

# Informational category — always computed, never in overall score
INVT_CATEGORIES_INFO = {
    "shareholder_returns": {"metrics": ["div_yield", "dps_cagr", "payout_ratio", "fcf_payout", "shares_cagr"],
                            "weights": [0.15, 0.25, 0.15, 0.25, 0.20], "label": "Dividend & Buyback"},
}

# Combined for iteration (display all 5)
INVT_CATEGORIES = {**INVT_CATEGORIES_SCORED, **INVT_CATEGORIES_INFO}

INVT_METRIC_NAMES = {
    "revenue_cagr": "Revenue CAGR", "eps_cagr": "EPS CAGR", "fcf_share_cagr": "FCF/Share CAGR",
    "gpm": "Gross Profit Margin", "npm": "Net Profit Margin", "fcf_margin": "FCF Margin",
    "net_debt_cagr": "Net Debt CAGR", "net_debt_fcf": "Net Debt / FCF", "interest_cov": "Interest Coverage",
    "div_yield": "Dividend Yield", "dps_cagr": "Div/Share CAGR", "payout_ratio": "Payout Ratio",
    "fcf_payout": "FCF Payout Ratio", "shares_cagr": "Shares Outstanding CAGR",
    "roa": "Return on Assets", "roe": "Return on Equity", "roic": "Return on Invested Capital",
}

INVT_METRIC_UNITS = {
    "revenue_cagr": "%", "eps_cagr": "%", "fcf_share_cagr": "%",
    "gpm": "%", "npm": "%", "fcf_margin": "%",
    "net_debt_cagr": "%", "net_debt_fcf": "x", "interest_cov": "x",
    "div_yield": "%", "dps_cagr": "%", "payout_ratio": "%",
    "fcf_payout": "%", "shares_cagr": "%",
    "roa": "%", "roe": "%", "roic": "%",
}


def _invt_cagr(start_val, end_val, years):
    """Compound Annual Growth Rate. Returns % (e.g. 12.5 for 12.5%)."""
    if years <= 0 or not start_val or not end_val:
        return None
    if start_val < 0 and end_val < 0:
        # Both negative: measure improvement (e.g. net debt shrinking)
        ratio = end_val / start_val
    elif start_val <= 0:
        return None  # Can't compute CAGR across zero crossing
    else:
        ratio = end_val / start_val
    if ratio <= 0:
        return None
    return (ratio ** (1 / years) - 1) * 100


def _invt_safe_avg(values):
    """Average of non-None values."""
    valid = [v for v in values if v is not None]
    return round(sum(valid) / len(valid), 1) if valid else None


_INVT_INVERTED = {"net_debt_cagr", "net_debt_fcf", "fcf_payout", "shares_cagr"}


def _invt_score_metric(value, key):
    """Score a metric 0-10 using its threshold table. Custom logic for div_yield and payout_ratio."""
    if value is None:
        return None
    # Custom scorers for non-monotonic metrics
    if key == "div_yield":
        if value <= 0: return 0
        if value < 1: return 3    # Low but paying
        if value < 2: return 5    # Moderate
        if value < 4: return 7    # Sweet spot
        if value < 6: return 5    # Getting high
        if value < 8: return 3    # Yield trap risk
        return 1                  # Distressed
    if key == "payout_ratio":
        if value >= 120: return 0
        if value >= 100: return 1
        if value >= 80: return 3
        if value >= 60: return 5
        if value >= 40: return 7
        if value >= 20: return 9   # Sweet spot
        if value >= 10: return 7
        return 5
    # Generic threshold scoring
    thresholds = INVT_THRESHOLDS.get(key)
    if not thresholds:
        return None
    for upper, score in thresholds:
        if value < upper:
            return score
    # Fall-through: inverted metrics get 0 (worst), normal metrics get max+1
    if key in _INVT_INVERTED:
        return 0
    return thresholds[-1][1] + 1  # Above all thresholds → max score (10)


def _invt_label(score):
    """Map overall score to classification label."""
    if score is None:
        return "Insufficient Data"
    if score >= 9: return "Elite \U0001f680"
    if score >= 8: return "High Quality \u2705"
    if score >= 6: return "Above Average \U0001f44d"
    if score >= 4: return "Below Average \U0001f4c9"
    return "Poor Quality \U0001f6a8"


def _fetch_invt_data(ticker):
    """Fetch 5+ years of financial data for InvT Score.
    Returns (yearly_data_list, data_source) or (None, None).
    Uses SEC EDGAR → FMP → yfinance cascade."""

    def _build_yearly(years, rev, gp, ni, ebit, eps, ocf, capex,
                      debt, cash, equity, assets, interest, pretax, tax,
                      divs_paid, shares):
        """Build sorted list of yearly data dicts from year-keyed dicts."""
        all_years = sorted(set(years) | set(rev.keys()))
        result = []
        for y in all_years:
            r = rev.get(y) or 0
            o = ocf.get(y) or 0
            c = capex.get(y) or 0
            fcf = (o - abs(c)) if y in ocf else None
            result.append({
                "year": y, "revenue": r, "grossProfit": gp.get(y),
                "netIncome": ni.get(y), "ebit": ebit.get(y),
                "eps": eps.get(y), "ocf": o, "capex": c, "fcf": fcf,
                "totalDebt": debt.get(y) or 0, "cash": cash.get(y) or 0,
                "equity": equity.get(y), "totalAssets": assets.get(y),
                "interestExpense": interest.get(y),
                "pretaxIncome": pretax.get(y), "taxProvision": tax.get(y),
                "dividendsPaid": abs(divs_paid.get(y) or 0),
                "sharesOutstanding": shares.get(y),
            })
        return result

    # Primary: SEC EDGAR
    facts = _fetch_edgar_facts(ticker)
    if facts:
        rev = _edgar_merge_tags(facts, [
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenues", "SalesRevenueNet", "RealEstateRevenueNet",
        ], max_years=11)
        if rev:
            gp = _edgar_annual_values(facts, "GrossProfit", max_years=11)
            if not gp:
                cor = _edgar_merge_tags(facts, [
                    "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfRevenue",
                ], max_years=11)
                if cor:
                    gp = {y: rev.get(y, 0) - cor.get(y, 0) for y in cor if y in rev}
            ni = _edgar_annual_values(facts, "NetIncomeLoss", max_years=11)
            ebit = _edgar_annual_values(facts, "OperatingIncomeLoss", max_years=11)
            eps = _edgar_annual_values(facts, "EarningsPerShareDiluted", unit="USD/shares", max_years=11)
            ocf = _edgar_annual_values(facts, "NetCashProvidedByUsedInOperatingActivities", max_years=11)
            capex = _edgar_annual_values(facts, "PaymentsToAcquirePropertyPlantAndEquipment", max_years=11)
            debt_nc = _edgar_annual_values(facts, "LongTermDebtNoncurrent", max_years=11)
            debt_c = _edgar_annual_values(facts, "LongTermDebtCurrent", max_years=11)
            debt_fb = _edgar_annual_values(facts, "LongTermDebt", max_years=11)
            debt = {}
            for y in set(debt_nc) | set(debt_c) | set(debt_fb):
                d = debt_nc.get(y, 0) + debt_c.get(y, 0)
                debt[y] = d if d else debt_fb.get(y, 0)
            cash = _edgar_merge_tags(facts, [
                "CashAndCashEquivalentsAtCarryingValue",
                "CashCashEquivalentsAndShortTermInvestments",
                "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
            ], max_years=11)
            equity = _edgar_annual_values(facts, "StockholdersEquity", max_years=11)
            assets = _edgar_annual_values(facts, "Assets", max_years=11)
            interest = _edgar_merge_tags(facts, [
                "InterestExpense", "InterestExpenseDebt",
                "InterestPaidNet",  # Cash flow fallback
                "InterestIncomeExpenseNonoperatingNet",
            ], max_years=11)
            pretax_tags = [
                "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
                "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
            ]
            pretax = _edgar_merge_tags(facts, pretax_tags, max_years=11)
            tax = _edgar_annual_values(facts, "IncomeTaxExpenseBenefit", max_years=11)
            divs = _edgar_merge_tags(facts, [
                "PaymentsOfDividends", "PaymentsOfDividendsCommonStock",
                "PaymentsOfOrdinaryDividends",
            ], max_years=11)
            shares = _edgar_merge_tags(facts, [
                "CommonStockSharesOutstanding",
                "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
                "WeightedAverageNumberOfDilutedSharesOutstanding",
            ], unit="shares", max_years=11)
            if not shares:
                shares = _edgar_annual_values(facts, "EntityCommonStockSharesOutstanding",
                                              unit="shares", ns="dei", max_years=11)
            yearly = _build_yearly(rev.keys(), rev, gp, ni, ebit, eps, ocf, capex,
                                   debt, cash, equity, assets, interest, pretax, tax,
                                   divs, shares)
            # Normalize stock splits: detect YoY share count jumps > 3x
            for i in range(1, len(yearly)):
                prev_s = yearly[i - 1].get("sharesOutstanding", 0)
                curr_s = yearly[i].get("sharesOutstanding", 0)
                if prev_s and curr_s:
                    ratio = curr_s / prev_s
                    if ratio > 3:  # Forward split detected
                        for j in range(i):
                            yearly[j]["sharesOutstanding"] *= ratio
                            if yearly[j].get("eps"):
                                yearly[j]["eps"] /= ratio
            if len(yearly) >= 2:
                print(f"[InvTScore] {ticker}: SEC EDGAR, {len(yearly)} years")
                return yearly, "SEC EDGAR"

    # Fallback: FMP
    try:
        fmp = _fetch_fmp_stock_data(ticker)
        inc_rows = fmp.get("income") or []
        cf_rows = fmp.get("cashflow") or []
        bal_rows = fmp.get("balance") or []
        ev_rows = fmp.get("ev") or []
        if inc_rows:
            rev, gp, ni, ebit, eps_d = {}, {}, {}, {}, {}
            interest, pretax, tax = {}, {}, {}
            for row in inc_rows[:11]:
                y = row.get("date", "")[:4]
                if not y: continue
                rev[y] = row.get("revenue", 0)
                gp[y] = row.get("grossProfit", 0)
                ni[y] = row.get("netIncome", 0)
                ebit[y] = row.get("operatingIncome", 0)
                eps_d[y] = row.get("epsDiluted", 0)
                interest[y] = row.get("interestExpense", 0)
                pretax[y] = row.get("incomeBeforeTax", 0)
                tax[y] = row.get("incomeTaxExpense", 0)
            ocf, capex_d, divs = {}, {}, {}
            for row in cf_rows[:11]:
                y = row.get("date", "")[:4]
                if not y: continue
                ocf[y] = row.get("operatingCashFlow", 0)
                capex_d[y] = row.get("capitalExpenditure", 0)
                divs[y] = row.get("dividendsPaid", 0)
            debt, cash_d, equity, assets = {}, {}, {}, {}
            for row in bal_rows[:11]:
                y = row.get("date", "")[:4]
                if not y: continue
                debt[y] = row.get("totalDebt", 0)
                cash_d[y] = row.get("cashAndCashEquivalents", 0)
                equity[y] = row.get("totalStockholdersEquity", 0)
                assets[y] = row.get("totalAssets", 0)
            shares = {}
            for row in ev_rows[:11]:
                y = row.get("date", "")[:4]
                if not y: continue
                shares[y] = row.get("numberOfShares", 0)
            yearly = _build_yearly(rev.keys(), rev, gp, ni, ebit, eps_d, ocf, capex_d,
                                   debt, cash_d, equity, assets, interest, pretax, tax,
                                   divs, shares)
            if len(yearly) >= 2:
                print(f"[InvTScore] {ticker}: FMP, {len(yearly)} years")
                return yearly, "FMP"
    except Exception as e:
        print(f"[InvTScore] FMP error for {ticker}: {e}")

    return None, None


def _compute_invt_metrics(yearly, mode="5yr"):
    """Compute all 16 InvT metric values from yearly data.
    mode='10yr': all available data (up to 10 years).
    mode='5yr': last 5 data points (4 CAGR periods)."""
    if not yearly or len(yearly) < 2:
        return {}
    if mode == "5yr":
        data = yearly[-5:] if len(yearly) >= 5 else yearly
    else:
        data = yearly  # Full range (10yr)

    first, last = data[0], data[-1]
    n = len(data) - 1  # Number of growth periods

    metrics = {}

    # ── Growth CAGRs ──
    metrics["revenue_cagr"] = _invt_cagr(first["revenue"], last["revenue"], n)
    metrics["eps_cagr"] = _invt_cagr(first["eps"], last["eps"], n) if first["eps"] and last["eps"] else None
    # FCF per share CAGR
    fcf_ps_first = first["fcf"] / first["sharesOutstanding"] if first.get("fcf") is not None and first.get("sharesOutstanding") else None
    fcf_ps_last = last["fcf"] / last["sharesOutstanding"] if last.get("fcf") is not None and last.get("sharesOutstanding") else None
    metrics["fcf_share_cagr"] = _invt_cagr(fcf_ps_first, fcf_ps_last, n) if fcf_ps_first and fcf_ps_last else None

    # ── Profitability Averages ──
    gpms = [d["grossProfit"] / d["revenue"] * 100 for d in data if d.get("revenue") and d.get("grossProfit")]
    metrics["gpm"] = _invt_safe_avg(gpms) if gpms else None
    npms = [d["netIncome"] / d["revenue"] * 100 for d in data if d.get("revenue") and d.get("netIncome")]
    metrics["npm"] = _invt_safe_avg(npms) if npms else None
    fcf_margins = [d["fcf"] / d["revenue"] * 100 for d in data if d.get("revenue") and d.get("fcf")]
    metrics["fcf_margin"] = _invt_safe_avg(fcf_margins) if fcf_margins else None

    # ── Debt ──
    net_debts = [(d["totalDebt"] - d["cash"]) for d in data if d.get("totalDebt") is not None]
    if len(net_debts) >= 2 and net_debts[0]:
        if net_debts[0] > 0 and net_debts[-1] <= 0:
            metrics["net_debt_cagr"] = -100  # Went from debt to net cash → best outcome
        elif net_debts[-1]:
            metrics["net_debt_cagr"] = _invt_cagr(net_debts[0], net_debts[-1], n)
        else:
            metrics["net_debt_cagr"] = None
    else:
        metrics["net_debt_cagr"] = None
    nd_fcf = []
    for d in data:
        nd = (d.get("totalDebt") or 0) - (d.get("cash") or 0)
        if d.get("fcf") and d["fcf"] > 0:
            nd_fcf.append(nd / d["fcf"])
    metrics["net_debt_fcf"] = _invt_safe_avg(nd_fcf) if nd_fcf else None
    int_covs = [d["ebit"] / d["interestExpense"]
                for d in data if d.get("ebit") and d.get("interestExpense") and d["interestExpense"] > 0]
    metrics["interest_cov"] = _invt_safe_avg(int_covs) if int_covs else None

    # ── Dividends & Buybacks ──
    div_yields = []
    for d in data:
        if d.get("dividendsPaid") and d.get("sharesOutstanding") and d.get("eps"):
            dps = d["dividendsPaid"] / d["sharesOutstanding"]
            # Approximate price from EPS × P/E ≈ use netIncome/equity as rough proxy
            # Better: use dividendsPaid / netIncome × 100 for yield-like metric
            # Actually compute DPS/EPS as a proxy since we lack historical prices
            # Use dividend yield = DPS / (EPS / earnings_yield) but we don't have yield
            # Simplest: if we have revenue per share, approximate. Let's use DPS directly.
            pass
    # For dividend yield, we compute from total dividends paid / market cap
    # Since we don't have historical market cap, use DPS as % of EPS as proxy
    dps_vals = []
    for d in data:
        if d.get("dividendsPaid") and d.get("sharesOutstanding"):
            dps_vals.append(d["dividendsPaid"] / d["sharesOutstanding"])
        else:
            dps_vals.append(0)
    # Use current yfinance dividend yield if available, otherwise estimate
    # For now, compute average DPS and we'll get yield from yfinance in the route
    metrics["_avg_dps"] = _invt_safe_avg(dps_vals) if dps_vals else 0
    metrics["div_yield"] = None  # Will be filled from yfinance in route

    if len(dps_vals) >= 2 and dps_vals[0] and dps_vals[-1]:
        metrics["dps_cagr"] = _invt_cagr(dps_vals[0], dps_vals[-1], n)
    else:
        metrics["dps_cagr"] = None if any(d.get("dividendsPaid", 0) > 0 for d in data) else 0

    payout_ratios = [d["dividendsPaid"] / d["netIncome"] * 100
                     for d in data if d.get("dividendsPaid") and d.get("netIncome") and d["netIncome"] > 0]
    metrics["payout_ratio"] = _invt_safe_avg(payout_ratios) if payout_ratios else 0

    fcf_payouts = [d["dividendsPaid"] / d["fcf"] * 100
                   for d in data if d.get("dividendsPaid") and d.get("fcf") and d["fcf"] > 0]
    metrics["fcf_payout"] = _invt_safe_avg(fcf_payouts) if fcf_payouts else 0

    shares_first = first.get("sharesOutstanding", 0)
    shares_last = last.get("sharesOutstanding", 0)
    metrics["shares_cagr"] = _invt_cagr(shares_first, shares_last, n) if shares_first and shares_last else None

    # ── Capital Efficiency Averages ──
    roas = [d["netIncome"] / d["totalAssets"] * 100
            for d in data if d.get("netIncome") and d.get("totalAssets") and d["totalAssets"] > 0]
    metrics["roa"] = _invt_safe_avg(roas) if roas else None

    roes = [d["netIncome"] / d["equity"] * 100
            for d in data if d.get("netIncome") and d.get("equity") and d["equity"] > 0]
    metrics["roe"] = _invt_safe_avg(roes) if roes else None

    roics = []
    for d in data:
        if d.get("ebit") and d.get("equity"):
            tax_rate = d["taxProvision"] / d["pretaxIncome"] if d.get("pretaxIncome") and d["pretaxIncome"] > 0 else 0.21
            invested = d.get("totalDebt", 0) + d["equity"] - d.get("cash", 0)
            if invested > 0:
                nopat = d["ebit"] * (1 - tax_rate)
                roics.append(nopat / invested * 100)
    metrics["roic"] = _invt_safe_avg(roics) if roics else None

    return metrics


def _compute_invt_category_scores(metric_scores, categories=None):
    """Compute category scores from individual metric scores.
    Requires ≥2 valid metrics for categories with 3+ metrics to prevent single-metric distortion."""
    cats = categories or INVT_CATEGORIES
    result = {}
    for cat_key, cat_def in cats.items():
        min_required = 2 if len(cat_def["metrics"]) >= 3 else 1
        valid_count = sum(1 for m in cat_def["metrics"] if metric_scores.get(m) is not None)
        if valid_count < min_required:
            result[cat_key] = None
            continue
        weighted_sum = 0
        weight_sum = 0
        for i, m_key in enumerate(cat_def["metrics"]):
            s = metric_scores.get(m_key)
            if s is not None:
                weighted_sum += s * cat_def["weights"][i]
                weight_sum += cat_def["weights"][i]
        result[cat_key] = round(weighted_sum / weight_sum, 1) if weight_sum > 0 else None
    return result
