"""
InvToolkit — Data contracts for provider-agnostic field names.

This module formalizes the canonical field names the app already uses.
It defines the standard data shapes that all provider transforms
(yfinance, SEC EDGAR, FMP) must produce, so consumers (valuation models,
routes, frontend) can rely on a stable interface.

Three contracts are defined:

    QUOTE_FIELDS   — lightweight quote data for portfolio/watchlist display.
                     Produced by yfinance_svc.fetch_ticker_data().

    INFO_FIELDS    — deep fundamental data for valuation models (DCF,
                     Graham, Relative) and the Stock Analyzer response.
                     Produced by _edgar_to_info() and _fmp_to_info(),
                     both of which start from raw yfinance info and
                     overlay financial-statement-derived values.

    FINANCIAL_FIELDS — year-keyed financial statement field names used
                       in income, cashflow, and balance dicts consumed
                       by valuation models.  These are string keys
                       (e.g. "Pretax Income") matching yfinance DataFrame
                       index labels.

Dividend yield convention
-------------------------
yfinance 1.2+ returns ``dividendYield`` as a direct percentage:
0.39 means 0.39 %, **not** a decimal.  Do NOT multiply by 100.
Both QUOTE_FIELDS (``divYield``) and INFO_FIELDS (``dividendYield``)
follow this convention.
"""

# ---------------------------------------------------------------------------
# QUOTE_FIELDS — portfolio / watchlist quote display
# ---------------------------------------------------------------------------
# Produced by: services/yfinance_svc.fetch_ticker_data()
# Consumed by: routes/portfolio.py (api_portfolio, api_watchlist)
#
# Default values are zero / empty-string so missing data never crashes
# the frontend formatters (formatMoney, formatPercent, etc.).

QUOTE_FIELDS = {
    "price":              0,      # Current or last traded price
    "previousClose":      0,      # Previous session close
    "changePercent":      0,      # Intraday change (%)
    "name":               "",     # Company / ETF long name
    "marketCap":          0,      # Market capitalisation (USD)
    "pe":                 0,      # Trailing P/E ratio
    "forwardPE":          0,      # Forward P/E ratio
    "sector":             "",     # GICS sector
    "industry":           "",     # GICS industry
    "divYield":           0,      # Dividend yield (%), 0.39 = 0.39 %
    "divRate":            0,      # Annual dividend per share (USD)
    "beta":               0,      # 5-year beta vs S&P 500
    "fiftyTwoWeekHigh":   0,      # 52-week high
    "fiftyTwoWeekLow":    0,      # 52-week low
    "targetMeanPrice":    0,      # Analyst consensus target price
    "country":            "",     # Domicile country
    "currency":           "USD",  # Trading currency
}


# ---------------------------------------------------------------------------
# INFO_FIELDS — deep fundamentals for valuation models & analyzer
# ---------------------------------------------------------------------------
# Produced by: services/edgar._edgar_to_info()
#              services/fmp._fmp_to_info()
#              (both start from yfinance info and overlay financials)
# Consumed by: models/valuation.py  (DCF, Graham, Relative, Summary)
#              routes/analysis.py    (Stock Analyzer response)
#
# INFO_FIELDS is intentionally a *superset* — validate_info() fills
# missing keys with defaults but never strips extra keys, because
# valuation models may access additional yfinance-only fields
# (e.g. pegRatio, shortRatio, floatShares) that are not overridden
# by EDGAR/FMP transforms.
#
# Dividend yield convention: same as QUOTE_FIELDS — 0.39 = 0.39 %.

INFO_FIELDS = {
    # ── Price & identity ──────────────────────────────────────────────
    "currentPrice":               0,      # Current price (yfinance primary)
    "regularMarketPrice":         0,      # Current price (yfinance fallback)
    "longName":                   "",     # Full company name
    "shortName":                  "",     # Abbreviated name (fallback)
    "sector":                     "",     # GICS sector
    "industry":                   "",     # GICS industry
    "country":                    "",     # Domicile country
    "currency":                   "USD",  # Trading currency

    # ── Market data ───────────────────────────────────────────────────
    "marketCap":                  0,      # Market capitalisation
    "enterpriseValue":            0,      # EV = mktCap + debt - cash
    "sharesOutstanding":          0,      # Diluted shares outstanding
    "floatShares":                0,      # Public float
    "beta":                       0,      # 5-year beta

    # ── Per-share metrics ─────────────────────────────────────────────
    "trailingEps":                0,      # Trailing 12-month EPS
    "forwardEps":                 0,      # Forward EPS estimate
    "bookValue":                  0,      # Book value per share
    "revenuePerShare":            0,      # Revenue per share (TTM)

    # ── Valuation ratios ──────────────────────────────────────────────
    "trailingPE":                 0,      # Trailing P/E
    "forwardPE":                  0,      # Forward P/E
    "pegRatio":                   0,      # PEG ratio
    "priceToBook":                0,      # Price / Book
    "priceToSalesTrailing12Months": 0,    # Price / Sales (TTM)
    "enterpriseToEbitda":         0,      # EV / EBITDA
    "enterpriseToRevenue":        0,      # EV / Revenue

    # ── Profitability margins (decimal, e.g. 0.25 = 25 %) ────────────
    "profitMargins":              0,      # Net profit margin
    "operatingMargins":           0,      # Operating margin
    "grossMargins":               0,      # Gross margin

    # ── Returns (decimal, e.g. 0.15 = 15 %) ──────────────────────────
    "returnOnEquity":             0,      # ROE
    "returnOnAssets":             0,      # ROA

    # ── Growth (decimal, e.g. 0.15 = 15 %) ───────────────────────────
    "earningsGrowth":             0,      # YoY EPS growth
    "revenueGrowth":              0,      # YoY revenue growth

    # ── Balance sheet ─────────────────────────────────────────────────
    "totalDebt":                  0,      # Total debt
    "totalCash":                  0,      # Cash & equivalents
    "debtToEquity":               0,      # Debt / Equity ratio
    "currentRatio":               0,      # Current ratio
    "quickRatio":                 0,      # Quick ratio

    # ── Cash flow ─────────────────────────────────────────────────────
    "freeCashflow":               0,      # Free cash flow (TTM)
    "operatingCashflow":          0,      # Operating cash flow (TTM)
    "totalRevenue":               0,      # Total revenue (TTM)

    # ── Dividends ─────────────────────────────────────────────────────
    # dividendYield: yfinance 1.2+ returns percentage directly
    #   0.39 = 0.39 %, NOT a decimal.  Do NOT multiply by 100.
    "dividendYield":              0,      # Trailing annual yield (%)
    "dividendRate":               0,      # Annual dividend per share
    "payoutRatio":                0,      # Payout ratio (decimal)
    "fiveYearAvgDividendYield":   0,      # 5-year average yield (%)

    # ── Analyst estimates ─────────────────────────────────────────────
    "targetMeanPrice":            0,      # Consensus target price
    "targetHighPrice":            0,      # Highest analyst target
    "targetLowPrice":             0,      # Lowest analyst target
    "numberOfAnalystOpinions":    0,      # Number of analysts
    "recommendationKey":          "",     # e.g. "buy", "hold", "sell"

    # ── Technical ─────────────────────────────────────────────────────
    "fiftyTwoWeekHigh":           0,      # 52-week high
    "fiftyTwoWeekLow":            0,      # 52-week low
    "fiftyDayAverage":            0,      # 50-day SMA
    "twoHundredDayAverage":       0,      # 200-day SMA
    "shortRatio":                 0,      # Short interest ratio
    "previousClose":              0,      # Previous close
}


