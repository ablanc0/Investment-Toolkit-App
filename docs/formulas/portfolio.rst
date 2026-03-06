Portfolio Metrics
=================

Per-position and portfolio-level calculations displayed on the Portfolio tab.

Source: ``routes/portfolio.py``

.. contents::
   :local:
   :depth: 1

----

Per-Position Metrics
--------------------

Market Value
^^^^^^^^^^^^

.. math::

   \text{marketValue} = \text{shares} \times \text{currentPrice}

Allocation %
^^^^^^^^^^^^^

.. math::

   \text{allocation} = \frac{\text{marketValue}}{\text{totalPortfolioValue}} \times 100

Return %
^^^^^^^^

.. math::

   \text{returnPercent} = \frac{\text{currentPrice} - \text{avgCost}}{\text{avgCost}} \times 100

Total Return
^^^^^^^^^^^^

.. math::

   \text{totalReturn} = \text{marketValue} - \text{costBasis}

where:

.. math::

   \text{costBasis} = \text{shares} \times \text{avgCost}

Day Change
^^^^^^^^^^

Sourced directly from yfinance as ``regularMarketChangePercent``.

Dividend Yield
^^^^^^^^^^^^^^

Sourced directly from yfinance as ``dividendYield``.

.. warning::

   yfinance 1.2.0 returns ``dividendYield`` already as a percentage (e.g.
   0.39 means 0.39 %).  Do **not** multiply by 100.

Yield on Cost
^^^^^^^^^^^^^

.. math::

   \text{yieldOnCost} = \frac{\text{annualDividend}}{\text{avgCost}} \times 100

where ``annualDividend`` is the ``dividendRate`` from yfinance (annual
dividend per share in dollars).

----

Portfolio-Level Metrics
-----------------------

Weighted Dividend Yield
^^^^^^^^^^^^^^^^^^^^^^^

.. math::

   \text{weightedDivYield} = \frac{\sum_i \text{allocation}_i \times \text{divYield}_i}{100}

Dividend % of Total
^^^^^^^^^^^^^^^^^^^^

.. math::

   \text{divPctOfTotal}_i = \frac{\text{annualDividend}_i}{\text{totalAnnualDividends}} \times 100

where :math:`\text{annualDividend}_i = \text{dividendRate}_i \times \text{shares}_i`
and :math:`\text{totalAnnualDividends} = \sum_i \text{annualDividend}_i`.

----

Rebalancing
-----------

Shares Buying Power
^^^^^^^^^^^^^^^^^^^

.. math::

   \text{sharesBuyingPower} = \frac{\text{capitalToInvest}}{\text{currentPrice}}

Shares to Target
^^^^^^^^^^^^^^^^

Computed from the difference between target allocation and current
allocation.  The system determines how many shares to buy or sell so that
the position reaches its target weight given the available capital.

----

See Also
--------

* :doc:`distance` -- Distance from IV and average cost
* :doc:`signals` -- Signal badges derived from return % and distance metrics
* :doc:`annual-data` -- Aggregated annual view of portfolio performance
