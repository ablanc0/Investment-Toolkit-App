"""Settings Blueprint — user preferences and configuration."""

import copy

import requests as http_requests
from flask import Blueprint, jsonify, request

from config import FMP_BASE
from services.data_store import get_settings, save_settings

bp = Blueprint('settings', __name__)


@bp.route("/api/settings")
def api_settings_get():
    """Return current settings with defaults for missing keys."""
    settings = copy.deepcopy(get_settings())
    # Mask API keys before returning
    api_keys = settings.get("apiKeys", {})
    if api_keys.get("fmp"):
        key = api_keys["fmp"]
        settings["apiKeys"] = {"fmp": "****" + key[-4:] if len(key) > 4 else "****"}
    return jsonify(settings)


@bp.route("/api/settings", methods=["POST"])
def api_settings_post():
    """Shallow-merge updates into settings."""
    updates = request.get_json()
    if not updates or not isinstance(updates, dict):
        return jsonify({"error": "JSON object required"}), 400
    result = copy.deepcopy(save_settings(updates))
    # Mask API keys in response
    api_keys = result.get("apiKeys", {})
    if api_keys.get("fmp"):
        key = api_keys["fmp"]
        result["apiKeys"] = {"fmp": "****" + key[-4:] if len(key) > 4 else "****"}
    return jsonify(result)


@bp.route("/api/settings/test-api-key", methods=["POST"])
def test_api_key():
    """Test if an FMP API key is valid by making a test call."""
    key = request.json.get("key", "")
    if not key:
        return jsonify({"valid": False, "error": "No key provided"})
    try:
        r = http_requests.get(
            f"{FMP_BASE}/profile",
            params={"symbol": "AAPL", "apikey": key},
            timeout=10,
        )
        data = r.json()
        valid = isinstance(data, list) and len(data) > 0
        return jsonify({"valid": valid})
    except Exception:
        return jsonify({"valid": False, "error": "Request failed"})
