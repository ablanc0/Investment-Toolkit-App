// ── Planning (Cost of Living, Passive Income, Rule 4%) ──
let allCOLData = [];
let colConfig = {};
let colSalaryProfiles = [];
let colApiCities = [];   // Stored API cities for autocomplete
let colApiMeta = {};     // {cityCount, fetchedAt}
let colGlobalCities = []; // Global cities (all countries)

async function fetchCostOfLiving() {
    try {
        const [colResp, apiResp, quotaResp] = await Promise.all([
            fetch('/api/cost-of-living').then(r => r.json()),
            fetch('/api/cost-of-living/api-cities?include_global=1').then(r => r.json()).catch(() => ({ cities: [], meta: {} })),
            fetch('/api/cost-of-living/quota').then(r => r.json()).catch(() => ({ quotas: {} })),
        ]);
        allCOLData = colResp.costOfLiving || [];
        colConfig = colResp.colConfig || {};
        colSalaryProfiles = colResp.salaryProfiles || [];
        colApiCities = apiResp.cities || [];
        colApiMeta = apiResp.meta || {};
        colGlobalCities = apiResp.globalCities || [];
        // Update quota display
        const rq = (quotaResp.quotas || {}).resettle;
        if (rq) updateQuotaDisplay({ remaining: Math.max(0, rq.limit - rq.used), limit: rq.limit });
        // Gate global refresh button on ditno quota
        const dq = (quotaResp.quotas || {}).rapidapi;
        const globalBtn = document.getElementById('colRefreshGlobalBtn');
        if (globalBtn && dq) {
            const ditnoRemaining = Math.max(0, dq.limit - dq.used);
            if (ditnoRemaining >= 17) {
                globalBtn.disabled = false;
                globalBtn.title = `Refresh all ${colApiMeta.totalKnownCities || 767} global cities (${ditnoRemaining} calls remaining)`;
            } else {
                globalBtn.disabled = true;
                globalBtn.title = `Requires ~17 API calls (${ditnoRemaining}/${dq.limit} remaining — upgrade to Pro)`;
            }
        }
        renderCOLConfig();
        renderCOLKpis();
        renderCOLChart();
        filterCOL('all');
    } catch(e) { console.error(e); }
}

function renderCOLConfig() {
    const div = document.getElementById('colConfigInputs');
    if (!div) return;

    const homeName = colConfig.homeCityName || '';
    const _matchName = homeName.toLowerCase().trim();
    const _matchedAll = colApiCities.filter(c => c.name.toLowerCase() === _matchName);
    const apiMatch = _matchedAll.find(c => c.source !== 'manual');
    const manualMatch = _matchedAll.find(c => c.source === 'manual');

    // ── Salary section ──
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
                <div style="display:grid; grid-template-columns:1fr auto auto; gap:8px; margin-bottom:8px;">
                    <div style="position:relative;">
                        <label class="form-label" style="font-size:0.72rem;">City</label>
                        <input type="text" id="homeCityInput" value="${homeName}" class="form-input"
                            style="width:100%; font-size:0.82rem;" placeholder="Search or type your city..."
                            autocomplete="off"
                            oninput="onHomeCityInput(this.value)"
                            onblur="confirmHomeCityName(this.value)"
                            onkeydown="if(event.key==='Enter'){event.preventDefault();confirmHomeCityName(this.value);}">
                        <div id="homeCityResults" style="position:absolute; top:100%; left:0; width:100%; z-index:50; max-height:220px; overflow-y:auto; background:var(--card); border:1px solid var(--border); border-radius:6px; display:none; box-shadow:0 4px 12px rgba(0,0,0,0.3);"></div>
                    </div>
                    <div style="width:140px;">
                        <label class="form-label" style="font-size:0.72rem;">Country</label>
                        ${renderCountrySelector()}
                    </div>
                    <div style="width:100px;">
                        <label class="form-label" style="font-size:0.72rem;">State/Region</label>
                        ${renderStateSelector()}
                    </div>
                </div>
                <div id="homeDataSourceLine">${renderDataSourceLine(apiMatch, manualMatch)}</div>
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
                ? `<span style="color:#4ade80;">&#9679;</span> ${colApiMeta.cityCount} cities in database (updated ${new Date(colApiMeta.fetchedAt).toLocaleDateString()})`
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

// ── Home city search autocomplete ──
function onHomeCityInput(query) {
    const results = document.getElementById('homeCityResults');
    if (!results) return;
    // Hide the data-source status line while the user is editing
    const dsLine = document.getElementById('homeDataSourceLine');
    if (dsLine) dsLine.style.display = 'none';
    const q = query.trim().toLowerCase();
    if (q.length < 2) { results.style.display = 'none'; return; }
    const matches = colApiCities
        .filter(c => c.name.toLowerCase().includes(q) || (c.country || '').toLowerCase().includes(q)
            || (c.state || '').toLowerCase().includes(q))
        .slice(0, 10);
    if (matches.length === 0) {
        results.style.display = 'none';
        return;
    }
    results.innerHTML = matches.map(c => {
        const loc = c.state && c.state !== 'N/A' ? `${c.state}, ${c.country}` : c.country || '';
        const srcTag = c.source === 'manual'
            ? '<span style="color:#f59e0b; font-size:0.68rem; margin-left:4px;">(manual)</span>'
            : '';
        return `<div style="padding:6px 10px; cursor:pointer; font-size:0.78rem; border-bottom:1px solid var(--border);"
            onmousedown="event.preventDefault(); selectHomeCity('${c.name.replace(/'/g, "\\'")}')"
            onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background=''">
            <strong>${c.name}</strong>, ${loc}${srcTag} <span style="color:var(--text-dim);">— COL ${c.colIndex}, $${c.monthlyCostsNoRent?.toLocaleString()}/mo</span>
        </div>`;
    }).join('');
    results.style.display = 'block';
}

let _homeCitySelecting = false;
function selectHomeCity(name) {
    _homeCitySelecting = true;
    const results = document.getElementById('homeCityResults');
    if (results) results.style.display = 'none';
    const city = colApiCities.find(c => c.name === name);
    // Set city name + infer country and state from city data
    const updates = { homeCityName: name };
    if (city) {
        if (city.country) updates.homeCountry = city.country;
        if (city.state && city.state !== 'N/A') updates.homeState = city.state;
    }
    fetch('/api/cost-of-living/config/update', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(updates)
    }).then(r => r.json()).then(data => {
        if (data.ok) {
            colConfig = data.colConfig;
            allCOLData = data.costOfLiving;
            renderCOLConfig();
            renderCOLKpis();
            renderCOLChart();
            const activeType = document.querySelector('#colFilters .filter-btn.active');
            filterCOL(activeType?.dataset?.type || 'all');
        }
    }).catch(e => console.error(e));
}

