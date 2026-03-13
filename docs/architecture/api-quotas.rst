API Quotas & Usage Reference
============================

Source files:

- ``services/quota_svc.py`` -- unified quota engine
- ``services/http_client.py`` -- pre-flight checks & auto-recording
- ``services/col_api.py`` -- COL data orchestration
- ``services/fmp.py`` -- FMP financial data
- ``services/edgar.py`` -- SEC EDGAR XBRL
- ``services/yfinance_svc.py`` -- Yahoo Finance

.. contents::
   :local:
   :depth: 2

----

Overview
--------

InvToolkit connects to **7 external APIs** (plus OpenFIGI and Finviz as
secondary sources).  Three have hard monthly/daily quotas; the rest are
free with rate limits only.

All quota enforcement flows through ``services/quota_svc.py`` and is
integrated into ``http_client._resilient_request()`` so callers never
need to check quotas manually.

.. list-table:: Provider Summary
   :header-rows: 1
   :widths: 18 15 18 15 34

   * - Provider
     - Quota
     - Plan
     - Cost
     - Used For
   * - **FMP**
     - 250 / day
     - Free tier
     - $0
     - Stock financials, DCF, benchmarks, FRED yield
   * - **ditno (RapidAPI)**
     - 5 / month
     - Basic (free)
     - $0
     - COL bulk city database (767 cities)
   * - **Resettle**
     - 100 / month + 10/hr
     - Basic (free)
     - $0
     - COL on-demand city search
   * - **SEC EDGAR**
     - Unlimited (10 req/s)
     - Free
     - $0
     - XBRL financials, 13F filings
   * - **yfinance**
     - Unlimited
     - Free
     - $0
     - Live quotes, dividends, history
   * - **FRED**
     - Unlimited
     - Free
     - $0
     - AAA corporate bond yield
   * - **Elbstream**
     - Unlimited
     - Free
     - $0
     - Company logos (PNG)

----

Quota-Limited Providers (Detailed)
----------------------------------

FMP (Financial Modeling Prep)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

:Quota: **250 calls/day** (resets midnight UTC)
:Key: ``FMP_API_KEY`` in config
:Provider key: ``fmp``

**When it's called:**

- **Stock Analyzer** (user clicks Analyze or Refresh) -- **8-9 calls**:

  - ``_fetch_fmp_stock_data()``: 5 calls (income, cash-flow, balance-sheet,
    enterprise-values, financial-growth)
  - ``_fetch_fmp_dcf()``: 1 call (discounted cash flow)
  - ``_fetch_fmp_benchmarks()``: 3 calls (key-metrics, ratings, scores)

- **InvT Score** (user clicks Score) -- **5 calls** (if EDGAR cascade fails,
  falls back to FMP for financials)

- **FRED AAA yield** -- 1 call per analyzer run (technically FRED, but
  routed through ``services/fmp.py``; does NOT count against FMP quota)

**NOT called during:**

- Portfolio dashboard load (uses yfinance only)
- Watchlist refresh (uses yfinance only)
- Dividend tab (uses yfinance only)

**Capacity:**

.. code-block:: text

   250 calls/day / 9 calls per stock = ~27 stocks analyzed per day
   Typical month (5-10 stocks): 45-90 calls/day on active days

**Trigger:** User-initiated only (Analyzer tab buttons).  Results cached
in ``analyzer.json``; subsequent views are free.


ditno / RapidAPI Cities Cost of Living
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

:Quota: **5 calls/month** (Basic plan, resets on subscription date ~Mar 8)
:Key: ``RAPIDAPI_KEY`` in config
:Provider key: ``rapidapi``

**When it's called:**

The COL database refresh is a 2-phase process, each phase = 1 API call:

1. **Phase 1 -- Check Cities** (1 call):
   ``GET /get_cities_list`` returns the full global city catalog.
   Detects new cities added since last check.  Stores 767 known cities
   and 111 US city names.

2. **Phase 2 -- Fetch US Details** (1 call):
   ``POST /bulk-fetch`` sends all 111 US city names in a single request.
   Returns full cost-of-living data per city.

3. **Global Fetch** (variable calls):
   ``POST /bulk-fetch`` in batches of **50 cities** per call.
   For 767 global cities: ``ceil(767/50) = 16 API calls``.

**Budget breakdown (5 calls/month):**

.. code-block:: text

   Phase 1 + Phase 2          = 2 calls  (US data refresh)
   Remaining for ad-hoc       = 3 calls
   Global fetch (16 calls)    = IMPOSSIBLE on Basic plan

**Trigger:** User-initiated only (Planning > Cost of Living tab buttons).

**The global-fetch problem:**

