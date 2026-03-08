// ── Planning (Cost of Living, Passive Income, Rule 4%) ──
let allCOLData = [];
let colConfig = {};
let colSalaryProfiles = [];

async function fetchCostOfLiving() {
    try {
        const data = await fetch('/api/cost-of-living').then(r => r.json());
        allCOLData = data.costOfLiving || [];
        colConfig = data.colConfig || {};
        colSalaryProfiles = data.salaryProfiles || [];
        renderCOLConfig();
        renderCOLKpis();
        renderCOLChart();
        filterCOL('all');
    } catch(e) { console.error(e); }
}

function renderCOLConfig() {
    const div = document.getElementById('colConfigInputs');
    if (!div) return;
    const source = colConfig.referenceSalarySource || 'manual';
    const isManual = source === 'manual';
    const sourceOpts = [
        `<option value="manual" ${source === 'manual' ? 'selected' : ''}>Manual</option>`,
        ...colSalaryProfiles.map(p =>
            `<option value="${p.id}" ${source === p.id ? 'selected' : ''}>${p.name}</option>`
        ),
        `<option value="household" ${source === 'household' ? 'selected' : ''}>Household (all)</option>`,
    ].join('');
    div.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
            <div><label class="form-label">Home City</label>
                <input type="text" value="${colConfig.homeCityName || ''}" class="form-input"
                    style="width:100%; font-size:0.82rem;"
                    onchange="updateCOLConfig('homeCityName', this.value)"></div>
            <div><label class="form-label">Reference Salary <span style="color:#4ade80;">(green)</span></label>
                <input type="number" value="${colConfig.referenceSalary || 0}" class="form-input"
                    style="width:100%; font-size:0.82rem; text-align:right;" ${!isManual ? 'disabled' : ''}
                    onchange="updateCOLConfig('referenceSalary', parseFloat(this.value))">
                <select style="font-size:0.72rem; margin-top:4px; background:var(--card); color:var(--text-dim); border:1px solid var(--border); border-radius:4px; padding:2px 4px;"
                    onchange="updateCOLConfig('referenceSalarySource', this.value)">
                    ${sourceOpts}
                </select></div>
            <div><label class="form-label">Comparison Salary <span style="color:#60a5fa;">(blue)</span></label>
                <input type="number" value="${colConfig.comparisonSalary || 0}" class="form-input"
                    style="width:100%; font-size:0.82rem; text-align:right;"
                    onchange="updateCOLConfig('comparisonSalary', parseFloat(this.value))"></div>
            <div><label class="form-label">Current Rent/mo</label>
                <input type="number" value="${colConfig.currentRent || 0}" class="form-input"
                    style="width:100%; font-size:0.82rem; text-align:right;"
                    onchange="updateCOLConfig('currentRent', parseFloat(this.value))"></div>
            <div><label class="form-label">Housing Weight</label>
                <input type="range" min="0" max="100" value="${((colConfig.housingWeight || 0.3) * 100).toFixed(0)}"
                    style="width:100%;" oninput="this.nextElementSibling.textContent = this.value + '%'"
                    onchange="updateCOLConfig('housingWeight', this.value / 100)">
                <span style="font-size:0.82rem; color:var(--text-dim);">${((colConfig.housingWeight || 0.3) * 100).toFixed(0)}%</span></div>
        </div>`;
}

async function updateCOLConfig(key, value) {
    try {
        const resp = await fetch('/api/cost-of-living/config/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ [key]: value })
        });
        const data = await resp.json();
        if (data.ok) {
            colConfig = data.colConfig;
            allCOLData = data.costOfLiving;
            renderCOLConfig();
            renderCOLKpis();
            renderCOLChart();
            const activeType = document.querySelector('#colFilters .filter-btn.active');
            filterCOL(activeType?.dataset?.type || 'all');
            showSaveToast('Config updated');
        }
    } catch(e) { console.error(e); }
}

function renderCOLKpis() {
    const div = document.getElementById('colKpis');
    if (!div || !allCOLData.length) return;
    const homeName = colConfig.homeCityName || 'My City';
    const homeRent = colConfig.currentRent || 0;
    const sorted = [...allCOLData].sort((a, b) => a.overallFactor - b.overallFactor);
    const cheapest = sorted[0];
    const mostExp = sorted[sorted.length - 1];
    const avgFactor = allCOLData.reduce((s, c) => s + (c.overallFactor || 0), 0) / allCOLData.length;
    div.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Home City (Baseline)</div>
            <div class="kpi-value" style="font-size:1.2rem;">${homeName}</div>
            <div class="kpi-sub">1.00x | ${formatMoney(homeRent)}/mo</div></div>
        <div class="kpi-card"><div class="kpi-label">Cheapest City</div>
            <div class="kpi-value positive" style="font-size:1.2rem;">${cheapest.metro}</div>
            <div class="kpi-sub">${cheapest.overallFactor?.toFixed(2)}x | ${formatMoney(cheapest.equivalentSalary)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Most Expensive</div>
            <div class="kpi-value negative" style="font-size:1.2rem;">${mostExp.metro}</div>
            <div class="kpi-sub">${mostExp.overallFactor?.toFixed(2)}x | ${formatMoney(mostExp.equivalentSalary)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Avg. Factor</div>
            <div class="kpi-value">${avgFactor.toFixed(2)}x</div>
            <div class="kpi-sub">${allCOLData.length} cities tracked</div></div>`;
}

