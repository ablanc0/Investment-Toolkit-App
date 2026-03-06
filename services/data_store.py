"""
InvToolkit — Portfolio JSON persistence and generic CRUD helpers.
All reads and writes to portfolio.json go through this module.
"""

import json
from datetime import datetime

from flask import jsonify

from config import PORTFOLIO_FILE


def load_portfolio():
    if PORTFOLIO_FILE.exists():
        return json.loads(PORTFOLIO_FILE.read_text())
    return {"positions": [], "watchlist": [], "cash": 0, "goals": {}, "targets": {}, "strategy": []}


def save_portfolio(data):
    PORTFOLIO_FILE.write_text(json.dumps(data, indent=2))
    from services.backup import notify_backup
    notify_backup()


# ── Generic CRUD helper ─────────────────────────────────────────────────

def crud_list(section):
    """GET: return a list section from portfolio.json."""
    portfolio = load_portfolio()
    return jsonify({section: portfolio.get(section, []), "lastUpdated": datetime.now().isoformat()})

def crud_add(section, item):
    """Add an item to a list section."""
    portfolio = load_portfolio()
    portfolio.setdefault(section, []).append(item)
    save_portfolio(portfolio)
    return jsonify({"ok": True, "item": item})

def crud_update(section, index, updates):
    """Update an item at index in a list section."""
    portfolio = load_portfolio()
    items = portfolio.get(section, [])
    if 0 <= index < len(items):
        items[index].update(updates)
        save_portfolio(portfolio)
        return jsonify({"ok": True, "item": items[index]})
    return jsonify({"error": "Index out of range"}), 404

def crud_delete(section, index):
    """Delete an item at index in a list section."""
    portfolio = load_portfolio()
    items = portfolio.get(section, [])
    if 0 <= index < len(items):
        removed = items.pop(index)
        save_portfolio(portfolio)
        return jsonify({"ok": True, "removed": removed})
    return jsonify({"error": "Index out of range"}), 404

def crud_replace(section, data):
    """Replace entire list section."""
    portfolio = load_portfolio()
    portfolio[section] = data
    save_portfolio(portfolio)
    return jsonify({"ok": True})
