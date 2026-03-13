InvT Score (v2)
===============

The InvT Score is a proprietary quality scoring system that evaluates
companies on a 0--10 scale across four scored categories plus one
informational category.

Source: ``models/invt_score.py``

.. contents::
   :local:
   :depth: 2

----

Overview
--------

* **Scale**: 0--10 per category and overall.
* **Data sources**: SEC EDGAR (primary), FMP (fallback), up to 10 years of
  annual data.
* **CAGR formula** used throughout:

.. math::

   \text{CAGR} = \left(\frac{\text{End}}{\text{Start}}\right)^{1/n} - 1

Results are expressed as percentages.

A category score requires at least **2 valid metrics** (for categories with
3 or more metrics) to be reported.

----

Quality Labels
--------------

.. list-table::
   :header-rows: 1
   :widths: 20 30

   * - Score
     - Label
   * - :math:`\geq 9`
     - Elite
   * - :math:`\geq 8`
     - High Quality
   * - :math:`\geq 6`
     - Above Average
   * - :math:`\geq 4`
     - Below Average
   * - :math:`< 4`
     - Poor Quality

----

Scored Categories
-----------------

These four categories contribute equally to the **Overall Score** (each
weighted at 25 %).

.. math::

   \text{Overall} = \frac{1}{4}\left(S_{\text{growth}} + S_{\text{profit}}
   + S_{\text{debt}} + S_{\text{efficiency}}\right)

1. Growth
^^^^^^^^^

Metrics (equal weight, 1/3 each):

* **Revenue CAGR** (``revenue_cagr``)
* **EPS CAGR** (``eps_cagr``)
* **FCF/Share CAGR** (``fcf_share_cagr``)

2. Profitability
^^^^^^^^^^^^^^^^

Metrics (equal weight, 1/3 each):

* **Gross Profit Margin** (``gpm``)
* **Net Profit Margin** (``npm``)
* **FCF Margin** (``fcf_margin``)

3. Debt
^^^^^^^

Metrics (equal weight, 1/3 each):

* **Net Debt CAGR** (``net_debt_cagr``) -- inverted
* **Net Debt / FCF** (``net_debt_fcf``) -- inverted
* **Interest Coverage** (``interest_cov``)

4. Capital Efficiency
^^^^^^^^^^^^^^^^^^^^^

Metrics (equal weight, 1/3 each):

* **ROA**
* **ROE**
* **ROIC**

----

Informational Category
----------------------

This category is always displayed but **never** included in the overall score.

5. Dividend & Buyback
^^^^^^^^^^^^^^^^^^^^^

Metrics (weighted):

.. list-table::
   :header-rows: 1
   :widths: 40 20

   * - Metric
     - Weight
   * - Dividend Yield (``div_yield``)
     - 0.15
   * - Dividend/Share CAGR (``dps_cagr``)
     - 0.25
   * - Payout Ratio (``payout_ratio``)
     - 0.15
   * - FCF Payout (``fcf_payout``)
     - 0.25
   * - Shares CAGR (``shares_cagr``)
     - 0.20

----

Threshold Tables
----------------

Each metric maps its value to a 0--10 score using the thresholds below.
Conditions are evaluated top-to-bottom; the first match wins.

Growth Metrics
^^^^^^^^^^^^^^

**revenue_cagr**

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< 0\%`
     - 0
   * - :math:`< 1\%`
     - 1
   * - :math:`< 3\%`
     - 3
   * - :math:`< 6\%`
     - 5
   * - :math:`< 9\%`
     - 7
   * - :math:`< 14\%`
     - 9
   * - :math:`\geq 14\%`
     - 10

**eps_cagr**

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< -10\%`
     - 0
   * - :math:`< 0\%`
     - 1
   * - :math:`< 3\%`
     - 3
   * - :math:`< 6\%`
     - 5
   * - :math:`< 9\%`
     - 7
   * - :math:`< 13\%`
     - 9
   * - :math:`\geq 13\%`
     - 10

**fcf_share_cagr**

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< -10\%`
     - 0
   * - :math:`< 0\%`
     - 1
   * - :math:`< 3\%`
     - 3
   * - :math:`< 6\%`
     - 5
   * - :math:`< 9\%`
     - 7
   * - :math:`< 18\%`
     - 9
   * - :math:`\geq 18\%`
     - 10

Profitability Metrics
^^^^^^^^^^^^^^^^^^^^^

**gpm** (Gross Profit Margin)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< 0\%`
     - 0
   * - :math:`< 20\%`
     - 1
   * - :math:`< 30\%`
     - 3
   * - :math:`< 40\%`
     - 5
   * - :math:`< 50\%`
     - 7
   * - :math:`< 60\%`
     - 9
   * - :math:`\geq 60\%`
     - 10