function confirmHomeCityName(value) {
    // Skip if a city was just selected via autocomplete (it handles its own update)
    if (_homeCitySelecting) { _homeCitySelecting = false; return; }
    const results = document.getElementById('homeCityResults');
    if (results) results.style.display = 'none';
    const trimmed = value.trim();
    // Re-show status line if name unchanged (user just blurred without editing)
    if (!trimmed || trimmed.toLowerCase() === (colConfig.homeCityName || '').toLowerCase()) {
        const dsLine = document.getElementById('homeDataSourceLine');
        if (dsLine) dsLine.style.display = '';
        return;
    }
    updateCOLConfig('homeCityName', trimmed);
}

function renderCountrySelector() {
    const homeCountry = colConfig.homeCountry || '';
    const countries = [...new Set(colApiCities.map(c => c.country).filter(Boolean))].sort();
    if (countries.length === 0) {
        return `<input type="text" value="${homeCountry}" class="form-input"
            style="width:100%; font-size:0.82rem;" placeholder="Country"
            onchange="updateCOLConfig('homeCountry', this.value)">`;
    }
    const opts = countries.map(c => {
        const sel = c === homeCountry ? 'selected' : '';
        return `<option value="${c}" ${sel}>${c}</option>`;
    }).join('');
    return `<select class="form-input" style="width:100%; font-size:0.82rem;"
        onchange="updateCOLConfig('homeCountry', this.value)">
        <option value="">--</option>
        ${opts}
    </select>`;
}

function renderStateSelector() {
    const homeState = colConfig.homeState || '';
    const homeCountry = colConfig.homeCountry || '';
    // Only show states for the selected country
    const countryCities = homeCountry
        ? colApiCities.filter(c => (c.country || '').toLowerCase() === homeCountry.toLowerCase())
        : colApiCities;
    const states = [...new Set(countryCities.map(c => c.state).filter(s => s && s !== 'N/A'))].sort();
    if (states.length === 0) {
        // No states for this country — free text input
        return `<input type="text" value="${homeState}" class="form-input"
            style="width:100%; font-size:0.82rem;" placeholder="Region"
            onchange="updateCOLConfig('homeState', this.value)">`;
    }
    const opts = states.map(s => {
        const sel = s === homeState ? 'selected' : '';
        return `<option value="${s}" ${sel}>${s}</option>`;
    }).join('');
    return `<select class="form-input" style="width:100%; font-size:0.82rem;"
        onchange="updateCOLConfig('homeState', this.value)">
        <option value="">--</option>
        ${opts}
    </select>`;
}

