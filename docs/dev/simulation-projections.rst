Simulation & Projections — Developer Architecture
==================================================

Internal architecture of the Rule 4% historical simulation engine
and the compound growth projections subsystem.

.. contents::
   :local:
   :depth: 2

----

Rule 4% Simulation
-------------------

Data Model
^^^^^^^^^^

**Historic data** — ``portfolio.json`` under ``historicData``.  Auto-imported
from Excel baseline on first use (cached permanently after import).

Record schema:

.. code-block:: python

   {
       "year": int,
       "avgClosing": float,      # S&P 500 annual avg closing price
       "yearOpen": float,
       "yearClose": float,
       "annualReturn": float,    # fractional (0.2646 = 26.46%)
       "cpi": float,             # fractional (0.033 = 3.3%)
   }

**Rule 4% config** — ``portfolio.json`` under ``rule4Pct``:
``annualExpenses``, ``inflationPct``, ``withdrawalPct``,
``currentPortfolio``, ``monthlyContribution``, ``expectedReturnPct``.

Simulation Engine
^^^^^^^^^^^^^^^^^

``models/simulation._run_simulation()`` performs an exhaustive
historical backtest — every valid starting year is tested (not
Monte Carlo).

**Strategies:**

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Strategy
     - Mechanics
   * - ``fixed``
     - Classic Rule 4%.  Withdraw fixed amount, inflate by CPI yearly.
       Cash buffer absorbs withdrawals in down years (return < -10%).
   * - ``guardrails``
     - Percentage-of-portfolio with floor/ceiling clamps on the
       inflation-adjusted base withdrawal.
   * - ``dividend``
     - No principal selling.  Income = ``balance × div_yield``.
       Balance floats with market returns.
   * - ``combined``
     - Dividend income first, gap filled by selling principal.
       Base withdrawal inflates by CPI.

**Cash buffer**: initialized as ``base_withdrawal × cash_buffer_years``.
Drawn down in bad years, never replenished.

**Output schema:**

.. code-block:: python

   {
       "horizon": int,
       "totalScenarios": int,
       "successCount": int,
       "successRate": float,       # percentage
       "avgFinalBalance": float,   # surviving scenarios only
       "worstStartYear": int,
       "bestStartYear": int,
       "scenarios": [
           {
               "startYear": int,
               "survived": bool,
               "finalBalance": float,
               "data": [
                   {
                       "year": int,
                       "retirementYear": int,
                       "balance": float,
                       "withdrawalAmount": float,
                       "inflationPct": float,
                       "cumulativeInflation": float,
                       "cashReserve": float,
                   }
               ]
           }
       ]
   }

``avgFinalBalance`` excludes failed scenarios (conditional on survival).

Simulation Endpoints
^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/rule4pct``
     - Returns stored config (no computation).
   * - POST
     - ``/api/rule4pct/update``
     - Persists config changes.
   * - GET
     - ``/api/rule4pct/simulate``
     - Runs simulation for 20, 30, and 40-year horizons
       simultaneously.  All three returned in one call.
   * - GET
     - ``/api/rule4pct/compare``
     - Runs all 4 strategies for a single horizon.
   * - GET
     - ``/api/historic-data``
     - Returns raw S&P 500 history dataset.

----

Projections
-----------

Data Model
^^^^^^^^^^

``portfolio.json`` under ``projections``:
``startingValue``, ``monthlyContribution``, ``expectedReturnPct``,
``dividendYieldPct``, ``inflationPct``, ``years``.

Computation
^^^^^^^^^^^

``models/projections_calc.compute_projections()`` uses **monthly
compounding** (vs annual in simulation):

.. code-block:: text

   For each year (0..N):
     For each month (1..12):
       balance = balance × (1 + annual_rate/12) + monthly_add
     divIncome = start_of_year_balance × div_yield
     realBalance = balance / (1 + inflation)^year

Three scenarios computed per request:

- **Base**: ``expectedReturnPct``
- **Bull**: ``expectedReturnPct + 2``
- **Bear**: ``max(0, expectedReturnPct - 2)``

Row schema: ``{year, balance, realBalance, contributions, growth,
divIncome, totalDividends}``.

Legacy key migration (``_normalize_proj_config``): ``currentValue`` →
``startingValue``, ``expectedGrowth`` → ``expectedReturnPct``
(auto-detects decimal vs percent).

Projections Endpoints
^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/projections``
     - Returns base/bull/bear projection tables.
   * - POST
     - ``/api/projections/update``
     - Save config and return updated projections.
   * - POST
     - ``/api/risk-scenarios/update``
     - Save custom risk scenario definitions (frontend-defined).

----

Passive Income CRUD
-------------------

``portfolio.json`` under ``passiveIncome``.  Uses generic CRUD helpers.

Record schema: ``{source, type, amount, frequency, startDate, active,
notes, annualized}``.  ``annualized`` is computed server-side using
frequency multiplier (Monthly=12, Quarterly=4, etc.).

.. list-table::
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/passive-income``
     - List all passive income sources.
   * - POST
     - ``/api/passive-income/add``
     - Add source (annualized computed server-side).
   * - POST
     - ``/api/passive-income/update``
     - Update by index.
   * - POST
     - ``/api/passive-income/delete``
     - Delete by index.

----

Design Decisions
----------------

**Exhaustive backtest, not Monte Carlo.**
Every valid historical starting year is tested.  Deterministic and
reproducible.

**Three horizons in one call.**
``/api/rule4pct/simulate`` always returns 20, 30, and 40-year results.
Switching horizon in the UI is zero-cost.

**Monthly vs annual compounding.**
Projections use monthly (forward-looking, user adds monthly).
Simulation uses annual (historical data is annual).

**Historic data imported once.**
After first Excel import, ``historicData`` lives in ``portfolio.json``
permanently.  No TTL or refresh.

**Cash buffer is one-directional.**
Initialized at retirement entry, only drawn down.  Models a fixed
cash allocation, not a dynamic bucket strategy.

----

See Also
--------

* :doc:`/formulas/rule4` — Rule 4% formulas (user-facing)
