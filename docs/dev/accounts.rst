Accounts — Developer Architecture
=================================

Internal architecture of the multi-account system: data model, API
endpoints, enrichment pipeline, and frontend integration.

.. contents::
   :local:
   :depth: 2

----

Data Model
----------

Zero-Migration Design
^^^^^^^^^^^^^^^^^^^^^

The accounts feature adds an ``accounts`` array to ``portfolio.json``
without modifying any existing top-level keys.  The main taxable
portfolio (``positions``, ``cash``, ``dividendLog``, etc.) remains
untouched, so all existing load/save calls continue to work.

.. code-block:: json

   {
     "positions": [],
     "cash": 0,
     "accounts": [
       {
         "id": "roth-ira",
         "name": "Roth IRA",
         "taxTreatment": "tax-free",
         "custodian": "Fidelity",
         "positions": [
           {"ticker": "VTI", "shares": 100, "avgCost": 200, "category": "Index"}
         ],
         "cash": 500,
         "created": "2024-01-15"
       }
     ]
   }

Account Schema
^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 10 70

   * - Field
     - Type
     - Description
   * - ``id``
     - string
     - Auto-generated slug from name (e.g. ``"roth-ira"``).  Collision
       handling appends ``-2``, ``-3``, etc.
   * - ``name``
     - string
     - User-defined display name.
   * - ``taxTreatment``
     - string
     - One of ``"taxable"``, ``"tax-deferred"``, ``"tax-free"``.
   * - ``custodian``
     - string
     - Optional.  Broker or custodian name (e.g. "Fidelity").
   * - ``positions``
     - array
     - Same shape as main portfolio positions: ``{ticker, shares,
       avgCost, category, sector, secType}``.
   * - ``cash``
     - number
     - Cash balance in the account.
   * - ``created``
     - string
     - ISO date of account creation.

----

Data Store Helpers
------------------

``services/data_store.py`` — four functions added at the bottom:

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``get_accounts()``
     - Returns ``portfolio.get("accounts", [])``.
   * - ``get_account(account_id)``
     - Finds account by ``id``.  Returns ``None`` if not found.
   * - ``save_account(account)``
     - Insert-or-update by ``id`` in the ``accounts`` array.
   * - ``delete_account(account_id)``
     - Removes account by ``id``.  Returns ``True`` if found.

All operations follow the same load-mutate-save pattern as the existing
CRUD helpers.

----

API Endpoints
-------------

``routes/accounts.py`` — Blueprint ``accounts``.

.. list-table::
   :header-rows: 1
   :widths: 10 35 55

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/accounts``
     - List all accounts (metadata only, no live prices).
   * - POST
     - ``/api/accounts``
     - Create account.  Body: ``{name, taxTreatment, custodian}``.
       Auto-generates unique slug ``id``.
   * - GET
     - ``/api/accounts/net-worth``
     - Aggregate net worth across main portfolio + all accounts.
       Returns per-account totals, tax-treatment breakdown, and
       aggregate category allocation.
   * - PUT
     - ``/api/accounts/<id>``
     - Update account metadata (name, custodian).
   * - DELETE
     - ``/api/accounts/<id>``
     - Delete account and all its positions.
   * - GET
     - ``/api/accounts/<id>/positions``
     - Enriched positions with live prices (same enrichment as
       ``/api/portfolio``).
   * - POST
     - ``/api/accounts/<id>/positions``
     - Add position.  Body: ``{ticker, shares, avgCost, category}``.
   * - PUT
     - ``/api/accounts/<id>/positions/<idx>``
     - Update position fields at index.
   * - DELETE
     - ``/api/accounts/<id>/positions/<idx>``
     - Delete position at index.
   * - PUT
     - ``/api/accounts/<id>/cash``
     - Update cash balance.  Body: ``{cash}``.

.. warning::

   The ``/api/accounts/net-worth`` route **must** be registered before
   any ``/api/accounts/<account_id>`` routes in Flask.  Otherwise Flask
   matches ``"net-worth"`` as an ``account_id`` parameter.

Net Worth Response
^^^^^^^^^^^^^^^^^^

``GET /api/accounts/net-worth`` returns:

.. code-block:: json

   {
     "totalNetWorth": 250000,
     "accounts": [
       {
         "id": "_main",
         "name": "Taxable Brokerage",
         "taxTreatment": "taxable",
         "marketValue": 150000,
         "costBasis": 120000,
         "cash": 5000,
         "gain": 30000,
         "gainPct": 25.0,
         "positionCount": 15
       }
     ],
     "byTaxTreatment": {
       "taxable": 155000,
       "tax-free": 80500,
       "tax-deferred": 0
     },
     "aggregateAllocation": {
       "Growth": 45.2,
       "Value": 30.1,
       "Index": 24.7
     }
   }

