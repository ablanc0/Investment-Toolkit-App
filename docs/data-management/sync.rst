Google Drive Sync & Backups
===========================

Google Drive Sync
-----------------

InvToolkit stores ``portfolio.json`` in Google Drive, which syncs automatically across
devices. However:

- **Single-machine editing**: Do not run InvToolkit on two machines simultaneously. Google
  Drive sync can cause write conflicts, potentially corrupting ``portfolio.json``.
- **Sync delay**: After saving data, wait for Google Drive to sync before opening on another
  machine. Check the Google Drive icon for sync status.

Backup Recommendations
----------------------

1. **Automatic**: Google Drive maintains version history. Right-click ``portfolio.json`` in
   the Google Drive web UI to view or restore previous versions.

2. **Manual**: Periodically copy ``portfolio.json`` to a separate location:

   .. code-block:: bash

      cp portfolio.json portfolio-backup-$(date +%Y%m%d).json

3. **Before major changes**: Always back up before running data migrations or importing new
   data.

No Authentication
-----------------

InvToolkit has no user authentication. It is designed as a personal, local-only tool. Do not
expose port 5050 to the internet.

Data Portability
----------------

Since all data lives in a single JSON file, moving to a new machine is straightforward:

1. Install InvToolkit on the new machine.
2. Set up the conda environment.
3. Point ``INVTOOLKIT_DATA_DIR`` to the data directory (or use Google Drive auto-detect).
