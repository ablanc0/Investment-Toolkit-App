// ── Budget Monthly Tab ──────────────────────────────────────────────
// Transaction entry + budget vs actual per month.
// Redesigned: unified quick-add form, compact budget bars, filterable transaction table.

let bmData = null;
let bmMonth = 0;

const BM_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
const BM_MONTH_KEYS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];
const BM_CAT_ICONS = {
    income: '💰', essential: '🏠', discretionary: '🎭',
    debt: '💳', savings: '🏦', investments: '📈'
};
const BM_CHART_COLORS = [
    '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'
];
const BM_CAT_COLORS = {
    income: '#10b981', essential: '#3b82f6', discretionary: '#f59e0b',
    debt: '#ef4444', savings: '#8b5cf6', investments: '#06b6d4'
};
const BM_CAT_BG = {
    income: 'rgba(16,185,129,0.12)', essential: 'rgba(59,130,246,0.12)',
    discretionary: 'rgba(245,158,11,0.12)', debt: 'rgba(239,68,68,0.12)',
    savings: 'rgba(139,92,246,0.12)', investments: 'rgba(6,182,212,0.12)'
};


// ── Data Fetching ────────────────────────────────────────────────────

async function fetchBudgetMonthly() {
    try {
        const res = await fetch('/api/budget');
        const json = await res.json();
        bmData = json.budget;
        if (!bmData || !bmData.categories) {
            document.getElementById('bmKpis').innerHTML =
                '<div class="card" style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-dim);">' +
                'No budget data yet. Go to Budget Design and import your Excel.</div>';
            return;
        }
        const avail = _bmAvailableMonths();
        if (bmMonth >= avail.length) bmMonth = Math.max(0, avail.length - 1);
        renderBM();
    } catch (e) { console.error('Budget monthly fetch error:', e); }
}

function _bmAvailableMonths() {
    if (!bmData || !bmData.months) return BM_MONTH_KEYS;
    return BM_MONTH_KEYS;
}


// ── Month Navigation ────────────────────────────────────────────────

function bmPrevMonth() { if (bmMonth > 0) { bmMonth--; renderBM(); } }
function bmNextMonth() { if (bmMonth < 11) { bmMonth++; renderBM(); } }

function bmSelectMonth() {
    const sel = document.getElementById('bmMonthSelect');
    bmMonth = parseInt(sel.value);
    renderBM();
}


// ── Rollover Toggle ─────────────────────────────────────────────────

async function bmToggleRollover() {
    const mk = BM_MONTH_KEYS[bmMonth];
    const md = (bmData.months || {})[mk] || {};
    const enabled = !md.rollover;

    try {
        await fetch('/api/budget/rollover', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month: mk, enabled })
        });
        if (!bmData.months) bmData.months = {};
        if (!bmData.months[mk]) bmData.months[mk] = { actuals: {}, rollover: false };
        bmData.months[mk].rollover = enabled;
        showSaveToast('Rollover ' + (enabled ? 'enabled' : 'disabled'));
        await fetchBudgetMonthly();
    } catch (e) { console.error(e); }
}


// ── Render ───────────────────────────────────────────────────────────

