Setup & Environment
===================

Data Path Resolution
--------------------

Source: ``config.py:_resolve_data_dir()``

InvToolkit resolves the data directory using a 4-tier fallback:

1. **Environment variable**: ``INVTOOLKIT_DATA_DIR`` -- if set and the path exists.
2. **config.json**: ``config.json`` in the app root with ``{"dataDir": "/path/to/data"}``.
3. **Google Drive auto-detect** (tried in order):

   - macOS: ``~/Library/CloudStorage/GoogleDrive-<email>/My Drive/Investments/portfolio-app``
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

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``INVTOOLKIT_DATA_DIR``
     - Override data directory path
   * - ``FMP_API_KEY``
     - Financial Modeling Prep API key (default provided in ``config.py``)
