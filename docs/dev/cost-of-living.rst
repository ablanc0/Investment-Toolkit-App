Cost of Living — Developer Architecture
=======================================

Internal architecture of the Cost of Living subsystem: data model,
data flow, key functions, API endpoints, and design decisions.

For user-facing documentation (KPIs, metrics, formulas, configuration),
see :doc:`/user/cost-of-living`.

.. contents::
   :local:
   :depth: 2

----

Data Model
----------

Storage File
^^^^^^^^^^^^

``col_data.json`` — stored in the Google Drive data directory alongside
``portfolio.json``.  Loaded into module-level ``_col_data`` dict at
startup by ``col_api.load_col_data()``.

Top-level schema:

.. code-block:: json

   {
     "cities": [],
     "cityNames": [],
     "globalCityList": [],
     "fetchedAt": "2025-06-01T12:00:00",
     "cityCount": 768,
     "totalKnownCities": 768,
     "newCitiesAdded": 0
   }

- ``cities`` — normalized city records (all sources merged).
- ``cityNames`` — sorted list of US city names from the API.
- ``globalCityList`` — raw city list from the ditno API (all countries).
- ``fetchedAt`` — ISO timestamp of the last bulk fetch.

City Record Schema
^^^^^^^^^^^^^^^^^^

Each entry in ``cities`` follows the canonical schema produced by
``col_api._normalize_cities()`` and ``resettle_svc.normalize_resettle()``:

.. list-table::
   :header-rows: 1
   :widths: 25 15 60

   * - Field
     - Type
     - Description
   * - ``name``
     - str
     - City name (display name from API or user input)
   * - ``country``
     - str
     - Country name
   * - ``state``
     - str
     - US state (empty for non-US cities)
   * - ``source``
     - str
     - One of: ``api``, ``resettle``, ``manual``
   * - ``lastUpdated``
     - str
     - ISO timestamp from the data source
   * - ``colIndex``
     - float
     - Cost of Living index (NYC = 100)
   * - ``rentIndex``
     - float
     - Rent index (NYC = 100)
   * - ``colPlusRentIndex``
     - float
     - Combined COL + Rent index
   * - ``purchasingPowerIndex``
     - float
     - Purchasing Power Index (NYC = 100)
   * - ``rent1brCity``, ``rent1brSuburb``
     - float
     - 1-bedroom rent (city centre / outside)
   * - ``rent3brCity``, ``rent3brSuburb``
     - float
     - 3-bedroom rent (city centre / outside)
   * - ``monthlyCostsNoRent``
     - float
     - Estimated monthly costs excluding rent
   * - ``avgNetSalary``
     - float
     - Average monthly net salary
   * - ``details``
     - dict
     - Full raw item prices (87 items for ditno, empty for Resettle)
   * - ``dataCompleteness``
     - float
     - Resettle only: ratio of non-null fields (0.0–1.0)

Source Types
^^^^^^^^^^^^

===============  =============  ==============================================
Source           Provider       How it enters the system
===============  =============  ==============================================
``api``          ditno API      Bulk fetch via ``fetch_city_details()`` or
                                ``fetch_all_global_details()``
``resettle``     Resettle API   On-demand via ``lookup_or_fetch()``
``manual``       User input     Added via ``save_manual_city()``
===============  =============  ==============================================

COL Config
^^^^^^^^^^

Stored in ``portfolio.json`` under ``colConfig``.  Defaults defined in
``routes/planning.py:_default_col_config()``.  Contains home city
parameters, salary references, bedroom/location preferences, and
housing weight.

----

Data Flow
---------

Startup
^^^^^^^

.. code-block:: text

   server.py
     └── col_api.load_col_data()      # Load col_data.json → _col_data
     └── col_api.auto_refresh_if_stale()  # Background thread if data > 30d old

``auto_refresh_if_stale()`` checks ``_col_data.fetchedAt``.  If older
than 30 days and the ditno API quota has >= 2 remaining calls, it
spawns a background thread running ``check_for_new_cities()`` then
``fetch_city_details()``.

User Interactions
^^^^^^^^^^^^^^^^^

**Search (on-demand lookup)**