// ── Data source line + selector ──
function renderDataSourceLine(apiMatch, manualMatch) {
    const resolvedCosts = colConfig.homeMonthlyCosts;
    const resolvedCol = colConfig.homeColIndex;
    const colSource = colConfig.homeColSource || 'manual';

    // City found in DB — show entry line(s)
    if (apiMatch || manualMatch) {
        let html = '';
        const _loc = (c) => c.state && c.state !== 'N/A' ? `${c.state}, ${c.country}` : c.country || '';

        // API/Resettle entry — green, edit only (creates manual copy)
        if (apiMatch) {
            const srcLabel = apiMatch.source === 'resettle' ? 'Resettle' : 'API';
            html += `<div style="padding:6px 8px; background:#22c55e10; border:1px solid #22c55e30; border-radius:6px; font-size:0.75rem;">
                <span style="color:#4ade80; font-weight:600;">✓ ${apiMatch.name}, ${_loc(apiMatch)}</span>
                <span style="font-size:0.65rem; color:#60a5fa; margin-left:4px;">(${srcLabel})</span>
                <span style="color:var(--text-dim);"> — COL ${apiMatch.colIndex} · $${apiMatch.monthlyCostsNoRent?.toLocaleString()}/mo · Salary $${(apiMatch.avgNetSalary || 0).toLocaleString()}/mo</span>
                <a href="#" onclick="toggleEditManualCity(); return false;" style="color:var(--accent); font-size:0.7rem; margin-left:6px;">edit (creates manual entry)</a>
            </div>`;
        }

        // Manual entry — amber, edit + delete
        if (manualMatch) {
            html += `<div style="padding:6px 8px; background:#f59e0b10; border:1px solid #f59e0b30; border-radius:6px; font-size:0.75rem;${apiMatch ? ' margin-top:4px;' : ''}">
                <span style="color:#f59e0b; font-weight:600;">✎ ${manualMatch.name}, ${_loc(manualMatch)}</span>
                <span style="font-size:0.65rem; color:#f59e0b; margin-left:4px;">(manual)</span>
                <span style="color:var(--text-dim);"> — COL ${manualMatch.colIndex} · $${manualMatch.monthlyCostsNoRent?.toLocaleString()}/mo · Salary $${(manualMatch.avgNetSalary || 0).toLocaleString()}/mo</span>
                <a href="#" onclick="toggleEditManualCity(); return false;" style="color:var(--accent); font-size:0.7rem; margin-left:6px;">edit</a>
                <a href="#" onclick="deleteHomeCityManual('${manualMatch.name.replace(/'/g, "\\'")}'); return false;" style="color:#f87171; font-size:0.7rem; margin-left:6px;">delete</a>
            </div>`;
        }

        // Edit form — pre-fill from manual entry if exists, else API entry
        const editCity = manualMatch || apiMatch;
        const homeState = (colConfig.homeState || '').toLowerCase();
        const homeCountry = (colConfig.homeCountry || '').toLowerCase();
        const stateSalaryCities = colApiCities.filter(c =>
            c.source !== 'manual'
            && (c.state || '').toLowerCase() === homeState
            && (!homeCountry || (c.country || '').toLowerCase() === homeCountry)
            && c.avgNetSalary > 0);
        const stateAvgSalary = stateSalaryCities.length
            ? Math.round(stateSalaryCities.reduce((s, c) => s + c.avgNetSalary, 0) / stateSalaryCities.length)
            : 0;
        const userMonthlySalary = Math.round((colConfig.referenceSalary || 0) / 12);
        const currentSalary = editCity.avgNetSalary || stateAvgSalary || userMonthlySalary || 0;
        html += `<div id="editManualCityFields" style="display:none; margin-top:6px; padding:8px; background:var(--card-hover); border-radius:6px;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                <div><label class="form-label" style="font-size:0.68rem;">Costs/mo (no rent)</label>
                    <input type="number" id="editManualCosts" value="${editCity.monthlyCostsNoRent || ''}" class="form-input"
                        style="width:100%; font-size:0.78rem; padding:4px 8px;" oninput="updateEditPreview()"></div>
                <div><label class="form-label" style="font-size:0.68rem;">Avg Net Salary/mo (for PPI)</label>
                    <select id="editManualSalarySource" class="form-input" style="width:100%; font-size:0.72rem; padding:4px 8px; margin-bottom:4px;"
                        onchange="onEditSalarySourceChange(this.value)">
                        ${stateAvgSalary ? `<option value="stateAvg" ${currentSalary === stateAvgSalary ? 'selected' : ''}>State avg ($${stateAvgSalary.toLocaleString()}/mo from ${stateSalaryCities.length} cities)</option>` : ''}
                        <option value="user" ${currentSalary === userMonthlySalary ? 'selected' : ''}>Your salary ($${userMonthlySalary.toLocaleString()}/mo)</option>
                        <option value="custom">Custom</option>
                    </select>
                    <input type="number" id="editManualSalary" value="${currentSalary}" class="form-input"
                        style="width:100%; font-size:0.78rem; padding:4px 8px;" oninput="updateEditPreview()"></div>
            </div>
            <div id="editPreviewLine" style="margin-top:6px; font-size:0.75rem; color:var(--text-dim);"></div>
            <div style="margin-top:6px; text-align:right;">
                <button class="btn-secondary" style="font-size:0.72rem; padding:3px 10px;" onclick="toggleEditManualCity()">Cancel</button>
                <button class="btn-primary" style="font-size:0.72rem; padding:3px 10px; margin-left:4px;" onclick="saveEditManualCity()">Save</button>
            </div>
        </div>`;
        return html;
    }

    // City NOT in DB — show data source selector
    const homeState = (colConfig.homeState || '').toLowerCase();
    const homeCountry = (colConfig.homeCountry || '').toLowerCase();
    // All cities matching country/state (for individual options — includes manual)
    const allCountryCities = homeCountry
        ? colApiCities.filter(c => (c.country || '').toLowerCase() === homeCountry)
        : [...colApiCities];
    const allStateCities = homeState
        ? allCountryCities.filter(c => (c.state || '').toLowerCase() === homeState).sort((a, b) => a.name.localeCompare(b.name))
        : [];
    const proxyCities = allStateCities.length > 0 ? allStateCities : allCountryCities.sort((a, b) => a.name.localeCompare(b.name));
    // API-only cities for average calculation (exclude manual)
    const apiProxyCities = proxyCities.filter(c => c.source !== 'manual');

    // "Not found" hint
    const homeName = (colConfig.homeCityName || '').trim();
    let html = '';
    if (homeName) {
        html += `<div style="padding:6px 8px; margin-bottom:6px; background:#f8717110; border:1px solid #f8717130; border-radius:6px; font-size:0.72rem; color:#f87171;">
            "${homeName}" not found in database — select a data source below: use a nearby city as proxy, search online, or enter costs manually.
        </div>`;
    }

    // Build <select> options: proxy cities + average + search + manual
    let opts = '';
    const proxyCity = (colConfig.homeProxyCity || '').toLowerCase();

    // Proxy city options (all sources, label manual ones)
    proxyCities.forEach(c => {
        const sel = colSource === 'proxy' && c.name.toLowerCase() === proxyCity ? 'selected' : '';
        const tag = c.source === 'manual' ? ' (manual)' : '';
        opts += `<option value="proxy:${c.name}" ${sel}>${c.name}${tag} — COL ${c.colIndex}, $${c.monthlyCostsNoRent?.toLocaleString()}/mo</option>`;
    });

    // Average option (API cities only — exclude manual)
    if (apiProxyCities.length > 1) {
        const avgCol = (apiProxyCities.reduce((s, c) => s + (c.colIndex || 0), 0) / apiProxyCities.length).toFixed(1);
        const avgCosts = Math.round(apiProxyCities.reduce((s, c) => s + (c.monthlyCostsNoRent || 0), 0) / apiProxyCities.length);
        const sel = colSource === 'stateAvg' ? 'selected' : '';
        const label = allStateCities.length > 0 ? `API average (${apiProxyCities.length} cities)` : `Country API average (${apiProxyCities.length} cities)`;
        opts += `<option value="stateAvg" ${sel}>${label} — COL ${avgCol}, $${avgCosts.toLocaleString()}/mo</option>`;
    }

    // Search Online option
    opts += `<option value="searchOnline">Search Online</option>`;

    // Manual option
    const manualSel = colSource === 'manual' ? 'selected' : '';
    opts += `<option value="manual" ${manualSel}>Enter manually</option>`;

    html += `<div style="margin-bottom:4px;">
        <label class="form-label" style="font-size:0.72rem;">Data Source</label>
        <select class="form-input" style="width:100%; font-size:0.78rem;" onchange="onDataSourceChange(this.value)">
            ${opts}
        </select>
    </div>`;

    // Manual inputs (shown only when manual is selected)
    if (colSource === 'manual') {
        html += `<div>
            <label class="form-label" style="font-size:0.68rem;">Monthly Costs (no rent)</label>
            <input type="number" id="manualCosts" value="${resolvedCosts || ''}" class="form-input"
                placeholder="e.g. 1100" style="width:100%; font-size:0.78rem; padding:4px 8px;"
                onchange="updateCOLConfig('homeMonthlyCosts', this.value ? parseFloat(this.value) : null)">
        </div>
        <div style="margin-top:6px; text-align:right;">
            <button class="add-row-btn" style="font-size:0.72rem;" onclick="saveManualCityToDb()">Save to Database</button>
        </div>`;
    }

    // Resolved footer
    if (resolvedCosts != null) {
        const resolvedPpi = colConfig.homePurchasingPower;
        html += `<div style="margin-top:4px; font-size:0.72rem; color:var(--text-dim);">
            Resolved: <strong style="color:#4ade80;">$${resolvedCosts.toLocaleString()}/mo</strong>
            ${resolvedCol != null ? ` · COL <strong style="color:#4ade80;">${resolvedCol}</strong>` : ''}
            ${resolvedPpi != null ? ` · PPI <strong style="color:#f59e0b;">${resolvedPpi}</strong>` : ''}
        </div>`;
    }

    return html;
}

async function saveManualCityToDb() {
    const name = (colConfig.homeCityName || '').trim();
    if (!name) { showAlert('Enter a city name first', 'error'); return; }
    const costs = parseFloat(document.getElementById('manualCosts')?.value) || 0;
    if (!costs) { showAlert('Enter monthly costs to save', 'error'); return; }
    const rent = colConfig.currentRent || 0;
    const bedrooms = colConfig.bedroomCount || 1;
    const location = colConfig.locationType || 'city';
    try {
        const resp = await fetch('/api/cost-of-living/save-manual-city', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name, country: colConfig.homeCountry || '', state: colConfig.homeState || '',
                monthlyCostsNoRent: costs, rent, bedroomCount: bedrooms, locationType: location
            })
        });
        const data = await resp.json();
        if (data.ok) {
            showSaveToast(`${name} saved to database (manual)`);
            // Refresh city list to include the new entry
            const apiResp = await fetch('/api/cost-of-living/api-cities?include_global=1').then(r => r.json()).catch(() => ({ cities: [] }));
            colApiCities = apiResp.cities || [];
            colApiMeta = apiResp.meta || {};
            fetchCostOfLiving();  // refresh KPI cards + colConfig with updated PPI
        } else {
            showAlert(data.error || 'Save failed', 'error');
        }
    } catch(e) { showAlert('Save failed: ' + e.message, 'error'); }
}