function renderCOLChart() {
    const canvas = document.getElementById('colChart');
    if (!canvas || !allCOLData.length) return;
    if (canvas._chart) canvas._chart.destroy();
    const homeEquiv = colConfig.referenceSalary || 1;
    const homeName = colConfig.homeCityName || 'My City';
    // Insert home city into sorted list
    const withHome = [...allCOLData.map(c => ({ label: `${c.metro} (${c.type[0]})`, salary: c.equivalentSalary, isHome: false })),
        { label: `${homeName} (HOME)`, salary: homeEquiv, isHome: true }
    ].sort((a, b) => a.salary - b.salary);
    canvas._chart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: withHome.map(c => c.label),
            datasets: [{
                label: 'Equivalent Salary',
                data: withHome.map(c => c.salary),
                backgroundColor: withHome.map(c =>
                    c.isHome ? '#4ade80' : c.salary <= homeEquiv ? '#4ade8060' : '#f8717180'),
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#64748b', callback: v => '$' + (v/1000).toFixed(0) + 'K' }, grid: { color: '#1e293b' } },
                y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });
}

function filterCOL(type, btn) {
    const tbody = document.getElementById('colBody');
    if (!tbody) return;
    const filtered = type === 'all' ? allCOLData : allCOLData.filter(c => c.type === type);
    if (btn) {
        document.querySelectorAll('#colFilters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    tbody.innerHTML = filtered.sort((a, b) => a.rent - b.rent).map(c => {
        const realIdx = allCOLData.indexOf(c);
        return `<tr>
            <td><strong>${c.metro}</strong></td>
            <td>${c.area}</td>
            <td><span style="padding:2px 6px; border-radius:4px; font-size:0.75rem; background:${c.type==='Downtown'?'#f59e0b20':'#22c55e20'}; color:${c.type==='Downtown'?'#f59e0b':'#22c55e'};">${c.type}</span></td>
            <td class="editable" style="text-align:right; cursor:pointer;"
                onclick="editCOLCell(this, ${realIdx}, 'rent', ${c.rent})">${formatMoney(c.rent)}</td>
            <td style="text-align:right;">${(c.housingMult || 0).toFixed(2)}x</td>
            <td class="editable" style="text-align:right; cursor:pointer;"
                onclick="editCOLCell(this, ${realIdx}, 'nonHousingMult', ${c.nonHousingMult})">${(c.nonHousingMult || 0).toFixed(2)}x</td>
            <td style="text-align:right;">${(c.overallFactor || 0).toFixed(2)}x</td>
            <td style="text-align:right; font-weight:600; color:#4ade80;">${formatMoney(c.equivalentSalary)}</td>
            <td style="text-align:right; color:#60a5fa;">${formatMoney(c.elEquivalent)}</td>
            <td><button class="delete-row-btn" onclick="deleteCOLCity(${realIdx})" title="Remove">&#10005;</button></td>
        </tr>`;
    }).join('');
}

function editCOLCell(td, index, field, currentValue) {
    if (td.querySelector('input')) return;
    const originalHTML = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentValue;
    input.step = field === 'rent' ? '1' : '0.01';
    input.style.cssText = 'width:80px; text-align:right; font-size:0.82rem; padding:2px 4px;';
    td.innerHTML = '';
    td.appendChild(input);
    td.classList.remove('editable');
    input.focus();
    input.select();
    const save = async () => {
        const newValue = parseFloat(input.value);
        if (isNaN(newValue) || newValue === currentValue) {
            td.innerHTML = originalHTML;
            td.classList.add('editable');
            return;
        }
        try {
            await fetch('/api/cost-of-living/update', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ index, updates: { [field]: newValue } })
            });
            await fetch('/api/cost-of-living/recompute', { method: 'POST' });
            showSaveToast(`${allCOLData[index].metro} updated`);
            fetchCostOfLiving();
        } catch(e) {
            td.innerHTML = originalHTML;
            td.classList.add('editable');
        }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            input.removeEventListener('blur', save);
            td.innerHTML = originalHTML;
            td.classList.add('editable');
        }
    });
}

function showAddCOLForm() {
    document.getElementById('addCOLBtn').style.display = 'none';
    document.getElementById('addCOLForm').style.display = 'block';
    document.getElementById('newCOLMetro').focus();
}

function hideAddCOLForm() {
    document.getElementById('addCOLBtn').style.display = 'inline-flex';
    document.getElementById('addCOLForm').style.display = 'none';
}

async function addCOLCity() {
    const metro = document.getElementById('newCOLMetro').value.trim();
    const area = document.getElementById('newCOLArea').value.trim();
    const type = document.getElementById('newCOLType').value;
    const rent = parseFloat(document.getElementById('newCOLRent').value);
    const nonHousingMult = parseFloat(document.getElementById('newCOLNonHousingMult').value) || 1.0;
    if (!metro) { showAlert('Enter a metro name', 'error'); return; }
    if (isNaN(rent) || rent <= 0) { showAlert('Enter valid rent', 'error'); return; }
    try {
        const resp = await fetch('/api/cost-of-living/add', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ metro, area, type, rent, nonHousingMult })
        });
        if (resp.ok) {
            showSaveToast(`${metro} added`);
            hideAddCOLForm();
            // Clear form
            document.getElementById('newCOLMetro').value = '';
            document.getElementById('newCOLArea').value = '';
            document.getElementById('newCOLRent').value = '';
            document.getElementById('newCOLNonHousingMult').value = '1.0';
            fetchCostOfLiving();
        }
    } catch(e) { showAlert('Failed to add city', 'error'); }
}

async function deleteCOLCity(index) {
    const city = allCOLData[index];
    if (!confirm(`Remove ${city.metro} — ${city.area}?`)) return;
    try {
        const resp = await fetch('/api/cost-of-living/delete', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ index })
        });
        if (resp.ok) {
            showSaveToast(`${city.metro} removed`);
            fetchCostOfLiving();
        }
    } catch(e) { showAlert('Failed to delete', 'error'); }
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
