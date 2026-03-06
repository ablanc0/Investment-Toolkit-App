# InvToolkit — Claude Code Context

Personal investment dashboard replacing a Google Sheets workbook.
Flask + vanilla JS SPA, runs on `localhost:5050`.

## Quick Start

```bash
conda activate invapp     # Python 3.13
cd ~/Work/InvToolkit
python server.py          # http://localhost:5050
```

## Architecture

### Backend (Python/Flask)

```
server.py                  # 62-line entry point — creates app, registers 9 Blueprints
config.py                  # All constants, paths, API keys, tax brackets, investor list
services/
  cache.py                 # Thread-safe TTL cache (5 min) + disk persistence
  data_store.py            # portfolio.json I/O + generic CRUD helpers
  yfinance_svc.py          # fetch_ticker_data, fetch_all_quotes, fetch_dividends
  edgar.py                 # SEC EDGAR XBRL company facts, CIK lookup
  edgar_13f.py             # Full 13F pipeline, CUSIP resolution, history mgmt
  fmp.py                   # FMP API, FRED AAA yield
  finviz_svc.py            # Finviz peer comparison
models/
  valuation.py             # DCF, Graham, relative valuation, scenarios
  invt_score.py            # InvT Score v2 (Growth, Profitability, Debt, Efficiency)
  salary_calc.py           # Tax computation, salary breakdown, profile migration
  projections_calc.py      # Projection math
  simulation.py            # Rule 4% historical simulation engine
routes/                    # 9 Flask Blueprints — 74 API routes total
  portfolio.py             # /api/portfolio, /api/watchlist, position/watchlist CRUD, cash, goals
  dividends.py             # sold-positions, dividend-log, monthly-data, annual-data
  lab.py                   # my-lab CRUD + research
  misc.py                  # intrinsic-values, super-investor-buys (manual), status
  super_investors.py       # All 13F endpoints (SEC EDGAR)
  projections.py           # projections + risk scenarios
  analysis.py              # stock-analyzer, invt-score
  salary.py                # salary profiles, tax, history
  planning.py              # cost-of-living, passive-income, rule4pct, historic-data
```

### Frontend (Vanilla JS + Chart.js)

```
static/
  dashboard.html           # ~845-line HTML shell (structure only, no inline CSS/JS)
  css/
    theme.css              # CSS variables, reset, body
    layout.css             # Header, navigation, tab content
    components.css         # KPI cards, tables, badges, forms, alerts
    analyzer.css           # Analyzer layout, valuation models, Rule 4%
    responsive.css         # Media queries
  js/
    utils.js               # 18 shared utilities (formatMoney, formatPercent, signals, etc.)
    charts.js              # Chart.js instances (returns, allocation, dividends)
    app.js                 # Global state, CrudTable, DOMContentLoaded, tab navigation
    overview.js            # Dashboard overview KPIs + cash editing
    positions.js           # Positions table, inline editing
    performance.js         # Performance tab
    dividends.js           # Dividend log, monthly data, annual data
    watchlist.js           # Watchlist rendering + CRUD
    rebalancing.js         # Rebalancing table + projections
    alerts.js              # Alerts + populateNewTabs bootstrap
    projections.js         # Projection inputs/charts/table
    analyzer.js            # Stock Analyzer + InvT Score (largest: ~1830 lines)
    fire.js                # Rule 4% simulation UI
    sold.js                # Sold positions
    lab.js                 # My Lab portfolio management
    ivlist.js              # Intrinsic Values list
    super-investors.js     # 13F super investor UI
    salary.js              # Salary tab (24 functions)
    planning.js            # Cost of living, passive income, Rule 4% fetch
```

All JS files use global scope (no ES modules, no bundler). Functions are available via `window.*` and `onclick` handlers.

## Data

**Data lives in Google Drive, NOT in the repo:**
- macOS: `~/Library/CloudStorage/GoogleDrive-ale.blancoglez91@gmail.com/My Drive/Investments/portfolio-app/`
- Files: `portfolio.json`, `cache.json`, `analyzer.json`, `13f_history.json`

**Data path resolution** (in `config.py`):
1. `INVTOOLKIT_DATA_DIR` env var
2. `config.json` → `{"dataDir": "..."}`
3. Google Drive auto-detect (macOS / Windows)
4. Fallback: app directory

## Core Patterns

**Data I/O** (`services/data_store.py`):
```python
load_portfolio()           # Returns dict from portfolio.json
save_portfolio(data)       # Writes dict to portfolio.json
crud_list/add/update/delete/replace(section, ...)  # Generic CRUD for any JSON array
```

**Cache** (`services/cache.py`):
```python
cache_get(key)             # Returns data or None if expired (5-min TTL)
cache_set(key, data)       # Stores with timestamp, persists to disk
```

**Data source cascade** (Stock Analyzer):
EDGAR XBRL → FMP API → yfinance (fallback chain for financial data)

## Conventions

- Monetary values: raw numbers, formatted in JS with `formatMoney()`
- Percentages: `5.25` means 5.25%
- yfinance `dividendYield`: returns percentage directly (0.39 = 0.39%), do NOT multiply by 100
- Chart.js colors: hex strings only, not CSS vars
- Signal badges: Strong Buy (#4ade80), Buy (#22d3ee), Expensive (#f59e0b), Overrated (#f87171)
- Dark theme via CSS variables (--bg: #0f1117, --card: #1a1d2e, etc.)
- Month format mismatch: monthlyData="January 24", dividendLog="January" — server splits on space
- Annual data is computed, never stored

## GitHub Workflow

- Repo: `ablanc0/Investment-Toolkit-App`
- Assignee: `ablanc0`
- Project: `InvToolkit` (project #1)
- Add to project: `gh project item-add 1 --owner ablanc0 --url <url>`
- PRs: add labels, link issues with `Closes #N`
- **NEVER merge PRs without asking the user first**