.. code-block:: text

   POST /api/cost-of-living/fetch-city   {cityName, country, force}
     └── col_api.lookup_or_fetch(city_name, country, force)
           ├── _find_city()             # Check local DB first
           ├── quota_svc.check_quota()  # Verify Resettle quota
           ├── resettle_svc.search_place()      # GET place_id
           ├── resettle_svc.fetch_cost_of_living()  # GET COL data
           ├── resettle_svc.normalize_resettle()    # Canonical schema
           ├── col_api.compute_indices()   # NYC-relative indices
           └── col_api._upsert_city()      # Smart merge into store

**Refresh US cities (bulk)**

.. code-block:: text

   POST /api/cost-of-living/check-cities
     └── col_api.check_for_new_cities()   # Phase 1: GET city list

   POST /api/cost-of-living/fetch-details
     └── col_api.fetch_city_details()     # Phase 2: POST bulk details
           ├── _normalize_cities()        # Transform raw → canonical
           └── smart merge (per-city timestamp check)

**Refresh global cities**

.. code-block:: text

   POST /api/cost-of-living/fetch-all-global
     └── col_api.fetch_all_global_details(batch_size=50)
           ├── batched POST requests      # 50 cities per API call
           ├── _normalize_cities()        # per batch
           └── smart merge (dedup + timestamp check)

**Manual entry**

.. code-block:: text

   POST /api/cost-of-living/save-manual-city   {name, rent, costs, ...}
     └── col_api.save_manual_city()
           └── _save_col_data()

----

Key Functions
-------------

``services/col_api.py``
^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``load_col_data()``
     - Startup loader: reads ``col_data.json`` into module-level
       ``_col_data`` dict.
   * - ``_save_col_data()``
     - Persists ``_col_data`` to disk.
   * - ``check_for_new_cities()``
     - Phase 1 API call: fetches global city list, detects new US
       cities, stores ``globalCityList`` and ``cityNames``.
   * - ``fetch_city_details(city_names)``
     - Phase 2 API call: bulk POST for US city details, normalizes,
       smart-merges into store.
   * - ``fetch_all_global_details(batch_size)``
     - Global refresh: batches all known cities (50 per call),
       normalizes and smart-merges.
   * - ``lookup_or_fetch(city_name, country, force)``
     - On-demand lookup: local DB first, then Resettle API.
       Checks quota, normalizes, computes indices, upserts.
   * - ``auto_refresh_if_stale(max_age_days)``
     - Startup hook: background refresh if data is older than
       ``max_age_days`` and quota allows.
   * - ``_should_update(existing, incoming)``
     - Merge decision: manual protected, timestamp comparison,
       completeness tiebreak.
   * - ``_upsert_city(city)``
     - Insert-or-update using ``_should_update()`` for consistent
       merge logic.
   * - ``compute_indices(city, nyc)``
     - Computes COL index, rent index, COL+rent index, and PPI
       relative to NYC.
   * - ``_normalize_cities(raw_list)``
     - Transforms raw ditno API response into canonical city schema
       with 25+ normalized fields and full 87-item details dict.

``services/resettle_svc.py``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``search_place(city_name, country_code)``
     - Searches Resettle API for a place_id. Uses 1 API call.
   * - ``fetch_cost_of_living(place_id)``
     - Fetches raw COL data for a place_id. Uses 1 API call.
   * - ``normalize_resettle(city_name, raw_data, country_code)``
     - Transforms Resettle response into canonical city schema.
       Computes ``monthlyCostsNoRent`` from itemized costs.
       Tracks ``dataCompleteness`` ratio.

``routes/planning.py`` (COL endpoints)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``_default_col_config()``
     - Returns default COL configuration dict.
   * - ``_resolve_home_col(config, api_cities)``
     - Resolves home city COL index via cascade: manual, proxy city,
       or state average.
   * - ``_compute_col_entry(entry, config, api_cities)``
     - Recomputes all derived fields for a single city entry (factor,
       equivalent salary, PPI, formula selection).
   * - ``_compute_home_ppi(config, api_cities)``
     - Computes PPI for the home city using stored or averaged salary.

----

API Endpoints
-------------

