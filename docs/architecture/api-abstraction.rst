API Abstraction & Provider Cascade
==================================

Source files:

- ``services/stock_data.py`` -- orchestrator
- ``services/http_client.py`` -- resilient HTTP client
- ``services/contracts.py`` -- data contracts

.. contents::
   :local:
   :depth: 2

----

Overview
--------

InvToolkit fetches financial data from seven external providers:

.. list-table::
   :header-rows: 1
   :widths: 20 40 40

   * - Provider
     - Service File
     - Data Domain
   * - SEC EDGAR
     - ``services/edgar.py``
     - Financial statements (XBRL)
   * - FMP
     - ``services/fmp.py``
     - Financials, Graham inputs, FRED AAA yield
   * - yfinance
     - ``services/yfinance_svc.py``
     - Quotes, dividends, profile, fallback financials
   * - Finviz
     - ``services/finviz_svc.py``
     - Peer comparison
   * - SEC EDGAR 13F
     - ``services/edgar_13f.py``
     - Super investor holdings
   * - FRED
     - ``services/fmp.py``
     - AAA corporate bond yield (via FMP)
   * - yfinance (quotes)
     - ``services/yfinance_svc.py``
     - Real-time quotes for portfolio/watchlist

The API abstraction layer decouples the application from specific providers,
enabling swaps without changing routes or models.  Three components make this
possible:

1. **Stock Data Orchestrator** (``services/stock_data.py``) -- provider-agnostic
   entry point with a configurable cascade.
2. **Resilient HTTP Client** (``services/http_client.py``) -- retry, circuit
   breaker, and automatic health recording.
3. **Data Contracts** (``services/contracts.py``) -- canonical field names and
   validation helpers so all providers produce the same shapes.

----

Architecture Diagram
--------------------

::

   Routes (analysis.py, portfolio.py)
     |
     v
   Stock Data Orchestrator (services/stock_data.py)
     |  configurable cascade
     v
   Provider Registry (_PROVIDERS)
     +-- edgar    --> services/edgar.py
     +-- fmp      --> services/fmp.py
     +-- yfinance --> services/yfinance_svc.py
     |
     v
   Resilient HTTP Client (services/http_client.py)
     +-- Retry (2x exponential backoff)
     +-- Circuit Breaker (per-provider)
     +-- Auto API Health Recording

----

Provider Registry
-----------------

The ``_PROVIDERS`` dict in ``services/stock_data.py`` maps each provider name
to its fetch function and circuit breaker identifier:

.. code-block:: python

   _PROVIDERS = {
       "edgar":    {"fetch": _try_edgar,    "circuit": "edgar"},
       "fmp":      {"fetch": _try_fmp,      "circuit": "fmp"},
       "yfinance": {"fetch": _try_yfinance, "circuit": None},
   }

Each fetch function has the same signature:

.. code-block:: python

   def _try_<provider>(ticker, yf_info):
       """
       Returns: (info, income, cashflow, balance, source_label)
                or None if provider has no data.
       """

- ``ticker`` -- uppercase ticker symbol (e.g. ``"AAPL"``).
- ``yf_info`` -- the raw yfinance ``info`` dict, fetched once and shared
  across all providers.
- ``circuit`` -- the circuit breaker name passed to ``is_circuit_open()``.
  Set to ``None`` for providers that do not use the HTTP client (yfinance
  manages its own connections).

The orchestrator calls ``fetch_stock_analysis(ticker)`` which:

1. Fetches the yfinance profile (always, for pricing/beta/analyst data).
2. Iterates through ``_get_cascade_order()`` and tries each provider.
3. Skips providers whose circuit breaker is open.
4. Returns the first successful result, or yfinance profile-only on total failure.

----

Configuration
-------------

Default Provider Order
^^^^^^^^^^^^^^^^^^^^^^

``config.py`` defines ``PROVIDER_DEFAULTS`` with cascade orders per data domain:

.. code-block:: python

   PROVIDER_DEFAULTS = {
       "financials": ["edgar", "fmp", "yfinance"],
       "quotes":     ["yfinance"],
       "benchmarks": ["fmp"],
       "peers":      ["finviz"],
       "dividends":  ["yfinance"],
   }

