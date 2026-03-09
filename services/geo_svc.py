"""
InvToolkit — Geographic data resolution service.
Stocks: yfinance info.country (company HQ).
ETFs: yfinance category heuristic (investment region, not domicile).
Results persisted to geo_data.json (no TTL — fetch once, store forever).
"""

import json

from config import DATA_DIR

GEO_FILE = DATA_DIR / "geo_data.json"


def _load_geo_store():
    if GEO_FILE.exists():
        try:
            return json.loads(GEO_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_geo_store(store):
    GEO_FILE.write_text(json.dumps(store, indent=2))


def resolve_geo(ticker, sec_type="Stocks"):
    """Return {country, currency, source} for a ticker. Cached permanently."""
    store = _load_geo_store()
    if ticker in store and store[ticker].get("country"):
        return store[ticker]

    result = _resolve_yfinance(ticker, is_etf=(sec_type == "ETFs"))
    if not result:
        result = {"country": "Unknown", "currency": "USD", "source": "none"}

    store[ticker] = result
    _save_geo_store(store)
    return result


def _resolve_yfinance(ticker, is_etf=False):
    """Stocks: info.country. ETFs: category heuristic for investment region."""
    from services.cache import cache_get
    cached = cache_get(f"yf_{ticker}")
    if cached and cached.get("country"):
        return {
            "country": cached["country"],
            "currency": cached.get("currency", "USD"),
            "source": "yfinance",
        }
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).info or {}
        country = info.get("country", "")
        currency = info.get("currency", "USD")
        if country:
            return {"country": country, "currency": currency, "source": "yfinance"}

        # ETF heuristic: use yfinance category to infer geography
        if is_etf:
            category = (info.get("category") or "").lower()
            if any(kw in category for kw in ("foreign", "international", "global", "world", "emerging")):
                return {"country": "International", "currency": currency, "source": "yfinance-category"}
            if category:
                return {"country": "United States", "currency": currency, "source": "yfinance-category"}
    except Exception as e:
        print(f"[geo] yfinance failed for {ticker}: {e}")
    return None
