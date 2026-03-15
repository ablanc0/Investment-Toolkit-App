"""Tests for accounts Blueprint — CRUD, positions, net-worth aggregation."""

from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helper — seed an account via API
# ---------------------------------------------------------------------------

def _create_account(client, name="Roth IRA", tax="tax-free", custodian="Fidelity"):
    return client.post("/api/accounts", json={
        "name": name,
        "taxTreatment": tax,
        "custodian": custodian,
    })


# ---------------------------------------------------------------------------
# Account CRUD
# ---------------------------------------------------------------------------

def test_accounts_list_empty(client):
    resp = client.get("/api/accounts")
    assert resp.status_code == 200
    assert resp.get_json()["accounts"] == []


def test_create_account(client):
    resp = _create_account(client)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["ok"] is True
    acct = data["account"]
    assert acct["name"] == "Roth IRA"
    assert acct["taxTreatment"] == "tax-free"
    assert acct["custodian"] == "Fidelity"
    assert acct["id"] == "roth-ira"


def test_create_account_duplicate_slug(client):
    _create_account(client, name="Roth IRA")
    resp = _create_account(client, name="Roth IRA")
    assert resp.status_code == 201
    assert resp.get_json()["account"]["id"] == "roth-ira-2"


def test_create_account_missing_name(client):
    resp = client.post("/api/accounts", json={"taxTreatment": "taxable"})
    assert resp.status_code == 400


def test_create_account_invalid_tax(client):
    resp = client.post("/api/accounts", json={"name": "Bad", "taxTreatment": "nope"})
    assert resp.status_code == 400


def test_update_account(client):
    _create_account(client)
    resp = client.put("/api/accounts/roth-ira", json={"name": "Roth IRA (Updated)"})
    assert resp.status_code == 200
    assert resp.get_json()["account"]["name"] == "Roth IRA (Updated)"


def test_update_account_not_found(client):
    resp = client.put("/api/accounts/nonexistent", json={"name": "X"})
    assert resp.status_code == 404


def test_delete_account(client):
    _create_account(client)
    resp = client.delete("/api/accounts/roth-ira")
    assert resp.status_code == 200
    # Verify gone
    resp = client.get("/api/accounts")
    assert len(resp.get_json()["accounts"]) == 0


def test_delete_account_not_found(client):
    resp = client.delete("/api/accounts/nonexistent")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Account Positions
# ---------------------------------------------------------------------------

MOCK_QUOTES = {
    "VTI": {"price": 250, "previousClose": 248, "changePercent": 0.8,
            "name": "Vanguard Total Stock", "divRate": 3.0, "divYield": 1.2,
            "pe": 20, "beta": 1.0, "marketCap": 1e12,
            "fiftyTwoWeekHigh": 260, "fiftyTwoWeekLow": 200,
            "sector": "", "industry": "", "targetMeanPrice": 0},
}


def test_add_position_to_account(client):
    _create_account(client)
    resp = client.post("/api/accounts/roth-ira/positions", json={
        "ticker": "VTI", "shares": 50, "avgCost": 200, "category": "Index",
    })
    assert resp.status_code == 201
    assert resp.get_json()["position"]["ticker"] == "VTI"


def test_add_duplicate_position(client):
    _create_account(client)
    client.post("/api/accounts/roth-ira/positions", json={"ticker": "VTI", "shares": 10, "avgCost": 200})
    resp = client.post("/api/accounts/roth-ira/positions", json={"ticker": "VTI", "shares": 5, "avgCost": 210})
    assert resp.status_code == 400


def test_add_position_account_not_found(client):
    resp = client.post("/api/accounts/nonexistent/positions", json={"ticker": "VTI", "shares": 10, "avgCost": 200})
    assert resp.status_code == 404


@patch("routes.accounts.fetch_all_quotes", return_value=MOCK_QUOTES)
@patch("routes.accounts.resolve_geo", return_value={"country": "US", "currency": "USD"})
def test_get_enriched_positions(mock_geo, mock_quotes, client):
    _create_account(client)
    client.post("/api/accounts/roth-ira/positions", json={
        "ticker": "VTI", "shares": 50, "avgCost": 200, "category": "Index",
    })
    resp = client.get("/api/accounts/roth-ira/positions")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["positions"]) == 1
    pos = data["positions"][0]
    assert pos["ticker"] == "VTI"
    assert pos["price"] == 250
    assert pos["marketValue"] == 12500
    assert data["summary"]["marketValue"] == 12500


