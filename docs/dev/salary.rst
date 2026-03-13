Salary — Developer Architecture
================================

Internal architecture of the Salary subsystem: multi-profile data model,
tax computation flow, retirement projections, and migration logic.

.. contents::
   :local:
   :depth: 2

----

Data Model
----------

Storage Location
^^^^^^^^^^^^^^^^

``portfolio.json`` under the top-level ``"salary"`` key.

Profile Schema
^^^^^^^^^^^^^^

.. code-block:: json

   {
     "activeProfile": "alejandro",
     "profiles": {
       "alejandro": {
         "name": "Alejandro",
         "year": 2025,
         "incomeStreams": [
           {"type": "W2",   "amount": 120000, "label": "Main Job"},
           {"type": "1099", "amount": 30000,  "label": "Freelance"}
         ],
         "taxes": {
           "iraContributionPct": 0.03,
           "standardDeduction": 16100,
           "cityResidentTax":    {"name": "City Tax (Resident)",     "rate": 0.01,   "enabled": true},
           "cityNonResidentTax": {"name": "City Tax (Non-Resident)", "rate": 0.003,  "enabled": true},
           "stateTax":           {"name": "State Tax",               "rate": 0.0425, "enabled": true}
         },
         "projectedSalary": 140000,
         "hsaExtraIncome": 0,
         "history": []
       }
     },
     "savedMoney": 50000.0,
     "pctSavingsToInvest": 1.0,
     "pctIncomeCanSave": 0.25,
     "retirement": {
       "yearsUntilRetirement": 20,
       "returnRateRetirement": 0.04,
       "desiredRetirementPct": 0.75,
       "otherRetirementIncome": 0,
       "annualReturnRate": null
     }
   }

**Scope boundaries:**

- Per-profile: income streams, taxes, projected salary, HSA, history
- Shared (salary-level): savings rates, retirement config

Income stream types: ``W2`` (employer payroll, IRA eligible, FICA at
7.65%) and ``1099``/``Other`` (self-employment, double FICA via SE
factor).

----

Tax Computation Flow
--------------------

W2 Income
^^^^^^^^^

.. code-block:: text

   gross W2
     ├── IRA deduction = gross × iraContributionPct        [pre-tax]
     ├── Local/state base = gross - IRA
     │     ├── City Resident Tax  = base × rate  (if enabled)
     │     ├── City Non-Resident  = base × rate  (if enabled)
     │     └── State Tax          = base × rate  (if enabled)
     ├── Federal taxable = gross - IRA - standardDeduction
     │     └── Federal tax = compute_federal_tax(taxable)  [progressive brackets]
     ├── Social Security = gross × 6.2%
     └── Medicare        = gross × 1.45%

1099 / Other Income
^^^^^^^^^^^^^^^^^^^

.. code-block:: text

   gross 1099
     ├── SE factor = 0.9235  (IRS net earnings multiplier)
     ├── SE tax = gross × SE_factor × (6.2% + 1.45%) × 2
     ├── Local/state base = gross (no IRA)
     │     ├── City/State taxes same as W2
     ├── Federal taxable = gross - (SE_tax / 2)            [IRS SE deduction]
     ├── Social Security = gross × SE_factor × 6.2% × 2
     └── Medicare        = gross × SE_factor × 1.45% × 2

Federal brackets are 2023 Single Filer thresholds from ``config.py``
(7 brackets, 10% to 37%).

----

Key Functions
-------------

``models/salary_calc.py``
^^^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``compute_federal_tax(taxable_income)``
     - Progressive federal tax via ``FEDERAL_BRACKETS``.
   * - ``compute_salary_breakdown(profile)``
     - Core computation: returns ``{rows, summary, employer,
       projected, hsa}``.  Pure function, no I/O.
   * - ``compute_retirement_plan(summary, config, portfolio)``
     - Future value projection.  Annual return defaults to
       portfolio return or 7%.
   * - ``migrate_salary_data(salary)``
     - Idempotent migration from flat format to multi-profile.
   * - ``get_marginal_rates(profile)``
     - Federal bracket lookup + local rates for HSA calculator.
   * - ``_get_salary_data(portfolio)``
     - Entry point for routes: loads, migrates, renames legacy
       tax labels, backfills effective tax rates.

Breakdown Output
^^^^^^^^^^^^^^^^

``compute_salary_breakdown`` returns ordered ``rows`` with marker fields:

- ``isIncome``: Annual Salary row
- ``toggleable``: city/state tax rows (can be enabled/disabled)
- ``isFederal``: federal tax row (includes ``effRate``)
- ``fixedRate``: SS (6.2%) and Medicare (1.45%)
- ``isSummary``: Total Withheld and Take-Home Pay
- ``isRate``: hourly rate / effective tax % row

The ``employer`` section covers IRA match, FUTA ($7k federal +
$9.5k state UI), employer SS, and employer Medicare.

The ``projected`` section runs ``compute_salary_breakdown`` recursively
on a synthetic single-W2 profile.

----

API Endpoints
-------------

.. list-table::
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/salary``
     - Full profile breakdown + household aggregate +
       retirement projection.  ``?profile=`` to select.
   * - POST
     - ``/api/salary/update``
     - Partial update for profile and/or salary-level fields.
   * - POST
     - ``/api/salary/profile``
     - Create new profile (generates slug from name).
   * - DELETE
     - ``/api/salary/profile/<pid>``
     - Delete profile (refuses to delete last one).
   * - POST
     - ``/api/salary/history/save``
     - Snapshot current breakdown into profile history.
   * - DELETE
     - ``/api/salary/history/<year>``
     - Remove a single year from history.

----

Migration
---------

``migrate_salary_data()`` converts the legacy flat format (single
``w2Salary``, ``income1099``, city-specific tax fields) into the
multi-profile structure.  Key mappings:

- ``w2Salary`` → ``profiles.alejandro.incomeStreams[0]`` (type W2)
- ``income1099`` → ``profiles.alejandro.incomeStreams[1]`` (type 1099)
- ``lansingTaxPct`` → ``taxes.cityResidentTax.rate``
- ``projectedW2`` → ``projectedSalary``

A second migration layer in ``_get_salary_data`` renames legacy tax
display names via ``_TAX_NAME_MAP`` and backfills ``effectiveTaxRate``
into history records.

Migration is **lazy and idempotent**: runs on first request after
upgrade, persists if changes occurred.

----

Design Decisions
----------------

**Stateless, pure computation.**
``compute_salary_breakdown`` and ``compute_federal_tax`` are pure
functions.  The projected salary feature reuses the same function
with a synthetic profile.

**Toggleable local taxes.**
The ``enabled`` flag allows switching jurisdictions without losing
configured rates.

**History is explicitly triggered.**
Profile updates do not auto-snapshot.  Users call
``POST /api/salary/history/save`` to finalize a year.

**HSA uses marginal rates.**
``get_marginal_rates()`` does a separate bracket lookup for marginal
(not effective) rate computation.

**Retirement projection uses live portfolio data.**
The annual return rate defaults to the portfolio's own historical
return (if positive) or 7%.

----

See Also
--------

* :doc:`/formulas/taxes` — Tax formulas (user-facing)
