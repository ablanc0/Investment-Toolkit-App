// ── Rule 4% / FIRE Calculator ──
let simData = null;

function calculateFireNumber() {
    const expenses = parseFloat(document.getElementById('fireExpenses').value) || 50000;
    const swr = parseFloat(document.getElementById('fireSWR').value) || 4;
    const fireNumber = (expenses * 100) / swr;
    document.getElementById('fireNumber').textContent = formatMoney(fireNumber);
}

function toggleStrategyInputs() {
    const strategy = document.getElementById('simStrategy').value;
    const divInputs = document.getElementById('divInputs');
    const grInputs = document.getElementById('guardrailInputs');
    divInputs.style.display = (strategy === 'dividend' || strategy === 'combined') ? 'flex' : 'none';
    grInputs.style.display = strategy === 'guardrails' ? 'flex' : 'none';
}

async function runHistoricalSimulation() {
    const balance = parseFloat(document.getElementById('simBalance').value) || 1000000;
    const rate = parseFloat(document.getElementById('simRate').value) || 4;
    const strategy = document.getElementById('simStrategy').value;
    const cashBuffer = parseInt(document.getElementById('simCashBuffer').value) || 0;
    const divYield = parseFloat(document.getElementById('simDivYield').value) || 4;
    const divGrowth = parseFloat(document.getElementById('simDivGrowth').value) || 5.6;
    const grFloor = parseFloat(document.getElementById('simGrFloor').value) || 80;
    const grCeiling = parseFloat(document.getElementById('simGrCeiling').value) || 120;

    document.getElementById('simSummaryCards').innerHTML = '<p style="color: var(--text-dim);">Running simulation...</p>';

    try {
        const params = `balance=${balance}&rate=${rate}&strategy=${strategy}&cashBuffer=${cashBuffer}&divYield=${divYield}&divGrowth=${divGrowth}&grFloor=${grFloor}&grCeiling=${grCeiling}`;
        const resp = await fetch(`/api/rule4pct/simulate?${params}`);
        simData = await resp.json();
        renderSimSummary();
        renderSimCharts();
        renderSimScenarios();
        renderStrategyComparison();
    } catch(e) {
        console.error(e);
        document.getElementById('simSummaryCards').innerHTML = '<p style="color: #f87171;">Simulation failed.</p>';
    }
}

function renderSimSummary() {
    if (!simData) return;
    const cards = document.getElementById('simSummaryCards');
    const stratLabel = {fixed: 'Fixed (Classic)', guardrails: 'Guardrails', dividend: 'Dividends Only', combined: 'Combined'}[simData.strategy] || simData.strategy;
    let html = '';
    for (const h of ['20', '30', '40']) {
        const r = simData.results[h];
        const rateColor = r.successRate >= 90 ? '#4ade80' : r.successRate >= 70 ? '#facc15' : '#f87171';
        html += `
            <div style="background: var(--card-hover); padding: 16px; border-radius: 10px; border-left: 4px solid ${rateColor};">
                <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 4px;">${h}-Year · ${stratLabel}</div>
                <div style="font-size: 2rem; font-weight: 800; color: ${rateColor};">${r.successRate}%</div>
                <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">
                    ${r.successCount}/${r.totalScenarios} survived
                </div>
                <div style="margin-top: 8px; font-size: 0.8rem;">
                    <div>Best: <strong style="color: #4ade80;">${r.bestStartYear}</strong> → ${formatMoney(r.bestFinalBalance)}</div>
                    <div>Worst: <strong style="color: #f87171;">${r.worstStartYear}</strong> → ${formatMoney(r.worstFinalBalance)}</div>
                    <div>Avg: ${formatMoney(r.avgFinalBalance)}</div>
                </div>
            </div>`;
    }
    cards.innerHTML = html;
}

