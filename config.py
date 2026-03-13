"""
InvToolkit — Centralised configuration constants.
All path resolution and numeric constants live here so that server.py
and any future modules can import from a single source of truth.
"""

import json
import os
from pathlib import Path

# ── Paths ───────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent


def _resolve_data_dir():
    """Resolve the data directory: env var > config.json > Google Drive default > local."""
    # 1. Environment variable override
    env_dir = os.environ.get("INVTOOLKIT_DATA_DIR")
    if env_dir:
        p = Path(env_dir)
        if p.exists():
            return p

    # 2. config.json in the app folder
    config_file = BASE_DIR / "config.json"
    if config_file.exists():
        try:
            cfg = json.loads(config_file.read_text())
            p = Path(cfg.get("dataDir", ""))
            if p.exists():
                return p
        except Exception:
            pass

    # 3. Google Drive default paths (Mac / Windows)
    home = Path.home()
    subfolder = Path("My Drive") / "Investments" / "portfolio-app"

    # macOS: auto-detect any GoogleDrive-* account folder
    cloud_storage = home / "Library" / "CloudStorage"
    if cloud_storage.exists():
        for gd_folder in cloud_storage.iterdir():
            if gd_folder.name.startswith("GoogleDrive-"):
                candidate = gd_folder / subfolder
                if candidate.exists():
                    return candidate

    # Windows Google Drive (stream / mirror)
    win_candidates = [
        Path("G:/My Drive/Investments/portfolio-app"),
        home / "Google Drive" / "My Drive" / "Investments" / "portfolio-app",
    ]
    for candidate in win_candidates:
        if candidate.exists():
            return candidate

    # 4. Fallback: local directory (for development)
    return BASE_DIR


DATA_DIR      = _resolve_data_dir()
PORTFOLIO_FILE = DATA_DIR / "portfolio.json"
CACHE_FILE    = DATA_DIR / "cache.json"
CACHE_TTL     = 300  # 5 minutes

ANALYZER_FILE      = DATA_DIR / "analyzer.json"
_13F_HISTORY_FILE  = DATA_DIR / "13f_history.json"
COL_DATA_FILE      = DATA_DIR / "col_data.json"
COL_RAW_FILE       = DATA_DIR / "col_raw.json"
COL_QUOTA_FILE     = DATA_DIR / "col_quota.json"
QUOTA_FILE         = DATA_DIR / "quota.json"

# ── Provider Defaults ──────────────────────────────────────────────────
# Cascade order per data domain. Override in user settings under "providerConfig".
# To add a new provider: create services/<name>_svc.py, register in stock_data._PROVIDERS.

PROVIDER_DEFAULTS = {
    "financials": ["edgar", "fmp", "yfinance"],  # cascade order for financial statements
    "quotes":     ["yfinance"],                   # real-time quotes (free, unlimited)
    "benchmarks": ["fmp"],                        # Graham number, Altman Z, Piotroski
    "peers":      ["finviz"],                     # peer comparison
    "dividends":  ["yfinance"],                   # dividend history
    "riskFreeRate": ["fred"],                     # AAA yield for DCF/Graham
    "logos":      ["elbstream", "fmp"],            # ticker logo images
    "13f":        ["edgar"],                       # institutional 13F filings
}

# ── Valuation Constants ─────────────────────────────────────────────────

RISK_FREE_RATE   = 0.0425      # 10Y Treasury
MARKET_RETURN    = 0.099        # S&P long-term avg
PERPETUAL_GROWTH = 0.025        # terminal growth
MARGIN_OF_SAFETY = 0.70
AAA_YIELD_BASELINE = 4.4        # Graham baseline
AAA_YIELD_CURRENT  = 5.3        # fallback; overridden by live FRED data
GRAHAM_BASE_PE     = 7.0        # P/E for no-growth company (Graham original: 8.5)
GRAHAM_CG          = 1.0        # growth multiplier (Graham original: 2.0)
GRAHAM_GROWTH_CAP  = 20.0       # max earnings growth % to avoid inflated IVs

SECTOR_AVERAGES = {
    "Technology":          {"pe": 30, "evEbitda": 20, "pb": 8},
    "Communication Services": {"pe": 18, "evEbitda": 12, "pb": 3},
    "Healthcare":          {"pe": 22, "evEbitda": 15, "pb": 4},
    "Financial Services":  {"pe": 14, "evEbitda": 10, "pb": 1.5},
    "Consumer Cyclical":   {"pe": 20, "evEbitda": 13, "pb": 4},
    "Consumer Defensive":  {"pe": 22, "evEbitda": 14, "pb": 5},
    "Industrials":         {"pe": 20, "evEbitda": 13, "pb": 4},
    "Energy":              {"pe": 12, "evEbitda": 6,  "pb": 1.8},
    "Utilities":           {"pe": 18, "evEbitda": 12, "pb": 2},
    "Real Estate":         {"pe": 35, "evEbitda": 20, "pb": 2},
    "Basic Materials":     {"pe": 15, "evEbitda": 9,  "pb": 2.5},
}

