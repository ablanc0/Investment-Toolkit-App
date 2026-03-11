"""
Stock data orchestrator — provider-agnostic entry point.
Manages the cascade: EDGAR -> FMP -> yfinance for financial data.
Routes call this instead of importing individual provider modules.
"""

import yfinance as yf

from services.http_client import is_circuit_open
from services.edgar import _fetch_edgar_facts, _edgar_to_info, _edgar_to_financials
from services.fmp import _fetch_fmp_stock_data, _fmp_to_info, _fmp_to_financials


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
    """Fetch stock analysis data using the provider cascade.

    Cascade order:
    1. Always fetch yfinance profile (pricing, beta, analyst targets)
    2. Try SEC EDGAR for financial statements (1 call, 10yr history)
    3. If EDGAR unavailable, try FMP (5 API calls)
    4. If FMP empty, fall back to yfinance financial statements

    Returns: dict with keys {info, income, cashflow, balance, data_source}
             or None if the ticker is not found (no price data).
    """
    # Step 1: yfinance profile (always, for pricing/beta/analyst)
    yf_info = fetch_yfinance_profile(ticker)
    if not yf_info.get("currentPrice") and not yf_info.get("regularMarketPrice"):
        return None

    # Step 2: Try SEC EDGAR (1 call, 10yr history, no daily limit)
    data_source = None
    info = None
    income, cashflow, balance = {}, {}, {}

    if not is_circuit_open("edgar"):
        edgar_facts = _fetch_edgar_facts(ticker)
        if edgar_facts:
            info = _edgar_to_info(edgar_facts, yf_info)
            income, cashflow, balance = _edgar_to_financials(edgar_facts)
            if income or cashflow:
                data_source = "SEC EDGAR"
                print(f"[Analyzer] {ticker}: SEC EDGAR ({len(income)} yr income, {len(cashflow)} yr cashflow)")

    # Step 3: Fallback 1 — FMP (5 API calls)
    if not data_source:
        if not is_circuit_open("fmp"):
            print(f"[Analyzer] {ticker}: EDGAR unavailable, trying FMP")
            fmp = _fetch_fmp_stock_data(ticker)
            info = _fmp_to_info(fmp, yf_info)
            income, cashflow, balance = _fmp_to_financials(fmp)
            data_source = "FMP"
        else:
            # Both EDGAR and FMP circuits open — go straight to yfinance fallback
            info = dict(yf_info)
            data_source = "FMP"  # Set to FMP so the next check triggers yfinance fallback

    # Step 4: Fallback 2 — yfinance (foreign ADRs not covered by EDGAR or FMP)
    if data_source == "FMP" and not income and not cashflow:
        print(f"[Analyzer] {ticker}: FMP empty, falling back to yfinance")
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

        data_source = "Yahoo Finance"

    return {
        "info": info,
        "income": income,
        "cashflow": cashflow,
        "balance": balance,
        "data_source": data_source,
    }