# ---------------------------------------------------------------------------
# FINANCIAL_FIELDS — year-keyed financial statement field names
# ---------------------------------------------------------------------------
# Produced by: services/edgar._edgar_to_financials()
#              services/fmp._fmp_to_financials()
#              (yfinance fallback in routes/analysis.py)
# Consumed by: models/valuation.py (compute_dcf, _compute_wacc,
#              _compute_historical_fcf)
#
# Each dict maps the canonical string key to its default value.
# The keys are the exact strings used as dict keys inside
# year-keyed dicts (e.g. income["2024"]["Pretax Income"]).
#
# Capital Expenditure: EDGAR reports capex as positive (payments);
# the EDGAR transform negates it so all providers deliver negative
# capex (outflow convention).

INCOME_FIELDS = {
    "Pretax Income":    0,   # Income before taxes
    "Tax Provision":    0,   # Income tax expense
    "Interest Expense": 0,   # Interest expense
}

CASHFLOW_FIELDS = {
    "Operating Cash Flow":  0,   # Cash from operations
    "Capital Expenditure":  0,   # Capex (negative = outflow)
}

BALANCE_FIELDS = {
    "Total Debt":                  0,   # Total debt
    "Cash And Cash Equivalents":   0,   # Cash & equivalents
    "Stockholders Equity":         0,   # Total stockholders' equity
}

# Convenience grouping for documentation and iteration
FINANCIAL_FIELDS = {
    "income":   INCOME_FIELDS,
    "cashflow": CASHFLOW_FIELDS,
    "balance":  BALANCE_FIELDS,
}


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def validate_quote(data):
    """Return a new dict containing exactly the QUOTE_FIELDS keys.

    Values present in *data* are used; missing keys are filled with
    their defaults from QUOTE_FIELDS.  Extra keys in *data* that are
    not part of QUOTE_FIELDS are **dropped** — the quote shape is
    strict because it is sent directly to the frontend.

    >>> validate_quote({"price": 150.0, "extra": True})
    {'price': 150.0, 'previousClose': 0, ..., 'currency': 'USD'}
    """
    return {k: data.get(k, default) for k, default in QUOTE_FIELDS.items()}


def validate_info(data):
    """Return a dict with all INFO_FIELDS defaults filled in.

    Keys already present in *data* are **preserved as-is** (including
    any extra keys not in INFO_FIELDS).  Missing INFO_FIELDS keys are
    added with their default values.  This ensures valuation models
    never crash on a missing key, while additional yfinance fields
    (e.g. ``pegRatio``, ``shortRatio``) remain available.

    >>> d = validate_info({"currentPrice": 150.0, "pegRatio": 1.2})
    >>> d["currentPrice"]
    150.0
    >>> d["totalDebt"]  # filled with default
    0
    >>> d["pegRatio"]   # extra key preserved
    1.2
    """
    return {
        **{k: default for k, default in INFO_FIELDS.items() if k not in data},
        **data,
    }


def validate_financials(year_dict, statement_type):
    """Fill missing financial statement fields for a single year's data.

    *statement_type* is one of ``"income"``, ``"cashflow"``, ``"balance"``.
    Returns a new dict with all expected fields for that statement type,
    using values from *year_dict* where present and defaults otherwise.

    >>> validate_financials({"Pretax Income": 5000}, "income")
    {'Pretax Income': 5000, 'Tax Provision': 0, 'Interest Expense': 0}
    """
    template = FINANCIAL_FIELDS.get(statement_type, {})
    return {k: year_dict.get(k, default) for k, default in template.items()}
