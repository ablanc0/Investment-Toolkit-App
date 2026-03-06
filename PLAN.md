# InvToolkit — Project Plan & Development History

## Vision

A cross-platform personal investment dashboard that replaces a complex Google Sheets workbook ("Investments Toolkit v1.0") with a local desktop app. The app pulls live market data from Yahoo Finance, stores all user data in a JSON file synced via Google Drive, and runs on both macOS and Windows without needing a terminal.

---

## Architecture

### Current Stack (Phase 1 — Flask, Modular Architecture)
- **Backend:** Python 3 + Flask Blueprints, running on `localhost:5050`
  - `server.py` (62-line entry point) → `config.py` + `services/` (7 modules) + `models/` (5 modules) + `routes/` (9 Blueprints, 74 API routes)
- **Data sources:** Yahoo Finance (yfinance), SEC EDGAR (XBRL + 13F), FMP API, Finviz
- **Frontend:** Modular SPA — `dashboard.html` (845-line HTML shell) + `css/` (5 files) + `js/` (19 modules, 170 functions)
- **Data storage:** `portfolio.json` (single JSON file, stored in Google Drive for cross-machine sync)
- **Cache:** `cache.json` with 5-minute TTL + disk persistence
- **Launchers:** `start.sh` (macOS/Linux), `start.bat` (Windows), `Portfolio Dashboard.command` (macOS double-click)

### Future Stack (Phase 2 — Electron)
- Wrap the frontend in Electron for a native desktop experience (no terminal, no browser needed)
- Replace Flask with lightweight Node.js backend or Electron IPC
- Replace yfinance with direct Yahoo Finance API calls from JS
- Package as `.app` (macOS) and `.exe` (Windows)

### Data Strategy
- **Code** → GitHub repo (`InvToolkit`), cloned on both machines
- **Data** → Google Drive folder (`Investments/portfolio-app/portfolio.json`), auto-synced
- The app auto-detects Google Drive paths on macOS and Windows
- Custom paths supported via `config.json` or `INVTOOLKIT_DATA_DIR` env var

---

## Tabs & Features (19 Tabs)

### 1. Overview (Dashboard)
- KPI cards: total portfolio value, day change, total return, dividend income, cash
- Emoji icons positioned at top-right of each card (top:10px, right:10px, font-size:22px, opacity:0.5)
- Category allocation doughnut chart
- Sector allocation doughnut chart
- Top movers list

### 2. Positions
- Full holdings table: Ticker, Company, Shares (editable), Avg Cost (editable), Price, Cost Basis, Market Value, Total Return, Return %, Weight, **Div Yield** (from yfinance), Category (editable dropdown), Sector (editable), Signal
- Sortable columns, search filter, category/sector filter
- Add/delete positions
- Live prices from Yahoo Finance

### 3. Performance
- Portfolio performance chart over time
- Benchmark comparison (S&P 500)

### 4. Allocation
- Category allocation breakdown with doughnut chart
- Sector allocation breakdown
- Target vs actual allocation comparison

### 5. Rebalancing
- Target allocation percentages per category
- Deviation from target
- Suggested trades to rebalance

### 6. Watchlist
- Tracked tickers with price, intrinsic value, distance from IV, signal, priority
- Day change tracking
- Add/remove tickers

### 7. Sold Positions
- Historical sold positions: Ticker, Shares, Buy/Sell dates, Avg Cost, Sell Price, Gain $, Gain %, Category, Notes
- 2 TGT transactions imported from Excel

### 8. Dividend Log
- Calendar matrix: months as rows, tickers as columns
- Collapsible year groups (past years collapsed, current year open)
- Inline editable cells for entering monthly dividend amounts
- Cash/Interest column + monthly total column
- 96 entries (2024–2031, 12 months each)
- Active tickers derived from current positions

### 9. Monthly Data
- Monthly tracking: Portfolio Value, Contributions, Accumulated Investment (all editable)
- Dividend Income column auto-populated from Dividend Log (read-only, green highlight)
- Collapsible year groups
- 96 entries with proper year grouping
- Month format matching fix: `month_raw.split(" ")[0]` to link with dividend log

