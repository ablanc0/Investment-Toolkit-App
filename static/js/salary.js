// ── Salary & Income ──
let currentSalaryData = null;
let currentProfileId = null;

async function fetchSalaryData() {
    try {
        const pid = currentProfileId ? `?profile=${currentProfileId}` : '';
        const data = await fetch('/api/salary' + pid).then(r => r.json());
        currentSalaryData = data;
        currentProfileId = data.profileId;
        renderSalaryFull(data);
    } catch(e) { console.error(e); }
}

function renderSalaryFull(data) {
    const profile = data.profile || {};
    const breakdown = data.breakdown || {};
    const salary = data.salary || {};
    const household = data.household || {};

    // Profile selector
    const profileSelect = document.getElementById('salProfileSelect');
    if (profileSelect) {
        const profiles = salary.profiles || {};
        profileSelect.innerHTML = Object.entries(profiles).map(([pid, p]) =>
            `<option value="${pid}" ${pid === data.profileId ? 'selected' : ''}>${p.name || pid}</option>`
        ).join('');
        document.getElementById('delProfileBtn').style.display = Object.keys(profiles).length > 1 ? '' : 'none';
    }

    // Household bar
    const hbar = document.getElementById('householdBar');
    if (hbar && household.profileCount > 1) {
        hbar.innerHTML = `Household: <strong>${formatMoney(household.annualGross)}</strong>/yr | <strong style="color:#4ade80;">${formatMoney(household.takeHomePay)}</strong> take-home (${household.profileCount} profiles)`;
    } else if (hbar) { hbar.innerHTML = ''; }

    renderSalaryKpis(breakdown.summary || {});
    renderIncomeStreams(profile.incomeStreams || []);
    renderTaxTable(breakdown);
    renderEmployerCost(breakdown.employer || {});
    renderProjectedSalary(breakdown.projected, profile.projectedSalary || 0, breakdown.summary || {});
    renderSalaryHistory(profile);
}

