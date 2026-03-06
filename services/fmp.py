"""
InvToolkit — Financial Modeling Prep (FMP) API helpers.
Fetches financial statements, DCF, benchmarks, and FRED AAA yield.
"""

import requests as http_requests

from config import FMP_API_KEY, FMP_BASE, AAA_YIELD_CURRENT


def _fmp_get(endpoint, **params):
    """Call FMP stable API. Returns parsed JSON or None on error."""
    params["apikey"] = FMP_API_KEY
    try:
        r = http_requests.get(f"{FMP_BASE}/{endpoint}", params=params, timeout=15)
        data = r.json()
        if isinstance(data, dict) and "Error Message" in data:
            print(f"[FMP] Error on {endpoint}: {data['Error Message'][:80]}")
            return None
        return data
    except Exception as e:
        print(f"[FMP] Request failed for {endpoint}: {e}")
        return None


def _fetch_fmp_dcf(symbol):
    """Fetch FMP's own DCF intrinsic value as an external benchmark."""
    data = _fmp_get("discounted-cash-flow", symbol=symbol)
    if data and isinstance(data, list) and len(data) > 0:
        return round(data[0].get("dcf", 0), 2)
    return None


def _fetch_fmp_benchmarks(symbol):
    """Fetch FMP key-metrics, ratings, and financial-scores in one call set."""
    result = {}
    # Key metrics → Graham Number, earnings yield, FCF yield, ROIC
    km = _fmp_get("key-metrics", symbol=symbol, period="annual")
    if km and isinstance(km, list) and len(km) > 0:
        latest = km[0]
        result["grahamNumber"] = round(latest.get("grahamNumber", 0) or 0, 2)
        result["earningsYield"] = round((latest.get("earningsYield", 0) or 0) * 100, 2)
        result["freeCashFlowYield"] = round((latest.get("freeCashFlowYield", 0) or 0) * 100, 2)
        result["roic"] = round((latest.get("returnOnInvestedCapital", 0) or 0) * 100, 2)

    # Ratings snapshot → overall letter grade + subscores
    rt = _fmp_get("ratings-snapshot", symbol=symbol)
    if rt and isinstance(rt, list) and len(rt) > 0:
        r = rt[0]
        result["rating"] = r.get("rating", "")
        result["ratingScore"] = r.get("overallScore", 0)
        result["ratingDcfScore"] = r.get("discountedCashFlowScore", 0)
        result["ratingPeScore"] = r.get("priceToEarningsScore", 0)
        result["ratingPbScore"] = r.get("priceToBookScore", 0)

    # Financial scores → Altman Z-Score, Piotroski Score
    fs = _fmp_get("financial-scores", symbol=symbol)
    if fs and isinstance(fs, list) and len(fs) > 0:
        f = fs[0]
        result["altmanZScore"] = round(f.get("altmanZScore", 0) or 0, 2)
        result["piotroskiScore"] = f.get("piotroskiScore", 0)

    return result


def _fetch_fred_aaa_yield():
    """Fetch latest AAA corporate bond yield from FRED (no API key needed).
    Returns (value, date_str) e.g. (5.30, '2026-02-01').
    """
    try:
        url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=AAA&cosd=2025-01-01"
        r = http_requests.get(url, timeout=10)
        lines = r.text.strip().split("\n")
        if len(lines) >= 2:
            parts = lines[-1].split(",")
            return float(parts[1]), parts[0]
    except Exception as e:
        print(f"[FRED] Failed to fetch AAA yield: {e}")
    return AAA_YIELD_CURRENT, None  # fallback to constant


def _fetch_fmp_stock_data(ticker):
    """Fetch FMP financial data for valuation models (5 API calls).
    Profile/ratios come from yfinance to save FMP quota.
    """
    return {
        "income": _fmp_get("income-statement", symbol=ticker, period="annual"),
        "cashflow": _fmp_get("cash-flow-statement", symbol=ticker, period="annual"),
        "balance": _fmp_get("balance-sheet-statement", symbol=ticker, period="annual"),
        "ev": _fmp_get("enterprise-values", symbol=ticker, period="annual"),
        "growth": _fmp_get("financial-growth", symbol=ticker, period="annual"),
    }