function renderSimCharts() {
    if (!simData) return;

    const horizon = document.getElementById('simHorizon').value;
    const scenarios = simData.results[horizon]?.scenarios || [];
    if (!scenarios.length) return;

    // Balance trajectories chart
    const ctx = document.getElementById('simChart').getContext('2d');
    if (charts.simTrajectory) charts.simTrajectory.destroy();

    const labels = Array.from({length: parseInt(horizon)}, (_, i) => `Year ${i+1}`);
    const datasets = [];

    const best = scenarios.reduce((a, b) => a.finalBalance > b.finalBalance ? a : b, scenarios[0]);
    const worst = scenarios.reduce((a, b) => a.finalBalance < b.finalBalance ? a : b, scenarios[0]);

    const sampleCount = Math.min(8, scenarios.length);
    const step = Math.max(1, Math.floor(scenarios.length / sampleCount));
    for (let i = 0; i < scenarios.length; i += step) {
        const s = scenarios[i];
        datasets.push({
            label: `${s.startYear}`,
            data: s.data.map(d => d.balance),
            borderColor: s.survived ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)',
            borderWidth: 1, pointRadius: 0, tension: 0.3, fill: false,
        });
    }
    datasets.push({
        label: `Best: ${best.startYear}`, data: best.data.map(d => d.balance),
        borderColor: '#4ade80', borderWidth: 2.5, pointRadius: 0, tension: 0.3, fill: false,
    });
    datasets.push({
        label: `Worst: ${worst.startYear}`, data: worst.data.map(d => d.balance),
        borderColor: '#f87171', borderWidth: 2.5, pointRadius: 0, tension: 0.3, fill: false,
    });
    datasets.push({
        label: 'Zero', data: Array(parseInt(horizon)).fill(0),
        borderColor: '#8b92b2', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false,
    });

    charts.simTrajectory = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#8b92b2', callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v }, grid: { color: '#2a2e42' } },
                x: { ticks: { color: '#8b92b2', maxTicksLimit: 10 }, grid: { color: '#2a2e42' } },
            },
        },
    });

    // Success rate by withdrawal rate
    renderSuccessRateChart();
    // Inflation impact chart
    renderInflationChart();
}

async function renderSuccessRateChart() {
    const balance = parseFloat(document.getElementById('simBalance').value) || 1000000;
    const strategy = document.getElementById('simStrategy').value;
    const ctx2 = document.getElementById('simSuccessChart').getContext('2d');
    if (charts.simSuccess) charts.simSuccess.destroy();

    const rates = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8];
    const data20 = [], data30 = [], data40 = [];

    for (const rate of rates) {
        try {
            const resp = await fetch(`/api/rule4pct/simulate?balance=${balance}&rate=${rate}&strategy=${strategy}`);
            const d = await resp.json();
            data20.push(d.results['20'].successRate);
            data30.push(d.results['30'].successRate);
            data40.push(d.results['40'].successRate);
        } catch(e) { data20.push(0); data30.push(0); data40.push(0); }
    }

    charts.simSuccess = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: rates.map(r => r + '%'),
            datasets: [
                { label: '20 Years', data: data20, borderColor: '#4ade80', tension: 0.3, fill: false },
                { label: '30 Years', data: data30, borderColor: '#facc15', tension: 0.3, fill: false },
                { label: '40 Years', data: data40, borderColor: '#f87171', tension: 0.3, fill: false },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#e0e6ed' } } },
            scales: {
                y: { min: 0, max: 100, ticks: { color: '#8b92b2', callback: v => v + '%' }, grid: { color: '#2a2e42' } },
                x: { ticks: { color: '#8b92b2' }, grid: { color: '#2a2e42' } },
            },
        },
    });
}

