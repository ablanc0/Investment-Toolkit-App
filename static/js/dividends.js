// ── Tab 4: Dividends ──

function populateDividends() {
    if (!dividendData) return;

    const summary = portfolioData?.summary || {};
    const positions = portfolioData?.positions || [];
    const annualEstimate = dividendData.annualEstimate || 0;
    const marketValue = summary.totalMarketValue || 1;
    const yield_ = (annualEstimate / marketValue) * 100;

    // 6 KPI cards
    const kpis = [
        { label: '💰 Annual Income', value: formatMoney(annualEstimate), sub: 'Estimated yearly' },
        { label: '📦 Total Received', value: formatMoney(dividendData.totalReceived || 0), sub: 'All time' },
        { label: '📊 Dividend Yield', value: formatPercent(yield_), sub: 'vs market value' },
        { label: '🎯 Yield on Cost', value: formatPercent(summary.portfolioYOC || 0), sub: 'vs cost basis' },
        { label: '🗓️ Monthly Income', value: formatMoney(summary.monthlyDivIncome || 0), sub: 'Expected per month' },
        { label: '⏰ Daily Income', value: formatMoney(summary.dailyDivIncome || 0), sub: 'Expected per day' },
    ];

    const kpiGrid = document.getElementById('dividendKpis');
    kpiGrid.innerHTML = kpis.map(kpi => `
        <div class="kpi-card">
            <div class="kpi-emoji">${kpi.label.split(' ')[0]}</div>
            <div class="kpi-label">${kpi.label.split(' ').slice(1).join(' ')}</div>
            <div class="kpi-value">${kpi.value}</div>
            <div class="kpi-sub">${kpi.sub}</div>
        </div>
    `).join('');

    // Income Rank — Top 5 and Bottom 5 by totalDivsReceived
    renderIncomeRank(positions, dividendData.totalReceived || summary.lifetimeDivsReceived || 0);

    // Charts
    if (dividendData.monthlyTotals) createMonthlyDividendChart(dividendData.monthlyTotals);
    if (dividendData.byHolding) createHoldingDividendChart(dividendData.byHolding);

    // New charts
    renderDivYieldChart(positions);
    renderIncomeDistChart(positions);

    // Dividend Growth YoY
    if (dividendData.monthlyTotals) renderDivGrowthYoYChart(dividendData.monthlyTotals);

    // Dividend Safety (async, loads from analyzer data)
    fetchDividendSafety();
}

function renderIncomeRank(positions, totalReceived) {
    const withDivs = positions
        .filter(p => (p.totalDivsReceived || 0) > 0)
        .sort((a, b) => (b.totalDivsReceived || 0) - (a.totalDivsReceived || 0));

    const top5 = withDivs.slice(0, 5);
    const bottom5 = withDivs.slice(-5).reverse();
    const topTotal = top5.reduce((s, p) => s + (p.totalDivsReceived || 0), 0);
    const bottomTotal = bottom5.reduce((s, p) => s + (p.totalDivsReceived || 0), 0);
    const total = totalReceived || withDivs.reduce((s, p) => s + (p.totalDivsReceived || 0), 0) || 1;

    const renderList = (items, container) => {
        const el = document.getElementById(container);
        if (!el) return;
        el.innerHTML = items.length > 0 ? `
            ${items.map((p, i) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="color: var(--text-dim); font-size: 12px; width: 24px;">${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}</span>
                        <strong>${escapeHtml(p.ticker)}</strong>
                    </div>
                    <span style="font-weight: 600;">${formatMoney(p.totalDivsReceived)}</span>
                </div>
            `).join('')}
        ` : '<p style="color: var(--text-dim);">No dividend data</p>';
    };

    renderList(top5, 'topDivPayers');
    renderList(bottom5, 'bottomDivPayers');

    // Add percentage footer
    const topEl = document.getElementById('topDivPayers');
    if (topEl && top5.length > 0) {
        topEl.innerHTML += `<div style="margin-top: 8px; padding-top: 8px; border-top: 2px solid var(--border); font-size: 13px; color: var(--text-dim);">Percent of Total Income: <strong style="color: var(--text);">${((topTotal / total) * 100).toFixed(2)}%</strong></div>`;
    }
    const bottomEl = document.getElementById('bottomDivPayers');
    if (bottomEl && bottom5.length > 0) {
        bottomEl.innerHTML += `<div style="margin-top: 8px; padding-top: 8px; border-top: 2px solid var(--border); font-size: 13px; color: var(--text-dim);">Percent of Total Income: <strong style="color: var(--text);">${((bottomTotal / total) * 100).toFixed(2)}%</strong></div>`;
    }
}

function renderDivYieldChart(positions) {
    const ctx = document.getElementById('divYieldChart');
    if (!ctx) return;
    const withYield = positions
        .filter(p => (p.divYield || 0) > 0)
        .sort((a, b) => (b.divYield || 0) - (a.divYield || 0));

    if (withYield.length === 0) return;

    // Dynamic height: 30px per bar, min 300px
    ctx.parentElement.style.height = Math.max(300, withYield.length * 30) + 'px';

    if (charts.divYield) charts.divYield.destroy();
    charts.divYield = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: withYield.map(p => p.ticker),
            datasets: [{
                label: 'Div Yield %',
                data: withYield.map(p => p.divYield || 0),
                backgroundColor: withYield.map((_, i) => {
                    const colors = ['#4ade80', '#22d3ee', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];
                    return colors[i % colors.length];
                }),
                borderRadius: 4,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: getChartTextColor(), callback: v => v + '%' }, grid: { color: getChartGridColor() } },
                y: { ticks: { color: getChartTextColor() }, grid: { display: false } }
            }
        }
    });
}

function renderIncomeDistChart(positions) {
    const ctx = document.getElementById('incomeDistChart');
    if (!ctx) return;
    const withIncome = positions
        .filter(p => (p.annualDivIncome || 0) > 0)
        .sort((a, b) => (b.annualDivIncome || 0) - (a.annualDivIncome || 0));

    if (withIncome.length === 0) return;

    const colors = ['#4ade80', '#22d3ee', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

    if (charts.incomeDist) charts.incomeDist.destroy();
    charts.incomeDist = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: withIncome.map(p => p.ticker),
            datasets: [{
                data: withIncome.map(p => p.annualDivIncome || 0),
                backgroundColor: withIncome.map((_, i) => colors[i % colors.length]),
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: getChartTextColor(), padding: 8, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.label}: $${ctx.raw.toFixed(2)} (${((ctx.raw / withIncome.reduce((s, p) => s + (p.annualDivIncome || 0), 0)) * 100).toFixed(1)}%)`
                    }
                }
            }
        }
    });
}