### 10. Annual Data
- Computed from Monthly Data + Dividend Log (no stored data)
- Columns: Year, Portfolio Value, Annual Contributions, Dividend Income, Total Return, Return %, Dividend Yield, S&P 500 %
- Only shows years with actual data

### 11. My Lab
- **12 investor portfolios** imported from Excel:
  1. Endeuda2 (28 holdings, ~$642K)
  2. Fern Finance Main (20 holdings, ~$106K)
  3. Fern Finance Dividend (14 holdings, ~$3.3K)
  4. Ryne Williams (20 holdings, ~$104K)
  5. Dividendology (29 holdings, ~$253K)
  6. Humphrey Yang-Fidelity (17 holdings, ~$521K)
  7. Dividend Data (12 holdings, ~$222K)
  8. Joseph Carlson Dividend (17 holdings, ~$961K)
  9. Dividend Growth Income (27 holdings, ~$45K)
  10. Gen EX Dividend Investor (29 holdings, ~$4M)
  11. Smart Money Kai (23 holdings, ~$261K)
  12. The Dividend Dream (66 holdings, ~$10.6M)
- Dropdown portfolio selector
- Holdings table + category allocation doughnut chart
- **Notes box** below chart: Last Update date + Source URL (YouTube links)
- **Research button**: Compiles ticker frequency across all portfolios (AAPL: 8/12, MSFT: 8/12, O: 8/12, SBUX: 7/12, etc.)
- Add portfolio, add/delete holdings

