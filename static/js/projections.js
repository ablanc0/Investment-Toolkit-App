// ── Projections ──
let projDebounce = null;

async function fetchProjections() {
    try {
        const data = await fetch('/api/projections').then(r => r.json());
        // Auto-populate starting value from live portfolio if not set
        const cfg = data.config || {};
        if (!cfg.startingValue && window._portfolioSummary) {
            cfg.startingValue = window._portfolioSummary.totalPortfolio || 0;
        }
        if (!cfg.dividendYieldPct && window._portfolioSummary) {
            cfg.dividendYieldPct = window._portfolioSummary.portfolioDivYield || 0;
        }
        populateProjectionInputs(cfg);
        renderProjectionResults(data);
    } catch(e) { console.error('fetchProjections:', e); }
}

function populateProjectionInputs(cfg) {
    document.getElementById('projStartValue').value = Math.round((cfg.startingValue || 0) * 100) / 100;
    document.getElementById('projMonthlyContrib').value = cfg.monthlyContribution || 0;
    document.getElementById('projAnnualReturn').value = parseFloat((cfg.expectedReturnPct || 8).toFixed(2));
    document.getElementById('projDivYield').value = parseFloat((cfg.dividendYieldPct || 0).toFixed(2));
    document.getElementById('projInflation').value = cfg.inflationPct || 3;
    document.getElementById('projYears').value = cfg.years || 20;
}

function getProjectionInputs() {
    return {
        startingValue: parseFloat(document.getElementById('projStartValue').value) || 0,
        monthlyContribution: parseFloat(document.getElementById('projMonthlyContrib').value) || 0,
        expectedReturnPct: parseFloat(document.getElementById('projAnnualReturn').value) || 8,
        dividendYieldPct: parseFloat(document.getElementById('projDivYield').value) || 0,
        inflationPct: parseFloat(document.getElementById('projInflation').value) || 0,
        years: parseInt(document.getElementById('projYears').value) || 20,
    };
}

async function updateProjections() {
    clearTimeout(projDebounce);
    projDebounce = setTimeout(async () => {
        try {
            const params = getProjectionInputs();
            const data = await fetch('/api/projections/update', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(params)
            }).then(r => r.json());
            renderProjectionResults(data);
        } catch(e) { console.error('updateProjections:', e); }
    }, 300);
}

function renderProjectionResults(data) {
    const base = (data.table || {}).base || [];
    const bull = (data.table || {}).bull || [];
    const bear = (data.table || {}).bear || [];
    if (!base.length) return;
    renderProjectionKpis(base);
    renderProjectionCharts(base, bull, bear);
    renderProjectionTable(base);
}

