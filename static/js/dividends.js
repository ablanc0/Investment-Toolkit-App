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
                        <strong>${p.ticker}</strong>
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
        .sort((a, b) => (b.divYield || 0) - (a.divYield || 0))
        .slice(0, 10);

    if (withYield.length === 0) return;

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
        .sort((a, b) => (b.annualDivIncome || 0) - (a.annualDivIncome || 0))
        .slice(0, 10);

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
                        ${logTickers.map(t => `<th style="min-width:60px; text-align:right;">${t === 'cashInterest' ? 'Cash Int.' : t}</th>`).join('')}
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
                        onblur="this.style.borderColor='transparent'; this.style.background='transparent'; saveDividendCell(${year}, '${entry.month}', '${t}', this.value)"
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
                    </tr></thead><tbody>`;

        for (const entry of entries) {
            const shortMonth = entry.month.split(' ')[0].substring(0, 3);
            const hasVal = entry.portfolioValue > 0 || entry.contributions > 0;
            const rowStyle = hasVal ? '' : 'opacity: 0.35;';
            const retPct = entry.totalReturnPct || 0;
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
    kpis.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Best Month</div><div class="kpi-value positive">${formatPercent(s.bestMonth.return)}</div><div class="kpi-sub">${s.bestMonth.month}</div></div>
        <div class="kpi-card"><div class="kpi-label">Worst Month</div><div class="kpi-value negative">${formatPercent(s.worstMonth.return)}</div><div class="kpi-sub">${s.worstMonth.month}</div></div>
        <div class="kpi-card"><div class="kpi-label">Win Rate</div><div class="kpi-value">${s.winRate.toFixed(0)}%</div><div class="kpi-sub">${s.positiveMonths} positive / ${s.negativeMonths} negative</div></div>
        <div class="kpi-card"><div class="kpi-label">Max Drawdown</div><div class="kpi-value negative">${s.maxDrawdown.toFixed(1)}%</div><div class="kpi-sub">${s.maxDrawdownPeriod || '-'}</div></div>
        <div class="kpi-card"><div class="kpi-label">Time-Weighted Return</div><div class="kpi-value" style="color:${s.timeWeightedReturn >= 0 ? '#22c55e' : '#ef4444'}">${s.timeWeightedReturn.toFixed(1)}%</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Contributions</div><div class="kpi-value">${formatMoney(s.totalContributions)}</div></div>
    `;

    // Monthly returns chart
    renderMonthlyReturnsChart(stats.monthlyReturns || []);
}

function renderMonthlyReturnsChart(returns) {
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
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#9ca3af', maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { callback: v => v + '%', color: '#9ca3af' }, grid: { color: '#ffffff10' } },
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
