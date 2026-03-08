// ── Tax Accounts (HSA, future: IRA, 401k) ──
let taxAccountData = null;

async function fetchTaxAccounts() {
    try {
        const data = await fetch('/api/tax-accounts/hsa').then(r => r.json());
        taxAccountData = data;
        renderTaxAccountKpis(data.kpis || {});
        renderTaxHsaCalculator(data.hsa, (data.hsaSettings || {}).extraIncome || 0);
        renderHsaExpenses(data.expenses || []);
    } catch (e) { console.error('Error loading tax accounts:', e); }
}

function renderTaxAccountKpis(kpis) {
    const el = document.getElementById('taxAccountKpis');
    if (!el) return;
    const unreimColor = kpis.unreimbursedBalance > 0 ? '#f59e0b' : '#4ade80';
    el.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Total Expenses</div>
            <div class="kpi-value">${formatMoney(kpis.totalExpenses)}</div>
            <div class="kpi-sub">${kpis.expenseCount} expense${kpis.expenseCount !== 1 ? 's' : ''} tracked</div></div>
        <div class="kpi-card"><div class="kpi-label">Unreimbursed Balance</div>
            <div class="kpi-value" style="color:${unreimColor}">${formatMoney(kpis.unreimbursedBalance)}</div>
            <div class="kpi-sub">Out-of-pocket, not yet reimbursed from HSA</div></div>
        <div class="kpi-card"><div class="kpi-label">Pending Receipts</div>
            <div class="kpi-value">${kpis.pendingReceipts}</div>
            <div class="kpi-sub">Expenses without uploaded receipt</div></div>
    `;
}

function renderTaxHsaCalculator(hsa, hsaExtraIncome) {
    const input = document.getElementById('taxHsaExtraIncomeInput');
    const div = document.getElementById('taxHsaCalculatorTable');
    if (input) input.value = hsaExtraIncome || '';
    if (!div) return;
    if (!hsa) {
        div.innerHTML = '<p style="font-size:0.82rem; color:var(--text-dim);">Enter the extra W-2 income from choosing Bronze to see the HSA analysis.</p>';
        return;
    }
    const th = 'style="text-align:right;"';
    const green = 'style="text-align:right; color:#4ade80; font-weight:600;"';
    const red = 'style="text-align:right; color:#f87171;"';
    const bold = 'style="font-weight:700;"';
    const sep = `<tr><td colspan="3" style="border-top:2px solid var(--border); padding:0;"></td></tr>`;
    let html = `<div class="table-wrapper"><table style="width:100%; font-size:0.82rem;">
        <thead><tr><th style="text-align:left;"></th><th ${th}>Annual</th><th ${th}>Monthly</th></tr></thead><tbody>`;
    html += `<tr><td>Extra W-2 Income</td><td ${green}>${formatMoney(hsa.extraIncome)}</td><td ${green}>${formatMoney(hsa.extraIncome / 12)}</td></tr>`;
    html += `<tr><td>FICA (7.65%, irrecoverable)</td><td ${red}>-${formatMoney(hsa.ficaCost)}</td><td ${red}>-${formatMoney(hsa.ficaCost / 12)}</td></tr>`;
    html += `<tr ${bold}><td>Effective Economic Gain</td><td ${green}>${formatMoney(hsa.effectiveGain)}</td><td ${green}>${formatMoney(hsa.effectiveGain / 12)}</td></tr>`;
    html += sep;
    html += `<tr><td colspan="3" style="font-weight:700; padding-top:8px;">Aggressive Strategy <span style="font-weight:400; color:var(--text-dim);">(contribute full extra income)</span></td></tr>`;
    html += `<tr><td style="padding-left:16px;">HSA Contribution</td><td ${th}>${formatMoney(hsa.aggressive.contribution)}</td><td ${th}>${formatMoney(hsa.aggressive.contribution / 12)}</td></tr>`;
    html += `<tr><td style="padding-left:16px;">Income Tax Recovered</td><td ${green}>${formatMoney(hsa.aggressive.taxRecovered)}</td><td ${green}>${formatMoney(hsa.aggressive.taxRecovered / 12)}</td></tr>`;
    html += sep;
    html += `<tr><td colspan="3" style="font-weight:700; padding-top:8px;">Cash-Neutral Strategy <span style="font-weight:400; color:var(--text-dim);">(contribute only the effective gain)</span></td></tr>`;
    html += `<tr><td style="padding-left:16px;">HSA Contribution</td><td ${th}>${formatMoney(hsa.cashNeutral.contribution)}</td><td ${th}>${formatMoney(hsa.cashNeutral.contribution / 12)}</td></tr>`;
    html += `<tr><td style="padding-left:16px;">Income Tax Recovered</td><td ${green}>${formatMoney(hsa.cashNeutral.taxRecovered)}</td><td ${green}>${formatMoney(hsa.cashNeutral.taxRecovered / 12)}</td></tr>`;
    html += '</tbody></table></div>';
    html += `<p style="font-size:0.75rem; color:var(--text-dim); margin-top:8px;">Combined marginal tax rate: ${hsa.combinedMarginalRate}% (Federal + State + City)</p>`;
    div.innerHTML = html;
}

async function updateTaxHsaSettings(value) {
    try {
        await fetch('/api/tax-accounts/hsa/settings', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ extraIncome: parseFloat(value) || 0 })
        });
        fetchTaxAccounts();
    } catch (e) { console.error(e); }
}

function renderHsaExpenses(expenses) {
    const div = document.getElementById('hsaExpensesTable');
    if (!div) return;
    if (!expenses.length) {
        div.innerHTML = '<p style="font-size:0.82rem; color:var(--text-dim);">No expenses tracked yet. Click "+ Add Expense" to start.</p>';
        return;
    }
    const th = 'style="text-align:right;"';
    let html = `<div class="table-wrapper"><table style="width:100%; font-size:0.82rem;">
        <thead><tr><th>Date</th><th>Provider</th><th>Category</th><th ${th}>Amount</th><th>Paid From</th><th style="text-align:center;">Reimbursed</th><th>Receipt</th><th></th></tr></thead><tbody>`;
    expenses.forEach((e, i) => {
        const catColors = { Medical: '#3b82f6', Dental: '#8b5cf6', Vision: '#22c55e', Prescription: '#f59e0b', 'Mental Health': '#ec4899', Other: '#6b7280' };
        const catColor = catColors[e.category] || '#6b7280';
        const paidColor = e.paidFrom === 'Out-of-Pocket' ? '#f59e0b' : e.paidFrom === 'HSA Direct' ? '#22c55e' : '#6b7280';
        const receiptCell = e.receiptFile
            ? `<a href="/api/tax-accounts/hsa/receipts/${e.receiptFile}" target="_blank" style="color:#3b82f6;">View</a>`
            : `<button class="add-row-btn" onclick="uploadHsaReceipt(${i})" style="font-size:0.72rem; padding:2px 6px;">Upload</button>`;
        const checked = e.reimbursed ? 'checked' : '';
        const desc = e.description || e.notes || '';
        html += `<tr>
            <td>${e.date}</td>
            <td><strong>${e.provider}</strong>${desc ? `<br><span style="font-size:0.75rem; color:var(--text-dim);">${desc}</span>` : ''}</td>
            <td><span style="background:${catColor}22; color:${catColor}; padding:2px 8px; border-radius:4px; font-size:0.75rem;">${e.category}</span></td>
            <td ${th}>${formatMoney(e.amount)}</td>
            <td><span style="color:${paidColor}; font-size:0.8rem;">${e.paidFrom}</span></td>
            <td style="text-align:center;"><input type="checkbox" ${checked} onchange="toggleHsaReimbursed(${i})"></td>
            <td>${receiptCell}</td>
            <td><button class="delete-row-btn" onclick="deleteHsaExpense(${i})">&#x2715;</button></td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    div.innerHTML = html;
}

