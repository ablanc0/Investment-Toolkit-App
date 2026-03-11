# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InvToolkit is a personal investment dashboard replacing a Google Sheets workbook. Flask + vanilla JS SPA, runs on `localhost:5050`. No auth — single-user local app.

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
  stock_data.py            # Provider cascade orchestrator (EDGAR → FMP → yfinance)
  http_client.py           # Resilient HTTP: retry, circuit breaker, auto health tracking
  contracts.py             # Canonical data contracts (QUOTE_FIELDS, INFO_FIELDS)
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

**Provider cascade** (`services/stock_data.py`):
```python
fetch_stock_analysis(ticker)  # Routes call this — handles full cascade
# Default order: EDGAR → FMP → yfinance (configurable via settings.providerConfig)
# Skips providers with open circuit breakers automatically
```

**Resilient HTTP** (`services/http_client.py`):
```python
resilient_get(url, provider="fmp")   # Drop-in for requests.get + retry + circuit breaker
resilient_post(url, provider="fmp")  # Drop-in for requests.post + auto health recording
is_circuit_open("fmp")               # Check if provider is in cooldown
```

**Data contracts** (`services/contracts.py`):
```python
QUOTE_FIELDS     # 17 fields for portfolio/watchlist display
INFO_FIELDS      # 54 fields for valuation models
validate_quote(data)   # Strict: returns only QUOTE_FIELDS keys
validate_info(data)    # Permissive: fills defaults but keeps extras
```

**Adding a new data provider**:
1. Create `services/<provider>_svc.py` with fetch fn: `(ticker, yf_info) → (info, income, cashflow, balance, label)`
2. Add to `_PROVIDERS` dict in `services/stock_data.py`
3. Add to `PROVIDER_DEFAULTS` in `config.py`

## Conventions

