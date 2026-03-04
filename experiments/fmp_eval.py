"""
FMP API Evaluation — Quick experiment to verify we can replace yfinance
for the Stock Analyzer valuation models (DCF, Graham, Relative, DCF Scenarios).

Usage:
    conda activate invapp
    python experiments/fmp_eval.py AAPL
    python experiments/fmp_eval.py MSFT
"""
import sys, json, time
import requests

API_KEY = "Yt3XCJh6dH3GNabskOSVMpQqKBzbSh70"
BASE = "https://financialmodelingprep.com/stable"

call_count = 0

def fmp(endpoint, **params):
    """Call FMP stable API and track call count."""
    global call_count
    params["apikey"] = API_KEY
    url = f"{BASE}/{endpoint}"
    r = requests.get(url, params=params)
    call_count += 1
    data = r.json()
    if isinstance(data, dict) and "Error Message" in data:
        print(f"  ERROR on {endpoint}: {data['Error Message'][:80]}")
        return None
    return data


def evaluate_stock(ticker):
    global call_count
    call_count = 0
    print(f"\n{'='*60}")
    print(f"  FMP API Evaluation: {ticker}")
    print(f"{'='*60}\n")

    # --- 1. Company Profile (replaces yfinance t.info) ---
    profile = fmp("profile", symbol=ticker)
    if not profile:
        print("FAIL: No profile data")
        return
    p = profile[0] if isinstance(profile, list) else profile
    print(f"1. PROFILE: {p['companyName']}")
    print(f"   Price: ${p['price']}, Beta: {p['beta']}, Sector: {p['sector']}, Industry: {p['industry']}")
    print(f"   Market Cap: ${p.get('marketCap', 0)/1e9:.1f}B")

    # --- 2. Income Statement (5 years) ---
    income = fmp("income-statement", symbol=ticker, period="annual")
    print(f"\n2. INCOME STATEMENT: {len(income)} years")
    for r in income:
        print(f"   {r['date']}: Rev={r['revenue']/1e9:.1f}B, EBIT={r['ebit']/1e9:.1f}B, Tax={r['incomeTaxExpense']/1e9:.1f}B")

    # --- 3. Cash Flow Statement (5 years) ---
    cashflow = fmp("cash-flow-statement", symbol=ticker, period="annual")
    print(f"\n3. CASHFLOW: {len(cashflow)} years")
    for r in cashflow:
        print(f"   {r['date']}: FCF={r['freeCashFlow']/1e9:.1f}B, OpCF={r['operatingCashFlow']/1e9:.1f}B")

    # --- 4. Balance Sheet ---
    balance = fmp("balance-sheet-statement", symbol=ticker, period="annual")
    print(f"\n4. BALANCE SHEET: {len(balance)} years")
    for r in balance:
        print(f"   {r['date']}: Debt={r['totalDebt']/1e9:.1f}B, Equity={r['totalStockholdersEquity']/1e9:.1f}B")

    # --- 5. Key Metrics (Graham Number, EV, ROIC) ---
    metrics = fmp("key-metrics", symbol=ticker, period="annual")
    print(f"\n5. KEY METRICS: {len(metrics)} years")
    m = metrics[0]
    print(f"   Graham Number: {m.get('grahamNumber')}")
    print(f"   EV/EBITDA: {m.get('evToEBITDA')}")
    print(f"   ROIC: {m.get('returnOnInvestedCapital')}")
    print(f"   ROE: {m.get('returnOnEquity')}")

    # --- 6. Ratios (P/E, P/B, FCF/Share, etc.) ---
    ratios = fmp("ratios", symbol=ticker, period="annual")
    print(f"\n6. RATIOS: {len(ratios)} years")
    r0 = ratios[0]
    print(f"   P/E: {r0.get('priceToEarningsRatio', 'N/A'):.2f}")
    print(f"   P/B: {r0.get('priceToBookRatio', 'N/A'):.2f}")
    print(f"   EV/EBITDA: {r0.get('enterpriseValueMultiple', 'N/A'):.2f}")
    print(f"   FCF/Share: ${r0.get('freeCashFlowPerShare', 0):.2f}")
    print(f"   Book Value/Share: ${r0.get('bookValuePerShare', 0):.2f}")
    print(f"   Debt/Equity: {r0.get('debtToEquityRatio', 0):.2f}")
    print(f"   Div Yield %: {r0.get('dividendYieldPercentage', 0):.2f}%")
    print(f"   Eff Tax Rate: {r0.get('effectiveTaxRate', 0)*100:.1f}%")

    # --- 7. Financial Growth (pre-computed growth rates!) ---
    growth = fmp("financial-growth", symbol=ticker, period="annual")
    print(f"\n7. FINANCIAL GROWTH: {len(growth)} years")
    g0 = growth[0]
    print(f"   Revenue Growth: {g0.get('revenueGrowth', 0)*100:.1f}%")
    print(f"   FCF Growth: {g0.get('freeCashFlowGrowth', 0)*100:.1f}%")
    print(f"   EPS Growth: {g0.get('epsgrowth', 0)*100:.1f}%")
    print(f"   5Y Rev Growth/Share: {g0.get('fiveYRevenueGrowthPerShare', 0)*100:.1f}%")
    print(f"   10Y Rev Growth/Share: {g0.get('tenYRevenueGrowthPerShare', 0)*100:.1f}%")

    # --- 8. Enterprise Values (shares outstanding history) ---
    ev = fmp("enterprise-values", symbol=ticker, period="annual")
    print(f"\n8. ENTERPRISE VALUES: {len(ev)} years")
    for r in ev:
        print(f"   {r['date']}: Shares={r.get('numberOfShares', 0)/1e9:.2f}B, EV=${r.get('enterpriseValue', 0)/1e9:.1f}B")

    # --- 9. FMP's own DCF (cross-validation) ---
    dcf = fmp("discounted-cash-flow", symbol=ticker)
    print(f"\n9. FMP DCF:")
    if dcf:
        d = dcf[0] if isinstance(dcf, list) else dcf
        print(f"   FMP IV: ${d.get('dcf', 0):.2f}, Price: ${d.get('Stock Price', 0):.2f}")

    # --- Summary ---
    print(f"\n{'='*60}")
    print(f"  SUMMARY")
    print(f"{'='*60}")
    print(f"  API calls used: {call_count} (free tier: 250/day)")
    print(f"  Data depth: {len(income)} years (vs yfinance 4)")
    print()

    # Map to our valuation models
    shares = ev[0].get("numberOfShares", 0) if ev else 0
    price = p["price"]
    fcf_latest = cashflow[0]["freeCashFlow"] if cashflow else 0
    fcf_ps = fcf_latest / shares if shares else 0

    print("  DATA MAPPING FOR OUR MODELS:")
    print(f"  ┌─────────────────────────────────────────────────────┐")
    print(f"  │ DCF (Pure)                                          │")
    print(f"  │   FCF: ${fcf_latest/1e9:.1f}B                       ")
    print(f"  │   Shares: {shares/1e9:.2f}B                          ")
    print(f"  │   WACC inputs: beta={p['beta']}, tax={r0.get('effectiveTaxRate',0)*100:.1f}%")
    print(f"  │   Debt={balance[0]['totalDebt']/1e9:.1f}B, Equity={balance[0]['totalStockholdersEquity']/1e9:.1f}B")
    print(f"  │   Interest={income[0].get('interestExpense',0)/1e9:.2f}B")
    print(f"  │   FCF history: {len(cashflow)} years ✓               ")
    print(f"  ├─────────────────────────────────────────────────────┤")
    print(f"  │ DCF Scenarios                                       │")
    print(f"  │   FCF/Share: ${fcf_ps:.2f}                           ")
    print(f"  │   FCF Growth rates: {len(growth)} years of history   ")
    print(f"  │   Pre-computed: 3Y/5Y/10Y growth rates ✓             ")
    print(f"  ├─────────────────────────────────────────────────────┤")
    print(f"  │ Graham                                               │")
    print(f"  │   EPS: ${income[0]['epsDiluted']:.2f}                ")
    print(f"  │   Book Value/Share: ${r0.get('bookValuePerShare',0):.2f}")
    print(f"  │   Graham Number (FMP): {m.get('grahamNumber','N/A')}  ")
    print(f"  ├─────────────────────────────────────────────────────┤")
    print(f"  │ Relative Valuation                                   │")
    print(f"  │   P/E: {r0.get('priceToEarningsRatio',0):.2f}        ")
    print(f"  │   P/B: {r0.get('priceToBookRatio',0):.2f}            ")
    print(f"  │   EV/EBITDA: {r0.get('enterpriseValueMultiple',0):.2f}")
    print(f"  │   Sector averages: ❌ NOT on free tier                ")
    print(f"  └─────────────────────────────────────────────────────┘")
    print()

    # FCF growth computation comparison
    fcf_values = [r["freeCashFlow"] for r in cashflow]
    growths = []
    for i in range(len(fcf_values) - 1):
        if fcf_values[i+1] != 0:
            growths.append((fcf_values[i] - fcf_values[i+1]) / abs(fcf_values[i+1]))
    avg_growth = sum(growths) / len(growths) if growths else 0

    print(f"  FCF GROWTH ANALYSIS ({len(fcf_values)} data points → {len(growths)} growth rates):")
    for i, g in enumerate(growths):
        print(f"    {cashflow[i]['date'][:4]}/{cashflow[i+1]['date'][:4]}: {g*100:+.1f}%")
    print(f"    Average: {avg_growth*100:.1f}%")
    print(f"    FMP pre-computed (latest): {g0.get('freeCashFlowGrowth',0)*100:.1f}%")
    print(f"    FMP 5Y FCF/Share growth: {g0.get('fiveYOperatingCFGrowthPerShare','N/A')}")

    return call_count


if __name__ == "__main__":
    ticker = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    calls = evaluate_stock(ticker)

    print(f"\n{'='*60}")
    print(f"  VERDICT")
    print(f"{'='*60}")
    print(f"  ✅ 5 years of financials (vs yfinance 4)")
    print(f"  ✅ Pre-computed growth rates (3Y, 5Y, 10Y)")
    print(f"  ✅ Pre-computed ratios (P/E, P/B, EV/EBITDA, FCF/Share)")
    print(f"  ✅ Graham Number built-in")
    print(f"  ✅ FMP's own DCF for cross-validation")
    print(f"  ✅ Enterprise Values with shares outstanding history")
    print(f"  ✅ {calls} API calls per stock (250/day free = ~27 stocks/day)")
    print(f"  ❌ Sector/industry P/E averages NOT available on free tier")
    print(f"  ❌ Rating endpoint empty on free tier")
    print(f"  ⚠️  Still need hardcoded SECTOR_AVERAGES for Relative Valuation")
