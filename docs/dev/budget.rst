Budget & Net Worth — Developer Architecture
============================================

Internal architecture of the budget tracking and net worth monitoring
system: data model, API endpoints, Excel import pipeline, and frontend
tab structure.

.. contents::
   :local:
   :depth: 2

----

Data Model
----------

Storage
^^^^^^^

Budget and net worth data live in ``portfolio.json`` under two top-level
keys added alongside existing data (zero-migration approach):

.. code-block:: json

   {
     "positions": [],
     "accounts": [],
     "budget": { "year": 2026, "categories": [], "months": {} },
     "netWorth": { "assets": [], "liabilities": [], "snapshots": [] }
   }

Budget Schema
^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 10 70

   * - Field
     - Type
     - Description
   * - ``year``
     - int
     - Budget year (e.g. 2026)
   * - ``currency``
     - str
     - Display currency symbol (``$``)
   * - ``goals``
     - list[str]
     - User-defined budget goals
   * - ``categories``
     - list
     - 6 fixed categories (income, essential, discretionary, debt, savings, investments)
   * - ``months``
     - dict
     - Month data keyed by lowercase name (``january``, ``february``, ...)
   * - ``annualNotes``
     - str
     - Free-text notes for the annual dashboard

**Category object:**

.. code-block:: json

   {
     "id": "essential",
     "name": "Essential Expenses",
     "type": "expense",
     "subcategories": [
       {"name": "Rent", "budgeted": 1000},
       {"name": "Groceries", "budgeted": 500}
     ]
   }

**Month data object:**

.. code-block:: json

   {
     "actuals": {"essential": {"Rent": 1000, "Groceries": 450}},
     "transactions": {
       "essential": [
         {"id": "a1b2c3d4", "subcategory": "Rent", "date": "2026-01-15",
          "amount": 1000, "notes": "January rent"}
       ]
     },
     "overrides": {"income": {"Salary A": 5000}},
     "rollover": false
   }

- ``actuals``: auto-computed from transactions via ``_recompute_actuals()``
- ``transactions``: individual entries with UUID-based IDs
- ``overrides``: per-month budget overrides (replaces master budget amount)
- ``rollover``: if true, carry forward previous month's remainder

Net Worth Schema
^^^^^^^^^^^^^^^^

.. code-block:: json

   {
     "assets": [{"name": "HYSA", "group": "bankAccounts"}],
     "liabilities": [{"name": "Phone Loan", "group": "debt"}],
     "snapshots": [
       {
         "month": "january", "year": 2026,
         "assets": {"HYSA": 12000, "Stocks": 32000},
         "liabilities": {"Phone Loan": 945}
       }
     ]
   }

Snapshots store month-end values. The API enriches each snapshot with
computed ``totalAssets``, ``totalLiabilities``, ``netWorth``,
``monthlyGrowth``, and ``cumulativeGrowth``.

----

API Endpoints
-------------

Budget Routes
^^^^^^^^^^^^^

All routes live in ``routes/budget.py`` (Blueprint: ``budget``).

.. list-table::
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Endpoint
     - Description
   * - GET
     - ``/api/budget``
     - Full budget with computed summaries and rollover amounts
   * - POST
     - ``/api/budget/import``
     - Import budget from Excel file (auto-detects in DATA_DIR)
   * - POST
     - ``/api/budget/actual``
     - Update a single actual: ``{month, categoryId, subcategory, amount}``
   * - POST
     - ``/api/budget/override``
     - Override budget for a month (``null`` amount clears override)
   * - POST
     - ``/api/budget/goals``
     - Update goals array
   * - POST
     - ``/api/budget/category``
     - Add/update a subcategory: ``{categoryId, subcategory: {name, budgeted}}``
   * - POST
     - ``/api/budget/subcategory/delete``
     - Delete a subcategory: ``{categoryId, name}``
   * - POST
     - ``/api/budget/rollover``
     - Toggle rollover: ``{month, enabled}``
   * - POST
     - ``/api/budget/annual/notes``
     - Save annual notes: ``{notes}``
   * - GET
     - ``/api/budget/annual``
     - Computed annual dashboard (monthly totals, savings rates, detail grids)

Transaction CRUD
^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 35 55

   * - Method
     - Endpoint
     - Description
   * - POST
     - ``/api/budget/transaction``
     - Add: ``{month, categoryId, subcategory, date, amount, notes}``
   * - PUT
     - ``/api/budget/transaction/<id>``
     - Update fields: ``{month, categoryId, ...fields}``
   * - DELETE
     - ``/api/budget/transaction/<id>``
     - Delete: ``{month, categoryId}`` in body
   * - POST
     - ``/api/budget/transactions/migrate``
     - Create transactions from legacy actuals (one-time migration)

