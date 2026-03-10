// ── My Lab (Multi-Portfolio with Research) ──
let labData = { myLab: [], labResearch: [] };
const ALLOC_COLORS = ['#6366f1','#4ade80','#f59e0b','#3b82f6','#f87171','#a78bfa','#22d3ee','#fb923c','#e879f9','#14b8a6'];

async function fetchMyLab() {
    try {
        const data = await fetch('/api/my-lab').then(r => r.json());
        labData = data;
        renderLabSelector(data.myLab || []);
    } catch(e) { console.error(e); }
}

function renderLabSelector(portfolios) {
    const sel = document.getElementById('labPortfolioSelect');
    const countEl = document.getElementById('labCount');
    if (!sel) return;
    sel.innerHTML = portfolios.map((p, i) => `<option value="${i}">${escapeHtml(p.name)} (${p.totalHoldings})</option>`).join('');
    if (countEl) countEl.textContent = `${portfolios.length} portfolios`;
    // Render portfolio list sidebar
    const listEl = document.getElementById('labPortfolioList');
    if (listEl) {
        listEl.innerHTML = portfolios.map((p, i) => `
            <div onclick="document.getElementById('labPortfolioSelect').value=${i}; renderLabPortfolio();"
                style="padding: 6px 8px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;"
                onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background='transparent'">
                <span style="font-weight: 600;">${escapeHtml(p.name)}</span>
                <span style="color: var(--text-dim); font-size: 0.78rem;">${p.totalHoldings} · ${formatMoney(p.totalMarketValue)}</span>
            </div>
        `).join('');
    }
    renderLabPortfolio();
}

function renderLabPortfolio() {
    const sel = document.getElementById('labPortfolioSelect');
    const idx = parseInt(sel?.value || 0);
    const portfolios = labData.myLab || [];
    if (idx < 0 || idx >= portfolios.length) return;
    const p = portfolios[idx];
    const holdings = p.holdings || [];
    const title = document.getElementById('labPortfolioTitle');
    const kpis = document.getElementById('labPortfolioKpis');
    const tbody = document.getElementById('labBody');
    if (!tbody) return;
    if (title) title.textContent = p.name;
    if (kpis) kpis.innerHTML = `
        <span style="color: var(--text-dim);">Value: <strong style="color: var(--accent);">${formatMoney(p.totalMarketValue)}</strong></span>
        <span style="color: var(--text-dim);">Holdings: <strong>${p.totalHoldings}</strong></span>
        <span style="color: var(--text-dim);">Div: <strong class="positive">${formatMoney(p.totalAnnualDividend)}</strong></span>
    `;
    tbody.innerHTML = holdings.map(l => {
        const alloc = l.portfolioAllocation ? (l.portfolioAllocation * 100).toFixed(1) + '%' : '—';
        const yld = l.dividendYield ? (l.dividendYield * 100).toFixed(2) + '%' : '—';
        return `<tr>
            <td>${tickerLogo(l.ticker)}<strong>${escapeHtml(l.ticker)}</strong></td>
            <td style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(l.companyName || '')}</td>
            <td style="text-align:right;">${l.shares || '—'}</td>
            <td style="text-align:right;">${l.sharePrice ? formatMoney(l.sharePrice) : '—'}</td>
            <td><span style="padding:2px 6px; border-radius:4px; font-size:0.72rem; background:${l.securityType==='ETFs'||l.securityType==='ETF'?'#3b82f620':'#6366f120'}; color:${l.securityType==='ETFs'||l.securityType==='ETF'?'#3b82f6':'#6366f1'};">${escapeHtml(l.securityType || '—')}</span></td>
            <td>${escapeHtml(l.category || '—')}</td>
            <td style="text-align:right;">${alloc}</td>
            <td style="text-align:right; color: ${yld !== '—' ? '#4ade80' : 'var(--text-dim)'};">${yld}</td>
            <td style="text-align:right; font-weight:600;">${l.marketValue ? formatMoney(l.marketValue) : '—'}</td>
            <td style="text-align:right; color: #4ade80;">${l.annualDividendIncome > 0 ? formatMoney(l.annualDividendIncome) : '—'}</td>
        </tr>`;
    }).join('');
    renderLabAllocChart(holdings);
    // Notes box (editable)
    const notesEl = document.getElementById('labNotes');
    if (notesEl) {
        const lu = p.lastUpdate || '';
        const src = p.source || '';
        notesEl.innerHTML = `
            <div style="font-weight:600; margin-bottom:6px; color: var(--text);">📝 Source</div>
            <div style="margin-bottom:4px;"><strong>Last Update:</strong> <span class="editable-note" data-field="lastUpdate" data-idx="${idx}" style="cursor:pointer; border-bottom: 1px dashed var(--border); padding: 1px 4px;">${escapeHtml(lu || '—')}</span></div>
            <div><strong>Source:</strong> <span class="editable-note" data-field="source" data-idx="${idx}" style="cursor:pointer; border-bottom: 1px dashed var(--border); padding: 1px 4px; word-break: break-all;">${escapeHtml(src || '—')}</span>
            ${src ? ` <a href="${escapeHtml(src)}" target="_blank" style="color: var(--accent); font-size: 0.75rem; margin-left: 4px;">↗</a>` : ''}</div>
        `;
        notesEl.querySelectorAll('.editable-note').forEach(span => {
            span.addEventListener('click', function() {
                const field = this.dataset.field;
                const pidx = parseInt(this.dataset.idx);
                const current = field === 'lastUpdate' ? (labData.myLab[pidx].lastUpdate || '') : (labData.myLab[pidx].source || '');
                const input = document.createElement('input');
                input.type = 'text';
                input.value = current;
                input.style.cssText = 'background:var(--card-hover); border:1px solid var(--accent); border-radius:4px; color:var(--text); padding:2px 6px; font-size:0.82rem; width:' + (field === 'source' ? '400px' : '120px');
                this.replaceWith(input);
                input.focus();
                const save = async () => {
                    const val = input.value.trim();
                    labData.myLab[pidx][field] = val;
                    await fetch('/api/my-lab/update-portfolio', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({portfolioIndex: pidx, [field]: val})
                    });
                    showSaveToast();
                    renderLabPortfolio();
                };
                input.addEventListener('blur', save);
                input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') renderLabPortfolio(); });
            });
        });
    }
}

