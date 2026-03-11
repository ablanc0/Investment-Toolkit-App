"""
InvToolkit — Resilient HTTP client with retry and circuit breaker.

Drop-in replacement for raw requests.get/post calls across service files.
Provides exponential backoff, per-provider circuit breaker, and automatic
api_health integration when a provider name is specified.
"""

import time
import threading

import requests as http_requests


# ── Circuit breaker state ─────────────────────────────────────────────

_cb_lock = threading.Lock()

# Per-provider circuit breaker: {provider: {failures, last_failure, opened_at, state}}
# state: "closed" (normal), "open" (blocking), "half-open" (probing)
_circuit_breakers = {}

_CB_FAILURE_THRESHOLD = 3    # consecutive failures to trip
_CB_FAILURE_WINDOW = 300     # seconds — failures must occur within this window
_CB_OPEN_DURATION = 60       # seconds — how long circuit stays open before half-open probe

_DEFAULT_MAX_RETRIES = 2
_BACKOFF_BASE = 1            # first retry waits 1s, second waits 2s
_RATE_LIMIT_WAIT = 10        # seconds to wait on HTTP 429


def _get_cb(provider):
    """Get or create circuit breaker state for a provider. Must hold _cb_lock."""
    if provider not in _circuit_breakers:
        _circuit_breakers[provider] = {
            "failures": 0,
            "last_failure": 0,
            "opened_at": 0,
            "state": "closed",
        }
    return _circuit_breakers[provider]


def is_circuit_open(provider):
    """Check if a provider's circuit is open (blocking requests).

    Returns True if open and not yet ready for a half-open probe.
    Returns False if closed, half-open, or if the open duration has elapsed.
    """
    if not provider:
        return False
    with _cb_lock:
        cb = _get_cb(provider)
        if cb["state"] == "closed":
            return False
        if cb["state"] == "open":
            elapsed = time.time() - cb["opened_at"]
            if elapsed >= _CB_OPEN_DURATION:
                # Transition to half-open — allow one probe
                cb["state"] = "half-open"
                return False
            return True
        # half-open — allow the probe
        return False


def _record_success(provider):
    """Record a successful request — closes the circuit. Must hold _cb_lock."""
    cb = _get_cb(provider)
    cb["failures"] = 0
    cb["state"] = "closed"


def _record_failure(provider):
    """Record a failed request — may open the circuit. Must hold _cb_lock."""
    cb = _get_cb(provider)
    now = time.time()

    # If last failure was outside the window, reset the counter
    if now - cb["last_failure"] > _CB_FAILURE_WINDOW:
        cb["failures"] = 0

    cb["failures"] += 1
    cb["last_failure"] = now

    if cb["state"] == "half-open":
        # Probe failed — reopen
        cb["state"] = "open"
        cb["opened_at"] = now
    elif cb["failures"] >= _CB_FAILURE_THRESHOLD:
        cb["state"] = "open"
        cb["opened_at"] = now
        print(f"[http-client] Circuit OPEN for '{provider}' after {cb['failures']} consecutive failures")


# ── Core request logic ────────────────────────────────────────────────

def resilient_get(url, provider=None, headers=None, params=None, timeout=None, max_retries=None, **kwargs):
    """GET with retry + circuit breaker. Returns requests.Response on success."""
    return _resilient_request("GET", url, provider=provider, headers=headers,
                              params=params, timeout=timeout, max_retries=max_retries, **kwargs)


def resilient_post(url, provider=None, headers=None, data=None, json=None, timeout=None, max_retries=None, **kwargs):
    """POST with retry + circuit breaker. Returns requests.Response on success."""
    return _resilient_request("POST", url, provider=provider, headers=headers,
                              data=data, json=json, timeout=timeout, max_retries=max_retries, **kwargs)


