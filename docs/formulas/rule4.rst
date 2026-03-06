Rule of 4% -- Retirement Simulation
=====================================

Monte Carlo-style simulation using historical S&P 500 annual returns
(1928--present) to evaluate the sustainability of various withdrawal
strategies over a given time horizon.

Source: ``models/simulation.py``

.. contents::
   :local:
   :depth: 2

----

Common Setup
------------

All four strategies share the same simulation framework:

1. Iterate over every possible **starting year** in the historical dataset.
2. For each starting year, simulate ``horizon`` years of annual withdrawals.
3. Track whether the portfolio survives (balance > 0 at the end).
4. Report:

   * **Success rate** -- percentage of start-year cohorts that survived.
   * **Average final balance** -- mean ending balance across all cohorts.
   * **Best / worst scenarios** -- highest and lowest final balances.

----

Strategy 1 -- Fixed (Classic Rule 4%)
--------------------------------------

The traditional approach: withdraw a fixed real amount each year.

**Year 0**:

.. math::

   \text{withdrawal} = \text{balance} \times \text{withdrawalRate}

**Each subsequent year**:

.. math::

   \text{balance} &= \text{balance} \times (1 + r_t) - \text{withdrawal} \\
   \text{withdrawal} &= \text{withdrawal} \times (1 + \text{CPI})

The withdrawal is adjusted annually for inflation (CPI) to maintain
purchasing power.

**Optional cash buffer**: during down years (:math:`r_t < -10\%`), the
simulation draws from a cash reserve first, preserving invested assets.

----

Strategy 2 -- Dividend Only
----------------------------

No principal is ever sold; income comes solely from dividends.

**Each year**:

.. math::

   \text{income}  &= \text{balance} \times \text{divYield} \\
   \text{balance} &= \text{balance} \times (1 + r_t)

The withdrawal equals the dividend income for that year.

----

Strategy 3 -- Combined
-----------------------

Dividends are collected first; any shortfall is covered by selling shares.

.. math::

   \text{sellAmount} &= \max\!\big(0,\;\text{targetWithdrawal} - \text{dividendIncome}\big) \\
   \text{balance}    &= \text{balance} \times (1 + r_t) - \text{sellAmount}

The target withdrawal is adjusted for inflation each year, identical to
the Fixed strategy.

----

Strategy 4 -- Guardrails
--------------------------

A dynamic withdrawal strategy that adjusts spending based on portfolio
performance while keeping withdrawals within a band around the
inflation-adjusted baseline.

**Target withdrawal**:

.. math::

   \text{target} = \text{balance} \times \text{withdrawalRate}

**Floor and ceiling** (guardrails):

.. math::

   \text{floor}   &= \text{baseWithdrawal} \times \text{cumulativeInflation} \times 0.8 \\
   \text{ceiling}  &= \text{baseWithdrawal} \times \text{cumulativeInflation} \times 1.2

**Actual withdrawal**:

.. math::

   \text{actualWithdrawal} = \text{clamp}(\text{target},\;\text{floor},\;\text{ceiling})

where :math:`\text{clamp}(x, lo, hi) = \min(\max(x, lo), hi)`.

**Optional cash buffer**: during severe downturns (:math:`r_t < -10\%`),
draws from a cash reserve first, same as the Fixed strategy.

----

See Also
--------

* :doc:`projections` -- Forward-looking compound growth projections
* :doc:`portfolio` -- Current portfolio metrics
