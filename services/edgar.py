"""
InvToolkit — SEC EDGAR XBRL company-facts helpers.
Fetches and translates XBRL data into unified info/financials dicts.
"""

from config import EDGAR_USER_AGENT, EDGAR_FACTS_URL, EDGAR_TICKERS_URL
from services.http_client import resilient_get

_cik_map = {}  # ticker -> zero-padded CIK string, loaded once


def _load_cik_map():
    """Load SEC ticker->CIK mapping (~10k entries). Called once on first use."""
    global _cik_map
    if _cik_map:
        return
    try:
        r = resilient_get(
            EDGAR_TICKERS_URL,
            provider="edgar",
            headers={"User-Agent": EDGAR_USER_AGENT},
            timeout=15,
        )
        data = r.json()
        for entry in data.values():
            ticker = entry.get("ticker", "").upper()
            cik = str(entry.get("cik_str", "")).zfill(10)
            if ticker:
                _cik_map[ticker] = cik
        print(f"[EDGAR] Loaded {len(_cik_map)} ticker->CIK mappings")
    except Exception as e:
        print(f"[EDGAR] Failed to load CIK map: {e}")


def _get_cik(ticker):
    """Get zero-padded CIK for a ticker. Returns str or None."""
    if not _cik_map:
        _load_cik_map()
    return _cik_map.get(ticker.upper())


def _fetch_edgar_facts(ticker):
    """Fetch ALL XBRL data from SEC EDGAR companyfacts (1 call, ~3-7MB).
    Returns the 'facts' sub-dict or None on failure."""
    cik = _get_cik(ticker)
    if not cik:
        print(f"[EDGAR] No CIK found for {ticker}")
        return None
    try:
        url = EDGAR_FACTS_URL.format(cik=cik)
        r = resilient_get(
            url,
            provider="edgar",
            headers={"User-Agent": EDGAR_USER_AGENT},
            timeout=20,
        )
        if r.status_code != 200:
            print(f"[EDGAR] HTTP {r.status_code} for {ticker} (CIK {cik})")
            return None
        return r.json().get("facts")
    except Exception as e:
        print(f"[EDGAR] Request failed for {ticker}: {e}")
        return None


def _edgar_annual_values(facts, tag, unit="USD", ns="us-gaap", max_years=10):
    """Extract annual 10-K values for an XBRL tag.

    Filters: form=10-K, fp=FY. Deduplicates by end date (latest filed wins).
    Returns: {"2024": val, "2023": val, ...} limited to max_years.
    """
    entries = facts.get(ns, {}).get(tag, {}).get("units", {}).get(unit, [])
    by_end = {}
    for e in entries:
        if e.get("form") != "10-K" or e.get("fp") != "FY":
            continue
        end = e.get("end", "")
        if len(end) < 4:
            continue
        val = e.get("val")
        if val is None:
            continue
        filed = e.get("filed", "")
        if end not in by_end or filed > by_end[end][1]:
            by_end[end] = (val, filed)
    by_year = {end[:4]: v for end, (v, _) in by_end.items()}
    return {y: by_year[y] for y in sorted(by_year, reverse=True)[:max_years]}


def _edgar_latest(facts, tag, **kw):
    """Most recent annual value for a tag. Returns value or 0."""
    vals = _edgar_annual_values(facts, tag, max_years=1, **kw)
    return list(vals.values())[0] if vals else 0


def _edgar_with_fallbacks(facts, tags, **kw):
    """Try multiple XBRL tag names in order, return first non-empty."""
    for tag in tags:
        result = _edgar_annual_values(facts, tag, **kw)
        if result:
            return result
    return {}


def _edgar_merge_tags(facts, tags, **kw):
    """Merge data from multiple XBRL tags, filling gaps from later tags.
    Useful when companies change XBRL tags across years (e.g. REITs).
    Trims to max_years most recent entries."""
    max_years = kw.get("max_years", 11)
    merged = {}
    for tag in tags:
        result = _edgar_annual_values(facts, tag, **kw)
        for year, val in result.items():
            if year not in merged:
                merged[year] = val
    if len(merged) > max_years:
        keep = sorted(merged.keys())[-max_years:]
        merged = {y: merged[y] for y in keep}
    return merged


