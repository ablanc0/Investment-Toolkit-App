"""
InvToolkit — Valuation model computations.
DCF, Graham, Relative, and composite summary calculations.
"""

from config import (
    RISK_FREE_RATE, MARKET_RETURN, PERPETUAL_GROWTH, MARGIN_OF_SAFETY,
    AAA_YIELD_BASELINE, AAA_YIELD_CURRENT,
    GRAHAM_BASE_PE, GRAHAM_CG, GRAHAM_GROWTH_CAP,
    SECTOR_AVERAGES,
)


def _upside_signal(upside):
    """Map upside % to a valuation signal."""
    if upside > 50:
        return "Strong Buy"
    elif upside > 20:
        return "Buy"
    elif upside > -10:
        return "Hold"
    elif upside > -30:
        return "Expensive"
    return "Overrated"


def _trimmean(values, pct=0.2):
    """Trimmed mean — drop top/bottom pct of values."""
    if not values:
        return 0
    s = sorted(values)
    trim = max(1, int(len(s) * pct / 2))
    trimmed = s[trim:-trim] if len(s) > 2 * trim else s
    return sum(trimmed) / len(trimmed) if trimmed else 0


def _compute_wacc(info, income, val_defaults=None):
    """Compute WACC from CAPM. Returns (wacc_decimal, details_dict) or (None, None)."""
    vd = val_defaults or {}
    rf = vd.get("riskFreeRate", RISK_FREE_RATE * 100) / 100  # settings in %, convert to decimal
    mr = vd.get("marketReturn", MARKET_RETURN * 100) / 100
    beta = info.get("beta") or 1.0
    cost_of_equity = rf + beta * (mr - rf)

    total_debt = info.get("totalDebt") or 0
    total_cash = info.get("totalCash") or 0
    net_debt = max(total_debt - total_cash, 0)
    market_cap = info.get("marketCap") or 0
    total_capital = net_debt + market_cap
    if total_capital <= 0:
        return None, None

    debt_weight = net_debt / total_capital
    equity_weight = market_cap / total_capital

    tax_rate = 0.21
    years_sorted = sorted(income.keys(), reverse=True) if income else []
    for yr in years_sorted:
        pretax = income[yr].get("Pretax Income", 0)
        tax_prov = income[yr].get("Tax Provision", 0)
        if pretax and pretax > 0:
            tax_rate = min(max(tax_prov / pretax, 0), 0.5)
            break

    interest_expense = 0
    for yr in years_sorted:
        ie = abs(income[yr].get("Interest Expense", 0))
        if ie > 0:
            interest_expense = ie
            break
    interest_rate = (interest_expense / total_debt) if total_debt > 0 else 0.04
    cost_of_debt = interest_rate * (1 - tax_rate)

    wacc = equity_weight * cost_of_equity + debt_weight * cost_of_debt
    wacc = max(wacc, 0.05)

    return wacc, {
        "beta": beta, "costOfEquity": cost_of_equity,
        "costOfDebt": cost_of_debt, "taxRate": tax_rate,
        "debtWeight": debt_weight, "equityWeight": equity_weight,
        "totalDebt": total_debt, "netDebt": net_debt,
    }


def _compute_historical_fcf(info, cashflow):
    """Extract historical FCF and avg growth from cashflow dict.
    Returns (historical_fcf_list, hist_avg_growth) or ([], 0).
    """
    historical_fcf = []
    cf_years = sorted(cashflow.keys())
    for yr in cf_years:
        ocf = cashflow[yr].get("Operating Cash Flow", 0)
        capex = cashflow[yr].get("Capital Expenditure", 0)
        fcf = ocf + capex
        historical_fcf.append({"year": yr, "fcf": round(fcf)})

    if not historical_fcf:
        current_fcf = info.get("freeCashflow") or info.get("operatingCashflow", 0)
        if current_fcf:
            historical_fcf = [{"year": "TTM", "fcf": round(current_fcf)}]

    growths = []
    for i in range(1, len(historical_fcf)):
        prev = historical_fcf[i-1]["fcf"]
        curr = historical_fcf[i]["fcf"]
        if prev and prev > 0 and curr > 0:
            g = (curr - prev) / prev
            growths.append(g)
            historical_fcf[i]["growth"] = round(g * 100, 1)

    hist_avg_growth = _trimmean(growths) if growths else 0.07
    return historical_fcf, hist_avg_growth


