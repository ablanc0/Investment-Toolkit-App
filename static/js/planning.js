// ── Planning (Cost of Living, Passive Income, Rule 4%) ──
let allCOLData = [];
function renderCostOfLiving(items) {
    allCOLData = items;
    filterCOL('all');
}
function filterCOL(type, btn) {
    const tbody = document.getElementById('colBody');
    if (!tbody) return;
    const filtered = type === 'all' ? allCOLData : allCOLData.filter(c => c.type === type);
    // Update active button
    if (btn) {
        btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    tbody.innerHTML = filtered.sort((a,b) => a.rent - b.rent).map(c => `<tr>
        <td><strong>${c.metro}</strong></td><td>${c.area}</td>
        <td><span style="padding:2px 6px; border-radius:4px; font-size:0.75rem; background:${c.type==='Downtown'?'#f59e0b20':'#22c55e20'}; color:${c.type==='Downtown'?'#f59e0b':'#22c55e'};">${c.type}</span></td>
        <td style="text-align:right;">${formatMoney(c.rent)}</td>
        <td style="text-align:right;">${c.housingMult?.toFixed(2)}x</td>
        <td style="text-align:right;">${c.overallFactor?.toFixed(2)}x</td>
        <td style="text-align:right; font-weight:600;">${formatMoney(c.equivalentSalary)}</td>
        <td style="text-align:right; color: var(--accent);">${formatMoney(c.elEquivalent)}</td>
    </tr>`).join('');
}

async function fetchCostOfLiving() {
    try {
        const data = await fetch('/api/salary').then(r => r.json());
        renderCostOfLiving(data.costOfLiving || []);
    } catch(e) { console.error(e); }
}

// ── Passive Income ──────────────────────────────────
async function fetchPassiveIncome() {
    try {
        const data = await fetch('/api/passive-income').then(r => r.json());
        renderPassiveIncome(data.passiveIncome || []);
    } catch(e) { console.error(e); }
}
function renderPassiveIncome(items) {
    const tbody = document.getElementById('passiveBody');
    const kpis = document.getElementById('passiveKpis');
    if (!tbody) return;
    // KPIs from latest year
    const latest = items.length > 0 ? items[items.length - 1] : null;
    const total = latest ? latest.total : 0;
    if (kpis) kpis.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Annual Passive Income</div>
            <div class="kpi-value positive">${formatMoney(total)}</div><div class="kpi-sub">${latest ? latest.year : ''}</div></div>
        <div class="kpi-card"><div class="kpi-label">Monthly Average</div>
            <div class="kpi-value">${formatMoney(total / 12)}</div><div class="kpi-sub">Per month</div></div>
        <div class="kpi-card"><div class="kpi-label">Daily Average</div>
            <div class="kpi-value">${formatMoney(total / 365)}</div><div class="kpi-sub">Per day</div></div>
    `;
    tbody.innerHTML = items.map(p => {
        const growth = p.growth ? (p.growth * 100).toFixed(1) + '%' : '—';
        return `<tr>
            <td><strong>${p.year}</strong></td>
            <td style="text-align:right; font-weight:700; color: var(--accent);">${formatMoney(p.total)}</td>
            <td style="text-align:right; color: ${p.growth > 0 ? '#4ade80' : 'var(--text-dim)'};">${growth}</td>
            <td style="text-align:right; color: #4ade80;">${formatMoney(p.dividends)}</td>
            <td style="text-align:right;">${formatMoney(p.interest)}</td>
            <td style="text-align:right;">${formatMoney(p.creditCardRewards)}</td>
            <td style="text-align:right;">${formatMoney(p.rent)}</td>
        </tr>`;
    }).join('');
    // Chart
    renderPassiveChart(items);
}
function renderPassiveChart(items) {
    const canvas = document.getElementById('passiveChart');
    if (!canvas || items.length === 0) return;
    if (canvas._chart) canvas._chart.destroy();
    const labels = items.map(i => i.year);
    canvas._chart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Dividends', data: items.map(i => i.dividends), backgroundColor: '#4ade80' },
                { label: 'Interest', data: items.map(i => i.interest), backgroundColor: '#6366f1' },
                { label: 'CC Rewards', data: items.map(i => i.creditCardRewards), backgroundColor: '#f59e0b' },
                { label: 'Rent', data: items.map(i => i.rent), backgroundColor: '#3b82f6' },
            ]
        },
        options: {
            responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } },
            scales: { x: { stacked: true, ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
                     y: { stacked: true, ticks: { color: '#64748b', callback: v => '$'+v }, grid: { color: '#1e293b' } } }
        }
    });
}

// ── Rule 4% ──────────────────────────────────
async function fetchRule4Pct() {
    try {
        const data = await fetch('/api/rule4pct').then(r => r.json());
        const r4 = data.rule4Pct || {};
        if (document.getElementById('fireExpenses')) document.getElementById('fireExpenses').value = r4.annualExpenses || 40000;
        if (document.getElementById('fireSWR')) document.getElementById('fireSWR').value = r4.withdrawalPct || 4;
        calculateFireNumber();
        // Auto-run historical simulation
        runHistoricalSimulation();
    } catch(e) { console.error(e); }
}
