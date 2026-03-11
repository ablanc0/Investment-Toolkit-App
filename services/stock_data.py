"""
Stock data orchestrator — provider-agnostic entry point.

Manages a configurable provider cascade for financial data.
Default order: EDGAR -> FMP -> yfinance (configurable in user settings).

To add a new provider:
1. Create services/<provider>_svc.py with fetch + transform functions
2. Add an entry to _PROVIDERS below
3. Add the provider name to PROVIDER_DEFAULTS["financials"] in config.py
"""

import yfinance as yf

from services.http_client import is_circuit_open
from services.edgar import _fetch_edgar_facts, _edgar_to_info, _edgar_to_financials
from services.fmp import _fetch_fmp_stock_data, _fmp_to_info, _fmp_to_financials


# ── Provider Registry ────────────────────────────────────────────────
# Each provider has a fetch function: (ticker, yf_info) -> (info, income, cashflow, balance, source_label) or None

def _try_edgar(ticker, yf_info):
    """Try SEC EDGAR for financial statements."""
    edgar_facts = _fetch_edgar_facts(ticker)
    if not edgar_facts:
        return None
    info = _edgar_to_info(edgar_facts, yf_info)
    income, cashflow, balance = _edgar_to_financials(edgar_facts)
    if not income and not cashflow:
        return None
    print(f"[Analyzer] {ticker}: SEC EDGAR ({len(income)} yr income, {len(cashflow)} yr cashflow)")
    return info, income, cashflow, balance, "SEC EDGAR"


def _try_fmp(ticker, yf_info):
    """Try FMP for financial statements."""
    fmp = _fetch_fmp_stock_data(ticker)
    info = _fmp_to_info(fmp, yf_info)
    income, cashflow, balance = _fmp_to_financials(fmp)
    if not income and not cashflow:
        return None
    return info, income, cashflow, balance, "FMP"


def _try_yfinance(ticker, yf_info):
    """Try yfinance for financial statements (fallback for foreign ADRs)."""
    info = dict(yf_info)
    income, cashflow, balance = {}, {}, {}
    t = yf.Ticker(ticker)

    try:
        cf = t.cashflow
        if cf is not None and not cf.empty:
            for col in cf.columns:
                yr = str(col.year) if hasattr(col, 'year') else str(col)[:4]
                ocf = cf.at["Operating Cash Flow", col] if "Operating Cash Flow" in cf.index else 0
                capex = cf.at["Capital Expenditure", col] if "Capital Expenditure" in cf.index else 0
                cashflow[yr] = {
                    "Operating Cash Flow": int(ocf) if ocf == ocf else 0,
                    "Capital Expenditure": int(capex) if capex == capex else 0,
                }
    except Exception as e:
        print(f"[Analyzer] yfinance cashflow error: {e}")

    try:
        inc = t.income_stmt
        if inc is not None and not inc.empty:
            for col in inc.columns:
                yr = str(col.year) if hasattr(col, 'year') else str(col)[:4]
                pretax = inc.at["Pretax Income", col] if "Pretax Income" in inc.index else 0
                tax = inc.at["Tax Provision", col] if "Tax Provision" in inc.index else 0
                interest = inc.at["Interest Expense", col] if "Interest Expense" in inc.index else 0
                income[yr] = {
                    "Pretax Income": int(pretax) if pretax == pretax else 0,
                    "Tax Provision": int(tax) if tax == tax else 0,
                    "Interest Expense": int(interest) if interest == interest else 0,
                }
    except Exception as e:
        print(f"[Analyzer] yfinance income error: {e}")

    if not income and not cashflow:
        return None
    return info, income, cashflow, balance, "Yahoo Finance"


# Provider registry — maps name to (fetch_fn, circuit_breaker_name)
_PROVIDERS = {
    "edgar":    {"fetch": _try_edgar,    "circuit": "edgar"},
    "fmp":      {"fetch": _try_fmp,      "circuit": "fmp"},
    "yfinance": {"fetch": _try_yfinance, "circuit": None},  # yfinance has no circuit breaker
}


def _get_cascade_order():
    """Get the provider cascade order from user settings, falling back to defaults."""
    from config import PROVIDER_DEFAULTS
    try:
        from services.data_store import get_settings
        settings = get_settings()
        order = settings.get("providerConfig", {}).get("financials")
        if order and isinstance(order, list):
            # Filter to only registered providers
            return [p for p in order if p in _PROVIDERS]
    except Exception:
        pass
    return PROVIDER_DEFAULTS["financials"]


# ── Public API ───────────────────────────────────────────────────────

def fetch_yfinance_profile(ticker):
    """Fetch the full yfinance info dict for a ticker.

    This is the raw yfinance profile (pricing, beta, analyst targets, etc.),
    separate from yfinance_svc.fetch_ticker_data() which returns the
    lightweight QUOTE_FIELDS shape.

    Returns: dict (info dict) or empty dict on failure.
    """
    try:
        return yf.Ticker(ticker).info or {}
    except Exception:
        return {}


def fetch_stock_analysis(ticker):
    """Fetch stock analysis data using the configurable provider cascade.

    Default cascade: EDGAR -> FMP -> yfinance (override via settings.providerConfig.financials)

    Always fetches yfinance profile first (pricing, beta, analyst targets),
    then tries each provider in cascade order for financial statements.

    Returns: dict with keys {info, income, cashflow, balance, data_source}
             or None if the ticker is not found (no price data).
    """
    # Always fetch yfinance profile (free, unlimited, provides pricing/beta/analyst)
    yf_info = fetch_yfinance_profile(ticker)
    if not yf_info.get("currentPrice") and not yf_info.get("regularMarketPrice"):
        return None

    # Try each provider in cascade order
    cascade = _get_cascade_order()
    for provider_name in cascade:
        provider = _PROVIDERS.get(provider_name)
        if not provider:
            continue

        # Skip if circuit breaker is open
        circuit = provider.get("circuit")
        if circuit and is_circuit_open(circuit):
            print(f"[Analyzer] {ticker}: skipping {provider_name} (circuit open)")
            continue

        try:
            result = provider["fetch"](ticker, yf_info)
            if result:
                info, income, cashflow, balance, source = result
                return {
                    "info": info,
                    "income": income,
                    "cashflow": cashflow,
                    "balance": balance,
                    "data_source": source,
                }
            else:
                print(f"[Analyzer] {ticker}: {provider_name} returned no data, trying next")
        except Exception as e:
            print(f"[Analyzer] {ticker}: {provider_name} error: {e}, trying next")

    # All providers failed — return yfinance profile with empty financials
    return {
        "info": dict(yf_info),
        "income": {},
        "cashflow": {},
        "balance": {},
        "data_source": "Yahoo Finance (profile only)",
    }
