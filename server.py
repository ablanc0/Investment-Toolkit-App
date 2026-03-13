"""
InvToolkit — Investment Dashboard Server
Entry point: creates Flask app, registers blueprints, runs startup tasks.
"""

from flask import Flask, send_from_directory
from config import DATA_DIR, PORTFOLIO_FILE


# ── App Factory ────────────────────────────────────────────────────────

def create_app(testing=False):
    """Create and configure the Flask application."""
    application = Flask(__name__, static_folder="static")
    application.config["TESTING"] = testing

    @application.route("/")
    def index():
        return send_from_directory("static", "dashboard.html")

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
    from routes.analytics import bp as analytics_bp
    from routes.tax_accounts import bp as tax_accounts_bp
    from routes.export import bp as export_bp

    application.register_blueprint(portfolio_bp)
    application.register_blueprint(dividends_bp)
    application.register_blueprint(lab_bp)
    application.register_blueprint(misc_bp)
    application.register_blueprint(super_investors_bp)
    application.register_blueprint(projections_bp)
    application.register_blueprint(analysis_bp)
    application.register_blueprint(salary_bp)
    application.register_blueprint(planning_bp)
    application.register_blueprint(settings_bp)
    application.register_blueprint(analytics_bp)
    application.register_blueprint(tax_accounts_bp)
    application.register_blueprint(export_bp)

    @application.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        return response

    return application


app = create_app()


# ── Main ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    from services.cache import load_disk_cache
    from services.edgar_13f import _load_13f_history
    from services.quota_svc import load_quotas
    from services.col_api import load_col_data, auto_refresh_if_stale

    load_disk_cache()
    _load_13f_history()
    load_quotas()
    load_col_data()
    auto_refresh_if_stale()

    from services.backup import run_backup
    backup_result = run_backup()

    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    host = os.environ.get("FLASK_HOST", "127.0.0.1")
    port = int(os.environ.get("FLASK_PORT", "5050"))

    print("\n" + "=" * 55)
    print("  InvToolkit — Investment Dashboard")
    print("=" * 55)
    print("  Data source: Yahoo Finance (yfinance)")
    print(f"  Data dir:    {DATA_DIR}")
    print(f"  Portfolio:   {PORTFOLIO_FILE}")
    print(f"  Backups:     {backup_result['filesCopied']} copied, {backup_result['filesSkipped']} skipped")
    print(f"  Dashboard:   http://{host}:{port}")
    print("=" * 55 + "\n")

    app.run(host=host, port=port, debug=debug)
