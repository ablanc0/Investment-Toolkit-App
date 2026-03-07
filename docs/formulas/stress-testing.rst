Stress Testing & Recovery
=========================

Portfolio stress testing against historical market crises with dual
Normal / Max Stress projections, per-position recovery estimates, and
dividend-aware recovery path modeling.

Source: ``models/risk_analysis.py``, scenarios from ``config.py``

.. contents::
   :local:
   :depth: 2

----

Scenarios
---------

Four historical crises plus one user-editable custom scenario:

.. list-table::
   :header-rows: 1
   :widths: 30 12 15 15

   * - Crisis
     - S&P 500 Drop
     - Stress Factor
     - Recovery (years)
   * - Great Depression (1929)
     - -86 %
     - 2.0
     - 25.0
   * - Dot-Com Crash (2000)
     - -49 %
     - 1.42
     - 7.0
   * - Financial Crisis (2008)
     - -57 %
     - 1.8
     - 5.5
   * - COVID Crash (2020)
     - -34 %
     - 1.82
     - 0.5
   * - Custom Scenario
     - editable
     - editable
     - editable

The **Custom Scenario** defaults to -20 % / 1.2 / 1.0 yr and can be
adjusted via the UI inputs (``customDrop``, ``customStressFactor``,
``customRecoveryYears`` query params on ``/api/risk-analysis``).

----

Dual Projections
----------------

Each scenario produces two projections per position:

Normal (beta-adjusted)
^^^^^^^^^^^^^^^^^^^^^^

.. math::

   \text{normalDrop} = \max(\beta \times \text{SP500\_drop},\; -100\%)

.. math::

   \text{normalLoss} = \text{marketValue} \times \frac{\text{normalDrop}}{100}

Max Stress (VIX-amplified)
^^^^^^^^^^^^^^^^^^^^^^^^^^

.. math::

   \text{maxStressDrop} = \max(\beta \times \text{SP500\_drop} \times \text{stressFactor},\; -100\%)

.. math::

   \text{maxStressLoss} = \text{marketValue} \times \frac{\text{maxStressDrop}}{100}

The **stress factor** represents VIX-based amplification during extreme
volatility. A factor of 1.8 means actual losses were historically 80 %
worse than the beta-adjusted S&P 500 decline alone.

Both drops are capped at -100 % (a position cannot lose more than its
full value).

----

Per-Position Recovery Time
--------------------------

.. math::

   \text{recoveryYears}_i = \text{scenarioRecoveryYears} \times \frac{1 + \beta_i}{2}

Higher-beta positions take proportionally longer to recover. A stock
with :math:`\beta = 1.0` recovers at the scenario average; :math:`\beta = 1.5`
takes 25 % longer.

Portfolio average:

.. math::

   \text{avgRecoveryYears} = \frac{1}{N} \sum_{i=1}^{N} \text{recoveryYears}_i

----

Recovery Path Modeling
----------------------

Recovery paths model how the portfolio value returns from the stressed
value back to pre-crash levels, month by month, with dividend
reinvestment.

Two paths are built per scenario (one from normal stressed value, one
from max stress), using shape-adjusted curves:

Recovery Shapes
^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 25 40

   * - Shape
     - Formula
     - Behavior
   * - V-shaped
     - :math:`f(t) = t`
     - Linear, steady recovery
   * - U-shaped
     - :math:`f(t) = t^2`
     - Slow start, accelerates at end
   * - L-shaped
     - :math:`f(t) = \sqrt{t}`
     - Quick initial bounce, long grind

Where :math:`t = \text{month} / \text{recoveryMonths}` (0 to 1).

Path Computation
^^^^^^^^^^^^^^^^

For each month during recovery:

.. math::

   \text{targetValue} = \text{stressedValue} + \text{gap} \times f(t)

.. math::

   \text{currentValue}_{m+1} = \text{targetValue} + \text{monthlyDividends}

Where :math:`\text{gap} = \text{preStressValue} - \text{stressedValue}` and
:math:`\text{monthlyDividends} = \text{annualDivIncome} / 12`.

Dividends compound during recovery, so the final value typically exceeds
the pre-crash level.

----

Sector Concentration
--------------------

.. math::

   \text{weight}_s = \frac{\sum_{\text{pos} \in s} \text{marketValue}}{\text{totalMarketValue}} \times 100

.. list-table::
   :header-rows: 1
   :widths: 20 20

   * - Weight
     - Risk Level
   * - :math:`\geq 30\%`
     - HIGH
   * - :math:`\geq 15\%`
     - MEDIUM
   * - :math:`< 15\%`
     - LOW

----

Risk Metrics
------------

Computed from monthly portfolio snapshots (entries with
``portfolioValue > 0`` only).

Monthly returns use **Modified Dietz** to account for contributions:

.. math::

   r_m = \frac{V_{\text{end}} - V_{\text{start}} - C}{V_{\text{start}} + 0.5 \times C}

Where :math:`C` = contributions during the month.

.. list-table::
   :header-rows: 1
   :widths: 30 50

   * - Metric
     - Formula
   * - TWR (cumulative)
     - :math:`\prod (1 + r_m) - 1`
   * - Annualized Return
     - :math:`\text{TWR\_cum}^{12/N} - 1`
   * - Annualized Volatility
     - :math:`\sigma_m \times \sqrt{12}`
   * - Sharpe Ratio
     - :math:`\frac{\bar{r}_m - r_f}{\sigma_m} \times \sqrt{12}`
   * - Sortino Ratio
     - :math:`\frac{r_{\text{ann}} - R_f}{\sigma_{\text{down}} \times \sqrt{12}}`
   * - Max Drawdown
     - :math:`\min \frac{V - V_{\text{peak}}}{V_{\text{peak}}}`
   * - Portfolio Beta
     - :math:`\sum \frac{\beta_i \times MV_i}{\text{totalMV}}`

S&P 500 (SPY) benchmark metrics are computed with the same formulas for
side-by-side comparison.

----

See Also
--------

* :doc:`portfolio` -- Portfolio-level financial metrics
* :doc:`projections` -- Forward-looking compound growth projections
