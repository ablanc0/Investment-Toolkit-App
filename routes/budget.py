"""
InvToolkit — Budget & Net Worth API routes.
"""

import uuid

from flask import Blueprint, jsonify, request
from services.data_store import load_portfolio, save_portfolio

bp = Blueprint("budget", __name__)

MONTH_KEYS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]


# ── Helpers ───────────────────────────────────────────────────────────

def _get_budget(portfolio=None):
    """Return budget section, or empty default."""
    if portfolio is None:
        portfolio = load_portfolio()
    return portfolio.get("budget", {})


def _get_net_worth(portfolio=None):
    """Return netWorth section, or empty default."""
    if portfolio is None:
        portfolio = load_portfolio()
    return portfolio.get("netWorth", {})


def _effective_budget(categories, month_data):
    """Compute effective budgeted amount per subcategory for a month.
    Uses override if present, otherwise master budget.
    """
    overrides = month_data.get("overrides", {})
    effective = {}
    for cat in categories:
        cat_overrides = overrides.get(cat["id"], {})
        cat_budget = {}
        for sub in cat["subcategories"]:
            name = sub["name"]
            cat_budget[name] = cat_overrides.get(name, sub["budgeted"])
        effective[cat["id"]] = cat_budget
    return effective


def _recompute_actuals(month_data):
    """Rebuild actuals by summing transactions per subcategory."""
    transactions = month_data.get("transactions", {})
    actuals = {}
    for cat_id, txns in transactions.items():
        cat_actuals = {}
        for txn in txns:
            sub = txn["subcategory"]
            cat_actuals[sub] = round(cat_actuals.get(sub, 0) + txn["amount"], 2)
        actuals[cat_id] = cat_actuals
    month_data["actuals"] = actuals


def _compute_month_summary(categories, month_data):
    """Compute totals for a single month."""
    actuals = month_data.get("actuals", {})
    effective = _effective_budget(categories, month_data)

    summary = {}
    for cat in categories:
        cid = cat["id"]
        cat_actuals = actuals.get(cid, {})
        cat_budget = effective.get(cid, {})
        total_budgeted = sum(cat_budget.values())
        total_actual = sum(cat_actuals.values())
        summary[cid] = {
            "budgeted": round(total_budgeted, 2),
            "actual": round(total_actual, 2),
            "remaining": round(total_budgeted - total_actual, 2),
        }

    total_income = summary.get("income", {}).get("actual", 0)
    total_expenses = sum(
        summary.get(c, {}).get("actual", 0)
        for c in ("essential", "discretionary", "debt")
    )
    total_savings = summary.get("savings", {}).get("actual", 0)
    total_investments = summary.get("investments", {}).get("actual", 0)
    total_outflows = total_expenses + total_savings + total_investments
    remainder = round(total_income - total_outflows, 2)
    savings_rate = round((total_savings + total_investments) / total_income * 100, 2) if total_income else 0

    return {
        "categories": summary,
        "totalIncome": round(total_income, 2),
        "totalExpenses": round(total_expenses, 2),
        "totalSavings": round(total_savings, 2),
        "totalInvestments": round(total_investments, 2),
        "remainder": remainder,
        "savingsRate": savings_rate,
    }


def _compute_rollover_amounts(budget):
    """Compute rollover amounts for each month.
    If rollover enabled, carry forward prev month's remainder.
    """
    categories = budget.get("categories", [])
    months = budget.get("months", {})
    rollover_amounts = {}
    prev_remainder = 0

    for mk in MONTH_KEYS:
        if mk not in months:
            continue
        md = months[mk]
        rollover = md.get("rollover", False)
        carry = prev_remainder if rollover else 0
        rollover_amounts[mk] = round(carry, 2)

        summary = _compute_month_summary(categories, md)
        prev_remainder = summary["remainder"] + carry

    return rollover_amounts


