"""
InvToolkit — yfinance data-fetching helpers.
Wraps yfinance calls with the shared TTL cache.
"""

import time

import yfinance as yf

from services.cache import cache_get, cache_set, _cache, _cache_lock


def fetch_ticker_data(ticker):
    """Fetch quote data for a single ticker via yfinance, with cache."""
    cached = cache_get(f"yf_{ticker}")
    if cached:
        return cached

    try:
        from services.api_health import record_api_call
        start = time.time()
        t = yf.Ticker(ticker)
        info = t.info or {}
        latency = int((time.time() - start) * 1000)
        ok = bool(info.get("currentPrice") or info.get("regularMarketPrice"))
        record_api_call("yfinance", success=ok, latency_ms=latency,
                        error_msg=None if ok else f"No price data for {ticker}")

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
            "beta": info.get("beta") or info.get("beta3Year", 0),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow", 0),
            "targetMeanPrice": info.get("targetMeanPrice", 0),
            "country": info.get("country", ""),
            "currency": info.get("currency", "USD"),
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


def fetch_historical_prices(tickers, period="1y"):
    """Fetch monthly closing prices for multiple tickers.
    Returns dict of ticker -> list of closing prices (aligned by date).
    """
    if not tickers:
        return {}

    cache_key = f"hist_prices_{'_'.join(sorted(tickers))}_{period}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        # Download all tickers at once for efficiency
        data = yf.download(tickers, period=period, interval="1mo", progress=False)

        result = {}
        if "Close" in data.columns:
            close_data = data["Close"]
            # Handle both MultiIndex and flat columns
            if hasattr(close_data, 'columns'):
                # MultiIndex or DataFrame with ticker columns
                for ticker in tickers:
                    if ticker in close_data.columns:
                        col = close_data[ticker].dropna()
                        if not col.empty:
                            result[ticker] = [float(p) for p in col.tolist()]
            else:
                # Single Series (flat columns, single ticker)
                ticker = tickers[0]
                prices = [float(p) for p in close_data.dropna().tolist()]
                if prices:
                    result[ticker] = prices

        cache_set(cache_key, result)
        return result

    except Exception as e:
        print(f"[yfinance] Error fetching historical prices: {e}")
        return {}


def fetch_sp500_annual_returns():
    """Fetch S&P 500 annual returns from ^GSPC historical data.
    Returns dict of year (str) -> annual return (percentage, e.g. 26.3 for 26.3%).
    """
    cached = cache_get("sp500_annual_returns")
    if cached:
        return cached

    try:
        data = yf.download("^GSPC", period="max", interval="1mo", progress=False)
        if data.empty:
            return {}

        close = data["Close"]
        if hasattr(close, "columns"):
            close = close.iloc[:, 0]

        # Group by year, get first and last close
        yearly = {}
        for date, price in close.items():
            year = str(date.year)
            if year not in yearly:
                yearly[year] = {"first": float(price), "last": float(price)}
            yearly[year]["last"] = float(price)

        result = {}
        years_sorted = sorted(yearly.keys())
        for i, year in enumerate(years_sorted):
            if i == 0:
                continue
            prev_last = yearly[years_sorted[i - 1]]["last"]
            curr_last = yearly[year]["last"]
            if prev_last > 0:
                ret = ((curr_last - prev_last) / prev_last) * 100
                result[year] = round(ret, 2)

        cache_set("sp500_annual_returns", result)
        return result

    except Exception as e:
        print(f"[yfinance] Error fetching S&P 500 annual returns: {e}")
        return {}


def fetch_daily_prices(tickers, period="1y"):
    """Fetch daily closing prices for multiple tickers.

    Wraps yf.download() for daily interval data.
    Used by find-the-dip (SMA analysis) and similar features.

    Returns: pandas DataFrame (same return type as yf.download).
    """
    return yf.download(tickers, period=period, interval="1d", progress=False)


def fetch_dividend_calendar(ticker):
    """Fetch the dividend calendar for a ticker.

    Wraps yf.Ticker(ticker).calendar to retrieve next ex-dividend
    and payment dates.

    Returns: dict (calendar data) or None on failure.
    """
    try:
        cal = yf.Ticker(ticker).calendar
        if isinstance(cal, dict):
            return cal
        return None
    except Exception:
        return None


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
