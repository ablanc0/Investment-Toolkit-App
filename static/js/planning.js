// ── Planning (Cost of Living, Passive Income, Rule 4%) ──
let allCOLData = [];
let colConfig = {};
let colSalaryProfiles = [];
let colApiCities = [];   // Stored API cities for autocomplete
let colApiMeta = {};     // {cityCount, fetchedAt}
let colGlobalCities = []; // Global cities (all countries)

async function fetchCostOfLiving() {
    try {
        const [colResp, apiResp] = await Promise.all([
            fetch('/api/cost-of-living').then(r => r.json()),
            fetch('/api/cost-of-living/api-cities?include_global=1').then(r => r.json()).catch(() => ({ cities: [], meta: {} })),
        ]);
        allCOLData = colResp.costOfLiving || [];
        colConfig = colResp.colConfig || {};
        colSalaryProfiles = colResp.salaryProfiles || [];
        colApiCities = apiResp.cities || [];
        colApiMeta = apiResp.meta || {};
        colGlobalCities = apiResp.globalCities || [];
        renderCOLConfig();
        renderCOLKpis();
        renderCOLChart();
        filterCOL('all');
    } catch(e) { console.error(e); }
}

function renderCOLConfig() {
    const div = document.getElementById('colConfigInputs');
    if (!div) return;

    // ── Section 1: Your City ──
    const allCities = [...colApiCities, ...colGlobalCities.filter(g => typeof g === 'object')];
    const countries = [...new Set(allCities.map(c => c.country).filter(Boolean))].sort();
    const homeCountry = colConfig.homeCountry || 'United States';
    const homeState = colConfig.homeState || '';

    // States for selected country
    const countryCities = allCities.filter(c => c.country === homeCountry);
    const states = [...new Set(countryCities.map(c => c.state || c.us_state).filter(Boolean))].sort();

    const countryOpts = countries.map(c =>
        `<option value="${c}" ${c === homeCountry ? 'selected' : ''}>${c}</option>`
    ).join('');
    const stateOpts = states.length > 0
        ? states.map(s => `<option value="${s}" ${s === homeState ? 'selected' : ''}>${s}</option>`).join('')
        : '';

    // ── Section 2: Salary ──
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
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <!-- Your City Section -->
            <div style="padding:12px; background:var(--bg); border-radius:8px; border:1px solid var(--border);">
                <div style="font-size:0.82rem; font-weight:600; color:var(--text); margin-bottom:10px;">📍 Your City</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                    <div><label class="form-label" style="font-size:0.72rem;">Country</label>
                        <select class="form-input" style="width:100%; font-size:0.82rem;"
                            onchange="onHomeCountryChange(this.value)">
                            ${countryOpts}
                        </select></div>
                    <div><label class="form-label" style="font-size:0.72rem;">${states.length > 0 ? 'State' : 'Region'}</label>
                        ${states.length > 0
                            ? `<select class="form-input" style="width:100%; font-size:0.82rem;"
                                onchange="onHomeStateChange(this.value)">
                                <option value="">Select...</option>
                                ${stateOpts}
                            </select>`
                            : `<input type="text" value="${homeState}" class="form-input"
                                style="width:100%; font-size:0.82rem;" placeholder="Region/state"
                                onchange="onHomeStateChange(this.value)">`
                        }</div>
                </div>
                <div style="margin-bottom:10px;">
                    <label class="form-label" style="font-size:0.72rem;">City Name</label>
                    <input type="text" value="${colConfig.homeCityName || ''}" class="form-input"
                        style="width:100%; font-size:0.82rem;" placeholder="Your city name"
                        onchange="updateCOLConfig('homeCityName', this.value)">
                </div>
                ${renderHomeCityResolution()}
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:10px;">
                    <div><label class="form-label" style="font-size:0.72rem;">Your Rent/mo</label>
                        <input type="number" value="${colConfig.currentRent || 0}" class="form-input"
                            style="width:100%; font-size:0.82rem; text-align:right;"
                            onchange="updateCOLConfig('currentRent', parseFloat(this.value))"></div>
                    <div><label class="form-label" style="font-size:0.72rem;">Bedrooms</label>
                        <select class="form-input" style="width:100%; font-size:0.82rem;"
                            onchange="updateCOLConfig('bedroomCount', parseInt(this.value))">
                            <option value="1" ${(colConfig.bedroomCount||1)===1?'selected':''}>1 BR</option>
                            <option value="3" ${colConfig.bedroomCount===3?'selected':''}>3 BR</option>
                        </select></div>
                    <div><label class="form-label" style="font-size:0.72rem;">Location</label>
                        <select class="form-input" style="width:100%; font-size:0.82rem;"
                            onchange="updateCOLConfig('locationType', this.value)">
                            <option value="city" ${(colConfig.locationType||'city')==='city'?'selected':''}>City Centre</option>
                            <option value="suburb" ${colConfig.locationType==='suburb'?'selected':''}>Outside Centre</option>
                        </select></div>
                </div>
            </div>
            <!-- Salary Section -->
            <div style="padding:12px; background:var(--bg); border-radius:8px; border:1px solid var(--border);">
                <div style="font-size:0.82rem; font-weight:600; color:var(--text); margin-bottom:10px;">💰 Salary</div>
                <div style="margin-bottom:10px;">
                    <label class="form-label" style="font-size:0.72rem;">Reference Salary <span style="color:#4ade80;">(green)</span></label>
                    <input type="number" value="${colConfig.referenceSalary || 0}" class="form-input"
                        style="width:100%; font-size:0.82rem; text-align:right;" ${!isManual ? 'disabled' : ''}
                        onchange="updateCOLConfig('referenceSalary', parseFloat(this.value))">
                    <select style="font-size:0.72rem; margin-top:4px; width:100%; background:var(--card); color:var(--text-dim); border:1px solid var(--border); border-radius:4px; padding:2px 4px;"
                        onchange="updateCOLConfig('referenceSalarySource', this.value)">
                        ${sourceOpts}
                    </select>
                </div>
                <div>
                    <label class="form-label" style="font-size:0.72rem;">Comparison Salary <span style="color:#60a5fa;">(blue)</span></label>
                    <input type="number" value="${colConfig.comparisonSalary || 0}" class="form-input"
                        style="width:100%; font-size:0.82rem; text-align:right;"
                        onchange="updateCOLConfig('comparisonSalary', parseFloat(this.value))">
                </div>
            </div>
        </div>
        <div style="margin-top:8px; font-size:0.75rem; color:var(--text-dim);">
            ${colApiMeta.fetchedAt
                ? `<span style="color:#4ade80;">&#9679;</span> ${colApiMeta.cityCount} cities in database${colApiMeta.totalKnownCities ? ' / ' + colApiMeta.totalKnownCities + ' global' : ''} (updated ${new Date(colApiMeta.fetchedAt).toLocaleDateString()})`
                : '<span style="color:#64748b;">&#9679;</span> No API data — click "Refresh API Data" to fetch'}
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

function renderHomeCityResolution() {
    const source = colConfig.homeColSource || 'manual';
    const resolvedCol = colConfig.homeColIndex;
    const resolvedCosts = colConfig.homeMonthlyCosts;
    const homeCountry = colConfig.homeCountry || 'United States';
    const homeState = colConfig.homeState || '';

    // Check if home city is in the database
    const homeName = (colConfig.homeCityName || '').toLowerCase().trim();
    const matchedCity = colApiCities.find(c => c.name.toLowerCase() === homeName);

    if (matchedCity) {
        // City found in DB — show green checkmark with data
        return `<div style="padding:8px; background:#22c55e10; border:1px solid #22c55e30; border-radius:6px;">
            <div style="font-size:0.78rem; color:#4ade80; font-weight:600;">✓ Found in database</div>
            <div style="font-size:0.72rem; color:var(--text-dim); margin-top:4px;">
                COL Index: <strong>${matchedCity.colIndex}</strong> &nbsp;|&nbsp;
                Monthly Costs: <strong>$${matchedCity.monthlyCostsNoRent?.toLocaleString() || '—'}</strong> &nbsp;|&nbsp;
                ${matchedCity.state || ''}
            </div>
        </div>`;
    }

    // City NOT found — show fallback options
    const stateCities = colApiCities.filter(c => {
        if (homeState) return (c.state || '').toLowerCase() === homeState.toLowerCase();
        return c.country === homeCountry;
    });
    const stateAvgCol = stateCities.length > 0
        ? (stateCities.reduce((s, c) => s + (c.colIndex || 0), 0) / stateCities.length).toFixed(1)
        : null;
    const stateAvgCosts = stateCities.length > 0
        ? Math.round(stateCities.reduce((s, c) => s + (c.monthlyCostsNoRent || 0), 0) / stateCities.length)
        : null;
    const proxyCity = colConfig.homeProxyCity || '';
    const proxyMatch = proxyCity ? colApiCities.find(c => c.name.toLowerCase() === proxyCity.toLowerCase()) : null;

    let html = `<div style="padding:8px; background:#f59e0b10; border:1px solid #f59e0b30; border-radius:6px;">
        <div style="font-size:0.78rem; color:#f59e0b; margin-bottom:6px;">
            ⚠ "${colConfig.homeCityName || 'Your city'}" not in database. Choose data source:
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">`;

    // Option 1: Proxy city — show all cities in the selected state/region
    html += `<label style="display:flex; align-items:flex-start; gap:6px; cursor:pointer; font-size:0.78rem;">
        <input type="radio" name="homeColSource" value="proxy" ${source === 'proxy' ? 'checked' : ''}
            onchange="updateHomeColSource('proxy')" style="margin-top:2px;">
        <span>Use a city from ${homeState || homeCountry} as proxy${proxyMatch ? ` — <strong>${proxyMatch.name}</strong> (COL ${proxyMatch.colIndex}, costs $${proxyMatch.monthlyCostsNoRent?.toLocaleString()}/mo)` : ''}</span>
    </label>`;
    if (source === 'proxy') {
        const proxyCityOpts = stateCities
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `<option value="${c.name}" ${c.name.toLowerCase() === proxyCity.toLowerCase() ? 'selected' : ''}>${c.name} — COL ${c.colIndex}, $${c.monthlyCostsNoRent?.toLocaleString()}/mo</option>`)
            .join('');
        html += `<div style="margin-left:22px;">
            <select class="form-input" style="width:100%; font-size:0.78rem; padding:4px 8px;"
                onchange="selectHomeProxyCity(this.value)">
                <option value="">Select a city...</option>
                ${proxyCityOpts}
            </select>
        </div>`;
    }

    // Option 2: State/region average
    if (stateCities.length > 0) {
        html += `<label style="display:flex; align-items:flex-start; gap:6px; cursor:pointer; font-size:0.78rem;">
            <input type="radio" name="homeColSource" value="stateAvg" ${source === 'stateAvg' ? 'checked' : ''}
                onchange="updateHomeColSource('stateAvg')" style="margin-top:2px;">
            <span>Use ${homeState || homeCountry} average (${stateCities.length} cities: COL ${stateAvgCol}, costs $${stateAvgCosts?.toLocaleString()}/mo)</span>
        </label>`;
    }

    // Option 3: Manual entry
    html += `<label style="display:flex; align-items:flex-start; gap:6px; cursor:pointer; font-size:0.78rem;">
        <input type="radio" name="homeColSource" value="manual" ${source === 'manual' ? 'checked' : ''}
            onchange="updateHomeColSource('manual')" style="margin-top:2px;">
        <span>Enter manually</span>
    </label>`;
    if (source === 'manual') {
        html += `<div style="margin-left:22px; display:grid; grid-template-columns:1fr 1fr; gap:6px;">
            <div><label class="form-label" style="font-size:0.68rem;">Monthly Costs (no rent)</label>
                <input type="number" value="${resolvedCosts || ''}" class="form-input"
                    placeholder="e.g. 1100" style="width:100%; font-size:0.78rem; padding:4px 8px;"
                    onchange="updateCOLConfig('homeMonthlyCosts', this.value ? parseFloat(this.value) : null)"></div>
            <div><label class="form-label" style="font-size:0.68rem;">COL Index <span style="color:var(--text-dim);">(opt)</span></label>
                <input type="number" value="${resolvedCol || ''}" class="form-input"
                    placeholder="e.g. 70" step="0.1" style="width:100%; font-size:0.78rem; padding:4px 8px;"
                    onchange="updateCOLConfig('homeColIndex', this.value ? parseFloat(this.value) : null)"></div>
        </div>`;
    }

    html += `</div>`;
    // Show resolved values
    html += `<div style="margin-top:6px; font-size:0.72rem; color:var(--text-dim); border-top:1px solid var(--border); padding-top:4px;">
        Resolved: Monthly Costs = <strong style="color:${resolvedCosts ? '#4ade80' : '#f59e0b'};">${resolvedCosts != null ? '$' + resolvedCosts.toLocaleString() : 'not set'}</strong>
        ${resolvedCol != null ? `&nbsp;|&nbsp; COL Index = <strong style="color:#4ade80;">${resolvedCol}</strong>` : ''}
    </div>`;
    html += `</div>`;
    return html;
}