# ── Default User Settings ──────────────────────────────────────────────

DEFAULT_SETTINGS = {
    "portfolioName": "My Portfolio",
    "categories": [
        {"name": "Growth", "color": "#8b5cf6"},
        {"name": "Value Stocks", "color": "#3b82f6"},
        {"name": "Foundational", "color": "#22c55e"},
        {"name": "International", "color": "#f59e0b"},
        {"name": "US Bonds", "color": "#64748b"},
    ],
    "defaultCategory": "Growth",
    "signalMode": "avgCost",
    "signalThresholds": {
        "iv": {
            "strongBuy": -15,
            "buy": 0,
            "expensive": 15,
        },
        "avgCost": {
            "strongBuy": -15,
            "buy": -5,
            "avgCost": 5,
            "overcost": 15,
        },
        "topPerformer": 30,
    },
    "display": {
        "currencySymbol": "$",
        "decimalPlaces": 2,
        "percentDecimals": 2,
        "defaultTab": "overview",
    },
    "cacheTTL": 300,
    "valuationDefaults": {
        "discountRate": 10,
        "marginOfSafety": 25,
        "terminalGrowth": 3,
        "riskFreeRate": 4.25,
        "marketReturn": 9.9,
    },
    "apiKeys": {
        "fmp": "",
        "rapidapi": "",
    },
}

# ── SEC EDGAR API ───────────────────────────────────────────────────────

EDGAR_USER_AGENT  = os.environ.get("EDGAR_USER_AGENT", "InvToolkit user@example.com")
EDGAR_FACTS_URL   = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
EDGAR_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

# ── Super Investors (SEC EDGAR 13F) ─────────────────────────────────────

SUPER_INVESTORS = {
    # Original 9
    "Greg Abel":            {"cik": "0001067983", "fund": "Berkshire Hathaway",         "note": "CEO since 2025; formerly Warren Buffett — greatest value investor"},
    "Michael Burry":        {"cik": "0001649339", "fund": "Scion Asset Management",     "note": "Big Short fame, contrarian deep value"},
    "Bill Ackman":          {"cik": "0001336528", "fund": "Pershing Square",            "note": "Activist investor, concentrated bets"},
    "Ray Dalio":            {"cik": "0001350694", "fund": "Bridgewater Associates",     "note": "World's largest hedge fund, macro pioneer"},
    "Seth Klarman":         {"cik": "0001061768", "fund": "Baupost Group",              "note": "Deep value, Margin of Safety author"},
    "David Tepper":         {"cik": "0001656456", "fund": "Appaloosa Management",       "note": "Distressed debt and macro bets"},
    "Howard Marks":         {"cik": "0000949509", "fund": "Oaktree Capital Management", "note": "Credit/distressed debt legend, memo writer"},
    "Terry Smith":          {"cik": "0001569205", "fund": "Fundsmith LLP",              "note": "Quality compounder, buy-and-hold"},
    "Li Lu":                {"cik": "0001709323", "fund": "Himalaya Capital",           "note": "Munger's pick, China-US value investor"},
    # New 13
    "Chris Hohn":           {"cik": "0001647251", "fund": "TCI Fund Management",        "note": "Activist investor, huge returns"},
    "Stanley Druckenmiller": {"cik": "0001536411", "fund": "Duquesne Family Office",    "note": "Legendary macro trader, ex-Soros partner"},
    "Dev Kantesaria":       {"cik": "0001697868", "fund": "Valley Forge Capital",       "note": "Quality-focused compounder"},
    "Pat Dorsey":           {"cik": "0001671657", "fund": "Dorsey Asset Management",    "note": "Ex-Morningstar, economic moat expert"},
    "Mohnish Pabrai":       {"cik": "0001549575", "fund": "Dalal Street",              "note": "Value investor, Buffett-style"},
    "Joel Greenblatt":      {"cik": "0001510387", "fund": "Gotham Asset Management",    "note": "Magic Formula author"},
    "Peter Brown":          {"cik": "0001037389", "fund": "Renaissance Technologies",   "note": "Quant legend, Medallion Fund"},
    "Chuck Akre":           {"cik": "0001112520", "fund": "Akre Capital Management",    "note": "Compounder-focused, long-term hold"},
    "Paul Tudor Jones":     {"cik": "0000923093", "fund": "Tudor Investment Corp",      "note": "Macro/hedge fund pioneer"},
    "George Soros":         {"cik": "0001029160", "fund": "Soros Fund Management",      "note": "Macro legend, broke the Bank of England"},
    "Chris Davis":          {"cik": "0001036325", "fund": "Davis Selected Advisers",    "note": "Multi-generational value fund family"},
    "Chase Coleman":        {"cik": "0001167483", "fund": "Tiger Global Management",    "note": "Tiger Cub, tech and growth focused"},
    "Dan Loeb":             {"cik": "0001040273", "fund": "Third Point",                "note": "Activist/event-driven investor"},
}