def test_update_position(client):
    _create_account(client)
    client.post("/api/accounts/roth-ira/positions", json={"ticker": "VTI", "shares": 50, "avgCost": 200})
    resp = client.put("/api/accounts/roth-ira/positions/0", json={"shares": 75})
    assert resp.status_code == 200
    assert resp.get_json()["position"]["shares"] == 75


def test_update_position_out_of_range(client):
    _create_account(client)
    resp = client.put("/api/accounts/roth-ira/positions/5", json={"shares": 10})
    assert resp.status_code == 404


def test_delete_position(client):
    _create_account(client)
    client.post("/api/accounts/roth-ira/positions", json={"ticker": "VTI", "shares": 50, "avgCost": 200})
    resp = client.delete("/api/accounts/roth-ira/positions/0")
    assert resp.status_code == 200
    assert resp.get_json()["removed"]["ticker"] == "VTI"


def test_update_cash(client):
    _create_account(client)
    resp = client.put("/api/accounts/roth-ira/cash", json={"cash": 1500})
    assert resp.status_code == 200
    assert resp.get_json()["cash"] == 1500


def test_update_cash_not_found(client):
    resp = client.put("/api/accounts/nonexistent/cash", json={"cash": 100})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Net Worth
# ---------------------------------------------------------------------------

@patch("routes.accounts.fetch_all_quotes")
def test_net_worth_main_only(mock_quotes, client):
    """Net worth with no extra accounts = main portfolio only."""
    mock_quotes.return_value = {
        "AAPL": {"price": 200, "previousClose": 198, "changePercent": 1.0,
                 "name": "Apple", "divRate": 0, "divYield": 0, "pe": 30,
                 "beta": 1.2, "marketCap": 3e12, "fiftyTwoWeekHigh": 220,
                 "fiftyTwoWeekLow": 150, "sector": "Tech", "industry": "Tech"},
    }
    resp = client.get("/api/accounts/net-worth")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["totalNetWorth"] > 0
    assert len(data["accounts"]) == 1
    assert data["accounts"][0]["id"] == "_main"


@patch("routes.accounts.fetch_all_quotes")
@patch("routes.accounts.resolve_geo", return_value={"country": "US", "currency": "USD"})
def test_net_worth_with_accounts(mock_geo, mock_quotes, client):
    """Net worth includes main + additional accounts."""
    mock_quotes.return_value = {
        "AAPL": {"price": 200, "previousClose": 198, "changePercent": 1.0,
                 "name": "Apple", "divRate": 0, "divYield": 0, "pe": 30,
                 "beta": 1.2, "marketCap": 3e12, "fiftyTwoWeekHigh": 220,
                 "fiftyTwoWeekLow": 150, "sector": "Tech", "industry": "Tech"},
        "VTI": {"price": 250, "previousClose": 248, "changePercent": 0.8,
                "name": "VTI", "divRate": 3, "divYield": 1.2, "pe": 20,
                "beta": 1.0, "marketCap": 1e12, "fiftyTwoWeekHigh": 260,
                "fiftyTwoWeekLow": 200, "sector": "", "industry": ""},
    }
    # Create account + add position
    _create_account(client)
    client.post("/api/accounts/roth-ira/positions", json={
        "ticker": "VTI", "shares": 100, "avgCost": 200, "category": "Index",
    })
    client.put("/api/accounts/roth-ira/cash", json={"cash": 500})

    resp = client.get("/api/accounts/net-worth")
    data = resp.get_json()
    assert len(data["accounts"]) == 2
    # Main: AAPL 10*200=2000 + cash 5000 = 7000
    # Roth: VTI 100*250=25000 + cash 500 = 25500
    assert data["totalNetWorth"] == 7000 + 25500
    assert data["byTaxTreatment"]["tax-free"] == 25500
    assert "Index" in data["aggregateAllocation"]