# ── Budget Routes ─────────────────────────────────────────────────────

@bp.route("/api/budget")
def api_budget():
    """Full budget data with computed totals per month."""
    budget = _get_budget()
    if not budget:
        return jsonify({"budget": {}})

    categories = budget.get("categories", [])
    months = budget.get("months", {})

    month_summaries = {}
    for mk in MONTH_KEYS:
        if mk in months:
            month_summaries[mk] = _compute_month_summary(categories, months[mk])

    rollover_amounts = _compute_rollover_amounts(budget)

    return jsonify({
        "budget": {
            "year": budget.get("year", 2026),
            "currency": budget.get("currency", "$"),
            "goals": budget.get("goals", []),
            "categories": categories,
            "months": months,
            "summaries": month_summaries,
            "rolloverAmounts": rollover_amounts,
        }
    })


@bp.route("/api/budget/import", methods=["POST"])
def api_budget_import():
    """Import budget from Excel file."""
    from config import DATA_DIR
    from services.budget_import import import_budget

    data = request.get_json(silent=True) or {}
    filepath = data.get("filepath")
    if not filepath:
        # Default: look in DATA_DIR
        import glob
        matches = glob.glob(str(DATA_DIR / "*Presupuesto*Patrimonio*.xlsx"))
        if not matches:
            return jsonify({"error": "No budget Excel file found in data directory"}), 404
        filepath = matches[0]

    try:
        result = import_budget(filepath)
    except Exception as e:
        return jsonify({"error": f"Import failed: {str(e)}"}), 400

    portfolio = load_portfolio()
    portfolio["budget"] = result["budget"]
    portfolio["netWorth"] = result["netWorth"]
    save_portfolio(portfolio)

    return jsonify({"ok": True, "months": len(result["budget"].get("months", {})),
                     "assets": len(result["netWorth"].get("assets", [])),
                     "snapshots": len(result["netWorth"].get("snapshots", []))})


@bp.route("/api/budget/actual", methods=["POST"])
def api_budget_actual():
    """Update an actual amount: {month, categoryId, subcategory, amount}."""
    data = request.get_json()
    month = data.get("month")
    cat_id = data.get("categoryId")
    sub = data.get("subcategory")
    amount = data.get("amount")

    if not all([month, cat_id, sub]) or amount is None:
        return jsonify({"error": "month, categoryId, subcategory, and amount required"}), 400

    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    months = budget.setdefault("months", {})
    month_data = months.setdefault(month, {"actuals": {}, "rollover": False})
    actuals = month_data.setdefault("actuals", {})
    cat_actuals = actuals.setdefault(cat_id, {})
    cat_actuals[sub] = float(amount)

    save_portfolio(portfolio)
    return jsonify({"ok": True})


@bp.route("/api/budget/override", methods=["POST"])
def api_budget_override():
    """Override budget for a specific month: {month, categoryId, subcategory, amount}.
    If amount is null, clear the override.
    """
    data = request.get_json()
    month = data.get("month")
    cat_id = data.get("categoryId")
    sub = data.get("subcategory")
    amount = data.get("amount")

    if not all([month, cat_id, sub]):
        return jsonify({"error": "month, categoryId, and subcategory required"}), 400

    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    months = budget.setdefault("months", {})
    month_data = months.setdefault(month, {"actuals": {}, "rollover": False})
    overrides = month_data.setdefault("overrides", {})
    cat_overrides = overrides.setdefault(cat_id, {})

    if amount is None:
        # Clear override
        cat_overrides.pop(sub, None)
        if not cat_overrides:
            overrides.pop(cat_id, None)
    else:
        cat_overrides[sub] = float(amount)

    save_portfolio(portfolio)
    return jsonify({"ok": True})


@bp.route("/api/budget/goals", methods=["POST"])
def api_budget_goals():
    """Update goals array."""
    data = request.get_json()
    goals = data.get("goals", [])
    portfolio = load_portfolio()
    budget = portfolio.setdefault("budget", {})
    budget["goals"] = goals
    save_portfolio(portfolio)
    return jsonify({"ok": True})