All transaction mutations call ``_recompute_actuals()`` to keep
the actuals dict in sync.

Net Worth Routes
^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 35 55

   * - Method
     - Endpoint
     - Description
   * - GET
     - ``/api/net-worth``
     - Snapshots with computed totals and growth metrics
   * - POST
     - ``/api/net-worth/snapshot``
     - Add/update full snapshot: ``{month, year, assets, liabilities}``
   * - POST
     - ``/api/net-worth/snapshot/cell``
     - Update single cell: ``{month, type, name, value}``
   * - POST
     - ``/api/net-worth/asset``
     - Add/remove asset or liability item

----

Computation Pipeline
--------------------

Summary Computation
^^^^^^^^^^^^^^^^^^^

``_compute_month_summary(categories, month_data)`` produces:

1. Per-category: ``budgeted``, ``actual``, ``remaining``
2. Aggregates: ``totalIncome``, ``totalExpenses`` (essential + discretionary + debt),
   ``totalSavings``, ``totalInvestments``
3. ``remainder`` = income - all outflows
4. ``savingsRate`` = (savings + investments) / income * 100

Effective Budget
^^^^^^^^^^^^^^^^

``_effective_budget()`` merges master budget with per-month overrides.
If a subcategory has a monthly override, it replaces the master amount
for that month only.

Rollover
^^^^^^^^

``_compute_rollover_amounts()`` iterates months in calendar order.
If a month has ``rollover: true``, its rollover amount equals the
previous month's remainder + that month's carry-forward.

----

Excel Import
------------

``services/budget_import.py`` parses the Spanish-language Excel workbook:

1. **Presupuesto sheet** → 6 budget categories with subcategories and
   master budgeted amounts (``_parse_categories()``)
2. **Monthly sheets** (Enero–Diciembre) → actuals per subcategory and
   transaction logs from rows 59–158 (``_parse_month()``)
3. **Patrimonio Neto sheet** → assets, liabilities, and monthly
   snapshots (``_parse_net_worth()``)

Each month's actuals are paired with synthetic transactions created
from the subcategory totals (``_synthetic_transactions()``).

----

Frontend Tabs
-------------

Four sub-tabs under the Budget top-level tab:

.. list-table::
   :header-rows: 1
   :widths: 20 25 55

   * - Tab
     - JS Module
     - Description
   * - Budget Design
     - ``budget-design.js``
     - Master budget: categories, subcategories, budgeted amounts, goals
   * - Monthly
     - ``budget-monthly.js``
     - Transaction entry, budget vs actual bars, unified transaction table
   * - Annual
     - ``budget-annual.js``
     - Year-to-date dashboard with savings rate trends and detail grids
   * - Net Worth
     - ``networth.js``
     - Asset/liability tracking with monthly snapshots and growth charts

Monthly Tab UX
^^^^^^^^^^^^^^

The Monthly tab is optimized for rapid data entry:

- **Quick-add form** (always visible): category → subcategory auto-populates →
  date (defaults today) → amount → notes → Add. After submit, amount and notes
  clear while category/subcategory/date persist for rapid-fire entries.
- **Budget bars**: compact horizontal progress bars (one per category) with
  color-coded thresholds (green ≤80%, yellow 80–100%, red >100%).
- **Unified transaction table**: all transactions flattened into a single
  sortable/filterable table with color-coded category badges. Supports
  inline editing (click any cell) and text search across subcategory/notes.
- **Lazy charts**: 4 Chart.js charts inside a collapsible ``<details>``
  element; only rendered when expanded.

----

Tests
-----

``tests/test_budget.py`` — 34 tests across 6 test classes:

- ``TestBudgetApi`` (12): GET budget, actuals, overrides, goals, subcategory CRUD, annual
- ``TestTransactionCrud`` (6): add, update, delete, recompute actuals, validation
- ``TestRollover`` (2): toggle, validation
- ``TestMigration`` (2): actuals-to-transactions, idempotency
- ``TestNetWorthApi`` (10): GET, snapshots, cells, asset CRUD, validation
- ``TestBudgetImport`` (2): category parsing, synthetic transaction creation

Run: ``conda run -n invapp python -m pytest tests/test_budget.py -v``