function renderSalaryKpis(summ) {
    const kpis = document.getElementById('salaryKpis');
    if (!kpis) return;
    kpis.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Gross Annual</div>
            <div class="kpi-value">${formatMoney(summ.annualGross)}</div><div class="kpi-sub">${formatMoney(summ.annualGross/12)}/mo</div></div>
        <div class="kpi-card"><div class="kpi-label">Take-Home</div>
            <div class="kpi-value positive">${formatMoney(summ.takeHomePay)}</div><div class="kpi-sub">${formatMoney(summ.monthlySalary)}/mo</div></div>
        <div class="kpi-card"><div class="kpi-label">W-2</div>
            <div class="kpi-value" style="color:#60a5fa;">${formatMoney(summ.w2Total)}</div><div class="kpi-sub">${formatMoney((summ.w2Total||0)/12)}/mo</div></div>
        <div class="kpi-card"><div class="kpi-label">1099</div>
            <div class="kpi-value" style="color:#facc15;">${formatMoney(summ.t1099Total)}</div><div class="kpi-sub">${formatMoney((summ.t1099Total||0)/12)}/mo</div></div>
        <div class="kpi-card"><div class="kpi-label">Eff. Tax Rate</div>
            <div class="kpi-value" style="color:#f87171;">${(summ.effectiveTaxRate*100).toFixed(1)}%</div><div class="kpi-sub">${formatMoney(summ.totalWithhold)} withheld</div></div>
        <div class="kpi-card"><div class="kpi-label">Hourly Rate</div>
            <div class="kpi-value">$${summ.hourlyRate?.toFixed(2)}</div><div class="kpi-sub">40 hr/wk</div></div>`;
}

function renderIncomeStreams(streams) {
    const ed = document.getElementById('incomeStreamsEditor');
    if (!ed) return;
    let html = '';
    streams.forEach((s, i) => {
        html += `<div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
            <select class="form-input" style="width:80px; font-size:0.82rem;" onchange="updateIncomeStream(${i}, 'type', this.value)">
                <option value="W2" ${s.type==='W2'?'selected':''}>W2</option>
                <option value="1099" ${s.type==='1099'?'selected':''}>1099</option>
                <option value="Other" ${s.type==='Other'?'selected':''}>Other</option>
            </select>
            <input type="text" value="${s.label||''}" class="form-input" style="width:140px; font-size:0.82rem;" placeholder="Label" onchange="updateIncomeStream(${i}, 'label', this.value)">
            <span style="color:var(--text-dim); font-size:0.82rem;">$</span>
            <input type="number" value="${s.amount||0}" class="form-input" style="width:120px; font-size:0.82rem; text-align:right;" onchange="updateIncomeStream(${i}, 'amount', parseFloat(this.value)||0)">
            <button onclick="removeIncomeStream(${i})" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:1rem; padding:2px 6px;" title="Remove">&times;</button>
        </div>`;
    });
    ed.innerHTML = html;
}

async function updateIncomeStream(idx, field, value) {
    if (!currentSalaryData) return;
    const streams = [...(currentSalaryData.profile?.incomeStreams || [])];
    if (streams[idx]) streams[idx] = {...streams[idx], [field]: value};
    await saveSalaryUpdate({incomeStreams: streams});
}

async function addIncomeStream() {
    if (!currentSalaryData) return;
    const streams = [...(currentSalaryData.profile?.incomeStreams || [])];
    streams.push({type: 'W2', amount: 0, label: 'New Income'});
    await saveSalaryUpdate({incomeStreams: streams});
}

async function removeIncomeStream(idx) {
    if (!currentSalaryData) return;
    const streams = [...(currentSalaryData.profile?.incomeStreams || [])];
    if (streams.length <= 1) return;
    streams.splice(idx, 1);
    await saveSalaryUpdate({incomeStreams: streams});
}

function renderTaxTable(breakdown) {
    const tableDiv = document.getElementById('salaryBreakdownTable');
    if (!tableDiv) return;
    const rows = breakdown.rows || [];
    const profile = currentSalaryData?.profile || {};
    const taxes = profile.taxes || {};

    // Year input
    const yearInput = document.getElementById('salaryYearInput');
    if (yearInput) {
        const curYear = profile.year || new Date().getFullYear();
        yearInput.value = curYear;
    }

    let html = `<div class="table-wrapper"><table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
        <thead><tr style="border-bottom:2px solid var(--border);">
            <th style="text-align:left; padding:8px 6px;">Tax Filing</th>
            <th style="text-align:right; padding:8px 6px; color:#6366f1;">Total Annual</th>
            <th style="text-align:right; padding:8px 6px; color:#6366f1;">Total Monthly</th>
            <th style="text-align:right; padding:8px 6px; color:#60a5fa;">W2 Annual</th>
            <th style="text-align:right; padding:8px 6px; color:#60a5fa;">W2 Monthly</th>
            <th style="text-align:right; padding:8px 6px; color:#facc15;">1099 Annual</th>
            <th style="text-align:right; padding:8px 6px; color:#facc15;">1099 Monthly</th>
        </tr></thead><tbody>`;

    rows.forEach((r, i) => {
        const isTax = !r.isIncome && !r.isSummary && !r.isRate && i > 1;
        const bg = r.isSummary ? 'background:rgba(99,102,241,0.08);' : '';
        const fw = r.isSummary ? 'font-weight:700;' : '';
        const clr = r.isPositive ? 'color:#4ade80;' : isTax ? 'color:#f87171;' : '';
        const sign = isTax ? '-' : '';

        const fmtVal = (v, isMo) => {
            if (r.isRate) return isMo ? (v*100).toFixed(1)+'%' : '$'+v.toFixed(2);
            return sign + formatMoney(Math.abs(v));
        };

        // Label cell
        let labelCell = `<td style="padding:6px; ${fw}">${r.label}`;
        // Editable rate for IRA
        if (r.rateKey) {
            labelCell += ` <input type="number" step="0.01" value="${r.ratePct}" style="width:55px; padding:2px 4px; font-size:0.78rem; background:var(--card-bg); border:1px solid var(--border); border-radius:3px; color:var(--text); text-align:right;" onchange="updateTaxRate('${r.rateKey}', this.value/100)">`;
        }
        // Editable rate for toggleable taxes
        if (r.taxKey) {
            labelCell += ` <input type="number" step="0.01" value="${r.ratePct}" style="width:55px; padding:2px 4px; font-size:0.78rem; background:var(--card-bg); border:1px solid var(--border); border-radius:3px; color:var(--text); text-align:right;" onchange="updateTaxConfig('${r.taxKey}', 'rate', this.value/100)">`;
            labelCell += ` <button onclick="toggleTax('${r.taxKey}')" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:0.9rem;" title="Disable this tax">&times;</button>`;
        }
        // Federal: show effective rate
        if (r.isFederal) {
            labelCell += ` <span style="font-size:0.75rem; color:var(--text-dim);">(eff. ${r.effRate}%)</span>`;
        }
        // Fixed rate display (SS, Medicare)
        if (r.fixedRate) {
            labelCell += ` <span style="font-size:0.75rem; color:var(--text-dim);">(${r.fixedRate}%)</span>`;
        }
        labelCell += '</td>';

        html += `<tr style="border-bottom:1px solid var(--border); ${bg}">
            ${labelCell}
            <td style="text-align:right; padding:6px; ${fw} ${clr}">${fmtVal(r.total, false)}</td>
            <td style="text-align:right; padding:6px; ${fw} ${clr}">${fmtVal(r.totalMo, true)}</td>
            <td style="text-align:right; padding:6px; ${fw} ${clr}">${fmtVal(r.w2, false)}</td>
            <td style="text-align:right; padding:6px; ${fw} ${clr}">${fmtVal(r.w2Mo, true)}</td>
            <td style="text-align:right; padding:6px; ${fw} ${clr}">${fmtVal(r.t1099, false)}</td>
            <td style="text-align:right; padding:6px; ${fw} ${clr}">${fmtVal(r.t1099Mo, true)}</td>
        </tr>`;
    });

    // Show disabled taxes as re-enable option
    const allTaxKeys = ['cityResidentTax', 'cityNonResidentTax', 'stateTax'];
    const disabledTaxes = allTaxKeys.filter(k => taxes[k] && !taxes[k].enabled);
    if (disabledTaxes.length > 0) {
        html += `<tr style="border-bottom:1px solid var(--border);"><td colspan="7" style="padding:6px; font-size:0.78rem; color:var(--text-dim);">
            Disabled: ${disabledTaxes.map(k => `<button onclick="toggleTax('${k}', true)" style="background:none; border:1px dashed var(--border); border-radius:4px; color:var(--text-dim); cursor:pointer; font-size:0.75rem; padding:2px 6px; margin:0 4px;">+ ${taxes[k].name}</button>`).join('')}
        </td></tr>`;
    }

    html += '</tbody></table></div>';
    tableDiv.innerHTML = html;
}