The full 767-city global dataset requires 16 API calls to refresh.
This exceeds the 5/month Basic quota.  Options:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Option
     - Details
   * - **Pro plan once/year**
     - Subscribe to Pro ($8/mo, 100 calls/month) for 1 month.  Run full
       global fetch (16 calls).  Downgrade back to Basic.  COL data is
       relatively stable -- annual refresh is sufficient.
   * - **Spread over months**
     - Not feasible: the API endpoint fetches ALL global cities or none.
       Cannot select subsets.  Would need code changes to support partial
       batching over multiple months.
   * - **Accept stale global data**
     - Current dataset (766 cities) is already populated.  Use Resettle
       for individual city lookups when needed.  Only refresh global when
       significant changes are expected.
   * - **Resettle as supplement**
     - Use Resettle (100/month) for on-demand lookups of specific cities
       not in the ditno database.  2 calls per city = 50 cities/month.

**Recommendation:** Keep Basic plan.  Data is already populated (766/767
cities).  Use Resettle for on-demand lookups.  Subscribe to Pro ($8) for
one month annually to refresh the full global dataset.


Resettle Place API
~~~~~~~~~~~~~~~~~~

:Quota: **100 calls/month** + **10 calls/hour** rate limit
:Key: ``RAPIDAPI_KEY`` (shared RapidAPI key)
:Provider key: ``resettle``

**When it's called:**

Each city lookup = **2 API calls**:

1. ``search_place(city_name)`` -- search for city, get place_id
2. ``fetch_cost_of_living(place_id)`` -- fetch detailed cost data

**Budget breakdown (100 calls/month):**

.. code-block:: text

   100 calls / 2 per lookup = 50 city lookups per month
   Rate limit: max 10 calls/hour = 5 city lookups/hour