function renderBM() {
    const mk = BM_MONTH_KEYS[bmMonth];
    const monthData = (bmData.months || {})[mk] || { actuals: {}, rollover: false };
    const summary = (bmData.summaries || {})[mk] || _bmEmptySummary();

    // Month label + dropdown
    document.getElementById('bmMonthLabel').textContent = BM_MONTH_NAMES[bmMonth] + ' ' + (bmData.year || 2026);
    const sel = document.getElementById('bmMonthSelect');
    if (sel) sel.value = bmMonth;

    // Rollover checkbox
    const rolloverCb = document.getElementById('bmRolloverCb');
    if (rolloverCb) rolloverCb.checked = monthData.rollover;

    // KPIs
    const rolloverAmt = (bmData.rolloverAmounts || {})[mk] || 0;
    renderKpiGrid('bmKpis', [
        { label: '💰 Total Income', value: formatMoney(summary.totalIncome), sub: 'This month' },
        { label: '💸 Total Expenses', value: formatMoney(summary.totalExpenses), sub: 'Essential + Disc + Debt' },
        { label: '📊 Savings Rate', value: formatPercent(summary.savingsRate), sub: 'Savings + Investments', positive: summary.savingsRate > 20 },
        { label: '🎯 REMAINDER', value: formatMoney(summary.remainder + rolloverAmt), sub: summary.remainder + rolloverAmt >= 0 ? 'On track' : 'Over budget', positive: summary.remainder + rolloverAmt >= 0 },
        { label: '🔄 Rollover', value: formatMoney(rolloverAmt), sub: monthData.rollover ? 'From prev month' : 'Disabled' },
    ]);

    // Quick-add form
    bmPopulateQuickAddForm();

    // Budget vs Actual bars
    bmRenderBudgetBars();

    // Transaction table
    bmRenderTxnTable();

    // Charts: lazy render only if details is open
    const chartsSection = document.getElementById('bmChartsSection');
    if (chartsSection && chartsSection.open) {
        renderBMCharts(mk, summary, monthData);
    }
}

function _bmEmptySummary() {
    return {
        categories: {},
        totalIncome: 0, totalExpenses: 0, totalSavings: 0,
        totalInvestments: 0, remainder: 0, savingsRate: 0,
    };
}


// ── Quick Add Form ──────────────────────────────────────────────────

function bmPopulateQuickAddForm() {
    const categories = bmData.categories;

    // Preserve current selections across re-renders
    const catSelect = document.getElementById('bmQaCat');
    const subSelect = document.getElementById('bmQaSub');
    if (!catSelect || !subSelect) return;

    const savedCat = catSelect.value;
    const savedSub = subSelect.value;

    // Populate category dropdown
    catSelect.innerHTML = '<option value="">Category...</option>' +
        categories.map(c => `<option value="${c.id}">${BM_CAT_ICONS[c.id] || '📋'} ${escapeHtml(c.name)}</option>`).join('');
    if (savedCat) {
        catSelect.value = savedCat;
        bmQaCategoryChanged();
        if (savedSub) subSelect.value = savedSub;
    }

    // Date default to today
    const dateInput = document.getElementById('bmQaDate');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);

    // Populate filter category dropdown (preserve selection)
    const filterSelect = document.getElementById('bmFilterCat');
    if (filterSelect) {
        const savedFilter = filterSelect.value;
        filterSelect.innerHTML = '<option value="">All Categories</option>' +
            categories.map(c => `<option value="${c.id}">${BM_CAT_ICONS[c.id] || '📋'} ${escapeHtml(c.name)}</option>`).join('');
        if (savedFilter) filterSelect.value = savedFilter;
    }
}

function bmQaCategoryChanged() {
    const catId = document.getElementById('bmQaCat').value;
    const subSelect = document.getElementById('bmQaSub');
    if (!subSelect) return;

    if (!catId || !bmData) {
        subSelect.innerHTML = '<option value="">Subcategory...</option>';
        return;
    }

    const cat = bmData.categories.find(c => c.id === catId);
    if (!cat) return;

    subSelect.innerHTML = cat.subcategories.map(s =>
        `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`
    ).join('');

    document.getElementById('bmQaAmt').focus();
}

