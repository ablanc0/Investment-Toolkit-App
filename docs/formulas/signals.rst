Signal System
=============

InvToolkit assigns signal badges to stocks based on how far the current price
deviates from a reference point.  There are three independent signals used in
the Portfolio view and one additional signal used in the Stock Analyzer
valuations.  Each signal maps to one of five badges displayed with a
distinctive color.

Badge Colors
------------

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Badge
     - Color
     - Meaning
   * - Strong Buy
     - ``#4ade80`` (green)
     - Significantly undervalued / deeply below reference
   * - Buy
     - ``#22d3ee`` (cyan)
     - Moderately undervalued / slightly below reference
   * - Hold
     - gray
     - Near fair value
   * - Expensive
     - ``#f59e0b`` (amber)
     - Moderately overvalued / above reference
   * - Overrated
     - ``#f87171`` (red)
     - Significantly overvalued / far above reference

.. _signal-return:

Return Signal
-------------

Assigned per position based on the percentage return relative to average cost.

Source: ``routes/portfolio.py`` lines 190--201

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Condition
     - Signal
   * - :math:`\text{returnPercent} > 50\%`
     - Overrated
   * - :math:`\text{returnPercent} > 20\%`
     - Expensive
   * - :math:`\text{returnPercent} < -5\%`
     - Strong Buy
   * - :math:`\text{returnPercent} < 5\%`
     - Buy
   * - Everything else
     - Hold

Conditions are evaluated top-to-bottom; the first match wins.

.. _signal-iv:

IV Signal
---------

Based on the distance from intrinsic value (see :doc:`distance`).

Source: ``routes/portfolio.py`` lines 82--95

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Condition
     - Signal
   * - :math:`\text{distFromIV} > 50\%`
     - Overrated
   * - :math:`\text{distFromIV} > 20\%`
     - Expensive
   * - :math:`\text{distFromIV} < -5\%`
     - Strong Buy
   * - :math:`\text{distFromIV} < 5\%`
     - Buy
   * - Everything else
     - Hold

.. _signal-avgcost:

Avg Cost Signal
---------------

Based on the distance from the position's average cost (see :doc:`distance`).

Source: ``routes/portfolio.py`` lines 97--107

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Condition
     - Signal
   * - :math:`\text{distFromAvg} > 50\%`
     - Overrated
   * - :math:`\text{distFromAvg} > 20\%`
     - Expensive
   * - :math:`\text{distFromAvg} < -5\%`
     - Strong Buy
   * - :math:`\text{distFromAvg} < 5\%`
     - Buy
   * - Everything else
     - Hold

.. _signal-upside:

Analyzer Upside Signal
----------------------

Used in the Stock Analyzer valuations to label the upside potential of each
valuation model.

Source: ``models/valuation.py`` function ``_upside_signal()``

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Condition
     - Signal
   * - :math:`\text{upside} > 50\%`
     - Strong Buy
   * - :math:`\text{upside} > 20\%`
     - Buy
   * - :math:`\text{upside} > -10\%`
     - Hold
   * - :math:`\text{upside} > -30\%`
     - Expensive
   * - Everything else
     - Overrated

.. note::

   The Analyzer Upside Signal uses the *opposite* direction from the portfolio
   signals: higher upside is better, so ``Strong Buy`` corresponds to the
   largest positive values.