@bp.route("/api/budget/category", methods=["POST"])
def api_budget_category():
    """Add or update a category/subcategory."""
    data = request.get_json()
    cat_id = data.get("categoryId")
    subcategory = data.get("subcategory")  # {name, budgeted}

    if not cat_id or not subcategory:
        return jsonify({"error": "categoryId and subcategory required"}), 400

    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    categories = budget.get("categories", [])

    for cat in categories:
        if cat["id"] == cat_id:
            # Update existing or add new subcategory
            for i, s in enumerate(cat["subcategories"]):
                if s["name"] == subcategory["name"]:
                    cat["subcategories"][i] = subcategory
                    save_portfolio(portfolio)
                    return jsonify({"ok": True, "action": "updated"})
            cat["subcategories"].append(subcategory)
            save_portfolio(portfolio)
            return jsonify({"ok": True, "action": "added"})

    return jsonify({"error": f"Category '{cat_id}' not found"}), 404


@bp.route("/api/budget/subcategory/delete", methods=["POST"])
def api_budget_subcategory_delete():
    """Delete a subcategory: {categoryId, name}."""
    data = request.get_json()
    cat_id = data.get("categoryId")
    name = data.get("name")

    if not cat_id or not name:
        return jsonify({"error": "categoryId and name required"}), 400

    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    categories = budget.get("categories", [])

    for cat in categories:
        if cat["id"] == cat_id:
            original_len = len(cat["subcategories"])
            cat["subcategories"] = [s for s in cat["subcategories"] if s["name"] != name]
            if len(cat["subcategories"]) == original_len:
                return jsonify({"error": f"Subcategory '{name}' not found"}), 404
            save_portfolio(portfolio)
            return jsonify({"ok": True})

    return jsonify({"error": f"Category '{cat_id}' not found"}), 404


# ── Transaction CRUD ──────────────────────────────────────────────────

@bp.route("/api/budget/transaction", methods=["POST"])
def api_budget_transaction_add():
    """Add a transaction: {month, categoryId, subcategory, date, amount, notes}."""
    data = request.get_json()
    month = data.get("month")
    cat_id = data.get("categoryId")
    sub = data.get("subcategory")
    date = data.get("date", "")
    amount = data.get("amount")
    notes = data.get("notes", "")

    if not all([month, cat_id, sub]) or amount is None:
        return jsonify({"error": "month, categoryId, subcategory, and amount required"}), 400

    txn_id = uuid.uuid4().hex[:8]

    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    months = budget.setdefault("months", {})
    month_data = months.setdefault(month, {"actuals": {}, "rollover": False})
    transactions = month_data.setdefault("transactions", {})
    cat_txns = transactions.setdefault(cat_id, [])

    cat_txns.append({
        "id": txn_id,
        "subcategory": sub,
        "date": date,
        "amount": float(amount),
        "notes": notes,
    })

    _recompute_actuals(month_data)
    save_portfolio(portfolio)
    return jsonify({"ok": True, "id": txn_id})


@bp.route("/api/budget/transaction/<txn_id>", methods=["PUT"])
def api_budget_transaction_update(txn_id):
    """Update a transaction: {month, categoryId, ...fields to update}."""
    data = request.get_json()
    month = data.get("month")
    cat_id = data.get("categoryId")

    if not month or not cat_id:
        return jsonify({"error": "month and categoryId required"}), 400

    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    months = budget.get("months", {})
    month_data = months.get(month)
    if not month_data:
        return jsonify({"error": "Month not found"}), 404

    transactions = month_data.get("transactions", {})
    cat_txns = transactions.get(cat_id, [])

    for txn in cat_txns:
        if txn["id"] == txn_id:
            if "subcategory" in data:
                txn["subcategory"] = data["subcategory"]
            if "date" in data:
                txn["date"] = data["date"]
            if "amount" in data:
                txn["amount"] = float(data["amount"])
            if "notes" in data:
                txn["notes"] = data["notes"]
            _recompute_actuals(month_data)
            save_portfolio(portfolio)
            return jsonify({"ok": True})

    return jsonify({"error": "Transaction not found"}), 404


