"""
Batch-download ticker logos from Elbstream API.

Collects tickers from:
  - S&P 500 (Wikipedia)
  - Popular ETFs (hardcoded comprehensive list)
  - Popular REITs
  - Additional large-caps / well-known stocks

Usage:
    python scripts/download_logos.py          # download all missing
    python scripts/download_logos.py --force   # re-download everything
"""

import sys, time, json
from pathlib import Path
from urllib.request import urlopen, Request
from concurrent.futures import ThreadPoolExecutor, as_completed

LOGO_DIR = Path(__file__).resolve().parent.parent / "logos"
API = "https://api.elbstream.com/logos/symbol"
BATCH_SIZE = 50
DELAY_BETWEEN_BATCHES = 2  # seconds


def get_sp500_tickers():
    """Fetch S&P 500 tickers from Wikipedia."""
    try:
        url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
        req = Request(url, headers={"User-Agent": "InvToolkit/1.0"})
        html = urlopen(req, timeout=15).read().decode()
        # Parse ticker symbols from the table (first column after <td>)
        tickers = []
        in_table = False
        for line in html.split("\n"):
            if "id=\"constituents\"" in line or "S&P 500 component stocks" in line:
                in_table = True
            if in_table and '<a rel="nofollow"' in line and "class=\"external text\"" in line:
                # Extract ticker from links like NYSE: AAPL
                pass
            if in_table and 'title="NYSE:' in line or 'title="NASDAQ:' in line:
                # Try to find ticker in href
                pass
        # Simpler regex approach
        import re
        # Find all rows in the constituents table
        table_match = re.search(r'id="constituents".*?</table>', html, re.DOTALL)
        if table_match:
            table = table_match.group()
            # Each row's first cell has the ticker
            rows = re.findall(r'<tr>.*?</tr>', table, re.DOTALL)
            for row in rows:
                cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
                if cells:
                    # First cell contains ticker, may be wrapped in <a> tag
                    ticker_html = cells[0].strip()
                    ticker_match = re.search(r'>([A-Z.]+)<', ticker_html)
                    if ticker_match:
                        t = ticker_match.group(1).replace(".", "-")
                        tickers.append(t)
                    elif re.match(r'^[A-Z.]+$', ticker_html):
                        tickers.append(ticker_html.replace(".", "-"))
        print(f"  S&P 500: {len(tickers)} tickers")
        return tickers
    except Exception as e:
        print(f"  S&P 500 fetch failed: {e}")
        return []


# Comprehensive ETF list — major issuers, popular by AUM
ETFS = [
    # Vanguard
    "VOO", "VTI", "VGT", "VIG", "VXUS", "BND", "VEA", "VWO", "VNQ", "VYM",
    "VTIP", "VTV", "VUG", "VO", "VB", "VCSH", "VCIT", "VGSH", "VGIT", "VGLT",
    "VT", "VTEB", "BNDX", "VSS", "VXF", "MGK", "MGV", "VOE", "VOT", "VBR",
    "VBK", "VONV", "VONG", "VONE", "EDV", "VMBS",
    # iShares / BlackRock
    "IVV", "AGG", "IEFA", "IEMG", "IJH", "IJR", "IWM", "IWF", "IWD", "EFA",
    "EEM", "TIP", "LQD", "HYG", "IEF", "TLT", "SHY", "MBB", "GOVT", "IGSB",
    "IGIB", "EMB", "DVY", "HDV", "DGRO", "QUAL", "MTUM", "USMV", "EFAV",
    "ACWI", "ITOT", "IXUS", "IYR", "REET", "ICLN", "SOXX",
    # SPDR / State Street
    "SPY", "GLD", "XLF", "XLK", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU",
    "XLB", "XLRE", "XLC", "MDY", "SLY", "SPYG", "SPYV", "SDY", "SPDW", "SPEM",
    "SPTS", "SPIB", "SPLG", "SPTM", "SPAB",
    # Schwab
    "SCHD", "SCHX", "SCHB", "SCHF", "SCHE", "SCHG", "SCHV", "SCHA", "SCHH",
    "SCHZ", "SCHR", "SCHP", "SCHC", "SCHM", "SCHO",
    # Invesco
    "QQQ", "QQQM", "RSP", "SPLV", "PGX", "BKLN", "PHB",
    # ARK
    "ARKK", "ARKW", "ARKG", "ARKF", "ARKQ", "ARKX",
    # Other popular
    "DIA", "IWN", "IWO", "IWP", "IWS", "VEU", "VNQI",
    "SOXQ", "KWEB", "MCHI", "FXI", "VPL", "AAXJ",
    "SCHP", "STIP", "VTIP", "TIPS",
    "JEPI", "JEPQ", "DIVO", "NUSI",
    "COWZ", "AVUV", "AVLV", "DFAC", "DFAS", "DFAT", "DFUS", "DFIV",
    "VDE", "FENY", "IYE", "OIH",
    "TQQQ", "SQQQ", "UPRO", "SPXU", "SOXL",
    "IAU", "SLV", "PDBC", "DBC", "GSG", "PALL",
    "BITO", "IBIT", "FBTC",
    "FDN", "SKYY", "CLOU", "CIBR", "BUG", "HACK",
    "BOTZ", "ROBO", "AIQ",
    "SPHD", "NOBL", "VPC", "SPYD", "SCHD",
    "PFF", "PFFD",
]

