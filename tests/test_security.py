"""Tests for security hardening — issues #46, #47, #48, #49."""

import os
from unittest.mock import patch

import pytest

from services.validation import validate_ticker, validate_number, validate_index


# ---------------------------------------------------------------------------
# services/validation.py — validate_ticker
# ---------------------------------------------------------------------------

class TestValidateTicker:
    def test_valid_uppercase(self):
        assert validate_ticker("AAPL") == "AAPL"

    def test_valid_lowercase_normalizes(self):
        assert validate_ticker("aapl") == "AAPL"

    def test_valid_with_dot(self):
        assert validate_ticker("BRK.B") == "BRK.B"

    def test_valid_with_number(self):
        assert validate_ticker("X") == "X"

    def test_valid_mixed_case(self):
        assert validate_ticker("Msft") == "MSFT"

    def test_valid_with_spaces_stripped(self):
        assert validate_ticker("  GOOG  ") == "GOOG"

    def test_empty_string(self):
        assert validate_ticker("") is None

    def test_none(self):
        assert validate_ticker(None) is None

    def test_too_long(self):
        assert validate_ticker("TOOLONGSYMBOL") is None

    def test_xss_script_tag(self):
        assert validate_ticker("<script>alert(1)</script>") is None

    def test_html_injection(self):
        assert validate_ticker('<img src=x onerror="alert(1)">') is None

    def test_sql_injection(self):
        assert validate_ticker("'; DROP TABLE--") is None

    def test_special_chars(self):
        assert validate_ticker("AA@PL") is None

    def test_spaces_only(self):
        assert validate_ticker("   ") is None

    def test_non_string(self):
        assert validate_ticker(123) is None


# ---------------------------------------------------------------------------
# services/validation.py — validate_number
# ---------------------------------------------------------------------------

class TestValidateNumber:
    def test_valid_int(self):
        assert validate_number(42) == 42.0

    def test_valid_float(self):
        assert validate_number(3.14) == 3.14

    def test_valid_string(self):
        assert validate_number("99.5") == 99.5

    def test_nan_returns_default(self):
        assert validate_number(float("nan"), default=0) == 0

    def test_inf_returns_default(self):
        assert validate_number(float("inf"), default=0) == 0

    def test_neg_inf_returns_default(self):
        assert validate_number(float("-inf"), default=0) == 0

    def test_below_min(self):
        assert validate_number(-5, min_val=0, default=0) == 0

    def test_above_max(self):
        assert validate_number(200, max_val=100, default=0) == 0

    def test_within_bounds(self):
        assert validate_number(50, min_val=0, max_val=100) == 50.0

    def test_none_returns_default(self):
        assert validate_number(None, default=-1) == -1

    def test_garbage_string(self):
        assert validate_number("abc", default=0) == 0

    def test_no_default_returns_none(self):
        assert validate_number("abc") is None


# ---------------------------------------------------------------------------
# services/validation.py — validate_index
# ---------------------------------------------------------------------------

class TestValidateIndex:
    def test_valid_zero(self):
        assert validate_index(0, 10) == 0

    def test_valid_last(self):
        assert validate_index(9, 10) == 9

    def test_out_of_bounds(self):
        assert validate_index(10, 10) == -1

    def test_negative(self):
        assert validate_index(-1, 10) == -1

    def test_string_number(self):
        assert validate_index("3", 10) == 3

    def test_invalid_string(self):
        assert validate_index("abc", 10) == -1

    def test_none(self):
        assert validate_index(None, 10) == -1


# ---------------------------------------------------------------------------
# Security Headers (#47, #48)
# ---------------------------------------------------------------------------

class TestSecurityHeaders:
    def test_x_content_type_options(self, client):
        resp = client.get("/")
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"

    def test_x_frame_options(self, client):
        resp = client.get("/")
        assert resp.headers.get("X-Frame-Options") == "SAMEORIGIN"

    def test_x_xss_protection(self, client):
        resp = client.get("/")
        assert resp.headers.get("X-XSS-Protection") == "1; mode=block"

    def test_referrer_policy(self, client):
        resp = client.get("/")
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    def test_headers_on_api_routes(self, client):
        resp = client.get("/api/status")
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "SAMEORIGIN"

    def test_headers_on_post_routes(self, client):
        resp = client.post("/api/cash/update", json={"cash": 1000})
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"


# ---------------------------------------------------------------------------
# Ticker Validation on Routes (#48)
# ---------------------------------------------------------------------------

class TestTickerValidationRoutes:
    def test_analyzer_xss_blocked(self, client):
        resp = client.get("/api/stock-analyzer/<script>")
        assert resp.status_code == 400
        assert "Invalid ticker" in resp.get_json()["error"]

    def test_analyzer_empty_blocked(self, client):
        resp = client.get("/api/stock-analyzer/%20")
        assert resp.status_code == 400

    def test_analyzer_too_long_blocked(self, client):
        resp = client.get("/api/stock-analyzer/ABCDEFGHIJKLMNOP")
        assert resp.status_code == 400

    def test_analyzer_valid_works(self, client):
        resp = client.get("/api/stock-analyzer/AAPL")
        # 200 if cached, or other code — but not 400
        assert resp.status_code != 400

    def test_position_add_xss_blocked(self, client):
        resp = client.post("/api/position/add", json={
            "ticker": "<script>", "shares": 1, "avgCost": 10
        })
        assert resp.status_code == 400
        assert "Invalid ticker" in resp.get_json()["error"]

    def test_position_delete_xss_blocked(self, client):
        resp = client.post("/api/position/delete", json={
            "ticker": "<img src=x>"
        })
        assert resp.status_code == 400

    def test_watchlist_add_xss_blocked(self, client):
        resp = client.post("/api/watchlist/add", json={
            "ticker": "'; DROP TABLE"
        })
        assert resp.status_code == 400

    def test_watchlist_add_valid(self, client):
        resp = client.post("/api/watchlist/add", json={"ticker": "GOOG"})
        assert resp.status_code == 200

    def test_position_add_valid(self, client):
        resp = client.post("/api/position/add", json={
            "ticker": "TSLA", "shares": 5, "avgCost": 250
        })
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Config — No Hardcoded Secrets (#46)
# ---------------------------------------------------------------------------

class TestConfigSecrets:
    def test_fmp_key_from_env(self):
        with patch.dict(os.environ, {"FMP_API_KEY": "test_key_123"}):
            # Re-import to pick up env var
            import importlib
            import config
            importlib.reload(config)
            assert config.FMP_API_KEY == "test_key_123"

    def test_fmp_key_default_empty(self):
        env = os.environ.copy()
        env.pop("FMP_API_KEY", None)
        with patch.dict(os.environ, env, clear=True):
            import importlib
            import config
            importlib.reload(config)
            assert config.FMP_API_KEY == ""

    def test_edgar_user_agent_from_env(self):
        with patch.dict(os.environ, {"EDGAR_USER_AGENT": "MyApp me@test.com"}):
            import importlib
            import config
            importlib.reload(config)
            assert config.EDGAR_USER_AGENT == "MyApp me@test.com"

    def test_edgar_user_agent_default(self):
        env = os.environ.copy()
        env.pop("EDGAR_USER_AGENT", None)
        with patch.dict(os.environ, env, clear=True):
            import importlib
            import config
            importlib.reload(config)
            assert "user@example.com" in config.EDGAR_USER_AGENT

    def test_no_hardcoded_pii_in_config(self):
        """Ensure personal email is not hardcoded in config.py source."""
        from pathlib import Path
        source = (Path(__file__).parent.parent / "config.py").read_text()
        assert "ale.blancoglez91" not in source
