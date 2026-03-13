Cost of Living
==============

Compare the cost of living across cities relative to your home city.
The tab answers the question: *"If I moved to City X, what salary would
I need to maintain the same standard of living?"*

.. contents::
   :local:
   :depth: 2

----

Tab Overview
------------

The Cost of Living tab displays four **KPI cards**, a **glossary card**,
a **Reference Inputs** panel, and a **comparison table** with an
accompanying salary-equivalence chart.

KPI Cards
^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Card
     - Description
   * - **Home City (Baseline)**
     - Your current city.  Always shows Factor 1.00x.  Also displays COL
       index, average net salary, and PPI when data is available.
   * - **Cheapest City**
     - The tracked city with the lowest overall factor.  Shown in green.
   * - **Most Expensive**
     - The tracked city with the highest overall factor.  Shown in red.
   * - **Avg. Factor**
     - Arithmetic mean of all tracked cities' factors, plus total city count.

Glossary Card
^^^^^^^^^^^^^

Rendered directly below the KPI row, the glossary card provides
one-line definitions for **Factor**, **COL**, **$/mo**, and **PPI**.

----

Key Metrics
-----------

Factor
^^^^^^

The overall cost ratio of a city compared to your home city.

* ``1.00x`` -- same cost of living as home.
* ``< 1.00x`` -- cheaper than home.
* ``> 1.00x`` -- more expensive than home.

Two formulas are used, selected automatically:

**Direct formula** (when both cities have dollar-denominated costs and
rent):

.. math::

   \text{factor} = \frac{\text{cityRent} + \text{cityCosts}}
                        {\text{homeRent} + \text{homeCosts}}

**Weighted formula** (fallback when dollar costs are unavailable):

.. math::

   \text{factor} = \text{housingMult} \times w
                 + \text{nonHousingMult} \times (1 - w)

where:

.. math::

   \text{housingMult}    &= \frac{\text{cityRent}}{\text{homeRent}} \\
   \text{nonHousingMult} &= \frac{\text{cityCOLIndex}}{\text{homeCOLIndex}}

and :math:`w` is the housing weight (default 0.30).

The comparison table shows a badge (``DIRECT`` or ``WEIGHTED``) next to
each city's factor indicating which formula was used.

COL Index
^^^^^^^^^

Cost of Living index on a scale where **New York City = 100**.
A lower value means a cheaper city; a higher value means a more
expensive one.

**API cities** -- sourced directly from the Numbeo dataset.

**Manual entries** -- auto-computed from the city's non-housing monthly
costs:

.. math::

   \text{colIndex} = \frac{\text{monthlyCostsNoRent}}
                          {\text{NYC\_monthlyCostsNoRent}} \times 100

where NYC monthly costs are looked up from the API dataset
(fallback: $1,728 if NYC is not present).

$/mo (Average Net Monthly Salary)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The average net monthly salary associated with a city.

**API cities** -- the ``avgNetSalary`` value from Numbeo data.

**Manual entries** -- resolved in the following order:

1. User-provided custom salary (stored in the entry).
2. State average salary computed from API cities in the same state.
3. Fallback: the user's reference salary divided by 12.

PPI (Purchasing Power Index)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

How far a salary stretches in a given city relative to New York City
(NYC = 100).

.. math::

   \text{PPI} = \frac{\text{avgNetSalary} \;/\; \text{colPlusRentIndex}}
                     {\text{NYC\_avgNetSalary} \;/\; 100} \times 100

where:

.. math::

   \text{colPlusRentIndex} = \frac{\text{colIndex} + \text{rentIndex}}{2}

and:

.. math::

   \text{rentIndex} = \frac{\text{cityRent}}{\text{NYC\_rent}} \times 100

The ``colPlusRentIndex`` formulation matches Numbeo's methodology by
combining both housing and non-housing costs into a single denominator.
For API-sourced cities, ``colPlusRentIndex`` is provided directly by the
dataset.

Interpretation:

* :math:`\text{PPI} \ge 100` -- salary stretches further than in NYC
  (displayed in green).
* :math:`\text{PPI} < 100` -- salary covers less than in NYC
  (displayed in amber).

Derived Salary Metrics
^^^^^^^^^^^^^^^^^^^^^^

Two salary-equivalence values are computed for every tracked city:

**Equivalent Salary** (green column):

.. math::

   \text{equivalentSalary} = \text{referenceSalary} \times \text{factor}

The salary needed in the comparison city to match your home city
purchasing power.

**EL Equivalent** (blue column):

.. math::

   \text{elEquivalent} = \frac{\text{comparisonSalary}}{\text{factor}}

How far the comparison salary would stretch in the comparison city,
expressed in home-city dollars.

----

Data Sources
------------

API Cities
^^^^^^^^^^

City-level cost data is sourced from Numbeo via the ditno Cities Cost of
Living API (RapidAPI).  Data is stored locally and contains
approximately 768 cities globally.

Each API city provides: cost-of-living indices, rent variants (1 BR and
3 BR, city centre and outside), average net salary, purchasing power
index, monthly costs, and utilities.

Data can be refreshed from the API management panel — first check for
new cities, then fetch detailed data.  See
:doc:`/dev/cost-of-living` for the refresh mechanism internals.

Manual Entries
^^^^^^^^^^^^^^

Users can add cities not in the API dataset by providing rent and
monthly costs.  The server auto-computes COL index and PPI from these
inputs using NYC as the baseline.

