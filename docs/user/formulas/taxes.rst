Taxes & Salary
==============

Salary and tax computation for W2 (employee) and 1099 (self-employed)
income types.

Source: ``models/salary_calc.py``, constants from ``config.py``

.. contents::
   :local:
   :depth: 2

----

Income Types
------------

* **W2** -- Traditional employment with employer-paid payroll taxes.
* **1099** -- Self-employed / independent contractor with self-employment tax.

----

Filing Status
-------------

Your filing status determines your standard deduction and the income
thresholds for each federal tax bracket.  Four statuses are supported:

.. list-table::
   :header-rows: 1
   :widths: 30 50 20

   * - Status
     - When to use
     - Standard Deduction (2025)
   * - **Single**
     - Unmarried or legally separated
     - $15,000
   * - **Married Filing Jointly (MFJ)**
     - Married couple filing one return together
     - $30,000
   * - **Married Filing Separately (MFS)**
     - Married but each spouse files their own return
     - $15,000
   * - **Head of Household (HoH)**
     - Unmarried and paying more than half the cost of keeping up a home for a qualifying person
     - $22,500

Standard deductions and bracket thresholds are updated each year based on
IRS Revenue Procedures.  The app stores multi-year data (2023--2026) and
automatically selects the correct values for the tax year you choose.

----

Pre-Tax Deductions
------------------

**IRA Contribution**: default 3 % of W2 salary only.

.. math::

   \text{IRA} = \text{salary} \times 0.03 \quad \text{(W2 only)}

----

Business Expenses (1099 Only)
-----------------------------

If you have 1099 income, you can deduct legitimate business expenses
before taxes are calculated.  The result is your **net 1099 income**,
which is the amount subject to self-employment tax and income tax.

.. math::

   \text{net1099} = \text{gross1099} - \text{businessExpenses}

Each 1099 income stream can have its own business-expense amount.  Only
the net amount flows into the tax computation.

----

Local & State Taxes
-------------------

Configurable and toggleable.  Applied to :math:`(\text{salary} - \text{IRA})`
for W2, or net income for 1099.

.. list-table::
   :header-rows: 1
   :widths: 40 20

   * - Tax
     - Default Rate
   * - City Resident Tax
     - 1 %
   * - City Non-Resident Tax
     - 0.3 %
   * - State Tax
     - 4.25 %

----

Federal Income Tax
------------------

Federal income tax uses progressive brackets -- each bracket's rate
applies only to the income within that range, not to your entire income.

Bracket thresholds vary by filing status and tax year.  The table below
shows the 2025 Single brackets as an example; MFJ brackets have roughly
double the thresholds, and HoH brackets fall in between.

.. list-table::
   :header-rows: 1
   :widths: 40 20

   * - Taxable Income Bracket (2025 Single)
     - Rate
   * - $0 -- $11,925
     - 10 %
   * - $11,925 -- $48,475
     - 12 %
   * - $48,475 -- $103,350
     - 22 %
   * - $103,350 -- $197,300
     - 24 %
   * - $197,300 -- $250,525
     - 32 %
   * - $250,525 -- $626,350
     - 35 %
   * - $626,350+
     - 37 %

.. note::

   To see the exact bracket thresholds for your filing status, select the
   status in the Salary tab.  The Filing Comparison feature also lets you
   compare how different statuses affect your tax bill.

Federal Taxable Income
^^^^^^^^^^^^^^^^^^^^^^

**W2**:

.. math::

   \text{federalTaxable} = \text{salary} - \text{IRA} - \text{standardDeduction}

The standard deduction depends on your filing status and tax year (see
the Filing Status table above).

**1099**:

.. math::

   \text{federalTaxable} = \text{net1099} - \frac{\text{SE\_tax}}{2} - \text{QBI\_deduction}

Half of your self-employment tax is deducted from taxable income.  If you
are eligible for the QBI deduction (see below), that is subtracted as
well.

----

QBI Deduction (Section 199A)
----------------------------

The Qualified Business Income (QBI) deduction lets eligible
self-employed individuals deduct up to **20 %** of their net 1099
income from their federal taxable income.  This can significantly
reduce the tax burden on freelance or consulting work.

How it works
^^^^^^^^^^^^

1. Each 1099 income stream can be marked as **QBI-eligible**.
2. The deduction equals 20 % of the combined net income from
   QBI-eligible streams.
3. At higher income levels the deduction phases out (see below).

.. math::

   \text{QBI\_deduction} = \text{netQBI} \times 0.20

Phase-out
^^^^^^^^^

If your total federal taxable income (before the QBI deduction) exceeds
a threshold, the deduction is gradually reduced and eventually reaches
zero.  The phase-out range depends on your filing status:

.. list-table::
   :header-rows: 1
   :widths: 30 30 30

   * - Filing Status
     - Full Deduction Below
     - Zero Above
   * - Single / MFS / HoH
     - $197,300 (2025)
     - $247,300 (2025)
   * - MFJ
     - $394,600 (2025)
     - $494,600 (2025)

Within the phase-out range the deduction is reduced proportionally:

