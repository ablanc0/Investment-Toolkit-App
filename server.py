"""
InvToolkit — Investment Dashboard Server
Entry point: creates Flask app, registers blueprints, runs startup tasks.
"""

from flask import Flask, send_from_directory
from config import DATA_DIR, PORTFOLIO_FILE

# ── App Factory ────────────────────────────────────────────────────────

app = Flask(__name__, static_folder="static")


# ── Static Serving ─────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "dashboard.html")


# ── Register Blueprints ────────────────────────────────────────────────

from routes.portfolio import bp as portfolio_bp
from routes.dividends import bp as dividends_bp
from routes.lab import bp as lab_bp
from routes.misc import bp as misc_bp
from routes.super_investors import bp as super_investors_bp
from routes.projections import bp as projections_bp
from routes.analysis import bp as analysis_bp
from routes.salary import bp as salary_bp
from routes.planning import bp as planning_bp
from routes.settings import bp as settings_bp

app.register_blueprint(portfolio_bp)
app.register_blueprint(dividends_bp)
app.register_blueprint(lab_bp)
app.register_blueprint(misc_bp)
app.register_blueprint(super_investors_bp)
app.register_blueprint(projections_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(salary_bp)
app.register_blueprint(planning_bp)
app.register_blueprint(settings_bp)


# ── Main ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from services.cache import load_disk_cache
    from services.edgar_13f import _load_13f_history

    load_disk_cache()
    _load_13f_history()

    from services.backup import run_backup
    backup_result = run_backup()

    print("\n" + "=" * 55)
    print("  InvToolkit — Investment Dashboard")
    print("=" * 55)
    print("  Data source: Yahoo Finance (yfinance)")
    print(f"  Data dir:    {DATA_DIR}")
    print(f"  Portfolio:   {PORTFOLIO_FILE}")
    print(f"  Backups:     {backup_result['filesCopied']} copied, {backup_result['filesSkipped']} skipped")
    print(f"  Dashboard:   http://localhost:5050")
    print("=" * 55 + "\n")

    app.run(host="0.0.0.0", port=5050, debug=True)
