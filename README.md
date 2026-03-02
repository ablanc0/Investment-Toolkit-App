# InvToolkit — Investment Dashboard

A personal investment portfolio dashboard that pulls live market data from Yahoo Finance.

## Quick Start

### macOS
```bash
# Clone and run
git clone <your-repo-url>
cd InvToolkit
./start.sh
```
Or double-click `Portfolio Dashboard.command`.

### Windows
```
git clone <your-repo-url>
cd InvToolkit
start.bat
```

## Data Storage

The app reads/writes `portfolio.json` for all your data. By default it looks for data in your Google Drive:
- **macOS:** `~/Library/CloudStorage/GoogleDrive-<email>/My Drive/Investments/portfolio-app/`
- **Windows:** `G:/My Drive/Investments/portfolio-app/`

This means your data syncs automatically between machines via Google Drive.

### Custom data location
Create a `config.json` in the app folder:
```json
{
  "dataDir": "/path/to/your/data/folder"
}
```
Or set the environment variable `INVTOOLKIT_DATA_DIR`.

## Requirements
- Python 3.8+
- Dependencies: `pip install -r requirements.txt`

## Tech Stack
- **Backend:** Flask + yfinance
- **Frontend:** Vanilla HTML/CSS/JS + Chart.js
- **Data:** Local JSON (synced via cloud storage)