.. list-table::
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/cost-of-living``
     - Returns full COL state: config, entries with computed fields,
       home city PPI, API metadata.
   * - POST
     - ``/api/cost-of-living/add``
     - Add a city to the comparison list (from API data or manual).
   * - POST
     - ``/api/cost-of-living/update``
     - Update a tracked city's editable fields (rent, costs, area).
   * - POST
     - ``/api/cost-of-living/delete``
     - Remove a city from the tracked list.
   * - POST
     - ``/api/cost-of-living/pin``
     - Toggle pin status for a tracked city.
   * - POST
     - ``/api/cost-of-living/config/update``
     - Update COL configuration (home city, salary, weights).
   * - POST
     - ``/api/cost-of-living/recompute``
     - Force recompute of all tracked cities.
   * - POST
     - ``/api/cost-of-living/check-cities``
     - Phase 1: discover new cities from ditno API.
   * - POST
     - ``/api/cost-of-living/fetch-details``
     - Phase 2: bulk fetch US city details from ditno API.
   * - POST
     - ``/api/cost-of-living/fetch-all-global``
     - Bulk fetch all global city details (batched).
   * - POST
     - ``/api/cost-of-living/fetch-city``
     - On-demand fetch for a single city via Resettle API.
   * - POST
     - ``/api/cost-of-living/save-manual-city``
     - Save or update a manual city entry.
   * - POST
     - ``/api/cost-of-living/delete-manual-city``
     - Delete a manual city entry.
   * - POST
     - ``/api/cost-of-living/upgrade``
     - Upgrade tracked cities from API data (backfill apiData).
   * - POST
     - ``/api/cost-of-living/dedup``
     - Remove duplicate city entries from col_data.json.
   * - GET
     - ``/api/cost-of-living/quota``
     - Return API quota status for ditno and Resettle.
   * - GET
     - ``/api/cost-of-living/api-cities``
     - Return stored API city list for search/autocomplete.

----

Design Decisions
----------------

Smart Merge with Timestamp Priority
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

``_should_update()`` implements a consistent merge strategy used by
both ditno bulk refresh and Resettle on-demand upsert:

1. **Manual entries are never overwritten** — they represent explicit
   user data that should survive any API refresh.
2. **Timestamp comparison** — when both entries have ``lastUpdated``,
   the newer one wins.
3. **Completeness tiebreak** — when neither has a timestamp, the entry
   with more non-null data fields wins.
4. **Conservative default** — ties keep the existing entry.

This prevents data regression when an API returns stale or incomplete
data for a city that already has fresher information from another source.

US vs Global Refresh Separation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

US and global refreshes are separate operations because:

- The ditno API has a strict 5 calls/month quota.
- US refresh uses 2 calls (check + fetch) and covers the primary
  use case.
- Global refresh requires many batched calls (50 cities per call) and
  is an infrequent operation.
- Keeping them separate lets users conserve quota for US data while
  occasionally doing a full global refresh.

Auto-refresh is Self-limiting
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

``auto_refresh_if_stale()`` only triggers when:

1. Data is older than 30 days (configurable).
2. The ditno quota has >= 2 remaining calls.

After refresh, ``fetchedAt`` updates to now, preventing the check from
triggering again for another 30 days.  This means the app will never
burn through the monthly quota on auto-refresh alone.

On-demand Lookup via Resettle
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The Resettle API provides on-demand single-city lookups (100/month free)
as a complement to the ditno bulk data.  The flow:

1. Check local DB first (avoid unnecessary API calls).
2. Check quota before constructing API requests (fail fast).
3. Two API calls per city: search (place_id) + fetch (COL data).
4. Normalize into the same canonical schema as ditno entries.
5. Compute NYC-relative indices for consistency.
6. Upsert with the same ``_should_update()`` logic.

The ``force`` parameter lets users explicitly request fresh data from
the API even when the city exists locally (e.g., to get updated prices).

Manual Entry Protection
^^^^^^^^^^^^^^^^^^^^^^^^

Manual entries (``source: "manual"``) are protected throughout the
system:

- ``_should_update()`` returns ``False`` for manual entries.
- ``_upsert_city()`` skips manual entries during merge.
- ``fetch_city_details()`` preserves manual entries alongside API data.
- ``delete_manual_city()`` only deletes entries with ``source: "manual"``.

This ensures user-provided data is never silently overwritten by an API
refresh.

----

See Also
--------

* :doc:`/user/cost-of-living` — User guide (KPIs, metrics, formulas)
* :doc:`/architecture/api-quotas` — API quota management for ditno and Resettle
* :doc:`/architecture/api-abstraction` — Provider cascade and resilient HTTP
