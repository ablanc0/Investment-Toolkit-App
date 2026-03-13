Stock Analyzer — Developer Architecture
=======================================

Internal architecture of the Stock Analyzer and InvT Score subsystems:
provider cascade, valuation models, scoring system, and caching strategy.

.. contents::
   :local:
   :depth: 2

----

Data Flow
---------

Full Analyzer Pipeline
^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: text

   GET /api/stock-analyzer/<ticker>?refresh=true
     │
     ├── validate_ticker()
     ├── fetch_stock_analysis(ticker)              [stock_data.py]
     │     ├── fetch_yfinance_profile()             # Always called first
     │     └── Provider cascade: EDGAR → FMP → yfinance
     │           ├── _try_edgar()  → edgar.py
     │           ├── _try_fmp()   → fmp.py
     │           └── _try_yfinance() (fallback, never circuit-broken)
     │
     ├── [parallel threads]
     │     ├── _fetch_peer_comparison()              [finviz_svc.py]
     │     ├── _fetch_fmp_dcf()                      [fmp.py]
     │     └── _fetch_fmp_benchmarks()               [fmp.py]
     │
     ├── [sync] Valuation models                     [valuation.py]
     │     ├── compute_dcf()
     │     ├── compute_dcf_scenarios()
     │     ├── compute_graham()
     │     ├── compute_relative()
     │     └── compute_valuation_summary()
     │
     ├── Build result (55+ fields, valuation, benchmarks, _warnings)
     ├── _save_analyzer_store()  → analyzer.json
     └── cache_set()             → cache.json

InvT Score Pipeline
^^^^^^^^^^^^^^^^^^^

.. code-block:: text

   GET /api/invt-score/<ticker>?refresh=true
     │
     ├── Check analyzer.json (version == 3 gate)
     ├── _fetch_invt_data(ticker)                   [invt_score.py]
     │     └── Own EDGAR → FMP cascade (up to 11 years)
     │
     ├── _compute_invt_metrics(yearly, "10yr")
     ├── _compute_invt_metrics(yearly, "5yr")
     ├── Score each metric via _invt_score_metric()
     ├── Category scores (4 scored + 1 informational)
     ├── Hybrid blend: 0.7 × 10yr + 0.3 × 5yr
     ├── Overall score (avg of 4 scored categories, needs ≥3)
     │
     └── _save_analyzer_store()  → analyzer.json

----

Provider Cascade
----------------

``services/stock_data.py`` orchestrates the data fetch.  The cascade
order is user-configurable via ``settings.providerConfig.financials``
(default: ``["edgar", "fmp", "yfinance"]``).

.. list-table::
   :header-rows: 1
   :widths: 15 25 30 30

   * - Provider
     - Circuit Breaker
     - What It Fetches
     - Fallback Behavior
   * - ``edgar``
     - ``"edgar"``
     - XBRL company facts (financial statements)
     - Skip if circuit open or no data
   * - ``fmp``
     - ``"fmp"``
     - Income, cashflow, balance, EV, growth
     - Skip if circuit open or no data
   * - ``yfinance``
     - None (never broken)
     - Income stmt + cashflow DataFrames
     - Last resort; always available

All providers start from a ``yf_info`` base (yfinance profile) and
overlay financial statement data.  Fields unique to yfinance (beta,
analyst targets, 52-week ranges) are always preserved.

If all providers fail, a fallback result with ``yf_info`` only
(no financial statements) is returned, labeled
``"Yahoo Finance (profile only)"``.

----

Data Contracts
--------------

``services/contracts.py`` defines canonical field shapes:

- **QUOTE_FIELDS** (17 fields) — lightweight shape for portfolio/watchlist.
  ``validate_quote()`` is **strict**: drops extra keys.
- **INFO_FIELDS** (54 fields) — deep fundamentals for valuation models.
  ``validate_info()`` is **permissive**: fills defaults but keeps extras.
- **FINANCIAL_FIELDS** — year-keyed dicts for income, cashflow, balance.
  String keys (e.g., ``"Operating Cash Flow"``) match yfinance labels.

Capex sign convention: all providers deliver negative capex
(EDGAR transform negates; yfinance/FMP are already negative).
FCF = ``OCF + capex`` (addition, since capex is negative).

----

Valuation Models
----------------

All functions in ``models/valuation.py`` are pure computation — no
network calls or I/O.  Every function returns ``None`` on insufficient
data (never raises).

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Model
     - Description
   * - ``compute_dcf``
     - Single-phase DCF.  WACC via CAPM, historical FCF growth
       (trimmed mean, 30% haircut), 9-year projection + Gordon
       Growth terminal value.  Margin of safety applied.
   * - ``compute_dcf_scenarios``
     - Two-phase, three-scenario DCF (Base 50%, Best 25%, Worst 25%).
       Each scenario has growth Phase 1 (yr 1-5) and Phase 2 (yr 6-10)
       plus a terminal multiple.  Composite IV is probability-weighted.
   * - ``compute_graham``
     - Graham Revised Formula with live FRED AAA bond yield adjustment.
       Returns partial result ``{negativeEps: true}`` for negative EPS.
       Growth capped at 20%.
   * - ``compute_relative``
     - Sector multiple comparison (P/E, EV/EBITDA, P/B) against
       ``SECTOR_AVERAGES`` (11 GICS sectors).  Simple average of
       available implied prices.
   * - ``compute_valuation_summary``
     - Composite weighted IV.  Stock categorized as Growth/Value/Blend,
       each with different model weights.  Renormalized to available
       models only.

