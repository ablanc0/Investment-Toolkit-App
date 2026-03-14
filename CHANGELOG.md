# Changelog

All notable changes to InvToolkit will be documented in this file.

**Labels:** 🟩 Feature · 🟦 Enhancement · 🟧 Fix · 🟥 Security · ⬜ Documentation



## 2026-03-14
- 🟩 Feature 1099 business expenses + QBI deduction (Phase 2)


## 2026-03-13
- ⬜ Documentation update changelog
- 🟩 Feature Income Tax — year selector fix + filing status (Phase 1)
- ⬜ Documentation update changelog
- ⬜ Documentation update changelog
- 🟩 Feature unified API quota and rate-limiting service
- ⬜ Documentation update changelog
- 🟩 Feature Resettle Place API as on-demand COL data source


## 2026-03-11
- 🟧 Fix exclude large/ephemeral files from git backup
- 🟩 Feature add new company logos and data backups
- ⬜ Documentation update changelog
- 🟦 Enhancement API abstraction and resilience foundation
- ⬜ Documentation update changelog
- 🟧 Fix exclude quota-limited APIs from health check pings
- ⬜ Documentation update changelog
- 🟩 Feature bulk refresh IV list values and scores
- 🟧 Fix grant write permissions to changelog workflow
- 🟧 Fix use server-provided IV signal in watchlist and alerts


## 2026-03-10
- 🟩 Feature enhance watchlist tab with KPIs, inline editing, and IV signals
- 🟦 Enhancement visually separate totals/summary rows and fix sticky column backgrounds
- 🟩 Feature add CI pipeline with Python/JS linting and Sphinx docs build
- ⬜ Documentation remove invt-changelog agent, replaced by GitHub Action
- 🟧 Fix trigger changelog update on PR merge instead of push
- 🟩 Feature add GitHub Action to auto-update changelog on push to main
- ⬜ Documentation update changelog
- 🟩 Feature automated changelog with git-cliff
- 🟦 Enhancement toggle research/portfolio views in My Lab
- 🟩 Feature add In Portfolio column to My Lab Most Held Tickers table
- 🟦 Enhancement add logos to dividend log column headers
- 🟧 Fix logo onerror retry with cache bust, remove elbstream attribution
- 🟩 Feature upgrade all logos to 250px, add 53 new logos via FMP fallback
- 🟩 Feature add FMP CDN fallback, 250px logos, API health tracking, larger logos throughout
- 🟩 Feature move logos to data/logos/, fix browser cache issue
- 🟩 Feature move logo cache to app dir and add logos to all tabs
- 🟧 Fix detect SVG vs PNG content type for logo caching
- 🟩 Feature add ticker logo cache from Elbstream API
- 🟩 Feature add dividend calendar with forecast
- 🟦 Enhancement show ex-date vs payment date in calendar, cap to current month
- 🟦 Enhancement make calendar forward-looking with ex-date and payment date


## 2026-03-09
- 🟧 Fix include ETFs with no divRate in calendar by using dividend history
- 🟧 Fix clamp calendar navigation to data range
- 🟧 Fix expand calendar lookback to 12 months for historical events
- 🟩 Feature add dividend calendar with forecast
- 🟩 Feature add geographic and currency diversification
- 🟩 Feature implement 8 Snowball Analytics gap features
- 🟧 Fix exclude manual entries from state avg salary to prevent contamination
- 🟦 Enhancement show salary source on PPI label and data source line
- 🟦 Enhancement add salary source indicator on PPI column
- 🟦 Enhancement replace Formula column with COL index in comparison table
- 🟩 Feature sortable comparison table, home city row, rename EL Equiv to Home Equiv
- 🟧 Fix use colPlusRentIndex for PPI to match Numbeo methodology
- 🟩 Feature auto-compute COL/PPI for manual entries, uniform KPI cards, glossary
- 🟩 Feature add inline edit for DB city entries in Reference Inputs
- 🟩 Feature global cities, country support, manual DB entries, UX fixes