def compute_dcf(info, income, balance, cashflow, val_defaults=None):
    """Pure DCF valuation: WACC → single growth rate → Future FCF → discount → IV/share."""
    try:
        vd = val_defaults or {}
        mos_factor = 1 - (vd.get("marginOfSafety", 25) / 100)
        perp_growth = vd.get("terminalGrowth", PERPETUAL_GROWTH * 100) / 100
        rf = vd.get("riskFreeRate", RISK_FREE_RATE * 100) / 100
        mr = vd.get("marketReturn", MARKET_RETURN * 100) / 100
        wacc, wacc_details = _compute_wacc(info, income, val_defaults=val_defaults)
        if wacc is None:
            return None

        beta = wacc_details["beta"]
        cost_of_equity = wacc_details["costOfEquity"]
        cost_of_debt = wacc_details["costOfDebt"]
        tax_rate = wacc_details["taxRate"]
        debt_weight = wacc_details["debtWeight"]
        equity_weight = wacc_details["equityWeight"]
        total_debt = wacc_details["totalDebt"]

        historical_fcf, hist_avg_growth = _compute_historical_fcf(info, cashflow)
        if not historical_fcf:
            return None

        # Single growth rate for projection (conservative: avg × 0.7)
        growth_rate = hist_avg_growth * 0.7
        growth_rate = max(-0.05, min(growth_rate, 0.30))  # cap

        base_fcf = historical_fcf[-1]["fcf"]
        if base_fcf <= 0:
            base_fcf = info.get("freeCashflow") or 0
        if base_fcf <= 0:
            return None

        price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        total_cash = info.get("totalCash") or 0
        shares = info.get("sharesOutstanding") or 0
        if shares <= 0:
            return None

        # Project 9 years of future FCF
        projected_fcf = []
        pv_sum = 0
        fcf_val = base_fcf
        for yr in range(1, 10):
            fcf_val = fcf_val * (1 + growth_rate)
            discount = (1 + wacc) ** yr
            pv = fcf_val / discount
            pv_sum += pv
            projected_fcf.append({"year": yr, "fcf": round(fcf_val), "pvFcf": round(pv)})

        # Terminal value (Gordon Growth)
        if wacc <= perp_growth:
            return None
        terminal = fcf_val * (1 + perp_growth) / (wacc - perp_growth)
        pv_terminal = terminal / ((1 + wacc) ** 9)

        enterprise_val = pv_sum + pv_terminal
        equity_val = enterprise_val - total_debt + total_cash
        iv = equity_val / shares
        mos_iv = iv * mos_factor
        upside = ((mos_iv - price) / price * 100) if price > 0 else 0

        return {
            "riskFreeRate": round(rf * 100, 2),
            "marketReturn": round(mr * 100, 2),
            "beta": round(beta, 2),
            "costOfEquity": round(cost_of_equity * 100, 2),
            "costOfDebt": round(cost_of_debt * 100, 2),
            "wacc": round(wacc * 100, 2),
            "taxRate": round(tax_rate * 100, 1),
            "debtToCapital": round(debt_weight * 100, 1),
            "equityToCapital": round(equity_weight * 100, 1),
            "historicalFcf": historical_fcf,
            "histAvgGrowth": round(hist_avg_growth * 100, 1),
            "growthRate": round(growth_rate * 100, 1),
            "projectedFcf": projected_fcf,
            "terminalValue": round(terminal),
            "pvTerminal": round(pv_terminal),
            "enterpriseValue": round(enterprise_val),
            "equityValue": round(equity_val),
            "ivPerShare": round(iv, 2),
            "marginOfSafetyIv": round(mos_iv, 2),
            "upside": round(upside, 1),
            "signal": _upside_signal(upside),
        }
    except Exception as e:
        print(f"[DCF] Error: {e}")
        return None


