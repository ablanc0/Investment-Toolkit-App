// ── Accounts Overview Tab ──
// Net worth KPIs, account cards, allocation charts

let accountsData = null;

const TAX_COLORS = {
    'taxable': '#4A86E8',
    'tax-deferred': '#E69138',
    'tax-free': '#6AA84F',
};
const TAX_LABELS = {
    'taxable': 'Taxable',
    'tax-deferred': 'Tax-Deferred',
    'tax-free': 'Tax-Free',
};

async function fetchAccounts() {
    try {
        const resp = await fetch('/api/accounts/net-worth');
        accountsData = await resp.json();
        renderAccountsTab();
    } catch (e) {
        console.error('Error fetching accounts:', e);
    }
}

function renderAccountsTab() {
    if (!accountsData) return;

    renderAccountKpis();
    renderAccountCards();
    renderAccountCharts();
}


// ── KPIs ────────────────────────────────────────────────────────────

function renderAccountKpis() {
    const d = accountsData;
    const totalGain = d.accounts.reduce((s, a) => s + (a.gain || 0), 0);
    const totalCost = d.accounts.reduce((s, a) => s + (a.costBasis || 0), 0);
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost * 100) : 0;

    const kpis = [
        {
            label: '💰 Net Worth',
            value: formatMoney(d.totalNetWorth),
            sub: `${d.accounts.length} account${d.accounts.length !== 1 ? 's' : ''}`,
        },
        {
            label: '📈 Total Gain',
            value: formatMoney(totalGain),
            sub: `${totalGainPct >= 0 ? '+' : ''}${totalGainPct.toFixed(2)}%`,
            positive: totalGain >= 0,
        },
        {
            label: '🛡️ Tax-Free',
            value: formatMoney(d.byTaxTreatment['tax-free'] || 0),
            sub: d.totalNetWorth > 0
                ? `${((d.byTaxTreatment['tax-free'] || 0) / d.totalNetWorth * 100).toFixed(1)}% of net worth`
                : '0%',
        },
        {
            label: '🏦 Tax-Deferred',
            value: formatMoney(d.byTaxTreatment['tax-deferred'] || 0),
            sub: d.totalNetWorth > 0
                ? `${((d.byTaxTreatment['tax-deferred'] || 0) / d.totalNetWorth * 100).toFixed(1)}% of net worth`
                : '0%',
        },
    ];

    renderKpiGrid('accountsKpiGrid', kpis);
}


// ── Account Cards ───────────────────────────────────────────────────

function renderAccountCards() {
    const container = document.getElementById('accountCardsGrid');
    if (!container) return;

    const d = accountsData;
    if (!d.accounts || d.accounts.length === 0) {
        container.innerHTML = '<div style="color: var(--text-dim); padding: 20px; text-align: center;">No accounts yet. Add one below.</div>';
        return;
    }

    container.innerHTML = d.accounts.map(acct => {
        const pctOfNW = d.totalNetWorth > 0 ? (((acct.marketValue + acct.cash) / d.totalNetWorth) * 100) : 0;
        const isMain = acct.id === '_main';
        const taxBadgeColor = TAX_COLORS[acct.taxTreatment] || '#6b7280';
        const taxLabel = TAX_LABELS[acct.taxTreatment] || acct.taxTreatment;
        const custodianText = acct.custodian ? ` (${escapeHtml(acct.custodian)})` : '';
        const totalValue = acct.marketValue + acct.cash;

        return `<div class="card account-card" style="cursor:${isMain ? 'pointer' : 'pointer'}; position:relative;"
                     onclick="${isMain ? "switchTab('positions')" : `viewAccountPositions('${acct.id}')`}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px;">
                <div>
                    <div style="font-weight:600; font-size:14px;">${escapeHtml(acct.name)}${custodianText}</div>
                    <span style="display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; background:${taxBadgeColor}22; color:${taxBadgeColor}; margin-top:4px;">
                        ${taxLabel}
                    </span>
                </div>
                ${!isMain ? `<div class="dropdown" style="position:relative;">
                    <button onclick="event.stopPropagation(); toggleAccountMenu('${acct.id}')"
                            style="background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:16px; padding:4px 8px;">⋯</button>
                    <div id="acctMenu-${acct.id}" class="dropdown-menu" style="display:none; position:absolute; right:0; top:100%; background:var(--card); border:1px solid var(--border); border-radius:8px; padding:4px 0; min-width:120px; z-index:10; box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                        <button onclick="event.stopPropagation(); editAccountModal('${acct.id}')" style="display:block; width:100%; text-align:left; padding:8px 16px; background:none; border:none; color:var(--text); cursor:pointer; font-size:13px;">Edit</button>
                        <button onclick="event.stopPropagation(); deleteAccountConfirm('${acct.id}', '${escapeHtml(acct.name)}')" style="display:block; width:100%; text-align:left; padding:8px 16px; background:none; border:none; color:#ef4444; cursor:pointer; font-size:13px;">Delete</button>
                    </div>
                </div>` : ''}
            </div>
            <div style="font-size:22px; font-weight:700; margin-bottom:4px;">${formatMoney(totalValue)}</div>
            <div style="font-size:13px; margin-bottom:8px;" class="${acct.gain >= 0 ? 'positive' : 'negative'}">
                ${acct.gain >= 0 ? '+' : ''}${formatMoney(acct.gain)} (${acct.gainPct >= 0 ? '+' : ''}${acct.gainPct.toFixed(2)}%)
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-dim);">
                <span>${acct.positionCount} position${acct.positionCount !== 1 ? 's' : ''}</span>
                <span>${acct.cash > 0 ? formatMoney(acct.cash) + ' cash' : ''}</span>
            </div>
            <div style="margin-top:8px; background:var(--bg); border-radius:4px; height:6px; overflow:hidden;">
                <div style="height:100%; width:${Math.min(pctOfNW, 100).toFixed(1)}%; background:${taxBadgeColor}; border-radius:4px;"></div>
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-dim); margin-top:2px;">${pctOfNW.toFixed(1)}% of net worth</div>
        </div>`;
    }).join('');
}

