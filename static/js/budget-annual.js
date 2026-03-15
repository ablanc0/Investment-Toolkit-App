// ── Budget Annual Tab ────────────────────────────────────────────────
// Year-wide aggregation, savings rate trends, category×month grids.

let baData = null;
let baBudgetData = null;

const BA_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
const BA_MONTH_KEYS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];
const BA_CAT_ICONS = {
    income: '💰', essential: '🏠', discretionary: '🎭',
    debt: '💳', savings: '🏦', investments: '📈'
};
const BA_CHART_COLORS = {
    income: '#10b981', essential: '#3b82f6', discretionary: '#f59e0b',
    debt: '#ef4444', savings: '#8b5cf6', investments: '#06b6d4'
};


// ── Data Fetching ────────────────────────────────────────────────────

async function fetchBudgetAnnual() {
    try {
        const [annualRes, budgetRes] = await Promise.all([
            fetch('/api/budget/annual'),
            fetch('/api/budget')
        ]);
        const annualJson = await annualRes.json();
        const budgetJson = await budgetRes.json();
        baData = annualJson.annual;
        baBudgetData = budgetJson.budget;

        if (!baData || !baData.monthly || baData.monthly.length === 0) {
            document.getElementById('baKpis').innerHTML =
                '<div class="card" style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-dim);">' +
                'No annual data yet. Add transactions in the Monthly tab first.</div>';
            return;
        }
        renderBA();
    } catch (e) { console.error('Annual budget fetch error:', e); }
}


// ── Render ───────────────────────────────────────────────────────────

function renderBA() {
    const monthly = baData.monthly;
    const totals = baData.totals;

    // KPIs
    const totalIncome = monthly.reduce((s, m) => s + m.totalIncome, 0);
    const totalExpenses = monthly.reduce((s, m) => s + m.totalExpenses, 0);
    const totalSaved = monthly.reduce((s, m) => s + m.totalSavings + m.totalInvestments, 0);
    const avgSavingsRate = monthly.reduce((s, m) => s + m.savingsRate, 0) / monthly.length;

    renderKpiGrid('baKpis', [
        { label: '💰 YTD Income', value: formatMoney(totalIncome), sub: `${monthly.length} months` },
        { label: '💸 YTD Expenses', value: formatMoney(totalExpenses), sub: formatPercent(totalIncome > 0 ? totalExpenses / totalIncome * 100 : 0) + ' of income' },
        { label: '🏦 YTD Saved', value: formatMoney(totalSaved), sub: 'Savings + Investments' },
        { label: '📊 Avg Savings Rate', value: formatPercent(avgSavingsRate), sub: 'Monthly average', positive: avgSavingsRate > 20 },
    ]);

    // Savings Rate Table
    renderBASavingsTable();

    // Main Summary Grid
    renderBASummaryGrid();

    // Per-Category Detail Sections
    renderBADetailSections();

    // Charts
    renderBACharts();

    // Notes area
    renderBANotes();
}


// ── Savings Rate Table ──────────────────────────────────────────────

function renderBASavingsTable() {
    const container = document.getElementById('baSavingsTable');
    if (!container) return;
    const rates = baData.savingsRates || [];

    const rows = rates.map(r => {
        const changeColor = r.momChange > 0 ? '#10b981' : r.momChange < 0 ? '#ef4444' : 'var(--text-dim)';
        const monthIdx = BA_MONTH_KEYS.indexOf(r.month);
        return `<tr>
            <td>${BA_MONTH_NAMES[monthIdx] || r.month}</td>
            <td style="text-align:right;">${formatPercent(r.rate)}</td>
            <td style="text-align:right;color:${changeColor};">${r.momChange > 0 ? '+' : ''}${formatPercent(r.momChange)}</td>
        </tr>`;
    }).join('');

    // Average row
    const avgRate = rates.length > 0 ? rates.reduce((s, r) => s + r.rate, 0) / rates.length : 0;

    container.innerHTML = `<table class="data-table" style="width:100%;">
        <thead><tr><th>Month</th><th style="text-align:right;">Savings Rate</th><th style="text-align:right;">MoM Change</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="border-top:2px solid var(--border);font-weight:600;">
            <td>Average</td><td style="text-align:right;">${formatPercent(avgRate)}</td><td></td>
        </tr></tfoot>
    </table>`;
}


// ── Main Summary Grid ───────────────────────────────────────────────