@bp.route("/api/budget/transaction/<txn_id>", methods=["DELETE"])
def api_budget_transaction_delete(txn_id):
    """Delete a transaction: {month, categoryId} as query params or JSON body."""
    data = request.get_json(silent=True) or {}
    month = data.get("month") or request.args.get("month")
    cat_id = data.get("categoryId") or request.args.get("categoryId")

    if not month or not cat_id:
        return jsonify({"error": "month and categoryId required"}), 400

    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    months = budget.get("months", {})
    month_data = months.get(month)
    if not month_data:
        return jsonify({"error": "Month not found"}), 404

    transactions = month_data.get("transactions", {})
    cat_txns = transactions.get(cat_id, [])
    original_len = len(cat_txns)
    transactions[cat_id] = [t for t in cat_txns if t["id"] != txn_id]

    if len(transactions[cat_id]) == original_len:
        return jsonify({"error": "Transaction not found"}), 404

    _recompute_actuals(month_data)
    save_portfolio(portfolio)
    return jsonify({"ok": True})


@bp.route("/api/budget/rollover", methods=["POST"])
def api_budget_rollover():
    """Toggle rollover for a month: {month, enabled}."""
    data = request.get_json()
    month = data.get("month")
    enabled = data.get("enabled", False)

    if not month:
        return jsonify({"error": "month required"}), 400

    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    months = budget.setdefault("months", {})
    month_data = months.setdefault(month, {"actuals": {}, "rollover": False})
    month_data["rollover"] = bool(enabled)

    save_portfolio(portfolio)
    return jsonify({"ok": True})


@bp.route("/api/budget/annual/notes", methods=["POST"])
def api_budget_annual_notes():
    """Save annual notes: {notes}."""
    data = request.get_json()
    notes = data.get("notes", "")

    portfolio = load_portfolio()
    budget = portfolio.setdefault("budget", {})
    budget["annualNotes"] = notes
    save_portfolio(portfolio)
    return jsonify({"ok": True})


@bp.route("/api/budget/transactions/migrate", methods=["POST"])
def api_budget_transactions_migrate():
    """Create synthetic transactions from existing actuals (legacy migration)."""
    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    months = budget.get("months", {})
    migrated_count = 0

    for mk, month_data in months.items():
        if month_data.get("transactions"):
            continue  # Already has transactions
        actuals = month_data.get("actuals", {})
        if not actuals:
            continue

        transactions = {}
        for cat_id, cat_actuals in actuals.items():
            cat_txns = []
            for sub_name, amount in cat_actuals.items():
                if amount == 0:
                    continue
                # Default date: 1st of month
                month_idx = MONTH_KEYS.index(mk) + 1 if mk in MONTH_KEYS else 1
                year = budget.get("year", 2026)
                default_date = f"{year}-{month_idx:02d}-01"
                cat_txns.append({
                    "id": uuid.uuid4().hex[:8],
                    "subcategory": sub_name,
                    "date": default_date,
                    "amount": float(amount),
                    "notes": "Migrated from legacy actuals",
                })
            if cat_txns:
                transactions[cat_id] = cat_txns
                migrated_count += len(cat_txns)

        if transactions:
            month_data["transactions"] = transactions

    save_portfolio(portfolio)
    return jsonify({"ok": True, "migrated": migrated_count})


