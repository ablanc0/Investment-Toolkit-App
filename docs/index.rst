InvToolkit Documentation
========================

InvToolkit is a personal investment dashboard that replaces a Google Sheets
workbook with a Flask + vanilla JS single-page application. It tracks
positions, dividends, watchlists, intrinsic valuations, and retirement
projections — all backed by a single ``portfolio.json`` file stored in
Google Drive.

.. toctree::
   :maxdepth: 1
   :caption: Project

   changelog

.. toctree::
   :maxdepth: 2
   :caption: User Guide

   user/index
   formulas/index
   configuration/setup
   data-management/sync

.. toctree::
   :maxdepth: 2
   :caption: Developer Guide

   dev/index
   architecture/api-abstraction
   architecture/api-quotas
   configuration/cache
   data-management/portfolio-json
   data-management/crud
