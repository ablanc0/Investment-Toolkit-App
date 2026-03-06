// ── Super Investor 13F Holdings ──
let _si13fCurrentData = null; // current investor's holdings for CSV export
let _siInvestorNotes = {};    // investor_key -> note string
let _siActivityByTicker = {}; // ticker -> {type, changePct} from activity endpoint

async function fetchSuperInvestors() {
    try {
        const investors = await fetch('/api/super-investors').then(r => r.json());
        const sel = document.getElementById('siInvestorSelect');
        if (!sel) return;
        // Store notes for later use and sort alphabetically
        investors.forEach(inv => { _siInvestorNotes[inv.key] = inv.note || ''; });
        investors.sort((a, b) => a.key.localeCompare(b.key));
        sel.innerHTML = '<option value="">Select Investor...</option>' +
            investors.map(inv => {
                let label = `${inv.key} — ${inv.fund}`;
                if (inv.cached && inv.quarter) label += ` (${inv.quarter})`;
                return `<option value="${inv.key}">${label}</option>`;
            }).join('');
        // Auto-load most popular if any cached data exists
        const cachedCount = investors.filter(i => i.cached).length;
        if (cachedCount > 0) fetchMostPopular();
    } catch(e) { console.error(e); }
}

async function fetch13F(investorKey) {
    if (!investorKey) return;
    const tbody = document.getElementById('superInvBody');
    const meta = document.getElementById('si13fMeta');
    const noteEl = document.getElementById('siInvestorNote');
    const chartRow = document.getElementById('siChartRow');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-dim); padding:30px;">Loading 13F data from SEC EDGAR...</td></tr>';
    if (meta) { meta.style.display = 'none'; meta.innerHTML = ''; }
    if (chartRow) chartRow.style.display = 'none';
    // Show investor bio note
    const note = _siInvestorNotes[investorKey] || '';
    if (noteEl) { noteEl.textContent = note; noteEl.style.display = note ? 'block' : 'none'; }
    try {
        const data = await fetch(`/api/super-investors/13f/${encodeURIComponent(investorKey)}`).then(r => r.json());
        if (data.error) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#f87171; padding:30px;">${data.error}</td></tr>`;
            return;
        }
        _si13fCurrentData = data;
        _siActivityByTicker = {}; // reset before new fetch
        render13FHoldings(data);
        // Fetch history chart and activity in parallel
        fetchInvestorHistory(investorKey);
        fetchInvestorActivity(investorKey);
    } catch(e) {
        console.error(e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#f87171; padding:30px;">Error: ${e.message}</td></tr>`;
    }
}