@bp.route("/api/budget/transactions/backfill-dates", methods=["POST"])
def api_budget_backfill_dates():
    """Set default dates for transactions with empty dates."""
    portfolio = load_portfolio()
    budget = portfolio.get("budget", {})
    months = budget.get("months", {})
    year = budget.get("year", 2026)
    patched = 0

    for mk, month_data in months.items():
        transactions = month_data.get("transactions", {})
        if not transactions:
            continue
        month_idx = MONTH_KEYS.index(mk) + 1 if mk in MONTH_KEYS else 1
        default_date = f"{year}-{month_idx:02d}-01"
        for cat_txns in transactions.values():
            for txn in cat_txns:
                if not txn.get("date"):
                    txn["date"] = default_date
                    patched += 1

    save_portfolio(portfolio)
    return jsonify({"ok": True, "patched": patched})


@bp.route("/api/budget/annual")
def api_budget_annual():
    """Computed annual dashboard: monthly totals, savings rates, per-subcategory grids."""
    budget = _get_budget()
    if not budget:
        return jsonify({"annual": {}})

    categories = budget.get("categories", [])
    months = budget.get("months", {})

    monthly = []
    annual_totals = {}
    for mk in MONTH_KEYS:
        if mk not in months:
            continue
        summary = _compute_month_summary(categories, months[mk])
        summary["month"] = mk
        monthly.append(summary)

        # Accumulate annual totals
        for cid, vals in summary["categories"].items():
            if cid not in annual_totals:
                annual_totals[cid] = {"budgeted": 0, "actual": 0}
            annual_totals[cid]["budgeted"] += vals["budgeted"]
            annual_totals[cid]["actual"] += vals["actual"]

    # Compute ratios
    for cid, vals in annual_totals.items():
        vals["ratio"] = round(vals["actual"] / vals["budgeted"] * 100, 1) if vals["budgeted"] else 0

    # Per-subcategory × month detail grids
    detail_grids = {}
    for cat in categories:
        cid = cat["id"]
        sub_names = [s["name"] for s in cat["subcategories"]]
        grid = {}
        for sub_name in sub_names:
            row = {}
            total = 0
            for mk in MONTH_KEYS:
                if mk in months:
                    val = months[mk].get("actuals", {}).get(cid, {}).get(sub_name, 0)
                else:
                    val = 0
                row[mk] = val
                total += val
            row["total"] = round(total, 2)
            grid[sub_name] = row
        detail_grids[cid] = grid

    # Savings rate with MoM changes
    savings_rates = []
    for i, entry in enumerate(monthly):
        rate = entry["savingsRate"]
        prev_rate = monthly[i - 1]["savingsRate"] if i > 0 else rate
        mom_change = round(rate - prev_rate, 2)
        savings_rates.append({
            "month": entry["month"],
            "rate": rate,
            "momChange": mom_change,
        })

    return jsonify({
        "annual": {
            "monthly": monthly,
            "totals": annual_totals,
            "monthCount": len(monthly),
            "detailGrids": detail_grids,
            "savingsRates": savings_rates,
            "annualNotes": budget.get("annualNotes", ""),
        }
    })


# ── Net Worth Routes ──────────────────────────────────────────────────

@bp.route("/api/net-worth")
def api_net_worth():
    """Net worth data with computed growth metrics."""
    nw = _get_net_worth()
    if not nw:
        return jsonify({"netWorth": {}})

    snapshots = nw.get("snapshots", [])

    # Compute totals and growth for each snapshot
    enriched = []
    prev_net = None
    start_net = None
    for snap in snapshots:
        total_assets = sum(snap.get("assets", {}).values())
        total_liabilities = sum(snap.get("liabilities", {}).values())
        net = total_assets - total_liabilities

        if start_net is None:
            start_net = net

        monthly_growth = round((net - prev_net) / prev_net * 100, 2) if prev_net and prev_net != 0 else 0
        cumulative_growth = round((net - start_net) / start_net * 100, 2) if start_net and start_net != 0 else 0

        enriched.append({
            **snap,
            "totalAssets": round(total_assets, 2),
            "totalLiabilities": round(total_liabilities, 2),
            "netWorth": round(net, 2),
            "monthlyGrowth": monthly_growth,
            "cumulativeGrowth": cumulative_growth,
        })
        prev_net = net

    return jsonify({
        "netWorth": {
            "assets": nw.get("assets", []),
            "liabilities": nw.get("liabilities", []),
            "snapshots": enriched,
        }
    })