function renderProjectionKpis(base) {
    const div = document.getElementById('projKpis');
    if (!div) return;
    const final = base[base.length - 1] || {};
    const yrs = base.length - 1;
    div.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Final Value (Year ${yrs})</div>
            <div class="kpi-value positive">${formatMoney(final.balance)}</div>
            <div class="kpi-sub">Real: ${formatMoney(final.realBalance)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Contributions</div>
            <div class="kpi-value" style="color:#60a5fa;">${formatMoney(final.contributions)}</div>
            <div class="kpi-sub">${formatMoney(final.contributions - base[0].contributions)} added</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Growth</div>
            <div class="kpi-value" style="color:#facc15;">${formatMoney(final.growth)}</div>
            <div class="kpi-sub">${((final.growth / final.contributions) * 100).toFixed(0)}% return</div></div>
        <div class="kpi-card"><div class="kpi-label">Est. Div Income (Yr ${yrs})</div>
            <div class="kpi-value" style="color:#a78bfa;">${formatMoney(final.divIncome)}</div>
            <div class="kpi-sub">${formatMoney(final.divIncome / 12)}/mo</div></div>`;
}

function renderProjectionCharts(base, bull, bear) {
    const labels = base.map(r => r.year === 0 ? 'Now' : `Yr ${r.year}`);
    const chartOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#e0e6ed' } },
            tooltip: {
                callbacks: {
                    label: ctx => `${ctx.dataset.label}: ${formatMoney(ctx.raw)}`
                }
            }
        },
        scales: {
            y: { ticks: { color: '#8b92b2', callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v }, grid: { color: '#2a2e42' } },
            x: { ticks: { color: '#8b92b2' }, grid: { color: '#2a2e42' } }
        }
    };

    // Growth chart — stacked area: contributions + growth
    const ctx = document.getElementById('projectionChart').getContext('2d');
    if (charts.projection) charts.projection.destroy();
    charts.projection = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Contributions', data: base.map(r => r.contributions), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.25)', fill: true, tension: 0.3, order: 2 },
                { label: 'Total Balance', data: base.map(r => r.balance), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)', fill: true, tension: 0.3, order: 1 },
                { label: 'Real (inflation adj.)', data: base.map(r => r.realBalance), borderColor: '#f59e0b', borderDash: [5,5], backgroundColor: 'transparent', fill: false, tension: 0.3, borderWidth: 1.5, order: 0 },
            ]
        },
        options: chartOpts
    });

    // Scenario chart
    const ctxR = document.getElementById('riskChart').getContext('2d');
    if (charts.risk) charts.risk.destroy();
    charts.risk = new Chart(ctxR, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Bull (+2%)', data: bull.map(r => r.balance), borderColor: '#22c55e', borderWidth: 2, tension: 0.3 },
                { label: 'Base', data: base.map(r => r.balance), borderColor: '#6366f1', borderWidth: 2, tension: 0.3 },
                { label: 'Bear (-2%)', data: bear.map(r => r.balance), borderColor: '#ef4444', borderWidth: 2, tension: 0.3 },
            ]
        },
        options: chartOpts
    });
}

function renderProjectionTable(base) {
    const div = document.getElementById('projTable');
    if (!div) return;
    const milestones = [50000, 100000, 250000, 500000, 1000000, 2000000, 5000000];
    let crossedSet = new Set();
    let html = `<div class="table-wrapper"><table style="width:100%; font-size:0.85rem;"><thead><tr>
        <th>Year</th><th style="text-align:right;">Balance</th><th style="text-align:right;">Real Balance</th>
        <th style="text-align:right;">Contributions</th><th style="text-align:right;">Growth</th>
        <th style="text-align:right;">Div Income</th><th style="text-align:right;">Cumul. Dividends</th>
    </tr></thead><tbody>`;
    for (const r of base) {
        let isMilestone = false;
        for (const m of milestones) {
            if (r.balance >= m && !crossedSet.has(m)) {
                crossedSet.add(m);
                isMilestone = true;
            }
        }
        const ms = isMilestone ? 'border-left: 3px solid #f59e0b; background: rgba(245,158,11,0.06);' : '';
        const yr0 = r.year === 0;
        html += `<tr style="${ms}">
            <td><strong>${r.year === 0 ? 'Now' : r.year}</strong></td>
            <td style="text-align:right; font-weight:${yr0 ? '400' : '600'}; color:#4ade80;">${formatMoney(r.balance)}</td>
            <td style="text-align:right; color:#f59e0b;">${formatMoney(r.realBalance)}</td>
            <td style="text-align:right; color:#60a5fa;">${formatMoney(r.contributions)}</td>
            <td style="text-align:right; color:${r.growth >= 0 ? '#4ade80' : '#f87171'};">${formatMoney(r.growth)}</td>
            <td style="text-align:right; color:#a78bfa;">${formatMoney(r.divIncome)}</td>
            <td style="text-align:right; color:var(--text-dim);">${formatMoney(r.totalDividends)}</td>
        </tr>`;
    }
    html += '</tbody></table></div>';
    div.innerHTML = html;
}
