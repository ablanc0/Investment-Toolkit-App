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

LOGO_DIR = Path(__file__).resolve().parent.parent / "data" / "logos"
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
    # Dividend Aristocrats / Kings (25+ yr dividend growth)
    "ABT", "ADP", "AFL", "ALB", "AOS", "APD", "ATVI", "BDX", "BEN", "CAH",
    "CB", "CHD", "CINF", "CL", "CLX", "CTAS", "CVX", "DOV", "ECL", "ED",
    "EMR", "ESS", "EXPD", "FRT", "GD", "GPC", "GWW", "HRL", "ITW", "KMB",
    "LEG", "LIN", "LOW", "MCD", "MDT", "MKC", "MMM", "NDSN", "NEE", "NUE",
    "O", "PBCT", "PEP", "PG", "PNR", "PPG", "ROP", "ROST", "SHW", "SJM",
    "SPGI", "SWK", "SYY", "TGT", "TROW", "VFC", "WBA", "WMT", "WST", "XOM",
    # More industrials / materials
    "AME", "CMI", "DOV", "ETN", "FTV", "GNRC", "GWW", "IEX", "IR", "ITW",
    "JCI", "LII", "NDSN", "OTIS", "PH", "PWR", "RBC", "RRX", "SNA", "STE",
    "TT", "TYL", "WAB", "WCC", "XYL", "AIT", "AZEK", "BLD", "BLDR", "CNM",
    "CSL", "DSGR", "EXP", "GMS", "MLM", "TREX", "VMC", "UFPI", "USLM",
    # More tech / software / cloud
    "APP", "APPF", "BILL", "CFLT", "COUP", "CRWD", "CYBR", "DOCU", "DSGX",
    "DT", "ESTC", "EVBG", "FIVN", "FRSH", "FSLY", "GTLB", "HUBS", "IOT",
    "KVYO", "MANH", "MDB", "MNDY", "NCNO", "OKTA", "QLYS", "RBRK", "S",
    "SMCI", "SNPS", "SOUN", "TENB", "TOST", "TWLO", "U", "VRNS", "WDAY",
    "ZI", "ZM", "ZS",
    # More consumer / retail / restaurants
    "BROS", "CASY", "CHWY", "COOK", "CPRT", "CVNA", "DKS", "DNUT", "EAT",
    "EL", "FIVE", "FL", "GPS", "HAS", "KSS", "LEVI", "LKQ", "LULU",
    "MNST", "NCLH", "ODP", "PENN", "RCL", "RRGB", "SBUX", "THO",
    "TSCO", "ULTA", "VFC", "WSM", "YUM",
    # Healthcare / biotech / pharma
    "A", "ALGN", "AMED", "BAX", "BIO", "BSX", "CNC", "COO", "CRL", "CTLT",
    "CZR", "DGX", "DVA", "EW", "EXAS", "GEHC", "GMED", "HAE", "HOLX",
    "HCA", "HSIC", "ICLR", "INCY", "IQV", "JAZZ", "LH", "MEDP", "MOH",
    "NBIX", "NTRA", "PCVX", "PHR", "PKI", "PODD", "RARE", "RVMD", "STE",
    "SGEN", "SYK", "TFX", "TMO", "UTHR", "VEEV", "WAT", "WST", "XRAY", "ZBH",
    # Energy / utilities
    "AEE", "AEP", "AES", "ATO", "AWK", "CEG", "CMS", "CNP", "D", "DTE",
    "DUK", "EIX", "ES", "ETR", "EVRG", "FE", "LNT", "NI", "OGE", "PCG",
    "PEG", "PNW", "PPL", "SO", "SRE", "VST", "WEC", "XEL",
    "AM", "AR", "CTRA", "DVN", "EQT", "FANG", "HAL", "HES", "KMI",
    "LNG", "MRO", "NOV", "OKE", "OVV", "PXD", "RRC", "TRGP", "WMB",
    # Financials / insurance / banks
    "ACGL", "AFG", "AIG", "AIZ", "ALL", "AMP", "AON", "AXP", "BRO",
    "CBOE", "CFG", "CINF", "CMA", "COF", "EWBC", "FDS", "FHN", "FITB",
    "FNF", "GL", "HBAN", "HIG", "IVZ", "KEY", "L", "LNC", "MET", "MKTX",
    "MTB", "NTRS", "NYCB", "PFG", "PGR", "PRU", "RE", "RF", "RJF",
    "SIVB", "SNEX", "STT", "SYF", "TRV", "TRMB", "WRB", "ZION",
    # Semiconductors / hardware
    "ADI", "ALGM", "AMAT", "AMKR", "CRUS", "ENTG", "FORM", "GFS",
    "KLAC", "LRCX", "LSCC", "MCHP", "MPWR", "MU", "NXPI", "ON",
    "POWI", "QRVO", "RMBS", "SWKS", "TER", "WOLF",
    # Communications / media / entertainment
    "CHTR", "CMCSA", "EA", "FOX", "FOXA", "IPG", "LYV", "MTCH",
    "NFLX", "NWSA", "NWS", "OMC", "PARA", "RBLX", "ROKU", "SNAP",
    "SPOT", "TTWO", "WBD", "WMG", "ZG", "PINS",
    # Transportation / logistics
    "AAL", "ALK", "CEA", "CP", "CSX", "DAL", "EXPD", "FDX",
    "HUBG", "JBHT", "JBLU", "KNX", "LSTR", "LUV", "NSC", "ODFL",
    "SAVE", "SAIA", "SNDR", "UAL", "UNP", "UPS", "URI", "WERN", "XPO",
    # Real estate services / construction
    "AWI", "CBRE", "CG", "CSGP", "DHI", "JLL", "KBH", "LEN", "MHK",
    "MTH", "NVR", "PHM", "RWT", "TOL", "TTEC", "Z", "ZG",
    # More international ADRs
    "ABB", "AZN", "BCS", "BHP", "BP", "CIB", "DB", "DEO", "E",
    "ERIC", "GMAB", "GRAB", "GSK", "HDB", "HESM", "HSBC", "IBN",
    "INFY", "ING", "KB", "LYG", "MUFG", "NGG", "NOK", "NVS",
    "RIO", "RY", "SAN", "SCCO", "SHOP", "SHG", "SNY", "STLA",
    "TEF", "TD", "TLK", "TOT", "UBS", "UL", "VALE", "VIPS", "VOD", "WIT",
    # Cannabis / emerging
    "TLRY", "CGC", "ACB", "CRON", "SNDL", "OGI",
    # Payments / fintech
    "AFRM", "BILL", "FIS", "FISV", "FLT", "GPN", "NDAQ", "PYPL",
    "RPAY", "SQ", "TOST", "WEX", "WU",
    # Space / defense
    "AJRD", "AVAV", "BA", "BWXT", "GD", "HEI", "HII", "HWM",
    "KTOS", "LHX", "LMT", "NOC", "RKLB", "RTX", "SPR", "TDG", "TXT",
    # Clean energy / EV ecosystem
    "ARRY", "BE", "CHPT", "CWEN", "DALS", "ENPH", "EVGO", "FSLR",
    "GNRC", "LEA", "PLUG", "SEDG", "SHLS", "SPWR", "RUN",
    # Data / analytics / AI
    "AI", "BBAI", "BIGC", "BRZE", "C3AI", "CLVT", "DOCN", "FROG",
    "GDYN", "MDAI", "ONEM", "PATH", "PLTR", "PRCT", "SEMR", "SNOW",
    "SPLK", "SUMO", "TYL", "VRNS",
    # Insurance / specialty finance
    "ACGL", "AJG", "AON", "ARES", "BAM", "BN", "BX", "CG", "EQH",
    "FNF", "KNSL", "KKR", "MMC", "OWL", "RNR", "WTW", "Y",
    # Food / beverages / agriculture
    "ADM", "BG", "CAG", "CPB", "DAR", "FDP", "GIS", "HSY", "INGR",
    "K", "KDP", "KHC", "KR", "MDLZ", "MKC", "PFGC", "POST", "SFM",
    "SJM", "SMPL", "TAP", "TSN", "USFD", "WBA",
    # Misc popular / meme / retail favorites
    "AMC", "BB", "BBBY", "CLOV", "DKNG", "FUBO", "GME", "IONQ",
    "LAZR", "MARA", "RIOT", "SOFI", "SPCE", "WISH",
    # Russell 2000 / small-cap popular
    "AAON", "ACIW", "ADNT", "ADUS", "AGCO", "AIN", "AJRD", "ALGT",
    "AMED", "AMWD", "ANDE", "ANET", "APAM", "ARES", "ARGO", "ASGN",
    "AXNX", "AYI", "AZEK", "BCPC", "BDC", "BERY", "BKH", "BOOT",
    "BWA", "CALM", "CARG", "CBT", "CCOI", "CEIX", "CENX", "CGNX",
    "CHDN", "CHE", "CHH", "CIEN", "CMPR", "CNO", "COLB", "CORT",
    "CRC", "CROX", "CRS", "CRVL", "CSWI", "CW", "CWK", "CYTK",
    "DAN", "DFIN", "DIOD", "DLB", "DNLI", "DXC", "DXPE", "EAF",
    "EBC", "EGP", " ELFV", "ENSG", "ENV", "EPAC", "ESAB", "EVR",
    "EXEL", "EXPO", "FATE", "FBIN", "FCFS", "FCN", "FELE", "FHB",
    "FIX", "FIVN", "FLS", "FN", "FNB", "FOLD", "FOXF", "FSS",
    "FULT", "GATX", "GEF", "GKOS", "GMS", "GOLF", "GSHD", "GTLS",
    "HA", "HAYW", "HBI", "HEES", "HLI", "HNI", "HP", "HQY",
    "HRMY", "HTH", "HUBG", "IBKR", "IBP", "ICFI", "IDCC", "IPAR",
    "ITCI", "ITIC", "JBSS", "JBT", "JJSF", "KALU", "KAR", "KFRC",
    "KFY", "KMPR", "KN", "KRYS", "KWR", "LANC", "LAUR", "LBRT",
    "LFUS", "LGIH", "LIVN", "LNTH", "LOPE", "LPLA", "LPX", "LRN",
    "MATX", "MBIN", "MCW", "MGEE", "MGY", "MIDD", "MIR", "MKSI",
    "MLI", "MMS", "MOD", "MOG-A", "MORN", "MRC", "MSA", "MSM",
    "MTG", "MTN", "MTSI", "MUR", "MWA", "NABL", "NARI", "NBR",
    "NEOG", "NEU", "NFG", "NHC", "NJR", "NMIH", "NOVT", "NPO",
    "NR", "NSIT", "NWE", "NWL", "OGS", "OI", "OLED", "OLN",
    "OMF", "ONB", "ORA", "ORI", "OSCR", "OTTR", "OZK", "PAYO",
    "PCOR", "PEN", "PGNY", "PIPR", "PLXS", "PNM", "POR", "POWL",
    "PRGO", "PRI", "PRIM", "PRO", "PSN", "PTCT", "PVH", "RAMP",
    "RBC", "RDN", "REZI", "RIG", "RLI", "RMBS", "RNR", "RPM",
    "RRX", "RUSHA", "RYAN", "SAH", "SAIA", "SCI", "SGRY", "SIG",
    "SKX", "SM", "SMTC", "SSD", "STEP", "STRA", "SWX", "TECH",
    "TNET", "TMDX", "TMHC", "TPX", "TTC", "TVTX", "UFPI", "UMBF",
    "UPBD", "USPH", "VCYT", "VIRT", "VNDA", "VNOM", "WD", "WEN",
    "WGO", "WHD", "WINA", "WK", "WLK", "WNS", "WOLF", "WOR",
    "WTS", "X", "XNCR", "XPEL", "YETI", "ZWS",
    # Mid-cap growth / momentum
    "ABNB", "ACHR", "AEHR", "ALNY", "ALVR", "AMBA", "AMPH", "AXON",
    "AZPN", "BRZE", "CART", "CELH", "CFLT", "COKE", "CORT", "CRSP",
    "CSTM", "CYBR", "DCBO", "DOCU", "DUOL", "DXCM", "ENPH", "EXAS",
    "FND", "FOUR", "FROG", "FTAI", "GLOB", "GLPI", "GRMN", "HALO",
    "HIMS", "INTA", "IRTC", "KRNT", "LSCC", "LYFT", "MANH", "MEDP",
    "MGNI", "MNDY", "MNTV", "MTTR", "NTNX", "NUVL", "OLLI", "PAYC",
    "PCTY", "PSTG", "RELY", "RIVN", "RXRX", "SAMSARA", "SEDG", "SITM",
    "SMCI", "TASK", "TMDX", "TRNO", "TWST", "TYL", "VRNA", "WFRD",
    "XPOF", "ZBRA",
    # European stocks (London / EU popular)
    "ABI", "ADYEN", "AIR", "ALV", "AMS", "BATS", "BAYN", "BMW",
    "BNP", "CRH", "CS", "DAI", "DG", "DPW", "ENEL", "ENI",
    "FP", "GSK", "HSBA", "IBE", "ISP", "KER", "LVMH", "MC",
    "MBG", "MUV2", "NESN", "NOVN", "OR", "RMS", "ROG", "RWE",
    "SAMS", "SHEL", "SIE", "SU", "SW", "TOTB", "UNA", "VOW3",
    # Asian stocks (popular ADRs / tickers)
    "BIDU", "BILI", "FUTU", "HMC", "HTHT", "IQ", "KC", "LKNCY",
    "LPL", "MNSO", "MOMO", "NTES", "QFIN", "TAL", "TME", "TCOM",
    "VNET", "WB", "XPEV", "YMM", "ZTO",
    # Latin America / emerging
    "ABEV", "BSAC", "BSBR", "CRESY", "ENIC", "FMX", "GGB", "IBA",
    "ITUB", "KOF", "LOMA", "PAC", "PAGS", "SBS", "SID", "SKM",
    "STNE", "SUZ", "TGS", "TV", "VALE", "VIST", "XP",
    # Crypto-related stocks / blockchain
    "BITF", "BTBT", "BTDR", "CLSK", "CORZ", "GBTC", "HUT",
    "IREN", "MSTR", "SBIT", "WGMI", "WULF",
    # More ETFs — thematic / niche
    "ARKB", "BITQ", "BLOK", "BUZZ", "DRIV", "ESGU", "ESGV",
    "FIVG", "FXD", "GAMR", "GNOM", "GXTG", "HERO", "JETS",
    "KARS", "KROP", "LIT", "MOON", "MTUL", "NERD", "OGIG",
    "PAWZ", "PBW", "POTX", "PRNT", "QCLN", "REMX", "RSPN",
    "SNSR", "SOCL", "TAN", "URNM", "VGK", "VPU", "WCLD", "XAR",
    "XBI", "XHB", "XME", "XOP", "XRT", "XSD", "XSW",
    # Commodities / precious metals ETFs
    "CPER", "CORN", "DUST", "GDX", "GDXJ", "GLDM", "JNUG",
    "NUGT", "SGOL", "SIVR", "SOYB", "UNG", "USO", "WEAT",
    # Fixed income / bond ETFs
    "BIL", "BSV", "BSVO", "BWX", "CWB", "DFSD", "EMLC", "FLOT",
    "GBIL", "HYMB", "IEI", "JPST", "MINT", "NEAR", "SGOV",
    "SHAG", "SHM", "SPSB", "SUB", "TFLO", "VWOB",
    # More S&P MidCap 400 / Russell Midcap
    "ACM", "AES", "ALLY", "APA", "ARMK", "ATI", "AVTR", "AXTA",
    "BFAM", "BJ", "BRKR", "BWXT", "BWA", "CACI", "CDE", "CDW",
    "CF", "CHX", "CLH", "CLR", "CNX", "COHR", "CR", "CRSP",
    "CW", "DAR", "DECK", "DT", "DUOL", "EHC", "ENTG", "EPAM",
    "ESI", "EWBC", "FE", "FFIN", "FHN", "FLR", "FN", "FND",
    "GFL", "GGG", "GH", "GNTX", "GPK", "GXO", "H", "HAE",
    "HALO", "HAS", "HBI", "HIMS", "HL", "HRB", "HUN", "IAC",
    "IBKR", "INGR", "INTA", "IPG", "IRTC", "JBHT", "JEF", "JKHY",
    "JLL", "KMPR", "KNX", "KRTX", "KSS", "KVYO", "LAD", "LANC",
    "LECO", "LEG", "LKQ", "LOPE", "LPX", "LW", "MANH", "MAN",
    "MEDP", "MKTX", "MORN", "MPWR", "MRVI", "MTG", "MTZ", "MUR",
    "NCLH", "NFE", "NI", "NVT", "NXST", "OLLI", "OMF", "ORI",
    "OSK", "OTTR", "PAYC", "PCTY", "PII", "PNFP", "POOL", "PSTG",
    "PVH", "QLYS", "RBC", "REG", "RGA", "RHI", "RLI", "ROL",
    "RPM", "RS", "RRC", "SAIA", "SBNY", "SCI", "SEIC", "SF",
    "SIGI", "SKX", "SNEX", "SNV", "SON", "SPB", "SR", "SSD",
    "SSB", "STE", "SWX", "TECH", "TFSL", "TGNA", "TKR", "TNC",
    "TNET", "TOL", "TOST", "TPX", "TTC", "TXRH", "UDMY", "UFPI",
    "UMBF", "VIRT", "WDFC", "WENDY", "WEX", "WLK", "WRB", "WSC",
    "XRAY", "XYL", "YEXT", "ZBH", "ZBRA",
    # Biotech / life sciences (more)
    "ABCL", "ACAD", "ADPT", "AGEN", "ALKS", "ALNY", "ARGX", "ARWR",
    "AUPH", "BEAM", "BGNE", "BNTX", "CERE", "CRNX", "CRSP", "DAWN",
    "DRNA", "EDIT", "ENTA", "ERA", "FATE", "GILD", "GMAB", "HZNP",
    "IMVT", "INSM", "IONS", "IRWD", "IOVA", "LEGN", "LRMR", "MGNX",
    "MRNA", "MYGN", "NBIX", "NTLA", "PCVX", "PTGX", "RCKT", "RCUS",
    "REGN", "SANA", "SGEN", "SRPT", "TVTX", "VKTX", "VRTX", "ZLAB",
    # Infrastructure / specialty industrial
    "AGR", "AIT", "APG", "ATKR", "AUR", "AWI", "AZZ", "BWXT",
    "CSWI", "DY", "EAF", "ESAB", "FIX", "FLS", "GATX", "GEF",
    "HRI", "HUBB", "IEX", "J", "KBR", "KEX", "LII", "MAS",
    "MDU", "MEG", "MIR", "MTZ", "NVT", "OTIS", "PH", "POWL",
    "ROP", "RRX", "SNA", "SWK", "TTC", "URI", "WAB", "WCC",
    "WMS", "WOR", "WSO",
    # Specialty retail / e-commerce
    "BURL", "CHWY", "COUR", "CPRT", "CVNA", "DKS", "EBAY", "ETSY",
    "FIVE", "FWRD", "GCO", "GRPN", "KTB", "LE", "LULU", "MELI",
    "OLLI", "ORLY", "PLBY", "PRPL", "RH", "RVLV", "SFIX", "W",
    "WRBY", "WSM", "XPOF",
    # Managed care / health services
    "ACHC", "AGL", "AMEH", "AMN", "AMED", "CHE", "CYH", "DGX",
    "DVA", "EHC", "ENSG", "EVH", "GDRX", "HIMS", "LH", "MOH",
    "NEA", "NHC", "OPT", "OSCR", "PHR", "PGNY", "SDGR", "SHC",
    "SGRY", "THC", "USPH",
    # Aerospace / defense (more)
    "ACHR", "CW", "ESLT", "HEI-A", "HII", "HWM", "KTOS", "LDOS",
    "MRCY", "PLTR", "RKLB", "SPCE", "SPR", "TDG", "TGI", "TXT",
    "VTOL", "WWD",
    # Real estate tech / proptech
    "CIGI", "COMP", "CSGP", "EXPI", "OPEN", "RDFN", "RLGY", "Z",
    # Gaming / entertainment / sports
    "CHDN", "CZR", "DKNG", "EA", "FLUT", "GENI", "IGT", "LNW",
    "MGM", "PENN", "RSI", "RXO", "TTWO", "WYNN",
    # Water / waste / environmental
    "AOS", "AWK", "CWST", "ECL", "FBIN", "GFL", "MEG", "NXDT",
    "PNR", "SJW", "WTRG", "XYL",
    # Cannabis (more)
    "GRWG", "MAPS", "MSOS", "TCNNF", "TPVG",
    # SPACs / de-SPACs popular
    "DNA", "HYLN", "JOBY", "LILM", "LFLY", "LUCID", "MVST",
    "ORGN", "OWL", "QS", "RDW", "SHPW", "SNAX", "STEM",
    # Dow Jones Industrial Average (ensure coverage)
    "AAPL", "AMGN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS", "DOW",
    "GS", "HD", "HON", "IBM", "INTC", "JNJ", "JPM", "KO", "MCD", "MMM",
    "MRK", "MSFT", "NKE", "PG", "TRV", "UNH", "V", "VZ", "WBA", "WMT",
    # FTSE 100 (London ADRs / tickers)
    "AAL", "ABDN", "ANTO", "AUTO", "AV", "AVST", "AZN", "BA", "BARC",
    "BATS", "BHP", "BP", "BRBY", "BT", "CCL", "CPG", "CRDA", "DGE",
    "EXPN", "FERG", "FRES", "GLEN", "GSK", "HLMA", "HSBA", "HWDN",
    "IAG", "IHG", "IMB", "INF", "ITRK", "ITV", "JD", "KGF", "LAND",
    "LGEN", "LLOY", "LSEG", "MNG", "MNDI", "MRO", "NG", "NXT", "OCDO",
    "PHNX", "PRU", "PSN", "PSON", "RKT", "RMV", "RR", "RTO", "SBRY",
    "SDR", "SGE", "SGRO", "SHEL", "SKG", "SMDS", "SMIN", "SMT", "SN",
    "SPX", "SSE", "STAN", "SVT", "TSCO", "TW", "ULVR", "UTG", "UU",
    "VOD", "WPP", "WTB",
    # DAX 40 (Frankfurt / Germany)
    "ADS", "AIR", "ALV", "BAS", "BAYN", "BEI", "BMW", "BNR", "CON",
    "DBK", "DB1", "DHL", "DTE", "DTG", "ENR", "FME", "FRE", "HEI",
    "HEN3", "IFX", "LHA", "LIN", "MBG", "MRK", "MTX", "MUV2", "P911",
    "PAH3", "RWE", "SAP", "SHL", "SIE", "SRT3", "SY1", "VNA", "VOW3", "ZAL",
    # CAC 40 (Paris / France)
    "AI", "BN", "BNP", "CA", "CAP", "CS", "DG", "DSY", "EL", "EN",
    "ENGI", "ERF", "FP", "HO", "KER", "LR", "MC", "ML", "OR", "ORA",
    "PUB", "RI", "RMS", "RNO", "SAF", "SAN", "SGO", "STLA", "STM",
    "SU", "TEP", "TTE", "URW", "VIE", "VIV", "WLN",
    # Nikkei 225 popular (Japan ADRs)
    "FANUY", "FUJIY", "HMC", "MSBHF", "NMR", "NTDOY", "SMFG", "SNE",
    "SONY", "TM", "TOELY",
    # Hang Seng / China popular (ADRs)
    "BABA", "BIDU", "BILI", "CHA", "CHU", "CQQQ", "DIDI", "EDU",
    "GOTU", "GDS", "HTHT", "IQ", "JD", "LFC", "LI", "LKNCY",
    "MNSO", "NIO", "NTES", "PDD", "QFIN", "RVPH", "SE", "TCEHY",
    "TME", "TUYA", "VNET", "WB", "XPEV", "YMM", "ZTO",
    # TSX (Canada) popular
    "ABX", "AEM", "AGI", "AQN", "ATD", "BAM", "BEP", "BIP", "BN",
    "BMO", "BNS", "CAR-UN", "CCO", "CM", "CNQ", "CP", "CTC-A", "CVE",
    "DOL", "EMA", "ENB", "FM", "FNV", "FTS", "GIB-A", "GWO", "H",
    "IFC", "IMO", "K", "L", "MFC", "MG", "MRU", "NA", "NTR", "OTEX",
    "POW", "QSR", "RCI-B", "RY", "SAP", "SLF", "SNC", "SU", "T",
    "TD", "TOU", "TRI", "TRP", "WCN", "WFG", "WN", "WSP",
    # ASX (Australia) popular ADRs
    "BHP", "CBA", "CSL", "FMG", "JHX", "MQG", "NAB", "RIO", "TLS",
    "WDS", "WES", "WBC", "WOW", "XRO",
    # India popular ADRs
    "HDB", "IBN", "INFY", "IT", "MMYT", "RDY", "SIFY", "TTM", "WIT",
    "WNS", "YTRA",
    # Miscellaneous well-known brands / companies
    "ABNB", "CHGG", "DOCU", "FVRR", "GLBE", "GDRX", "HIMS", "HNST",
    "LMND", "OPEN", "OSCR", "PRCH", "PUBM", "RVLV", "SMAR", "SONO",
    "SPOT", "TTCF", "UPWK", "VROOM", "ZM",
    # Private equity / alt asset managers
    "ARES", "APO", "BAM", "BN", "BX", "CG", "EQT", "KKR", "OWL", "TPG",
    # Insurance (more)
    "ACGL", "AFG", "AIG", "AIZ", "AJG", "ALL", "BRO", "CB", "CINF",
    "CNA", "EG", "ERIE", "FAF", "FNF", "GL", "HBAN", "HIG", "KNSL",
    "L", "MET", "PGR", "PRU", "RGA", "RLI", "RNR", "SIGI", "TRV",
    "WRB", "WTW",
    # Mortgage / specialty finance
    "AGNC", "AI", "BXMT", "COOP", "DX", "EFC", "GHLD", "LADR", "MFA",
    "NLY", "NYCB", "PFSI", "PMT", "RITM", "STWD", "TWO", "UWMC", "VNO",
    # Agriculture / ag-tech
    "ADM", "ANDE", "CALM", "CF", "CTVA", "DE", "FMC", "IPI", "MOS",
    "NTR", "SMG",
    # Shipping / marine
    "DAC", "EGLE", "GOGL", "GNK", "GSL", "INSW", "KEX", "LPG", "MATX",
    "NMM", "SBLK", "SB", "STNG", "TNK", "ZIM",
    # Packaging / containers
    "AMCR", "ATR", "AVY", "BALL", "BLL", "CCK", "GPK", "GEF", "IP",
    "OI", "PKG", "SEE", "SON", "TRS", "WRK",
    # Specialty chemicals
    "ALB", "APD", "ASH", "AXTA", "CBT", "CC", "CE", "CTVA", "DD",
    "DOW", "EMN", "FF", "FUL", "GRA", "HUN", "IOSP", "KRA", "KWR",
    "LYB", "MTX", "NEU", "OLN", "PPG", "RPM", "SCL", "SHW", "TROX",
    "TSE", "UNI", "VAL", "WDFC",
    # Telecom / tower / 5G
    "AMT", "CCI", "CLFD", "CMCSA", "DISH", "GSAT", "IRDM", "LBRDK",
    "LBTYA", "LILA", "LSXMA", "SBAC", "T", "TMUS", "USM", "VZ",
    # Education / ed-tech
    "ATGE", "CHGG", "COUR", "DUOL", "EDU", "GOTU", "GHC", "LRN",
    "LOPE", "STRA", "TAL", "TWOU", "UDMY",
    # Travel / hospitality (more)
    "ABNB", "BKNG", "CCL", "CUK", "EXPE", "H", "HLT", "HTHT",
    "MAR", "NCLH", "OEH", "RCL", "TCOM", "TRIP", "VAC",
    "WYNN",
    # Luxury goods / fashion
    "CPRI", "EL", "FOSL", "GOOS", "LULU", "LVMUY", "PVH", "RL",
    "RH", "RVLV", "SKX", "TIF", "TPR", "VFC", "XPOF",
    # Pet / animal health
    "CHWY", "IDXX", "PETS", "TRUP", "ZTS",
    # Sports / fitness
    "PTON", "PLNT", "NKE", "LULU", "UA", "UAA", "YETI",
    # Payments / financial infrastructure (more)
    "ADS", "AFRM", "BILL", "COIN", "DFS", "FI", "FIS", "FISV", "FOUR",
    "GPN", "HOOD", "HUBS", "LMND", "LPRO", "MA", "MKTX", "NUVEI",
    "PAYO", "PYPL", "RPAY", "SQ", "TOST", "V", "WEX", "WU",
]


def download_logo(ticker):
    """Download a single logo as 128px PNG. Returns (ticker, status, bytes)."""
    if (LOGO_DIR / f"{ticker}.png").exists():
        return ticker, "cached", 0

    try:
        import requests
        resp = requests.get(f"{API}/{ticker}", params={"format": "png", "size": 250}, timeout=10)
        if resp.status_code == 200 and len(resp.content) > 100:
            path = LOGO_DIR / f"{ticker}.png"
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