function renderLabAllocChart(holdings) {
    const canvas = document.getElementById('labAllocChart');
    if (!canvas) return;
    if (canvas._chart) canvas._chart.destroy();
    const cats = {};
    holdings.forEach(h => {
        const cat = h.category || 'Other';
        cats[cat] = (cats[cat] || 0) + (h.marketValue || 0);
    });
    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    canvas._chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: sorted.map(s => s[0]),
            datasets: [{ data: sorted.map(s => s[1]), backgroundColor: ALLOC_COLORS.slice(0, sorted.length) }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } } }
    });
}

async function runLabResearch() {
    const resDiv = document.getElementById('labResearchResults');
    const content = document.getElementById('labResearchContent');
    if (!resDiv || !content) return;
    content.innerHTML = '<p style="color: var(--text-dim);">Analyzing all portfolios...</p>';
    resDiv.style.display = 'block';
    try {
        const data = await fetch('/api/my-lab/research', { method: 'POST' }).then(r => r.json());
        const items = data.research || [];
        const total = data.totalPortfolios || 0;
        const ownedTickers = new Set((portfolioData?.positions || []).map(p => p.ticker.toUpperCase()));
        content.innerHTML = `<p style="color: var(--text-dim); margin-bottom: 12px;">Analyzed <strong>${total}</strong> portfolios. Tickers held by multiple investors:</p>
            <div class="table-wrapper"><table style="font-size: 0.82rem;"><thead><tr>
                <th>Ticker</th><th>Company</th><th style="text-align:center;">Found In</th><th style="text-align:center;">% of Portfolios</th><th style="text-align:center;">In Portfolio</th><th>Portfolios</th>
            </tr></thead><tbody>
            ${items.filter(i => i.count >= 2).map(i => {
                const owned = ownedTickers.has(i.ticker.toUpperCase());
                return `<tr>
                <td>${tickerLogo(i.ticker)}<strong>${escapeHtml(i.ticker)}</strong></td><td>${escapeHtml(i.companyName || '')}</td>
                <td style="text-align:center;"><span style="background:${i.count >= 5 ? '#4ade8030' : i.count >= 3 ? '#6366f130' : '#f59e0b30'}; color:${i.count >= 5 ? '#4ade80' : i.count >= 3 ? '#6366f1' : '#f59e0b'}; padding:2px 10px; border-radius:12px; font-weight:700;">${i.count}</span></td>
                <td style="text-align:center;">${((i.count/total)*100).toFixed(0)}%</td>
                <td style="text-align:center;">${owned ? '<span style="color:#4ade80;" title="In your portfolio">✓</span>' : '<span style="color:var(--text-dim);">—</span>'}</td>
                <td style="font-size:0.78rem; color:var(--text-dim);">${i.portfolios.map(p => escapeHtml(p)).join(', ')}</td>
            </tr>`}).join('')}
            </tbody></table></div>`;
    } catch(e) { content.innerHTML = '<p style="color: #f87171;">Error running research.</p>'; }
}

function showAddPortfolioForm() {
    const name = prompt('Enter portfolio name:');
    if (!name) return;
    fetch('/api/my-lab/add-portfolio', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
    }).then(r => { if (r.ok) { showSaveToast('Portfolio added'); fetchMyLab(); } });
}