User Override
^^^^^^^^^^^^^

Users can override the cascade order through the Settings UI.  Overrides are
stored in ``portfolio.json`` under the ``settings.providerConfig`` key.

.. code-block:: json

   {
     "settings": {
       "providerConfig": {
         "financials": ["fmp", "edgar", "yfinance"]
       }
     }
   }

The orchestrator reads this at runtime via ``get_settings()`` and filters
out any provider names that are not in ``_PROVIDERS``.  If no override
is configured, the default from ``PROVIDER_DEFAULTS`` is used.

.. note::

   Only the ``financials`` cascade is currently consumed by the Stock Data
   Orchestrator.  The other domains (``quotes``, ``benchmarks``, ``peers``,
   ``dividends``) are reserved for future use.

----

Adding a New Provider
---------------------

Four steps, no route or model changes required:

1. **Create the service module** -- ``services/<provider>_svc.py``.

   Implement a fetch function with the standard signature:

   .. code-block:: python

      def _try_myprovider(ticker, yf_info):
          """Fetch financial data from MyProvider.

          Returns:
              tuple: (info, income, cashflow, balance, source_label)
                     or None if data is unavailable.
          """
          # info:     dict matching INFO_FIELDS shape
          # income:   {"2024": {"Pretax Income": ..., ...}, ...}
          # cashflow: {"2024": {"Operating Cash Flow": ..., ...}, ...}
          # balance:  {"2024": {"Total Debt": ..., ...}, ...}
          ...

   Use ``validate_info()`` and ``validate_financials()`` from
   ``services/contracts.py`` to ensure the output matches the expected shape.

2. **Register in the provider registry** -- add an entry to ``_PROVIDERS``
   in ``services/stock_data.py``:

   .. code-block:: python

      _PROVIDERS = {
          "edgar":      {"fetch": _try_edgar,      "circuit": "edgar"},
          "fmp":        {"fetch": _try_fmp,        "circuit": "fmp"},
          "myprovider": {"fetch": _try_myprovider, "circuit": "myprovider"},
          "yfinance":   {"fetch": _try_yfinance,   "circuit": None},
      }

3. **Add to default cascade** -- include the provider name in
   ``PROVIDER_DEFAULTS["financials"]`` in ``config.py``:

   .. code-block:: python

      PROVIDER_DEFAULTS = {
          "financials": ["edgar", "fmp", "myprovider", "yfinance"],
          ...
      }

4. **Done** -- no routes or models need changes.  The orchestrator will
   automatically try the new provider in cascade order, and valuation models
   consume the same ``info`` / ``income`` / ``cashflow`` / ``balance`` dicts
   regardless of source.

----

Resilient HTTP Client
---------------------

Source: ``services/http_client.py``

The resilient HTTP client provides ``resilient_get()`` and ``resilient_post()``
as drop-in replacements for ``requests.get()`` and ``requests.post()``.  All
external HTTP calls in EDGAR and FMP services use these functions.

Public API
^^^^^^^^^^

.. code-block:: python

   from services.http_client import resilient_get, resilient_post

   # Basic usage
   resp = resilient_get(url, provider="edgar", headers=headers)

   # Custom retry count and timeout
   resp = resilient_post(url, provider="fmp", json=payload,
                         timeout=30, max_retries=3)

Both functions return a ``requests.Response`` on success and raise on
permanent failure.

Retry Logic
^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Parameter
     - Behaviour
   * - Max retries
     - 2 (total of 3 attempts)
   * - Backoff
     - Exponential: 1 s, 2 s
   * - HTTP 429
     - Waits 10 s before retry
   * - HTTP 5xx
     - Retried with exponential backoff
   * - HTTP 4xx (except 429)
     - Not retried (client error)
   * - Connection / Timeout errors
     - Retried with exponential backoff
   * - Default timeout
     - 15 s per request

Circuit Breaker
^^^^^^^^^^^^^^^