.. math::

   \text{reduction} = \frac{\text{taxableIncome} - \text{lowerThreshold}}{\text{upperThreshold} - \text{lowerThreshold}}

   \text{QBI\_deduction} = \text{rawQBI} \times (1 - \text{reduction})

----

Self-Employment Tax (1099 Only)
-------------------------------

.. math::

   \text{SE\_base} &= \text{net1099} \times 0.9235 \\
   \text{Social Security} &= \text{SE\_base} \times 6.2\% \times 2 = \text{SE\_base} \times 12.4\% \\
   \text{Medicare} &= \text{SE\_base} \times 1.45\% \times 2 = \text{SE\_base} \times 2.9\% \\
   \text{Total SE} &= \text{SE\_base} \times 15.3\%

Equivalently, self-employment tax is **15.3 % on 92.35 %** of net 1099 income.

----

FICA (W2 Only)
--------------

Paid by the employee:

.. math::

   \text{Social Security} &= \text{gross} \times 6.2\% \\
   \text{Medicare}        &= \text{gross} \times 1.45\%

----

Employer Cost (W2 Only)
-----------------------

Costs borne by the employer in addition to the employee's gross salary:

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Item
     - Amount
   * - IRA Match
     - Configurable
   * - FUTA
     - $42 + $256.50
   * - Social Security
     - 6.2 % of gross
   * - Medicare
     - 1.45 % of gross

----

Summary Metrics
---------------

Effective Tax Rate
^^^^^^^^^^^^^^^^^^

.. math::

   \text{effectiveTaxRate} = \frac{\text{totalWithheld}}{\text{grossIncome}}

Hourly Rate
^^^^^^^^^^^

.. math::

   \text{hourlyRate} = \frac{\text{grossIncome}}{52 \times 40}

Assumes a standard 40-hour work week, 52 weeks per year.

Marginal Tax Rates
^^^^^^^^^^^^^^^^^^

Your **marginal tax rate** is the rate applied to your next dollar of
income.  It tells you how much of each additional dollar you earn goes
to taxes.

* **Federal marginal rate** -- the bracket your current taxable income
  falls into (e.g., if your taxable income is in the 24 % bracket,
  your next dollar is taxed at 24 %).
* **Combined marginal rate** -- the sum of your federal, state, and city
  marginal rates.

.. math::

   \text{combinedMarginal} = \text{federalMarginal} + \text{stateRate} + \text{cityRate}

The combined marginal rate is also used by the HSA Calculator to estimate
how much a pre-tax HSA contribution saves you in taxes.

----

Tax Return Estimator
--------------------

The Tax Return Estimator compares how much tax you owe for the year
against how much you have already paid through withholdings and estimated
payments.  The result tells you whether you will receive a **refund** or
**owe additional tax** when you file.

Inputs
^^^^^^

You provide three payment amounts:

* **Federal withholdings** -- federal income tax withheld from paychecks
  throughout the year.
* **State withholdings** -- state income tax withheld from paychecks.
* **Estimated payments** -- quarterly estimated tax payments you made
  (common for 1099 income).

Calculation
^^^^^^^^^^^

The app computes your total tax liability (federal + state + local +
FICA / self-employment tax) from the salary breakdown, then subtracts
the payments you entered:

.. math::

   \text{totalBalance} = \text{totalTaxLiability} - \text{totalPayments}

* If the balance is **negative**, you overpaid and will receive a refund
  of that amount.
* If the balance is **positive**, you underpaid and will owe that amount
  at filing time.

Federal and state balances are also shown separately so you can see
where the difference comes from:

.. math::

   \text{federalBalance} &= \text{federalTaxOwed} - \text{federalWithheld} - \text{estimatedPayments} \\
   \text{stateBalance}   &= \text{stateTaxOwed} - \text{stateWithheld}

----

Filing Comparison
-----------------

Individual Filing Comparison
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Compares **Single** vs **Head of Household** for your own income to show
which individual filing status results in lower taxes.  For each status
the app recalculates:

* Take-home pay
* Total tax withheld
* Effective tax rate
* Federal tax
* Standard deduction used

The results are sorted by take-home pay so the best option appears first.

Household Filing Comparison
^^^^^^^^^^^^^^^^^^^^^^^^^^^

If you have two salary profiles (for example, you and your spouse), this
feature compares filing a **joint return (MFJ)** versus filing
**separately (MFS)**.

**How it works:**

1. **Joint (MFJ):** All income streams from both profiles are combined
   into a single return.  MFJ brackets and the MFJ standard deduction
   are applied to the combined income.
2. **Separate (MFS):** Each person files their own return using MFS
   brackets and the MFS standard deduction.
3. The app compares the combined take-home pay under each approach.

.. math::

   \text{taxSavings} = \text{jointTakeHome} - (\text{primaryTakeHome}_{\text{MFS}} + \text{spouseTakeHome}_{\text{MFS}})

* **Positive savings** -- filing jointly saves money (recommended).
* **Negative savings** -- filing separately saves money (recommended).

The comparison also combines each profile's withholding information to
show joint vs separate tax-return estimates (refund or owed).

----

See Also
--------

* :doc:`portfolio` -- Portfolio-level financial metrics
* :doc:`annual-data` -- Annual income and return tracking
