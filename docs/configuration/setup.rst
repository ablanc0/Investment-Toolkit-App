Setup & Environment
===================

Data Path Resolution
--------------------

Source: ``config.py:_resolve_data_dir()``

InvToolkit resolves the data directory using a 4-tier fallback:

1. **Environment variable**: ``INVTOOLKIT_DATA_DIR`` -- if set and the path exists.
2. **config.json**: ``config.json`` in the app root with ``{"dataDir": "/path/to/data"}``.
3. **Google Drive auto-detect** (tried in order):

   - macOS: ``~/Library/CloudStorage/GoogleDrive-*/My Drive/Investments/portfolio-app`` (any account)
   - Windows (stream): ``G:/My Drive/Investments/portfolio-app``
   - Windows (mirror): ``~/Google Drive/My Drive/Investments/portfolio-app``

4. **Fallback**: app root directory (for development).

Key File Paths
~~~~~~~~~~~~~~

All paths are relative to the resolved data directory:

- ``portfolio.json`` -- all user data
- ``cache.json`` -- yfinance price cache
- ``analyzer.json`` -- saved stock analyses
- ``13f_history.json`` -- SEC 13F super investor cache

Conda Environment
-----------------

Create and activate the conda environment:

.. code-block:: bash

   conda create -n invapp python=3.13
   conda activate invapp
   pip install flask yfinance openpyxl requests

Running the App
---------------

- **macOS**: ``./start.sh`` or double-click ``InvToolkit.command``
- **Windows**: ``start.bat``
- **Manual**: ``conda run -n invapp python server.py``
- **Default URL**: ``http://localhost:5050``

Environment Variables
---------------------

Copy ``.env.example`` to ``.env`` and fill in your values. The ``.env`` file
is gitignored and never committed.

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``INVTOOLKIT_DATA_DIR``
     - Override data directory path (optional — defaults to Google Drive auto-detect)
   * - ``FMP_API_KEY``
     - Financial Modeling Prep API key (required for stock analysis; get from financialmodelingprep.com)
   * - ``EDGAR_USER_AGENT``
     - SEC EDGAR requires a contact email in the User-Agent header (default: ``InvToolkit user@example.com``)
   * - ``FLASK_DEBUG``
     - Set to ``1`` to enable debug mode (default: ``0`` — disabled)
   * - ``FLASK_HOST``
     - Bind address (default: ``127.0.0.1`` — localhost only)
   * - ``FLASK_PORT``
     - Port number (default: ``5050``)

Security
--------

**Server binding**: The app binds to ``127.0.0.1`` (localhost) by default.
Debug mode is off unless ``FLASK_DEBUG=1`` is set. Never run with debug
enabled on a network-accessible host.

**Secrets**: API keys are loaded from environment variables, not hardcoded
in source. The FMP API key can also be set via the Settings UI in the
dashboard (stored in ``portfolio.json``). The env var serves as a fallback.

**Security headers**: Every response includes:

- ``X-Content-Type-Options: nosniff``
- ``X-Frame-Options: SAMEORIGIN``
- ``X-XSS-Protection: 1; mode=block``
- ``Referrer-Policy: strict-origin-when-cross-origin``

**Input validation**: Ticker symbols are validated against ``^[A-Z0-9.]{1,10}$``
on all routes that accept them. Numeric inputs are checked for NaN, Infinity,
and optional bounds. Invalid input returns HTTP 400.

**XSS prevention**: All user/API-sourced strings rendered in the frontend
are passed through ``escapeHtml()`` before insertion into the DOM.