Stock categorization for summary weights:

- **Growth**: P/E > 22 AND revenue growth > 12%
- **Value**: (P/E 0-24 AND divYield > 1.5%) OR P/E 0-16
- **Blend**: everything else

Key constants (overridable via ``settings.valuationDefaults``):

- Risk-free rate: 4.25%, Market return: 9.9%
- Terminal growth: 2.5%, Margin of safety: 30%
- Graham base P/E: 7.0 (conservative vs Graham's 8.5)

----

InvT Score System
-----------------

``models/invt_score.py`` scores companies 0-10 using 5- and 10-year
historical data across 5 categories.

Categories
^^^^^^^^^^

**Scored** (feed overall score, equal weight 1/4 each):

- **Growth**: revenue CAGR, EPS CAGR, FCF/share CAGR
- **Profitability**: GPM, NPM, FCF margin
- **Debt**: net debt CAGR, net debt/FCF, interest coverage
- **Efficiency**: ROA, ROE, ROIC

**Informational** (computed but excluded from overall):

- **Shareholder Returns**: div yield, DPS CAGR, payout ratio, FCF
  payout, shares CAGR

Scoring Mechanics
^^^^^^^^^^^^^^^^^

- Each metric is scored via threshold lookup (``INVT_THRESHOLDS``).
- Two non-monotonic metrics: ``div_yield`` (sweet spot 2-4%) and
  ``payout_ratio`` (sweet spot 20-40%).
- Category score requires ≥2 valid metrics (for 3+ metric categories).
- **Hybrid blend**: ``0.7 × score_10yr + 0.3 × score_5yr``.
- **Overall**: average of 4 scored category hybrids (needs ≥3 non-None).
- **Version gate**: ``version: 3`` in response; cache returns miss if
  version doesn't match (bump on algorithm changes).

Labels: Elite (≥9), High Quality (≥8), Above Average (≥6),
Below Average (≥4), Poor Quality (<4).

Data Fetch
^^^^^^^^^^

``_fetch_invt_data()`` has its own EDGAR → FMP cascade (no yfinance
fallback for historical statements).  Fetches up to 11 years.

Notable: stock split normalization — if consecutive years show >3x
share count jump, all prior years are retroactively adjusted to
prevent CAGR distortions.

----

Persistence Strategy
--------------------

Dual-cache architecture:

- **analyzer.json** — permanent store, no TTL.  Primary read path
  (default non-refresh requests).  Both Analyzer and InvT Score
  write here.
- **cache.json** — TTL-based (5 min default).  Written by Analyzer
  but not read back by it (write-only for cross-module availability).

This means analyzer results from months ago are still served without
refetch until the user explicitly requests ``?refresh=true``.

----

Key Functions
-------------

``services/stock_data.py``
^^^^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``fetch_stock_analysis(ticker)``
     - Main entry point.  yfinance profile + provider cascade.
       Returns ``{info, income, cashflow, balance, data_source}``.
   * - ``fetch_yfinance_profile(ticker)``
     - Raw ``yf.Ticker(ticker).info``.  Called unconditionally.
   * - ``_get_cascade_order()``
     - Reads provider order from settings (re-read on every call).

``models/valuation.py``
^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``_compute_wacc(info, income)``
     - CAPM-based WACC using net debt for capital structure.
       Floored at 5%.
   * - ``_compute_historical_fcf(info, cashflow)``
     - Extracts FCF series, computes trimmed-mean growth rate.
   * - ``_upside_signal(upside)``
     - Maps upside % to signal string (Strong Buy through Overrated).

``models/invt_score.py``
^^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``_fetch_invt_data(ticker)``
     - Own EDGAR → FMP cascade for 5-11 years of historical data.
   * - ``_compute_invt_metrics(yearly, mode)``
     - CAGRs and averages for all 14 metrics in 5yr or 10yr window.
   * - ``_invt_score_metric(value, key)``
     - Threshold-based scoring (0-10) with special cases.
   * - ``_compute_invt_category_scores(scores, categories)``
     - Weighted average per category, min-required check.

----

API Endpoints
-------------

.. list-table::
   :header-rows: 1
   :widths: 10 35 55

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/stock-analyzer/<ticker>``
     - Full analyzer result.  ``?refresh=true`` to re-fetch.
       Default: returns saved result from analyzer.json.
   * - GET
     - ``/api/invt-score/<ticker>``
     - InvT Score with category breakdown and yearly data.
       ``?refresh=true`` to re-compute.

----

Design Decisions
----------------

**Percent vs decimal in info dict.**
Several yfinance fields are decimals (``profitMargins=0.25`` = 25%).
The route multiplies by 100 for display.  Exception:
``dividendYield`` is NOT multiplied (yfinance 1.2+ returns percentage
directly).

**Background threads for ancillary data.**
Peer comparison, FMP DCF, and FMP benchmarks run in parallel threads
while valuation models run synchronously.  Threads write to
single-element list cells (``[None]``) to avoid race conditions.

**_warnings array.**
Every analyzer response includes a ``_warnings`` list flagging
which fallback provider was used, missing critical fields, and
failed valuation models.  The frontend uses this for transparency.

**Valuation models never crash the route.**
Every model wraps in try/except and returns ``None`` on failure.
The route checks each model result and generates a warning for
each ``None``.

----

See Also
--------

* :doc:`api-abstraction` — Provider cascade and resilient HTTP
* :doc:`api-quotas` — API quota management
* See the Formulas & Metrics section in the User Guide for valuation formulas
* See the Formulas & Metrics section in the User Guide for InvT Score formulas
