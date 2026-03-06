"""
InvToolkit — yfinance data-fetching helpers.
Wraps yfinance calls with the shared TTL cache.
"""

import yfinance as yf

from services.cache import cache_get, cache_set, _cache, _cache_lock


def fetch_ticker_data(ticker):
    """Fetch quote data for a single ticker via yfinance, with cache."""
    cached = cache_get(f"yf_{ticker}")
    if cached:
        return cached

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        # yfinance returns a lot — we extract what we need
        data = {
            "price": info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose", 0),
            "previousClose": info.get("previousClose") or info.get("regularMarketPreviousClose", 0),
            "name": info.get("longName") or info.get("shortName", ticker),
            "marketCap": info.get("marketCap", 0),
            "pe": info.get("trailingPE", 0),
            "forwardPE": info.get("forwardPE", 0),
            "sector": info.get("sector", ""),
            "industry": info.get("industry", ""),
            "divYield": round(info.get("dividendYield") or info.get("trailingAnnualDividendYield") or 0, 2),
            "divRate": info.get("dividendRate") or info.get("trailingAnnualDividendRate", 0),
            "beta": info.get("beta", 0),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow", 0),
            "targetMeanPrice": info.get("targetMeanPrice", 0),
        }

        # Calculate day change %
        price = data["price"]
        prev = data["previousClose"]
        if prev and prev > 0:
            data["changePercent"] = round((price - prev) / prev * 100, 2)
        else:
            data["changePercent"] = 0

        cache_set(f"yf_{ticker}", data)
        return data

    except Exception as e:
        print(f"[yfinance] Error fetching {ticker}: {e}")
        # Return stale cache if available
        with _cache_lock:
            entry = _cache.get(f"yf_{ticker}")
            if entry:
                return entry["data"]
        return {"price": 0, "previousClose": 0, "name": ticker, "changePercent": 0}


def fetch_all_quotes(tickers):
    """Fetch quotes for a list of tickers."""
    results = {}
    for ticker in tickers:
        results[ticker] = fetch_ticker_data(ticker)
    return results


def fetch_dividends(ticker):
    """Fetch dividend history for a ticker."""
    cached = cache_get(f"divs_{ticker}")
    if cached is not None:
        return cached

    try:
        t = yf.Ticker(ticker)
        divs = t.dividends  # pandas Series indexed by date
        result = []
        for date, amount in divs.items():
            result.append({
                "date": date.strftime("%Y-%m-%d"),
                "dividend": float(amount),
            })
        cache_set(f"divs_{ticker}", result)
        return result
    except Exception as e:
        print(f"[yfinance] Error fetching dividends for {ticker}: {e}")
        return []
