# Changelog

All notable changes to InvToolkit will be documented in this file.

## [Unreleased]

### 🚀 Feature

- automated changelog with git-cliff and Sphinx integration
## [0.3.0] — 2026-03-10

### ✨ Enhancement

- toggle research/portfolio views in My Lab
- add logos to dividend log column headers
- show ex-date vs payment date in calendar, cap to current month
- make calendar forward-looking with ex-date and payment date
- show salary source on PPI label and data source line
- add salary source indicator on PPI column
- replace Formula column with COL index in comparison table
- remove state prefix from average option in Data Source dropdown
- streamline COL home city selection
- remove All filter, widen search bar, reorder controls
- always-visible city search with autocomplete, replace dropdown form
- yellow exhausted status, hide error line for quota limits
- replace floating health panel with full-page tab and LIVE DATA-style badge
- move API health to header dropdown with auto-check on startup
- replace FMP quota counter with static limit note
- stack backup timestamp below last-updated in header

### 🐛 Fix

- logo onerror retry with cache bust, remove elbstream attribution
- detect SVG vs PNG content type for logo caching
- include ETFs with no divRate in calendar by using dividend history
- clamp calendar navigation to data range
- expand calendar lookback to 12 months for historical events
- exclude manual entries from state avg salary to prevent contamination
- use colPlusRentIndex for PPI to match Numbeo methodology
- add State/Region selector back to COL home city config

### 📖 Documentation

