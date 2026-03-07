// ── Tax Optimization Tab ──

async function fetchTaxOptimization() {
    try {
        const resp = await fetch('/api/tax-optimization');
        const data = await resp.json();
        renderTaxKpis(data.summary);
        renderTaxTable(data.positions);
    } catch (e) {
        console.error('Error loading tax optimization:', e);
    }
}

function renderTaxKpis(s) {
    const el = document.getElementById('taxKpis');
    if (!el || !s) return;
    el.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Unrealized Gains</div><div class="kpi-value positive">${formatMoney(s.totalGains)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Unrealized Losses</div><div class="kpi-value negative">${formatMoney(s.totalLosses)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Net Unrealized</div><div class="kpi-value" style="color:${s.netUnrealized >= 0 ? '#22c55e' : '#ef4444'}">${formatMoney(s.netUnrealized)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Est. Tax Liability (15%)</div><div class="kpi-value" style="color:#f59e0b">${formatMoney(s.estTaxLiability)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Potential Tax Savings</div><div class="kpi-value" style="color:#22d3ee">${formatMoney(s.potentialTaxSavings)}</div><div class="kpi-sub">${s.harvestableCount} harvestable positions</div></div>
    `;
}

function renderTaxTable(positions) {
    const tbody = document.getElementById('taxBody');
    if (!tbody) return;
    tbody.innerHTML = positions.map(p => {
        const glColor = p.unrealizedGL >= 0 ? '#22c55e' : '#ef4444';
        const harvestBadge = p.harvestOpportunity
            ? '<span style="background:#22c55e22; color:#4ade80; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">YES</span>'
            : '<span style="color:var(--text-dim); font-size:11px;">No</span>';
        let actionColor = 'var(--text-dim)';
        if (p.action.includes('harvest')) actionColor = '#4ade80';
        else if (p.action.includes('trimming')) actionColor = '#f59e0b';
        return `<tr>
            <td><strong>${p.ticker}</strong></td>
            <td style="text-align:right;">${formatMoney(p.costBasis)}</td>
            <td style="text-align:right;">${formatMoney(p.marketValue)}</td>
            <td style="text-align:right; color:${glColor}; font-weight:600;">${formatMoney(p.unrealizedGL)}</td>
            <td style="text-align:right; color:${glColor};">${formatPercent(p.gainLossPct)}</td>
            <td style="text-align:right;">${formatMoney(p.taxImpact)}</td>
            <td style="text-align:center;">${harvestBadge}</td>
            <td>${p.holdingPeriod}</td>
            <td style="color:${actionColor}; font-size:12px;">${p.action}</td>
        </tr>`;
    }).join('');
}