function toggleEditManualCity() {
    const el = document.getElementById('editManualCityFields');
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
        if (el.style.display === 'block') updateEditPreview();
    }
}

function updateEditPreview() {
    const line = document.getElementById('editPreviewLine');
    if (!line) return;
    const costs = parseFloat(document.getElementById('editManualCosts')?.value) || 0;
    const salary = parseFloat(document.getElementById('editManualSalary')?.value) || 0;
    const nyc = colApiCities.find(c => c.name.toLowerCase() === 'new york');
    const nycCosts = nyc?.monthlyCostsNoRent || 1728;
    const nycSalary = nyc?.avgNetSalary || 5159;
    const br = colConfig.bedroomCount || 1;
    const loc = colConfig.locationType || 'city';
    const rentKey = `rent${br}br${loc === 'city' ? 'City' : 'Suburb'}`;
    const nycRent = nyc?.[rentKey] || 2697;
    const homeRent = colConfig.currentRent || 0;
    if (costs <= 0) { line.innerHTML = ''; return; }
    const col = (costs / nycCosts * 100).toFixed(1);
    const rentIdx = nycRent > 0 && homeRent > 0 ? (homeRent / nycRent * 100) : 0;
    const cpr = rentIdx > 0 ? ((parseFloat(col) + rentIdx) / 2).toFixed(1) : col;
    let ppiHtml = '';
    if (salary > 0 && cpr > 0) {
        const ppi = ((salary / cpr) / (nycSalary / 100) * 100).toFixed(1);
        const color = ppi >= 100 ? '#4ade80' : '#f59e0b';
        ppiHtml = ` · PPI <strong style="color:${color};">${ppi}</strong>`;
    }
    line.innerHTML = `COL <strong style="color:#22d3ee;">${col}</strong>${ppiHtml} <span style="font-size:0.68rem; color:var(--text-muted);">(NYC = 100)</span>`;
}

function onEditSalarySourceChange(value) {
    const input = document.getElementById('editManualSalary');
    if (!input) return;
    if (value === 'stateAvg') {
        const homeState = (colConfig.homeState || '').toLowerCase();
        const homeCountry = (colConfig.homeCountry || '').toLowerCase();
        const sc = colApiCities.filter(c =>
            c.source !== 'manual'
            && (c.state || '').toLowerCase() === homeState
            && (!homeCountry || (c.country || '').toLowerCase() === homeCountry)
            && c.avgNetSalary > 0);
        input.value = sc.length ? Math.round(sc.reduce((s, c) => s + c.avgNetSalary, 0) / sc.length) : 0;
        input.readOnly = true;
    } else if (value === 'user') {
        input.value = Math.round((colConfig.referenceSalary || 0) / 12);
        input.readOnly = true;
    } else {
        input.readOnly = false;
        input.focus();
    }
    updateEditPreview();
}

async function saveEditManualCity() {
    const name = (colConfig.homeCityName || '').trim();
    if (!name) return;
    const costs = parseFloat(document.getElementById('editManualCosts')?.value) || 0;
    const salary = parseFloat(document.getElementById('editManualSalary')?.value) || 0;
    if (!costs) { showAlert('Enter monthly costs', 'error'); return; }
    const rent = colConfig.currentRent || 0;
    const bedrooms = colConfig.bedroomCount || 1;
    const location = colConfig.locationType || 'city';
    try {
        const resp = await fetch('/api/cost-of-living/save-manual-city', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name, country: colConfig.homeCountry || '', state: colConfig.homeState || '',
                monthlyCostsNoRent: costs, avgNetSalary: salary, rent, bedroomCount: bedrooms, locationType: location
            })
        });
        const data = await resp.json();
        if (data.ok) {
            showSaveToast(`${name} saved to database (manual)`);
            const apiResp = await fetch('/api/cost-of-living/api-cities?include_global=1').then(r => r.json()).catch(() => ({ cities: [] }));
            colApiCities = apiResp.cities || [];
            colApiMeta = apiResp.meta || {};
            fetchCostOfLiving();  // refresh KPI cards + colConfig with updated PPI
        } else {
            showAlert(data.error || 'Save failed', 'error');
        }
    } catch(e) { showAlert('Save failed: ' + e.message, 'error'); }
}

async function deleteHomeCityManual(cityName) {
    try {
        const resp = await fetch('/api/cost-of-living/delete-manual-city', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name: cityName })
        });
        const data = await resp.json();
        if (data.ok) {
            showSaveToast(`Manual entry for ${cityName} deleted`);
            const apiResp = await fetch('/api/cost-of-living/api-cities?include_global=1').then(r => r.json()).catch(() => ({ cities: [] }));
            colApiCities = apiResp.cities || [];
            colApiMeta = apiResp.meta || {};
            fetchCostOfLiving();
        } else {
            showAlert(data.error || 'Delete failed', 'error');
        }
    } catch(e) { showAlert('Delete failed: ' + e.message, 'error'); }
}

function onDataSourceChange(value) {
    if (value === 'searchOnline') {
        searchHomeCity();
        return;
    } else if (value === 'manual') {
        updateCOLConfig('homeColSource', 'manual');
    } else if (value === 'stateAvg') {
        updateCOLConfig('homeColSource', 'stateAvg');
    } else if (value.startsWith('proxy:')) {
        const cityName = value.substring(6);
        fetch('/api/cost-of-living/config/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ homeProxyCity: cityName, homeColSource: 'proxy' })
        }).then(r => r.json()).then(data => {
            if (data.ok) {
                colConfig = data.colConfig;
                allCOLData = data.costOfLiving;
                renderCOLConfig();
                renderCOLKpis();
                renderCOLChart();
                const activeType = document.querySelector('#colFilters .filter-btn.active');
                filterCOL(activeType?.dataset?.type || 'all');
                showSaveToast('Data source: ' + cityName);
            }
        }).catch(e => console.error(e));
    }
}

