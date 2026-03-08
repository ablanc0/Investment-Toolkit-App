// ── Dividend Deep Dive Tab ──

async function fetchDividendDeepDive() {
    try {
        const resp = await fetch('/api/dividend-deep-dive');
        const data = await resp.json();
        const dd = data.deepDive;
        renderDivDeepKpis(dd.totals);
        renderDivDeepTable(dd.positions);
        renderDivDeepChart(dd.positions);
    } catch (e) {
        console.error('Error loading dividend deep dive:', e);
    }
}

function renderDivDeepKpis(t) {
    const el = document.getElementById('divDeepKpis');
    if (!el || !t) return;
    el.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Annual Div Income</div><div class="kpi-value positive">${formatMoney(t.totalAnnualIncome)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Monthly Div Income</div><div class="kpi-value">${formatMoney(t.totalMonthlyIncome)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Dividend Payers</div><div class="kpi-value">${t.dividendPayerCount}</div></div>
        <div class="kpi-card"><div class="kpi-label">5yr Projected Income</div><div class="kpi-value" style="color:#22d3ee">${formatMoney(t.totalFutureValue5yr)}</div><div class="kpi-sub">at 5% annual growth</div></div>
    `;
}

function renderDivDeepTable(positions) {
    const tbody = document.getElementById('divDeepBody');
    if (!tbody) return;
    tbody.innerHTML = positions.map(p => {
        const safetyColor = p.payoutSafety === 'Safe' ? '#22c55e' : p.payoutSafety === 'Moderate' ? '#f59e0b' : '#ef4444';
        let statusBadge = '';
        if (p.dividendStatus !== '-') {
            const stColor = p.dividendStatus.includes('King') ? '#f59e0b' : p.dividendStatus.includes('Aristocrat') ? '#8b5cf6' : '#3b82f6';
            statusBadge = `<span style="background:${stColor}22; color:${stColor}; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600;">${p.dividendStatus}${p.consecutiveYears ? ' (' + p.consecutiveYears + 'yr)' : ''}</span>`;
        } else {
            statusBadge = '<span style="color:var(--text-dim);">-</span>';
        }
        return `<tr>
            <td><strong>${p.ticker}</strong></td>
            <td style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.company}</td>
            <td style="text-align:right;">$${p.divPerShare.toFixed(2)}</td>
            <td style="text-align:right;">${formatPercent(p.currentYield)}</td>
            <td style="text-align:right;">${formatPercent(p.yieldOnCost)}</td>
            <td style="text-align:right; font-weight:600;">${formatMoney(p.annualIncome)}</td>
            <td style="text-align:right;">${formatMoney(p.monthlyIncome)}</td>
            <td style="text-align:right;">${p.pctOfTotal.toFixed(1)}%</td>
            <td><span style="background:${safetyColor}22; color:${safetyColor}; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">${p.payoutSafety}</span></td>
            <td>${statusBadge}</td>
            <td style="text-align:right;">${formatMoney(p.futureValue5yr)}</td>
        </tr>`;
    }).join('');
}

function renderDivDeepChart(positions) {
    const canvas = document.getElementById('divDeepChart');
    if (!canvas || !positions.length) return;
    if (canvas._chart) canvas._chart.destroy();
    const colors = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#64748b', '#d97706', '#4ade80', '#22d3ee', '#a78bfa', '#fb923c', '#f87171'];
    canvas._chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: positions.map(p => p.ticker),
            datasets: [{
                data: positions.map(p => p.annualIncome),
                backgroundColor: positions.map((_, i) => colors[i % colors.length] + '88'),
                borderColor: positions.map((_, i) => colors[i % colors.length]),
                borderWidth: 1,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right', labels: { color: '#9ca3af', font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatMoney(ctx.raw)} (${((ctx.raw / positions.reduce((a, b) => a + b.annualIncome, 0)) * 100).toFixed(1)}%)` } },
            }
        }
    });
}
