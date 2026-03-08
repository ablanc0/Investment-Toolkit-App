"""Tax Accounts Blueprint — HSA settings, expenses CRUD, file upload."""

import os
import uuid
from flask import Blueprint, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from config import DATA_DIR, FEDERAL_BRACKETS
from models.salary_calc import get_marginal_rates, _get_salary_data
from services.data_store import load_portfolio, save_portfolio, crud_add, crud_update, crud_delete

bp = Blueprint('tax_accounts', __name__)

RECEIPTS_DIR = DATA_DIR / "hsa-receipts"
ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}
HSA_CATEGORIES = ["Medical", "Dental", "Vision", "Prescription", "Mental Health", "Other"]
HSA_PAID_FROM = ["Out-of-Pocket", "HSA Direct", "Insurance+OOP"]


def _compute_hsa_analysis(extra_income, rates):
    """Compute HSA Bronze vs Silver analysis."""
    if extra_income <= 0:
        return None
    fica_rate = 0.0765  # SS 6.2% + Medicare 1.45%
    fica_cost = round(extra_income * fica_rate, 2)
    effective_gain = round(extra_income - fica_cost, 2)
    combined = rates["combinedRate"]
    return {
        "extraIncome": extra_income,
        "ficaCost": fica_cost,
        "effectiveGain": effective_gain,
        "combinedMarginalRate": round(combined * 100, 2),
        "aggressive": {
            "contribution": extra_income,
            "taxRecovered": round(extra_income * combined, 2),
        },
        "cashNeutral": {
            "contribution": effective_gain,
            "taxRecovered": round(effective_gain * combined, 2),
        },
    }


def _compute_hsa_kpis(expenses):
    """Compute KPI summaries from expenses list."""
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    unreimbursed = sum(
        e.get("amount", 0) for e in expenses
        if not e.get("reimbursed") and e.get("paidFrom") == "Out-of-Pocket"
    )
    pending_receipts = sum(1 for e in expenses if not e.get("receiptFile"))
    return {
        "totalExpenses": round(total_expenses, 2),
        "unreimbursedBalance": round(unreimbursed, 2),
        "pendingReceipts": pending_receipts,
        "expenseCount": len(expenses),
    }


@bp.route("/api/tax-accounts/hsa")
def api_hsa():
    from datetime import datetime
    portfolio = load_portfolio()

    # HSA settings (migrate from salary profile if needed)
    hsa_settings = portfolio.get("hsaSettings", {})
    if not hsa_settings.get("extraIncome"):
        salary = _get_salary_data(portfolio)
        pid = salary.get("activeProfile", "alejandro")
        profile = salary.get("profiles", {}).get(pid, {})
        old_val = profile.get("hsaExtraIncome", 0)
        if old_val > 0:
            hsa_settings["extraIncome"] = old_val
            portfolio["hsaSettings"] = hsa_settings
            save_portfolio(portfolio)

    # Get marginal rates from salary profile
    salary = _get_salary_data(portfolio)
    pid = salary.get("activeProfile", "alejandro")
    profile = salary.get("profiles", {}).get(pid, {})
    rates = get_marginal_rates(profile)

    extra_income = hsa_settings.get("extraIncome", 0)
    hsa = _compute_hsa_analysis(extra_income, rates)
    expenses = portfolio.get("hsaExpenses", [])
    kpis = _compute_hsa_kpis(expenses)

    return jsonify({
        "hsa": hsa,
        "marginalRates": {k: round(v * 100, 2) for k, v in rates.items()},
        "hsaSettings": hsa_settings,
        "expenses": expenses,
        "kpis": kpis,
        "categories": HSA_CATEGORIES,
        "paidFromOptions": HSA_PAID_FROM,
        "lastUpdated": datetime.now().isoformat(),
    })


