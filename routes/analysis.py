"""Analysis Blueprint — stock analyzer and InvT Score routes."""

import json
import threading
from datetime import datetime

import yfinance as yf
from flask import Blueprint, jsonify, request

from services.edgar import _fetch_edgar_facts, _edgar_to_info, _edgar_to_financials
from services.fmp import (
    _fetch_fmp_stock_data,
    _fmp_to_info,
    _fmp_to_financials,
    _fetch_fred_aaa_yield,
    _fetch_fmp_dcf,
    _fetch_fmp_benchmarks,
)
from services.finviz_svc import _fetch_peer_comparison
from services.cache import cache_set
from models.valuation import (
    compute_dcf,
    compute_graham,
    compute_relative,
    compute_dcf_scenarios,
    compute_valuation_summary,
)
from models.invt_score import (
    _fetch_invt_data,
    _compute_invt_metrics,
    _invt_score_metric,
    _compute_invt_category_scores,
    _invt_label,
    _invt_safe_avg,
    INVT_CATEGORIES_SCORED,
    INVT_CATEGORIES_INFO,
    INVT_CATEGORIES,
    INVT_METRIC_NAMES,
    INVT_METRIC_UNITS,
)
from config import ANALYZER_FILE
from services.data_store import get_settings

bp = Blueprint('analysis', __name__)


# ── Analyzer persistence helpers ───────────────────────────────────────

def _load_analyzer_store():
    """Load persisted analyzer results from disk."""
    try:
        if ANALYZER_FILE.exists():
            return json.loads(ANALYZER_FILE.read_text())
    except Exception as e:
        print(f"[Analyzer] Failed to load {ANALYZER_FILE}: {e}")
    return {}


def _save_analyzer_store(store):
    """Persist analyzer results to disk."""
    try:
        ANALYZER_FILE.write_text(json.dumps(store, indent=2, default=str))
    except Exception as e:
        print(f"[Analyzer] Failed to save {ANALYZER_FILE}: {e}")


# ── Stock Analyzer ─────────────────────────────────────────────────────

