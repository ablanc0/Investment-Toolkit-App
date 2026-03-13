Adding & Editing Data
=====================

Source: ``services/data_store.py``

CRUD Pattern
------------

All data modifications go through a generic CRUD helper in ``data_store.py``. Operations are:

1. ``crud_add(section, item)`` -- Append item to the section's array.
2. ``crud_update(section, index, updates)`` -- Merge updates into item at index.
3. ``crud_delete(section, index)`` -- Remove item at index.
4. ``crud_replace(section, data)`` -- Replace entire section array.
5. ``crud_list(section)`` -- Return section contents.

Each operation reads ``portfolio.json``, modifies in memory, and writes back atomically.

Via the Dashboard UI
--------------------

- **Positions**: Add/edit via modal form. Fields: ticker, shares, avgCost, sector, category,
  secType. Delete with trash icon.
- **Watchlist**: Add/edit via modal. Fields: ticker, notes, category. Delete with trash icon.
- **Dividend Log**: Add monthly entries. Fields: year, month, per-ticker amounts.
- **Monthly Data**: Add monthly snapshots. Fields: year, month, contributions, portfolioValue.
- **Strategy Notes**: Free-text notes added via text input.
- **Goals**: Set portfolio target, dividend target, max holdings via settings.
- **Salary**: Multi-profile salary configuration with income streams and tax rates.
- **Intrinsic Values**: Saved automatically from Stock Analyzer's "Save to IV List" button.

Via API
-------

All endpoints accept and return JSON. CRUD routes follow RESTful patterns:

- ``GET /api/<section>`` -- list items
- ``POST /api/<section>/add`` -- add item
- ``PUT /api/<section>/update/<index>`` -- update item
- ``DELETE /api/<section>/delete/<index>`` -- delete item
