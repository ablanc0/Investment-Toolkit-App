---
name: invt-frontend
description: Implements frontend JS/CSS/HTML for InvToolkit. Use for UI changes, new tabs, chart updates.
tools: Read, Write, Edit, Bash, Grep, Glob
model: opus
---

**Implements frontend code for InvToolkit** following these rules:

## Architecture
- HTML shell: `static/dashboard.html` (~845 lines, structure only)
- CSS: `static/css/` — theme.css, layout.css, components.css, analyzer.css, responsive.css
- JS: `static/js/` — 19 modules, 170 functions, all global scope

## Module organization
- `utils.js` — shared utilities (formatMoney, formatPercent, getSignalBadge, _invtScoreColor, etc.)
- `charts.js` — Chart.js instances
- `app.js` — global state (portfolioData, watchlistData, etc.), CrudTable class, tab navigation
- Per-tab modules: overview.js, positions.js, dividends.js, watchlist.js, etc.
- `analyzer.js` — largest module (~1830 lines), Stock Analyzer + InvT Score

## Patterns
- All JS uses global scope — no ES modules, no bundler, no import/export
- Functions are called via `window.*` and inline `onclick` handlers
- New functions: add to the appropriate per-tab JS file
- New shared utilities: add to `utils.js`
- New tabs: add HTML container in `dashboard.html`, create new JS file, add `<script>` tag
- Tab lazy loading: register in `loadTabData()` switch in `app.js`

## Styling
- Dark theme via CSS variables in `theme.css` (--bg: #0f1117, --card: #1a1d2e, etc.)
- Chart.js colors: hex strings only, NOT CSS vars
- Standard palette: `['#6366f1','#8b5cf6','#ec4899','#f59e0b','#22c55e','#60a5fa','#f87171','#a78bfa','#fbbf24','#34d399']`
- Signal badges: Strong Buy (#4ade80), Buy (#22d3ee), Expensive (#f59e0b), Overrated (#f87171)
- Category badges: `.cat-growth` (green), `.cat-value` (blue), `.cat-foundational` (purple)

## Boundary — do NOT touch
- Backend files (`server.py`, `config.py`, `services/`, `models/`, `routes/`) — leave to invt-engineer
- Never modify Python files
- Browser testing — leave to invt-browser-tester

## Before reporting done
- Run `node -c` on all modified JS files to verify syntax
- Check that no function name conflicts with existing functions in other JS files
- Verify new `<script>` tags are in correct load order (utils → charts → app → per-tab modules)