@bp.route("/api/stock-analyzer/<ticker>")
def api_stock_analyzer(ticker):
    """Deep analysis: FMP for financials/ratios, yfinance for supplementary fields.

    Returns saved data from analyzer.json by default.
    Pass ?refresh=true to fetch fresh data from APIs and save.
    """
    ticker = ticker.upper().strip()
    refresh = request.args.get("refresh", "").lower() in ("true", "1", "yes")

    # Return saved data if not refreshing
    if not refresh:
        store = _load_analyzer_store()
        if ticker in store:
            return jsonify(store[ticker])

    try:
        # yfinance: profile, ratios, supplementary fields
        try:
            yf_info = yf.Ticker(ticker).info or {}
        except Exception:
            yf_info = {}
        if not yf_info.get("currentPrice") and not yf_info.get("regularMarketPrice"):
            return jsonify({"error": f"Ticker '{ticker}' not found"}), 404

        # Primary: SEC EDGAR (1 call, 10yr history, no daily limit)
        edgar_facts = _fetch_edgar_facts(ticker)
        data_source = None
        if edgar_facts:
            info = _edgar_to_info(edgar_facts, yf_info)
            income, cashflow, balance = _edgar_to_financials(edgar_facts)
            if income or cashflow:
                data_source = "SEC EDGAR"
                print(f"[Analyzer] {ticker}: SEC EDGAR ({len(income)} yr income, {len(cashflow)} yr cashflow)")
        if not data_source:
            # Fallback 1: FMP (5 API calls)
            print(f"[Analyzer] {ticker}: EDGAR unavailable, trying FMP")
            fmp = _fetch_fmp_stock_data(ticker)
            info = _fmp_to_info(fmp, yf_info)
            income, cashflow, balance = _fmp_to_financials(fmp)
            data_source = "FMP"
        if data_source == "FMP" and not income and not cashflow:
            # Fallback 2: yfinance (foreign ADRs not covered by EDGAR or FMP)
            print(f"[Analyzer] {ticker}: FMP empty, falling back to yfinance")
            info = dict(yf_info)
            t = yf.Ticker(ticker)
            income, cashflow, balance = {}, {}, {}
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

        price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        result = {
            "ticker": ticker,
            "name": info.get("longName", ticker),
            "sector": info.get("sector", ""),
            "industry": info.get("industry", ""),
            "price": price,
            "marketCap": info.get("marketCap", 0),
            "enterpriseValue": info.get("enterpriseValue", 0),
            "trailingPE": info.get("trailingPE", 0),
            "forwardPE": info.get("forwardPE", 0),
            "pegRatio": info.get("pegRatio", 0),
            "priceToBook": info.get("priceToBook", 0),
            "priceToSales": info.get("priceToSalesTrailing12Months", 0),
            "evToEbitda": info.get("enterpriseToEbitda", 0),
            "evToRevenue": info.get("enterpriseToRevenue", 0),
            "profitMargin": round((info.get("profitMargins") or 0) * 100, 2),
            "operatingMargin": round((info.get("operatingMargins") or 0) * 100, 2),
            "grossMargin": round((info.get("grossMargins") or 0) * 100, 2),
            "returnOnEquity": round((info.get("returnOnEquity") or 0) * 100, 2),
            "returnOnAssets": round((info.get("returnOnAssets") or 0) * 100, 2),
            "debtToEquity": info.get("debtToEquity", 0),
            "currentRatio": info.get("currentRatio", 0),
            "quickRatio": info.get("quickRatio", 0),
            "beta": info.get("beta", 0),
            "dividendYield": round(info.get("dividendYield") or 0, 2),
            "dividendRate": info.get("dividendRate", 0),
            "payoutRatio": round((info.get("payoutRatio") or 0) * 100, 2),
            "fiveYearAvgDivYield": info.get("fiveYearAvgDividendYield", 0),
            "revenueGrowth": round((info.get("revenueGrowth") or 0) * 100, 2),
            "earningsGrowth": round((info.get("earningsGrowth") or 0) * 100, 2),
            "targetMeanPrice": info.get("targetMeanPrice", 0),
            "targetHighPrice": info.get("targetHighPrice", 0),
            "targetLowPrice": info.get("targetLowPrice", 0),
            "recommendationKey": info.get("recommendationKey", ""),
            "numberOfAnalysts": info.get("numberOfAnalystOpinions", 0),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow", 0),
            "fiftyDayAvg": info.get("fiftyDayAverage", 0),
            "twoHundredDayAvg": info.get("twoHundredDayAverage", 0),
            "sharesOutstanding": info.get("sharesOutstanding", 0),
            "floatShares": info.get("floatShares", 0),
            "shortRatio": info.get("shortRatio", 0),
            "bookValue": info.get("bookValue", 0),
            "earningsPerShare": info.get("trailingEps", 0),
            "forwardEps": info.get("forwardEps", 0),
            "revenuePerShare": info.get("revenuePerShare", 0),
            "totalRevenue": info.get("totalRevenue", 0),
            "totalDebt": info.get("totalDebt", 0),
            "totalCash": info.get("totalCash", 0),
            "freeCashflow": info.get("freeCashflow", 0),
            "operatingCashflow": info.get("operatingCashflow", 0),
            "income": income,
            "balance": balance,
            "cashflow": cashflow,
            "analystConsensus": {
                "recommendation": info.get("recommendationKey", ""),
                "targetMean": info.get("targetMeanPrice", 0),
                "targetHigh": info.get("targetHighPrice", 0),
                "targetLow": info.get("targetLowPrice", 0),
                "numberOfAnalysts": info.get("numberOfAnalystOpinions", 0),
                "source": "Yahoo Finance",
            },
            "dataSources": {
                "financials": {
                    "SEC EDGAR": "SEC EDGAR (10-K XBRL filings)",
                    "FMP": "FMP (financial statements API)",
                    "Yahoo Finance": "Yahoo Finance (financial statements)",
                }.get(data_source, data_source),
                "profile": "Yahoo Finance (price, beta, analyst targets)",
                "bonds": "FRED (AAA corporate bond yield)",
                "ratios": f"{data_source}-derived (P/E, P/B, EV/EBITDA, book value/share)",
                "peers": "Finviz (peer companies, sector multiples)",
            },
            "lastUpdated": datetime.now().isoformat(),
        }

        # Load valuation defaults from user settings
        settings = get_settings()
        val_defaults = settings.get("valuationDefaults", {})

        # Fetch live AAA yield from FRED for Graham model
        aaa_yield_live, aaa_date = _fetch_fred_aaa_yield()

        # Fetch Finviz peers and FMP benchmarks in background threads
        peer_result = [None]
        fmp_dcf_result = [None]
        fmp_bench_result = [{}]
        def _bg_peers():
            peer_result[0] = _fetch_peer_comparison(ticker)
        def _bg_fmp_dcf():
            fmp_dcf_result[0] = _fetch_fmp_dcf(ticker)
        def _bg_fmp_bench():
            fmp_bench_result[0] = _fetch_fmp_benchmarks(ticker)
        peer_thread = threading.Thread(target=_bg_peers)
        fmp_dcf_thread = threading.Thread(target=_bg_fmp_dcf)
        fmp_bench_thread = threading.Thread(target=_bg_fmp_bench)
        peer_thread.start()
        fmp_dcf_thread.start()
        fmp_bench_thread.start()

        # Valuation models (run while peers fetch in background)
        dcf = compute_dcf(info, income, balance, cashflow, val_defaults=val_defaults)
        graham = compute_graham(info, aaa_yield_live=aaa_yield_live, aaa_date=aaa_date, val_defaults=val_defaults)
        relative = compute_relative(info, val_defaults=val_defaults)
        dcf_scenarios = compute_dcf_scenarios(info, income, balance, cashflow, val_defaults=val_defaults)
        summary = compute_valuation_summary(dcf, graham, relative, dcf_scenarios, info, val_defaults=val_defaults)

        # Wait for peers and FMP benchmarks (max 10s)
        peer_thread.join(timeout=10)
        fmp_dcf_thread.join(timeout=5)
        fmp_bench_thread.join(timeout=8)
        if relative and peer_result[0]:
            relative["peerComparison"] = peer_result[0]

        result["valuation"] = {
            "dcf": dcf,
            "graham": graham,
            "relative": relative,
            "dcfScenarios": dcf_scenarios,
            "summary": summary,
        }
        fmp_bench = fmp_bench_result[0] or {}
        result["benchmarks"] = {
            "fmpDcf": fmp_dcf_result[0],
            "fmpGrahamNumber": fmp_bench.get("grahamNumber", 0),
            "fmpRating": fmp_bench.get("rating", ""),
            "fmpRatingScore": fmp_bench.get("ratingScore", 0),
            "fmpRatingDcfScore": fmp_bench.get("ratingDcfScore", 0),
            "fmpRatingPeScore": fmp_bench.get("ratingPeScore", 0),
            "fmpRatingPbScore": fmp_bench.get("ratingPbScore", 0),
            "fmpAltmanZ": fmp_bench.get("altmanZScore", 0),
            "fmpPiotroski": fmp_bench.get("piotroskiScore", 0),
            "fmpEarningsYield": fmp_bench.get("earningsYield", 0),
            "fmpFcfYield": fmp_bench.get("freeCashFlowYield", 0),
            "fmpRoic": fmp_bench.get("roic", 0),
            "analystMean": info.get("targetMeanPrice", 0),
            "analystHigh": info.get("targetHighPrice", 0),
            "analystLow": info.get("targetLowPrice", 0),
            "analystCount": info.get("numberOfAnalystOpinions", 0),
        }

        # Build warnings list
        _warnings = []

        # Fallback warnings
        if data_source == "FMP":
            _warnings.append({"field": "financials", "source": "SEC EDGAR", "reason": "EDGAR unavailable, fell back to FMP"})
        elif data_source == "Yahoo Finance":
            _warnings.append({"field": "financials", "source": "FMP", "reason": "FMP unavailable, fell back to Yahoo Finance"})

        # Missing critical field warnings
        for fkey, flabel in [("freeCashflow", "Free Cash Flow"), ("operatingCashflow", "Operating Cash Flow"),
                              ("totalRevenue", "Total Revenue"), ("earningsPerShare", "EPS"),
                              ("trailingPE", "Trailing P/E"), ("bookValue", "Book Value"),
                              ("enterpriseValue", "Enterprise Value"), ("beta", "Beta")]:
            if not result.get(fkey):
                _warnings.append({"field": fkey, "source": data_source, "reason": f"{flabel} not available"})

        # Valuation model warnings
        if not dcf:
            _warnings.append({"field": "valuation.dcf", "source": data_source, "reason": "Insufficient data for DCF model"})
        if not graham:
            _warnings.append({"field": "valuation.graham", "source": data_source, "reason": "Insufficient data for Graham model"})
        if fmp_dcf_result[0] is None:
            _warnings.append({"field": "benchmarks.fmpDcf", "source": "FMP", "reason": "FMP DCF benchmark unavailable"})

        result["_warnings"] = _warnings

        from services.api_health import get_fmp_quota
        result["_fmpQuota"] = get_fmp_quota()

        # Persist to file and memory cache
        store = _load_analyzer_store()
        store[ticker] = result
        _save_analyzer_store(store)
        cache_set(f"analyzer_{ticker}", result)
        return jsonify(result)

    except Exception as e:
        print(f"[Analyzer] Error for {ticker}: {e}")
        return jsonify({"error": str(e)}), 500