function renderEmployerCost(employer) {
    const div = document.getElementById('employerCostTable');
    if (!div || !employer.rows) return;
    let html = `<div class="table-wrapper"><table style="width:100%; font-size:0.82rem;">
        <thead><tr><th style="text-align:left;">Line Item</th><th style="text-align:right;">Annual</th><th style="text-align:right;">Monthly</th></tr></thead><tbody>`;
    employer.rows.forEach(r => {
        html += `<tr><td>${r.label}</td><td style="text-align:right;">${formatMoney(r.annual)}</td><td style="text-align:right;">${formatMoney(r.monthly)}</td></tr>`;
    });
    html += `<tr style="border-top:2px solid var(--border); font-weight:700;">
        <td>Total Employer Cost</td><td style="text-align:right; color:#f87171;">${formatMoney(employer.total)}</td><td style="text-align:right; color:#f87171;">${formatMoney(employer.totalMonthly)}</td></tr>`;
    html += `<tr style="font-weight:700;">
        <td>Total Cost to Company</td><td style="text-align:right; color:#6366f1;">${formatMoney(employer.costToCompany)}</td><td style="text-align:right; color:#6366f1;">${formatMoney(employer.costToCompanyMonthly)}</td></tr>`;
    html += '</tbody></table></div>';
    div.innerHTML = html;
}