def _run_dcf_scenario(fcf_ps, growth1, growth2, terminal_factor, discount_rate):
    """Run one DCF scenario: two-phase growth (yr 1-5 + 6-10) + terminal multiple."""
    year_by_year = []
    current_fcf = fcf_ps
    pv_sum = 0

    for yr in range(1, 11):
        g = growth1 if yr <= 5 else growth2
        current_fcf = current_fcf * (1 + g)
        pv = current_fcf / ((1 + discount_rate) ** yr)
        pv_sum += pv
        year_by_year.append({"year": yr, "fcfPS": round(current_fcf, 4), "pv": round(pv, 4)})

    terminal_value = current_fcf * terminal_factor
    pv_terminal = terminal_value / ((1 + discount_rate) ** 10)
    iv = pv_sum + pv_terminal

    return {
        "yearByYear": year_by_year,
        "terminalValue": round(terminal_value, 2),
        "pvTerminal": round(pv_terminal, 2),
        "ivPerShare": round(iv, 2),
    }


def compute_dcf_scenarios(info, income, balance, cashflow, val_defaults=None):
    """DCF scenario-based two-phase growth valuation using FCF per share.

    Three weighted scenarios (Base 50%, Best 25%, Worst 25%),
    each with two-phase growth (years 1-5, years 6-10) and terminal multiple.
    """
    try:
        vd = val_defaults or {}
        mos_factor = 1 - (vd.get("marginOfSafety", 25) / 100)
        fcf = info.get("freeCashflow") or 0
        shares = info.get("sharesOutstanding") or 0
        if fcf <= 0 or shares <= 0:
            return None
        fcf_ps = fcf / shares
        price = info.get("currentPrice") or info.get("regularMarketPrice", 0)

        # WACC as default discount rate
        wacc, _ = _compute_wacc(info, income, val_defaults=val_defaults)
        if wacc is None:
            wacc = 0.10
        discount_rate = wacc

        # Historical growth for defaults
        _, hist_avg_growth = _compute_historical_fcf(info, cashflow)

        # Default scenario parameters
        # When growth is negative, swap best/worst factors so Best = least negative
        if hist_avg_growth >= 0:
            best_factor, worst_factor = 1.0, 0.3
        else:
            best_factor, worst_factor = 0.3, 1.0

        base_g1 = max(-0.05, min(hist_avg_growth * 0.7, 0.35))
        best_g1 = max(-0.05, min(hist_avg_growth * best_factor, 0.35))
        worst_g1 = max(-0.05, min(hist_avg_growth * worst_factor, 0.35))

        scenario_defs = {
            "base": {
                "growth1": base_g1, "growth2": base_g1 * 0.6,
                "terminalFactor": 15, "probability": 50,
            },
            "best": {
                "growth1": best_g1, "growth2": best_g1 * 0.8,
                "terminalFactor": 20, "probability": 25,
            },
            "worst": {
                "growth1": worst_g1, "growth2": worst_g1 * 0.5,
                "terminalFactor": 10, "probability": 25,
            },
        }

        # Cap growth2 values
        for sd in scenario_defs.values():
            sd["growth2"] = max(-0.05, min(sd["growth2"], 0.25))

        scenarios = {}
        composite_iv = 0
        for name, sd in scenario_defs.items():
            result = _run_dcf_scenario(
                fcf_ps, sd["growth1"], sd["growth2"],
                sd["terminalFactor"], discount_rate
            )
            scenarios[name] = {
                "growth1_5": round(sd["growth1"] * 100, 1),
                "growth6_10": round(sd["growth2"] * 100, 1),
                "terminalFactor": sd["terminalFactor"],
                "probability": sd["probability"],
                **result,
            }
            composite_iv += result["ivPerShare"] * (sd["probability"] / 100)

        mos_iv = composite_iv * mos_factor
        upside = ((mos_iv - price) / price * 100) if price > 0 else 0

        return {
            "fcfPerShare": round(fcf_ps, 2),
            "price": round(price, 2),
            "discountRate": round(discount_rate * 100, 2),
            "wacc": round(wacc * 100, 2),
            "scenarios": scenarios,
            "compositeIv": round(composite_iv, 2),
            "marginOfSafetyIv": round(mos_iv, 2),
            "ivPerShare": round(composite_iv, 2),
            "upside": round(upside, 1),
            "signal": _upside_signal(upside),
        }
    except Exception as e:
        print(f"[DCF Scenarios] Error: {e}")
        return None