function renderInflationChart() {
    if (!simData) return;
    const horizon = document.getElementById('simHorizon').value;
    const scenarios = simData.results[horizon]?.scenarios || [];
    if (!scenarios.length) return;

    const ctx = document.getElementById('simInflationChart').getContext('2d');
    if (charts.simInflation) charts.simInflation.destroy();

    const labels = Array.from({length: parseInt(horizon)}, (_, i) => `Year ${i+1}`);
    const balance0 = simData.startingBalance;
    const rate = simData.withdrawalRate / 100;
    const baseWithdrawal = balance0 * rate;

    // Pick notable periods: 1970 (high inflation), 2000 (dot-com), 2005 (pre-GFC), best & worst
    const notablePeriods = [
        { year: 1970, color: '#f87171', label: '1970 (Stagflation)' },
        { year: 2000, color: '#facc15', label: '2000 (Dot-com)' },
        { year: 2005, color: '#60a5fa', label: '2005 (Pre-GFC)' },
    ];

    const datasets = [];
    // Baseline: no inflation
    datasets.push({
        label: 'No Inflation', data: Array(parseInt(horizon)).fill(baseWithdrawal),
        borderColor: '#8b92b2', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false,
    });

    for (const p of notablePeriods) {
        const s = scenarios.find(s => s.startYear === p.year);
        if (!s) continue;
        datasets.push({
            label: p.label,
            data: s.data.map(d => d.withdrawalAmount),
            borderColor: p.color, borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false,
        });
    }

    charts.simInflation = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#e0e6ed', font: { size: 11 } } } },
            scales: {
                y: { ticks: { color: '#8b92b2', callback: v => '$' + (v/1000).toFixed(0) + 'K' }, grid: { color: '#2a2e42' } },
                x: { ticks: { color: '#8b92b2', maxTicksLimit: 10 }, grid: { color: '#2a2e42' } },
            },
        },
    });
}

async function renderStrategyComparison() {
    const container = document.getElementById('strategyCompare');
    container.innerHTML = '<p style="color: var(--text-dim);">Comparing strategies...</p>';

    const balance = parseFloat(document.getElementById('simBalance').value) || 1000000;
    const rate = parseFloat(document.getElementById('simRate').value) || 4;
    const horizon = parseInt(document.getElementById('simHorizon').value) || 20;
    const divYield = parseFloat(document.getElementById('simDivYield').value) || 4;
    const cashBuffer = parseInt(document.getElementById('simCashBuffer').value) || 0;

    try {
        const resp = await fetch(`/api/rule4pct/compare?balance=${balance}&rate=${rate}&horizon=${horizon}&divYield=${divYield}&cashBuffer=${cashBuffer}`);
        const data = await resp.json();

        const strategies = [
            { key: 'fixed', label: 'Fixed (Classic)', icon: '📐', color: '#6366f1' },
            { key: 'guardrails', label: 'Guardrails', icon: '🛡️', color: '#60a5fa' },
            { key: 'dividend', label: 'Dividends Only', icon: '💰', color: '#4ade80' },
            { key: 'combined', label: 'Combined', icon: '⚡', color: '#facc15' },
        ];

        let html = '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">';
        for (const s of strategies) {
            const r = data.comparison[s.key];
            const rateColor = r.successRate >= 90 ? '#4ade80' : r.successRate >= 70 ? '#facc15' : '#f87171';
            const isActive = document.getElementById('simStrategy').value === s.key;
            html += `
                <div style="background: ${isActive ? 'var(--card)' : 'var(--card-hover)'}; padding: 12px; border-radius: 8px; border: ${isActive ? '2px solid ' + s.color : '1px solid var(--border)'}; cursor: pointer; text-align: center;"
                     onclick="document.getElementById('simStrategy').value='${s.key}'; toggleStrategyInputs(); runHistoricalSimulation();">
                    <div style="font-size: 1.2rem;">${s.icon}</div>
                    <div style="font-size: 0.75rem; color: var(--text-dim); margin: 4px 0;">${s.label}</div>
                    <div style="font-size: 1.5rem; font-weight: 800; color: ${rateColor};">${r.successRate}%</div>
                    <div style="font-size: 0.7rem; color: var(--text-dim);">${r.successCount}/${r.totalScenarios}</div>
                    <div style="font-size: 0.7rem; margin-top: 4px;">Avg: ${formatMoney(r.avgFinalBalance)}</div>
                </div>`;
        }
        html += '</div>';
        html += `<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 8px; text-align: center;">${horizon}-year horizon · ${rate}% withdrawal · Click a strategy to switch</div>`;
        container.innerHTML = html;
    } catch(e) {
        console.error(e);
        container.innerHTML = '<p style="color: #f87171;">Comparison failed.</p>';
    }
}