async function searchHomeCity() {
    const cityName = (colConfig.homeCityName || '').trim();
    if (!cityName) { showAlert('Enter a city name first', 'error'); renderCOLConfig(); return; }
    const country = colConfig.homeCountry || '';
    // Show searching state in the config area
    const configArea = document.getElementById('homeDataSourceLine');
    if (configArea) {
        configArea.innerHTML = `<div style="padding:8px; font-size:0.82rem; color:var(--text-muted);"><span class="spinner" style="display:inline-block; width:14px; height:14px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.6s linear infinite; vertical-align:middle; margin-right:6px;"></span>Searching online for "${cityName}"...</div>`;
    }
    try {
        const resp = await fetch('/api/cost-of-living/fetch-city', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ city: cityName, country_code: country, force: true })
        });
        const data = await resp.json();
        if (data.quota) updateQuotaDisplay(data.quota);
        if (data.ok && data.city) {
            const city = data.city;
            // Update local cache
            const idx = colApiCities.findIndex(c => c.name.toLowerCase() === city.name.toLowerCase());
            if (idx >= 0) colApiCities[idx] = city; else colApiCities.push(city);
            // Set as proxy source
            const cfgResp = await fetch('/api/cost-of-living/config/update', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ homeProxyCity: city.name, homeColSource: 'proxy' })
            }).then(r => r.json());
            if (cfgResp.ok) {
                colConfig = cfgResp.colConfig;
                allCOLData = cfgResp.costOfLiving;
                renderCOLConfig(); renderCOLKpis(); renderCOLChart();
                const activeType = document.querySelector('#colFilters .filter-btn.active');
                filterCOL(activeType?.dataset?.type || 'all');
            }
            showSaveToast(`${city.name} found — COL ${city.colIndex || '?'}, $${(city.monthlyCostsNoRent || 0).toLocaleString()}/mo`);
        } else {
            const msg = data.message || 'City not found online';
            if (configArea) {
                configArea.innerHTML = `<div style="padding:8px; font-size:0.82rem; color:#f87171;">${msg}</div>`;
                setTimeout(() => renderCOLConfig(), 3000);
            } else {
                showAlert(msg, 'error');
                renderCOLConfig();
            }
        }
    } catch(e) {
        console.error('[COL] Home city search failed:', e);
        showAlert('Search failed — try again', 'error');
        renderCOLConfig();
    }
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

function _colKpiSub(factor, colIdx, avgSalary, ppi) {
    const colTag = colIdx ? `COL <strong style="color:#22d3ee;">${colIdx}</strong>` : '';
    const salTag = avgSalary ? `$${Math.round(avgSalary).toLocaleString()}/mo` : '';
    const ppiTag = ppi ? `PPI <strong style="color:${ppi >= 100 ? '#4ade80' : '#f59e0b'};">${ppi}</strong>` : '';
    return [factor, colTag, salTag, ppiTag].filter(Boolean).join(' · ');
}

function _colKpiCountry(city) {
    const country = city?.apiData?.country || '';
    if (!country || country === 'United States') return city?.area || '';
    return country;
}

