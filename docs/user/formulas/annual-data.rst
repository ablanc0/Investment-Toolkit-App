Annual Data
===========

Annual data is **computed on the fly** from ``monthlyData`` and
``dividendLog`` entries stored in ``portfolio.json``.  It is never stored
directly.

Source: ``routes/dividends.py`` -- ``api_annual_data()``

.. contents::
   :local:
   :depth: 1

----

Computation Per Year
--------------------

For each calendar year the following values are derived:

Portfolio Value
^^^^^^^^^^^^^^^

The **last non-zero** ``portfolioValue`` from monthly entries in that year.

Annual Contributions
^^^^^^^^^^^^^^^^^^^^

The **sum** of all ``contributions`` from monthly entries in that year.

.. math::

   \text{annualContributions} = \sum_{\text{month} \in \text{year}} \text{contributions}_{\text{month}}

Dividend Income
^^^^^^^^^^^^^^^

The **sum** of the ``total`` field from ``dividendLog`` entries whose month
string matches the year.

.. math::

   \text{dividendIncome} = \sum_{\text{entry} \in \text{year}} \text{entry.total}

Accumulated Investment
^^^^^^^^^^^^^^^^^^^^^^

Taken from the **last month** of the year's ``accumulatedInvestment``
field.

----

Derived Metrics
---------------

Total Return
^^^^^^^^^^^^

.. math::

   \text{totalReturn} = \text{portfolioValue} - \text{accumulatedInvestment}

Total Return %
^^^^^^^^^^^^^^

.. math::

   \text{totalReturnPct} = \frac{\text{totalReturn}}{\text{accumulatedInvestment}}

Dividend Yield
^^^^^^^^^^^^^^

.. math::

   \text{dividendYield} = \frac{\text{dividendIncome}}{\text{portfolioValue}}

S&P 500 Yield %
^^^^^^^^^^^^^^^^

Manually entered value (``sp500YieldPct``) representing the S&P 500 total
return for that year.  Used for benchmarking portfolio performance.

----

Data Sources
------------

* **monthlyData** (in ``portfolio.json``): keyed by month string
  (e.g. ``"January 24"``), contains ``portfolioValue``, ``contributions``,
  ``accumulatedInvestment``.
* **dividendLog** (in ``portfolio.json``): keyed by month string
  (e.g. ``"January"``), the server splits on space to extract the year.

.. note::

   Month format mismatch: ``monthlyData`` uses ``"January 24"`` while
   ``dividendLog`` uses ``"January"`` -- the server handles this by
   splitting on the space character.

----

See Also
--------

* :doc:`portfolio` -- Per-position metrics
* :doc:`projections` -- Forward-looking growth projections
