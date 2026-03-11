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

    // Summary row
    const avgScore = items.reduce((s, iv) => {
        const sc = typeof iv.invtScore === 'object' && iv.invtScore ? iv.invtScore.score : iv.invtScore;
        return s + (Number(sc) || 0);
    }, 0) / (items.length || 1);
    tbody.innerHTML += `<tr class="summary-row">
        <td colspan="2"><strong>${items.length} Holdings</strong></td>
        <td></td><td></td><td></td>
        <td style="text-align:right;"><span style="color:${_invtScoreColor(avgScore)};font-weight:600">${avgScore.toFixed(1)}</span></td>
        <td></td><td></td><td></td><td></td>
        <td>
            <span style="color:#4ade80;font-weight:600;">${strongBuy} SB</span> ·
            <span style="color:#22d3ee;font-weight:600;">${buy} B</span> ·
            <span style="color:#f87171;font-weight:600;">${overrated} OR</span>
        </td>
        <td></td>
    </tr>`;
}

// ── Bulk Refresh All IV Tickers ──
let _ivRefreshAbort = false;

async function refreshAllIV() {
    // Get current IV list tickers
    let items;
    try {
        const data = await fetch('/api/intrinsic-values').then(r => r.json());
        items = (data.intrinsicValues || []).filter(i => i.ticker && i.ticker.length <= 5);
    } catch (e) {
        showSaveToast('Failed to load IV list', true);
        return;
    }

    if (items.length === 0) {
        showSaveToast('No tickers in IV list');
        return;
    }

    // Check FMP quota
    try {
        const quota = await fetch('/api/health/fmp-quota').then(r => r.json());
        if (quota.remaining < 50) {
            if (!confirm(`FMP API quota is low: ${quota.remaining}/${quota.limit} remaining today.\n\nEach ticker uses ~4-9 FMP calls. Continue anyway?`)) {
                return;
            }
        }
    } catch (e) {
        console.warn('[iv-refresh] Could not check FMP quota:', e);
    }

    // Setup UI
    _ivRefreshAbort = false;
    const btn = document.getElementById('ivRefreshAllBtn');
    const progress = document.getElementById('ivRefreshProgress');
    const status = document.getElementById('ivRefreshStatus');
    const count = document.getElementById('ivRefreshCount');
    const fill = document.getElementById('ivRefreshFill');

    btn.textContent = '⏹ Stop';
    btn.style.borderColor = 'var(--red)';
    btn.style.color = 'var(--red)';
    btn.onclick = () => { _ivRefreshAbort = true; };
    progress.style.display = '';

    const total = items.length;
    let success = 0;
    let errors = 0;
    const errorTickers = [];

    for (let i = 0; i < total; i++) {
        if (_ivRefreshAbort) {
            status.textContent = 'Stopped by user';
            break;
        }

        const ticker = items[i].ticker;
        const pct = Math.round(((i + 1) / total) * 100);
        status.textContent = `Refreshing ${ticker}...`;
        count.textContent = `${i + 1} / ${total}`;
        fill.style.width = pct + '%';

        try {
            // Step 1: Stock Analyzer (full refresh)
            const analyzerResp = await fetch(`/api/stock-analyzer/${ticker}?refresh=true`);
            if (!analyzerResp.ok) throw new Error(`Analyzer ${analyzerResp.status}`);
            const d = await analyzerResp.json();
            if (d.error) throw new Error(d.error);

            // Step 2: InvT Score (full refresh)
            const scoreResp = await fetch(`/api/invt-score/${ticker}?refresh=true`);
            let invtScore = '';
            if (scoreResp.ok) {
                const scoreData = await scoreResp.json();
                if (!scoreData.error) invtScore = scoreData;
            }

            // Step 3: Build upsert body (mirrors analyzer.js saveCompositeIvToList)
            const s = d.valuation?.summary;
            const compositeIv = s?.compositeIv || 0;
            const signal = compositeIv > 0 && d.price > 0
                ? (d.price <= compositeIv * 0.85 ? 'Strong Buy'
                    : d.price < compositeIv ? 'Buy'
                    : d.price <= compositeIv * 1.15 ? 'Expensive'
                    : 'Overrated')
                : '';

            const body = {
                ticker: d.ticker || d.symbol || ticker,
                companyName: d.name || d.shortName || d.companyName || '',
                currentPrice: d.price || 0,
                intrinsicValue: compositeIv,
                targetPrice: d.targetMeanPrice || 0,
                week52Low: d.fiftyTwoWeekLow || 0,
                week52High: d.fiftyTwoWeekHigh || 0,
                sector: d.sector || '',
                category: s?.category || items[i].category || '',
                peRatio: d.trailingPE || 0,
                eps: d.earningsPerShare || d.trailingEps || 0,
                annualDividend: d.dividendRate || 0,
                dividendYield: d.dividendYield || 0,
                signal: signal,
                invtScore: invtScore,
            };

            // Step 4: Upsert to IV list
            const upsertResp = await fetch('/api/intrinsic-values/upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!upsertResp.ok) throw new Error(`Upsert ${upsertResp.status}`);

            success++;
        } catch (e) {
            console.error(`[iv-refresh] ${ticker} failed:`, e);
            errors++;
            errorTickers.push(ticker);
        }

        // Rate limit delay (1 second between tickers)
        if (i < total - 1 && !_ivRefreshAbort) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Reset UI
    btn.textContent = '🔄 Refresh All';
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
    btn.onclick = refreshAllIV;

    // Show result
    fill.style.width = '100%';
    const msg = errors > 0
        ? `Refreshed ${success}/${total} — ${errors} error(s): ${errorTickers.join(', ')}`
        : `Refreshed ${success}/${total} successfully`;
    status.textContent = msg;
    count.textContent = '';
    showSaveToast(errors > 0 ? `${success} refreshed, ${errors} errors` : `All ${success} tickers refreshed`);

    // Re-fetch IV list to update the table
    await fetchIntrinsicValues();

    // Hide progress after 5 seconds
    setTimeout(() => {
        progress.style.display = 'none';
        fill.style.width = '0%';
    }, 5000);
}