function renderCOLKpis() {
    const div = document.getElementById('colKpis');
    if (!div || !allCOLData.length) return;
    div.style.gridTemplateColumns = 'repeat(4, 1fr)';
    const homeName = colConfig.homeCityName || 'My City';
    const homeCountry = colConfig.homeCountry || '';
    const homeLabel = homeCountry && homeCountry !== 'United States'
        ? `${homeName}, ${homeCountry}` : `${homeName}, ${colConfig.homeState || 'US'}`;
    const sorted = [...allCOLData].sort((a, b) => a.overallFactor - b.overallFactor);
    const cheapest = sorted[0];
    const mostExp = sorted[sorted.length - 1];
    const avgFactor = allCOLData.reduce((s, c) => s + (c.overallFactor || 0), 0) / allCOLData.length;
    // Home city data
    const homeCol = colConfig.homeColIndex ? Math.round(colConfig.homeColIndex * 10) / 10 : null;
    const homePPI = colConfig.homePurchasingPower;
    // Find home avgNetSalary from matched DB city
    const homeMatch = colApiCities.find(c => c.name.toLowerCase() === (colConfig.homeCityName || '').toLowerCase());
    const homeAvgSalary = homeMatch?.avgNetSalary || 0;
    // Cheapest/Most Expensive data
    const cheapCol = cheapest.apiData?.colIndex || cheapest.colIndex || null;
    const expCol = mostExp.apiData?.colIndex || mostExp.colIndex || null;
    const cheapLoc = _colKpiCountry(cheapest);
    const expLoc = _colKpiCountry(mostExp);
    div.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Home City (Baseline)</div>
            <div class="kpi-value" style="font-size:1.2rem;">${homeLabel}</div>
            <div class="kpi-sub">${_colKpiSub('1.00x', homeCol, homeAvgSalary, homePPI)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Cheapest City</div>
            <div class="kpi-value positive" style="font-size:1.2rem;">${cheapest.metro}${cheapLoc ? ', ' + cheapLoc : ''}</div>
            <div class="kpi-sub">${_colKpiSub(cheapest.overallFactor?.toFixed(2) + 'x', cheapCol, cheapest.avgNetSalary, cheapest.purchasingPower)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Most Expensive</div>
            <div class="kpi-value negative" style="font-size:1.2rem;">${mostExp.metro}${expLoc ? ', ' + expLoc : ''}</div>
            <div class="kpi-sub">${_colKpiSub(mostExp.overallFactor?.toFixed(2) + 'x', expCol, mostExp.avgNetSalary, mostExp.purchasingPower)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Avg. Factor</div>
            <div class="kpi-value">${avgFactor.toFixed(2)}x</div>
            <div class="kpi-sub">${allCOLData.length} cities tracked</div></div>`;
    // Glossary — independent card below KPI grid, above Reference Inputs
    let glossaryEl = document.getElementById('colGlossaryWrap');
    if (!glossaryEl) {
        glossaryEl = document.createElement('div');
        glossaryEl.id = 'colGlossaryWrap';
        div.after(glossaryEl);
    }
    glossaryEl.className = 'card';
    glossaryEl.style.cssText = 'margin-bottom:16px; padding:12px 20px;';
    glossaryEl.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px 24px; font-size:0.75rem; color:var(--text-muted); line-height:1.5;">
            <div><strong style="color:var(--text-secondary);">Factor</strong><br>Cost ratio vs your home city.<br>1.00x = same, &lt;1 cheaper, &gt;1 pricier.</div>
            <div><strong style="color:#22d3ee;">COL</strong><br>Cost of Living index.<br>NYC = 100. Lower = cheaper city.</div>
            <div><strong style="color:var(--text-secondary);">$/mo</strong><br>Avg net monthly salary<br>for the city or state.</div>
            <div><strong style="color:#4ade80;">PPI</strong><br>Purchasing Power Index (NYC = 100).<br><span style="color:#4ade80;">≥100</span> salary stretches further than in NYC.<br><span style="color:#f59e0b;">&lt;100</span> salary covers less than in NYC.</div>
        </div>`;
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

let colSortCol = 'rent';
let colSortAsc = true;

const _colSortKeys = {
    metro:   c => (c.metro || '').toLowerCase(),
    area:    c => (c.area || '').toLowerCase(),
    rent:    c => c.rent || 0,
    costs:   c => c.monthlyCostsNoRent || 0,
    total:   c => c.totalMonthlyCost || 0,
    factor:  c => c.overallFactor || 0,
    col:     c => c.colIndex || 0,
    equiv:   c => c.equivalentSalary || 0,
    elEquiv: c => c.elEquivalent || 0,
    ppi:     c => c.purchasingPower || 0,
};

function sortCOLTable(col) {
    if (colSortCol === col) { colSortAsc = !colSortAsc; }
    else { colSortCol = col; colSortAsc = true; }
    // Update header indicators
    const table = document.getElementById('colBody')?.closest('table');
    if (table) {
        table.querySelectorAll('th.sortable').forEach(th => {
            th.textContent = th.textContent.replace(/ [▲▼]$/, '');
            const match = th.getAttribute('onclick')?.match(/sortCOLTable\('(\w+)'\)/);
            if (match && match[1] === col) {
                th.textContent += colSortAsc ? ' ▲' : ' ▼';
            }
        });
    }
    filterCOL(_colActiveFilter());
}

function _colActiveFilter() {
    const activeBtn = document.querySelector('#colFilters .filter-btn.active');
    if (!activeBtn) return 'all';
    return activeBtn.textContent.trim() === 'Downtown' ? 'Downtown' : 'Suburban';
}

function filterCOL(type, btn) {
    const tbody = document.getElementById('colBody');
    if (!tbody) return;
    // Toggle: clicking active filter deselects it (shows all)
    if (btn && btn.classList.contains('active')) {
        btn.classList.remove('active');
        type = 'all';
    } else if (btn) {
        document.querySelectorAll('#colFilters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    const keyFn = _colSortKeys[colSortCol] || (c => c.rent || 0);
    const dir = colSortAsc ? 1 : -1;
    const filtered = type === 'all' ? allCOLData : allCOLData.filter(c => c.type === type);
    // Inject home city row
    const homeName = (colConfig.homeCityName || '').toLowerCase();
    if (homeName && !filtered.some(c => c.metro.toLowerCase() === homeName)) {
        const homeMatch = colApiCities.find(c => c.name.toLowerCase() === homeName);
        const homeCosts = homeMatch?.monthlyCostsNoRent || colConfig.homeMonthlyCosts || 0;
        const homeRent = colConfig.currentRent || 0;
        const homeSalary = homeMatch?.avgNetSalary || 0;
        const userMonthly = Math.round((colConfig.referenceSalary || 0) / 12);
        const salSrc = homeSalary === userMonthly ? 'you' : homeSalary > 0 ? 'avg' : 'you';
        filtered.push({
            metro: colConfig.homeCityName, area: colConfig.homeState || '',
            type: (colConfig.locationType === 'city') ? 'Downtown' : 'Suburban',
            source: 'home', rent: homeRent, monthlyCostsNoRent: homeCosts,
            totalMonthlyCost: homeRent + homeCosts, overallFactor: 1.0,
            colIndex: colConfig.homeColIndex || homeMatch?.colIndex || 0,
            avgNetSalary: homeSalary || userMonthly,
            equivalentSalary: colConfig.referenceSalary || 0,
            elEquivalent: colConfig.comparisonSalary || 0,
            purchasingPower: colConfig.homePurchasingPower || 0,
            pinned: true, _isHome: true, _salarySource: salSrc,
        });
    }
    tbody.innerHTML = filtered.sort((a, b) => {
        const va = keyFn(a), vb = keyFn(b);
        if (typeof va === 'string') return dir * va.localeCompare(vb);
        return dir * (va - vb);
    }).map(c => {
        const metroEsc = c.metro.replace(/'/g, "\\'");
        const isApi = c.source === 'api' || c.source === 'resettle';
        const isResettle = c.source === 'resettle' || (c.apiData && c.apiData.source === 'resettle');
        const apiBadge = isResettle
            ? ' <span style="font-size:0.65rem; padding:1px 4px; border-radius:3px; background:#8b5cf620; color:#8b5cf6; vertical-align:middle;">Resettle</span>'
            : isApi ? ' <span style="font-size:0.65rem; padding:1px 4px; border-radius:3px; background:#6366f120; color:#6366f1; vertical-align:middle;">API</span>' : '';
        const costs = c.monthlyCostsNoRent ? formatMoney(c.monthlyCostsNoRent) : '—';
        const totalCost = c.totalMonthlyCost ? formatMoney(c.totalMonthlyCost) : '—';
        const colIdx = c.colIndex ? c.colIndex.toFixed(0) : '—';
        const pp = c.purchasingPower ? c.purchasingPower.toFixed(0) : '—';
        const salSrc = c._isHome ? (c._salarySource === 'avg' ? 'State avg' : 'Your salary') : c.source === 'api' ? 'City avg' : 'Estimated';
        const isPinned = c.pinned !== false;
        const isHome = c._isHome;
        const rowStyle = isHome ? 'background:#4ade8012; border-left:3px solid #4ade80;'
            : isPinned ? '' : 'opacity:0.7; border-left:3px solid #f59e0b;';
        const homeBadge = isHome ? ' <span style="font-size:0.6rem; padding:1px 4px; border-radius:3px; background:#4ade8020; color:#4ade80; vertical-align:middle;">HOME</span>' : '';
        return `<tr style="${rowStyle}">
            <td style="text-align:center;">${isHome ? '' : `<input type="checkbox" ${isPinned ? 'checked' : ''} onchange="toggleCOLCity('${metroEsc}', this.checked)" title="${isPinned ? 'Uncheck to remove' : 'Check to pin'}">`}</td>
            <td><strong>${c.metro}</strong>${apiBadge}${homeBadge}${!isPinned && !isHome ? ' <span style="font-size:0.6rem; color:#f59e0b;">TEMP</span>' : ''}</td>
            <td>${c.area && c.area !== 'N/A' ? c.area : (colApiCities.find(x => x.name.toLowerCase() === (c.metro||'').toLowerCase()) || {}).country || ''}</td>
            <td><span style="padding:2px 6px; border-radius:4px; font-size:0.75rem; background:${c.type==='Downtown'?'#f59e0b20':'#22c55e20'}; color:${c.type==='Downtown'?'#f59e0b':'#22c55e'};">${c.type}</span></td>
            <td style="text-align:right; cursor:pointer;" class="editable"
                onclick="editCOLCell(this, '${metroEsc}', 'rent', ${c.rent})">${formatMoney(c.rent)}</td>
            <td style="text-align:right; color:var(--text-dim);">${costs}</td>
            <td style="text-align:right; font-weight:500;">${totalCost}</td>
            <td style="text-align:right; font-weight:600;">${(c.overallFactor || 0).toFixed(2)}x</td>
            <td style="text-align:right; color:#22d3ee;">${colIdx}</td>
            <td style="text-align:right; font-weight:600; color:#4ade80;">${formatMoney(c.equivalentSalary)}</td>
            <td style="text-align:right; color:#60a5fa;">${formatMoney(c.elEquivalent)}</td>
            <td style="text-align:right; color:${parseFloat(pp) >= 100 ? '#4ade80' : parseFloat(pp) > 0 ? '#f59e0b' : 'var(--text-dim)'};" title="Salary basis: ${salSrc} (${formatMoney(c.avgNetSalary || 0)}/mo)">${pp}${c._isHome ? ` <span style="font-size:0.55rem; color:var(--text-dim); vertical-align:middle;">${c._salarySource === 'avg' ? 'AVG' : 'YOU'}</span>` : ''}</td>
        </tr>`;
    }).join('');
}

function editCOLCell(td, metro, field, currentValue) {
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
                body: JSON.stringify({ metro, updates: { [field]: newValue } })
            });
            await fetch('/api/cost-of-living/recompute', { method: 'POST' });
            showSaveToast(`${metro} updated`);
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

function hideAddCityResults() {
    const results = document.getElementById('addCityResults');
    const manual = document.getElementById('addCityManualFields');
    const input = document.getElementById('addCityInput');
    if (results) results.style.display = 'none';
    if (manual) manual.style.display = 'none';
    if (input) input.value = '';
}

function onCityInputSearch(query) {
    const results = document.getElementById('addCityResults');
    if (!results) return;
    const q = query.trim().toLowerCase();
    if (q.length < 2) { results.style.display = 'none'; return; }
    const existing = new Set(allCOLData.map(c => c.metro.toLowerCase()));
    const br = colConfig.bedroomCount || 1;
    const loc = colConfig.locationType || 'city';
    const rentKey = `rent${br}br${loc === 'city' ? 'City' : 'Suburb'}`;
    const matches = colApiCities
        .filter(c => c.name.toLowerCase().includes(q) && !existing.has(c.name.toLowerCase()))
        .slice(0, 8);
    if (matches.length === 0) {
        const titleQ = q.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const qEsc = titleQ.replace(/'/g, "\\'");
        results.innerHTML = `<div style="padding:10px; font-size:0.82rem; color:var(--text-muted);">No local match — <a href="#" onclick="searchOnline('${qEsc}'); return false;" style="color:#8b5cf6; font-weight:500;">Search Online for "${titleQ}"</a> · <a href="#" onclick="showManualFields('${qEsc}'); return false;" style="color:var(--accent);">add manually</a></div>`;
        results.style.display = 'block';
        return;
    }
    results.innerHTML = matches.map(c => {
        const rent = c[rentKey] || 0;
        const nameEsc = c.name.replace(/'/g, "\\'");
        const srcTag = c.source === 'manual' ? ' <span style="color:#f59e0b; font-size:0.72rem;">(manual)</span>' : '';
        const loc2 = c.state && c.state !== 'N/A' ? c.state : c.country;
        return `<div style="padding:8px 12px; cursor:pointer; font-size:0.82rem; border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background=''" onclick="selectCityResult('${nameEsc}')">
            <strong>${c.name}</strong>, ${loc2}${srcTag} <span style="color:var(--text-muted); margin-left:8px;">$${rent.toLocaleString()}/mo · COL ${c.colIndex}</span></div>`;
    }).join('');
    const titleQ = q.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const qEsc = titleQ.replace(/'/g, "\\'");
    results.innerHTML += `<div style="padding:8px 12px; cursor:pointer; font-size:0.82rem; border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background=''" onclick="searchOnline('${qEsc}')"><span style="color:#8b5cf6;">Search Online for "${titleQ}"</span> <span style="color:var(--text-muted);">— Resettle API</span></div>`;
    results.innerHTML += `<div style="padding:8px 12px; cursor:pointer; font-size:0.82rem; color:var(--text-muted);" onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background=''" onclick="showManualFields('${qEsc}')">Enter manually...</div>`;
    results.style.display = 'block';
}

function selectCityResult(name) {
    const city = colApiCities.find(c => c.name === name);
    if (!city) return;
    const br = colConfig.bedroomCount || 1;
    const loc = colConfig.locationType || 'city';
    const rentKey = `rent${br}br${loc === 'city' ? 'City' : 'Suburb'}`;
    const rent = city[rentKey] || 0;
    const type = loc === 'city' ? 'Downtown' : 'Suburban';
    hideAddCityResults();
    const area = city.state && city.state !== 'N/A' ? city.state : city.country || city.countryCode || '';
    addCOLApiCity(city.name, area, type, rent, 1.0, city);
}

async function searchOnline(query) {
    const results = document.getElementById('addCityResults');
    if (results) {
        results.innerHTML = `<div style="padding:12px; font-size:0.82rem; color:var(--text-muted);"><span class="spinner" style="display:inline-block; width:14px; height:14px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.6s linear infinite; vertical-align:middle; margin-right:6px;"></span>Searching Resettle API...</div>`;
        results.style.display = 'block';
    }
    try {
        const resp = await fetch('/api/cost-of-living/fetch-city', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ city: query, force: true })
        });
        const data = await resp.json();
        if (data.ok && data.city) {
            const city = data.city;
            // Update local cache so city appears in future searches
            const existingIdx = colApiCities.findIndex(c => c.name.toLowerCase() === city.name.toLowerCase());
            if (existingIdx >= 0) colApiCities[existingIdx] = city;
            else colApiCities.push(city);
            const br = colConfig.bedroomCount || 1;
            const loc = colConfig.locationType || 'city';
            const rentKey = `rent${br}br${loc === 'city' ? 'City' : 'Suburb'}`;
            const rent = city[rentKey] || 0;
            const type = loc === 'city' ? 'Downtown' : 'Suburban';
            hideAddCityResults();
            updateQuotaDisplay(data.quota);
            const area = city.state && city.state !== 'N/A' ? city.state : city.country || city.countryCode || '';
            addCOLApiCity(city.name, area, type, rent, 1.0, city);
            showSaveToast(`${city.name} fetched from Resettle (check to keep)`);
        } else {
            const msg = data.message || data.error || 'City not found';
            if (results) {
                const qEsc = query.replace(/'/g, "\\'");
                results.innerHTML = `<div style="padding:10px; font-size:0.82rem; color:#f87171;">${msg}</div><div style="padding:8px 12px; font-size:0.82rem; color:var(--text-muted); cursor:pointer;" onclick="showManualFields('${qEsc}')">Enter manually instead...</div>`;
            }
            if (data.quota) updateQuotaDisplay(data.quota);
        }
    } catch(e) {
        console.error('[COL] Online search failed:', e);
        if (results) results.innerHTML = `<div style="padding:10px; font-size:0.82rem; color:#f87171;">Search failed — try again or add manually</div>`;
    }
}

function updateQuotaDisplay(quota) {
    const el = document.getElementById('colQuotaDisplay');
    if (!el || !quota) return;
    el.textContent = `API: ${quota.remaining}/${quota.limit} remaining`;
    el.style.color = quota.remaining <= 10 ? '#f59e0b' : 'var(--text-dim)';
}

function showManualFields(prefill) {
    const results = document.getElementById('addCityResults');
    const input = document.getElementById('addCityInput');
    if (results) results.style.display = 'none';
    if (input) input.value = '';
    const container = document.getElementById('addCityManualFields');
    if (!container) return;
    const cityName = prefill ? prefill.charAt(0).toUpperCase() + prefill.slice(1) : '';
    const br = colConfig.bedroomCount || 1;
    const loc = colConfig.locationType || 'city';
    container.innerHTML = `<div style="display:flex; gap:8px; align-items:end; flex-wrap:wrap;">
        <div><label class="form-label">City</label>
            <input type="text" id="addCityManualName" class="form-input" value="${cityName}" style="font-size:0.82rem; width:150px;"></div>
        <div><label class="form-label">Area</label>
            <input type="text" id="addCityManualArea" class="form-input" placeholder="e.g. IL" style="font-size:0.82rem; width:60px;"></div>
        <div><label class="form-label">Type</label>
            <select id="addCityManualType" class="form-input" style="font-size:0.82rem;">
                <option value="Downtown" ${loc === 'city' ? 'selected' : ''}>Downtown</option>
                <option value="Suburban" ${loc === 'suburb' ? 'selected' : ''}>Suburban</option></select></div>
        <div><label class="form-label">Bedrooms</label>
            <select id="addCityManualBedrooms" class="form-input" style="font-size:0.82rem;">
                <option value="1" ${br === 1 ? 'selected' : ''}>1 BR</option>
                <option value="3" ${br === 3 ? 'selected' : ''}>3 BR</option></select></div>
        <div><label class="form-label">Rent/mo</label>
            <input type="number" id="addCityManualRent" class="form-input" placeholder="2500" style="font-size:0.82rem; width:90px;"></div>
        <div><label class="form-label">Costs/mo</label>
            <input type="number" id="addCityManualCosts" class="form-input" placeholder="1200" style="font-size:0.82rem; width:90px;"></div>
        <button class="btn-primary" onclick="submitManualCity()" style="font-size:0.82rem;">Add</button>
        <button class="btn-secondary" onclick="hideAddCityResults()" style="font-size:0.82rem;">Cancel</button>
    </div>`;
    container.style.display = 'block';
}

async function submitManualCity() {
    const metro = document.getElementById('addCityManualName')?.value.trim();
    const area = document.getElementById('addCityManualArea')?.value.trim();
    const type = document.getElementById('addCityManualType')?.value || 'Downtown';
    const br = parseInt(document.getElementById('addCityManualBedrooms')?.value) || 1;
    const rent = parseFloat(document.getElementById('addCityManualRent')?.value);
    const costs = parseFloat(document.getElementById('addCityManualCosts')?.value) || 0;
    if (!metro) { showAlert('Enter a city name', 'error'); return; }
    if (isNaN(rent) || rent <= 0) { showAlert('Enter valid rent', 'error'); return; }
    try {
        const resp = await fetch('/api/cost-of-living/add', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ metro, area, type, rent, monthlyCostsNoRent: costs, nonHousingMult: 1.0, pinned: false, bedrooms: br })
        });
        const result = await resp.json();
        if (resp.ok) {
            showSaveToast(`${metro} added (check to keep)`);
            hideAddCityResults();
            fetchCostOfLiving();
        } else {
            showAlert(result.error || 'Failed to add city', 'error');
        }
    } catch(e) { showAlert('Failed to add city', 'error'); }
}

async function toggleCOLCity(metro, checked) {
    if (checked) {
        // Pin the city (keep in comparison)
        try {
            const resp = await fetch('/api/cost-of-living/pin', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ metro, pinned: true })
            });
            if (resp.ok) {
                showSaveToast(`${metro} pinned`);
                fetchCostOfLiving();
            }
        } catch(e) { showAlert('Failed to pin', 'error'); }
    } else {
        // Uncheck = remove from comparison
        try {
            const resp = await fetch('/api/cost-of-living/delete', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ metro })
            });
            if (resp.ok) {
                showSaveToast(`${metro} removed`);
                fetchCostOfLiving();
            }
        } catch(e) { showAlert('Failed to remove', 'error'); }
    }
}