function renderDivGrowthYoYChart(monthlyTotals) {
    const ctx = document.getElementById('divGrowthYoYChart');
    if (!ctx) return;

    // Group monthly totals by year → {2024: {Jan: 50, Feb: 30, ...}, 2025: {...}}
    const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const yearData = {};
    for (const [key, val] of Object.entries(monthlyTotals)) {
        const [yr, mo] = key.split('-');
        if (!yearData[yr]) yearData[yr] = {};
        const mi = parseInt(mo, 10) - 1;
        yearData[yr][MONTH_SHORT[mi]] = (yearData[yr][MONTH_SHORT[mi]] || 0) + val;
    }

    const years = Object.keys(yearData).sort();
    if (years.length === 0) return;

    const colors = ['#6366f1', '#22d3ee', '#f59e0b', '#4ade80', '#ec4899', '#ef4444', '#8b5cf6', '#14b8a6'];
    const datasets = years.map((yr, i) => ({
        label: yr,
        data: MONTH_SHORT.map(m => yearData[yr][m] || 0),
        backgroundColor: colors[i % colors.length] + 'cc',
        borderColor: colors[i % colors.length],
        borderWidth: 1,
        borderRadius: 4,
    }));

    if (charts.divGrowthYoY) charts.divGrowthYoY.destroy();
    charts.divGrowthYoY = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: { labels: MONTH_SHORT, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: getChartTextColor(), padding: 12, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: $${ctx.raw.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: getChartTextColor() }, grid: { display: false } },
                y: { ticks: { color: getChartTextColor(), callback: v => '$' + v }, grid: { color: getChartGridColor() } }
            }
        }
    });
}

// ── Dividend Safety Rating ──

async function fetchDividendSafety() {
    try {
        const resp = await fetch('/api/dividend-safety');
        if (!resp.ok) return;
        const data = await resp.json();
        renderDividendSafety(data);
    } catch (e) {
        console.error('[div-safety]', e);
    }
}

function renderDividendSafety(data) {
    const holdings = data.holdings || [];
    const dist = data.distribution || {};

    // Donut chart
    const canvas = document.getElementById('divSafetyDonut');
    if (canvas && holdings.length > 0) {
        const labels = ['Reliable', 'Safe', 'OK', 'Risky'];
        const colors = ['#22c55e', '#22d3ee', '#f59e0b', '#ef4444'];
        const counts = labels.map(l => dist[l] || 0);

        if (charts.divSafety) charts.divSafety.destroy();
        charts.divSafety = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{ data: counts, backgroundColor: colors, borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: { legend: { display: false } }
            }
        });

        const legend = document.getElementById('divSafetyLegend');
        if (legend) {
            legend.innerHTML = labels.map((l, i) =>
                counts[i] > 0 ? `<span style="color: ${colors[i]}; margin: 0 6px;">${l}: ${counts[i]}</span>` : ''
            ).join('');
        }
    }

    // Table
    const tbody = document.getElementById('divSafetyBody');
    if (!tbody) return;

    if (holdings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="color: var(--text-dim); text-align: center; padding: 24px;">Run Stock Analyzer on your holdings to see dividend safety ratings.</td></tr>';
        return;
    }

    const ratingColors = { Reliable: '#22c55e', Safe: '#22d3ee', OK: '#f59e0b', Risky: '#ef4444' };

    tbody.innerHTML = holdings.map(h => {
        const color = ratingColors[h.label] || 'var(--text-dim)';
        const fmtVal = (v) => v !== null && v !== undefined ? v.toFixed(1) : '—';
        return `<tr>
            <td><strong>${escapeHtml(h.ticker)}</strong></td>
            <td><span style="color: ${color}; font-weight: 600; padding: 2px 8px; background: ${color}22; border-radius: 4px; font-size: 12px;">${h.label}</span></td>
            <td style="font-weight: 600; color: ${color};">${h.score}</td>
            <td style="text-align:right;">${fmtVal(h.payoutRatio)}</td>
            <td style="text-align:right;">${fmtVal(h.fcfPayout)}</td>
            <td style="text-align:right; color: ${(h.dpsCagr || 0) > 0 ? '#22c55e' : (h.dpsCagr || 0) < 0 ? '#ef4444' : 'var(--text-dim)'};">${fmtVal(h.dpsCagr)}</td>
            <td style="text-align:right;">${fmtVal(h.interestCov)}</td>
        </tr>`;
    }).join('');
}

// ── Dividend Log (Calendar Matrix with Collapsible Years) ──

let dlData = { dividendLog: [], activeTickers: [] };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function fetchDividendLog() {
    try {
        const data = await fetch('/api/dividend-log').then(r => r.json());
        dlData = data;
        renderDividendLog(data);
    } catch(e) { console.error(e); }
}