# Popular REITs
REITS = [
    "O", "VICI", "AMT", "PLD", "CCI", "EQIX", "PSA", "DLR", "SPG", "WELL",
    "AVB", "EQR", "ARE", "MAA", "UDR", "ESS", "CPT", "INVH", "SUI", "ELS",
    "STOR", "NNN", "WPC", "STAG", "ADC", "EPRT", "BNL", "GTY",
    "CUBE", "EXR", "LSI", "NSA", "REXR",
    "IRM", "SBAC", "UNIT",
    "MPW", "PEAK", "VTR", "OHI", "HR", "DOC",
    "KIM", "REG", "FRT", "BRX", "SITC",
    "HST", "RHP", "PK", "SHO",
    "BXP", "VNO", "SLG", "KRC", "HIW", "DEI", "CUZ",
]

# Additional large-caps / popular stocks not in S&P 500
ADDITIONAL = [
    # Mega-caps (in case Wikipedia fails)
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK-A", "BRK-B",
    "UNH", "JNJ", "JPM", "V", "PG", "MA", "HD", "CVX", "MRK", "ABBV",
    "KO", "PEP", "AVGO", "COST", "LLY", "WMT", "MCD", "CSCO", "TMO", "ACN",
    "ABT", "DHR", "NEE", "PM", "TXN", "RTX", "HON", "UNP", "LOW", "UPS",
    "INTC", "AMD", "QCOM", "IBM", "ORCL", "CRM", "NOW", "ADBE", "INTU", "SNOW",
    "PLTR", "SHOP", "SQ", "PYPL", "COIN", "HOOD", "SOFI", "AFRM", "UPST",
    "DIS", "NFLX", "CMCSA", "T", "VZ", "TMUS", "CHTR",
    "BA", "GE", "CAT", "DE", "MMM", "EMR", "ITW", "ROK",
    "AXP", "GS", "MS", "C", "BAC", "WFC", "USB", "PNC", "TFC", "SCHW",
    "BLK", "ICE", "CME", "MCO", "SPGI", "MSCI", "NDAQ",
    "XOM", "COP", "EOG", "SLB", "OXY", "MPC", "VLO", "PSX",
    "LIN", "APD", "SHW", "ECL", "DD", "DOW", "FCX", "NEM",
    "PFE", "BMY", "GILD", "AMGN", "BIIB", "REGN", "VRTX", "MRNA", "ISRG",
    "CI", "ELV", "HUM", "CNC", "MCK", "CAH",
    "NKE", "SBUX", "TGT", "TJX", "ROST", "DG", "DLTR", "LULU",
    "ABNB", "BKNG", "MAR", "HLT", "EXPE", "LYV", "WYNN", "MGM",
    "CMG", "DPZ", "YUM", "MCD", "SBUX", "QSR",
    "ZTS", "IDXX", "DXCM", "VEEV", "CDNS", "SNPS", "ANSS", "KEYS",
    "PANW", "CRWD", "ZS", "FTNT", "NET", "DDOG", "MDB", "TEAM",
    "UBER", "LYFT", "DASH", "GRAB",
    "F", "GM", "RIVN", "LCID", "NIO", "LI", "XPEV",
    "WM", "RSG", "WCN",
    "MO", "PM", "BTI", "STZ", "BF-B", "DEO", "SAM",
    "EPD", "ET", "KMI", "OKE", "WMB", "MPLX",
    "GOLD", "AEM", "WPM", "FNV",
    "TPL", "TXRH", "CAVA", "WING", "SHAK",
    # International ADRs
    "ASML", "TSM", "NVO", "LLY", "SAP", "TM", "SONY", "BABA", "JD", "PDD",
    "SE", "MELI", "NU", "GLOB",
]


