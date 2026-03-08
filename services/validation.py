"""Input validation utilities."""
import re

TICKER_RE = re.compile(r'^[A-Z0-9.]{1,10}$')

def validate_ticker(ticker):
    """Validate and normalize a stock ticker symbol.
    Returns cleaned ticker or None if invalid.
    """
    if not ticker or not isinstance(ticker, str):
        return None
    cleaned = ticker.strip().upper()
    if not TICKER_RE.match(cleaned):
        return None
    return cleaned

def validate_number(value, min_val=None, max_val=None, default=None):
    """Validate a numeric value with optional bounds.
    Returns the float value or default if invalid.
    """
    try:
        num = float(value)
        if num != num:  # NaN check
            return default
        if num == float('inf') or num == float('-inf'):
            return default
        if min_val is not None and num < min_val:
            return default
        if max_val is not None and num > max_val:
            return default
        return num
    except (TypeError, ValueError):
        return default

def validate_index(value, max_len):
    """Validate an array index. Returns int or -1 if invalid."""
    try:
        idx = int(value)
        if 0 <= idx < max_len:
            return idx
        return -1
    except (TypeError, ValueError):
        return -1