def compute_graham(info, aaa_yield_live=None, aaa_date=None, val_defaults=None):
    """Graham Revised Formula: IV = EPS × (basePE + Cg × g) × Y / C"""
    try:
        vd = val_defaults or {}
        mos_factor = 1 - (vd.get("marginOfSafety", 25) / 100)
        eps = info.get("trailingEps") or 0
        if eps <= 0:
            return {"negativeEps": True, "eps": round(eps, 2)}

        # Growth rate: earningsGrowth from FMP (decimal, e.g. 0.15 = 15%), cap to avoid inflated IVs
        raw_g = (info.get("earningsGrowth") or 0) * 100
        g = max(0, min(raw_g, GRAHAM_GROWTH_CAP)) if raw_g > 0 else 5.0

        base_pe = GRAHAM_BASE_PE
        cg = GRAHAM_CG
        aaa_current = aaa_yield_live or AAA_YIELD_CURRENT
        adjusted_multiple = base_pe + cg * g
        bond_adjustment = AAA_YIELD_BASELINE / aaa_current
        iv = eps * adjusted_multiple * bond_adjustment
        if iv <= 0:
            return {"negativeEps": True, "eps": round(eps, 2)}

        mos_iv = iv * mos_factor
        price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        upside = ((mos_iv - price) / price * 100) if price > 0 else 0

        return {
            "eps": round(eps, 2),
            "growthRate": round(g, 1),
            "basePE": base_pe,
            "cg": cg,
            "adjustedMultiple": round(adjusted_multiple, 1),
            "aaaYieldBaseline": AAA_YIELD_BASELINE,
            "aaaYieldCurrent": round(aaa_current, 2),
            "aaaYieldDate": aaa_date,
            "bondAdjustment": round(bond_adjustment, 4),
            "ivPerShare": round(iv, 2),
            "marginOfSafetyIv": round(mos_iv, 2),
            "upside": round(upside, 1),
            "signal": _upside_signal(upside),
        }
    except Exception as e:
        print(f"[Graham] Error: {e}")
        return None


