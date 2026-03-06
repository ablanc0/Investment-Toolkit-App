"""Settings Blueprint — user preferences and configuration."""

from flask import Blueprint, jsonify, request

from services.data_store import get_settings, save_settings

bp = Blueprint('settings', __name__)


@bp.route("/api/settings")
def api_settings_get():
    """Return current settings with defaults for missing keys."""
    return jsonify(get_settings())


@bp.route("/api/settings", methods=["POST"])
def api_settings_post():
    """Shallow-merge updates into settings."""
    updates = request.get_json()
    if not updates or not isinstance(updates, dict):
        return jsonify({"error": "JSON object required"}), 400
    return jsonify(save_settings(updates))
