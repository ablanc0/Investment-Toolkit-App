Super Investors (13F) — Developer Architecture
===============================================

Internal architecture of the 13F filing pipeline: SEC EDGAR integration,
CUSIP resolution, history management, and cross-investor analytics.

.. contents::
   :local:
   :depth: 2

----

Data Model
----------

Investor Registry
^^^^^^^^^^^^^^^^^

``config.SUPER_INVESTORS`` — dict of 22 investors, each with ``cik``
(zero-padded 10-digit), ``fund`` name, and ``note``.  The dict key
(investor name) is the canonical identifier used in URLs, history
keys, and frontend state.

History File
^^^^^^^^^^^^

``13f_history.json`` in the Google Drive data directory.  Schema:

.. code-block:: json

   {
     "Greg Abel": {
       "fund": "Berkshire Hathaway",
       "cik": "0001067983",
       "quarters": [
         {
           "quarter": "Q4 2025",
           "filingDate": "2026-02-14",
           "totalValue": 294837200000,
           "holdingsCount": 42,
           "top10pct": 86.3,
           "holdings": [
             {
               "cusip": "037833100",
               "name": "Apple Inc",
               "value": 65000000000,
               "shares": 300000000,
               "putCall": "",
               "ticker": "AAPL",
               "pctPortfolio": 22.04
             }
           ]
         }
       ]
     }
   }

- ``value`` is in actual dollars (normalized from SEC thousands format).
- ``quarters`` is ordered most-recent-first (index 0 = current).
- Each quarter is self-contained with full holdings array.
- ``putCall`` distinguishes options from equity positions.

----

Pipeline Flow
-------------

.. code-block:: text

   _fetch_investor_13f(investor_key)
     │
     ├── Step 1: _fetch_13f_latest(cik)
     │     GET data.sec.gov/submissions/CIK{cik}.json
     │     → Find first "13F-HR" (prefer original over amendment)
     │     → Returns {accession, filingDate, reportDate}
     │
     ├── Step 2: _fetch_13f_infotable(cik, accession)
     │     GET sec.gov/Archives/edgar/data/{cik}/{acc}/
     │     → Parse HTML index, find XML file (prefer "infotable")
     │     → Fetch the XML content
     │
     ├── Step 3: _parse_13f_xml(xml_string)
     │     → Extract holdings from SEC XML namespace
     │     → Aggregate by CUSIP (sum value + shares)
     │     → Auto-detect value units (median price < $1 → multiply ×1000)
     │
     ├── Step 4: _resolve_cusips_to_tickers(holdings)
     │     → Check _cusip_ticker_cache (module-level, shared)
     │     → POST api.openfigi.com/v3/mapping (batches of 10)
     │     → Prefer US exchange matches
     │     → Retry unresolved CINS codes (foreign CUSIPs)
     │     → Fallback: raw CUSIP string as ticker
     │
     └── Step 5: Assemble + persist
           → Sort by value, compute pctPortfolio, top10pct
           → _derive_quarter(reportDate, filingDate)
           → _append_to_history() (upsert with quality guard)
           → _save_13f_history()

Batch Refresh
^^^^^^^^^^^^^

``POST /api/super-investors/13f-all`` launches a background daemon
thread that iterates all 22 investors **sequentially** (SEC rate
limit: 10 req/sec enforced via 0.15s sleep per request).  Progress
is tracked in ``_13f_progress`` dict, polled by the frontend every
2 seconds.

----

CUSIP Resolution
----------------

CUSIPs are security identifiers, not stock tickers.  Resolution uses
OpenFIGI's free unauthenticated API (25 req/min, batches of 10).

1. Check ``_cusip_ticker_cache`` (module-level, persists within session)
2. Batch POST to OpenFIGI with ``ID_CUSIP``
3. Prefer ``exchCode == "US"`` results
4. Retry CUSIPs starting with a letter as ``ID_CINS`` (foreign securities)
5. Rate limit: 30-second pause every 20 batches

The cache is shared across investors within a "Refresh All" run,
eliminating redundant lookups for commonly-held stocks.

----

Key Functions
-------------

``services/edgar_13f.py``
^^^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Function
     - Purpose
   * - ``_load_13f_history()``
     - Startup: loads ``13f_history.json``, runs key migration
       and sanitization.
   * - ``_sanitize_13f_history()``
     - Removes anomalous quarters (holdings < 10% of median,
       or value > 100× median).
   * - ``_fetch_investor_13f(investor_key)``
     - Full pipeline entry point for one investor.
   * - ``_fetch_13f_latest(cik)``
     - Finds most recent 13F-HR filing from EDGAR submissions.
   * - ``_fetch_13f_infotable(cik, acc_clean, acc_raw)``
     - Downloads infoTable XML from filing archive.
   * - ``_parse_13f_xml(xml_string)``
     - Parses holdings, aggregates by CUSIP, auto-detects units.
   * - ``_resolve_cusips_to_tickers(holdings)``
     - Orchestrates OpenFIGI resolution with caching and CINS retry.
   * - ``_append_to_history(investor_key, result)``
     - Upsert with quality guard (more holdings wins).
   * - ``_derive_quarter(report_date, filing_date)``
     - Maps dates to "Q1 YYYY" format with filing-date fallback.
   * - ``_get_current_quarter_label()``
     - Majority vote across all investors for the "current" quarter.

----

API Endpoints
-------------

.. list-table::
   :header-rows: 1
   :widths: 10 40 50

   * - Method
     - Path
     - Description
   * - GET
     - ``/api/super-investors``
     - List all investors with cache status.
   * - GET
     - ``/api/super-investors/13f/<key>``
     - Latest holdings (from history, no fresh fetch).
   * - POST
     - ``/api/super-investors/13f-all``
     - Start background batch fetch for all investors.
   * - GET
     - ``/api/super-investors/13f-progress``
     - Poll background batch progress.
   * - POST
     - ``/api/super-investors/overlap``
     - Ticker overlap across selected investors.
   * - GET
     - ``/api/super-investors/most-popular``
     - Top 50 most-held stocks (quarter-synchronized).
   * - GET
     - ``/api/super-investors/history/<key>``
     - Quarterly summary (no holdings) for chart.
   * - GET
     - ``/api/super-investors/activity/<key>``
     - Quarter-over-quarter diff (buys/sells/changes).
   * - POST
     - ``/api/super-investors/prices``
     - Batch price fetch for up to 50 tickers.
   * - GET
     - ``.../holding-history/<key>/<ticker>``
     - Per-holding value/shares/pct across all quarters.

----

Design Decisions
----------------

**History-first reads.**
Single-investor GET returns cached history immediately.  Fresh EDGAR
fetches only happen via explicit "Refresh All".

**Sequential batch, not parallel.**
SEC rate limit (10 req/sec) makes parallel fetches risky.  The 0.15s
sleep per request is enforced in ``_edgar_request()``.

**Best-filing-wins upsert.**
When the same quarter exists in history, the filing with more holdings
replaces the stored one.  Amendments with fewer positions are ignored.

**Quarter label consensus.**
Most-popular aggregation only includes investors whose latest quarter
matches the majority label.  Prevents mixing stale and fresh data.

**Auto-sanitization on startup.**
``_sanitize_13f_history()`` detects and removes anomalous quarters
(partial amendments, wrong unit scale) using median-based thresholds.

**Value unit auto-detection.**
The SEC requires values in thousands, but some filers report actual
dollars.  Detection: if median implied price < $1, values are
multiplied by 1000.

----

See Also
--------

* :doc:`/architecture/api-quotas` — API quota management
* :doc:`/architecture/api-abstraction` — Resilient HTTP and circuit breakers