- update setup docs with env vars, security section
- add agent boundaries, domain mapping, and parallelization guidance
- add Sphinx user documentation (formulas, config, data management) (#83) ([#83](https://github.com/ablanc0/Investment-Toolkit-App/pull/83))

### 🔒 Security

- add escapeHtml and apply to all dynamic content for XSS prevention
- move secrets to env vars, disable debug, add validation & security headers

### 🚀 Feature

- add In Portfolio column to My Lab Most Held Tickers table
- upgrade all logos to 250px, add 53 new logos via FMP fallback
- add FMP CDN fallback, 250px logos, API health tracking, larger logos throughout
- move logos to data/logos/, fix browser cache issue
- move logo cache to app dir and add logos to all tabs
- add ticker logo cache from Elbstream API (#146)
- add dividend calendar with forecast (#132) ([#145](https://github.com/ablanc0/Investment-Toolkit-App/pull/145))
- add dividend calendar with forecast (#132)
- add geographic and currency diversification (#133) (#144) ([#144](https://github.com/ablanc0/Investment-Toolkit-App/pull/144))
- implement 8 Snowball Analytics gap features (#143) ([#143](https://github.com/ablanc0/Investment-Toolkit-App/pull/143))
- sortable comparison table, home city row, rename EL Equiv to Home Equiv
- auto-compute COL/PPI for manual entries, uniform KPI cards, glossary
- add inline edit for DB city entries in Reference Inputs
- global cities, country support, manual DB entries, UX fixes
- pin/unpin comparison cities, fix delete by metro name
- city dropdown with auto-resolve for home city selection
- direct cost ratio formula, hierarchical config UI
- fix COL formula to use relative ratio, add home city parameters
- global city list storage, raw data preservation, exhausted status tracking
- smart 2-phase refresh — always update data, detect new cities
- auto-upgrade cities from API, enhanced formula, richer data
- add RapidAPI to health check ping
- integrate RapidAPI Cost of Living data (#128)
- Retirement Plan section in Salary tab (#126) ([#126](https://github.com/ablanc0/Investment-Toolkit-App/pull/126))
- Tax Accounts tab — HSA Calculator + Expense Tracker (#123) ([#123](https://github.com/ablanc0/Investment-Toolkit-App/pull/123))
- add API health monitor with status checks, warnings, and quota tracking
- API key management, light/dark theme toggle, and valuation defaults wiring (#40)
- add display preferences, default tab, and cache TTL settings (#102) ([#102](https://github.com/ablanc0/Investment-Toolkit-App/pull/102))
- split signal system into IV Signal and Avg Cost Signal (#101) ([#101](https://github.com/ablanc0/Investment-Toolkit-App/pull/101))
- goals editor, target allocations, and valuation defaults (#99) ([#99](https://github.com/ablanc0/Investment-Toolkit-App/pull/99))
- editable portfolio name and top performer threshold (#93, #97) (#98) ([#98](https://github.com/ablanc0/Investment-Toolkit-App/pull/98))
- configurable signal thresholds and default signal mode (#87) (#92) ([#92](https://github.com/ablanc0/Investment-Toolkit-App/pull/92))
- configurable category system with Settings UI (#89) ([#89](https://github.com/ablanc0/Investment-Toolkit-App/pull/89))
- add settings API and storage layer
- auto-backup portfolio data to repo backups/ directory
## [0.2.0] — 2026-03-06

### ✨ Enhancement

- modular architecture — split monolith into 50 focused files
- rename Warren Buffett → Greg Abel, migrate history key (#68)
- remove 13f_cache, use history as single source of truth (#68)
- move score description to right side of hero banner
- dividends collapsible spans 2 columns instead of full width
- remove ? icons, keep tooltip on cursor hover only
- score descriptions, metric tooltips, abbreviated names, dividends layout
- add data source footer to Overview tab, improve InvT Score source visibility
- redesign InvT Score layout — category chart rows + collapsible details
- add warning that Refresh All takes a few minutes
- rename Endeuda2 to DCF Scenarios across codebase (#58) (#59) ([#59](https://github.com/ablanc0/Investment-Toolkit-App/pull/59))
- Graham toggle buttons with active/inactive visual indicator
- replace sidebar with two-level top navigation bar

### 🐛 Fix

- harden 13F pipeline for future quarterly reports (#68)
- sanitize 13F history — remove amendment filings and value outliers (#68)
- backfill 13F cache from history on startup (#68)
- store None for unreported SEC data instead of defaulting to 0
- return None instead of 0 for ROIC/FCFps when source data is missing
- merge XBRL tags across years for complete SEC EDGAR data
- radar colors, dividend yield chart, shares blank, collapsible layout
- bar charts stretching — wrap canvas in fixed-height container
- InvT Score bug fixes, scoring fairness & UI polish (#44)
- CIKs, rate limiting, merge overlap into most popular
- add yfinance as third fallback for foreign ADRs not in EDGAR/FMP
- rename signal label to InvT Valuation
- use net debt for WACC weights and align market return to 9.9%
- reorder rebalancing tab — calculator table on top
- consolidate signals, add cash row, fix category colors
- correct dividend yield double-multiplication bug

### 📖 Documentation

- add git rules, gh CLI permissions, agent definitions to CLAUDE.md
- update CLAUDE.md, PLAN.md for modular architecture
- comprehensive developer handoff guide in PLAN.md

### 🚀 Feature

- portfolio value change %, allocation treemap (#68)
- activity badges, current prices, and holding history per row (#68)
- historical 13F data, portfolio value charts, activity tracking, UI refactor (#68)
- expand to 22 super investors, add bio notes, allocation chart, Top 10% badge (#68)
- integrate InvT Score across Summary, IV list, Portfolio, and Watchlist
- add XBRL fallback tags + "No data reported" chart placeholder
- switch scoring from 5yr/1yr to 10yr/5yr with data quality gate
- InvT Score v2 — redesign scoring logic based on academic research
- add per-metric bar charts to InvT Score categories
- persistent 13F cache + most popular stocks across investors
- SEC EDGAR 13F super investor holdings integration (#65)
- rethink composite IV — refined categories, benchmarks, Summary tab redesign (#64) ([#64](https://github.com/ablanc0/Investment-Toolkit-App/pull/64))
- compact DCF Scenarios layout — side-by-side table, collapsible detail (#60) (#62) ([#62](https://github.com/ablanc0/Investment-Toolkit-App/pull/62))
- move valuation results to top of each method tab with consistent banner
- data source notice when fewer than 10 years available
- replace FMP with SEC EDGAR as primary data source (#54)
- persist analyzer results to analyzer.json + median toggle (#37)
- Finviz peer comparison for Relative valuation (#37)
- Relative valuation — FMP-derived ratios, editable sector averages (#37)
- Graham improvements — negative EPS warning, presets, FRED date (#42)
- Graham — FMP earnings growth + live FRED AAA yield (#42)
- Graham model — editable formula, FMP EPS, capped growth (#36)
- prominent signal badges and data sources in stock analyzer UI
- per-model signals, analyst consensus, and data source labels
- migrate stock analyzer financials from yfinance to FMP API
- stock analyzer valuation models (DCF, Graham, Relative) (#32) ([#32](https://github.com/ablanc0/Investment-Toolkit-App/pull/32))
- portfolio projections with server-side engine, auto-populate, and year-by-year table (#31) ([#31](https://github.com/ablanc0/Investment-Toolkit-App/pull/31))
- salary tab — profiles, progressive tax, income streams, employer cost, projections (#28) ([#28](https://github.com/ablanc0/Investment-Toolkit-App/pull/28))
- multi-strategy simulation, inflation chart, and strategy comparison
- historical S&P 500 simulation for Rule 4% (20/30/40 year scenarios)
- add monthly income distribution matrix with YOY growth
- replace tab bar with collapsible sidebar navigation
- add live allocation charts to rebalancing tab
- expand Watchlist to 19 columns matching Excel baseline
- add rebalancing calculator table with buying power
- expand Dashboard with 4 KPI sections matching Excel baseline
- expand Positions tab to 29 columns matching Excel baseline
- complete Stock Analyzer redesign with 50+ data fields
- make Lab notes editable with inline click-to-edit
- fix error banner, add div yield to watchlist and rebalancing
## [0.1.0] — 2026-03-02

### 🚀 Feature

- initial InvToolkit dashboard with 19 tabs and 60+ API routes