def compute_relative(info, val_defaults=None):
    """Relative valuation using sector average multiples.

    All financial inputs (EPS, book value, EV, EBITDA, shares) come from FMP
    via the unified info dict. Sector averages are hardcoded defaults
    (editable in the frontend).
    """
    try:
        vd = val_defaults or {}
        mos_factor = 1 - (vd.get("marginOfSafety", 25) / 100)
        sector = info.get("sector", "")
        avgs = SECTOR_AVERAGES.get(sector)
        if not avgs:
            for k, v in SECTOR_AVERAGES.items():
                if k.lower() in sector.lower() or sector.lower() in k.lower():
                    avgs = v
                    break
        if not avgs:
            avgs = {"pe": 20, "evEbitda": 13, "pb": 3}

        eps = info.get("trailingEps") or 0
        book_val = info.get("bookValue") or 0
        price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        shares = info.get("sharesOutstanding") or 0

        # EV/EBITDA → implied price
        ev = info.get("enterpriseValue") or 0
        ev_ebitda = info.get("enterpriseToEbitda") or 0
        ebitda = (ev / ev_ebitda) if ev_ebitda and ev_ebitda > 0 else 0
        ebitda_per_share = (ebitda / shares) if shares > 0 else 0

        metrics = []
        implied_prices = []

        # P/E implied
        stock_pe = info.get("trailingPE") or 0
        pe_implied = avgs["pe"] * eps if eps > 0 else 0
        metrics.append({
            "name": "P/E", "stockVal": round(stock_pe, 1),
            "sectorAvg": avgs["pe"],
            "impliedPrice": round(pe_implied, 2)
        })
        if pe_implied > 0:
            implied_prices.append(pe_implied)

        # EV/EBITDA implied
        stock_ev_ebitda = ev_ebitda
        ev_implied = avgs["evEbitda"] * ebitda_per_share if ebitda_per_share > 0 else 0
        metrics.append({
            "name": "EV/EBITDA", "stockVal": round(stock_ev_ebitda, 1),
            "sectorAvg": avgs["evEbitda"],
            "impliedPrice": round(ev_implied, 2)
        })
        if ev_implied > 0:
            implied_prices.append(ev_implied)

        # P/B implied
        stock_pb = info.get("priceToBook") or 0
        pb_implied = avgs["pb"] * book_val if book_val > 0 else 0
        metrics.append({
            "name": "P/B", "stockVal": round(stock_pb, 1),
            "sectorAvg": avgs["pb"],
            "impliedPrice": round(pb_implied, 2)
        })
        if pb_implied > 0:
            implied_prices.append(pb_implied)

        if not implied_prices:
            return None

        iv = sum(implied_prices) / len(implied_prices)
        mos_iv = iv * mos_factor
        upside = ((mos_iv - price) / price * 100) if price > 0 else 0

        return {
            "sector": sector,
            "sectorDefaults": dict(avgs),
            "metrics": metrics,
            "eps": round(eps, 2),
            "bookValue": round(book_val, 2),
            "ebitdaPerShare": round(ebitda_per_share, 2),
            "ivPerShare": round(iv, 2),
            "marginOfSafetyIv": round(mos_iv, 2),
            "upside": round(upside, 1),
            "signal": _upside_signal(upside),
        }
    except Exception as e:
        print(f"[Relative] Error: {e}")
        return None


def compute_valuation_summary(dcf, graham, relative, dcf_scenarios, info, val_defaults=None):
    """Composite weighted IV based on stock category (Growth/Value/Blend)."""
    try:
        vd = val_defaults or {}
        mos_factor = 1 - (vd.get("marginOfSafety", 25) / 100)
        pe = info.get("trailingPE") or 0
        rev_growth = (info.get("revenueGrowth") or 0) * 100
        div_yield = info.get("dividendYield") or 0

        # Categorize stock to assign model weights
        if pe > 22 and rev_growth > 12:
            category = "Growth"
            weights = {"dcf": 0.30, "graham": 0.10, "relative": 0.10, "dcfScenarios": 0.50}
        elif (pe > 0 and pe < 24 and div_yield > 1.5) or (pe > 0 and pe < 16):
            category = "Value"
            weights = {"dcf": 0.15, "graham": 0.30, "relative": 0.25, "dcfScenarios": 0.30}
        else:
            category = "Blend"
            weights = {"dcf": 0.25, "graham": 0.20, "relative": 0.20, "dcfScenarios": 0.35}

        # Collect valid IVs
        models = {}
        if dcf and dcf.get("ivPerShare", 0) > 0:
            models["dcf"] = dcf["ivPerShare"]
        if graham and graham.get("ivPerShare", 0) > 0:
            models["graham"] = graham["ivPerShare"]
        if relative and relative.get("ivPerShare", 0) > 0:
            models["relative"] = relative["ivPerShare"]
        if dcf_scenarios and dcf_scenarios.get("ivPerShare", 0) > 0:
            models["dcfScenarios"] = dcf_scenarios["ivPerShare"]

        if not models:
            return None

        # Normalize weights for available models
        total_w = sum(weights[k] for k in models)
        if total_w <= 0:
            return None
        composite = sum(models[k] * weights[k] / total_w for k in models)
        mos_iv = composite * mos_factor

        price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        upside = ((mos_iv - price) / price * 100) if price > 0 else 0

        return {
            "category": category,
            "weights": weights,
            "models": {k: round(v, 2) for k, v in models.items()},
            "compositeIv": round(composite, 2),
            "marginOfSafetyIv": round(mos_iv, 2),
            "upside": round(upside, 1),
            "signal": _upside_signal(upside),
        }
    except Exception as e:
        print(f"[ValuationSummary] Error: {e}")
        return None
