Distance Metrics
================

Distance metrics express how far the current market price is from a
reference price, reported as a percentage.

Source: ``routes/portfolio.py``

.. contents::
   :local:
   :depth: 1

----

Distance from Intrinsic Value
-----------------------------

Measures how far the current price deviates from the computed intrinsic
value (see :doc:`valuation`).

.. math::

   \text{distFromIV} = \frac{\text{currentPrice} - \text{intrinsicValue}}{\text{intrinsicValue}}

Displayed as a percentage:

* **Negative** -- the stock is **undervalued** (price below IV).
* **Positive** -- the stock is **overvalued** (price above IV).

**Example**: price = $100, IV = $150

.. math::

   \text{distFromIV} = \frac{100 - 150}{150} = -33.3\%\;\text{(undervalued)}

This value feeds into the :ref:`IV Signal <signal-iv>`.

----

Distance from Average Cost
---------------------------

Measures how far the current price deviates from the position's average
cost basis.

.. math::

   \text{distFromAvg} = \frac{\text{currentPrice} - \text{avgCost}}{\text{avgCost}}

Displayed as a percentage:

* **Positive** -- the position is at a **profit**.
* **Negative** -- the position is at a **loss**.

**Example**: price = $120, avgCost = $100

.. math::

   \text{distFromAvg} = \frac{120 - 100}{100} = 20\%\;\text{(profit)}

This value feeds into the :ref:`Avg Cost Signal <signal-avgcost>`.

----

See Also
--------

* :doc:`signals` -- How distance values map to signal badges
* :doc:`portfolio` -- Return % and other per-position metrics
