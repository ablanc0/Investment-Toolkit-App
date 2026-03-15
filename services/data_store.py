"""
InvToolkit — Portfolio JSON persistence and generic CRUD helpers.
All reads and writes to portfolio.json go through this module.
"""

import json
from datetime import datetime

from flask import jsonify

from config import PORTFOLIO_FILE, DEFAULT_SETTINGS


def load_portfolio():
    if PORTFOLIO_FILE.exists():
        return json.loads(PORTFOLIO_FILE.read_text())
    return {"positions": [], "watchlist": [], "cash": 0, "goals": {}, "targets": {}, "strategy": []}


def save_portfolio(data):
    PORTFOLIO_FILE.write_text(json.dumps(data, indent=2))
    from services.backup import notify_backup
    notify_backup()


# ── Settings ─────────────────────────────────────────────────────────────

def get_settings():
    """Return settings dict, injecting defaults for missing keys."""
    saved = load_portfolio().get("settings", {})
    merged = {}
    for key, default in DEFAULT_SETTINGS.items():
        if key in saved:
            merged[key] = saved[key]
        elif isinstance(default, dict):
            merged[key] = dict(default)
        elif isinstance(default, list):
            merged[key] = [dict(item) if isinstance(item, dict) else item for item in default]
        else:
            merged[key] = default
    # Migrate old flat signalThresholds → nested format
    st = merged.get("signalThresholds", {})
    if st and "iv" not in st and "strongBuy" in st:
        merged["signalThresholds"] = dict(DEFAULT_SETTINGS["signalThresholds"])
        merged["signalThresholds"]["topPerformer"] = st.get("topPerformer", 30)
    return merged


def save_settings(updates):
    """Shallow-merge updates into settings and persist."""
    portfolio = load_portfolio()
    current = portfolio.get("settings", {})
    current.update(updates)
    portfolio["settings"] = current
    save_portfolio(portfolio)
    return get_settings()


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


# ── Account helpers ────────────────────────────────────────────────────

def get_accounts():
    """Return all investment accounts (excluding main taxable portfolio)."""
    return load_portfolio().get("accounts", [])


def get_account(account_id):
    """Find a single account by id, or None."""
    for acct in get_accounts():
        if acct["id"] == account_id:
            return acct
    return None


def save_account(account):
    """Add or update an account in the accounts list."""
    portfolio = load_portfolio()
    accounts = portfolio.setdefault("accounts", [])
    for i, acct in enumerate(accounts):
        if acct["id"] == account["id"]:
            accounts[i] = account
            save_portfolio(portfolio)
            return
    accounts.append(account)
    save_portfolio(portfolio)


def delete_account(account_id):
    """Remove an account by id. Returns True if found and deleted."""
    portfolio = load_portfolio()
    accounts = portfolio.get("accounts", [])
    original_len = len(accounts)
    portfolio["accounts"] = [a for a in accounts if a["id"] != account_id]
    if len(portfolio["accounts"]) < original_len:
        save_portfolio(portfolio)
        return True
    return False
