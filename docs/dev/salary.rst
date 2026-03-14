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
         "filingStatus": "single",
         "incomeStreams": [
           {"type": "W2",   "amount": 120000, "label": "Main Job"},
           {"type": "1099", "amount": 30000,  "label": "Freelance",
            "businessExpenses": 5000, "qbiEligible": true}
         ],
         "taxes": {
           "iraContributionPct": 0.03,
           "standardDeduction": null,
           "cityResidentTax":    {"name": "City Tax (Resident)",     "rate": 0.01,   "enabled": true},
           "cityNonResidentTax": {"name": "City Tax (Non-Resident)", "rate": 0.003,  "enabled": true},
           "stateTax":           {"name": "State Tax",               "rate": 0.0425, "enabled": true}
         },
         "withholdingInfo": {
           "federalWithheld": 18000,
           "stateWithheld": 4500,
           "estimatedPayments": 2000
         },
         "projectedSalary": 140000,
         "hsaExtraIncome": 0,
         "history": []
       }
     },
     "householdConfig": {
       "spouseProfile": "spouse_name"
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

- Per-profile: income streams, taxes, filing status, withholding info,
  projected salary, HSA, history
- Shared (salary-level): savings rates, retirement config, household config

**Filing status** (``filingStatus``): one of ``"single"``, ``"mfj"``
(Married Filing Jointly), ``"mfs"`` (Married Filing Separately), or
``"hoh"`` (Head of Household).  Defaults to ``"single"`` if omitted.
The filing status determines which federal brackets and standard
deduction to use from ``config.py`` ``FEDERAL_TAX_DATA``.

**Standard deduction** (``taxes.standardDeduction``): set to ``null``
to use the filing-status default from ``FEDERAL_TAX_DATA``.  A numeric
override locks a custom deduction regardless of status.

Income stream types: ``W2`` (employer payroll, IRA eligible, FICA at
7.65%) and ``1099``/``Other`` (self-employment, double FICA via SE
factor).

**1099 stream fields** (PR #172):

- ``businessExpenses`` (number): deducted from gross 1099 before any
  tax computation.  Net 1099 = gross - businessExpenses.
- ``qbiEligible`` (boolean): marks this stream as eligible for the
  Qualified Business Income (Section 199A) deduction.

**Withholding info** (``withholdingInfo``): tracks actual payments made
to compare against computed liability via the Tax Return Estimator.
Fields: ``federalWithheld``, ``stateWithheld``, ``estimatedPayments``.

**Household config** (``householdConfig``): salary-level object with
``spouseProfile`` referencing another profile ID.  When set, the API
computes a joint-vs-separate filing comparison.

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
     ├── Business Expenses deduction (per-stream)           [if businessExpenses > 0]
     │     net 1099 = gross - businessExpenses
     ├── SE factor = 0.9235  (IRS net earnings multiplier)
     ├── SE tax = net × SE_factor × (6.2% + 1.45%) × 2
     ├── Local/state base = net (no IRA)
     │     ├── City/State taxes same as W2
     ├── Federal taxable = net - (SE_tax / 2)               [IRS SE deduction]
     ├── QBI deduction (Sec. 199A)                          [if qbiEligible streams]
     │     ├── raw QBI = 20% of net QBI-eligible 1099 income
     │     ├── Phase-out: linear between lower/upper thresholds
     │     │     Single/HoH/MFS: $191,950–$241,950 (2024)
     │     │     MFJ:            $383,900–$483,900 (2024)
     │     └── Federal taxable -= QBI deduction
     ├── Social Security = net × SE_factor × 6.2% × 2
     └── Medicare        = net × SE_factor × 1.45% × 2

Federal brackets are multi-year, multi-status from ``config.py``
``FEDERAL_TAX_DATA`` (2023--2026, 7 brackets, 10% to 37%).  The
profile's ``filingStatus`` and ``year`` select the appropriate
brackets and standard deduction via ``get_tax_config()``.

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
   * - ``compute_filing_status_comparison(profile, statuses=None)``
     - Computes breakdown under multiple filing statuses for
       side-by-side comparison.  Defaults to ``("single", "hoh")``.
       Returns list sorted by take-home pay (best first).
   * - ``compute_tax_return(breakdown, withholding_info)``
     - Compares computed tax liability against actual payments
       (federal withheld, state withheld, estimated payments).
       Returns balances: negative = refund, positive = owed.
   * - ``compute_household_filing(primary_profile, spouse_profile)``
     - Merges income streams from two profiles.  Computes MFJ
       (joint) vs MFS (separate) breakdowns and tax returns.
       Returns ``{joint, separate, savings, recommendation}``.
   * - ``_get_salary_data(portfolio)``
     - Entry point for routes: loads, migrates, renames legacy
       tax labels, backfills effective tax rates, filing status.

Breakdown Output
^^^^^^^^^^^^^^^^

``compute_salary_breakdown`` returns ordered ``rows`` with marker fields:

- ``isIncome``: Annual Salary row
- ``isExpense``: Business Expenses (1099) row (only present when > 0)
- ``isQBI``: QBI Deduction (Sec. 199A) row (only present when > 0)
- ``toggleable``: city/state tax rows (can be enabled/disabled)
- ``isFederal``: federal tax row (includes ``effRate``)
- ``fixedRate``: SS (6.2%) and Medicare (1.45%)
- ``isSummary``: Total Withheld and Take-Home Pay
- ``isRate``: hourly rate / effective tax % row

The ``summary`` dict includes ``marginalRates`` (``{federal, combined}``),
``filingStatus``, ``standardDeduction``, ``businessExpenses``,
``qbiDeduction``, ``t1099Gross``, and ``t1099Net``.

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
       retirement projection + filing status comparison +
       tax return estimate + household filing (MFJ vs MFS,
       if ``householdConfig.spouseProfile`` is set).
       ``?profile=`` to select.
   * - POST
     - ``/api/salary/update``
     - Partial update for profile and/or salary-level fields.
       Accepts ``filingStatus``, ``withholdingInfo``, and
       ``householdConfig`` in addition to existing fields.
       Returns updated breakdown, status comparison, tax
       return, and household filing.
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

**Filing status comparison defaults depend on context.**
``compute_filing_status_comparison`` defaults to ``("single", "hoh")``
for individual profiles.  MFJ and MFS are intentionally excluded from
this comparison because joint filing requires combined income from two
profiles, which is handled separately by ``compute_household_filing``.

**Stateless household computation.**
``compute_household_filing`` takes two full profile dicts, merges their
income streams into a synthetic MFJ profile, and computes MFS
breakdowns independently.  No household state is stored beyond the
``householdConfig.spouseProfile`` reference.

**Estimated payments attributed to federal.**
In ``compute_tax_return``, the ``estimatedPayments`` field is
subtracted from the federal balance (not split across federal/state),
matching the common pattern where quarterly estimated payments cover
federal liability.

**QBI phase-out uses total pre-QBI income.**
The QBI deduction threshold check uses combined W2 + 1099 federal
taxable income (before QBI is applied) to determine the phase-out
percentage.  Thresholds are year- and filing-status-specific from
``config.py`` ``QBI_THRESHOLDS``.

**Business expenses are per-stream.**
Each 1099 income stream carries its own ``businessExpenses`` amount,
allowing different freelance/contract activities to track expenses
independently.  Net 1099 income (gross minus expenses) is used for
all downstream tax calculations.

----

See Also
--------

* See the Formulas & Metrics section in the User Guide for tax formulas