function renderDividendLog(data) {
    const container = document.getElementById('divlogContainer');
    const kpis = document.getElementById('dlKpis');
    if (!container) return;
    const log = data.dividendLog || [];
    const tickers = data.activeTickers || [];
    // All tickers that have any data + active ones
    const allTickers = [...new Set([...tickers, 'cashInterest'])];
    // Only show tickers that exist in the log entries
    const logTickers = [];
    for (const t of allTickers) {
        if (log.some(e => (e[t] || 0) > 0)) logTickers.push(t);
    }
    // Also add any ticker in log that has data but isn't in active
    for (const entry of log) {
        for (const key of Object.keys(entry)) {
            if (['year','month','total','cashInterest'].includes(key)) continue;
            if (typeof entry[key] === 'number' && entry[key] > 0 && !logTickers.includes(key)) logTickers.push(key);
        }
    }
    // Ensure cashInterest is last
    const ci = logTickers.indexOf('cashInterest');
    if (ci > -1) { logTickers.splice(ci, 1); logTickers.push('cashInterest'); }

    // Group by year
    const years = {};
    log.forEach(e => {
        if (!years[e.year]) years[e.year] = [];
        years[e.year].push(e);
    });
    const sortedYears = Object.keys(years).map(Number).sort((a,b) => a-b);
    const currentYear = new Date().getFullYear();

    // KPIs
    const allTimeTotal = log.reduce((s, e) => s + (e.total || 0), 0);
    const thisYearTotal = log.filter(e => e.year === currentYear).reduce((s, e) => s + (e.total || 0), 0);
    const lastYearTotal = log.filter(e => e.year === currentYear - 1).reduce((s, e) => s + (e.total || 0), 0);
    kpis.innerHTML = `
        <span style="color: var(--text-dim);">All-Time: <strong style="color: var(--accent);">${formatMoney(allTimeTotal)}</strong></span>
        <span style="color: var(--text-dim);">${currentYear}: <strong class="positive">${formatMoney(thisYearTotal)}</strong></span>
        <span style="color: var(--text-dim);">${currentYear-1}: <strong>${formatMoney(lastYearTotal)}</strong></span>
    `;

    let html = '';
    for (const year of sortedYears) {
        const entries = years[year];
        const yearTotal = entries.reduce((s, e) => s + (e.total || 0), 0);
        if (yearTotal === 0 && year > currentYear) continue; // skip empty future years
        const collapsed = year < currentYear ? 'collapsed' : '';
        const hidden = year < currentYear ? 'style="display:none;"' : '';

        html += `<div class="dl-year-group" style="margin-bottom: 12px;">
            <div class="dl-year-header" onclick="toggleDlYear(${year})" style="cursor: pointer; padding: 8px 12px; background: var(--card-hover); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 1.05rem;">
                    <span id="dlChevron${year}" style="display: inline-block; transition: transform 0.2s; transform: rotate(${collapsed ? '0' : '90'}deg);">▶</span>
                    ${year}
                </span>
                <span style="color: var(--accent); font-weight: 600;">${formatMoney(yearTotal)}</span>
            </div>
            <div id="dlYear${year}" ${hidden}>
                <div class="table-wrapper"><table style="font-size: 0.82rem;">
                    <thead><tr>
                        <th style="min-width:80px;">Month</th>
                        ${logTickers.map(t => `<th style="min-width:60px; text-align:right;">${t === 'cashInterest' ? 'Cash Int.' : escapeHtml(t)}</th>`).join('')}
                        <th style="min-width:70px; text-align:right; font-weight:700;">Total</th>
                    </tr></thead>
                    <tbody>`;

        for (const entry of entries) {
            const mi = MONTHS.indexOf(entry.month);
            const isPast = year < currentYear || (year === currentYear && mi < new Date().getMonth());
            const rowStyle = entry.total > 0 ? '' : 'opacity: 0.4;';
            html += `<tr style="${rowStyle}"><td style="font-weight:600;">${entry.month.substring(0,3)}</td>`;
            for (const t of logTickers) {
                const val = entry[t] || 0;
                const editable = true;
                html += `<td style="text-align:right; padding: 2px 4px;">
                    <input type="number" step="0.01" value="${val || ''}" placeholder="—"
                        style="width: 60px; text-align: right; background: transparent; border: 1px solid transparent; color: ${val > 0 ? '#4ade80' : 'var(--text-dim)'}; padding: 3px 4px; border-radius: 4px; font-size: 0.82rem;"
                        onfocus="this.style.borderColor='var(--accent)'; this.style.background='var(--card-hover)';"
                        onblur="this.style.borderColor='transparent'; this.style.background='transparent'; saveDividendCell(${year}, '${escapeHtml(entry.month)}', '${escapeHtml(t)}', this.value)"
                        onkeydown="if(event.key==='Enter'){this.blur();}"
                    />
                </td>`;
            }
            html += `<td style="text-align:right; font-weight:700; color: ${entry.total > 0 ? '#6366f1' : 'var(--text-dim)'};">${entry.total > 0 ? formatMoney(entry.total) : '—'}</td></tr>`;
        }

        // Year total row
        const yearTotals = {};
        for (const t of logTickers) {
            yearTotals[t] = entries.reduce((s, e) => s + (e[t] || 0), 0);
        }
        html += `<tr style="border-top: 2px solid var(--border); font-weight: 700;">
            <td>Total</td>`;
        for (const t of logTickers) {
            html += `<td style="text-align:right; color: ${yearTotals[t] > 0 ? '#4ade80' : 'var(--text-dim)'};">${yearTotals[t] > 0 ? yearTotals[t].toFixed(2) : '—'}</td>`;
        }
        html += `<td style="text-align:right; color: var(--accent); font-size: 0.95rem;">${formatMoney(yearTotal)}</td></tr>`;

        html += `</tbody></table></div></div></div>`;
    }
    container.innerHTML = html;
}

