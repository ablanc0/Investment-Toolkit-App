"""Tests for services/http_client.py — resilient HTTP with retry + circuit breaker."""

import time
from unittest.mock import patch, MagicMock

import pytest
import requests


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_circuit_breakers():
    """Reset circuit breaker state before and after each test."""
    import services.http_client as hc
    hc._circuit_breakers.clear()
    yield
    hc._circuit_breakers.clear()


# ---------------------------------------------------------------------------
# resilient_get — success and retry paths
# ---------------------------------------------------------------------------

@patch("services.http_client._record_health")
@patch("services.http_client.http_requests.get")
def test_resilient_get_success(mock_get, mock_health):
    """Successful GET returns the response and records health as success."""
    from services.http_client import resilient_get

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_get.return_value = mock_resp

    result = resilient_get("https://example.com/api", provider="testprov")

    assert result is mock_resp
    mock_get.assert_called_once()
    mock_health.assert_called_once()
    call_kwargs = mock_health.call_args
    assert call_kwargs[0][0] == "testprov"
    assert call_kwargs[1]["success"] is True


@patch("services.http_client._record_health")
@patch("services.http_client.time.sleep")
@patch("services.http_client.http_requests.get")
def test_resilient_get_retry_on_500(mock_get, mock_sleep, mock_health):
    """500 on first attempt triggers retry; 200 on second attempt succeeds."""
    from services.http_client import resilient_get

    resp_500 = MagicMock()
    resp_500.status_code = 500
    resp_200 = MagicMock()
    resp_200.status_code = 200

    mock_get.side_effect = [resp_500, resp_200]

    result = resilient_get("https://example.com/api", provider="testprov", max_retries=1)

    assert result is resp_200
    assert mock_get.call_count == 2
    mock_sleep.assert_called_once()


@patch("services.http_client._record_health")
@patch("services.http_client.time.sleep")
@patch("services.http_client.http_requests.get")
def test_resilient_get_no_retry_on_4xx(mock_get, mock_sleep, mock_health):
    """400 raises HTTPError immediately without retrying."""
    from services.http_client import resilient_get

    resp_400 = MagicMock()
    resp_400.status_code = 400
    resp_400.raise_for_status.side_effect = requests.exceptions.HTTPError("400 Bad Request")
    mock_get.return_value = resp_400

    with pytest.raises(requests.exceptions.HTTPError):
        resilient_get("https://example.com/api", provider="testprov", max_retries=2)

    # Should not retry — only one call
    assert mock_get.call_count == 1
    mock_sleep.assert_not_called()


@patch("services.http_client._record_health")
@patch("services.http_client.time.sleep")
@patch("services.http_client.http_requests.get")
def test_resilient_get_retry_on_connection_error(mock_get, mock_sleep, mock_health):
    """ConnectionError on first attempt triggers retry; second attempt succeeds."""
    from services.http_client import resilient_get

    resp_200 = MagicMock()
    resp_200.status_code = 200

    mock_get.side_effect = [requests.exceptions.ConnectionError("refused"), resp_200]

    result = resilient_get("https://example.com/api", provider="testprov", max_retries=1)

    assert result is resp_200
    assert mock_get.call_count == 2
    mock_sleep.assert_called_once()


@patch("services.http_client._record_health")
@patch("services.http_client.time.sleep")
@patch("services.http_client.http_requests.get")
def test_resilient_get_429_retry(mock_get, mock_sleep, mock_health):
    """429 rate limited triggers retry with backoff, then succeeds."""
    from services.http_client import resilient_get

    resp_429 = MagicMock()
    resp_429.status_code = 429
    resp_200 = MagicMock()
    resp_200.status_code = 200

    mock_get.side_effect = [resp_429, resp_200]

    result = resilient_get("https://example.com/api", provider="testprov", max_retries=1)

    assert result is resp_200
    assert mock_get.call_count == 2
    mock_sleep.assert_called_once()


@patch("services.http_client._record_health")
@patch("services.http_client.http_requests.get")
def test_resilient_get_no_provider(mock_get, mock_health):
    """Call without provider param works but doesn't record health."""
    from services.http_client import resilient_get

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_get.return_value = mock_resp

    result = resilient_get("https://example.com/api")

    assert result is mock_resp
    mock_health.assert_not_called()


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

@patch("services.http_client._record_health")
@patch("services.http_client.time.sleep")
@patch("services.http_client.http_requests.get")
def test_circuit_breaker_opens(mock_get, mock_sleep, mock_health):
    """3+ consecutive failures for a provider opens the circuit."""
    from services.http_client import resilient_get, is_circuit_open

    resp_500 = MagicMock()
    resp_500.status_code = 500
    resp_500.raise_for_status.side_effect = requests.exceptions.HTTPError("500 Server Error")
    mock_get.return_value = resp_500

    # Trigger 3 failures (each call with max_retries=0 = 1 attempt = 1 failure)
    for _ in range(3):
        with pytest.raises(requests.exceptions.HTTPError):
            resilient_get("https://example.com/api", provider="broken_svc", max_retries=0)

    assert is_circuit_open("broken_svc") is True


@patch("services.http_client._record_health")
@patch("services.http_client.time.sleep")
@patch("services.http_client.http_requests.get")
def test_circuit_breaker_closes_after_timeout(mock_get, mock_sleep, mock_health):
    """After open duration elapses, circuit transitions to half-open (allows probe)."""
    from services.http_client import resilient_get, is_circuit_open, _circuit_breakers, _CB_OPEN_DURATION

    resp_500 = MagicMock()
    resp_500.status_code = 500
    resp_500.raise_for_status.side_effect = requests.exceptions.HTTPError("500 Server Error")
    mock_get.return_value = resp_500

    # Trip the breaker
    for _ in range(3):
        with pytest.raises(requests.exceptions.HTTPError):
            resilient_get("https://example.com/api", provider="aging_svc", max_retries=0)

    assert is_circuit_open("aging_svc") is True

    # Simulate time passing beyond the open duration
    _circuit_breakers["aging_svc"]["opened_at"] = time.time() - _CB_OPEN_DURATION - 1

    # Now the circuit should allow a probe (half-open)
    assert is_circuit_open("aging_svc") is False
