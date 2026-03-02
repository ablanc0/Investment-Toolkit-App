# InvToolkit — Project Plan & Development History

## Vision

A cross-platform personal investment dashboard that replaces a complex Google Sheets workbook ("Investments Toolkit v1.0") with a local desktop app. The app pulls live market data from Yahoo Finance, stores all user data in a JSON file synced via Google Drive, and runs on both macOS and Windows without needing a terminal.

---

## Architecture

### Current Stack (Phase 1 — Flask)
- **Backend:** Python 3 + Flask, running on `localhost:5050`
- **Data source:** Yahoo Finance via `yfinance` library
- **Frontend:** Single-page HTML dashboard (`static/dashboard.html`) with vanilla JS + Chart.js 4.4.1
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
- Set up .gitignore, README, PLAN.md