function toggleDlYear(year) {
    const el = document.getElementById(`dlYear${year}`);
    const chevron = document.getElementById(`dlChevron${year}`);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? '' : 'none';
    if (chevron) chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

async function saveDividendCell(year, month, ticker, value) {
    const val = parseFloat(value) || 0;
    try {
        const resp = await fetch('/api/dividend-log/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ year, month, ticker, value: val })
        });
        if (resp.ok) {
            showSaveToast(`${ticker} ${month} ${year} saved`);
            fetchDividendLog(); // re-render to update totals
        }
    } catch(e) { console.error(e); }
}

// ── Monthly Data (Editable Table with Dividend Totals) ──

async function fetchMonthlyData() {
    try {
        const [data, trackerResp] = await Promise.all([
            fetch('/api/monthly-data').then(r => r.json()),
            fetch('/api/monthly-tracker-stats').then(r => r.json()),
        ]);
        if (trackerResp.stats) renderMonthlyTrackerStats(trackerResp.stats);
        renderMonthlyData(data.monthlyData || []);
        renderIncomeDistribution(data.incomeDistribution || [], data.years || []);
    } catch(e) { console.error(e); }
}

function renderMonthlyData(items) {
    const container = document.getElementById('monthlyContainer');
    const kpis = document.getElementById('mdKpis');
    if (!container) return;

    // Pre-compute month-over-month returns
    const moReturns = [null]; // first entry has no prior month
    for (let i = 1; i < items.length; i++) {
        const prevVal = items[i - 1].portfolioValue || 0;
        const currVal = items[i].portfolioValue || 0;
        const contrib = items[i].contributions || 0;
        if (prevVal > 0 && currVal > 0) {
            moReturns.push(((currVal - prevVal - contrib) / prevVal) * 100);
        } else {
            moReturns.push(null);
        }
    }

    // Group by year
    const years = {};
    items.forEach((m, i) => {
        const yr = m.year || parseInt('20' + m.month.split(' ')[1]);
        if (!years[yr]) years[yr] = [];
        years[yr].push({ ...m, _idx: i });
    });
    const sortedYears = Object.keys(years).map(Number).sort((a,b) => a-b);
    const currentYear = new Date().getFullYear();

    // KPIs
    const lastEntry = [...items].reverse().find(m => m.portfolioValue > 0);
    const totalContribs = items.reduce((s, m) => s + (m.contributions || 0), 0);
    const totalDivs = items.reduce((s, m) => s + (m.dividendIncome || 0), 0);
    kpis.innerHTML = `
        <span style="color: var(--text-dim);">Current: <strong style="color: var(--accent);">${lastEntry ? formatMoney(lastEntry.portfolioValue) : '—'}</strong></span>
        <span style="color: var(--text-dim);">Invested: <strong>${formatMoney(totalContribs)}</strong></span>
        <span style="color: var(--text-dim);">Dividends: <strong class="positive">${formatMoney(totalDivs)}</strong></span>
    `;

    let html = '';
    for (const year of sortedYears) {
        const entries = years[year];
        const hasData = entries.some(e => e.portfolioValue > 0 || e.contributions > 0);
        if (!hasData && year > currentYear) continue;
        const collapsed = year < currentYear ? 'collapsed' : '';
        const hidden = year < currentYear ? 'style="display:none;"' : '';
        const yearContribs = entries.reduce((s, e) => s + (e.contributions || 0), 0);
        const yearDivs = entries.reduce((s, e) => s + (e.dividendIncome || 0), 0);
        const lastVal = [...entries].reverse().find(e => e.portfolioValue > 0);

        html += `<div style="margin-bottom: 12px;">
            <div onclick="toggleMdYear(${year})" style="cursor: pointer; padding: 8px 12px; background: var(--card-hover); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 1.05rem;">
                    <span id="mdChevron${year}" style="display: inline-block; transition: transform 0.2s; transform: rotate(${collapsed ? '0' : '90'}deg);">▶</span>
                    ${year}
                </span>
                <span style="display: flex; gap: 16px; font-size: 0.85rem;">
                    <span>Value: <strong style="color: var(--accent);">${lastVal ? formatMoney(lastVal.portfolioValue) : '—'}</strong></span>
                    <span>Contrib: <strong>${formatMoney(yearContribs)}</strong></span>
                    <span>Divs: <strong class="positive">${formatMoney(yearDivs)}</strong></span>
                </span>
            </div>
            <div id="mdYear${year}" ${hidden}>
                <div class="table-wrapper"><table style="font-size: 0.85rem;">
                    <thead><tr>
                        <th>Month</th><th style="text-align:right;">Portfolio Value</th><th style="text-align:right;">Contributions</th>
                        <th style="text-align:right;">Dividend Income</th><th style="text-align:right;">Accum. Investment</th>
                        <th style="text-align:right;">Total Return</th><th style="text-align:right;">Return %</th>
                        <th style="text-align:right;">Mo. Return %</th>
                    </tr></thead><tbody>`;

        for (const entry of entries) {
            const shortMonth = entry.month.split(' ')[0].substring(0, 3);
            const hasVal = entry.portfolioValue > 0 || entry.contributions > 0;
            const rowStyle = hasVal ? '' : 'opacity: 0.35;';
            const rawRetPct = entry.totalReturnPct || 0;
            // Normalize: values > 1 or < -1 are legacy percentage format (e.g. 19.35 = 19.35%)
            const retPct = Math.abs(rawRetPct) > 1 ? rawRetPct / 100 : rawRetPct;
            const retClass = retPct > 0 ? 'positive' : retPct < 0 ? 'negative' : '';

            html += `<tr style="${rowStyle}">
                <td style="font-weight:600;">${shortMonth}</td>
                <td style="text-align:right; padding: 2px 4px;">
                    <input type="number" step="0.01" value="${entry.portfolioValue || ''}" placeholder="—"
                        style="width: 100px; text-align: right; background: transparent; border: 1px solid transparent; color: var(--text); padding: 3px 4px; border-radius: 4px; font-size: 0.85rem;"
                        onfocus="this.style.borderColor='var(--accent)'; this.style.background='var(--card-hover)';"
                        onblur="this.style.borderColor='transparent'; this.style.background='transparent'; saveMonthlyCell(${entry._idx}, 'portfolioValue', this.value)"
                        onkeydown="if(event.key==='Enter'){this.blur();}"
                    />
                </td>
                <td style="text-align:right; padding: 2px 4px;">
                    <input type="number" step="0.01" value="${entry.contributions || ''}" placeholder="—"
                        style="width: 90px; text-align: right; background: transparent; border: 1px solid transparent; color: var(--text); padding: 3px 4px; border-radius: 4px; font-size: 0.85rem;"
                        onfocus="this.style.borderColor='var(--accent)'; this.style.background='var(--card-hover)';"
                        onblur="this.style.borderColor='transparent'; this.style.background='transparent'; saveMonthlyCell(${entry._idx}, 'contributions', this.value)"
                        onkeydown="if(event.key==='Enter'){this.blur();}"
                    />
                </td>
                <td style="text-align:right; color: #4ade80;">${entry.dividendIncome > 0 ? formatMoney(entry.dividendIncome) : '—'}</td>
                <td style="text-align:right; padding: 2px 4px;">
                    <input type="number" step="0.01" value="${entry.accumulatedInvestment || ''}" placeholder="—"
                        style="width: 100px; text-align: right; background: transparent; border: 1px solid transparent; color: var(--text); padding: 3px 4px; border-radius: 4px; font-size: 0.85rem;"
                        onfocus="this.style.borderColor='var(--accent)'; this.style.background='var(--card-hover)';"
                        onblur="this.style.borderColor='transparent'; this.style.background='transparent'; saveMonthlyCell(${entry._idx}, 'accumulatedInvestment', this.value)"
                        onkeydown="if(event.key==='Enter'){this.blur();}"
                    />
                </td>
                <td style="text-align:right; color: ${(entry.totalReturn||0) >= 0 ? '#4ade80' : '#f87171'};">${entry.totalReturn ? formatMoney(entry.totalReturn) : '—'}</td>
                <td style="text-align:right;" class="${retClass}">${retPct ? (retPct * 100).toFixed(2) + '%' : '—'}</td>
                <td style="text-align:right; color: ${moReturns[entry._idx] > 0 ? '#4ade80' : moReturns[entry._idx] < 0 ? '#f87171' : 'var(--text-dim)'}; font-weight:600;">${moReturns[entry._idx] !== null ? moReturns[entry._idx].toFixed(2) + '%' : '—'}</td>
            </tr>`;
        }
        html += `</tbody></table></div></div></div>`;
    }
    container.innerHTML = html;
}