def _fmp_to_info(fmp, yf_info):
    """Build unified info dict: FMP for financials, yfinance for profile/ratios.

    FMP provides 5 years of financial statements (vs yfinance 4) and
    is the uniform source for DCF inputs. yfinance fills profile fields,
    ratios, and supplementary data not available on FMP free tier.
    """
    inc0 = fmp["income"][0] if fmp.get("income") else {}
    cf0 = fmp["cashflow"][0] if fmp.get("cashflow") else {}
    bal0 = fmp["balance"][0] if fmp.get("balance") else {}
    ev0 = fmp["ev"][0] if fmp.get("ev") else {}
    gr0 = fmp["growth"][0] if fmp.get("growth") else {}

    shares = ev0.get("numberOfShares") or inc0.get("weightedAverageShsOut") or 0

    # Start with yfinance as base, then override financial fields from FMP
    info = dict(yf_info)
    # Derived ratios from FMP data (for Relative valuation)
    ebitda = inc0.get("ebitda", 0) or 0
    ev_val = ev0.get("enterpriseValue", 0) or 0
    equity = bal0.get("totalStockholdersEquity", 0) or 0
    eps = inc0.get("epsDiluted", 0) or 0
    price = yf_info.get("currentPrice") or yf_info.get("regularMarketPrice", 0)
    book_per_share = (equity / shares) if shares > 0 else 0
    ev_ebitda = (ev_val / ebitda) if ebitda > 0 else 0
    pe = (price / eps) if eps > 0 else 0
    pb = (price / book_per_share) if book_per_share > 0 else 0

    info.update({
        # FMP financial data (uniform source for DCF + Graham + Relative)
        "totalDebt": bal0.get("totalDebt", 0),
        "totalCash": bal0.get("cashAndCashEquivalents", 0),
        "freeCashflow": cf0.get("freeCashFlow", 0),
        "operatingCashflow": cf0.get("operatingCashFlow", 0),
        "trailingEps": eps,
        "totalRevenue": inc0.get("revenue", 0),
        "sharesOutstanding": shares,
        "enterpriseValue": ev_val,
        "earningsGrowth": gr0.get("epsgrowth", 0),  # FMP: decimal (e.g. 0.15 = 15%)
        # Derived ratios from FMP (override yfinance for source consistency)
        "bookValue": round(book_per_share, 2),
        "enterpriseToEbitda": round(ev_ebitda, 2),
        "trailingPE": round(pe, 2),
        "priceToBook": round(pb, 2),
    })
    return info


def _fmp_to_financials(fmp):
    """Translate FMP financial statements → yfinance-format dicts keyed by year."""
    income = {}
    for row in (fmp.get("income") or []):
        year = row.get("date", "")[:4]
        if not year:
            continue
        income[year] = {
            "Pretax Income": row.get("incomeBeforeTax", 0),
            "Tax Provision": row.get("incomeTaxExpense", 0),
            "Interest Expense": row.get("interestExpense", 0),
        }

    cashflow = {}
    for row in (fmp.get("cashflow") or []):
        year = row.get("date", "")[:4]
        if not year:
            continue
        cashflow[year] = {
            "Operating Cash Flow": row.get("operatingCashFlow", 0),
            "Capital Expenditure": row.get("capitalExpenditure", 0),
        }

    balance = {}
    for row in (fmp.get("balance") or []):
        year = row.get("date", "")[:4]
        if not year:
            continue
        balance[year] = {
            "Total Debt": row.get("totalDebt", 0),
            "Cash And Cash Equivalents": row.get("cashAndCashEquivalents", 0),
            "Stockholders Equity": row.get("totalStockholdersEquity", 0),
        }

    return income, cashflow, balance