### 12. Intrinsic Values (IV List)
- 35 entries with 18 fields each
- Columns: Ticker, Company, Price, Intrinsic Value, Distance from IV, Score, Sector, Category, Div Yield, P/E, Signal (color-coded badge), Updated date
- Signal badges: Strong Buy (#4ade80), Buy (#22d3ee), Expensive (#f59e0b), Overrated (#f87171)
- Future: automate IV computation (currently manual/custom formulas)

### 13. Super Investor Buys
- 50 most-bought tickers from institutional investors
- Summary stats (total stocks, avg yield, avg payout ratio, etc.)
- Table: Rank, Ticker, Company, Sector, Dividend, Yield, Payout Ratio, 5Y Div Growth, ROIC

### 14. Stock Analyzer
- Individual stock deep-dive with live yfinance data
- Price chart, fundamentals, dividend history

### 15. Salary & Retirement Plan
- 4-card dashboard: Monthly Savings, Tax Breakdown, Retirement Plan, Salary History
- 47 salary fields with full tax breakdown (Federal, State, Social Security, Medicare, HSA)
- Retirement projections

### 16. Cost of Living
- 26 cities comparison (13 downtown + 13 suburban)
- Fields: Rent, Housing Multiplier, Overall Factor, Equivalent Salary, EL Equivalent
- Downtown/Suburban filter toggle

### 17. Passive Income Tracking
- Annual tracking: Dividends, Interest, Credit Card Rewards, Rent
- KPI cards + annual comparison table
- Stacked bar chart (Chart.js)
- 2 years imported (2024, 2025)

### 18. Portfolio Projections
- Configurable parameters: starting value, monthly contribution, expected return, years, inflation, dividend yield
- Projection table and growth chart

### 19. Regla del 4% (Rule of 4%)
- 20, 30, and 40-year retirement scenarios
- Based on historical S&P 500 data
- Configurable: annual expenses, inflation, withdrawal rate, current portfolio, monthly contribution, expected return

---

## API Endpoints (60+)

### Portfolio & Positions
- `GET /api/portfolio` — All positions with live prices, allocation, divYield
- `POST /api/portfolio/update` — Update position fields
- `POST /api/portfolio/add` — Add new position
- `POST /api/portfolio/delete` — Remove position

### Watchlist
- `GET /api/watchlist` — All watchlist items with live prices
- `POST /api/watchlist/add`
- `POST /api/watchlist/update`
- `POST /api/watchlist/delete`

### Sold Positions
- `GET /api/sold-positions`
- `POST /api/sold-positions/add`
- `POST /api/sold-positions/update`
- `POST /api/sold-positions/delete`

### Dividend Log
- `GET /api/dividend-log` — Calendar data with activeTickers
- `POST /api/dividend-log/update` — Update cell {year, month, ticker, value}
- `POST /api/dividend-log/add-year` — Add new year

### Monthly Data
- `GET /api/monthly-data` — With dividend income linked from dividend log
- `POST /api/monthly-data/update`

### Annual Data
- `GET /api/annual-data` — Computed from monthly + dividend log

### My Lab
- `GET /api/my-lab` — All portfolios + research data
- `POST /api/my-lab/research` — Run cross-portfolio ticker frequency analysis
- `POST /api/my-lab/add-portfolio`
- `POST /api/my-lab/add-holding`
- `POST /api/my-lab/delete-holding`

### Intrinsic Values
- `GET /api/intrinsic-values`
- `POST /api/intrinsic-values/update`

### Super Investor Buys
- `GET /api/super-investor-buys`

### Salary & Cost of Living
- `GET /api/salary` — Returns salary + costOfLiving data

### Passive Income
- `GET /api/passive-income`
- `POST /api/passive-income/update`

### Projections & Rule 4%
- `GET /api/projections`
- `POST /api/projections/update`
- `GET /api/rule4`
- `POST /api/rule4/update`

### Stock Analyzer
- `GET /api/analyze/<ticker>` — Deep analysis from yfinance

### System
- `GET /api/status` — Health check, data dir, cache info
- `GET /api/quote/<ticker>` — Single ticker live quote

---

## Data Model (portfolio.json)

```json
{
  "positions": [...],        // 17 holdings
  "watchlist": [...],        // 14 items
  "soldPositions": [...],    // 2 TGT transactions
  "dividendLog": [...],      // 96 entries (8 years × 12 months)
  "monthlyData": [...],      // 96 entries with year field
  "annualData": [],          // computed, not stored
  "myLab": [...],            // 12 portfolio objects with holdings
  "labResearch": [...],      // ticker frequency data
  "intrinsicValues": [...],  // 35 entries, 18 fields each
  "superInvestorBuys": [...],// 50 stocks
  "salary": {...},           // 47 fields + history array
  "costOfLiving": [...],     // 26 cities
  "passiveIncome": [...],    // yearly totals
  "projections": {...},      // config params
  "rule4Pct": {...},         // retirement config
  "cash": 0
}
```

---

## Known Issues & Fixes Applied

1. **ValueError: '#DIV/0!'** — Excel cells with error values. Fixed with `safe_float()` fallback to 0.
2. **Month format mismatch** — monthlyData has "January 24", dividendLog has "January". Fixed server-side: `month_name = month_raw.split(" ")[0]`.
3. **Date format in portfolio metadata** — "2024-03-01 00:00:00" → "Mar-2024" via `dt.strftime("%b-%Y")`.
4. **Annual data double-multiplication** — totalReturnPct stored as decimal, frontend multiplies ×100 for display.
5. **KPI icons overlapping** — Changed from top:32px/right:32px/font-size:32px to top:10px/right:10px/font-size:22px.
6. **My Lab flat array** — First import treated as single portfolio. Fixed by detecting "Company Name" header rows to extract 12 distinct portfolios.

---

## Roadmap

### Short Term
- [ ] Make Lab notes box editable (inline edit for lastUpdate and source URL)
- [ ] Automate Intrinsic Value computation (DCF, Graham, custom formulas)
- [ ] Add dividend yield to more tabs (watchlist, rebalancing)
- [ ] Stock Analyzer: test with full live data
- [ ] Rule 4%: integrate historical S&P 500 data for 20/30/40 year projections

### Medium Term
- [ ] Migrate to Electron for native desktop experience
- [ ] Replace yfinance with direct Yahoo Finance JS API
- [ ] Add data export (CSV, Excel, PDF reports)
- [ ] Portfolio performance charting with historical tracking
- [ ] Alert system (price targets, dividend announcements)

### Long Term
- [ ] Multiple portfolio support (personal, retirement, spouse, etc.)
- [ ] Tax lot tracking and tax-loss harvesting suggestions
- [ ] Integration with brokerage APIs (Fidelity, Schwab)
- [ ] Mobile-responsive design or companion PWA
- [ ] AI-powered insights and recommendations

---

## Development History

### Session 1 — Foundation
- Built initial Flask app with yfinance integration
- Created 19-tab dashboard structure
- Implemented 56+ API routes with CRUD helpers
- Dark theme UI with CSS variables

### Session 2 — Excel Data Import
- Imported full Google Sheet (22+ sheets) into portfolio.json
- Redesigned Dividend Log as calendar matrix with collapsible years
- Redesigned Monthly Data with dividend log linkage
- Redesigned Annual Data as computed view
- Fixed Overview KPI icon positioning
- Redesigned My Lab with 12 investor portfolios, allocation charts, research button
- Added Lab notes box with source URLs
- Redesigned IV List with full columns (sector, category, signal, div yield, P/E)
- Redesigned Super Investor Buys (50 stocks + summary)
- Redesigned Salary tab (4-card dashboard + cost of living)
- Redesigned Passive Income (KPI cards + stacked bar chart)
- Added Div Yield column to Positions tab

### Session 3 — Repo Setup
- Created GitHub repo structure (`InvToolkit`)
- Separated code (repo) from data (Google Drive)
- Configured auto-detection of Google Drive paths (macOS + Windows)
- Added config.json / env var override for custom data paths
- Set up .gitignore, README, PLAN.md, LICENSE, CHANGELOG

### Session 4+ — Feature Development
- Stock Analyzer: DCF, Graham, Relative valuation models with EDGAR/FMP/yfinance cascade
- InvT Score v2: Growth, Profitability, Debt, Efficiency scoring system
- SEC EDGAR 13F: Super investor holdings integration (22 investors)
- Persistent 13F cache, most popular stocks across investors
- IV List integration across Portfolio, Watchlist, Summary tabs

### Session N — Modular Architecture Refactoring (PR #82)
- Split `server.py` (4,797 → 62 lines) into config + 7 services + 5 models + 9 Blueprints
- Split `dashboard.html` (7,418 → 845 lines) into 5 CSS files + 19 JS modules
- 51 files changed, 11,695 additions, 11,367 deletions
- Zero console errors, all 74 API routes working, all 19 tabs verified

---

## Developer Guide

> **This section is the handoff document.** It contains everything needed to continue
> developing InvToolkit in a new session (e.g., Claude Code CLI).

### File Paths (Owner: Alejandro Blanco)

| What | macOS Path |
|------|-----------|
| **Repo (code)** | `~/Work/InvToolkit/` |
| **Data (Google Drive)** | `~/Library/CloudStorage/GoogleDrive-ale.blancoglez91@gmail.com/My Drive/Investments/portfolio-app/` |
| **portfolio.json** | `{Google Drive path}/portfolio.json` |
| **cache.json** | `{Google Drive path}/cache.json` |
| **Original Excel** | `{Google Drive path}/Investments Toolkit-v1.0.xlsx` |

### How to Run

```bash
cd ~/Work/InvToolkit
./start.sh          # or double-click "Portfolio Dashboard.command"
# Opens http://localhost:5050 automatically
```

### Repo Structure

```
InvToolkit/
├── server.py                  # 62-line entry point — registers Blueprints, starts Flask
├── config.py                  # All constants, paths, API keys, tax brackets
├── services/                  # Backend services (7 modules)
│   ├── cache.py               # Thread-safe TTL cache + disk persistence
│   ├── data_store.py          # portfolio.json I/O + generic CRUD helpers
│   ├── yfinance_svc.py        # Yahoo Finance data fetching
│   ├── edgar.py               # SEC EDGAR XBRL company facts
│   ├── edgar_13f.py           # 13F pipeline, CUSIP resolution, history
│   ├── fmp.py                 # FMP API + FRED AAA yield
│   └── finviz_svc.py          # Finviz peer comparison
├── models/                    # Business logic (5 modules)
│   ├── valuation.py           # DCF, Graham, relative valuation, scenarios
│   ├── invt_score.py          # InvT Score v2 scoring system
│   ├── salary_calc.py         # Tax computation, salary breakdown
│   ├── projections_calc.py    # Projection math
│   └── simulation.py          # Rule 4% historical simulation
├── routes/                    # Flask Blueprints (9 modules, 74 routes)
│   ├── portfolio.py           # Positions, watchlist, cash, goals
│   ├── dividends.py           # Sold positions, dividend log, monthly/annual data
│   ├── lab.py                 # My Lab CRUD + research
│   ├── misc.py                # IV list, super-investor buys (manual), status
│   ├── super_investors.py     # SEC EDGAR 13F endpoints
│   ├── projections.py         # Projections + risk scenarios
│   ├── analysis.py            # Stock analyzer, InvT Score
│   ├── salary.py              # Salary profiles, tax, history
│   └── planning.py            # Cost of living, passive income, Rule 4%
├── static/
│   ├── dashboard.html         # ~845-line HTML shell (structure only)
│   ├── css/                   # 5 CSS modules
│   │   ├── theme.css          # CSS variables, reset, body
│   │   ├── layout.css         # Header, navigation, tab layout
│   │   ├── components.css     # KPI cards, tables, badges, forms
│   │   ├── analyzer.css       # Analyzer-specific styles
│   │   └── responsive.css     # Media queries
│   └── js/                    # 19 JS modules (170 functions)
│       ├── utils.js           # Shared utilities (formatMoney, signals, etc.)
│       ├── charts.js          # Chart.js instances
│       ├── app.js             # Global state, CrudTable, tab navigation
│       ├── overview.js        # Dashboard overview
│       ├── positions.js       # Positions table
│       ├── performance.js     # Performance tab
│       ├── dividends.js       # Dividend log, monthly/annual data
│       ├── watchlist.js       # Watchlist
│       ├── rebalancing.js     # Rebalancing
│       ├── alerts.js          # Alerts + bootstrap
│       ├── projections.js     # Projections
│       ├── analyzer.js        # Stock Analyzer + InvT Score (~1830 lines)
│       ├── fire.js            # Rule 4% UI
│       ├── sold.js            # Sold positions
│       ├── lab.js             # My Lab
│       ├── ivlist.js          # Intrinsic Values list
│       ├── super-investors.js # 13F super investor UI
│       ├── salary.js          # Salary tab
│       └── planning.js        # Cost of living, passive income
├── requirements.txt           # flask, yfinance
├── CLAUDE.md                  # Claude Code context file
├── PLAN.md                    # This file
└── start.sh / start.bat       # Launchers
```

**NOT in repo** (lives in Google Drive, auto-detected by config.py):
- `portfolio.json` — all user data
- `cache.json` — yfinance price cache (5-min TTL)
- `analyzer.json` — saved stock analyses
- `13f_history.json` — SEC 13F filing history

### Data Path Resolution (config.py `_resolve_data_dir()`)

Priority order:
1. `INVTOOLKIT_DATA_DIR` environment variable
2. `config.json` → `{"dataDir": "/path/to/folder"}`
3. Google Drive auto-detection:
   - macOS: `~/Library/CloudStorage/GoogleDrive-ale.blancoglez91@gmail.com/My Drive/Investments/portfolio-app`
   - Windows (stream): `G:/My Drive/Investments/portfolio-app`
   - Windows (mirror): `~/Google Drive/My Drive/Investments/portfolio-app`
4. Fallback: app directory (for development)

### Server Architecture (Modular)

**Entry point** (`server.py`, 62 lines): Creates Flask app, registers 9 Blueprints, runs startup tasks.

**Core services** (in `services/`):
```python
# Data I/O (services/data_store.py):
load_portfolio()                    # Returns dict from portfolio.json
save_portfolio(data)                # Writes dict to portfolio.json
crud_list/add/update/delete/replace(section, ...)  # Generic CRUD for any JSON array

# Cache (services/cache.py):
cache_get(key)                      # Returns data or None if expired (5-min TTL)
cache_set(key, data)                # Stores with timestamp, persists to disk

# Yahoo Finance (services/yfinance_svc.py):
fetch_ticker_data(ticker)           # 20+ fields per ticker
fetch_all_quotes(tickers)           # Batch quotes for portfolio/watchlist

# Data source cascade (Stock Analyzer):
# EDGAR XBRL → FMP API → yfinance (fallback chain for financial data)
```

**Signal logic** (computed in routes/portfolio.py):
- Return % > 50% → "Overrated"
- Return % > 20% → "Expensive"
- Return % < -5% → "Strong Buy"
- Return % < 5% → "Buy"
- Else → "Hold"

### Frontend Architecture (Modular SPA)

**HTML shell** (`dashboard.html`, ~845 lines): Structure only, no inline CSS/JS.
**CSS** (`static/css/`, 5 files): theme → layout → components → analyzer → responsive.
**JS** (`static/js/`, 19 files): All global scope, no ES modules, no bundler.

**Key JS modules:**

| Module | File | Functions |
|--------|------|-----------|
| Shared utilities | `utils.js` | `formatMoney`, `formatPercent`, `getSignalBadge`, `_invtScoreColor`, etc. |
| Chart instances | `charts.js` | `createReturnsChart`, `createAllocationChart`, etc. |
| App core | `app.js` | Global state, `CrudTable` class, tab navigation, `fetchAllData` |
| Stock Analyzer | `analyzer.js` | ~1830 lines: all valuation, InvT Score, DCF scenarios |
| Per-tab modules | `overview.js`, `positions.js`, `dividends.js`, etc. | One module per tab |

**Tab system — lazy loading** (in `app.js`):
- `loadedTabs` dict tracks which tabs have been fetched
- `switchTab(tabId)` → `loadTabData(tabId)` on first visit
- 10 lazy-loaded tabs, 9 eagerly-loaded tabs

**Signal badge colors:** Strong Buy (#4ade80), Buy (#22d3ee), Expensive (#f59e0b), Overrated (#f87171)
**Category badge classes:** `.cat-growth` (green), `.cat-value` (blue), `.cat-foundational` (purple), `.cat-international` (amber), `.cat-bonds` (yellow-green)
**Chart.js colors** (hex only): `['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#60a5fa', '#f87171', '#a78bfa', '#fbbf24', '#34d399']`

### Detailed Data Schemas (portfolio.json)

**positions** (array of objects):
```json
{"ticker": "MSFT", "shares": 5.5, "avgCost": 280.0, "category": "Growth", "sector": "Technology", "secType": "Stocks"}
```

**watchlist** (array):
```json
{"ticker": "TSLA", "priority": "High", "intrinsicValue": 200, "notes": "Wait for dip"}
```

**soldPositions** (array):
```json
{"ticker": "TGT", "shares": 10, "buyDate": "2023-01-15", "sellDate": "2024-06-20", "avgCost": 150.0, "sellPrice": 175.0, "category": "Value Stocks", "notes": "Took profits"}
```

**dividendLog** (array — 96 entries, 8 years × 12 months):
```json
{"year": 2026, "month": "January", "MSFT": 5.28, "O": 2.50, "SCHD": 12.0, "cashInterest": 8.50, "total": 28.28}
```
- Tickers are dynamic keys matching current positions
- `total` is the sum of all tickers + cashInterest for that month

**monthlyData** (array — 96 entries):
```json
{"month": "January 26", "year": 2026, "portfolioValue": 45000, "contributions": 1500, "accumulatedInvestment": 25000, "dividendIncome": 0}
```
- `dividendIncome` is NOT stored — it's computed server-side from dividendLog
- Month format: "MonthName YY" (e.g., "January 26")
- The server extracts just the month name (`month_raw.split(" ")[0]`) to match with dividendLog

**myLab** (array of 12 portfolio objects):
```json
{
  "name": "Endeuda2",
  "holdings": [
    {"ticker": "O", "companyName": "Realty Income", "shares": 100, "avgCost": 55.0, "marketValue": 5500, "annualDividend": 306, "dividendYield": 5.56, "category": "REITs", "securityType": "Stock"}
  ],
  "totalHoldings": 28,
  "totalMarketValue": 642000,
  "totalAnnualDividend": 15000,
  "lastUpdate": "Mar-2024",
  "source": "https://www.youtube.com/watch?v=..."
}
```

**labResearch** (array):
```json
{"ticker": "AAPL", "frequency": 8}
```

**intrinsicValues** (array — 35 entries, 18 fields):
```json
{
  "ticker": "MSFT", "companyName": "Microsoft", "currentPrice": 420.0,
  "intrinsicValue": 380.0, "targetPrice": 450.0,
  "distanceFromIntrinsic": -10.5, "invtScore": 7.5,
  "week52Low": 340.0, "week52High": 470.0,
  "securityType": "Stock", "sector": "Technology", "category": "Growth",
  "peRatio": 35.2, "eps": 11.95,
  "annualDividend": 3.0, "dividendYield": 0.71,
  "signal": "Buy", "updated": "Feb-2026"
}
```

**superInvestorBuys** (array — 50 entries):
```json
{
  "rank": 1, "ticker": "AAPL", "companyName": "Apple Inc",
  "sector": "Technology", "dividend": 1.0, "yield": 0.44,
  "payoutRatio": 16.2, "fiveYearDivGrowth": 5.8, "roic": 56.3
}
```

**salary** (object — 47 fields):
```json
{
  "grossAnnual": 120000, "grossMonthly": 10000,
  "federalTax": 1500, "stateTax": 600, "socialSecurity": 620, "medicare": 145,
  "hsaContribution": 300, "retirement401k": 500,
  "netMonthly": 6335, "netAnnual": 76020,
  "employerMatch": 250, "totalCompensation": 130000,
  "history": [
    {"year": 2023, "gross": 95000, "net": 65000, "title": "Software Engineer"}
  ]
}
```

**costOfLiving** (array — 26 cities):
```json
{
  "city": "San Francisco", "type": "Downtown",
  "rent": 3500, "housingMult": 1.8, "overallFactor": 1.45,
  "equivalentSalary": 174000, "elEquivalent": 145000
}
```

**passiveIncome** (array):
```json
{"year": 2025, "total": 2211.99, "dividends": 350.76, "interest": 512.92, "creditCardRewards": 1348.31, "rent": 0}
```

**projections** (object):
```json
{"startingValue": 45000, "monthlyContribution": 1500, "expectedReturnPct": 10, "years": 30, "inflationPct": 3, "dividendYieldPct": 2.5}
```

**rule4Pct** (object):
```json
{"annualExpenses": 48000, "inflationPct": 3, "withdrawalPct": 4, "currentPortfolio": 45000, "monthlyContribution": 1500, "expectedReturnPct": 8}
```

### Conventions & Gotchas

1. **All monetary values** are stored as raw numbers (no `$` or `,`). Formatting happens in JS with `formatMoney()`.
2. **Percentages** are stored as numbers where `5.25` means `5.25%`. The only exception is `dividendYield` from yfinance, which returns a decimal (0.0052) that the server multiplies by 100.
3. **Chart.js colors must be hex strings**, not CSS variables. The standard palette is: `['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#60a5fa', '#f87171', '#a78bfa', '#fbbf24', '#34d399']`
4. **Inline editing** uses `contenteditable` with click handlers that POST to update endpoints and call `showSaveToast()`.
5. **Month format mismatch**: monthlyData stores `"January 24"`, dividendLog stores `"January"`. The server uses `month_raw.split(" ")[0]` to extract just the month name when linking them.
6. **Annual data is never stored** — always computed server-side from monthlyData + dividendLog.
7. **Lab portfolios** were extracted from Excel where portfolios were stacked vertically, separated by "Total Holdings" rows. The `lastUpdate` and `source` (YouTube URL) come from metadata in those separator rows.
8. **The frontend is modular** — `dashboard.html` (~845 lines, HTML shell only) loads 5 CSS files and 19 JS modules via `<link>`/`<script>` tags. No build step, no bundler.
9. **No authentication** — this is a personal local app. No login, no sessions.
10. **yfinance rate limiting** — the 5-minute cache prevents hammering Yahoo Finance. If cache.json gets stale or corrupted, just delete it.
11. **Google Drive sync caveat** — don't open the app on two machines simultaneously editing the same portfolio.json. One-at-a-time is safe.