function renderProjectedSalary(projected, projAmount, currentSumm) {
    const input = document.getElementById('projectedSalaryInput');
    const div = document.getElementById('projectedSalaryTable');
    if (input) input.value = projAmount || '';
    if (!div) return;
    if (!projected) { div.innerHTML = '<p style="color:var(--text-dim); font-size:0.85rem;">Enter a projected salary above to see tax impact.</p>'; return; }

    const ps = projected.summary || {};
    const vs = projected.vsCurrent || {};
    const deltaColor = vs.deltaTakeHome >= 0 ? '#4ade80' : '#f87171';
    let html = `<div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
        <div class="kpi-card" style="flex:1; min-width:140px;"><div class="kpi-label">Projected Take-Home</div><div class="kpi-value positive">${formatMoney(ps.takeHomePay)}</div></div>
        <div class="kpi-card" style="flex:1; min-width:140px;"><div class="kpi-label">Eff. Tax Rate</div><div class="kpi-value" style="color:#f87171;">${(ps.effectiveTaxRate*100).toFixed(1)}%</div></div>
        <div class="kpi-card" style="flex:1; min-width:140px;"><div class="kpi-label">vs Current</div><div class="kpi-value" style="color:${deltaColor};">${vs.deltaTakeHome >= 0 ? '+' : ''}${formatMoney(vs.deltaTakeHome)}</div><div class="kpi-sub">${vs.deltaEffRate >= 0 ? '+' : ''}${vs.deltaEffRate}% eff. tax</div></div>
    </div>`;
    // Mini tax table
    html += `<div class="table-wrapper"><table style="width:100%; font-size:0.82rem;"><thead><tr>
        <th style="text-align:left;">Tax Filing</th><th style="text-align:right;">Annual</th><th style="text-align:right;">Monthly</th></tr></thead><tbody>`;
    (projected.rows || []).forEach((r, i) => {
        if (r.isRate) return;
        const isTax = !r.isIncome && !r.isSummary && i > 1;
        const clr = r.isPositive ? 'color:#4ade80;' : isTax ? 'color:#f87171;' : '';
        const fw = r.isSummary ? 'font-weight:700;' : '';
        const sign = isTax ? '-' : '';
        const fmtV = v => sign + formatMoney(Math.abs(v));
        html += `<tr><td style="${fw}">${r.label}</td><td style="text-align:right; ${fw} ${clr}">${fmtV(r.total)}</td><td style="text-align:right; ${fw} ${clr}">${fmtV(r.totalMo)}</td></tr>`;
    });
    html += '</tbody></table></div>';
    div.innerHTML = html;
}

