"""Shared pytest fixtures for InvToolkit tests."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest


SAMPLE_PORTFOLIO = {
    "positions": [
        {
            "ticker": "AAPL",
            "shares": 10,
            "avgCost": 150,
            "category": "Tech",
            "sector": "Technology",
            "secType": "Stock",
        }
    ],
    "watchlist": [{"ticker": "MSFT", "priority": "high"}],
    "cash": 5000,
    "goals": {"portfolioTarget": 100000},
    "targets": {"Tech": 50},
    "settings": {},
}


@pytest.fixture
def tmp_portfolio(tmp_path):
    """Write a sample portfolio.json to a temp directory and return paths."""
    portfolio_file = tmp_path / "portfolio.json"
    portfolio_file.write_text(json.dumps(SAMPLE_PORTFOLIO))
    cache_file = tmp_path / "cache.json"
    return tmp_path, portfolio_file, cache_file


@pytest.fixture
def app(tmp_portfolio):
    """Create Flask app with temp data directory."""
    tmp_path, portfolio_file, cache_file = tmp_portfolio

    with patch("config.DATA_DIR", tmp_path), \
         patch("config.PORTFOLIO_FILE", portfolio_file), \
         patch("config.CACHE_FILE", cache_file), \
         patch("services.data_store.PORTFOLIO_FILE", portfolio_file), \
         patch("services.cache.CACHE_FILE", cache_file), \
         patch("services.backup.DATA_DIR", tmp_path), \
         patch("services.backup.BACKUP_DIR", tmp_path / "backups"), \
         patch("routes.misc.DATA_DIR", tmp_path), \
         patch("routes.misc.PORTFOLIO_FILE", portfolio_file), \
         patch("routes.misc.CACHE_FILE", cache_file):
        from server import create_app
        application = create_app(testing=True)
        yield application


@pytest.fixture
def client(app):
    """Flask test client."""
    return app.test_client()