**npm** (Net Profit Margin)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< 0\%`
     - 0
   * - :math:`< 3\%`
     - 1
   * - :math:`< 6\%`
     - 3
   * - :math:`< 10\%`
     - 5
   * - :math:`< 15\%`
     - 7
   * - :math:`< 20\%`
     - 9
   * - :math:`\geq 20\%`
     - 10

**fcf_margin**

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< 0\%`
     - 0
   * - :math:`< 5\%`
     - 1
   * - :math:`< 8\%`
     - 3
   * - :math:`< 12\%`
     - 5
   * - :math:`< 18\%`
     - 7
   * - :math:`< 25\%`
     - 9
   * - :math:`\geq 25\%`
     - 10

Debt Metrics
^^^^^^^^^^^^

**net_debt_cagr** (inverted -- lower is better)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< -25\%`
     - 10
   * - :math:`< -15\%`
     - 9
   * - :math:`< 0\%`
     - 7
   * - :math:`< 5\%`
     - 5
   * - :math:`< 10\%`
     - 3
   * - :math:`< 15\%`
     - 1
   * - :math:`\geq 15\%`
     - 0

**net_debt_fcf** (inverted -- lower is better)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< 0\times`
     - 10
   * - :math:`< 1\times`
     - 9
   * - :math:`< 2\times`
     - 7
   * - :math:`< 3\times`
     - 5
   * - :math:`< 4\times`
     - 3
   * - :math:`< 5\times`
     - 1
   * - :math:`\geq 5\times`
     - 0

**interest_cov** (Interest Coverage)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< 5\times`
     - 0
   * - :math:`< 7\times`
     - 1
   * - :math:`< 9\times`
     - 3
   * - :math:`< 11\times`
     - 5
   * - :math:`< 13\times`
     - 7
   * - :math:`< 16\times`
     - 9
   * - :math:`\geq 16\times`
     - 10

Dividend & Buyback Metrics
^^^^^^^^^^^^^^^^^^^^^^^^^^

**dps_cagr** (Dividend/Share CAGR)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< -5\%`
     - 0
   * - :math:`< 0\%`
     - 1
   * - :math:`< 4\%`
     - 3
   * - :math:`< 8\%`
     - 5
   * - :math:`< 12\%`
     - 7
   * - :math:`< 16\%`
     - 9
   * - :math:`\geq 16\%`
     - 10

**fcf_payout** (inverted -- lower is better)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< 30\%`
     - 10
   * - :math:`< 40\%`
     - 9
   * - :math:`< 50\%`
     - 7
   * - :math:`< 60\%`
     - 5
   * - :math:`< 70\%`
     - 3
   * - :math:`< 80\%`
     - 1
   * - :math:`\geq 80\%`
     - 0

**shares_cagr** (inverted -- lower / more negative is better)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`< -2.5\%`
     - 10
   * - :math:`< -2\%`
     - 9
   * - :math:`< -1.5\%`
     - 7
   * - :math:`< -1\%`
     - 5
   * - :math:`< -0.5\%`
     - 3
   * - :math:`< 0.5\%`
     - 1
   * - :math:`\geq 0.5\%`
     - 0

----

Custom Scorers
--------------

These metrics use non-monotonic scoring curves where both extremes are
penalized.

**div_yield** (Dividend Yield -- sweet spot is moderate yield)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`0\%`
     - 0
   * - :math:`< 1\%`
     - 3
   * - :math:`< 2\%`
     - 5
   * - :math:`< 4\%`
     - 7 (sweet spot)
   * - :math:`< 6\%`
     - 5
   * - :math:`< 8\%`
     - 3
   * - :math:`\geq 8\%`
     - 1

**payout_ratio** (sweet spot is moderate payout)

.. list-table::
   :header-rows: 1
   :widths: 50 50

   * - Value
     - Score
   * - :math:`\geq 120\%`
     - 0
   * - :math:`\geq 100\%`
     - 1
   * - :math:`\geq 80\%`
     - 3
   * - :math:`\geq 60\%`
     - 5
   * - :math:`\geq 40\%`
     - 7
   * - :math:`\geq 20\%`
     - 9 (sweet spot)
   * - :math:`\geq 10\%`
     - 7
   * - :math:`< 10\%`
     - 5

.. note::

   The payout_ratio scorer evaluates from highest to lowest, so the first
   matching condition wins.

----

Capital Efficiency Metrics
--------------------------

ROA, ROE, and ROIC are scored using the standard threshold mechanism.
Their specific threshold tables are defined in ``models/invt_score.py`` and
follow the same pattern as the tables above.  Each metric receives an equal
weight of 1/3 within the Capital Efficiency category.

----

See Also
--------

* :doc:`valuation` -- Intrinsic value models that complement the quality score
* :doc:`signals` -- How valuation upside maps to signal badges