# ── InvT Score ─────────────────────────────────────────────────────────

@bp.route("/api/invt-score/<ticker>")
def api_invt_score(ticker):
    """InvT Score: 0-10 company quality score across 5 categories.
    Uses 10yr/5yr historical data with 70/30 hybrid weighting.
    Pass ?refresh=true to re-fetch from APIs."""
    ticker = ticker.upper().strip()
    refresh = request.args.get("refresh", "").lower() in ("true", "1", "yes")

    # Check cache
    if not refresh:
        store = _load_analyzer_store()
        cached = store.get(ticker, {}).get("invtScore")
        if cached and cached.get("version") == 3:
            return jsonify(cached)

    try:
        # 1. Fetch yearly data
        yearly, data_source = _fetch_invt_data(ticker)
        if not yearly or len(yearly) < 2:
            return jsonify({"error": "Insufficient financial data", "ticker": ticker}), 404

        # 2. Compute metrics for 10yr and 5yr modes
        metrics_10yr = _compute_invt_metrics(yearly, mode="10yr")
        metrics_5yr = _compute_invt_metrics(yearly, mode="5yr")

        # Fill dividend yield from yfinance (historical yield unavailable from EDGAR/FMP)
        yf_trailing_pe = None
        try:
            yf_info = yf.Ticker(ticker).info or {}
            div_yield = yf_info.get("dividendYield") or 0  # yfinance 1.2+: already % (0.9 = 0.9%)
            avg_div_yield = yf_info.get("fiveYearAvgDividendYield") or div_yield
            metrics_10yr["div_yield"] = round(avg_div_yield, 2)
            metrics_5yr["div_yield"] = round(div_yield, 2)
            yf_trailing_pe = yf_info.get("trailingPE")
        except Exception:
            metrics_10yr["div_yield"] = 0
            metrics_5yr["div_yield"] = 0

        # 3. Detect non-dividend payers (for informational note only)
        is_dividend_payer = any(d.get("dividendsPaid", 0) > 0 for d in yearly)

        # 4. Score each metric
        scores_10yr = {k: _invt_score_metric(v, k) for k, v in metrics_10yr.items() if not k.startswith("_")}
        scores_5yr = {k: _invt_score_metric(v, k) for k, v in metrics_5yr.items() if not k.startswith("_")}

        # 5. Category scores — scored categories for overall, info categories separate
        cats_10yr_scored = _compute_invt_category_scores(scores_10yr, INVT_CATEGORIES_SCORED)
        cats_5yr_scored = _compute_invt_category_scores(scores_5yr, INVT_CATEGORIES_SCORED)
        cats_10yr_info = _compute_invt_category_scores(scores_10yr, INVT_CATEGORIES_INFO)
        cats_5yr_info = _compute_invt_category_scores(scores_5yr, INVT_CATEGORIES_INFO)
        cats_10yr = {**cats_10yr_scored, **cats_10yr_info}
        cats_5yr = {**cats_5yr_scored, **cats_5yr_info}

        # 6. Hybrid category scores (all categories) — 70% 10yr + 30% 5yr
        hybrid_cats = {}
        for cat_key in INVT_CATEGORIES:
            s10 = cats_10yr.get(cat_key)
            s5 = cats_5yr.get(cat_key)
            if s10 is not None and s5 is not None:
                hybrid_cats[cat_key] = round(0.7 * s10 + 0.3 * s5, 1)
            else:
                hybrid_cats[cat_key] = s10 if s10 is not None else s5

        # 7. Overall scores — ONLY scored categories (Growth, Profitability, Debt, Efficiency)
        #    Require >=3 of 4 scored categories to compute overall (refuse truncated scores)
        scored_10yr = [v for v in cats_10yr_scored.values() if v is not None]
        scored_5yr = [v for v in cats_5yr_scored.values() if v is not None]
        overall_10yr = _invt_safe_avg(scored_10yr) if len(scored_10yr) >= 3 else None
        overall_5yr = _invt_safe_avg(scored_5yr) if len(scored_5yr) >= 3 else None
        if overall_10yr is not None and overall_5yr is not None:
            overall = round(0.7 * overall_10yr + 0.3 * overall_5yr, 1)
        else:
            overall = overall_10yr if overall_10yr is not None else overall_5yr

        # 8. Build response — all 5 categories for display
        categories = {}
        for cat_key, cat_def in INVT_CATEGORIES.items():
            is_scored = cat_key in INVT_CATEGORIES_SCORED
            cat_metrics = []
            for m_key in cat_def["metrics"]:
                cat_metrics.append({
                    "name": INVT_METRIC_NAMES.get(m_key, m_key),
                    "key": m_key,
                    "value10yr": round(metrics_10yr.get(m_key, 0) or 0, 2) if metrics_10yr.get(m_key) is not None else None,
                    "value5yr": round(metrics_5yr.get(m_key, 0) or 0, 2) if metrics_5yr.get(m_key) is not None else None,
                    "score10yr": scores_10yr.get(m_key),
                    "score5yr": scores_5yr.get(m_key),
                    "unit": INVT_METRIC_UNITS.get(m_key, ""),
                })
            cat_entry = {
                "label": cat_def["label"],
                "score": hybrid_cats.get(cat_key),
                "score10yr": cats_10yr.get(cat_key),
                "score5yr": cats_5yr.get(cat_key),
                "metrics": cat_metrics,
                "scored": is_scored,
            }
            if cat_key == "shareholder_returns" and not is_dividend_payer:
                cat_entry["note"] = "Non-dividend payer"
            categories[cat_key] = cat_entry

        # Yearly data for per-metric charts (compact: only fields needed for charting)
        est_pe = yf_trailing_pe or 20  # Fallback P/E for estimating historical yield
        yearly_data = []
        prev_dps = None
        for d in yearly:
            s = d.get("sharesOutstanding", 0) or 1
            nd = d.get("totalDebt", 0) - d.get("cash", 0)
            r = d.get("revenue", 0) or 1
            tax_rate = (d.get("taxProvision") or 0) / d["pretaxIncome"] if d.get("pretaxIncome") and d["pretaxIncome"] > 0 else 0.21
            invested = (d.get("totalDebt") or 0) + (d.get("equity") or 0) - (d.get("cash") or 0)
            nopat = (d.get("ebit") or 0) * (1 - tax_rate)
            dps = round(d.get("dividendsPaid", 0) / s, 2) if s else 0
            div_growth = round((dps - prev_dps) / prev_dps * 100, 2) if prev_dps and prev_dps > 0 and dps else None
            prev_dps = dps
            # Estimate historical dividend yield: DPS / (EPS * P/E) * 100
            eps_val = d.get("eps") or 0
            est_price = abs(eps_val) * est_pe if eps_val else 0
            div_yield_est = round(dps / est_price * 100, 2) if dps and est_price > 0 else None
            shares_raw = d.get("sharesOutstanding", 0)
            yearly_data.append({
                "year": d["year"],
                "revenue": d.get("revenue", 0),
                "eps": eps_val,
                "fcfPerShare": round(d["fcf"] / s, 2) if d.get("fcf") is not None and s else None,
                "gpm": round(d.get("grossProfit", 0) / r * 100, 2) if d.get("grossProfit") else None,
                "npm": round(d.get("netIncome", 0) / r * 100, 2) if d.get("netIncome") else None,
                "fcfMargin": round(d.get("fcf", 0) / r * 100, 2) if d.get("fcf") else None,
                "netDebt": nd,
                "netDebtFcf": round(nd / d["fcf"], 2) if d.get("fcf") and d["fcf"] > 0 else None,
                "interestCov": round(d["ebit"] / d["interestExpense"], 2) if d.get("ebit") and d.get("interestExpense") and d["interestExpense"] > 0 else None,
                "divYield": div_yield_est,
                "dps": dps,
                "divGrowth": div_growth,
                "payoutRatio": round(d["dividendsPaid"] / d["netIncome"] * 100, 2) if d.get("dividendsPaid") and d.get("netIncome") and d["netIncome"] > 0 else None,
                "fcfPayout": round(d["dividendsPaid"] / d["fcf"] * 100, 2) if d.get("dividendsPaid") and d.get("fcf") and d["fcf"] > 0 else None,
                "sharesOut": shares_raw if shares_raw else None,
                "roa": round(d["netIncome"] / d["totalAssets"] * 100, 2) if d.get("netIncome") and d.get("totalAssets") and d["totalAssets"] > 0 else None,
                "roe": round(d["netIncome"] / d["equity"] * 100, 2) if d.get("netIncome") and d.get("equity") and d["equity"] > 0 else None,
                "roic": round(nopat / invested * 100, 2) if d.get("ebit") is not None and invested > 0 else None,
            })

        result = {
            "ticker": ticker,
            "score": overall,
            "label": _invt_label(overall),
            "score10yr": overall_10yr,
            "score5yr": overall_5yr,
            "shareholderReturnsScore": hybrid_cats.get("shareholder_returns"),
            "categories": categories,
            "years": [d["year"] for d in yearly],
            "yearlyData": yearly_data,
            "dataSource": data_source,
            "lastUpdated": datetime.now().isoformat(),
            "version": 3,
        }

        # 8. Cache
        store = _load_analyzer_store()
        if ticker not in store:
            store[ticker] = {}
        store[ticker]["invtScore"] = result
        _save_analyzer_store(store)

        return jsonify(result)

    except Exception as e:
        print(f"[InvTScore] Error for {ticker}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "ticker": ticker}), 500
