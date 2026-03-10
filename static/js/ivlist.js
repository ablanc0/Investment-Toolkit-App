// ── Intrinsic Values List ──
async function fetchIntrinsicValues() {
    try {
        const data = await fetch('/api/intrinsic-values').then(r => r.json());
        renderIntrinsicValues(data.intrinsicValues || []);
    } catch(e) { console.error(e); }
}
function renderIntrinsicValues(items) {
    const tbody = document.getElementById('ivBody');
    const kpis = document.getElementById('ivKpis');
    if (!tbody) return;
    const strongBuy = items.filter(i => i.signal === 'Strong Buy').length;
    const buy = items.filter(i => i.signal === 'Buy').length;
    const overrated = items.filter(i => i.signal === 'Overrated').length;
    if (kpis) kpis.innerHTML = `
        <span style="color: var(--text-dim);">Total: <strong>${items.length}</strong></span>
        <span style="color: #4ade80;">Strong Buy: <strong>${strongBuy}</strong></span>
        <span style="color: #22d3ee;">Buy: <strong>${buy}</strong></span>
        <span style="color: #f87171;">Overrated: <strong>${overrated}</strong></span>
    `;
    tbody.innerHTML = items.map(iv => {
        const dist = iv.distanceFromIntrinsic || 0;
        const distStr = dist !== 0 ? (dist > 0 ? '+' : '') + (dist * 100).toFixed(1) + '%' : '—';
        const distColor = dist < 0 ? '#4ade80' : dist > 0.3 ? '#f87171' : '#f59e0b';
        const signalColors = {
            'Strong Buy': {bg:'#4ade8020', fg:'#4ade80'},
            'Buy': {bg:'#22d3ee20', fg:'#22d3ee'},
            'Expensive': {bg:'#f59e0b20', fg:'#f59e0b'},
            'Overrated': {bg:'#f8717120', fg:'#f87171'},
        };
        const sc = signalColors[iv.signal] || {bg:'#64748b20', fg:'#64748b'};
        const yld = iv.dividendYield ? (iv.dividendYield * 100).toFixed(2) + '%' : '—';
        const pe = iv.peRatio ? iv.peRatio.toFixed(1) : '—';
        const updated = iv.updated ? iv.updated.split(' ')[0] : '—';
        return `<tr>
            <td>${tickerLogo(iv.ticker)}<strong>${escapeHtml(iv.ticker)}</strong></td>
            <td style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(iv.companyName || '')}</td>
            <td style="text-align:right;">${formatMoney(iv.currentPrice)}</td>
            <td style="text-align:right; font-weight:600;">${iv.intrinsicValue ? formatMoney(iv.intrinsicValue) : '—'}</td>
            <td style="text-align:right; color: ${distColor}; font-weight:600;">${distStr}</td>
            <td style="text-align:right;">${(() => { const s = typeof iv.invtScore === 'object' && iv.invtScore ? iv.invtScore.score : iv.invtScore; if (!s && s !== 0) return '—'; return '<span style="color:' + _invtScoreColor(s) + '; font-weight:600;">' + Number(s).toFixed(1) + '</span>'; })()}</td>
            <td style="font-size:0.78rem;">${escapeHtml(iv.sector || '—')}</td>
            <td>${escapeHtml(iv.category || '—')}</td>
            <td style="text-align:right; color: ${yld !== '—' ? '#4ade80' : 'var(--text-dim)'};">${yld}</td>
            <td style="text-align:right;">${pe}</td>
            <td><span style="padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:600; background:${sc.bg}; color:${sc.fg};">${escapeHtml(iv.signal || '—')}</span></td>
            <td style="font-size:0.78rem; color: var(--text-dim);">${escapeHtml(updated)}</td>
        </tr>`;
    }).join('');
}