@bp.route("/api/tax-accounts/hsa/settings", methods=["POST"])
def api_hsa_settings():
    b = request.get_json()
    portfolio = load_portfolio()
    hsa_settings = portfolio.get("hsaSettings", {})
    if "extraIncome" in b:
        hsa_settings["extraIncome"] = float(b["extraIncome"])
    portfolio["hsaSettings"] = hsa_settings
    save_portfolio(portfolio)

    # Also update salary profile for backward compat
    salary = _get_salary_data(portfolio)
    pid = salary.get("activeProfile", "alejandro")
    profile = salary.get("profiles", {}).get(pid, {})
    profile["hsaExtraIncome"] = hsa_settings.get("extraIncome", 0)
    save_portfolio(portfolio)

    rates = get_marginal_rates(profile)
    hsa = _compute_hsa_analysis(hsa_settings.get("extraIncome", 0), rates)
    expenses = portfolio.get("hsaExpenses", [])
    kpis = _compute_hsa_kpis(expenses)
    return jsonify({"ok": True, "hsa": hsa, "hsaSettings": hsa_settings, "kpis": kpis})


@bp.route("/api/tax-accounts/hsa/expenses/add", methods=["POST"])
def api_hsa_expense_add():
    b = request.get_json()
    item = {
        "date": b.get("date", ""),
        "provider": b.get("provider", "").strip(),
        "description": b.get("description", "").strip(),
        "category": b.get("category", "Medical"),
        "amount": float(b.get("amount", 0)),
        "paidFrom": b.get("paidFrom", "Out-of-Pocket"),
        "reimbursed": bool(b.get("reimbursed", False)),
        "receiptFile": "",
        "notes": b.get("notes", "").strip(),
    }
    return crud_add("hsaExpenses", item)


@bp.route("/api/tax-accounts/hsa/expenses/update", methods=["POST"])
def api_hsa_expense_update():
    b = request.get_json()
    return crud_update("hsaExpenses", int(b.get("index", -1)), b.get("updates", {}))


@bp.route("/api/tax-accounts/hsa/expenses/delete", methods=["POST"])
def api_hsa_expense_delete():
    b = request.get_json()
    index = int(b.get("index", -1))
    # Clean up receipt file if exists
    portfolio = load_portfolio()
    expenses = portfolio.get("hsaExpenses", [])
    if 0 <= index < len(expenses):
        filename = expenses[index].get("receiptFile", "")
        if filename:
            filepath = RECEIPTS_DIR / filename
            if filepath.exists():
                filepath.unlink()
    return crud_delete("hsaExpenses", index)


@bp.route("/api/tax-accounts/hsa/receipts/upload", methods=["POST"])
def api_hsa_receipt_upload():
    if 'receipt' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['receipt']
    expense_index = int(request.form.get('expenseIndex', -1))

    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"File type .{ext} not allowed"}), 400

    # Get expense info for filename
    portfolio = load_portfolio()
    expenses = portfolio.get("hsaExpenses", [])
    if not (0 <= expense_index < len(expenses)):
        return jsonify({"error": "Invalid expense index"}), 404

    expense = expenses[expense_index]
    date_part = expense.get("date", "unknown")
    provider_slug = secure_filename(expense.get("provider", "receipt"))[:20]
    uid = uuid.uuid4().hex[:8]
    filename = f"{date_part}_{provider_slug}_{uid}.{ext}"

    os.makedirs(RECEIPTS_DIR, exist_ok=True)

    # Delete old file if replacing
    old_file = expense.get("receiptFile", "")
    if old_file:
        old_path = RECEIPTS_DIR / old_file
        if old_path.exists():
            old_path.unlink()

    file.save(RECEIPTS_DIR / filename)
    expenses[expense_index]["receiptFile"] = filename
    portfolio["hsaExpenses"] = expenses
    save_portfolio(portfolio)

    return jsonify({"ok": True, "filename": filename})


@bp.route("/api/tax-accounts/hsa/receipts/<filename>")
def api_hsa_receipt_serve(filename):
    return send_from_directory(RECEIPTS_DIR, filename)