async function bmQuickAdd() {
    const catId = document.getElementById('bmQaCat').value;
    const sub = document.getElementById('bmQaSub').value;
    const date = document.getElementById('bmQaDate').value;
    const amount = parseFloat(document.getElementById('bmQaAmt').value);
    const notes = document.getElementById('bmQaNotes').value;
    const feedback = document.getElementById('bmQaFeedback');

    if (!catId) { if (feedback) feedback.textContent = 'Select a category'; return; }
    if (!sub) { if (feedback) feedback.textContent = 'Select a subcategory'; return; }
    if (isNaN(amount) || amount === 0) { if (feedback) feedback.textContent = 'Enter an amount'; return; }

    const mk = BM_MONTH_KEYS[bmMonth];

    try {
        const res = await fetch('/api/budget/transaction', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month: mk, categoryId: catId, subcategory: sub, date, amount, notes })
        });
        if ((await res.json()).ok) {
            showSaveToast(`Added ${formatMoney(amount)} to ${sub}`);
            if (feedback) feedback.textContent = `Added ${formatMoney(amount)} to ${sub}`;

            // bmPopulateQuickAddForm preserves category/subcategory/date across re-render
            await fetchBudgetMonthly();

            // Clear amount + notes, focus amount for rapid entry
            document.getElementById('bmQaAmt').value = '';
            document.getElementById('bmQaNotes').value = '';
            document.getElementById('bmQaAmt').focus();
        }
    } catch (e) { console.error(e); }
}


// ── Budget vs Actual Bars ───────────────────────────────────────────