def download_logo(ticker):
    """Download a single logo. Returns (ticker, status, bytes)."""
    for ext in ("svg", "png"):
        if (LOGO_DIR / f"{ticker}.{ext}").exists():
            return ticker, "cached", 0

    try:
        import requests
        resp = requests.get(f"{API}/{ticker}", timeout=10)
        if resp.status_code == 200 and len(resp.content) > 100:
            ct = resp.headers.get("Content-Type", "")
            ext = "svg" if "svg" in ct else "png"
            path = LOGO_DIR / f"{ticker}.{ext}"
            path.write_bytes(resp.content)
            return ticker, "downloaded", len(resp.content)
        return ticker, f"not_found({resp.status_code})", 0
    except Exception as e:
        return ticker, f"error({e})", 0


def main():
    force = "--force" in sys.argv
    LOGO_DIR.mkdir(exist_ok=True)

    # Collect all tickers
    print("Collecting ticker lists...")
    sp500 = get_sp500_tickers()
    all_tickers = set()
    for t in sp500:
        all_tickers.add(t.upper().strip())
    for t in ETFS + REITS + ADDITIONAL:
        all_tickers.add(t.upper().strip())

    # Remove any invalid entries
    all_tickers = sorted(t for t in all_tickers if t and t.isalpha() or "-" in t)
    print(f"\nTotal unique tickers to process: {len(all_tickers)}")

    if not force:
        # Count already cached
        cached = sum(1 for t in all_tickers
                     if any((LOGO_DIR / f"{t}.{ext}").exists() for ext in ("svg", "png")))
        print(f"Already cached: {cached}")
        print(f"To download: {len(all_tickers) - cached}")

    # Process in batches
    batches = [all_tickers[i:i+BATCH_SIZE] for i in range(0, len(all_tickers), BATCH_SIZE)]
    stats = {"downloaded": 0, "cached": 0, "not_found": 0, "error": 0}

    for batch_num, batch in enumerate(batches, 1):
        print(f"\n--- Batch {batch_num}/{len(batches)} ({len(batch)} tickers) ---")

        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = {pool.submit(download_logo, t): t for t in batch}
            for future in as_completed(futures):
                ticker, status, size = future.result()
                if status == "cached":
                    stats["cached"] += 1
                elif status == "downloaded":
                    stats["downloaded"] += 1
                    print(f"  + {ticker} ({size} bytes)")
                elif "not_found" in status:
                    stats["not_found"] += 1
                else:
                    stats["error"] += 1
                    print(f"  ! {ticker}: {status}")

        if batch_num < len(batches):
            time.sleep(DELAY_BETWEEN_BATCHES)

    total_on_disk = len(list(LOGO_DIR.iterdir()))
    print(f"\n{'='*50}")
    print(f"Downloaded: {stats['downloaded']}")
    print(f"Already cached: {stats['cached']}")
    print(f"Not found: {stats['not_found']}")
    print(f"Errors: {stats['error']}")
    print(f"Total logos on disk: {total_on_disk}")


if __name__ == "__main__":
    main()
