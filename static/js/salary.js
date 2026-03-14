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

    // Filing status selector
    const fsSelect = document.getElementById('filingStatusSelect');
    if (fsSelect) fsSelect.value = (data.profile || {}).filingStatus || 'single';

    // Household bar
    const hbar = document.getElementById('householdBar');
    if (hbar && household.profileCount > 1) {
        hbar.innerHTML = `Household: <strong>${formatMoney(household.annualGross)}</strong>/yr | <strong style="color:#4ade80;">${formatMoney(household.takeHomePay)}</strong> take-home (${household.profileCount} profiles)`;
    } else if (hbar) { hbar.innerHTML = ''; }

    renderSalaryKpis(breakdown.summary || {});
    renderIncomeStreams(profile.incomeStreams || []);
    renderTaxTable(breakdown);
    renderQbiInfo(breakdown.summary || {});
    renderEmployerCost(breakdown.employer || {});
    renderProjectedSalary(breakdown.projected, profile.projectedSalary || 0, breakdown.summary || {});
    renderSalaryHistory(profile);
    renderFilingStatusComparison(data.statusComparison || []);
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
        <div class="kpi-card"><div class="kpi-label">${(summ.businessExpenses || 0) > 0 ? '1099 (Net)' : '1099'}</div>
            <div class="kpi-value" style="color:#facc15;">${formatMoney((summ.businessExpenses || 0) > 0 ? (summ.t1099Net || summ.t1099Total) : summ.t1099Total)}</div><div class="kpi-sub">${(summ.businessExpenses || 0) > 0 ? `Gross: ${formatMoney(summ.t1099Gross)} | Exp: -${formatMoney(summ.businessExpenses)}` : `${formatMoney((summ.t1099Total||0)/12)}/mo`}</div></div>
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
        const is1099 = s.type === '1099' || s.type === 'Other';
        html += `<div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
            <select class="form-input" style="width:80px; font-size:0.82rem;" onchange="updateIncomeStream(${i}, 'type', this.value)">
                <option value="W2" ${s.type==='W2'?'selected':''}>W2</option>
                <option value="1099" ${s.type==='1099'?'selected':''}>1099</option>
                <option value="Other" ${s.type==='Other'?'selected':''}>Other</option>
            </select>
            <input type="text" value="${s.label||''}" class="form-input" style="width:140px; font-size:0.82rem;" placeholder="Label" onchange="updateIncomeStream(${i}, 'label', this.value)">
            <span style="color:var(--text-dim); font-size:0.82rem;">$</span>
            <input type="number" value="${s.amount||0}" class="form-input" style="width:120px; font-size:0.82rem; text-align:right;" onchange="updateIncomeStream(${i}, 'amount', parseFloat(this.value)||0)">`;
        if (is1099) {
            html += `<span style="color:var(--text-dim); font-size:0.78rem; margin-left:4px;">Expenses:</span>
                <span style="color:var(--text-dim); font-size:0.82rem;">$</span>
                <input type="number" value="${s.businessExpenses||0}" class="form-input" style="width:100px; font-size:0.82rem; text-align:right;" placeholder="0" title="Business expenses deducted before SE tax" onchange="updateIncomeStream(${i}, 'businessExpenses', parseFloat(this.value)||0)">`;
        }
        html += `<button onclick="removeIncomeStream(${i})" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:1rem; padding:2px 6px;" title="Remove">&times;</button>
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

function renderQbiInfo(summary) {
    const bar = document.getElementById('qbiInfoBar');
    if (!bar) return;
    const qbi = summary.qbiDeduction || 0;
    const expenses = summary.businessExpenses || 0;
    if (qbi <= 0 && expenses <= 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'block';
    let parts = [];
    if (expenses > 0) parts.push(`<span style="color:#a78bfa;">Business Expenses:</span> ${formatMoney(expenses)} deducted from 1099 gross`);
    if (qbi > 0) parts.push(`<span style="color:#22d3ee;">QBI Deduction:</span> ${formatMoney(qbi)} (20% of net 1099) reduces federal taxable income`);
    bar.innerHTML = '<div class="card" style="padding:10px 14px; font-size:0.82rem;">' + parts.join(' &middot; ') + '</div>';
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

    // Update table title with filing status context
    const salTableTitle = document.getElementById('salTableTitle');
    if (salTableTitle) {
        const summ = breakdown.summary || {};
        const statusLabels = {single: 'Single', mfj: 'MFJ', mfs: 'MFS', hoh: 'HoH'};
        const fs = summ.filingStatus || profile.filingStatus || 'single';
        const yr = profile.year || new Date().getFullYear();
        const stdDed = summ.standardDeduction;
        const subtitle = stdDed != null
            ? `Tax Filing — ${yr} ${statusLabels[fs] || fs} | Std. Deduction: ${formatMoney(stdDed)}`
            : `Tax Filing — ${yr} ${statusLabels[fs] || fs}`;
        salTableTitle.textContent = subtitle;
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
        const isTax = !r.isIncome && !r.isSummary && !r.isRate && !r.isExpense && !r.isQBI && i > 1;
        const summaryClass = r.isSummary ? 'summary-row' : '';
        const fw = r.isSummary ? 'font-weight:700;' : '';
        const clr = r.isExpense ? 'color:#a78bfa;' : r.isQBI ? 'color:#22d3ee;' : r.isPositive ? 'color:#4ade80;' : isTax ? 'color:#f87171;' : '';
        const sign = isTax || r.isExpense || r.isQBI ? '-' : '';

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

        html += `<tr class="${summaryClass}" style="border-bottom:1px solid var(--border);">
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
    html += `<tr class="summary-row">
        <td>Total Employer Cost</td><td style="text-align:right; color:#f87171;">${formatMoney(employer.total)}</td><td style="text-align:right; color:#f87171;">${formatMoney(employer.totalMonthly)}</td></tr>`;
    html += `<tr class="summary-row" style="border-top:none;">
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

function switchFilingStatus() {
    const status = document.getElementById('filingStatusSelect').value;
    if (!status) return;
    saveSalaryUpdate({ filingStatus: status });
}

function renderFilingStatusComparison(comparison) {
    const container = document.getElementById('filingStatusComparison');
    if (!container) return;
    if (!comparison || comparison.length === 0) {
        container.innerHTML = '<p style="font-size:0.82rem; color:var(--text-dim);">No comparison data available.</p>';
        return;
    }

    const statusLabels = {single: 'Single', mfj: 'MFJ', mfs: 'MFS', hoh: 'HoH'};
    const best = comparison[0];
    const bestTakeHome = best.takeHomePay || 0;
    const hasQbi = comparison.some(c => (c.qbiDeduction || 0) > 0);

    // KPI Cards
    let cardsHtml = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:16px;">';
    comparison.forEach(c => {
        const isBest = c.status === best.status;
        const delta = c.takeHomePay - bestTakeHome;
        const borderStyle = isBest ? 'border:2px solid #4ade80;' : '';
        const badge = isBest ? '<span style="background:#4ade80; color:#000; font-size:0.65rem; font-weight:700; padding:1px 6px; border-radius:4px; margin-left:6px;">BEST</span>' : '';
        const deltaLine = !isBest && delta !== 0
            ? `<div class="kpi-sub" style="color:#f87171;">${formatMoney(delta)} vs best</div>`
            : '';
        const qbiLine = (c.qbiDeduction || 0) > 0
            ? `<div class="kpi-sub" style="color:#22d3ee;">QBI: -${formatMoney(c.qbiDeduction)}</div>`
            : '';

        cardsHtml += `<div class="kpi-card" style="${borderStyle}">
            <div class="kpi-label">${statusLabels[c.status] || c.label || c.status}${badge}</div>
            <div class="kpi-value" style="color:#4ade80;">${formatMoney(c.takeHomePay)}</div>
            <div class="kpi-sub">Federal: ${formatMoney(c.federalTax)} | Eff: ${(c.effectiveTaxRate * 100).toFixed(1)}%</div>
            <div class="kpi-sub">Std. Deduction: ${formatMoney(c.standardDeduction)}</div>
            ${qbiLine}
            ${deltaLine}
        </div>`;
    });
    cardsHtml += '</div>';

    // Comparison table
    let tableHtml = `<div class="table-wrapper"><table style="width:100%; font-size:0.82rem;">
        <thead><tr style="border-bottom:2px solid var(--border);">
            <th style="text-align:left; padding:6px;">Filing Status</th>
            <th style="text-align:right; padding:6px;">Std. Deduction</th>
            ${hasQbi ? '<th style="text-align:right; padding:6px; color:#22d3ee;">QBI</th>' : ''}
            <th style="text-align:right; padding:6px;">Federal Tax</th>
            <th style="text-align:right; padding:6px;">Total Withheld</th>
            <th style="text-align:right; padding:6px;">Take-Home</th>
            <th style="text-align:right; padding:6px;">Monthly</th>
            <th style="text-align:right; padding:6px;">Eff. Rate</th>
            <th style="text-align:right; padding:6px;">vs Best</th>
        </tr></thead><tbody>`;

    comparison.forEach(c => {
        const isBest = c.status === best.status;
        const delta = c.takeHomePay - bestTakeHome;
        const bg = isBest ? 'background:rgba(74,222,128,0.08);' : '';
        const vsBest = isBest ? '<span style="color:var(--text-dim);">—</span>' : `<span style="color:#f87171;">${formatMoney(delta)}</span>`;

        tableHtml += `<tr style="${bg} border-bottom:1px solid var(--border);">
            <td style="padding:6px; font-weight:${isBest ? '700' : '400'};">${statusLabels[c.status] || c.label || c.status}${isBest ? ' <span style="color:#4ade80; font-size:0.72rem;">BEST</span>' : ''}</td>
            <td style="text-align:right; padding:6px;">${formatMoney(c.standardDeduction)}</td>
            ${hasQbi ? `<td style="text-align:right; padding:6px; color:#22d3ee;">${formatMoney(c.qbiDeduction || 0)}</td>` : ''}
            <td style="text-align:right; padding:6px; color:#f87171;">${formatMoney(c.federalTax)}</td>
            <td style="text-align:right; padding:6px; color:#f87171;">${formatMoney(c.totalWithhold)}</td>
            <td style="text-align:right; padding:6px; color:#4ade80; font-weight:600;">${formatMoney(c.takeHomePay)}</td>
            <td style="text-align:right; padding:6px;">${formatMoney(c.monthlySalary)}</td>
            <td style="text-align:right; padding:6px;">${(c.effectiveTaxRate * 100).toFixed(1)}%</td>
            <td style="text-align:right; padding:6px;">${vsBest}</td>
        </tr>`;
    });

    tableHtml += '</tbody></table></div>';
    container.innerHTML = cardsHtml + tableHtml;
}

// ── Retirement Tab ──
let retirementData = null;

async function fetchRetirementData() {
    try {
        const pid = currentProfileId ? `?profile=${currentProfileId}` : '';
        const data = await fetch('/api/salary' + pid).then(r => r.json());
        retirementData = data;
        if (!currentProfileId) currentProfileId = data.profileId;
        renderRetirementTab(data.retirement || {}, data.retirementConfig || {});
    } catch(e) { console.error('Error loading retirement data:', e); }
}

function renderRetirementTab(ret, config) {
    renderRetirementKpis(ret);
    renderRetirementInputs(ret, config);
    renderRetirementChart(ret, config);
    renderRetirementResults(ret, config);
    renderRetirementSensitivity(ret, config);
}

function renderRetirementKpis(ret) {
    const el = document.getElementById('retirementKpis');
    if (!el) return;
    const goalColor = ret.goalFulfillment >= 1 ? '#4ade80' : '#f59e0b';
    const goalPct = ((ret.goalFulfillment || 0) * 100).toFixed(0);
    el.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Current Savings</div>
            <div class="kpi-value positive">${formatMoney(ret.currentSavings)}</div>
            <div class="kpi-sub">Portfolio total</div></div>
        <div class="kpi-card"><div class="kpi-label">Monthly Investable</div>
            <div class="kpi-value">${formatMoney(ret.monthlyInvestable)}</div>
            <div class="kpi-sub">${formatMoney(ret.monthlyInvestable * 12)}/yr</div></div>
        <div class="kpi-card"><div class="kpi-label">Total at Retirement</div>
            <div class="kpi-value positive">${formatMoney(ret.totalAtRetirement)}</div>
            <div class="kpi-sub">${ret.yearsUntilRetirement}yr at ${ret.annualReturnRate}%</div></div>
        <div class="kpi-card"><div class="kpi-label">Monthly Retirement Income</div>
            <div class="kpi-value" style="color:#22d3ee;">${formatMoney(ret.totalMonthlyRetirement)}</div>
            <div class="kpi-sub">${ret.returnRateRetirement}% withdrawal</div></div>
        <div class="kpi-card"><div class="kpi-label">Goal Fulfillment</div>
            <div class="kpi-value" style="color:${goalColor};">${ret.goalFulfillment}x</div>
            <div class="kpi-sub">${goalPct}% of desired</div></div>
        <div class="kpi-card"><div class="kpi-label">Money Required</div>
            <div class="kpi-value">${formatMoney(ret.moneyRequired)}</div>
            <div class="kpi-sub">To live as today</div></div>`;
}