def _edgar_to_info(facts, yf_info):
    """Build unified info dict from EDGAR + yfinance. Mirrors _fmp_to_info()."""
    ocf = _edgar_latest(facts, "NetCashProvidedByUsedInOperatingActivities")
    capex = _edgar_latest(facts, "PaymentsToAcquirePropertyPlantAndEquipment")
    fcf = ocf - capex  # EDGAR capex is positive (payments)

    # Debt: try noncurrent + current, fallback to LongTermDebt
    debt_nc = _edgar_latest(facts, "LongTermDebtNoncurrent")
    debt_c = _edgar_latest(facts, "LongTermDebtCurrent")
    total_debt = debt_nc + debt_c
    if total_debt == 0:
        total_debt = _edgar_latest(facts, "LongTermDebt")

    total_cash = _edgar_latest(facts, "CashAndCashEquivalentsAtCarryingValue")
    equity = _edgar_latest(facts, "StockholdersEquity")
    eps = _edgar_latest(facts, "EarningsPerShareDiluted", unit="USD/shares")

    # Revenue: fallback chain for different accounting standards
    revenue_tags = [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
    ]
    rev_by_year = _edgar_with_fallbacks(facts, revenue_tags, max_years=1)
    revenue = list(rev_by_year.values())[0] if rev_by_year else 0

    # Shares outstanding
    shares = _edgar_latest(facts, "CommonStockSharesOutstanding", unit="shares")
    if not shares:
        shares = _edgar_latest(
            facts, "EntityCommonStockSharesOutstanding",
            unit="shares", ns="dei",
        )

    # Earnings growth: YoY from 2 years of EPS
    eps_by_year = _edgar_annual_values(
        facts, "EarningsPerShareDiluted", unit="USD/shares", max_years=3,
    )
    eps_years = sorted(eps_by_year.keys(), reverse=True)
    earnings_growth = 0
    if len(eps_years) >= 2:
        eps_curr = eps_by_year[eps_years[0]]
        eps_prev = eps_by_year[eps_years[1]]
        if eps_prev and eps_prev > 0:
            earnings_growth = (eps_curr - eps_prev) / eps_prev

    # Enterprise value: marketCap + debt - cash
    market_cap = yf_info.get("marketCap", 0) or 0
    ev_val = market_cap + total_debt - total_cash

    # EBITDA: operating income + D&A
    op_income = _edgar_latest(facts, "OperatingIncomeLoss")
    dda = _edgar_latest(facts, "DepreciationDepletionAndAmortization")
    ebitda = op_income + dda if (op_income or dda) else 0

    # Derived ratios
    price = yf_info.get("currentPrice") or yf_info.get("regularMarketPrice", 0)
    book_per_share = (equity / shares) if shares > 0 else 0
    ev_ebitda = (ev_val / ebitda) if ebitda > 0 else 0
    pe = (price / eps) if eps > 0 else 0
    pb = (price / book_per_share) if book_per_share > 0 else 0

    info = dict(yf_info)
    info.update({
        "totalDebt": total_debt,
        "totalCash": total_cash,
        "freeCashflow": fcf,
        "operatingCashflow": ocf,
        "trailingEps": eps,
        "totalRevenue": revenue,
        "sharesOutstanding": shares,
        "enterpriseValue": ev_val,
        "earningsGrowth": earnings_growth,
        "bookValue": round(book_per_share, 2),
        "enterpriseToEbitda": round(ev_ebitda, 2),
        "trailingPE": round(pe, 2),
        "priceToBook": round(pb, 2),
    })
    return info


def _edgar_to_financials(facts):
    """Translate EDGAR XBRL -> year-keyed dicts. Mirrors _fmp_to_financials().
    Returns (income, cashflow, balance) with up to 10 years of data."""
    # ── Income statement ──
    pretax_tags = [
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    ]
    pretax_by_year = _edgar_with_fallbacks(facts, pretax_tags)
    tax_by_year = _edgar_annual_values(facts, "IncomeTaxExpenseBenefit")
    interest_by_year = _edgar_annual_values(facts, "InterestExpense")

    income = {}
    for year in pretax_by_year:
        income[year] = {
            "Pretax Income": pretax_by_year.get(year, 0),
            "Tax Provision": tax_by_year.get(year, 0),
            "Interest Expense": interest_by_year.get(year, 0),
        }

    # ── Cash flow statement ──
    ocf_by_year = _edgar_annual_values(
        facts, "NetCashProvidedByUsedInOperatingActivities",
    )
    capex_by_year = _edgar_annual_values(
        facts, "PaymentsToAcquirePropertyPlantAndEquipment",
    )
    cashflow = {}
    for year in set(ocf_by_year) | set(capex_by_year):
        raw_capex = capex_by_year.get(year, 0)
        cashflow[year] = {
            "Operating Cash Flow": ocf_by_year.get(year, 0),
            "Capital Expenditure": -abs(raw_capex),  # EDGAR positive -> code expects negative
        }

    # ── Balance sheet ──
    debt_nc = _edgar_annual_values(facts, "LongTermDebtNoncurrent")
    debt_c = _edgar_annual_values(facts, "LongTermDebtCurrent")
    debt_fb = _edgar_annual_values(facts, "LongTermDebt")
    cash_by_year = _edgar_annual_values(facts, "CashAndCashEquivalentsAtCarryingValue")
    equity_by_year = _edgar_annual_values(facts, "StockholdersEquity")

    balance = {}
    for year in set(cash_by_year) | set(equity_by_year):
        debt = debt_nc.get(year, 0) + debt_c.get(year, 0)
        if debt == 0:
            debt = debt_fb.get(year, 0)
        balance[year] = {
            "Total Debt": debt,
            "Cash And Cash Equivalents": cash_by_year.get(year, 0),
            "Stockholders Equity": equity_by_year.get(year, 0),
        }

    return income, cashflow, balance
