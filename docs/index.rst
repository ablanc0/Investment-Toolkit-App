InvToolkit Documentation
========================

InvToolkit is a personal investment dashboard that replaces a Google Sheets
workbook with a Flask + vanilla JS single-page application. It tracks
positions, dividends, watchlists, intrinsic valuations, and retirement
projections — all backed by a single ``portfolio.json`` file stored in
Google Drive.

This documentation covers every formula, metric, and configuration option
so that calculations can be audited, reproduced, and maintained
independently of the source code.

.. toctree::
   :maxdepth: 1
   :caption: Project

   changelog

.. toctree::
   :maxdepth: 2
   :caption: Contents

   user/index
   formulas/index
   architecture/api-abstraction
   architecture/api-quotas
   dev/index
   configuration/index
   data-management/index