function render13FHoldings(data) {
    const tbody = document.getElementById('superInvBody');
    const meta = document.getElementById('si13fMeta');
    const chartRow = document.getElementById('siChartRow');
    const thead = document.getElementById('siTableHead');
    const tableMeta = document.getElementById('siTableMeta');
    if (!tbody) return;
    // Restore holdings table headers (8 columns)
    if (thead) thead.innerHTML = '<tr><th style="width:40px;">#</th><th>Ticker</th><th>Company</th><th style="text-align:right;">Value ($M)</th><th style="text-align:right;">Shares</th><th style="text-align:right;">% Portfolio</th><th style="text-align:center;">Activity</th><th style="text-align:right;">Price</th></tr>';
    if (tableMeta) tableMeta.style.display = 'none';
    // Meta info
    if (meta) {
        const tv = data.totalValue || 0;
        const top10 = data.top10pct || (data.holdings ? data.holdings.slice(0, 10).reduce((s, h) => s + (h.pctPortfolio || 0), 0).toFixed(1) : 0);
        meta.style.display = 'flex';
        meta.innerHTML = `
            <div style="padding:8px 14px; background:var(--card-hover); border-radius:8px;">Filing: <strong>${data.quarter || '—'}</strong> (${data.filingDate || '—'})</div>
            <div style="padding:8px 14px; background:var(--card-hover); border-radius:8px;">Holdings: <strong>${data.holdingsCount || 0}</strong></div>
            <div style="padding:8px 14px; background:var(--card-hover); border-radius:8px;">Total Value: <strong>$${(tv/1e9).toFixed(1)}B</strong></div>
            <div style="padding:8px 14px; background:var(--card-hover); border-radius:8px;">Top 10: <strong>${top10}%</strong></div>
            <div style="padding:8px 14px; background:var(--card-hover); border-radius:8px;">Fund: <strong>${data.fund || '—'}</strong></div>
        `;
    }
    // Allocation doughnut chart
    if (chartRow) {
        chartRow.style.display = 'block';
        const canvas = document.getElementById('siAllocationChart');
        if (canvas) {
            if (charts['siAllocationChart']) { charts['siAllocationChart'].destroy(); }
            const holdings = data.holdings || [];
            const top10 = holdings.slice(0, 10);
            const otherValue = holdings.slice(10).reduce((s, h) => s + h.value, 0);
            const labels = top10.map(h => h.ticker || h.cusip);
            const values = top10.map(h => h.value);
            if (otherValue > 0) { labels.push('Other'); values.push(otherValue); }
            const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4', '#14b8a6', '#a78bfa', '#94a3b8'];
            charts['siAllocationChart'] = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: { labels, datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderColor: '#0f1117', borderWidth: 2 }] },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '60%',
                    plugins: {
                        legend: { position: 'right', labels: { color: '#e0e6ed', usePointStyle: true, padding: 12, font: { size: 11 } } },
                        tooltip: {
                            callbacks: {
                                label: ctx => {
                                    const v = ctx.parsed;
                                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = (v / total * 100).toFixed(1);
                                    const valStr = v >= 1e9 ? '$' + (v/1e9).toFixed(1) + 'B' : '$' + (v/1e6).toFixed(0) + 'M';
                                    return `${ctx.label}: ${valStr} (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }
    // Allocation treemap
    const treemapCanvas = document.getElementById('siTreemapChart');
    if (treemapCanvas) {
        if (charts['siTreemapChart']) { charts['siTreemapChart'].destroy(); }
        const allHoldings = data.holdings || [];
        const top15 = allHoldings.slice(0, 15);
        const otherVal = allHoldings.slice(15).reduce((s, h) => s + h.value, 0);
        const tmData = top15.map(h => ({label: h.ticker || h.cusip, value: h.value}));
        if (otherVal > 0) tmData.push({label: 'Other', value: otherVal});
        const totalVal = tmData.reduce((s, d) => s + d.value, 0);
        const tmColors = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f59e0b','#84cc16','#22c55e','#06b6d4','#14b8a6','#a78bfa','#94a3b8','#e879f9','#fb923c','#38bdf8','#4ade80','#fbbf24'];
        charts['siTreemapChart'] = new Chart(treemapCanvas.getContext('2d'), {
            type: 'treemap',
            data: {
                datasets: [{
                    tree: tmData,
                    key: 'value',
                    backgroundColor: (ctx) => tmColors[ctx.dataIndex % tmColors.length],
                    borderColor: '#0f1117',
                    borderWidth: 2,
                    labels: {
                        display: true,
                        align: 'center',
                        position: 'middle',
                        color: '#fff',
                        font: {size: 11, weight: 'bold'},
                        formatter: (ctx) => {
                            const d = ctx.dataset.tree[ctx.dataIndex];
                            if (!d) return '';
                            const pct = (d.value / totalVal * 100).toFixed(1);
                            return [d.label, pct + '%'];
                        }
                    }
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: {display: false},
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                const d = items[0]?.dataset?.tree?.[items[0].dataIndex];
                                return d ? d.label : '';
                            },
                            label: (ctx) => {
                                const d = ctx.dataset.tree[ctx.dataIndex];
                                if (!d) return '';
                                const valStr = d.value >= 1e9 ? '$' + (d.value/1e9).toFixed(1) + 'B' : '$' + (d.value/1e6).toFixed(0) + 'M';
                                const pct = (d.value / totalVal * 100).toFixed(1);
                                return `${valStr} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
    // Holdings table (8 columns: #, Ticker, Company, Value, Shares, %, Activity, Price)
    const holdings = data.holdings || [];
    const investorKey = data.investor || '';
    tbody.innerHTML = holdings.map((h, i) => {
        const ticker = h.ticker || h.cusip;
        const valM = (h.value / 1e6).toFixed(0);
        const sharesStr = h.shares >= 1e6 ? (h.shares / 1e6).toFixed(1) + 'M' : h.shares >= 1e3 ? (h.shares / 1e3).toFixed(0) + 'K' : h.shares.toLocaleString();
        const pct = h.pctPortfolio || 0;
        const pctColor = pct >= 10 ? '#4ade80' : pct >= 5 ? '#22d3ee' : 'var(--text)';
        const putCallTag = h.putCall ? ` <span style="font-size:0.7rem; color:#f59e0b;">${h.putCall}</span>` : '';
        const histBtn = h.ticker ? ` <span class="si-history-btn" onclick="toggleHoldingHistory(this, '${investorKey}', '${h.ticker}')" title="View history" style="cursor:pointer; opacity:0.5; font-size:0.75rem;">📊</span>` : '';
        return `<tr data-ticker="${ticker}">
            <td style="text-align:center; color:var(--text-dim);">${i+1}</td>
            <td><strong>${ticker}</strong>${putCallTag}${histBtn}</td>
            <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis;">${h.name || ''}</td>
            <td style="text-align:right; font-family:monospace;">$${Number(valM).toLocaleString()}</td>
            <td style="text-align:right; font-family:monospace;">${sharesStr}</td>
            <td style="text-align:right; color:${pctColor}; font-weight:600;">${pct.toFixed(1)}%</td>
            <td class="si-activity-cell" data-ticker="${ticker}" style="text-align:center;"></td>
            <td class="si-price-cell" data-ticker="${ticker}" style="text-align:right; font-family:monospace; color:var(--text-dim);">—</td>
        </tr>`;
    }).join('');
    // Kick off async price loading for top 30 tickers
    const tickers = holdings.slice(0, 30).map(h => h.ticker).filter(Boolean);
    if (tickers.length) fetchHoldingPrices(tickers);
}

async function fetchInvestorHistory(investorKey) {
    const wrap = document.getElementById('siHistoryChartWrap');
    if (!wrap) return;
    try {
        const data = await fetch(`/api/super-investors/history/${encodeURIComponent(investorKey)}`).then(r => r.json());
        if (!data.quarters || data.quarters.length < 2) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        const canvas = document.getElementById('siHistoryChart');
        if (!canvas) return;
        if (charts['siHistoryChart']) charts['siHistoryChart'].destroy();
        const quarters = [...data.quarters].reverse(); // chronological order
        charts['siHistoryChart'] = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: quarters.map(q => q.quarter),
                datasets: [{
                    label: 'Portfolio Value',
                    data: quarters.map(q => q.totalValue / 1e9),
                    backgroundColor: '#6366f1',
                    borderRadius: 3,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => '$' + ctx.parsed.y.toFixed(1) + 'B' } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', maxRotation: 45, font: { size: 9 } }, grid: { display: false } },
                    y: { ticks: { color: '#94a3b8', callback: v => '$' + v + 'B' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    } catch(e) { console.error(e); wrap.style.display = 'none'; }
}

async function fetchInvestorActivity(investorKey) {
    const row = document.getElementById('siActivityRow');
    if (!row) return;
    try {
        const data = await fetch(`/api/super-investors/activity/${encodeURIComponent(investorKey)}`).then(r => r.json());
        if (data.error || (data.buysCount === 0 && data.sellsCount === 0)) { row.style.display = 'none'; _siActivityByTicker = {}; return; }
        row.style.display = 'flex';
        const badge = (label, count, color) => `<div style="padding:8px 14px; background:var(--card-hover); border-radius:8px;">${label}: <strong style="color:${color};">${count}</strong></div>`;
        let html = badge('Buys', data.buysCount, '#4ade80') + badge('Sells', data.sellsCount, '#f87171');
        if (data.buys.length > 0) html += `<div style="padding:8px 14px; background:var(--card-hover); border-radius:8px; font-size:0.78rem; color:var(--text-dim);">New: ${data.buys.slice(0,5).map(b => b.ticker).join(', ')}</div>`;
        if (data.sells.length > 0) html += `<div style="padding:8px 14px; background:var(--card-hover); border-radius:8px; font-size:0.78rem; color:var(--text-dim);">Sold: ${data.sells.slice(0,5).map(s => s.ticker).join(', ')}</div>`;
        row.innerHTML = html;
        // Store per-ticker activity and apply badges to holdings table
        _siActivityByTicker = data.byTicker || {};
        applyActivityBadges();
    } catch(e) { console.error(e); row.style.display = 'none'; }
}

function applyActivityBadges() {
    document.querySelectorAll('.si-activity-cell').forEach(cell => {
        const ticker = cell.dataset.ticker;
        const info = _siActivityByTicker[ticker];
        if (!info) { cell.innerHTML = ''; return; }
        let label = '', color = '', html = '';
        if (info.type === 'new') { label = 'NEW'; color = '#4ade80'; }
        else if (info.type === 'sold') { label = 'SOLD'; color = '#f87171'; }
        else if (info.type === 'increased') { label = `+${info.changePct}%`; color = '#4ade80'; }
        else if (info.type === 'decreased') { label = `${info.changePct}%`; color = '#f87171'; }
        if (label) html = `<span style="font-size:0.7rem; font-weight:700; padding:2px 6px; border-radius:4px; background:${color}22; color:${color};">${label}</span>`;
        // Value change sub-line (for holdings in both quarters)
        if (info.valueChangePct !== undefined && Math.abs(info.valueChangePct) >= 0.1) {
            const vc = info.valueChangePct;
            const vcColor = vc > 0 ? '#4ade80' : '#f87171';
            const vcStr = vc > 0 ? `+${vc}%` : `${vc}%`;
            html += `<div style="font-size:0.65rem; color:${vcColor}; margin-top:2px;">Val ${vcStr}</div>`;
        }
        cell.innerHTML = html;
    });
}

async function fetchHoldingPrices(tickers) {
    try {
        const data = await fetch('/api/super-investors/prices', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({tickers})
        }).then(r => r.json());
        const prices = data.prices || {};
        document.querySelectorAll('.si-price-cell').forEach(cell => {
            const ticker = cell.dataset.ticker;
            const info = prices[ticker];
            if (!info) return;
            const p = info.price;
            const chg = info.changePercent || 0;
            const color = chg > 0 ? '#4ade80' : chg < 0 ? '#f87171' : 'var(--text)';
            const chgStr = chg > 0 ? `+${chg.toFixed(1)}%` : `${chg.toFixed(1)}%`;
            cell.innerHTML = `<span style="color:${color};">$${p.toFixed(2)}</span> <span style="font-size:0.7rem; color:${color};">${chgStr}</span>`;
        });
    } catch(e) { console.error('Price fetch error:', e); }
}

async function toggleHoldingHistory(btn, investorKey, ticker) {
    const row = btn.closest('tr');
    const existing = row.nextElementSibling;
    if (existing && existing.classList.contains('si-history-row')) {
        existing.remove();
        btn.style.opacity = '0.5';
        return;
    }
    btn.style.opacity = '1';
    const detailRow = document.createElement('tr');
    detailRow.className = 'si-history-row';
    detailRow.innerHTML = `<td colspan="8" style="padding:8px 20px; background:var(--card-hover);"><span style="color:var(--text-dim);">Loading history...</span></td>`;
    row.after(detailRow);
    try {
        const data = await fetch(`/api/super-investors/holding-history/${encodeURIComponent(investorKey)}/${encodeURIComponent(ticker)}`).then(r => r.json());
        const hist = data.history || [];
        if (!hist.length) {
            detailRow.innerHTML = `<td colspan="8" style="padding:8px 20px; background:var(--card-hover); color:var(--text-dim);">No historical data</td>`;
            return;
        }
        let html = `<td colspan="8" style="padding:8px 20px; background:var(--card-hover);">
            <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <tr style="color:var(--text-dim); border-bottom:1px solid var(--border);">
                    <th style="text-align:left; padding:4px 8px;">Quarter</th>
                    <th style="text-align:right; padding:4px 8px;">Value</th>
                    <th style="text-align:right; padding:4px 8px;">Shares</th>
                    <th style="text-align:right; padding:4px 8px;">% Portfolio</th>
                </tr>`;
        hist.forEach(h => {
            const valStr = h.value >= 1e9 ? '$' + (h.value/1e9).toFixed(2) + 'B' : '$' + (h.value/1e6).toFixed(0) + 'M';
            const sharesStr = h.shares >= 1e6 ? (h.shares/1e6).toFixed(1) + 'M' : h.shares >= 1e3 ? (h.shares/1e3).toFixed(0) + 'K' : h.shares.toLocaleString();
            html += `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:4px 8px;">${h.quarter}</td>
                <td style="text-align:right; padding:4px 8px; font-family:monospace;">${valStr}</td>
                <td style="text-align:right; padding:4px 8px; font-family:monospace;">${sharesStr}</td>
                <td style="text-align:right; padding:4px 8px;">${h.pctPortfolio.toFixed(1)}%</td>
            </tr>`;
        });
        html += '</table></td>';
        detailRow.innerHTML = html;
    } catch(e) {
        detailRow.innerHTML = `<td colspan="8" style="padding:8px 20px; background:var(--card-hover); color:#f87171;">Error loading history</td>`;
    }
}

async function refreshAll13F() {
    const progress = document.getElementById('si13fProgress');
    if (progress) { progress.style.display = 'block'; progress.textContent = 'Fetching 13F filings from SEC EDGAR — this may take a few minutes due to API rate limits...'; }
    try {
        const res = await fetch('/api/super-investors/13f-all', {method:'POST'}).then(r => r.json());
        if (res.status === 'already_running' || res.status === 'started') {
            // Poll progress
            const poll = setInterval(async () => {
                const p = await fetch('/api/super-investors/13f-progress').then(r => r.json());
                if (progress) progress.textContent = `Fetching ${p.current || '...'}  (${p.done}/${p.total})`;
                if (!p.running) {
                    clearInterval(poll);
                    if (progress) { progress.textContent = `Done! Loaded ${p.done} investors.`; setTimeout(() => { progress.style.display = 'none'; }, 3000); }
                    // Refresh dropdown, most popular, and overlap
                    await fetchSuperInvestors();
                    await fetchMostPopular();
                }
            }, 2000);
        }
    } catch(e) { console.error(e); if (progress) progress.textContent = 'Error: ' + e.message; }
}

function showMostPopular() {
    // Reset dropdown and show Most Popular in the same table
    const sel = document.getElementById('siInvestorSelect');
    if (sel) sel.value = '';
    const noteEl = document.getElementById('siInvestorNote');
    const meta = document.getElementById('si13fMeta');
    const chartRow = document.getElementById('siChartRow');
    const activityRow = document.getElementById('siActivityRow');
    if (noteEl) noteEl.style.display = 'none';
    if (meta) { meta.style.display = 'none'; meta.innerHTML = ''; }
    if (chartRow) chartRow.style.display = 'none';
    if (activityRow) activityRow.style.display = 'none';
    _si13fCurrentData = null;
    fetchMostPopular();
}

async function fetchMostPopular() {
    const tbody = document.getElementById('superInvBody');
    const thead = document.getElementById('siTableHead');
    const tableMeta = document.getElementById('siTableMeta');
    if (!tbody) return;
    try {
        const data = await fetch('/api/super-investors/most-popular').then(r => r.json());
        if (!data.popular || !data.popular.length) {
            if (thead) thead.innerHTML = '<tr><th style="width:40px;">#</th><th>Ticker</th><th>Company</th><th style="text-align:right;">Value ($M)</th><th style="text-align:right;">Shares</th><th style="text-align:right;">% Portfolio</th></tr>';
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:30px;">No data yet. Click "Refresh All" to fetch 13F filings.</td></tr>';
            return;
        }
        // Switch table headers to Most Popular mode
        if (thead) thead.innerHTML = '<tr><th style="width:40px;">#</th><th>Ticker</th><th>Company</th><th style="text-align:right;">Held By</th><th>Investors</th><th style="text-align:right;">Combined Value</th></tr>';
        if (tableMeta) { tableMeta.style.display = 'block'; tableMeta.textContent = `Ranked by number of super investors holding each stock — ${data.quarter || 'latest'} (${data.cachedInvestors}/${data.totalInvestors} investors)`; }
        tbody.innerHTML = data.popular.map((s, i) => {
            const valStr = s.totalValue >= 1e9 ? '$' + (s.totalValue/1e9).toFixed(1) + 'B' : '$' + (s.totalValue/1e6).toFixed(0) + 'M';
            const countColor = s.investorCount >= 4 ? '#4ade80' : s.investorCount >= 3 ? '#22d3ee' : 'var(--text)';
            return `<tr>
                <td style="text-align:center; color:var(--text-dim);">${i+1}</td>
                <td><strong>${s.ticker}</strong></td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">${s.name || ''}</td>
                <td style="text-align:right; font-weight:700; color:${countColor};">${s.investorCount}</td>
                <td style="font-size:0.78rem; color:var(--text-dim);">${s.investors.join(', ')}</td>
                <td style="text-align:right; font-family:monospace;">${valStr}</td>
            </tr>`;
        }).join('');
    } catch(e) { console.error(e); }
}

function exportSuperInvCSV() {
    if (!_si13fCurrentData || !_si13fCurrentData.holdings) return;
    const h = _si13fCurrentData.holdings;
    const header = 'Ticker,Company,Value,Shares,% Portfolio,Put/Call\n';
    const rows = h.map(r => `${r.ticker || r.cusip},"${(r.name||'').replace(/"/g,'""')}",${r.value},${r.shares},${r.pctPortfolio || 0},${r.putCall || ''}`).join('\n');
    const blob = new Blob([header + rows], {type: 'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `13f_${_si13fCurrentData.investor.replace(/\s+/g,'_')}_${_si13fCurrentData.quarter || 'unknown'}.csv`;
    a.click();
}