function updateHomeColSource(value) {
    updateCOLConfig('homeColSource', value);
}

function onHomeCountryChange(country) {
    // Reset state and city when country changes
    fetch('/api/cost-of-living/config/update', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ homeCountry: country, homeState: '', homeColSource: 'manual', homeColIndex: null, homeMonthlyCosts: null })
    }).then(r => r.json()).then(data => {
        if (data.ok) {
            colConfig = data.colConfig;
            allCOLData = data.costOfLiving;
            renderCOLConfig();
            renderCOLKpis();
            const activeType = document.querySelector('#colFilters .filter-btn.active');
            filterCOL(activeType?.dataset?.type || 'all');
        }
    }).catch(e => console.error(e));
}

function onHomeStateChange(state) {
    // Reset city resolution when state changes
    fetch('/api/cost-of-living/config/update', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ homeState: state, homeColSource: colConfig.homeColSource || 'manual' })
    }).then(r => r.json()).then(data => {
        if (data.ok) {
            colConfig = data.colConfig;
            allCOLData = data.costOfLiving;
            renderCOLConfig();
            renderCOLKpis();
            const activeType = document.querySelector('#colFilters .filter-btn.active');
            filterCOL(activeType?.dataset?.type || 'all');
        }
    }).catch(e => console.error(e));
}

