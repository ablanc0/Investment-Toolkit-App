Valuation Models
================

InvToolkit computes intrinsic value through four independent models and one
composite summary.  All models apply a 30 % margin of safety to produce a
conservative buy-below price.

Source: ``models/valuation.py``

Key constants (from ``config.py``):

.. list-table::
   :header-rows: 1
   :widths: 40 20

   * - Constant
     - Value
   * - ``RISK_FREE_RATE``
     - 4.25 %
   * - ``MARKET_RETURN``
     - 9.9 %
   * - ``PERPETUAL_GROWTH``
     - 2.5 %
   * - ``MARGIN_OF_SAFETY``
     - 0.70 (30 % margin)

.. contents::
   :local:
   :depth: 2

----

DCF -- Single Growth Rate
--------------------------

Function: ``compute_dcf()``

Step 1 -- WACC
^^^^^^^^^^^^^^

Cost of equity via CAPM:

.. math::

   K_e = R_f + \beta \times (R_m - R_f)

Weighted-average cost of capital:

.. math::

   \text{WACC} = K_e \times \frac{E}{V} + K_d \times (1 - \text{tax}) \times \frac{D}{V}

WACC is floored at 5 %.

Step 2 -- Historical FCF & Growth
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* Collect historical free-cash-flow from cashflow statements.
* Compute a trimmed mean of year-over-year growth rates.
* Growth rate: :math:`g = \text{trimmed\_mean} \times 0.7`, capped to
  :math:`[-5\%,\; 30\%]`.

Step 3 -- Projected FCFs
^^^^^^^^^^^^^^^^^^^^^^^^^

Project 9 years of future FCF:

.. math::

   \text{FCF}_t = \text{FCF}_{t-1} \times (1 + g)

Each is discounted to present value:

.. math::

   \text{PV}(\text{FCF}_t) = \frac{\text{FCF}_t}{(1 + \text{WACC})^t}

Step 4 -- Terminal Value
^^^^^^^^^^^^^^^^^^^^^^^^

Gordon Growth Model with perpetual growth :math:`g_\perp = 2.5\%`:

.. math::

   TV = \frac{\text{FCF}_9 \times (1 + g_\perp)}{\text{WACC} - g_\perp}

Step 5 -- Equity Value
^^^^^^^^^^^^^^^^^^^^^^

.. math::

   EV &= \sum_{t=1}^{9} \text{PV}(\text{FCF}_t) + \text{PV}(TV) \\
   \text{Equity Value} &= EV - \text{Debt} + \text{Cash} \\
   \text{IV/share} &= \frac{\text{Equity Value}}{\text{Shares Outstanding}}

Margin of Safety IV:

.. math::

   \text{MoS IV} = \text{IV} \times 0.70

----

DCF Scenarios -- Two-Phase
----------------------------

Function: ``compute_dcf_scenarios()``

Operates on a **per-share FCF** basis and blends three weighted scenarios.

Scenario Definitions
^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 15 15 25 25 20

   * - Scenario
     - Weight
     - Phase 1 (yr 1--5)
     - Phase 2 (yr 6--10)
     - Terminal Multiple
   * - Base
     - 50 %
     - :math:`g_1 = \text{hist} \times 0.7`
     - :math:`g_2 = g_1 \times 0.6`
     - 15
   * - Best
     - 25 %
     - :math:`g_1 = \text{hist} \times 1.0`
     - :math:`g_2 = g_1 \times 0.8`
     - 20
   * - Worst
     - 25 %
     - :math:`g_1 = \text{hist} \times 0.3`
     - :math:`g_2 = g_1 \times 0.5`
     - 10

When the historical growth rate is negative, the Best and Worst factors are
swapped so that the best case always represents the more optimistic outcome.

Growth rate caps:

* Phase 1: :math:`[-5\%,\; 35\%]`
* Phase 2: :math:`[-5\%,\; 25\%]`

Composite IV
^^^^^^^^^^^^

.. math::

   \text{Composite IV} = 0.50 \times IV_{\text{base}}
                        + 0.25 \times IV_{\text{best}}
                        + 0.25 \times IV_{\text{worst}}

Margin of Safety IV:

.. math::

   \text{MoS IV} = \text{Composite IV} \times 0.70

----

Graham Revised
--------------

Function: ``compute_graham()``

Benjamin Graham's revised formula with a bond-yield adjustment:

.. math::

   IV = \text{EPS} \times (\text{BasePE} + C_g \times g) \times \frac{\text{AAA}_{\text{baseline}}}{\text{AAA}_{\text{current}}}

Constants
^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 40 20

   * - Parameter
     - Value
   * - ``BasePE``
     - 7.0
   * - ``Cg``
     - 1.0
   * - ``AAAbaseline``
     - 4.4
   * - ``AAAcurrent``
     - 5.3 (live from FRED)

* **Growth** (:math:`g`): earnings growth from FMP multiplied by 100, capped at
  20 %, default 5 % when unavailable.

Margin of Safety IV:

.. math::

   \text{MoS IV} = IV \times 0.70

----

Relative Valuation
------------------

Function: ``compute_relative()``

Compares three multiples against sector averages:

.. math::

   \text{implied price}_{\text{P/E}}       &= \text{sector avg P/E} \times \text{EPS} \\
   \text{implied price}_{\text{EV/EBITDA}} &= \text{sector avg EV/EBITDA} \times \text{EBITDA/share} \\
   \text{implied price}_{\text{P/B}}       &= \text{sector avg P/B} \times \text{BVPS}

.. math::

   IV = \text{average of valid implied prices}

Default Sector Averages
^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 15 20 10

   * - Sector
     - P/E
     - EV/EBITDA
     - P/B
   * - Technology
     - 30
     - 20
     - 8
   * - Healthcare
     - 22
     - 15
     - 4
   * - Financial Services
     - 14
     - 10
     - 1.5
   * - Energy
     - 12
     - 6
     - 1.8

Margin of Safety IV:

.. math::

   \text{MoS IV} = IV \times 0.70

----

Valuation Summary (Composite)
------------------------------

Function: ``compute_valuation_summary()``

Produces a single composite intrinsic value by weighting all available models
according to the stock's classification.

Stock Classification
^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Type
     - Criteria
   * - Growth
     - P/E > 22 **and** revenue growth > 12 %
   * - Value
     - (P/E < 24 **and** dividend yield > 1.5 %) **or** P/E < 16
   * - Blend
     - Default (does not match Growth or Value)

Model Weights
^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 15 15

   * - Type
     - DCF
     - Graham
     - Relative
     - DCF Scenarios
   * - Growth
     - 30 %
     - 10 %
     - 10 %
     - 50 %
   * - Value
     - 15 %
     - 30 %
     - 25 %
     - 30 %
   * - Blend
     - 25 %
     - 20 %
     - 20 %
     - 35 %

Weights are **normalized** for available models only (if a model fails, its
weight is redistributed proportionally).

.. math::

   \text{Composite IV} = \sum_i w_i \times IV_i

Margin of Safety IV:

.. math::

   \text{MoS IV} = \text{Composite IV} \times 0.70

See :doc:`signals` for how valuation upside maps to signal badges.