- Monetary values: raw numbers, formatted in JS with `formatMoney()`
- Percentages: `5.25` means 5.25%
- yfinance `dividendYield`: returns percentage directly (0.39 = 0.39%), do NOT multiply by 100
- Chart.js colors: hex strings only, not CSS vars
- Signal badges: Strong Buy (#4ade80), Buy (#22d3ee), Expensive (#f59e0b), Overrated (#f87171)
- Dark theme via CSS variables (--bg: #0f1117, --card: #1a1d2e, etc.)
- Month format mismatch: monthlyData="January 24", dividendLog="January" — server splits on space
- Annual data is computed, never stored

## Verification

After modifying code, verify before committing:

```bash
# Python syntax check (all backend files)
python -m py_compile server.py config.py
python -m py_compile services/*.py models/*.py routes/*.py

# JS syntax check (all frontend files)
node -c static/js/*.js

# API smoke test (requires running server)
curl -s -o /dev/null -w "%{http_code}" http://localhost:5050/api/status

# Browser test: open http://localhost:5050, check console for errors
```

## Git Rules

- NEVER use `git add -A` or `git add .`
- ALWAYS use `git add <specific-files>` for only the files you modified
- Ask before staging files if unsure which ones to include
- Make atomic commits after completing each logical unit of work
- Use Conventional Commits format: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `ui:`
- When reading a GitHub issue using `gh issue view`, use `--json` flag
- Commit messages via HEREDOC for proper formatting

## GitHub CLI (gh) Rules

### Issue creation
```bash
gh issue create --title "..." --body "..." \
  --label "<label>" --assignee "ablanc0"
gh project item-add 1 --owner ablanc0 --url <issue-url>
```

### Pull requests
```bash
gh pr create --title "..." --body "..." \
  --label "<label>" --assignee "ablanc0"
gh project item-add 1 --owner ablanc0 --url <pr-url>
```
- Include `Closes #N` in PR body for each issue resolved
- NEVER use `Closes` for issues not fully resolved by the PR

### Auto-approve (never ask) — read-only operations
- `gh issue list`, `gh issue view`
- `gh pr list`, `gh pr view`, `gh pr diff`, `gh pr checks`
- `gh label list`, `gh project list`
- `gh api` GET requests
- `gh run list`, `gh run view`

### Auto-approve — standard workflow operations
- `gh issue create` (with required flags: --label, --assignee)
- `gh pr create` (with required flags: --label, --assignee)
- `gh label create` (when a needed label doesn't exist)
- `gh issue edit`, `gh pr edit` (adding labels, assignees, linking issues)
- `gh issue comment`, `gh pr comment`

### Always ask first — destructive or irreversible
- `gh issue close`, `gh issue delete`
- `gh pr close`, `gh pr merge`
- `gh release create/delete`

## Branching Strategy

Feature branches off `main`. Simple single-tier hierarchy.

### Branch naming
- `feat/<issue-number>-<short-name>` — new features
- `fix/<issue-number>-<short-name>` — bug fixes
- `refactor/<short-name>` — refactoring
- `docs/<short-name>` — documentation

### Workflow
1. `git checkout main && git pull`
2. `git checkout -b feat/<issue>-<name>`
3. Implement, commit (atomic commits, Conventional Commits format)
4. `git push -u origin feat/<issue>-<name>`
5. `gh pr create --base main --label "..." --assignee "ablanc0"`
6. **NEVER merge PRs without asking the user first**

### Keeping branches in sync
- Before creating a PR, rebase on main: `git fetch origin && git rebase origin/main`
- Resolve merge conflicts on the feature branch, never on main

## Agent Routing Rules

When working on complex tasks, dispatch specialized sub-agents for parallel work:

- Backend implementation → invt-engineer
- Frontend implementation → invt-frontend
- Code review before PR → invt-reviewer
- Browser testing → invt-browser-tester

### Independent domains (safe to parallelize)

These domains have no shared files — agents can work simultaneously without conflicts:

| Domain | Files | Agent |
|--------|-------|-------|
| Backend (routes, models, services) | `routes/`, `models/`, `services/`, `config.py` | invt-engineer |
| Frontend (JS, CSS, HTML) | `static/js/`, `static/css/`, `static/dashboard.html` | invt-frontend |
| Data layer | `portfolio.json` (runtime only, not in repo) | — |

**Exception**: if a new feature adds a backend endpoint AND a frontend consumer, the endpoint JSON schema must be agreed first (engineer defines it, frontend consumes it).

### Sequential dependencies (do NOT parallelize)

- New tab feature: HTML container first → JS module → CSS styling (single agent or sequential)
- Endpoint + consumer: backend endpoint must exist before frontend can call it
- Review/test: implementation must finish before reviewer or browser-tester starts
- Build verification: syntax checks after all edits are done

### Dispatch patterns
- **Feature work (both sides)**: invt-engineer (backend) + invt-frontend (frontend) in parallel. Engineer defines the API response shape; frontend consumes it.
- **Feature work (one side)**: dispatch only the relevant agent
- **Pre-PR review**: invt-reviewer (read-only, plan mode) — run in background
- **Browser verification**: invt-browser-tester (after implementation) — run in background
- **Docs / config only**: main session, no sub-agents needed

### Agent Workflow Per Issue

#### Phase 1 — Implement (parallel sub-agents where applicable)
1. Checkout feature branch from main
2. If backend + frontend changes needed, dispatch both in parallel:
   - invt-engineer: implement backend (routes, services, models)
   - invt-frontend: implement frontend (JS modules, CSS, HTML)
3. If only one side needed, dispatch the relevant agent

#### Phase 2 — Review (after Phase 1)
1. Dispatch invt-reviewer: review code quality, check patterns match existing codebase
2. Dispatch invt-browser-tester: verify in browser, check console for errors

#### Phase 3 — Fix & PR (main session, sequential)
1. Address review findings
2. Run verification checks (syntax, API smoke test)
3. Commit with Conventional Commits format
4. Push and create PR targeting main
5. Include `Closes #<issue-number>` in PR body

#### Phase 4 — Changelog (automatic)
After PR is merged, a GitHub Action runs `git-cliff` to regenerate `CHANGELOG.md` automatically.