function onHomeProxyCitySearch(query) {
    const results = document.getElementById('homeProxyResults');
    if (!results || query.length < 2) { if (results) results.innerHTML = ''; return; }
    const q = query.toLowerCase();
    const matches = colApiCities
        .filter(c => c.name.toLowerCase().includes(q) || (c.state || '').toLowerCase().includes(q))
        .slice(0, 8);
    results.innerHTML = matches.map(c =>
        `<div style="padding:4px 8px; cursor:pointer; font-size:0.78rem; border-bottom:1px solid var(--border);"
            onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background=''"
            onclick="selectHomeProxyCity('${c.name.replace(/'/g, "\\'")}')">
            <strong>${c.name}</strong>, ${c.state || ''} — COL ${c.colIndex} | $${c.monthlyCostsNoRent}/mo
        </div>`
    ).join('');
}

async function selectHomeProxyCity(cityName) {
    const results = document.getElementById('homeProxyResults');
    if (results) results.innerHTML = '';
    const input = document.getElementById('homeProxyInput');
    if (input) input.value = cityName;
    try {
        const resp = await fetch('/api/cost-of-living/config/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ homeProxyCity: cityName, homeColSource: 'proxy' })
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
            showSaveToast('Home proxy set to ' + cityName);
        }
    } catch(e) { console.error(e); }
}