function renderSimScenarios() {
    if (!simData) return;
    const horizon = document.getElementById('simHorizon').value;
    const scenarios = simData.results[horizon]?.scenarios || [];
    const select = document.getElementById('simStartYear');

    select.innerHTML = scenarios.map(s =>
        `<option value="${s.startYear}" ${!s.survived ? 'style="color: #f87171;"' : ''}>${s.startYear}${s.survived ? '' : ' (FAILED)'}</option>`
    ).join('');

    renderSimCharts();
    renderSimDetail();
}

function renderSimDetail() {
    if (!simData) return;
    const horizon = document.getElementById('simHorizon').value;
    const startYear = parseInt(document.getElementById('simStartYear').value);
    const scenarios = simData.results[horizon]?.scenarios || [];
    const scenario = scenarios.find(s => s.startYear === startYear);
    if (!scenario) return;

    const statusEl = document.getElementById('simScenarioStatus');
    if (scenario.survived) {
        statusEl.innerHTML = `<span class="badge signal-buy">SURVIVED</span> Final: <strong class="positive">${formatMoney(scenario.finalBalance)}</strong>`;
    } else {
        statusEl.innerHTML = `<span class="badge signal-expensive">DEPLETED</span> Portfolio ran out of money`;
    }

    const hasCashReserve = scenario.data.some(d => d.cashReserve !== null && d.cashReserve !== undefined);
    const container = document.getElementById('simDetailTable');
    let html = `<div class="table-wrapper"><table style="font-size: 0.85rem;">
        <thead><tr>
            <th>Year</th><th>Ret. Year</th><th style="text-align:right;">Balance</th>
            <th style="text-align:right;">Return %</th><th style="text-align:right;">Withdrawal</th>
            <th style="text-align:right;">Inflation</th><th style="text-align:right;">Cost of Living</th>
            ${hasCashReserve ? '<th style="text-align:right;">Cash Reserve</th>' : ''}
        </tr></thead><tbody>`;

    const baseWithdrawal = simData.startingBalance * (simData.withdrawalRate / 100);
    for (const d of scenario.data) {
        const balColor = d.balance > 0 ? '#4ade80' : '#f87171';
        const retColor = d.returnPct >= 0 ? '#4ade80' : '#f87171';
        const costMultiple = d.cumulativeInflation ? `${((d.cumulativeInflation - 1) * 100).toFixed(0)}%` : '—';
        html += `<tr${d.balance <= 0 ? ' style="opacity: 0.4;"' : ''}>
            <td style="font-weight: 600;">${d.year}</td>
            <td>${d.retirementYear}</td>
            <td style="text-align:right; color: ${balColor};">${formatMoney(d.balance)}</td>
            <td style="text-align:right; color: ${retColor};">${(d.returnPct * 100).toFixed(1)}%</td>
            <td style="text-align:right;">${formatMoney(d.withdrawalAmount)}</td>
            <td style="text-align:right;">${(d.inflationPct * 100).toFixed(1)}%</td>
            <td style="text-align:right; color: ${d.cumulativeInflation > 1.5 ? '#f87171' : '#facc15'};">+${costMultiple}</td>
            ${hasCashReserve ? `<td style="text-align:right; color: #60a5fa;">${d.cashReserve != null ? formatMoney(d.cashReserve) : '—'}</td>` : ''}
        </tr>`;
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// ── Generic CRUD delete ──────────────────────────────────
async function crudDeleteItem(apiPath, section, index, refreshFn) {
    if (!confirm('Delete this entry?')) return;
    try {
        const resp = await fetch(`/api/${apiPath}/delete`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({index})
        });
        if (resp.ok) {
            showSaveToast('Entry deleted');
            if (refreshFn) refreshFn();
            else {
                const loaderMap = {
                    soldPositions: fetchSoldPositions, dividendLog: fetchDividendLog,
                    monthlyData: fetchMonthlyData, myLab: fetchMyLab,
                    intrinsicValues: fetchIntrinsicValues, superInvestorBuys: fetchSuperInvestors,
                    passiveIncome: fetchPassiveIncome,
                    hsaExpenses: fetchTaxAccounts,
                };
                if (loaderMap[section]) loaderMap[section]();
            }
        }
    } catch(e) { alert('Error deleting'); }
}