# ── FMP API ─────────────────────────────────────────────────────────────

FMP_API_KEY = os.environ.get("FMP_API_KEY", "")
FMP_BASE    = "https://financialmodelingprep.com/stable"

# ── RapidAPI (Cost of Living) ─────────────────────────────────────────

RAPIDAPI_COL_HOST       = "cities-cost-of-living1.p.rapidapi.com"
RAPIDAPI_COL_URL        = f"https://{RAPIDAPI_COL_HOST}/dev/get_cities_details_by_name"
RAPIDAPI_COL_CITIES_URL = f"https://{RAPIDAPI_COL_HOST}/dev/get_cities_list"

# Resettle Place API (on-demand city lookup)
RESETTLE_API_HOST = "resettle-place-api.p.rapidapi.com"
RESETTLE_API_BASE = f"https://{RESETTLE_API_HOST}"

# ── Tax Constants ───────────────────────────────────────────────────────

# Federal progressive tax brackets (2023 Single Filer — from Excel)
FEDERAL_BRACKETS = [
    (12400, 0.10), (50400, 0.12), (105700, 0.22),
    (201775, 0.24), (256225, 0.32), (640600, 0.35),
    (float('inf'), 0.37),
]

_TAX_NAME_MAP = {
    "Lansing Resident Tax": "City Tax (Resident)",
    "E Lansing Nonresident Tax": "City Tax (Non-Resident)",
    "Michigan State Tax": "State Tax",
}

# ── Investment Tax Constants ───────────────────────────────────────────

LTCG_RATE = 0.15           # Long-term capital gains rate
STCG_RATE = 0.22           # Short-term capital gains (approx ordinary income)
HARVEST_LOSS_THRESHOLD = -3.0   # % loss to suggest harvest
TRIM_GAIN_THRESHOLD = 100.0     # % gain to suggest trim
HOLDING_PERIOD_DAYS = 365       # Days for long-term classification

# ── Risk Analysis Constants ────────────────────────────────────────────

STRESS_SCENARIOS = [
    {"name": "Great Depression (1929)", "drop": -86, "description": "Worst bear market in history", "recoveryMonths": 152, "shape": "L-shaped", "stressFactor": 2.0, "recoveryYears": 25.0},
    {"name": "Dot-Com Crash (2000)", "drop": -49, "description": "Tech bubble burst", "recoveryMonths": 56, "shape": "U-shaped", "stressFactor": 1.42, "recoveryYears": 7.0},
    {"name": "Financial Crisis (2008)", "drop": -57, "description": "Global financial meltdown", "recoveryMonths": 49, "shape": "V-shaped", "stressFactor": 1.8, "recoveryYears": 5.5},
    {"name": "COVID Crash (2020)", "drop": -34, "description": "Pandemic-driven selloff", "recoveryMonths": 5, "shape": "V-shaped", "stressFactor": 1.82, "recoveryYears": 0.5},
]

# Default custom scenario (overridable via API query params)
CUSTOM_SCENARIO_DEFAULTS = {
    "name": "Custom Scenario", "drop": -20, "description": "User-defined scenario",
    "shape": "V-shaped", "stressFactor": 1.2, "recoveryYears": 1.0,
}

CONCENTRATION_THRESHOLDS = {"high": 30, "medium": 15}

# ── Dividend Classification ───────────────────────────────────────────

DIVIDEND_KINGS = {
    "PG": 68, "KO": 62, "JNJ": 62, "CL": 61, "EMR": 67,
    "MMM": 65, "DOV": 68, "PH": 67, "GPC": 67, "SWK": 56,
    "ABT": 52, "ABM": 56, "AWR": 69, "NWN": 68, "SJW": 56,
}
DIVIDEND_ARISTOCRATS = {
    "ABBV": 52, "T": 39, "XOM": 41, "CVX": 37, "WMT": 51,
    "MCD": 48, "PEP": 52, "TGT": 53, "LOW": 51, "ADP": 49,
    "SHW": 45, "ITW": 51, "BDX": 52, "CTAS": 41, "ROP": 30,
    "EXPD": 29, "CAT": 30, "BEN": 44, "AFL": 42, "AOS": 30,
    "CLX": 47, "ED": 50, "FRT": 56, "O": 29, "WBA": 48,
}