async function dedupCOLCities() {
    const btn = document.getElementById('colDedupBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Deduping...'; }
    try {
        const resp = await fetch('/api/cost-of-living/dedup', { method: 'POST' });
        const data = await resp.json();
        if (data.ok) {
            showSaveToast(`Removed ${data.removed} duplicates (${data.remaining} remaining)`);
            allCOLData = data.costOfLiving || [];
            renderCOLKpis();
            renderCOLChart();
            const activeType = document.querySelector('#colFilters .filter-btn.active');
            filterCOL(activeType?.dataset?.type || 'all');
        } else {
            showAlert(data.error || 'Dedup failed', 'error');
        }
    } catch(e) { showAlert('Dedup failed: ' + e.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Dedup'; } }
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
    const homeCosts = colConfig.homeMonthlyCosts;
    const homeColLabel = homeCosts ? `$${homeCosts.toLocaleString()}/mo costs` : 'costs not set';
    div.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Home City (Baseline)</div>
            <div class="kpi-value" style="font-size:1.2rem;">${homeName}</div>
            <div class="kpi-sub">1.00x | ${formatMoney(homeRent)}/mo | ${homeColLabel}</div></div>
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
        const isApi = c.source === 'api';
        const apiBadge = isApi ? ' <span style="font-size:0.65rem; padding:1px 4px; border-radius:3px; background:#6366f120; color:#6366f1; vertical-align:middle;">API</span>' : '';
        const costs = c.monthlyCostsNoRent ? formatMoney(c.monthlyCostsNoRent) : '—';
        const totalCost = c.totalMonthlyCost ? formatMoney(c.totalMonthlyCost) : '—';
        const formulaUsed = c.formulaUsed || 'weighted';
        const formulaBadge = formulaUsed === 'direct'
            ? '<span style="font-size:0.65rem; padding:1px 6px; border-radius:3px; background:#22c55e20; color:#22c55e;">DIRECT</span>'
            : '<span style="font-size:0.65rem; padding:1px 6px; border-radius:3px; background:#f59e0b20; color:#f59e0b;">WEIGHTED</span>';
        const pp = c.purchasingPower ? c.purchasingPower.toFixed(0) : '—';
        return `<tr>
            <td><strong>${c.metro}</strong>${apiBadge}</td>
            <td>${c.area}</td>
            <td><span style="padding:2px 6px; border-radius:4px; font-size:0.75rem; background:${c.type==='Downtown'?'#f59e0b20':'#22c55e20'}; color:${c.type==='Downtown'?'#f59e0b':'#22c55e'};">${c.type}</span></td>
            <td style="text-align:right; cursor:pointer;" class="editable"
                onclick="editCOLCell(this, ${realIdx}, 'rent', ${c.rent})">${formatMoney(c.rent)}</td>
            <td style="text-align:right; color:var(--text-dim);">${costs}</td>
            <td style="text-align:right; font-weight:500;">${totalCost}</td>
            <td style="text-align:right; font-weight:600;">${(c.overallFactor || 0).toFixed(2)}x</td>
            <td style="text-align:center;">${formulaBadge}</td>
            <td style="text-align:right; font-weight:600; color:#4ade80;">${formatMoney(c.equivalentSalary)}</td>
            <td style="text-align:right; color:#60a5fa;">${formatMoney(c.elEquivalent)}</td>
            <td style="text-align:right; color:${parseFloat(pp) >= 100 ? '#4ade80' : parseFloat(pp) > 0 ? '#f59e0b' : 'var(--text-dim)'};">${pp}</td>
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
    document.getElementById('addCOLApiBtn').style.display = 'none';
    document.getElementById('addCOLForm').style.display = 'block';
    document.getElementById('addCOLApiForm').style.display = 'none';
    document.getElementById('newCOLMetro').focus();
}

function hideAddCOLForm() {
    document.getElementById('addCOLBtn').style.display = 'inline-flex';
    document.getElementById('addCOLApiBtn').style.display = 'inline-flex';
    document.getElementById('addCOLForm').style.display = 'none';
}

async function addCOLCity() {
    const metro = document.getElementById('newCOLMetro').value.trim();
    const area = document.getElementById('newCOLArea').value.trim();
    const type = document.getElementById('newCOLType').value;
    const rent = parseFloat(document.getElementById('newCOLRent').value);
    const monthlyCosts = parseFloat(document.getElementById('newCOLMonthlyCosts')?.value) || 0;
    if (!metro) { showAlert('Enter a metro name', 'error'); return; }
    if (isNaN(rent) || rent <= 0) { showAlert('Enter valid rent', 'error'); return; }
    try {
        const resp = await fetch('/api/cost-of-living/add', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ metro, area, type, rent, monthlyCostsNoRent: monthlyCosts, nonHousingMult: 1.0 })
        });
        const result = await resp.json();
        if (resp.ok) {
            showSaveToast(`${metro} added`);
            hideAddCOLForm();
            document.getElementById('newCOLMetro').value = '';
            document.getElementById('newCOLArea').value = '';
            document.getElementById('newCOLRent').value = '';
            const costsEl = document.getElementById('newCOLMonthlyCosts');
            if (costsEl) costsEl.value = '';
            fetchCostOfLiving();
        } else {
            showAlert(result.error || 'Failed to add city', 'error');
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

async function upgradeCOLFromApi() {
    const btn = document.getElementById('colUpgradeBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Upgrading...'; }
    try {
        const resp = await fetch('/api/cost-of-living/upgrade', { method: 'POST' });
        const data = await resp.json();
        if (data.ok) {
            showSaveToast(`Upgraded ${data.upgraded} cities with API data`);
            allCOLData = data.costOfLiving || [];
            renderCOLKpis();
            renderCOLChart();
            const activeType = document.querySelector('#colFilters .filter-btn.active');
            filterCOL(activeType?.dataset?.type || 'all');
        } else {
            showAlert(data.error || 'Upgrade failed', 'error');
        }
    } catch(e) { showAlert('Upgrade failed: ' + e.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Upgrade from API'; } }
}

// ── Cost of Living API Integration ──────────────────
async function refreshCOLData() {
    const btn = document.getElementById('colRefreshBtn');
    if (!btn) return;
    btn.disabled = true;

    try {
        // Phase 1: check for new cities (1 API call)
        btn.textContent = 'Checking cities...';
        const checkResp = await fetch('/api/cost-of-living/check-cities', { method: 'POST' });
        const checkData = await checkResp.json();
        if (!checkData.ok) {
            showAlert(checkData.error || 'Failed to check cities', 'error');
            return;
        }

        const { totalAll, totalUS, totalCountries, newCount, newCities } = checkData;
        if (newCount > 0) {
            showSaveToast(`${newCount} new US cities detected: ${newCities.join(', ')}`);
        } else {
            showSaveToast(`City list checked (${totalUS} US / ${totalAll} global across ${totalCountries} countries). Updating data...`);
        }

        // Phase 2: always fetch details (data may have changed) — wait 60s for rate limit
        btn.textContent = 'Waiting (rate limit)...';
        let seconds = 62;
        await new Promise(resolve => {
            const timer = setInterval(() => {
                seconds--;
                btn.textContent = `Fetching in ${seconds}s...`;
                if (seconds <= 0) { clearInterval(timer); resolve(); }
            }, 1000);
        });

        btn.textContent = 'Fetching details...';
        const fetchResp = await fetch('/api/cost-of-living/fetch-details', { method: 'POST' });
        const fetchData = await fetchResp.json();
        if (fetchData.ok) {
            const newMsg = fetchData.newCitiesAdded > 0 ? ` (${fetchData.newCitiesAdded} new!)` : '';
            showSaveToast(`Updated ${fetchData.cityCount} cities${newMsg}`);
            await fetch('/api/cost-of-living/recompute', { method: 'POST' });
            fetchCostOfLiving();
        } else {
            showAlert(fetchData.error || 'Failed to fetch details', 'error');
        }
    } catch(e) {
        showAlert('Refresh failed: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Refresh API Data';
    }
}

function showAddCOLApiForm() {
    document.getElementById('addCOLBtn').style.display = 'none';
    document.getElementById('addCOLApiBtn').style.display = 'none';
    document.getElementById('addCOLForm').style.display = 'none';
    document.getElementById('addCOLApiForm').style.display = 'block';
    document.getElementById('colApiSearch').value = '';
    document.getElementById('colApiResults').innerHTML = '';
    document.getElementById('colApiSearch').focus();
}

function hideAddCOLApiForm() {
    document.getElementById('addCOLBtn').style.display = 'inline-flex';
    document.getElementById('addCOLApiBtn').style.display = 'inline-flex';
    document.getElementById('addCOLApiForm').style.display = 'none';
    window._selectedApiCity = null;
}

function onCOLCitySearch(query) {
    const results = document.getElementById('colApiResults');
    if (!results || query.length < 2) { if (results) results.innerHTML = ''; return; }
    const q = query.toLowerCase();
    const existing = new Set(allCOLData.map(c => c.metro.toLowerCase()));
    const matches = colApiCities
        .filter(c => (c.name.toLowerCase().includes(q) || (c.state || '').toLowerCase().includes(q)) && !existing.has(c.name.toLowerCase()))
        .slice(0, 12);
    if (!matches.length) {
        results.innerHTML = '<div style="padding:8px; color:var(--text-dim); font-size:0.82rem;">No matches found</div>';
        return;
    }
    results.innerHTML = matches.map((c, i) => {
        const br = colConfig.bedroomCount || 1;
        const loc = colConfig.locationType || 'city';
        const rentKey = `rent${br}br${loc === 'city' ? 'City' : 'Suburb'}`;
        const rent = c[rentKey] || 0;
        return `<div style="padding:6px 10px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);"
            onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background=''"
            onclick='selectCOLApiCity(${JSON.stringify(c).replace(/'/g, "&#39;")})'>
            <span><strong>${c.name}</strong>${c.state ? ', ' + c.state : ''}</span>
            <span style="font-size:0.78rem; color:var(--text-dim);">$${rent.toLocaleString()}/mo | COL ${c.colIndex}</span>
        </div>`;
    }).join('');
}

function selectCOLApiCity(city) {
    const br = colConfig.bedroomCount || 1;
    const loc = colConfig.locationType || 'city';
    const rentKey = `rent${br}br${loc === 'city' ? 'City' : 'Suburb'}`;
    const rent = city[rentKey] || 0;
    const homeCol = colConfig.homeColIndex || 100;
    const nhm = city.colIndex ? (city.colIndex / homeCol).toFixed(2) : '1.00';
    // Add directly
    window._selectedApiCity = city;
    addCOLApiCity(city.name, city.state || '', loc === 'city' ? 'Downtown' : 'Suburban', rent, parseFloat(nhm), city);
}

async function addCOLApiCity(metro, area, type, rent, nonHousingMult, apiData) {
    try {
        const resp = await fetch('/api/cost-of-living/add', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ metro, area, type, rent, nonHousingMult, source: 'api', apiData })
        });
        if (resp.ok) {
            showSaveToast(`${metro} added from API`);
            hideAddCOLApiForm();
            fetchCostOfLiving();
        }
    } catch(e) { showAlert('Failed to add city', 'error'); }
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
