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

Pre-Tax Deductions
------------------

**IRA Contribution**: default 3 % of W2 salary only.

.. math::

   \text{IRA} = \text{salary} \times 0.03 \quad \text{(W2 only)}

----

Local & State Taxes
-------------------

Configurable and toggleable.  Applied to :math:`(\text{salary} - \text{IRA})`
for W2, or gross income for 1099.

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

Progressive brackets for Single Filer:

.. list-table::
   :header-rows: 1
   :widths: 40 20

   * - Taxable Income Bracket
     - Rate
   * - $0 -- $12,400
     - 10 %
   * - $12,400 -- $50,400
     - 12 %
   * - $50,400 -- $105,700
     - 22 %
   * - $105,700 -- $201,775
     - 24 %
   * - $201,775 -- $256,225
     - 32 %
   * - $256,225 -- $640,600
     - 35 %
   * - $640,600+
     - 37 %

Federal Taxable Income
^^^^^^^^^^^^^^^^^^^^^^

**W2**:

.. math::

   \text{federalTaxable} = \text{salary} - \text{IRA} - \text{standardDeduction}

where :math:`\text{standardDeduction} = \$16{,}100`.

**1099**:

.. math::

   \text{federalTaxable} = \text{income} - \frac{\text{SE\_tax}}{2}

----

Self-Employment Tax (1099 Only)
-------------------------------

.. math::

   \text{SE\_base} &= \text{income} \times 0.9235 \\
   \text{Social Security} &= \text{SE\_base} \times 6.2\% \times 2 = \text{SE\_base} \times 12.4\% \\
   \text{Medicare} &= \text{SE\_base} \times 1.45\% \times 2 = \text{SE\_base} \times 2.9\% \\
   \text{Total SE} &= \text{SE\_base} \times 15.3\%

Equivalently, self-employment tax is **15.3 % on 92.35 %** of 1099 income.

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

----

See Also
--------

* :doc:`portfolio` -- Portfolio-level financial metrics
* :doc:`annual-data` -- Annual income and return tracking