function renderIncomeDistribution(matrix, years) {
    const container = document.getElementById('incomeDistContainer');
    const kpis = document.getElementById('incomeDistKpis');
    if (!container || !matrix.length || !years.length) {
        if (container) container.innerHTML = '<p style="color: var(--text-dim);">No income distribution data available.</p>';
        return;
    }

    // Filter to years that have any data
    const activeYears = years.filter(y => matrix.some(r => r[String(y)] > 0));
    if (!activeYears.length) {
        container.innerHTML = '<p style="color: var(--text-dim);">No dividend income recorded yet.</p>';
        return;
    }

    // KPIs from totals row
    const totalsRow = matrix.find(r => r.month === 'Total');
    const currentYear = new Date().getFullYear();
    const currentYearTotal = totalsRow ? totalsRow[String(currentYear)] || 0 : 0;
    const prevYearTotal = totalsRow ? totalsRow[String(currentYear - 1)] || 0 : 0;
    const yoyGrowth = totalsRow ? totalsRow[`yoy_${currentYear}`] : null;

    if (kpis) {
        kpis.innerHTML = `
            <span style="color: var(--text-dim);">${currentYear} YTD: <strong class="positive">${formatMoney(currentYearTotal)}</strong></span>
            <span style="color: var(--text-dim);">${currentYear - 1} Total: <strong>${formatMoney(prevYearTotal)}</strong></span>
            ${yoyGrowth !== null && yoyGrowth !== undefined ? `<span style="color: var(--text-dim);">YOY: <strong class="${yoyGrowth >= 0 ? 'positive' : 'negative'}">${yoyGrowth > 0 ? '+' : ''}${yoyGrowth.toFixed(1)}%</strong></span>` : ''}
        `;
    }

    // Build table headers: Month | Year1 | Year2 | YOY% | Year3 | YOY% | ...
    let headerHtml = '<th style="position: sticky; left: 0; z-index: 2; background: var(--card-hover);">Month</th>';
    for (let i = 0; i < activeYears.length; i++) {
        headerHtml += `<th style="text-align: right;">${activeYears[i]}</th>`;
        if (i > 0) {
            headerHtml += `<th style="text-align: right; font-size: 0.75rem; color: var(--text-dim);">YOY %</th>`;
        }
    }

    // Build rows (12 months + totals)
    let bodyHtml = '';
    for (const row of matrix) {
        const isTotal = row.month === 'Total';
        const rowStyle = isTotal ? 'font-weight: 700; background: var(--card-hover); border-top: 2px solid var(--border);' : '';
        bodyHtml += `<tr style="${rowStyle}">`;
        bodyHtml += `<td style="font-weight: 600; white-space: nowrap; position: sticky; left: 0; z-index: 1; background: ${isTotal ? 'var(--card-hover)' : 'var(--card)'};">${row.month}</td>`;

        for (let i = 0; i < activeYears.length; i++) {
            const yr = activeYears[i];
            const val = row[String(yr)] || 0;
            const valColor = val > 0 ? '#4ade80' : 'var(--text-dim)';
            bodyHtml += `<td style="text-align: right; color: ${valColor};">${val > 0 ? formatMoney(val) : '—'}</td>`;

            if (i > 0) {
                const yoy = row[`yoy_${yr}`];
                if (yoy !== undefined && yoy !== null) {
                    const yoyColor = yoy > 0 ? '#4ade80' : yoy < 0 ? '#f87171' : 'var(--text-dim)';
                    bodyHtml += `<td style="text-align: right; font-size: 0.8rem; color: ${yoyColor};">${yoy > 0 ? '+' : ''}${yoy.toFixed(1)}%</td>`;
                } else {
                    bodyHtml += `<td style="text-align: right; color: var(--text-dim);">—</td>`;
                }
            }
        }
        bodyHtml += '</tr>';
    }

    container.innerHTML = `
        <div class="table-wrapper"><table style="font-size: 0.85rem;">
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
        </table></div>`;
}