Manual entries are stored alongside API entries and are never
overwritten by API refreshes.

NYC Baseline
^^^^^^^^^^^^

New York City is always the reference point for index calculations:

- COL Index: NYC = 100
- PPI: NYC = 100

When NYC is present in the API dataset, its actual values are used.
Otherwise, the following defaults apply: monthly costs $1,728,
net salary $5,159/mo, 1 BR city rent $2,697/mo.

----

Manual Entry Workflow
---------------------

Adding a City
^^^^^^^^^^^^^

Cities can be added in two ways:

1. **Search bar** in the comparison table -- type a city name to search
   the API database.  Select a result to add it as an API-sourced entry.
   If no match is found, a "add manually" link appears.

2. **Manual form** -- enter city name, state/area, location type
   (Downtown or Suburban), bedroom count, rent, and monthly costs
   (non-housing).  The entry is added as unpinned (temporary) by
   default; check the checkbox in the table to pin it permanently.

Editing a City
^^^^^^^^^^^^^^

Click any editable cell (e.g. rent) in the comparison table to inline-
edit the value.  After saving, the server recomputes all derived metrics
(factor, equivalent salary, COL index, PPI) automatically.

For API-sourced cities, manual edits to rent or non-housing costs are
preserved across API refreshes — your customizations are never
overwritten.

Pinning and Unpinning
^^^^^^^^^^^^^^^^^^^^^

Each city row has a checkbox.  Unchecked cities are marked as temporary
(``TEMP`` badge, reduced opacity) and are removed when a new temporary
city is added.  Check the box to pin a city permanently.

----

Reference Inputs
----------------

The Reference Inputs panel (above the comparison table) configures the
baseline for all comparisons.  It is split into two sections: **Your
City** and **Salary**.

Your City
^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Field
     - Description
   * - **City**
     - Your home city name.  Supports autocomplete against the API
       database.  If the city matches an API entry, COL data is
       auto-resolved.
   * - **Country**
     - Country selector.  Affects state/region filtering and API city
       matching.
   * - **State/Region**
     - Used to compute state-average COL and salary when the home city
       is not in the API database.
   * - **Your Rent/mo**
     - Your current monthly rent.  Used as the denominator for all
       housing multiplier calculations.
   * - **Bedrooms**
     - 1 BR or 3 BR.  Determines which rent column is pulled from the
       API dataset (e.g. ``rent1brCity`` vs ``rent3brCity``).
   * - **Location**
     - City Centre or Outside Centre.  Selects the matching rent column
       (e.g. ``rent1brCity`` vs ``rent1brSuburb``).

Home City COL Resolution
~~~~~~~~~~~~~~~~~~~~~~~~~

The home city's COL index and monthly costs are resolved using a
cascade:

1. **API city** -- if the home city name matches an entry in the
   API dataset, values are used directly.
2. **Proxy city** -- a nearby API city in the same state is selected as
   a proxy.
3. **State average** -- the mean COL and costs of all API cities in the
   same state.
4. **Manual** -- user-provided values from the config.

Salary
^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Field
     - Description
   * - **Reference Salary** (green)
     - Your annual take-home pay.  Used to compute equivalent salaries
       (green column in the table).  Can be set manually or linked to a
       salary profile from the Salary tab.
   * - **Comparison Salary** (blue)
     - A second salary for comparison.  Used to compute EL Equivalent
       values (blue column).
   * - **Source selector**
     - Choose how the reference salary is determined: *Manual* (enter a
       number), a named salary profile, or *Household (all)* (sum of
       all profiles' take-home pay).

When linked to a salary profile, the reference salary is automatically
recalculated from the Salary tab's tax computation, so changes to
salary or tax configuration propagate to COL comparisons.

----

Configuration
-------------

Housing Weight
^^^^^^^^^^^^^^

Default: **30 %** (0.30).

Controls how much rent affects the overall factor in the **weighted
formula**:

.. math::

   \text{factor} = \text{housingMult} \times w
                 + \text{nonHousingMult} \times (1 - w)

A higher housing weight gives more influence to rent differences; a
lower weight emphasizes non-housing costs.

.. note::

   The housing weight only affects cities using the weighted formula.
   Cities with full dollar-denominated data use the direct formula,
   which is not weighted.

Bedroom Count
^^^^^^^^^^^^^

Options: **1 BR** or **3 BR**.

Selects which rent column is read from the API dataset for each city.
Changing this value recomputes all tracked cities.

Location Type
^^^^^^^^^^^^^

Options: **City Centre** or **Outside Centre**.

Selects the rent variant (e.g. ``rent1brCity`` vs ``rent1brSuburb``).
Combined with bedroom count, this produces four possible rent lookups:

.. list-table::
   :header-rows: 1
   :widths: 30 30 40

   * - Bedrooms
     - Location
     - API Field
   * - 1 BR
     - City Centre
     - ``rent1brCity``
   * - 1 BR
     - Outside Centre
     - ``rent1brSuburb``
   * - 3 BR
     - City Centre
     - ``rent3brCity``
   * - 3 BR
     - Outside Centre
     - ``rent3brSuburb``

----

See Also
--------

* :doc:`/formulas/taxes` -- Salary and tax computation used by salary profiles
* :doc:`/formulas/rule4` -- Retirement simulation on the same Planning tab
* :doc:`/dev/cost-of-living` -- Developer architecture (data model, data flow, API endpoints)