## 2026-03-08
- 🟦 Enhancement remove state prefix from average option in Data Source dropdown
- 🟧 Fix add State/Region selector back to COL home city config
- 🟦 Enhancement streamline COL home city selection
- 🟦 Enhancement remove All filter, widen search bar, reorder controls
- 🟦 Enhancement always-visible city search with autocomplete, replace dropdown form
- 🟩 Feature pin/unpin comparison cities, fix delete by metro name
- 🟩 Feature city dropdown with auto-resolve for home city selection
- 🟩 Feature direct cost ratio formula, hierarchical config UI
- 🟩 Feature fix COL formula to use relative ratio, add home city parameters
- 🟦 Enhancement yellow exhausted status, hide error line for quota limits
- 🟩 Feature global city list storage, raw data preservation, exhausted status tracking
- 🟩 Feature smart 2-phase refresh — always update data, detect new cities
- 🟩 Feature auto-upgrade cities from API, enhanced formula, richer data
- 🟩 Feature add RapidAPI to health check ping
- 🟩 Feature integrate RapidAPI Cost of Living data
- ⬜ Documentation update setup docs with env vars, security section
- 🟥 Security add escapeHtml and apply to all dynamic content for XSS prevention
- 🟥 Security move secrets to env vars, disable debug, add validation & security headers
- 🟩 Feature Retirement Plan section in Salary tab
- 🟩 Feature Tax Accounts tab — HSA Calculator + Expense Tracker


## 2026-03-07
- 🟦 Enhancement replace floating health panel with full-page tab and LIVE DATA-style badge
- 🟦 Enhancement move API health to header dropdown with auto-check on startup
- 🟦 Enhancement replace FMP quota counter with static limit note
- 🟩 Feature add API health monitor with status checks, warnings, and quota tracking
- 🟩 Feature API key management, light/dark theme toggle, and valuation defaults wiring
- 🟩 Feature add display preferences, default tab, and cache TTL settings
- 🟩 Feature split signal system into IV Signal and Avg Cost Signal
- 🟩 Feature goals editor, target allocations, and valuation defaults
- 🟩 Feature editable portfolio name and top performer threshold


## 2026-03-06
- 🟩 Feature configurable signal thresholds and default signal mode
- 🟩 Feature configurable category system with Settings UI
- 🟩 Feature add settings API and storage layer
- 🟦 Enhancement stack backup timestamp below last-updated in header
- 🟩 Feature auto-backup portfolio data to repo backups/ directory
- ⬜ Documentation add agent boundaries, domain mapping, and parallelization guidance
- ⬜ Documentation add Sphinx user documentation (formulas, config, data management)
- ⬜ Documentation add git rules, gh CLI permissions, agent definitions to CLAUDE.md
- ⬜ Documentation update CLAUDE.md, PLAN.md for modular architecture
- 🟦 Enhancement modular architecture — split monolith into 50 focused files


## 2026-03-05
- 🟧 Fix harden 13F pipeline for future quarterly reports
- 🟧 Fix sanitize 13F history — remove amendment filings and value outliers
- 🟦 Enhancement rename Warren Buffett → Greg Abel, migrate history key
- 🟦 Enhancement remove 13f_cache, use history as single source of truth
- 🟧 Fix backfill 13F cache from history on startup
- 🟩 Feature portfolio value change %, allocation treemap
- 🟩 Feature activity badges, current prices, and holding history per row
- 🟩 Feature historical 13F data, portfolio value charts, activity tracking, UI refactor
- 🟩 Feature expand to 22 super investors, add bio notes, allocation chart, Top 10% badge


## 2026-03-06
- 🟩 Feature integrate InvT Score across Summary, IV list, Portfolio, and Watchlist
- 🟧 Fix store None for unreported SEC data instead of defaulting to 0
- 🟧 Fix return None instead of 0 for ROIC/FCFps when source data is missing
- 🟧 Fix merge XBRL tags across years for complete SEC EDGAR data
- 🟩 Feature add XBRL fallback tags + "No data reported" chart placeholder
- 🟩 Feature switch scoring from 5yr/1yr to 10yr/5yr with data quality gate
- 🟩 Feature InvT Score v2 — redesign scoring logic based on academic research
- 🟦 Enhancement move score description to right side of hero banner
- 🟦 Enhancement dividends collapsible spans 2 columns instead of full width
- 🟦 Enhancement remove ? icons, keep tooltip on cursor hover only
- 🟦 Enhancement score descriptions, metric tooltips, abbreviated names, dividends layout
- 🟦 Enhancement add data source footer to Overview tab, improve InvT Score source visibility
- 🟧 Fix radar colors, dividend yield chart, shares blank, collapsible layout
- 🟦 Enhancement redesign InvT Score layout — category chart rows + collapsible details
- 🟧 Fix bar charts stretching — wrap canvas in fixed-height container


