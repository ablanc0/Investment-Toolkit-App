Portfolio Core — Developer Architecture
=======================================

Internal architecture of the core data layer and the Portfolio,
Dividends, Watchlist, My Lab, and Misc subsystems.

.. contents::
   :local:
   :depth: 2

----

Data Store
----------

``services/data_store.py`` is the single gateway to ``portfolio.json``.
No route directly reads or writes the file.

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``load_portfolio()``
     - Reads ``portfolio.json``.  Returns bootstrap dict if missing.
       No caching (file lives on Google Drive).
   * - ``save_portfolio(data)``
     - Pretty-prints to disk.  Triggers ``backup.notify_backup()``.
   * - ``get_settings()``
     - Deep-merges ``portfolio["settings"]`` with ``DEFAULT_SETTINGS``.
   * - ``save_settings(updates)``
     - Shallow-merges updates into settings, persists.
   * - ``crud_list(section)``
     - Returns ``{section: [...], lastUpdated}``.
   * - ``crud_add(section, item)``
     - Appends to section array.
   * - ``crud_update(section, index, updates)``
     - Merges updates into ``items[index]``.
   * - ``crud_delete(section, index)``
     - Pops item at index.
   * - ``crud_replace(section, data)``
     - Replaces entire section array.
   * - ``get_accounts()``
     - Returns ``portfolio["accounts"]`` (or ``[]``).
   * - ``get_account(account_id)``
     - Finds account by ``id``.  Returns ``None`` if not found.
   * - ``save_account(account)``
     - Insert-or-update by ``id`` in the ``accounts`` array.
   * - ``delete_account(account_id)``
     - Removes account by ``id``.  Returns ``True`` if found.

**All mutations are load-mutate-save** — no partial file writes.
No locking (single-user app).  No schema validation on read.

portfolio.json Top-Level Keys
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 25 10 30

   * - Key
     - Type
     - Managed By
   * - ``positions``
     - array
     - ``routes/portfolio.py``
   * - ``watchlist``
     - array
     - ``routes/portfolio.py``
   * - ``cash``
     - number
     - ``routes/portfolio.py``
   * - ``goals``, ``targets``
     - dict
     - ``routes/portfolio.py``
   * - ``strategy``
     - string[]
     - ``routes/portfolio.py``
   * - ``dividendLog``
     - array
     - ``routes/dividends.py``
   * - ``soldPositions``
     - array
     - ``routes/dividends.py``
   * - ``monthlyData``
     - array
     - ``routes/dividends.py``
   * - ``intrinsicValues``
     - array
     - ``routes/misc.py``
   * - ``superInvestorBuys``
     - array
     - ``routes/misc.py``
   * - ``myLab``
     - array
     - ``routes/lab.py``
   * - ``labResearch``
     - array
     - ``routes/lab.py``
   * - ``settings``
     - dict
     - ``services/data_store.py``
   * - ``salary``
     - dict
     - ``routes/salary.py``
   * - ``colConfig``
     - dict
     - ``routes/planning.py``
   * - ``projections``
     - dict
     - ``routes/projections.py``
   * - ``rule4Pct``
     - dict
     - ``routes/planning.py``
   * - ``passiveIncome``
     - array
     - ``routes/planning.py``
   * - ``historicData``
     - array
     - ``models/simulation.py``
   * - ``accounts``
     - array
     - ``routes/accounts.py``

----

Portfolio & Positions
---------------------

``routes/portfolio.py`` — Blueprint ``portfolio``.

GET /api/portfolio Flow
^^^^^^^^^^^^^^^^^^^^^^^

The most complex route in the codebase:

1. ``load_portfolio()`` + ``get_settings()``
2. ``fetch_all_quotes(tickers)`` — batch yfinance for all positions
3. Build IV map from ``intrinsicValues`` section
4. Build cumulative dividends received from ``dividendLog``
5. Per-position enrichment (30+ computed fields)
6. Portfolio aggregates (market value, cost basis, day change, yields)
7. Allocation grouping (category, sector, secType, country, currency)
8. Weighted P/E and Beta
9. Sold positions summary
10. Goals progress

Position enrichment produces: ``marketValue``, ``marketReturn``,
``totalReturn``, ``dayChange``, ``weight``, ``divYield``, ``yieldOnCost``,
``annualDivIncome``, ``ivSignal``, ``avgCostSignal``, and more.

Signal classification uses configurable thresholds from
``settings.signalThresholds`` (IV-based 4-tier and avgCost-based 5-tier).

``divRate`` fallback: when divRate is 0 but divYield is present (common
for ETFs), synthesized as ``price × divYield / 100``.