Each provider has an independent circuit breaker with three states:

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - State
     - Behaviour
   * - **Closed**
     - Normal operation; requests proceed.
   * - **Open**
     - All requests are blocked immediately (raises ``ConnectionError``).
   * - **Half-open**
     - One probe request is allowed.  Success closes the circuit;
       failure re-opens it.

Circuit breaker parameters:

.. list-table::
   :header-rows: 1
   :widths: 40 20

   * - Parameter
     - Value
   * - Failure threshold
     - 3 consecutive failures
   * - Failure window
     - 300 s (5 min)
   * - Open duration (cooldown)
     - 60 s
   * - Half-open probe
     - 1 request

Failures outside the 5-minute window reset the counter.  After 60 seconds
in the open state, the circuit transitions to half-open and allows a single
probe request.

Auto Health Recording
^^^^^^^^^^^^^^^^^^^^^

When a ``provider`` name is passed to ``resilient_get()`` or
``resilient_post()``, the client automatically calls
``services.api_health.record_api_call()`` after every request with:

- ``provider`` -- provider name
- ``success`` -- boolean
- ``latency_ms`` -- request duration in milliseconds
- ``error_msg`` -- truncated error description (on failure)

This drives the API health dashboard without any manual instrumentation
in service code.

----

Data Contracts
--------------

Source: ``services/contracts.py``

Data contracts define the canonical field names that all provider transforms
must produce.  Consumers (valuation models, routes, frontend) rely on these
shapes rather than any provider-specific fields.

QUOTE_FIELDS (17 fields)
^^^^^^^^^^^^^^^^^^^^^^^^

Used for portfolio and watchlist display.  Produced by
``yfinance_svc.fetch_ticker_data()``.

.. list-table::
   :header-rows: 1
   :widths: 30 15 55

   * - Field
     - Default
     - Description
   * - ``price``
     - 0
     - Current or last traded price
   * - ``previousClose``
     - 0
     - Previous session close
   * - ``changePercent``
     - 0
     - Intraday change (%)
   * - ``name``
     - ``""``
     - Company / ETF long name
   * - ``marketCap``
     - 0
     - Market capitalisation (USD)
   * - ``pe``
     - 0
     - Trailing P/E ratio
   * - ``forwardPE``
     - 0
     - Forward P/E ratio
   * - ``sector``
     - ``""``
     - GICS sector
   * - ``industry``
     - ``""``
     - GICS industry
   * - ``divYield``
     - 0
     - Dividend yield (%), 0.39 = 0.39 %
   * - ``divRate``
     - 0
     - Annual dividend per share (USD)
   * - ``beta``
     - 0
     - 5-year beta vs S&P 500
   * - ``fiftyTwoWeekHigh``
     - 0
     - 52-week high
   * - ``fiftyTwoWeekLow``
     - 0
     - 52-week low
   * - ``targetMeanPrice``
     - 0
     - Analyst consensus target price
   * - ``country``
     - ``""``
     - Domicile country
   * - ``currency``
     - ``"USD"``
     - Trading currency

INFO_FIELDS (54 fields)
^^^^^^^^^^^^^^^^^^^^^^^

Deep fundamentals for valuation models and the Stock Analyzer.  Produced by
``_edgar_to_info()`` and ``_fmp_to_info()`` (both overlay yfinance profile
data).  This is a superset -- ``validate_info()`` fills missing keys but
never strips extra keys, so yfinance-only fields like ``pegRatio`` and
``shortRatio`` remain available.

Fields are grouped into categories:

- Price & identity (8 fields)
- Market data (5 fields)
- Per-share metrics (4 fields)
- Valuation ratios (7 fields)
- Profitability margins (3 fields)
- Returns (2 fields)
- Growth (2 fields)
- Balance sheet (5 fields)
- Cash flow (3 fields)
- Dividends (4 fields)
- Analyst estimates (5 fields)
- Technical (6 fields)

See ``services/contracts.py`` for the full field listing with defaults and
inline comments.

FINANCIAL_FIELDS
^^^^^^^^^^^^^^^^

Year-keyed financial statement field names consumed by valuation models.
Keys are the exact strings used in year-keyed dicts
(e.g. ``income["2024"]["Pretax Income"]``).