function renderBASummaryGrid() {
    const container = document.getElementById('baSummaryGrid');
    if (!container) return;
    if (!baBudgetData) return;

    const categories = baBudgetData.categories || [];
    const monthly = baData.monthly || [];
    const totals = baData.totals || {};

    // Month headers
    const monthHeaders = monthly.map(m => {
        const idx = BA_MONTH_KEYS.indexOf(m.month);
        return `<th style="padding:6px 8px;font-size:10px;color:var(--text-dim);text-align:center;min-width:60px;">${BA_MONTH_NAMES[idx].slice(0,3)}</th>`;
    }).join('');

    const rows = categories.map(cat => {
        const cells = monthly.map(m => {
            const val = (m.categories[cat.id] || {}).actual || 0;
            return `<td style="padding:6px 8px;font-size:11px;text-align:center;">${formatMoney(val)}</td>`;
        }).join('');

        const t = totals[cat.id] || { budgeted: 0, actual: 0, ratio: 0 };
        const ratioColor = cat.id === 'income'
            ? (t.ratio >= 100 ? '#10b981' : '#f59e0b')
            : (t.ratio > 100 ? '#ef4444' : t.ratio > 80 ? '#f59e0b' : '#10b981');

        return `<tr>
            <td style="padding:6px 8px;font-size:12px;white-space:nowrap;position:sticky;left:0;background:var(--card);z-index:1;font-weight:500;">${BA_CAT_ICONS[cat.id] || '📋'} ${escapeHtml(cat.name)}</td>
            ${cells}
            <td style="padding:6px 8px;font-size:11px;text-align:center;font-weight:600;">${formatMoney(t.budgeted)}</td>
            <td style="padding:6px 8px;font-size:11px;text-align:center;font-weight:600;">${formatMoney(t.actual)}</td>
            <td style="padding:6px 8px;font-size:11px;text-align:center;color:${ratioColor};font-weight:600;">${t.ratio}%</td>
        </tr>`;
    }).join('');

    container.innerHTML = `<div class="table-wrapper"><table style="width:100%;border-collapse:collapse;">
        <thead><tr>
            <th style="padding:6px 8px;font-size:10px;color:var(--text-dim);text-align:left;position:sticky;left:0;background:var(--card);z-index:2;">Category</th>
            ${monthHeaders}
            <th style="padding:6px 8px;font-size:10px;color:var(--text-dim);text-align:center;">Est.</th>
            <th style="padding:6px 8px;font-size:10px;color:var(--text-dim);text-align:center;">Actual</th>
            <th style="padding:6px 8px;font-size:10px;color:var(--text-dim);text-align:center;">Ratio</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table></div>`;
}


// ── Per-Category Detail Sections ────────────────────────────────────

function renderBADetailSections() {
    const container = document.getElementById('baDetailSections');
    if (!container || !baBudgetData) return;

    const categories = baBudgetData.categories || [];
    const grids = baData.detailGrids || {};
    const monthly = baData.monthly || [];

    container.innerHTML = categories.map(cat => {
        const grid = grids[cat.id] || {};
        const icon = BA_CAT_ICONS[cat.id] || '📋';

        // Month headers
        const monthHeaders = monthly.map(m => {
            const idx = BA_MONTH_KEYS.indexOf(m.month);
            return `<th style="padding:4px 6px;font-size:10px;color:var(--text-dim);text-align:center;min-width:55px;">${BA_MONTH_NAMES[idx].slice(0,3)}</th>`;
        }).join('');

        // Subcategory rows
        const subRows = Object.entries(grid).map(([subName, row]) => {
            const cells = monthly.map(m => {
                const val = row[m.month] || 0;
                return `<td style="padding:4px 6px;font-size:11px;text-align:center;">${val > 0 ? formatMoney(val) : '—'}</td>`;
            }).join('');

            return `<tr>
                <td style="padding:4px 6px;font-size:11px;white-space:nowrap;position:sticky;left:0;background:var(--card);z-index:1;">${escapeHtml(subName)}</td>
                ${cells}
                <td style="padding:4px 6px;font-size:11px;text-align:center;font-weight:600;">${formatMoney(row.total)}</td>
            </tr>`;
        }).join('');

        // Column totals
        const colTotals = monthly.map(m => {
            const total = Object.values(grid).reduce((s, row) => s + (row[m.month] || 0), 0);
            return `<td style="padding:4px 6px;font-size:11px;text-align:center;font-weight:600;">${formatMoney(total)}</td>`;
        }).join('');
        const grandTotal = Object.values(grid).reduce((s, row) => s + row.total, 0);

        return `<details class="card" style="padding:16px;margin-bottom:8px;">
            <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text);user-select:none;">${icon} ${escapeHtml(cat.name)} Detail</summary>
            <div class="table-wrapper" style="margin-top:8px;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr>
                        <th style="padding:4px 6px;font-size:10px;color:var(--text-dim);text-align:left;position:sticky;left:0;background:var(--card);z-index:1;">Subcategory</th>
                        ${monthHeaders}
                        <th style="padding:4px 6px;font-size:10px;color:var(--text-dim);text-align:center;">Total</th>
                    </tr></thead>
                    <tbody>${subRows}</tbody>
                    <tfoot><tr style="border-top:2px solid var(--border);font-weight:600;">
                        <td style="padding:4px 6px;font-size:11px;position:sticky;left:0;background:var(--card);z-index:1;">Total</td>
                        ${colTotals}
                        <td style="padding:4px 6px;font-size:11px;text-align:center;">${formatMoney(grandTotal)}</td>
                    </tr></tfoot>
                </table>
            </div>
        </details>`;
    }).join('');
}