The main portfolio uses a virtual ``id`` of ``"_main"`` and is always
the first entry in the ``accounts`` array.

----

Position Enrichment
-------------------

``_enrich_positions(positions, quotes)`` in ``routes/accounts.py`` is a
shared helper that enriches raw positions with live quote data.  It
reuses ``fetch_all_quotes()`` from ``services/yfinance_svc.py``.

For each position, it computes:

- ``price``, ``companyName`` — from live quote
- ``marketValue`` — ``shares * price``
- ``costBasis`` — ``shares * avgCost``
- ``gain``, ``gainPct`` — unrealised gain/loss
- ``dayChange``, ``dayChangePct`` — intraday movement
- ``weight`` — percentage of total account value
- ``divYield``, ``divRate`` — dividend data from quote

This is the same enrichment logic used by ``/api/portfolio`` for the
main positions.

----

Frontend
--------

Files
^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - File
     - Role
   * - ``static/js/accounts.js``
     - Accounts Overview tab: KPIs, account cards, charts, CRUD forms.
   * - ``static/js/app.js``
     - Global ``currentAccountId`` state, account selector population,
       ``switchAccount()`` / ``_applyAccountView()`` logic.
   * - ``static/js/positions.js``
     - ``renderAccountPositionsView()`` for simplified 12-column table,
       ``_restoreMainPositionsView()`` to switch back.
   * - ``static/dashboard.html``
     - Accounts group button, tab content div, account selector dropdown
       in Portfolio tab row.

Account Selector Flow
^^^^^^^^^^^^^^^^^^^^^

1. ``populateAccountSelector()`` fetches ``/api/accounts`` and populates
   the ``<select id="accountSelect">`` dropdown.  Hidden when no
   accounts exist.
2. ``switchAccount()`` reads the selected value and calls
   ``_applyAccountView()``.
3. ``_applyAccountView()``:

   - If ``_main``: restores full positions view, shows all tabs,
     re-fetches main portfolio data.
   - If account id: fetches ``/api/accounts/<id>/positions``, renders
     simplified table via ``renderAccountPositionsView()``, hides
     Rebalancing and Sold tabs.

Simplified Positions View
^^^^^^^^^^^^^^^^^^^^^^^^^

Non-main accounts show a 12-column table:

Ticker, Company, Shares, Avg Cost, Price, Cost Basis, Market Value,
Gain $, Gain %, Day Change, Weight, Div Yield.

A summary banner above the table shows account name, tax badge, total
market value, and total return.

The "Add Position" button uses a separate inline form that POSTs to
``/api/accounts/<id>/positions``.

----

Testing
-------

``tests/test_accounts.py`` — 20 tests covering:

- Account CRUD (create, read, update, delete)
- Position management (add, update, delete within accounts)
- Cash balance updates
- Position enrichment with mocked quotes
- Net-worth aggregation across main + accounts
- Duplicate name handling (slug collision)
- Validation (missing name, invalid tax treatment)

Run with:

.. code-block:: bash

   conda run -n invapp python -m pytest tests/test_accounts.py -v

----

Design Decisions
----------------

**Zero-migration data model.**
Existing ``portfolio.json`` structure stays intact.  The ``accounts``
array is additive — no existing keys are renamed or moved.  This avoids
touching the 100+ existing load/save calls.

**Main portfolio is virtual, not an account.**
The main taxable portfolio is not stored in the ``accounts`` array.  It
uses the existing top-level ``positions``/``cash`` keys.  In the
net-worth endpoint it appears with ``id: "_main"`` as a synthetic entry.

**Simplified view for non-main accounts.**
Retirement accounts get a reduced feature set (no rebalancing, no sold
positions, no dividend deep dive).  This keeps the account-switching
logic simple and avoids complex state management.

**Route ordering matters.**
``/api/accounts/net-worth`` must be defined before
``/api/accounts/<account_id>`` in the Blueprint to prevent Flask from
matching ``"net-worth"`` as a parameter value.

----

See Also
--------

* :doc:`portfolio-core` — Main portfolio and data store architecture
* :doc:`portfolio-json` — Full portfolio.json schema reference
* :doc:`crud` — Generic CRUD pattern used by data store