.. list-table::
   :header-rows: 1
   :widths: 20 35 45

   * - Statement
     - Field
     - Description
   * - Income
     - ``Pretax Income``
     - Income before taxes
   * - Income
     - ``Tax Provision``
     - Income tax expense
   * - Income
     - ``Interest Expense``
     - Interest expense
   * - Cashflow
     - ``Operating Cash Flow``
     - Cash from operations
   * - Cashflow
     - ``Capital Expenditure``
     - Capex (negative = outflow)
   * - Balance
     - ``Total Debt``
     - Total debt
   * - Balance
     - ``Cash And Cash Equivalents``
     - Cash & equivalents
   * - Balance
     - ``Stockholders Equity``
     - Total stockholders' equity

.. note::

   Capital Expenditure: EDGAR reports capex as positive (payments for
   property, plant & equipment).  The EDGAR transform negates it so all
   providers deliver negative capex following the cash outflow convention.

Validation Helpers
^^^^^^^^^^^^^^^^^^

.. code-block:: python

   from services.contracts import validate_quote, validate_info, validate_financials

   # Strict shape — drops extra keys, fills missing with defaults
   quote = validate_quote(raw_data)

   # Permissive — fills missing INFO_FIELDS, preserves extra keys
   info = validate_info(raw_data)

   # Per-year financial statement validation
   year = validate_financials(year_dict, "income")    # or "cashflow", "balance"

- ``validate_quote()`` -- strict.  Returns exactly the 17 ``QUOTE_FIELDS``
  keys; extra keys are dropped.
- ``validate_info()`` -- permissive.  Fills missing ``INFO_FIELDS`` defaults
  but preserves any additional keys (e.g. ``pegRatio``, ``shortRatio``).
- ``validate_financials()`` -- fills missing fields for a single year's
  financial statement dict.

.. note::

   **Dividend yield convention**: yfinance 1.2+ returns ``dividendYield`` as a
   direct percentage -- 0.39 means 0.39 %, **not** a decimal.  Both
   ``QUOTE_FIELDS`` (``divYield``) and ``INFO_FIELDS`` (``dividendYield``)
   follow this convention.  Do **not** multiply by 100.

----

Data Source Cascade
-------------------

The default cascade order for financial statements is:

::

   EDGAR --> FMP --> yfinance

Flow
^^^^

1. **yfinance profile** is always fetched first (free, unlimited).  It provides
   pricing, beta, analyst targets, and other fields that are not available from
   statement-only providers.  If no current price is found, the ticker is
   considered invalid and the orchestrator returns ``None``.

2. **EDGAR** is tried first for financial statements.  SEC XBRL data is
   free, authoritative, and covers US-listed companies.  If EDGAR returns no
   income or cashflow data (e.g. foreign ADR, recently listed), the next
   provider is tried.

3. **FMP** is the second choice.  It provides good coverage including
   international stocks, but requires an API key and has rate limits.

4. **yfinance** is the last resort for financial statements.  It works for
   any ticker yfinance can resolve (including foreign ADRs) but has less
   structured data.

Circuit Breaker Skip Logic
^^^^^^^^^^^^^^^^^^^^^^^^^^

Before trying a provider, the orchestrator checks ``is_circuit_open()``.
If a provider's circuit is open (e.g. EDGAR had 3 consecutive failures
within 5 minutes), it is skipped entirely and the next provider in the
cascade is tried.  This prevents wasting time on a provider that is known
to be down.

After the 60-second cooldown, the circuit transitions to half-open and
allows a single probe request.  If the probe succeeds, the circuit closes
and the provider is fully available again.

Fallback Behaviour
^^^^^^^^^^^^^^^^^^

If all providers fail, the orchestrator returns the yfinance profile with
empty financial statement dicts:

.. code-block:: python

   {
       "info": {<yfinance profile fields>},
       "income": {},
       "cashflow": {},
       "balance": {},
       "data_source": "Yahoo Finance (profile only)",
   }

This allows the Stock Analyzer to display basic stock information (price,
market cap, analyst targets) even when financial statements are unavailable.
Valuation models will skip calculations that require statement data.