## 2026-03-05
- 🟩 Feature add per-metric bar charts to InvT Score categories
- 🟧 Fix InvT Score bug fixes, scoring fairness & UI polish
- 🟦 Enhancement add warning that Refresh All takes a few minutes
- 🟧 Fix CIKs, rate limiting, merge overlap into most popular
- 🟩 Feature persistent 13F cache + most popular stocks across investors
- 🟩 Feature SEC EDGAR 13F super investor holdings integration
- 🟩 Feature rethink composite IV — refined categories, benchmarks, Summary tab redesign
- 🟩 Feature compact DCF Scenarios layout — side-by-side table, collapsible detail


## 2026-03-04
- 🟦 Enhancement rename Endeuda2 to DCF Scenarios across codebase
- 🟩 Feature move valuation results to top of each method tab with consistent banner
- 🟩 Feature data source notice when fewer than 10 years available
- 🟧 Fix add yfinance as third fallback for foreign ADRs not in EDGAR/FMP
- 🟩 Feature replace FMP with SEC EDGAR as primary data source
- 🟦 Enhancement Graham toggle buttons with active/inactive visual indicator
- 🟩 Feature persist analyzer results to analyzer.json + median toggle
- 🟩 Feature Finviz peer comparison for Relative valuation
- 🟩 Feature Relative valuation — FMP-derived ratios, editable sector averages
- 🟩 Feature Graham improvements — negative EPS warning, presets, FRED date
- 🟩 Feature Graham — FMP earnings growth + live FRED AAA yield
- 🟩 Feature Graham model — editable formula, FMP EPS, capped growth
- 🟧 Fix rename signal label to InvT Valuation
- 🟩 Feature prominent signal badges and data sources in stock analyzer UI
- 🟩 Feature per-model signals, analyst consensus, and data source labels
- 🟧 Fix use net debt for WACC weights and align market return to 9.9%
- 🟩 Feature migrate stock analyzer financials from yfinance to FMP API
- 🟩 Feature stock analyzer valuation models (DCF, Graham, Relative)


## 2026-03-03
- 🟩 Feature portfolio projections with server-side engine, auto-populate, and year-by-year table
- 🟩 Feature salary tab — profiles, progressive tax, income streams, employer cost, projections


## 2026-03-02
- 🟩 Feature multi-strategy simulation, inflation chart, and strategy comparison
- 🟩 Feature historical S&P 500 simulation for Rule 4% (20/30/40 year scenarios)
- 🟩 Feature add monthly income distribution matrix with YOY growth
- 🟦 Enhancement replace sidebar with two-level top navigation bar
- 🟩 Feature replace tab bar with collapsible sidebar navigation
- 🟩 Feature add live allocation charts to rebalancing tab
- 🟧 Fix reorder rebalancing tab — calculator table on top
- 🟩 Feature expand Watchlist to 19 columns matching Excel baseline
- 🟩 Feature add rebalancing calculator table with buying power
- 🟩 Feature expand Dashboard with 4 KPI sections matching Excel baseline
- 🟧 Fix consolidate signals, add cash row, fix category colors
- 🟩 Feature expand Positions tab to 29 columns matching Excel baseline
- 🟧 Fix correct dividend yield double-multiplication bug
- 🟩 Feature complete Stock Analyzer redesign with 50+ data fields
- 🟩 Feature make Lab notes editable with inline click-to-edit
- 🟩 Feature fix error banner, add div yield to watchlist and rebalancing
- ⬜ Documentation comprehensive developer handoff guide in PLAN.md
- 🟩 Feature initial InvToolkit dashboard with 19 tabs and 60+ API routes

