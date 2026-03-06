Projections
===========

Compound growth projections with monthly compounding, used to forecast
portfolio growth over a configurable time horizon.

Source: ``models/projections_calc.py``

.. contents::
   :local:
   :depth: 1

----

Inputs
------

.. list-table::
   :header-rows: 1
   :widths: 35 50 15

   * - Parameter
     - Description
     - Default
   * - ``startingValue``
     - Initial portfolio value
     - --
   * - ``monthlyContribution``
     - Recurring monthly investment
     - --
   * - ``expectedReturnPct``
     - Annual return (%)
     - 8 %
   * - ``dividendYieldPct``
     - Annual dividend yield (%)
     - --
   * - ``inflationPct``
     - Annual inflation (%)
     - 3 %
   * - ``years``
     - Projection horizon
     - 20

----

Core Formula
------------

Each year is computed as 12 monthly iterations:

.. math::

   \text{balance}_{m+1} = \text{balance}_m \times (1 + r_{\text{monthly}}) + \text{monthlyContribution}

where:

.. math::

   r_{\text{monthly}} = \frac{\text{annualReturn}}{12}

----

Outputs Per Year
----------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Field
     - Description
   * - ``balance``
     - Nominal portfolio value at year end
   * - ``realBalance``
     - Inflation-adjusted portfolio value
   * - ``contributions``
     - Cumulative contributions through that year
   * - ``growth``
     - Cumulative investment growth (balance - contributions)
   * - ``dividendIncome``
     - Dividend income for that year
   * - ``totalDividends``
     - Cumulative dividend income through that year

Real Balance
^^^^^^^^^^^^

.. math::

   \text{realBalance} = \frac{\text{balance}}{(1 + \text{inflation})^{\text{year}}}

----

Three Scenarios
---------------

The projection engine produces three scenarios to bracket uncertainty:

.. list-table::
   :header-rows: 1
   :widths: 20 40

   * - Scenario
     - Annual Return
   * - Base
     - Configured ``expectedReturnPct``
   * - Bull
     - ``expectedReturnPct + 2%``
   * - Bear
     - ``expectedReturnPct - 2%``

----

See Also
--------

* :doc:`rule4` -- Retirement withdrawal simulations
* :doc:`portfolio` -- Current portfolio metrics
* :doc:`annual-data` -- Historical annual performance data