function renderSalaryHistory(profile) {
    const histDiv = document.getElementById('salHistory');
    if (!histDiv) return;
    const curYear = profile.year || new Date().getFullYear();

    const hist = profile.history || [];
    let html = `<div class="table-wrapper"><table style="width:100%; font-size:0.85rem;"><thead><tr>
        <th>Year</th>
        <th style="text-align:right;">Total Annual</th>
        <th style="text-align:right;">Monthly</th>
        <th style="text-align:right;">Take-Home</th>
        <th style="text-align:right;">Eff. Tax %</th>
        <th style="text-align:right;">YoY Change</th>
        <th style="text-align:center;">Actions</th>
    </tr></thead><tbody>`;
    for (let i = 0; i < hist.length; i++) {
        const h = hist[i];
        const prev = i > 0 ? hist[i-1] : null;
        const ann = h.annualPayroll || 0;
        const yoy = prev && prev.annualPayroll > 0 ? ((ann / prev.annualPayroll - 1) * 100).toFixed(1) : null;
        const yoyColor = yoy > 0 ? '#4ade80' : yoy < 0 ? '#f87171' : 'var(--text-dim)';
        const isCurrent = h.year === curYear;
        html += `<tr style="${isCurrent ? 'background:rgba(99,102,241,0.08);' : ''}">
            <td><strong>${h.year}</strong>${isCurrent ? ' <span style="font-size:0.7rem; color:var(--accent);">current</span>' : ''}</td>
            <td style="text-align:right;">${formatMoney(ann)}</td>
            <td style="text-align:right;">${formatMoney(h.monthlyPayroll || ann/12)}</td>
            <td style="text-align:right; color:#4ade80;">${formatMoney(h.takeHomePay || 0)}</td>
            <td style="text-align:right; color:#f87171;">${h.effectiveTaxRate ? (h.effectiveTaxRate*100).toFixed(1)+'%' : '—'}</td>
            <td style="text-align:right; color:${yoyColor};">${yoy !== null ? (yoy > 0 ? '+' : '') + yoy + '%' : '—'}</td>
            <td style="text-align:center;">${!isCurrent ? `<button onclick="deleteHistoryYear(${h.year})" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:0.85rem;" title="Delete">&#128465;</button>` : ''}</td>
        </tr>`;
    }
    html += '</tbody></table></div>';
    histDiv.innerHTML = html;
}

// ── Salary actions ──
async function saveSalaryUpdate(payload) {
    try {
        payload.profileId = currentProfileId;
        const resp = await fetch('/api/salary/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (data.ok) { loadedTabs['salary'] = false; fetchSalaryData(); }
    } catch(e) { console.error('Save failed:', e); }
}

async function updateTaxRate(key, value) {
    const taxes = {...(currentSalaryData?.profile?.taxes || {})};
    taxes[key] = value;
    await saveSalaryUpdate({taxes});
}

async function updateTaxConfig(taxKey, field, value) {
    const taxes = JSON.parse(JSON.stringify(currentSalaryData?.profile?.taxes || {}));
    if (!taxes[taxKey]) return;
    taxes[taxKey][field] = value;
    await saveSalaryUpdate({taxes});
}

async function toggleTax(taxKey, enable) {
    const taxes = JSON.parse(JSON.stringify(currentSalaryData?.profile?.taxes || {}));
    if (!taxes[taxKey]) return;
    taxes[taxKey].enabled = enable !== undefined ? enable : !taxes[taxKey].enabled;
    await saveSalaryUpdate({taxes});
}

async function updateProjectedSalary(value) {
    await saveSalaryUpdate({projectedSalary: parseFloat(value) || 0});
}

function switchSalaryYear() {
    const yr = parseInt(document.getElementById('salaryYearInput').value);
    if (!yr) return;
    saveSalaryUpdate({year: yr});
}

function switchSalaryProfile() {
    currentProfileId = document.getElementById('salProfileSelect').value;
    loadedTabs['salary'] = false;
    fetchSalaryData();
}

async function addSalaryProfile() {
    const name = prompt('Profile name:');
    if (!name) return;
    try {
        const resp = await fetch('/api/salary/profile', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name})
        });
        const data = await resp.json();
        if (data.ok) { currentProfileId = data.profileId; loadedTabs['salary'] = false; fetchSalaryData(); }
    } catch(e) { console.error(e); }
}

async function deleteSalaryProfile() {
    if (!currentProfileId) return;
    if (!confirm('Delete this salary profile?')) return;
    try {
        await fetch(`/api/salary/profile/${currentProfileId}`, {method: 'DELETE'});
        currentProfileId = null;
        loadedTabs['salary'] = false;
        fetchSalaryData();
    } catch(e) { console.error(e); }
}

async function saveHistoryYear() {
    try {
        const resp = await fetch('/api/salary/history/save', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({profileId: currentProfileId})
        });
        const data = await resp.json();
        if (data.ok) { loadedTabs['salary'] = false; fetchSalaryData(); }
    } catch(e) { console.error(e); }
}

async function deleteHistoryYear(year) {
    if (!confirm(`Delete salary history for ${year}?`)) return;
    try {
        const resp = await fetch(`/api/salary/history/${year}`, {
            method: 'DELETE', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({profileId: currentProfileId})
        });
        const data = await resp.json();
        if (data.ok) { loadedTabs['salary'] = false; fetchSalaryData(); }
    } catch(e) { console.error(e); }
}