**Trigger:** User-initiated only (Planning > Cost of Living > "Search
Online" button for a specific city).

**Behavior when exhausted:**

- Pre-flight check in ``col_api.lookup_or_fetch()`` returns error
  immediately with remaining quota and reset date.
- Rate limit (10/hour): ``http_client`` sleeps up to 5s then retries.
  If still rate-limited, returns error to user.

**Monthly usage estimate:** 5-20 calls (2-10 city lookups).  Well within
the 100/month budget.

----

Unlimited Providers (Rate-Limited Only)
---------------------------------------

SEC EDGAR
~~~~~~~~~

:Rate limit: **10 requests/second** (SEC policy, enforced)
:Provider key: ``edgar``
:User-Agent: Required (identifies InvToolkit)

**When it's called:**

- **Stock Analyzer** -- 1 call per stock:
  ``_fetch_edgar_facts(ticker)`` fetches full XBRL company facts (~3-7 MB).
  This is the **preferred** data source (first in cascade before FMP).

- **CIK map load** -- 1 call on first use:
  ``_load_cik_map()`` downloads ticker-to-CIK mapping.
  Cached in-memory for session lifetime.

- **13F Super Investors** -- 3 calls per investor:

  1. ``_fetch_13f_latest(cik)`` -- filing index
  2. ``_fetch_13f_infotable()`` -- 2 calls (HTML index + XML data)

  For 10-15 investors: **30-45 calls** per full refresh.

**Rate limit enforcement:** Manual 0.15s sleep between EDGAR calls in
``edgar_13f.py``.  ``quota_svc`` tracks sliding window (10/sec) but
the manual sleep keeps usage well under.


yfinance (Yahoo Finance)
~~~~~~~~~~~~~~~~~~~~~~~~~

:Rate limit: None enforced (generous undocumented limits)
:Provider key: ``yfinance``
:Auth: None (Python library, no API key)

**When it's called:**

- **Portfolio dashboard load** -- 1 call per position:
  ``fetch_all_quotes(tickers)`` fetches live prices for all holdings.
  With 20 positions = 20 calls.  **5-minute cache** per ticker.

- **Dividend tab** -- 1 call per ticker:
  ``fetch_dividends(ticker)`` for dividend history.

- **Stock Analyzer** -- 1 call:
  ``fetch_yfinance_profile(ticker)`` for supplementary data.
  Always called regardless of which cascade provider wins.

- **Historical data** -- 1-2 calls:
  ``fetch_historical_prices()``, ``fetch_sp500_annual_returns()``.

**Monthly usage estimate:** 50-200 calls (many cached).  No concern.


FRED (Federal Reserve Economic Data)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

:Rate limit: Generous (no published limit for CSV endpoint)
:Provider key: ``fred``
:Auth: None (public CSV endpoint)

**When it's called:**

- **Stock Analyzer** -- 1 call per run:
  ``_fetch_fred_aaa_yield()`` fetches AAA corporate bond yield via
  ``https://fred.stlouisfed.org/graph/fredgraph.csv?id=AAA``.
  Used in Graham Number valuation model as the risk-free rate.

- **Fallback:** If FRED is unreachable, uses hardcoded 5.30% constant.

**Monthly usage estimate:** 5-10 calls.  No concern.


Elbstream (Company Logos)
~~~~~~~~~~~~~~~~~~~~~~~~~

:Rate limit: None known
:Provider key: ``elbstream``
:Auth: None (public CDN)

**When it's called:**

- **Logo fetch** -- 1 call per new ticker:
  ``_fetch_elbstream(ticker)`` downloads 250x250 PNG.
  **Disk-cached:** saved to ``data/logos/{ticker}.png``.
  Subsequent loads read from disk, zero API calls.

- **Fallback:** FMP CDN (``images.financialmodelingprep.com``).

**Monthly usage estimate:** 2-5 calls (only for newly added tickers).

----

Secondary Services (Not in Quota System)
-----------------------------------------

These services are called by the app but not tracked in ``quota_svc``
because they have no hard limits and don't use ``http_client``.

**OpenFIGI** (Bloomberg):

- CUSIP-to-ticker resolution for 13F holdings.
- Rate limit: 25 req/min (unauthenticated).
- Batches of 10 CUSIPs per request.
- Used only during 13F refresh: 100-200 calls per full run.
- Built-in rate limiting: 30s pause every 20 batches.

**Finviz** (finvizfinance library):

- Peer comparison data for Stock Analyzer.
- 1-9 calls per stock (1 for peer list + up to 8 for peer fundamentals).
- Called as background thread during analysis.

----

Quota Enforcement Architecture
------------------------------

.. code-block:: text

   User Action
       |
       v
   Route handler
       |
       v
   service function (e.g. col_api.lookup_or_fetch)
       |
       v  [optional pre-flight check]
   quota_svc.check_quota(provider)  -->  Exhausted? --> Error to user
       |
       v
   http_client._resilient_request()
       |
       v
   _quota_preflight(provider)       -->  Rate-limited? --> Sleep up to 5s
       |                                 Exhausted? --> QuotaExhaustedError
       v
   HTTP request  -->  success/error
       |
       v
   _record_quota(provider)          -->  Increment counter + rate window
       |                                 Save to quota.json
       v
   Return response to caller

**Key rules:**

- Calls are counted on **any HTTP response** (200, 4xx, 5xx, 429) because
  the API provider counts the request regardless of result.
- **Connection failures/timeouts** do NOT count (request never reached API).
- Rate limit sleep is capped at **5 seconds** to avoid blocking the user.
- ``QuotaExhaustedError`` propagates up to the route handler, which returns
  a user-friendly error with remaining quota and reset time.

----

Persistence & Reset
-------------------

**Storage:** ``DATA_DIR/quota.json``

.. code-block:: json

   {
     "fmp":       {"period": "2026-03-13", "used": 0,   "lastCall": null},
     "rapidapi":  {"period": "2026-03",    "used": 149, "lastCall": null},
     "resettle":  {"period": "2026-03",    "used": 34,  "lastCall": "..."}
   }

**Auto-reset rules:**

- **Daily** quotas (FMP): reset when ``period`` differs from today's date.
- **Monthly** quotas (ditno, Resettle): reset when ``period`` differs from
  current ``YYYY-MM``.
- **Rate windows** (EDGAR 10/sec, Resettle 10/hr): in-memory only, pruned
  automatically.  Not persisted (short-lived by nature).

**Important:** Our monthly period resets on the **1st of the month**, but
RapidAPI billing cycles reset on the **subscription date** (e.g. Mar 8 for
ditno, Mar 11 for Resettle).  This means our counter may reset a few days
before the actual billing cycle.  This is conservative -- we may show
slightly more remaining quota than reality near month boundaries.

----

Monthly Cost Summary
--------------------

.. list-table::
   :header-rows: 1
   :widths: 25 15 15 45

   * - Provider
     - Plan
     - Cost
     - Notes
   * - FMP
     - Free
     - $0/mo
     - 250/day is generous for personal use
   * - ditno (RapidAPI)
     - Basic
     - $0/mo
     - 5/mo; Pro ($8/mo) needed for global refresh
   * - Resettle
     - Basic
     - $0/mo
     - 100/mo covers normal on-demand usage
   * - All others
     - Free
     - $0/mo
     - No API keys or paid plans needed

**Total running cost: $0/month** (with annual $8 Pro upgrade for ditno
global refresh if needed).