function toggleAccountMenu(accountId) {
    const menu = document.getElementById(`acctMenu-${accountId}`);
    if (!menu) return;
    // Close all other menus first
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m.id !== `acctMenu-${accountId}`) m.style.display = 'none';
    });
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Close dropdown menus when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
});


// ── Account Actions ─────────────────────────────────────────────────

function showAddAccountForm() {
    document.getElementById('addAccountBtn').style.display = 'none';
    document.getElementById('addAccountForm').style.display = 'block';
    document.getElementById('newAccountName').focus();
}

function hideAddAccountForm() {
    document.getElementById('addAccountBtn').style.display = 'inline-flex';
    document.getElementById('addAccountForm').style.display = 'none';
    document.getElementById('newAccountName').value = '';
    document.getElementById('newAccountCustodian').value = '';
    document.getElementById('newAccountTax').value = 'tax-free';
}

async function addAccount() {
    const name = document.getElementById('newAccountName').value.trim();
    const taxTreatment = document.getElementById('newAccountTax').value;
    const custodian = document.getElementById('newAccountCustodian').value.trim();

    if (!name) { showAlert('Enter an account name', 'error'); return; }

    try {
        const resp = await fetch('/api/accounts', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, taxTreatment, custodian }),
        });
        const data = await resp.json();
        if (resp.ok) {
            showSaveToast(`${name} created`);
            hideAddAccountForm();
            await fetchAccounts();
        } else {
            showAlert(data.error || 'Error creating account', 'error');
        }
    } catch (e) {
        showAlert('Network error', 'error');
    }
}

async function deleteAccountConfirm(accountId, name) {
    if (!confirm(`Delete account "${name}"? This cannot be undone.`)) return;

    try {
        const resp = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
        if (resp.ok) {
            showSaveToast(`${name} deleted`);
            await fetchAccounts();
        }
    } catch (e) {
        showAlert('Network error', 'error');
    }
}

function editAccountModal(accountId) {
    const acct = accountsData?.accounts?.find(a => a.id === accountId);
    if (!acct) return;

    const name = prompt('Account name:', acct.name);
    if (name === null) return;
    const custodian = prompt('Custodian:', acct.custodian || '');
    if (custodian === null) return;

    fetch(`/api/accounts/${accountId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name: name.trim(), custodian: custodian.trim() }),
    }).then(r => r.json()).then(data => {
        if (data.ok) {
            showSaveToast('Account updated');
            fetchAccounts();
        }
    }).catch(() => showAlert('Network error', 'error'));
}

function viewAccountPositions(accountId) {
    // Switch to positions tab with this account selected
    if (typeof switchAccountTo === 'function') {
        switchAccountTo(accountId);
    }
    switchTab('positions');
}


// ── Charts ──────────────────────────────────────────────────────────

function renderAccountCharts() {
    const d = accountsData;
    if (!d || !d.accounts) return;

    // Net worth by account doughnut
    _renderAcctDoughnut('acctByAccountChart', 'acctByAccount',
        d.accounts.map(a => a.name),
        d.accounts.map(a => a.marketValue + a.cash),
        d.accounts.map((_, i) => _acctPalette(i)),
    );

    // Tax treatment doughnut
    const taxEntries = Object.entries(d.byTaxTreatment).filter(([, v]) => v > 0);
    _renderAcctDoughnut('acctByTaxChart', 'acctByTax',
        taxEntries.map(([k]) => TAX_LABELS[k] || k),
        taxEntries.map(([, v]) => v),
        taxEntries.map(([k]) => TAX_COLORS[k] || '#6b7280'),
    );

    // Aggregate allocation bar
    _renderAcctAllocBar();
}

function _acctPalette(i) {
    const colors = ['#4A86E8', '#6AA84F', '#E69138', '#993333', '#1BBC9D', '#9b59b6', '#e74c3c', '#3498db'];
    return colors[i % colors.length];
}

function _renderAcctDoughnut(canvasId, chartKey, labels, data, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts[chartKey]) charts[chartKey].destroy();

    charts[chartKey] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: getChartTextColor(), boxWidth: 12, padding: 12, font: { size: 12 } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? (ctx.raw / total * 100).toFixed(1) : 0;
                            return ` ${ctx.label}: ${formatMoney(ctx.raw)} (${pct}%)`;
                        }
                    }
                }
            },
        },
    });
}

function _renderAcctAllocBar() {
    const canvas = document.getElementById('acctAllocChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts.acctAlloc) charts.acctAlloc.destroy();

    const alloc = accountsData?.aggregateAllocation || {};
    const entries = Object.entries(alloc).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return;

    charts.acctAlloc = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: entries.map(([k]) => k),
            datasets: [{
                data: entries.map(([, v]) => v),
                backgroundColor: entries.map((_, i) => _acctPalette(i)),
                borderWidth: 0,
                borderRadius: 4,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw.toFixed(1)}%` } },
            },
            scales: {
                x: { display: true, grid: { color: getChartGridColor() }, ticks: { color: getChartTextColor(), callback: v => v + '%' } },
                y: { grid: { display: false }, ticks: { color: getChartTextColor(), font: { size: 12 } } },
            },
        },
    });
}
