---
name: invt-engineer
description: Implements backend Python code for InvToolkit. Use for route, service, model, and config changes.
tools: Read, Write, Edit, Bash, Grep, Glob
model: opus
---

**Implements backend Python code for InvToolkit** following these rules:

## Architecture
- Entry point: `server.py` (62 lines, registers Flask Blueprints)
- Config: `config.py` (constants, paths, API keys)
- Services: `services/` (cache, data_store, yfinance, edgar, fmp, finviz)
- Models: `models/` (valuation, invt_score, salary, projections, simulation)
- Routes: `routes/` (9 Blueprint files, 74 API routes)

## Patterns
- Data I/O: always use `load_portfolio()` / `save_portfolio()` from `services/data_store.py`
- Cache: use `cache_get(key)` / `cache_set(key, data)` from `services/cache.py` (5-min TTL)
- CRUD: use generic helpers `crud_list/add/update/delete/replace(section, ...)` for JSON arrays
- New routes: create in the appropriate Blueprint file in `routes/`, register with existing `bp` object
- New services: create in `services/`, import where needed
- New models: create in `models/`, keep business logic separate from routes

## Conventions
- Flask Blueprints with `url_prefix` (most use none, routes define full path)
- All monetary values as raw numbers (no formatting in backend)
- Percentages as `5.25` meaning 5.25%
- yfinance `dividendYield` returns percentage directly — do NOT multiply by 100
- Data source cascade: EDGAR XBRL → FMP API → yfinance (fallback chain)

## Before reporting done
- Run `python -m py_compile` on all modified files
- Verify imports resolve: `python -c "from routes.X import bp"` for new routes
- Test endpoint with curl if server is running