async function toggleAllCOLCities(checked) {
    if (checked) return; // can't re-add all at once, only uncheck makes sense
    // Uncheck all = remove all cities (dangerous, re-check the header instead)
    const headerCb = document.querySelector('#colBody')?.closest('table')?.querySelector('thead input[type="checkbox"]');
    if (headerCb) headerCb.checked = true;
    showAlert('Uncheck individual cities to remove them from comparison.', 'info');
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
        btn.textContent = 'Refresh US Data';
    }
}

async function refreshCOLGlobal() {
    const btn = document.getElementById('colRefreshGlobalBtn');
    if (!btn) return;

    const cityCount = colApiMeta.totalKnownCities || 767;
    const batches = Math.ceil(cityCount / 50);
    if (!confirm(`This will fetch all ${cityCount} global cities in ${batches + 1} API calls.\n\nRequires Pro plan. Continue?`)) return;

    btn.disabled = true;
    try {
        // Phase 1: check cities first
        btn.textContent = 'Checking cities...';
        await fetch('/api/cost-of-living/check-cities', { method: 'POST' });

        // Wait for rate limit
        btn.textContent = 'Waiting (rate limit)...';
        let seconds = 62;
        await new Promise(resolve => {
            const timer = setInterval(() => {
                seconds--;
                btn.textContent = `Fetching in ${seconds}s...`;
                if (seconds <= 0) { clearInterval(timer); resolve(); }
            }, 1000);
        });

        // Global fetch
        btn.textContent = `Fetching ${cityCount} cities...`;
        const resp = await fetch('/api/cost-of-living/fetch-all-global', { method: 'POST' });
        const data = await resp.json();
        if (data.ok) {
            showSaveToast(`Updated ${data.cityCount} global cities`);
            await fetch('/api/cost-of-living/recompute', { method: 'POST' });
            fetchCostOfLiving();
        } else {
            showAlert(data.error || 'Global fetch failed', 'error');
        }
    } catch(e) {
        showAlert('Global refresh failed: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Refresh Global';
    }
}

// Legacy aliases
function showAddCOLForm() {}
function showAddCOLApiForm() {}

async function addCOLApiCity(metro, area, type, rent, nonHousingMult, apiData) {
    try {
        const resp = await fetch('/api/cost-of-living/add', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ metro, area, type, rent, nonHousingMult, source: 'api', apiData, pinned: false })
        });
        if (resp.ok) {
            showSaveToast(`${metro} added (check to keep)`);
            hideAddCityResults();
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
