// ── Sold Positions ──
async function fetchSoldPositions() {
    try {
        populateCategorySelect('spCategory');
        const data = await fetch('/api/sold-positions').then(r => r.json());
        renderSoldPositions(data.soldPositions || []);
    } catch(e) { console.error(e); }
}
function renderSoldPositions(items) {
    const tbody = document.getElementById('soldBody');
    if (!tbody) return;
    tbody.innerHTML = items.map((s, i) => `<tr>
        <td><strong>${escapeHtml(s.ticker)}</strong></td><td>${s.shares}</td><td>${escapeHtml(s.buyDate)}</td><td>${escapeHtml(s.sellDate)}</td>
        <td>${formatMoney(s.avgCost)}</td><td>${formatMoney(s.sellPrice)}</td>
        <td class="${s.gain >= 0 ? 'positive' : 'negative'}">${formatMoney(s.gain)}</td>
        <td class="${s.gainPct >= 0 ? 'positive' : 'negative'}">${formatPercent(s.gainPct)}</td>
        <td>${escapeHtml(s.category || '')}</td><td>${escapeHtml(s.notes || '')}</td>
        <td><button class="delete-row-btn" onclick="crudDeleteItem('sold-positions','soldPositions',${i})">✕</button></td>
    </tr>`).join('');
}
async function addSoldPosition() {
    const body = {
        ticker: document.getElementById('spTicker').value,
        shares: document.getElementById('spShares').value,
        buyDate: document.getElementById('spBuyDate').value,
        sellDate: document.getElementById('spSellDate').value,
        avgCost: document.getElementById('spAvgCost').value,
        sellPrice: document.getElementById('spSellPrice').value,
        category: document.getElementById('spCategory').value,
        notes: document.getElementById('spNotes').value,
    };
    if (!body.ticker) { alert('Enter ticker'); return; }
    const resp = await fetch('/api/sold-positions/add', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    if (resp.ok) { showSaveToast('Sold position added'); fetchSoldPositions(); }
    else { const d = await resp.json(); alert(d.error || 'Error'); }
}