function renderRetirementInputs(ret, config) {
    const div = document.getElementById('retirementInputs');
    if (!div) return;
    const pctSave = config.pctIncomeCanSave ?? 0.25;
    const years = config.yearsUntilRetirement ?? 20;
    const retRate = config.returnRateRetirement ?? 0.04;
    const desiredPct = config.desiredRetirementPct ?? 0.75;
    const otherIncome = config.otherRetirementIncome ?? 0;
    const annualReturn = config.annualReturnRate != null ? config.annualReturnRate * 100 : (ret.annualReturnRate || 7);

    div.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
            <div><label class="form-label">% Income Can Save</label>
                <input type="number" step="1" value="${(pctSave * 100).toFixed(0)}" class="form-input" style="width:100%;"
                    onchange="updateRetirementConfig('pctIncomeCanSave', this.value / 100)">
                <span style="font-size:0.72rem; color:var(--text-dim);">% of take-home</span></div>
            <div><label class="form-label">Years to Retirement</label>
                <input type="number" step="1" value="${years}" class="form-input" style="width:100%;"
                    onchange="updateRetirementConfig('yearsUntilRetirement', this.value)"></div>
            <div><label class="form-label">Annual Return Rate</label>
                <input type="number" step="0.5" value="${annualReturn.toFixed(1)}" class="form-input" style="width:100%;"
                    onchange="updateRetirementConfig('annualReturnRate', this.value / 100)">
                <span style="font-size:0.72rem; color:var(--text-dim);">% expected growth</span></div>
            <div><label class="form-label">Retirement Return Rate</label>
                <input type="number" step="0.5" value="${(retRate * 100).toFixed(1)}" class="form-input" style="width:100%;"
                    onchange="updateRetirementConfig('returnRateRetirement', this.value / 100)">
                <span style="font-size:0.72rem; color:var(--text-dim);">% safe withdrawal</span></div>
            <div><label class="form-label">Desired Retirement %</label>
                <input type="number" step="5" value="${(desiredPct * 100).toFixed(0)}" class="form-input" style="width:100%;"
                    onchange="updateRetirementConfig('desiredRetirementPct', this.value / 100)">
                <span style="font-size:0.72rem; color:var(--text-dim);">% of current salary</span></div>
            <div><label class="form-label">Other Retirement Income</label>
                <input type="number" step="100" value="${otherIncome}" class="form-input" style="width:100%;"
                    onchange="updateRetirementConfig('otherRetirementIncome', parseFloat(this.value) || 0)">
                <span style="font-size:0.72rem; color:var(--text-dim);">monthly (SS, pension)</span></div>
        </div>`;
}

function _fvCalc(rate, nper, pmt, pv) {
    if (rate === 0) return pv + pmt * nper;
    return pv * Math.pow(1 + rate, nper) + pmt * (Math.pow(1 + rate, nper) - 1) / rate;
}

function renderRetirementChart(ret, config) {
    const canvas = document.getElementById('retirementChart');
    if (!canvas || !ret.annualSalary) return;

    const years = ret.yearsUntilRetirement || 20;
    const rate = (ret.annualReturnRate || 7) / 100;
    const annualContrib = (ret.monthlyInvestable || 0) * 12;
    const pv = ret.availableToInvest || 0;
    const moneyRequired = ret.moneyRequired || 0;

    const labels = [];
    const portfolioValues = [];
    const requiredLine = [];

    for (let y = 0; y <= years; y++) {
        labels.push('Year ' + y);
        portfolioValues.push(Math.round(_fvCalc(rate, y, annualContrib, pv)));
        requiredLine.push(Math.round(moneyRequired));
    }

    if (charts.retirement) charts.retirement.destroy();
    charts.retirement = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Portfolio Value',
                    data: portfolioValues,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2,
                },
                {
                    label: 'Money Required (Live as Today)',
                    data: requiredLine,
                    borderColor: '#f59e0b',
                    borderDash: [8, 4],
                    pointRadius: 0,
                    borderWidth: 2,
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => ctx.dataset.label + ': $' + ctx.parsed.y.toLocaleString(),
                    },
                },
            },
            scales: {
                x: { ticks: { color: '#6b7280', maxTicksLimit: 10 }, grid: { color: 'rgba(75,85,99,0.2)' } },
                y: {
                    ticks: {
                        color: '#6b7280',
                        callback: v => '$' + (v >= 1e6 ? (v/1e6).toFixed(1) + 'M' : (v/1e3).toFixed(0) + 'K'),
                    },
                    grid: { color: 'rgba(75,85,99,0.2)' },
                },
            },
        },
    });
}

function renderRetirementResults(ret, config) {
    const div = document.getElementById('retirementResults');
    if (!div) return;
    if (!ret.annualSalary) {
        div.innerHTML = '<p style="font-size:0.82rem; color:var(--text-dim);">No salary data available. Set up income streams in the Salary tab first.</p>';
        return;
    }

    const desiredPct = config.desiredRetirementPct ?? 0.75;
    const th = 'style="text-align:right;"';
    const green = 'style="text-align:right; color:#4ade80; font-weight:600;"';
    const dim = 'style="text-align:right; color:var(--text-dim);"';
    const bold = 'style="font-weight:700;"';
    const sep = `<tr><td colspan="3" style="border-top:2px solid var(--border); padding:0;"></td></tr>`;
    const goalColor = ret.goalFulfillment >= 1 ? '#4ade80' : '#f59e0b';
    const goalPct = ((ret.goalFulfillment || 0) * 100).toFixed(0);

    let html = `<div class="table-wrapper"><table style="width:100%; font-size:0.82rem;">
        <thead><tr><th style="text-align:left;"></th><th ${th}>Annual</th><th ${th}>Monthly</th></tr></thead><tbody>`;

    html += `<tr><td ${bold}>Current Savings (Portfolio)</td><td ${green}>${formatMoney(ret.currentSavings)}</td><td ${dim}>—</td></tr>`;
    html += `<tr><td>Current Take-Home Salary</td><td ${th}>${formatMoney(ret.annualSalary)}</td><td ${th}>${formatMoney(ret.monthlySalary)}</td></tr>`;
    html += `<tr><td>Amount You Can Invest</td><td ${th}>${formatMoney(ret.monthlyInvestable * 12)}</td><td ${th}>${formatMoney(ret.monthlyInvestable)}</td></tr>`;
    html += sep;
    html += `<tr><td ${bold}>Desired Retirement Salary (${(desiredPct*100).toFixed(0)}%)</td><td ${th}>${formatMoney(ret.desiredRetirementSalary)}</td><td ${th}>${formatMoney(ret.desiredMonthlyRetirement)}</td></tr>`;
    html += sep;
    html += `<tr><td colspan="3" ${bold} style="padding-top:8px;">Projection <span style="font-weight:400; color:var(--text-dim);">(${ret.yearsUntilRetirement} years, ${ret.annualReturnRate}% annual return)</span></td></tr>`;
    html += `<tr><td style="padding-left:16px;">Total Invested Money at Retirement</td><td ${green}>${formatMoney(ret.totalAtRetirement)}</td><td ${dim}>—</td></tr>`;
    html += `<tr><td style="padding-left:16px;">Passive Income (${ret.returnRateRetirement}% return)</td><td ${th}>${formatMoney(ret.passiveIncomeAnnual)}</td><td ${th}>${formatMoney(ret.passiveIncomeMonthly)}</td></tr>`;
    if (ret.otherRetirementIncome > 0) {
        html += `<tr><td style="padding-left:16px;">Other Income (SS, pension)</td><td ${dim}>—</td><td ${th}>${formatMoney(ret.otherRetirementIncome)}</td></tr>`;
    }
    html += `<tr ${bold}><td style="padding-left:16px;">Total Monthly Retirement Income</td><td ${dim}>—</td><td ${green}>${formatMoney(ret.totalMonthlyRetirement)}</td></tr>`;
    html += `<tr ${bold}><td>Goal Fulfillment</td><td colspan="2" style="text-align:right; color:${goalColor}; font-size:1.1rem;">${ret.goalFulfillment}x (${goalPct}%)</td></tr>`;
    html += sep;
    html += `<tr><td colspan="3" ${bold} style="padding-top:8px;">Numbers Projected to Live as Today</td></tr>`;
    html += `<tr><td style="padding-left:16px;">Total Investment Money Required</td><td ${th}>${formatMoney(ret.moneyRequired)}</td><td ${dim}>—</td></tr>`;
    html += `<tr><td style="padding-left:16px;">Monthly Investment Required</td><td ${dim}>—</td><td ${th}>${formatMoney(ret.monthlyInvestmentRequired)}</td></tr>`;
    html += `<tr><td style="padding-left:16px;">Annual Income Required (after taxes)</td><td ${th}>${formatMoney(ret.annualIncomeRequired)}</td><td ${dim}>—</td></tr>`;
    html += '</tbody></table></div>';
    div.innerHTML = html;
}

function renderRetirementSensitivity(ret, config) {
    const div = document.getElementById('retirementSensitivity');
    if (!div || !ret.annualSalary) { if (div) div.innerHTML = ''; return; }

    const years = ret.yearsUntilRetirement || 20;
    const annualContrib = (ret.monthlyInvestable || 0) * 12;
    const pv = ret.availableToInvest || 0;
    const retRate = (config.returnRateRetirement ?? 0.04);
    const desiredMonthly = ret.desiredMonthlyRetirement || 1;
    const otherIncome = ret.otherRetirementIncome || 0;
    const currentRate = (ret.annualReturnRate || 7);

    const rates = [4, 5, 6, 7, 8, 9, 10, 12];
    const th = 'style="text-align:right; padding:6px 8px;"';

    let html = `<div class="table-wrapper"><table style="width:100%; font-size:0.82rem;">
        <thead><tr><th style="padding:6px 8px;">Return Rate</th><th ${th}>Total at Retirement</th><th ${th}>Monthly Income</th><th ${th}>Goal Fulfillment</th></tr></thead><tbody>`;

    rates.forEach(r => {
        const total = _fvCalc(r / 100, years, annualContrib, pv);
        const passive = total * retRate;
        const monthlyIncome = passive / 12 + otherIncome;
        const goal = monthlyIncome / desiredMonthly;
        const goalColor = goal >= 1 ? '#4ade80' : goal >= 0.5 ? '#f59e0b' : '#f87171';
        const isActive = Math.abs(r - currentRate) < 0.1;
        const bg = isActive ? 'background:rgba(99,102,241,0.08);' : '';
        html += `<tr style="${bg}">
            <td style="padding:6px 8px; font-weight:${isActive ? '700' : '400'};">${r}%${isActive ? ' (current)' : ''}</td>
            <td ${th}>${formatMoney(total)}</td>
            <td ${th}>${formatMoney(monthlyIncome)}</td>
            <td style="text-align:right; padding:6px 8px; color:${goalColor}; font-weight:600;">${goal.toFixed(2)}x (${(goal * 100).toFixed(0)}%)</td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    div.innerHTML = html;
}

async function updateRetirementConfig(key, value) {
    const config = {...(retirementData?.retirementConfig || currentSalaryData?.retirementConfig || {})};
    config[key] = parseFloat(value);
    // Save via salary update
    if (!currentProfileId && retirementData) currentProfileId = retirementData.profileId;
    try {
        const resp = await fetch('/api/salary/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ profileId: currentProfileId, retirement: config })
        });
        const data = await resp.json();
        if (data.ok) { loadedTabs['retirement'] = false; fetchRetirementData(); }
    } catch(e) { console.error('Save failed:', e); }
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
