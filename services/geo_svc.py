"""
InvToolkit — Geographic data resolution service.
Cascade: FMP profile → yfinance (+ ETF category heuristic).
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

    # Cascade: FMP profile → yfinance (with ETF category heuristic)
    result = _try_fmp_profile(ticker)
    if not result or not result.get("country"):
        result = _try_yfinance(ticker, is_etf=(sec_type == "ETFs"))
    if not result:
        result = {"country": "Unknown", "currency": "USD", "source": "none"}

    store[ticker] = result
    _save_geo_store(store)
    return result


def _try_fmp_profile(ticker):
    """Company profile from FMP (has country field). Requires FMP API key."""
    try:
        from services.fmp import _fmp_get, _get_fmp_key
        if not _get_fmp_key():
            return None
        data = _fmp_get("profile", symbol=ticker)
        if data and isinstance(data, list) and len(data) > 0:
            p = data[0]
            country = p.get("country", "")
            currency = p.get("currency", "USD")
            if country:
                return {"country": country, "currency": currency, "source": "FMP"}
    except Exception as e:
        print(f"[geo] FMP profile failed for {ticker}: {e}")
    return None


def _try_yfinance(ticker, is_etf=False):
    """Fallback: yfinance info.country for stocks, category heuristic for ETFs."""
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
            # US-listed ETF with no foreign keywords → United States
            if category:
                return {"country": "United States", "currency": currency, "source": "yfinance-category"}
    except Exception as e:
        print(f"[geo] yfinance failed for {ticker}: {e}")
    return None
