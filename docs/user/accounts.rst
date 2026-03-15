Accounts
========

Manage multiple investment accounts (Roth IRA, 401(k), Traditional IRA,
HSA, taxable brokerage) and view a consolidated net worth across all of
them.

.. contents::
   :local:
   :depth: 2

----

Tab Overview
------------

The Accounts tab displays four **KPI cards**, a **grid of account
cards**, and three **charts** showing how your net worth is distributed.

KPI Cards
^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Card
     - Description
   * - **Net Worth**
     - Total market value plus cash across all accounts (main taxable
       portfolio included).  Shows the number of accounts.
   * - **Total Gain**
     - Combined unrealised gain/loss across all accounts.  Percentage
       is relative to total cost basis.
   * - **Tax-Free**
     - Total value held in tax-free accounts (Roth IRA, Roth 401(k),
       HSA).  Shows percentage of net worth.
   * - **Tax-Deferred**
     - Total value held in tax-deferred accounts (Traditional IRA,
       401(k), 403(b)).  Shows percentage of net worth.

Account Cards
^^^^^^^^^^^^^

One card per account, displayed in a responsive grid.  Each card shows:

- Account name and custodian (e.g. "Roth IRA (Fidelity)")
- Tax-treatment badge (colour-coded: blue for Taxable, orange for
  Tax-Deferred, green for Tax-Free)
- Total value (market value + cash)
- Unrealised gain/loss with percentage
- Number of positions and cash balance
- Progress bar showing percentage of total net worth

**Clicking a card** switches to the Positions tab filtered to that
account.

The three-dot menu on each card provides **Edit** (rename, change
custodian) and **Delete** options.

Charts
^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Chart
     - Description
   * - **By Account**
     - Doughnut chart showing net worth split across individual accounts.
   * - **By Tax Treatment**
     - Doughnut chart with three segments: Taxable (blue), Tax-Deferred
       (orange), Tax-Free (green).
   * - **Aggregate Allocation**
     - Horizontal bar chart showing combined category allocation
       (Growth, Value, Index, etc.) across all accounts.

----

Account Management
------------------

Creating an Account
^^^^^^^^^^^^^^^^^^^

1. Navigate to the **Accounts** tab.
2. Click the **+ Add Account** button below the account cards.
3. Fill in:

   - **Name** -- e.g. "Roth IRA", "401(k)", "HSA"
   - **Tax Treatment** -- Tax-Free, Tax-Deferred, or Taxable
   - **Custodian** (optional) -- e.g. "Fidelity", "Vanguard", "Schwab"

4. Click **Add**.

The account is created with zero positions and zero cash.

Editing an Account
^^^^^^^^^^^^^^^^^^

Click the three-dot menu (``...``) on an account card and select
**Edit**.  You can change the name and custodian.  Tax treatment is set
at creation and cannot be changed afterwards.

Deleting an Account
^^^^^^^^^^^^^^^^^^^

Click the three-dot menu on an account card and select **Delete**.  A
confirmation prompt appears.  Deletion removes the account and all its
positions permanently.

----

Adding Positions to an Account
------------------------------

1. Click an account card to switch to its Positions view.
2. Click **+ Add Position** in the simplified positions table.
3. Enter ticker, shares, average cost, and category.
4. Click **Add**.

Positions in accounts follow the same schema as the main portfolio
(ticker, shares, avgCost, category, sector, secType) and are enriched
with live prices when viewed.

----

Account Selector
----------------

When one or more accounts exist, a **dropdown selector** appears in the
Portfolio tab row (next to the existing tab buttons).  This lets you
quickly switch between viewing the main taxable portfolio and any
additional account without leaving the Portfolio tabs.

When a non-main account is selected:

- The **Positions** tab shows a simplified table (12 columns instead of
  the full 27).
- **Rebalancing** and **Sold Positions** tabs are hidden (these features
  are main-portfolio only).
- The Positions tab label changes to "Positions (limited)".

Switching back to "Taxable Brokerage" restores the full feature set.

----

Tax Treatments
--------------

Each account is classified by its tax treatment, which determines how
gains and dividends are taxed:

.. list-table::
   :header-rows: 1
   :widths: 20 30 50

   * - Treatment
     - Examples
     - Tax Impact
   * - **Taxable**
     - Regular brokerage
     - Dividends and realised gains taxed annually.
   * - **Tax-Deferred**
     - Traditional IRA, 401(k), 403(b)
     - Contributions may be deductible; taxed on withdrawal.
   * - **Tax-Free**
     - Roth IRA, Roth 401(k), HSA (medical)
     - No tax on qualified withdrawals.

The tax treatment badge appears on account cards and in the positions
view banner.  It is used for the "By Tax Treatment" chart on the
Accounts tab.

----

Main Portfolio
--------------

The main taxable portfolio (the original portfolio that existed before
the accounts feature) is always present and cannot be deleted.  It
appears as "Taxable Brokerage" in the account selector and in the
Accounts tab cards.  It retains the full feature set: positions,
rebalancing, dividends, sold positions, performance charts, and the
Stock Analyzer.

----

See Also
--------

* :doc:`formulas/portfolio` -- Portfolio metrics and allocation formulas
* :doc:`formulas/signals` -- Signal classification for positions
