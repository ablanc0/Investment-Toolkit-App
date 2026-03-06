Cache Behavior
==============

Source: ``services/cache.py``

Architecture
------------

- In-memory Python dict with TTL-based expiration.
- Thread-safe via ``threading.Lock()``.
- Persisted to ``cache.json`` on disk after every write.

TTL
---

5 minutes (300 seconds), configured in ``config.py`` as ``CACHE_TTL``.

Cache Operations
----------------

- ``cache_get(key)``: Returns cached data if it exists and has not expired, else ``None``.
- ``cache_set(key, data)``: Stores data with the current timestamp and writes to disk immediately.

Cache Check
~~~~~~~~~~~

.. code-block:: python

   if (current_time - entry_timestamp) < 300:  # seconds
       # cache hit

What Gets Cached
----------------

- yfinance stock quotes (per-ticker)
- yfinance dividend history
- Market status checks

Clearing the Cache
------------------

Two options:

1. Delete ``cache.json`` from the data directory.
2. Restart the server -- the disk cache is reloaded on startup via ``load_disk_cache()``.

Thread Safety
-------------

All cache reads and writes are protected by a global ``threading.Lock()``, ensuring safe
access from Flask's threaded request handling.