function toggleHsaExpenseForm() {
    const form = document.getElementById('hsaExpenseForm');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function addHsaExpense() {
    const date = document.getElementById('hsaExpDate').value;
    const provider = document.getElementById('hsaExpProvider').value;
    const category = document.getElementById('hsaExpCategory').value;
    const amount = document.getElementById('hsaExpAmount').value;
    const paidFrom = document.getElementById('hsaExpPaidFrom').value;
    const notes = document.getElementById('hsaExpNotes').value;
    const fileInput = document.getElementById('hsaExpReceipt');

    if (!date || !provider || !amount) {
        alert('Date, provider, and amount are required.');
        return;
    }

    try {
        const resp = await fetch('/api/tax-accounts/hsa/expenses/add', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ date, provider, description: notes, category, amount: parseFloat(amount), paidFrom })
        });
        const result = await resp.json();

        // Upload receipt if file selected
        if (fileInput.files.length > 0 && result.ok) {
            const expenses = (await fetch('/api/tax-accounts/hsa').then(r => r.json())).expenses || [];
            const newIndex = expenses.length - 1;
            const fd = new FormData();
            fd.append('receipt', fileInput.files[0]);
            fd.append('expenseIndex', newIndex);
            await fetch('/api/tax-accounts/hsa/receipts/upload', { method: 'POST', body: fd });
        }

        // Reset form
        document.getElementById('hsaExpDate').value = '';
        document.getElementById('hsaExpProvider').value = '';
        document.getElementById('hsaExpAmount').value = '';
        document.getElementById('hsaExpNotes').value = '';
        fileInput.value = '';
        document.getElementById('hsaExpenseForm').style.display = 'none';
        showSaveToast('Expense added');
        fetchTaxAccounts();
    } catch (e) { console.error(e); alert('Error adding expense'); }
}

async function deleteHsaExpense(index) {
    if (!confirm('Delete this expense?')) return;
    try {
        await fetch('/api/tax-accounts/hsa/expenses/delete', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ index })
        });
        showSaveToast('Expense deleted');
        fetchTaxAccounts();
    } catch (e) { console.error(e); }
}

async function toggleHsaReimbursed(index) {
    const expenses = taxAccountData?.expenses || [];
    const current = expenses[index]?.reimbursed || false;
    try {
        await fetch('/api/tax-accounts/hsa/expenses/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ index, updates: { reimbursed: !current } })
        });
        fetchTaxAccounts();
    } catch (e) { console.error(e); }
}

function uploadHsaReceipt(index) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.onchange = async () => {
        if (!input.files.length) return;
        const fd = new FormData();
        fd.append('receipt', input.files[0]);
        fd.append('expenseIndex', index);
        try {
            await fetch('/api/tax-accounts/hsa/receipts/upload', { method: 'POST', body: fd });
            showSaveToast('Receipt uploaded');
            fetchTaxAccounts();
        } catch (e) { console.error(e); alert('Error uploading receipt'); }
    };
    input.click();
}

function switchTaxAccountType() {
    const selected = document.getElementById('taxAccountType').value;
    const sections = ['hsa', 'traditionalIra', 'rothIra', 'fsa'];
    sections.forEach(id => {
        const el = document.getElementById('taxAccountContent_' + id);
        if (el) el.style.display = id === selected ? 'block' : 'none';
    });
}