function bmRenderBudgetBars() {
    const container = document.getElementById('bmBudgetBars');
    if (!container) return;

    const mk = BM_MONTH_KEYS[bmMonth];
    const summary = (bmData.summaries || {})[mk] || _bmEmptySummary();
    const categories = bmData.categories;

    container.innerHTML = categories.map(cat => {
        const s = summary.categories[cat.id] || { budgeted: 0, actual: 0, remaining: 0 };
        const pct = s.budgeted ? Math.round(s.actual / s.budgeted * 100) : 0;
        const barPct = Math.min(pct, 100);
        const color = cat.id === 'income'
            ? (pct >= 100 ? '#10b981' : '#f59e0b')
            : (pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981');
        const icon = BM_CAT_ICONS[cat.id] || '📋';

        const remainLabel = cat.id === 'income'
            ? (s.remaining <= 0 ? 'On target' : `${formatMoney(s.remaining)} left`)
            : (s.remaining >= 0 ? `${formatMoney(s.remaining)} left` : `${formatMoney(Math.abs(s.remaining))} over`);
        const remainColor = cat.id === 'income'
            ? (s.remaining <= 0 ? '#10b981' : 'var(--text-dim)')
            : (s.remaining >= 0 ? 'var(--text-dim)' : '#ef4444');

        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
            <span style="width:140px;font-size:13px;font-weight:500;white-space:nowrap;">${icon} ${escapeHtml(cat.name)}</span>
            <div style="flex:1;background:var(--card-hover);border-radius:4px;height:12px;overflow:hidden;">
                <div style="background:${color};height:100%;width:${barPct}%;border-radius:4px;transition:width 0.3s;"></div>
            </div>
            <span style="width:170px;font-size:12px;text-align:right;color:var(--text-dim);white-space:nowrap;">${formatMoney(s.actual)} / ${formatMoney(s.budgeted)}</span>
            <span style="width:40px;font-size:12px;text-align:right;font-weight:600;color:${color};">${pct}%</span>
            <span style="width:90px;font-size:11px;text-align:right;color:${remainColor};white-space:nowrap;">${remainLabel}</span>
        </div>`;
    }).join('');
}


// ── Transaction Table ───────────────────────────────────────────────

function bmRenderTxnTable() {
    const mk = BM_MONTH_KEYS[bmMonth];
    const monthData = (bmData.months || {})[mk] || { actuals: {}, transactions: {} };
    const transactions = monthData.transactions || {};
    const categories = bmData.categories;

    // Flatten all transactions across categories
    let allTxns = [];
    for (const cat of categories) {
        const catTxns = transactions[cat.id] || [];
        for (const txn of catTxns) {
            allTxns.push({
                id: txn.id,
                date: txn.date || '',
                subcategory: txn.subcategory || '',
                amount: txn.amount || 0,
                notes: txn.notes || '',
                categoryId: cat.id,
                categoryName: cat.name,
                icon: BM_CAT_ICONS[cat.id] || '📋',
                color: BM_CAT_COLORS[cat.id] || '#6366f1',
                bg: BM_CAT_BG[cat.id] || 'rgba(99,102,241,0.12)'
            });
        }
    }

    // Filter by category
    const filterCat = document.getElementById('bmFilterCat');
    const filterVal = filterCat ? filterCat.value : '';
    if (filterVal) allTxns = allTxns.filter(t => t.categoryId === filterVal);

    // Filter by search
    const searchEl = document.getElementById('bmFilterSearch');
    const search = searchEl ? searchEl.value.toLowerCase() : '';
    if (search) allTxns = allTxns.filter(t =>
        t.subcategory.toLowerCase().includes(search) ||
        t.notes.toLowerCase().includes(search)
    );

    // Sort
    const sortEl = document.getElementById('bmSortBy');
    const sortBy = sortEl ? sortEl.value : 'date-desc';
    switch (sortBy) {
        case 'date-desc': allTxns.sort((a, b) => (b.date || '').localeCompare(a.date || '')); break;
        case 'date-asc': allTxns.sort((a, b) => (a.date || '').localeCompare(b.date || '')); break;
        case 'amount-desc': allTxns.sort((a, b) => b.amount - a.amount); break;
        case 'amount-asc': allTxns.sort((a, b) => a.amount - b.amount); break;
        case 'category': allTxns.sort((a, b) => a.categoryName.localeCompare(b.categoryName) || (b.date || '').localeCompare(a.date || '')); break;
    }

    // Render
    const tbody = document.getElementById('bmTxnBody');
    const tfoot = document.getElementById('bmTxnFoot');
    const countEl = document.getElementById('bmTxnCount');
    if (!tbody) return;

    if (allTxns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-dim);font-size:13px;">No transactions${filterVal || search ? ' matching filters' : ''} this month</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        if (countEl) countEl.textContent = '';
        return;
    }

    tbody.innerHTML = allTxns.map(txn => {
        return `<tr>
            <td style="padding:6px 8px;font-size:12px;">
                <span class="editable-cell" style="cursor:pointer;padding:2px 4px;border-radius:3px;" onclick="bmEditTxnDate(this,'${mk}','${txn.categoryId}','${txn.id}','${txn.date}')">${txn.date || '—'}</span>
            </td>
            <td style="padding:6px 8px;font-size:12px;">
                <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${txn.bg};color:${txn.color};">${txn.icon} ${escapeHtml(txn.categoryName)}</span>
            </td>
            <td style="padding:6px 8px;font-size:12px;">
                <span class="editable-cell" style="cursor:pointer;padding:2px 4px;border-radius:3px;" onclick="bmEditTxnSub(this,'${mk}','${txn.categoryId}','${txn.id}','${escapeHtml(txn.subcategory)}')">${escapeHtml(txn.subcategory)}</span>
            </td>
            <td style="padding:6px 8px;font-size:12px;text-align:right;">
                <span class="editable-cell" style="cursor:pointer;padding:2px 4px;border-radius:3px;" onclick="bmEditTxnAmount(this,'${mk}','${txn.categoryId}','${txn.id}',${txn.amount})">${formatMoney(txn.amount)}</span>
            </td>
            <td style="padding:6px 8px;font-size:12px;color:var(--text-dim);">
                <span class="editable-cell" style="cursor:pointer;padding:2px 4px;border-radius:3px;" onclick="bmEditTxnNotes(this,'${mk}','${txn.categoryId}','${txn.id}','${escapeHtml(txn.notes)}')">${escapeHtml(txn.notes) || '—'}</span>
            </td>
            <td style="padding:6px 0;width:30px;text-align:center;">
                <button onclick="bmDeleteTxn('${mk}','${txn.categoryId}','${txn.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;" title="Delete">✕</button>
            </td>
        </tr>`;
    }).join('');

    // Footer with total
    const totalAmt = allTxns.reduce((sum, t) => sum + t.amount, 0);
    if (tfoot) {
        tfoot.innerHTML = `<tr style="border-top:2px solid var(--border);font-weight:600;font-size:12px;">
            <td colspan="3" style="padding:8px 8px;">Total</td>
            <td style="text-align:right;padding:8px 8px;">${formatMoney(totalAmt)}</td>
            <td colspan="2" style="padding:8px 8px;"></td>
        </tr>`;
    }

    if (countEl) countEl.textContent = `${allTxns.length} transaction${allTxns.length !== 1 ? 's' : ''}`;
}


// ── Transaction CRUD ────────────────────────────────────────────────

async function bmDeleteTxn(month, catId, txnId) {
    try {
        const res = await fetch('/api/budget/transaction/' + txnId, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, categoryId: catId })
        });
        if ((await res.json()).ok) {
            showSaveToast('Transaction deleted');
            await fetchBudgetMonthly();
        }
    } catch (e) { console.error(e); }
}


// ── Inline Transaction Editing ──────────────────────────────────────

async function _bmUpdateTxn(month, catId, txnId, field, value) {
    try {
        const body = { month, categoryId: catId };
        body[field] = value;
        const res = await fetch('/api/budget/transaction/' + txnId, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if ((await res.json()).ok) {
            showSaveToast('Transaction updated');
            await fetchBudgetMonthly();
        }
    } catch (e) { console.error(e); }
}

function bmEditTxnDate(td, month, catId, txnId, currentVal) {
    if (td.querySelector('input')) return;
    const originalHTML = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'date';
    input.value = currentVal || '';
    input.style.cssText = 'padding:2px 4px;background:var(--card-hover);border:1px solid var(--accent);border-radius:4px;color:var(--text);font-size:11px;';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();

    const save = () => {
        if (input.value !== currentVal) _bmUpdateTxn(month, catId, txnId, 'date', input.value);
        else td.innerHTML = originalHTML;
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.removeEventListener('blur', save); td.innerHTML = originalHTML; }
    });
}

function bmEditTxnSub(td, month, catId, txnId, currentVal) {
    if (td.querySelector('select')) return;
    const originalHTML = td.innerHTML;
    const cat = bmData.categories.find(c => c.id === catId);
    if (!cat) return;

    const select = document.createElement('select');
    select.style.cssText = 'padding:2px 4px;background:var(--card-hover);border:1px solid var(--accent);border-radius:4px;color:var(--text);font-size:11px;';
    cat.subcategories.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.name;
        opt.textContent = sub.name;
        if (sub.name === currentVal) opt.selected = true;
        select.appendChild(opt);
    });
    td.innerHTML = '';
    td.appendChild(select);
    select.focus();

    const save = () => {
        if (select.value !== currentVal) _bmUpdateTxn(month, catId, txnId, 'subcategory', select.value);
        else td.innerHTML = originalHTML;
    };
    select.addEventListener('blur', save);
    select.addEventListener('change', () => select.blur());
}

function bmEditTxnAmount(td, month, catId, txnId, currentVal) {
    if (td.querySelector('input')) return;
    const originalHTML = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentVal;
    input.style.cssText = 'width:70px;padding:2px 4px;background:var(--card-hover);border:1px solid var(--accent);border-radius:4px;color:var(--text);font-size:11px;text-align:right;';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const save = () => {
        const newVal = parseFloat(input.value);
        if (!isNaN(newVal) && newVal !== currentVal) _bmUpdateTxn(month, catId, txnId, 'amount', newVal);
        else td.innerHTML = originalHTML;
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.removeEventListener('blur', save); td.innerHTML = originalHTML; }
    });
}

function bmEditTxnNotes(td, month, catId, txnId, currentVal) {
    if (td.querySelector('input')) return;
    const originalHTML = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentVal;
    input.style.cssText = 'width:100%;padding:2px 4px;background:var(--card-hover);border:1px solid var(--accent);border-radius:4px;color:var(--text);font-size:11px;';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();

    const save = () => {
        if (input.value !== currentVal) _bmUpdateTxn(month, catId, txnId, 'notes', input.value);
        else td.innerHTML = originalHTML;
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.removeEventListener('blur', save); td.innerHTML = originalHTML; }
    });
}


// ── Charts ──────────────────────────────────────────────────────────

function bmChartsToggled() {
    const details = document.getElementById('bmChartsSection');
    const arrow = document.getElementById('bmChartsArrow');
    if (arrow) arrow.style.transform = details.open ? 'rotate(90deg)' : '';
    if (!details.open || !bmData) return;

    const mk = BM_MONTH_KEYS[bmMonth];
    const monthData = (bmData.months || {})[mk] || { actuals: {}, rollover: false };
    const summary = (bmData.summaries || {})[mk] || _bmEmptySummary();
    renderBMCharts(mk, summary, monthData);
}

function renderBMCharts(mk, summary, monthData) {
    const textColor = getChartTextColor();
    const gridColor = getChartGridColor();
    const categories = bmData.categories;

    // 1. Estimated vs Actual grouped bar
    const catLabels = categories.map(c => c.name);
    const budgeted = categories.map(c => (summary.categories[c.id] || {}).budgeted || 0);
    const actual = categories.map(c => (summary.categories[c.id] || {}).actual || 0);

    const ctx1 = document.getElementById('bmEstVsActChart');
    if (ctx1) {
        if (charts.bmEstVsAct) charts.bmEstVsAct.destroy();
        charts.bmEstVsAct = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: catLabels,
                datasets: [
                    { label: 'Budgeted', data: budgeted, backgroundColor: '#3b82f6' },
                    { label: 'Actual', data: actual, backgroundColor: '#10b981' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor } } },
                scales: {
                    x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, callback: v => '$' + v.toLocaleString() }, grid: { color: gridColor } }
                }
            }
        });
    }

    // 2. Expense distribution doughnut
    const distCats = categories.filter(c => c.id !== 'income');
    const ctx2 = document.getElementById('bmDistChart');
    if (ctx2) {
        if (charts.bmDist) charts.bmDist.destroy();
        charts.bmDist = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: distCats.map(c => c.name),
                datasets: [{ data: distCats.map(c => (summary.categories[c.id] || {}).actual || 0), backgroundColor: BM_CHART_COLORS.slice(1) }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor } } }
            }
        });
    }

    // 3. Top spending horizontal bar (top 15 subcategories)
    const actuals = monthData.actuals || {};
    const allSubs = [];
    for (const cat of categories) {
        if (cat.id === 'income') continue;
        const catActuals = actuals[cat.id] || {};
        for (const [name, val] of Object.entries(catActuals)) {
            if (val > 0) allSubs.push({ name, value: val, category: cat.name });
        }
    }
    allSubs.sort((a, b) => b.value - a.value);
    const top15 = allSubs.slice(0, 15);

    const ctx3 = document.getElementById('bmTopSpendChart');
    if (ctx3) {
        if (charts.bmTopSpend) charts.bmTopSpend.destroy();
        charts.bmTopSpend = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: top15.map(s => s.name),
                datasets: [{ label: 'Actual Spend', data: top15.map(s => s.value), backgroundColor: '#f59e0b' }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: textColor, callback: v => '$' + v.toLocaleString() }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } }
                }
            }
        });
    }

    // 4. Overview comparison bars (income vs outflows)
    const ctx4 = document.getElementById('bmOverviewChart');
    if (ctx4) {
        if (charts.bmOverview) charts.bmOverview.destroy();
        charts.bmOverview = new Chart(ctx4, {
            type: 'bar',
            data: {
                labels: ['Income', 'Expenses', 'Savings', 'Investments'],
                datasets: [{
                    label: 'Amount',
                    data: [summary.totalIncome, summary.totalExpenses, summary.totalSavings, summary.totalInvestments],
                    backgroundColor: ['#10b981', '#ef4444', '#3b82f6', '#8b5cf6']
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, callback: v => '$' + v.toLocaleString() }, grid: { color: gridColor } }
                }
            }
        });
    }
}