Key Endpoints
^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/portfolio``
     - Full enriched portfolio with aggregates.
   * - GET
     - ``/api/watchlist``
     - Enriched watchlist with IV signals.
   * - GET
     - ``/api/quote/<ticker>``
     - Single-ticker quick lookup.
   * - POST
     - ``/api/position/add``
     - Add position (validates ticker, checks duplicates).
   * - POST
     - ``/api/position/update``
     - Whitelist-restricted field update.
   * - POST
     - ``/api/position/delete``
     - Remove position by ticker.
   * - POST
     - ``/api/cash/update``
     - Set cash balance.
   * - POST
     - ``/api/goals/update``
     - Update goal targets.
   * - POST
     - ``/api/targets/update``
     - Update category allocation targets.
   * - GET
     - ``/api/find-the-dip``
     - SMA analysis (10/50/100/200-day) for all positions.
   * - GET
     - ``/api/dividend-safety``
     - Composite safety score from InvT Score metrics.

----

Dividends
---------

``routes/dividends.py`` — Blueprint ``dividends``.

Dividend Log Schema
^^^^^^^^^^^^^^^^^^^

Flat array of month rows.  Ticker columns are **hardcoded** in the
route — adding a new holding requires a code change.

.. code-block:: json

   {
     "year": 2024,
     "month": "January",
     "GOOGL": 0, "MSFT": 12.50, "KO": 8.75,
     "cashInterest": 3.20,
     "total": 24.45
   }

Month format note: ``dividendLog`` uses ``"January"`` while
``monthlyData`` uses ``"January 24"``.  Join splits on space.

Annual Data — Computed, Never Stored
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

``GET /api/annual-data`` recomputes from ``monthlyData`` and
``dividendLog`` on every request:

- ``portfolioValue`` = last non-zero value in year's months
- ``annualContributions`` = sum of contributions
- ``dividendIncome`` = sum of ``total`` from dividend log
- ``totalReturnPct`` computed from accumulated investment

Changes to any monthly cell instantly propagate to annual summaries.

Dividend Calendar
^^^^^^^^^^^^^^^^^

``GET /api/dividend-calendar`` projects future dividend events:

1. Detect frequency from last 8 intervals (monthly/quarterly/etc.)
2. Use yfinance declared ex-dates for the next event if available
3. Project remaining events forward with ``status: "estimated"``
4. Aggregate by ``YYYY-MM`` for monthly income totals

Key Endpoints
^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/sold-positions``
     - CRUD list (gain/gainPct computed on add).
   * - GET
     - ``/api/dividend-log``
     - Raw log + active tickers list.
   * - POST
     - ``/api/dividend-log/update``
     - Update single cell, recompute row total.
   * - POST
     - ``/api/dividend-log/add-year``
     - Add 12 month rows for a new year.
   * - GET
     - ``/api/monthly-data``
     - Monthly data + income distribution cross-tab.
   * - GET
     - ``/api/annual-data``
     - Computed annual summaries with S&P 500 comparison.
   * - GET
     - ``/api/dividend-calendar``
     - Projected future dividend events.

----

My Lab
------

``routes/lab.py`` — Blueprint ``lab``.  Scratchpad for modeling
hypothetical portfolios.  No live quote enrichment — static reference.

.. list-table::
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/my-lab``
     - List all lab portfolios + research results.
   * - POST
     - ``/api/my-lab/research``
     - Ticker frequency across all lab portfolios.
   * - POST
     - ``/api/my-lab/add-portfolio``
     - Create empty portfolio.
   * - POST
     - ``/api/my-lab/add-holding``
     - Add holding to a portfolio by index.
   * - POST
     - ``/api/my-lab/delete-holding``
     - Remove holding by portfolio + holding index.

----

Intrinsic Values (Misc)
------------------------

``routes/misc.py`` — Blueprint ``misc``.

Dual-schema entries: **manual add** (simple: ticker, method, IV,
MoS) and **analyzer upsert** (rich: company, sector, InvT Score,
analyst targets, signal).

The upsert path is called by the Stock Analyzer when a user saves
their analysis.  It is an insert-or-replace by ticker.

``intrinsicValues`` serves a **dual role**: manual IV ledger AND
cross-route store for InvT Scores.  Both ``/api/portfolio`` and
``/api/watchlist`` read ``invtScore`` from this section.

Operational endpoints: ``/api/status`` (health check),
``/api/logo/<ticker>`` (cached logos), ``/api/quotas`` (unified
quota status), ``/api/backup/*`` (backup daemon).

----

Design Decisions
----------------

**CRUD uses integer index addressing.**
No stable UUIDs — the frontend tracks item indexes.  Deliberate
simplicity for a personal app.

**Dividend log ticker columns are hardcoded.**
Adding a new holding to the dividend log requires a code change
(known design debt).

**Intrinsic values serve as cross-route data bridge.**
The ``invtScore`` field stored via the analyzer upsert is read by
portfolio and watchlist enrichment.  This avoids coupling those
routes to the analyzer directly.

**All allocations computed on-the-fly.**
Category/sector/country weights are computed per request from
position market values — never stored.

----

See Also
--------

* :doc:`cost-of-living` — COL subsystem (also in planning.py)
* :doc:`simulation-projections` — Rule 4% and projections
* :doc:`stock-analyzer` — Analyzer and InvT Score
