"""
InvToolkit — Finviz fundamentals and peer-comparison helpers.
Uses finvizfinance (free, no API key) for peer data and sector comparisons.
"""

from concurrent.futures import ThreadPoolExecutor

from finvizfinance.quote import finvizfinance


def _finviz_fundamentals(ticker):
    """Fetch fundamentals for a single ticker from Finviz. Returns dict or None."""
    try:
        stock = finvizfinance(ticker)
        f = stock.ticker_fundament()
        pe_raw = f.get("P/E", "-")
        ev_raw = f.get("EV/EBITDA", "-")
        pb_raw = f.get("P/B", "-")
        return {
            "ticker": ticker,
            "name": f.get("Company", ticker),
            "price": _parse_finviz_num(f.get("Price", 0)),
            "mktCap": f.get("Market Cap", "-"),
            "pe": _parse_finviz_num(pe_raw),
            "forwardPE": _parse_finviz_num(f.get("Forward P/E", "-")),
            "evEbitda": _parse_finviz_num(ev_raw),
            "pb": _parse_finviz_num(pb_raw),
            "eps": _parse_finviz_num(f.get("EPS (ttm)", 0)),
            "sector": f.get("Sector", ""),
            "industry": f.get("Industry", ""),
        }
    except Exception as e:
        print(f"[Finviz] Error fetching {ticker}: {e}")
        return None


def _parse_finviz_num(val):
    """Parse Finviz value to float. Returns None for '-' or invalid."""
    if val is None or val == "-" or val == "":
        return None
    try:
        return float(str(val).replace(",", "").replace("%", ""))
    except (ValueError, TypeError):
        return None


def _fetch_peer_comparison(ticker):
    """Fetch peer list and fundamentals from Finviz (free, no API key).

    Returns dict with peer list and computed averages, or None on failure.
    Uses ThreadPoolExecutor for parallel peer fetching (~1-2s total).
    """
    try:
        stock = finvizfinance(ticker)
        peer_tickers = stock.ticker_peer()
        if not peer_tickers:
            return None

        # Limit to 8 peers max, fetch in parallel
        peer_tickers = peer_tickers[:8]
        peers = []
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(_finviz_fundamentals, peer_tickers))
        peers = [p for p in results if p is not None]

        if not peers:
            return None

        # Compute averages and medians from peers with valid data
        def _avg(key):
            vals = [p[key] for p in peers if p.get(key) is not None and p[key] > 0]
            return round(sum(vals) / len(vals), 2) if vals else None

        def _median(key):
            vals = sorted([p[key] for p in peers if p.get(key) is not None and p[key] > 0])
            if not vals:
                return None
            n = len(vals)
            mid = n // 2
            return round((vals[mid - 1] + vals[mid]) / 2, 2) if n % 2 == 0 else round(vals[mid], 2)

        return {
            "peers": peers,
            "averages": {
                "pe": _avg("pe"),
                "evEbitda": _avg("evEbitda"),
                "pb": _avg("pb"),
            },
            "medians": {
                "pe": _median("pe"),
                "evEbitda": _median("evEbitda"),
                "pb": _median("pb"),
            },
            "source": "Finviz",
        }
    except Exception as e:
        print(f"[Finviz] Peer comparison failed for {ticker}: {e}")
        return None