def _resilient_request(method, url, provider=None, headers=None, params=None,
                       data=None, json=None, timeout=None, max_retries=None, **kwargs):
    """Core retry + circuit breaker logic for any HTTP method."""
    if max_retries is None:
        max_retries = _DEFAULT_MAX_RETRIES
    if timeout is None:
        timeout = 15

    # Check circuit breaker
    if provider and is_circuit_open(provider):
        raise ConnectionError(f"Circuit breaker open for '{provider}' — request blocked")

    last_exception = None
    start_total = time.time()

    for attempt in range(max_retries + 1):
        start = time.time()
        try:
            if method == "GET":
                resp = http_requests.get(url, headers=headers, params=params,
                                         timeout=timeout, **kwargs)
            else:
                resp = http_requests.post(url, headers=headers, params=params,
                                          data=data, json=json, timeout=timeout, **kwargs)

            latency = int((time.time() - start) * 1000)

            # Success path
            if resp.status_code < 400:
                if provider:
                    with _cb_lock:
                        _record_success(provider)
                    _record_health(provider, success=True, latency_ms=latency)
                return resp

            # HTTP 429 — rate limited
            if resp.status_code == 429:
                if provider:
                    _record_health(provider, success=False, latency_ms=latency,
                                   error_msg=f"HTTP 429 (rate limited)")
                if attempt < max_retries:
                    print(f"[http-client] 429 rate limited on {_short_url(url)}, "
                          f"waiting {_RATE_LIMIT_WAIT}s (attempt {attempt + 1}/{max_retries + 1})")
                    time.sleep(_RATE_LIMIT_WAIT)
                    continue
                # Final attempt — record failure and raise
                if provider:
                    with _cb_lock:
                        _record_failure(provider)
                resp.raise_for_status()

            # HTTP 5xx — server error, retryable
            if resp.status_code >= 500:
                if provider:
                    _record_health(provider, success=False, latency_ms=latency,
                                   error_msg=f"HTTP {resp.status_code}")
                if attempt < max_retries:
                    wait = _BACKOFF_BASE * (2 ** attempt)
                    print(f"[http-client] HTTP {resp.status_code} on {_short_url(url)}, "
                          f"retrying in {wait}s (attempt {attempt + 1}/{max_retries + 1})")
                    time.sleep(wait)
                    continue
                # Final attempt
                if provider:
                    with _cb_lock:
                        _record_failure(provider)
                resp.raise_for_status()

            # HTTP 4xx (except 429) — client error, no retry
            if provider:
                with _cb_lock:
                    _record_failure(provider)
                _record_health(provider, success=False, latency_ms=latency,
                               error_msg=f"HTTP {resp.status_code}")
            resp.raise_for_status()

        except (http_requests.exceptions.ConnectionError,
                http_requests.exceptions.Timeout) as e:
            latency = int((time.time() - start) * 1000)
            last_exception = e
            if provider:
                _record_health(provider, success=False, latency_ms=latency,
                               error_msg=str(e)[:80])
            if attempt < max_retries:
                wait = _BACKOFF_BASE * (2 ** attempt)
                print(f"[http-client] {type(e).__name__} on {_short_url(url)}, "
                      f"retrying in {wait}s (attempt {attempt + 1}/{max_retries + 1})")
                time.sleep(wait)
                continue
            # Final attempt — record circuit breaker failure
            if provider:
                with _cb_lock:
                    _record_failure(provider)
            raise

        except http_requests.exceptions.HTTPError:
            # Re-raised from resp.raise_for_status() above
            raise

        except Exception as e:
            # Unexpected errors — don't retry
            latency = int((time.time() - start) * 1000)
            if provider:
                with _cb_lock:
                    _record_failure(provider)
                _record_health(provider, success=False, latency_ms=latency,
                               error_msg=str(e)[:80])
            raise

    # Should not reach here, but just in case
    if last_exception:
        raise last_exception
    raise RuntimeError(f"Exhausted all {max_retries + 1} attempts for {_short_url(url)}")


# ── Helpers ───────────────────────────────────────────────────────────

def _record_health(provider, success, latency_ms, error_msg=None):
    """Auto-call record_api_call when provider is specified."""
    try:
        from services.api_health import record_api_call
        record_api_call(provider, success=success, latency_ms=latency_ms, error_msg=error_msg)
    except Exception:
        pass  # api_health not available — silently skip


def _short_url(url):
    """Shorten URL for log readability — keep domain + first path segment."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path_parts = parsed.path.strip("/").split("/")
        short_path = path_parts[0] if path_parts else ""
        return f"{parsed.netloc}/{short_path}"
    except Exception:
        return url[:60]