// ── Charts ──────────────────────────────────────────────────────────

function renderBACharts() {
    const textColor = getChartTextColor();
    const gridColor = getChartGridColor();
    const monthly = baData.monthly || [];
    const labels = monthly.map(m => {
        const idx = BA_MONTH_KEYS.indexOf(m.month);
        return BA_MONTH_NAMES[idx].slice(0, 3);
    });

    // 1. Savings Rate Trend
    const ctx1 = document.getElementById('baSavingsRateChart');
    if (ctx1) {
        if (charts.baSavingsRate) charts.baSavingsRate.destroy();
        charts.baSavingsRate = new Chart(ctx1, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Savings Rate %',
                    data: monthly.map(m => m.savingsRate),
                    borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)',
                    fill: true, tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor } } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, callback: v => v + '%' }, grid: { color: gridColor } }
                }
            }
        });
    }

    // 2-7. Per-category monthly bar charts
    const categories = baBudgetData ? baBudgetData.categories : [];
    categories.forEach(cat => {
        const canvasId = 'baCat_' + cat.id + 'Chart';
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const chartKey = 'baCat_' + cat.id;
        if (charts[chartKey]) charts[chartKey].destroy();

        const data = monthly.map(m => (m.categories[cat.id] || {}).actual || 0);
        const color = BA_CHART_COLORS[cat.id] || '#6b7280';

        charts[chartKey] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: cat.name, data, backgroundColor: color }]
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
    });

    // 8. Income vs Expenses overlay
    const ctx8 = document.getElementById('baIncVsExpChart');
    if (ctx8) {
        if (charts.baIncVsExp) charts.baIncVsExp.destroy();
        charts.baIncVsExp = new Chart(ctx8, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Income', data: monthly.map(m => m.totalIncome), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3 },
                    { label: 'Expenses', data: monthly.map(m => m.totalExpenses), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor } } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, callback: v => '$' + v.toLocaleString() }, grid: { color: gridColor } }
                }
            }
        });
    }

    // 9. Estimated vs Actual totals
    const ctx9 = document.getElementById('baEstVsActChart');
    if (ctx9) {
        if (charts.baEstVsAct) charts.baEstVsAct.destroy();
        const totals = baData.totals || {};
        const catLabels = categories.map(c => c.name);
        charts.baEstVsAct = new Chart(ctx9, {
            type: 'bar',
            data: {
                labels: catLabels,
                datasets: [
                    { label: 'Estimated', data: categories.map(c => (totals[c.id] || {}).budgeted || 0), backgroundColor: '#3b82f6' },
                    { label: 'Actual', data: categories.map(c => (totals[c.id] || {}).actual || 0), backgroundColor: '#10b981' }
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

    // 10. Annual top spending
    const ctx10 = document.getElementById('baTopSpendChart');
    if (ctx10) {
        if (charts.baTopSpend) charts.baTopSpend.destroy();
        const grids = baData.detailGrids || {};
        const allSubs = [];
        for (const cat of categories) {
            if (cat.id === 'income') continue;
            const grid = grids[cat.id] || {};
            for (const [name, row] of Object.entries(grid)) {
                if (row.total > 0) allSubs.push({ name, total: row.total });
            }
        }
        allSubs.sort((a, b) => b.total - a.total);
        const top15 = allSubs.slice(0, 15);

        charts.baTopSpend = new Chart(ctx10, {
            type: 'bar',
            data: {
                labels: top15.map(s => s.name),
                datasets: [{ label: 'Annual Total', data: top15.map(s => s.total), backgroundColor: '#f59e0b' }]
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
}


// ── Notes Area ──────────────────────────────────────────────────────

function renderBANotes() {
    const container = document.getElementById('baNotesArea');
    if (!container) return;
    const textarea = container.querySelector('textarea');
    if (textarea) {
        textarea.value = baData.annualNotes || '';
    }
}

async function baSaveNotes() {
    const textarea = document.querySelector('#baNotesArea textarea');
    if (!textarea) return;
    try {
        await fetch('/api/budget/annual/notes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: textarea.value })
        });
        showSaveToast('Notes saved');
    } catch (e) { console.error(e); }
}