function toggleMdYear(year) {
    const el = document.getElementById(`mdYear${year}`);
    const chevron = document.getElementById(`mdChevron${year}`);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? '' : 'none';
    if (chevron) chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

async function saveMonthlyCell(index, field, value) {
    const val = parseFloat(value) || 0;
    try {
        const resp = await fetch('/api/monthly-data/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ index, field, value: val })
        });
        if (resp.ok) {
            showSaveToast(`Monthly data saved`);
            fetchMonthlyData();
        }
    } catch(e) { console.error(e); }
}

// ── Monthly Tracker Stats ──

function renderMonthlyTrackerStats(stats) {
    const kpis = document.getElementById('monthlyTrackerKpis');
    if (!kpis || !stats.summary) return;
    const s = stats.summary;
    const avgColor = s.avgMonthlyReturn >= 0 ? '#22c55e' : '#ef4444';
    const twrColor = s.timeWeightedReturn >= 0 ? '#22c55e' : '#ef4444';
    const mgColor = s.totalMarketGains >= 0 ? '#22c55e' : '#ef4444';
    kpis.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Best Month</div><div class="kpi-value positive">${formatPercent(s.bestMonth.return)}</div><div class="kpi-sub">${escapeHtml(s.bestMonth.month)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Worst Month</div><div class="kpi-value negative">${formatPercent(s.worstMonth.return)}</div><div class="kpi-sub">${escapeHtml(s.worstMonth.month)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Average Month</div><div class="kpi-value" style="color:${avgColor}">${formatPercent(s.avgMonthlyReturn)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Positive Months</div><div class="kpi-value positive">${s.positiveMonths}</div></div>
        <div class="kpi-card"><div class="kpi-label">Negative Months</div><div class="kpi-value negative">${s.negativeMonths}</div></div>
        <div class="kpi-card"><div class="kpi-label">Win Rate</div><div class="kpi-value">${s.winRate.toFixed(1)}%</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Contributions</div><div class="kpi-value">${formatMoney(s.totalContributions)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Market Gains</div><div class="kpi-value" style="color:${mgColor}">${formatMoney(s.totalMarketGains)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Dividends</div><div class="kpi-value positive">${formatMoney(s.totalDividends)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Time-Weighted Return</div><div class="kpi-value" style="color:${twrColor}">${s.timeWeightedReturn.toFixed(1)}%</div><div class="kpi-sub">Max DD: ${s.maxDrawdown.toFixed(1)}% ${s.maxDrawdownPeriod ? '(' + escapeHtml(s.maxDrawdownPeriod) + ')' : ''}</div></div>
    `;

    // Monthly returns chart
    renderMonthlyReturnsChart(stats.monthlyReturns || []);
}

let _monthlyReturnsData = [];

function renderMonthlyReturnsChart(returns) {
    const canvas = document.getElementById('monthlyReturnsChart');
    if (!canvas || !returns.length) return;

    _monthlyReturnsData = returns;
    _buildMonthlyReturnsFilters(returns);
    _drawMonthlyReturnsChart(returns);
}

function _buildMonthlyReturnsFilters(returns) {
    const container = document.getElementById('monthlyReturnsFilters');
    if (!container) return;

    const years = [...new Set(returns.map(r => r.month.split(' ').pop()))].sort();
    const filters = [{ label: 'All', value: 'all' }, { label: '12M', value: '12m' }];
    years.forEach(y => filters.push({ label: y, value: y }));

    container.innerHTML = filters.map(f =>
        `<button class="add-row-btn ${f.value === 'all' ? 'active-filter' : ''}" onclick="filterMonthlyReturns('${f.value}', this)" style="font-size: 12px; padding: 4px 10px;">${f.label}</button>`
    ).join('');
}

function filterMonthlyReturns(filter, btn) {
    const container = document.getElementById('monthlyReturnsFilters');
    if (container) container.querySelectorAll('button').forEach(b => b.classList.remove('active-filter'));
    if (btn) btn.classList.add('active-filter');

    let filtered = _monthlyReturnsData;
    if (filter === '12m') {
        filtered = _monthlyReturnsData.slice(-12);
    } else if (filter !== 'all') {
        filtered = _monthlyReturnsData.filter(r => r.month.endsWith(filter));
    }
    _drawMonthlyReturnsChart(filtered);
}

function _drawMonthlyReturnsChart(returns) {
    const canvas = document.getElementById('monthlyReturnsChart');
    if (!canvas || !returns.length) return;
    if (canvas._chart) canvas._chart.destroy();
    canvas._chart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: returns.map(r => r.month),
            datasets: [{
                label: 'Monthly Return %',
                data: returns.map(r => r.return),
                backgroundColor: returns.map(r => r.return >= 0 ? '#22c55e66' : '#ef444466'),
                borderColor: returns.map(r => r.return >= 0 ? '#22c55e' : '#ef4444'),
                borderWidth: 1,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: getChartTextColor(), maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { callback: v => parseFloat(v.toFixed(2)) + '%', color: getChartTextColor() }, grid: { color: getChartGridColor() } },
            }
        }
    });
}

// ── Dividend Calendar ──

let _calendarData = { events: [], summary: {} };
let _calMonth = new Date().getMonth();    // 0-based
let _calYear = new Date().getFullYear();
let _calView = 'grid';

async function fetchDividendCalendar() {
    try {
        const resp = await fetch('/api/dividend-calendar?months=12');
        if (!resp.ok) return;
        _calendarData = await resp.json();
        renderDividendCalendar();
    } catch (e) {
        console.error('[div-calendar]', e);
    }
}

function renderDividendCalendar() {
    const events = _calendarData.events || [];
    const summary = _calendarData.summary || {};

    // Month label
    const label = document.getElementById('calMonthLabel');
    if (label) {
        label.textContent = new Date(_calYear, _calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    // KPIs
    const monthKey = `${_calYear}-${String(_calMonth + 1).padStart(2, '0')}`;
    const monthTotal = (summary.monthlyTotals || {})[monthKey] || 0;
    const monthEvents = events.filter(e => e.date.startsWith(monthKey));
    const np = summary.nextPayout;

    const kpiGrid = document.getElementById('calendarKpis');
    if (kpiGrid) {
        const kpis = [
            { label: '💰 This Month', value: formatMoney(monthTotal), sub: `${monthEvents.length} events` },
            { label: '📅 Annual Estimate', value: formatMoney(summary.annualEstimate || 0), sub: 'Next 12 months' },
            { label: '⏭️ Next Payout', value: np ? `${escapeHtml(np.ticker)} ${formatMoney(np.income)}` : '—', sub: np ? np.date : 'None scheduled' },
            { label: '📊 Total Events', value: summary.totalEvents || 0, sub: 'Paid + Declared + Estimated' },
        ];
        kpiGrid.innerHTML = kpis.map(kpi => `
            <div class="kpi-card">
                <div class="kpi-emoji">${kpi.label.split(' ')[0]}</div>
                <div class="kpi-label">${kpi.label.split(' ').slice(1).join(' ')}</div>
                <div class="kpi-value">${kpi.value}</div>
                <div class="kpi-sub">${kpi.sub}</div>
            </div>
        `).join('');
    }

    // Render grid or list
    if (_calView === 'grid') {
        renderCalendarGrid(_calYear, _calMonth, events);
    } else {
        renderCalendarList(events);
    }

    // Monthly bar chart
    renderCalendarBarChart(summary.monthlyTotals || {});
}

function renderCalendarGrid(year, month, allEvents) {
    const container = document.getElementById('calendarContainer');
    if (!container) return;

    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const events = allEvents.filter(e => e.date.startsWith(monthKey));

    // Calendar math
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Group events by day
    const byDay = {};
    events.forEach(ev => {
        const day = parseInt(ev.date.split('-')[2], 10);
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(ev);
    });

    let html = '<div class="calendar-grid">';
    // Header row
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
        html += `<div class="calendar-header">${d}</div>`;
    });

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const dayEvents = byDay[d] || [];
        const hasEvents = dayEvents.length > 0;

        html += `<div class="calendar-day${isToday ? ' today' : ''}${hasEvents ? ' has-events' : ''}">`;
        html += `<div class="calendar-day-num">${d}</div>`;

        for (const ev of dayEvents.slice(0, 3)) {
            const statusClass = `div-${ev.status}`;
            html += `<div class="calendar-event ${statusClass}" title="${escapeHtml(ev.ticker)}: $${ev.income.toFixed(2)} (${ev.status})">
                <span class="calendar-event-ticker">${escapeHtml(ev.ticker)}</span>
                <span class="calendar-event-amount">$${ev.income.toFixed(2)}</span>
            </div>`;
        }
        if (dayEvents.length > 3) {
            html += `<div style="font-size: 10px; color: var(--text-dim); text-align: center;">+${dayEvents.length - 3} more</div>`;
        }
        html += '</div>';
    }

    // Fill remaining cells
    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remaining; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    html += '</div>';

    // Month total footer
    const monthTotal = events.reduce((s, e) => s + e.income, 0);
    if (events.length > 0) {
        html += `<div style="margin-top: 12px; display: flex; gap: 16px; font-size: 13px; color: var(--text-dim);">
            <span>Paid: <strong style="color: #22c55e;">${events.filter(e => e.status === 'paid').length}</strong></span>
            <span>Declared: <strong style="color: #3b82f6;">${events.filter(e => e.status === 'declared').length}</strong></span>
            <span>Estimated: <strong style="color: var(--text-dim);">${events.filter(e => e.status === 'estimated').length}</strong></span>
            <span style="margin-left: auto;">Month Total: <strong style="color: var(--accent);">${formatMoney(monthTotal)}</strong></span>
        </div>`;
    }

    container.innerHTML = html;
}

function renderCalendarList(allEvents) {
    const container = document.getElementById('calendarContainer');
    if (!container) return;

    const monthKey = `${_calYear}-${String(_calMonth + 1).padStart(2, '0')}`;
    const events = allEvents.filter(e => e.date.startsWith(monthKey));

    if (events.length === 0) {
        container.innerHTML = '<div class="card" style="padding: 24px; text-align: center; color: var(--text-dim);">No dividend events this month.</div>';
        return;
    }

    const statusColors = { paid: '#22c55e', declared: '#3b82f6', estimated: 'var(--text-dim)' };

    let html = '<div class="card"><div class="table-wrapper"><table style="font-size: 0.85rem;"><thead><tr>';
    html += '<th>Date</th><th>Ticker</th><th style="text-align:right;">$/Share</th><th style="text-align:right;">Shares</th><th style="text-align:right;">Income</th><th>Status</th><th>Frequency</th>';
    html += '</tr></thead><tbody>';

    for (const ev of events) {
        const color = statusColors[ev.status] || 'var(--text-dim)';
        html += `<tr>
            <td>${ev.date}</td>
            <td><strong>${escapeHtml(ev.ticker)}</strong></td>
            <td style="text-align:right;">$${ev.amount.toFixed(4)}</td>
            <td style="text-align:right;">${ev.shares}</td>
            <td style="text-align:right; font-weight:600; color: #4ade80;">${formatMoney(ev.income)}</td>
            <td><span style="color: ${color}; font-weight:600; padding: 2px 8px; background: ${color}22; border-radius: 4px; font-size: 12px;">${ev.status}</span></td>
            <td style="color: var(--text-dim);">${ev.frequency}</td>
        </tr>`;
    }

    const total = events.reduce((s, e) => s + e.income, 0);
    html += `<tr style="border-top: 2px solid var(--border); font-weight: 700;">
        <td colspan="4">Total</td>
        <td style="text-align:right; color: var(--accent);">${formatMoney(total)}</td>
        <td colspan="2"></td>
    </tr>`;

    html += '</tbody></table></div></div>';
    container.innerHTML = html;
}

function navigateMonth(delta) {
    _calMonth += delta;
    if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    renderDividendCalendar();
}

function toggleCalendarView(mode, btn) {
    _calView = mode;
    // Update toggle button active state
    if (btn) {
        btn.parentElement.querySelectorAll('.add-row-btn').forEach(b => b.classList.remove('active-filter'));
        btn.classList.add('active-filter');
    }
    renderDividendCalendar();
}

function renderCalendarBarChart(monthlyTotals) {
    const canvas = document.getElementById('calendarBarChart');
    if (!canvas) return;

    const months = Object.keys(monthlyTotals).sort();
    if (months.length === 0) return;

    const labels = months.map(m => {
        const [y, mo] = m.split('-');
        return new Date(y, parseInt(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });
    const values = months.map(m => monthlyTotals[m]);
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    if (charts.calendarBar) charts.calendarBar.destroy();
    charts.calendarBar = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Monthly Dividends',
                data: values,
                backgroundColor: months.map(m => m <= currentMonth ? '#22c55e99' : '#3b82f666'),
                borderColor: months.map(m => m <= currentMonth ? '#22c55e' : '#3b82f6'),
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => '$' + ctx.raw.toFixed(2) } }
            },
            scales: {
                x: { ticks: { color: getChartTextColor() }, grid: { display: false } },
                y: { ticks: { color: getChartTextColor(), callback: v => '$' + v }, grid: { color: getChartGridColor() } }
            }
        }
    });
}

// ── Annual Data (Computed from Monthly + Dividend Log) ──

async function fetchAnnualData() {
    try {
        const [data, bmResp] = await Promise.all([
            fetch('/api/annual-data').then(r => r.json()),
            fetch('/api/portfolio-benchmark').then(r => r.json()),
        ]);
        const bmYears = bmResp.benchmark || {};
        renderAnnualData(data.annualData || [], bmYears);
        if (bmYears.summary) renderBenchmarkKpis(bmYears.summary);
        if (bmYears.years) renderBenchmarkChart(bmYears.years);
    } catch(e) { console.error(e); }
}

function renderAnnualData(items, bmData) {
    const tbody = document.getElementById('annualBody');
    if (!tbody) return;
    // Build alpha lookup from benchmark data
    const alphaMap = {};
    if (bmData && bmData.years) {
        bmData.years.forEach(y => { alphaMap[y.year] = y.alpha; });
    }
    tbody.innerHTML = items.filter(a => a.portfolioValue > 0 || a.annualContributions > 0 || a.dividendIncome > 0).map(a => {
        const retClass = (a.totalReturnPct || 0) >= 0 ? 'positive' : 'negative';
        const alpha = alphaMap[String(a.year)];
        const alphaStr = alpha !== undefined ? `<span style="color:${alpha >= 0 ? '#22c55e' : '#ef4444'}; font-weight:600;">${alpha >= 0 ? '+' : ''}${alpha.toFixed(2)}%</span>` : '—';
        return `<tr>
            <td><strong>${a.year}</strong></td>
            <td style="text-align:right;">${formatMoney(a.portfolioValue)}</td>
            <td style="text-align:right;">${formatMoney(a.annualContributions)}</td>
            <td style="text-align:right; color: #4ade80;">${formatMoney(a.dividendIncome)}</td>
            <td style="text-align:right;" class="${retClass}">${formatMoney(a.totalReturn || 0)}</td>
            <td style="text-align:right;" class="${retClass}">${a.totalReturnPct ? (a.totalReturnPct * 100).toFixed(2) + '%' : '—'}</td>
            <td style="text-align:right;">${a.sp500YieldPct ? (a.sp500YieldPct * 100).toFixed(1) + '%' : '—'}</td>
            <td style="text-align:right;">${alphaStr}</td>
            <td style="text-align:right;">${a.dividendYield ? (a.dividendYield * 100).toFixed(2) + '%' : '—'}</td>
        </tr>`;
    }).join('');
}