@bp.route("/api/net-worth/snapshot", methods=["POST"])
def api_net_worth_snapshot():
    """Update or add a snapshot: {month, year, assets: {...}, liabilities: {...}}."""
    data = request.get_json()
    month = data.get("month")
    year = data.get("year", 2026)

    if not month:
        return jsonify({"error": "month required"}), 400

    portfolio = load_portfolio()
    nw = portfolio.setdefault("netWorth", {})
    snapshots = nw.setdefault("snapshots", [])

    # Find existing snapshot for this month
    for i, snap in enumerate(snapshots):
        if snap["month"] == month and snap.get("year") == year:
            if "assets" in data:
                snap["assets"].update(data["assets"])
            if "liabilities" in data:
                snap["liabilities"].update(data["liabilities"])
            save_portfolio(portfolio)
            return jsonify({"ok": True, "action": "updated"})

    # Add new snapshot
    new_snap = {
        "month": month,
        "year": year,
        "assets": data.get("assets", {}),
        "liabilities": data.get("liabilities", {}),
    }
    snapshots.append(new_snap)
    save_portfolio(portfolio)
    return jsonify({"ok": True, "action": "added"})


@bp.route("/api/net-worth/snapshot/cell", methods=["POST"])
def api_net_worth_snapshot_cell():
    """Update a single cell in a snapshot: {month, type: 'asset'|'liability', name, value}."""
    data = request.get_json()
    month = data.get("month")
    item_type = data.get("type")
    name = data.get("name")
    value = data.get("value")

    if not all([month, item_type, name]) or value is None:
        return jsonify({"error": "month, type, name, and value required"}), 400

    portfolio = load_portfolio()
    nw = portfolio.setdefault("netWorth", {})
    snapshots = nw.setdefault("snapshots", [])

    section = "assets" if item_type == "asset" else "liabilities"

    for snap in snapshots:
        if snap["month"] == month:
            snap.setdefault(section, {})[name] = float(value)
            save_portfolio(portfolio)
            return jsonify({"ok": True})

    # Create new snapshot with this value
    new_snap = {
        "month": month,
        "year": 2026,
        "assets": {},
        "liabilities": {},
    }
    new_snap[section][name] = float(value)
    snapshots.append(new_snap)
    save_portfolio(portfolio)
    return jsonify({"ok": True, "action": "created"})


@bp.route("/api/net-worth/asset", methods=["POST"])
def api_net_worth_asset():
    """Add or remove asset/liability item: {type: 'asset'|'liability', name, group, action: 'add'|'remove'}."""
    data = request.get_json()
    item_type = data.get("type")
    name = data.get("name")
    action = data.get("action", "add")

    if not item_type or not name:
        return jsonify({"error": "type and name required"}), 400

    portfolio = load_portfolio()
    nw = portfolio.setdefault("netWorth", {})

    section = "assets" if item_type == "asset" else "liabilities"
    items = nw.setdefault(section, [])

    if action == "remove":
        nw[section] = [i for i in items if i["name"] != name]
        save_portfolio(portfolio)
        return jsonify({"ok": True, "action": "removed"})

    # Add (no duplicates)
    if any(i["name"] == name for i in items):
        return jsonify({"error": f"'{name}' already exists"}), 400

    group = data.get("group", "other")
    items.append({"name": name, "group": group})
    save_portfolio(portfolio)
    return jsonify({"ok": True, "action": "added"})
