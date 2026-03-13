portfolio.json Structure
========================

Source: ``services/data_store.py``

All user data lives in a single ``portfolio.json`` file. The file is read and written
atomically (full read, modify, full write). Default structure when no file exists:

.. code-block:: json

   {
     "positions": [],
     "watchlist": [],
     "cash": 0,
     "goals": {},
     "targets": {},
     "strategy": []
   }

Top-Level Sections
------------------

.. list-table::
   :header-rows: 1
   :widths: 20 10 70

   * - Section
     - Type
     - Description
   * - ``positions``
     - array
     - Stock holdings with ticker, shares, avgCost, sector, category
   * - ``watchlist``
     - array
     - Stocks being watched with ticker, notes, target prices
   * - ``cash``
     - number
     - Cash balance in portfolio
   * - ``dividendLog``
     - array
     - Monthly dividend income records with year, month, entries
   * - ``monthlyData``
     - array
     - Monthly portfolio snapshots (contributions, portfolioValue)
   * - ``intrinsicValues``
     - array
     - Saved intrinsic value calculations from Stock Analyzer
   * - ``superInvestors``
     - object
     - Cached SEC 13F super investor holdings
   * - ``strategy``
     - array
     - Strategy notes (text strings)
   * - ``goals``
     - object
     - Portfolio targets (portfolioTarget, dividendTarget, maxHoldings)
   * - ``targets``
     - object
     - Per-position allocation targets
   * - ``salary``
     - object
     - Salary profiles with income streams and tax config
   * - ``projections``
     - object
     - Compound growth projection parameters
   * - ``rebalancing``
     - object
     - Rebalancing configuration
   * - ``soldPositions``
     - array
     - Historical record of sold positions
   * - ``historicData``
     - array
     - S&P 500 historical returns (imported from Excel)
   * - ``annualData``
     - array
     - Manually entered S&P 500 yields per year

Schemas
-------

Position Schema
~~~~~~~~~~~~~~~

.. code-block:: json

   {
     "ticker": "AAPL",
     "shares": 10,
     "avgCost": 150.00,
     "sector": "Technology",
     "category": "Growth",
     "secType": "Stocks",
     "intrinsicValue": 200.00,
     "invtScore": 8.5
   }

Watchlist Item Schema
~~~~~~~~~~~~~~~~~~~~~

.. code-block:: json

   {
     "ticker": "GOOG",
     "notes": "Wait for pullback",
     "intrinsicValue": 180.00,
     "category": "Growth"
   }

Dividend Log Entry Schema
~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: json

   {
     "year": 2024,
     "month": "January",
     "entries": [
       {"ticker": "AAPL", "amount": 25.50},
       {"ticker": "MSFT", "amount": 18.00}
     ],
     "total": 43.50
   }

Monthly Data Entry Schema
~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: json

   {
     "year": 2024,
     "month": "January 24",
     "contributions": 2000.00,
     "portfolioValue": 85000.00,
     "accumulatedInvestment": 60000.00
   }

Salary Profile Schema
~~~~~~~~~~~~~~~~~~~~~

Nested under ``salary.profiles.<id>``:

.. code-block:: json

   {
     "name": "Profile Name",
     "year": 2024,
     "incomeStreams": [
       {"type": "W2", "amount": 120000, "label": "Main Job"},
       {"type": "1099", "amount": 30000, "label": "Freelance"}
     ],
     "taxes": {
       "iraContributionPct": 0.03,
       "standardDeduction": 16100,
       "cityResidentTax": {"name": "City Tax", "rate": 0.01, "enabled": true},
       "stateTax": {"name": "State Tax", "rate": 0.0425, "enabled": true}
     },
     "projectedSalary": 140000,
     "history": []
   }
