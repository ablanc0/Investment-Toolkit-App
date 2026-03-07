// ── Performance Attribution + Benchmark Tabs ──

async function fetchAttribution() {
    try {
        const resp = await fetch('/api/performance-attribution');
        const data = await resp.json();
        const attr = data.attribution;
        renderAttributionTable(attr.byCategory, 'categoryAttributionTable', 'categoryAttrChart');
        renderAttributionTable(attr.bySector, 'sectorAttributionTable', 'sectorAttrChart');
    } catch (e) {
        console.error('Error loading attribution:', e);
    }
}

function renderAttributionTable(items, tableId, chartId) {
    const el = document.getElementById(tableId);
    if (!el) return;

    const colors = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#64748b', '#d97706'];

    let html = '<table style="width:100%; font-size:0.85rem;"><thead><tr><th>Name</th><th style="text-align:right;">Invested</th><th style="text-align:right;">Market Value</th><th style="text-align:right;">Return $</th><th style="text-align:right;">Return %</th><th style="text-align:right;">Weight</th></tr></thead><tbody>';
    items.forEach(item => {
        const retColor = item.returnVal >= 0 ? '#22c55e' : '#ef4444';
        html += `<tr>
            <td><strong>${item.name}</strong></td>
            <td style="text-align:right;">${formatMoney(item.invested)}</td>
            <td style="text-align:right;">${formatMoney(item.marketValue)}</td>
            <td style="text-align:right; color:${retColor}; font-weight:600;">${formatMoney(item.returnVal)}</td>
            <td style="text-align:right; color:${retColor};">${formatPercent(item.returnPct)}</td>
            <td style="text-align:right;">${item.weight.toFixed(1)}%</td>
        </tr>`;
    });
    html += '</tbody></table>';
    el.innerHTML = html;

    // Chart
    const canvas = document.getElementById(chartId);
    if (canvas && items.length > 0) {
        if (canvas._chart) canvas._chart.destroy();
        canvas._chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: items.map(i => i.name),
                datasets: [{
                    label: 'Return %',
                    data: items.map(i => i.returnPct),
                    backgroundColor: items.map((_, idx) => colors[idx % colors.length] + '88'),
                    borderColor: items.map((_, idx) => colors[idx % colors.length]),
                    borderWidth: 1,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { callback: v => v + '%', color: '#9ca3af' }, grid: { color: '#ffffff10' } },
                    y: { ticks: { color: '#9ca3af' }, grid: { display: false } },
                }
            }
        });
    }
}

// ── Benchmark ──

async function fetchBenchmark() {
    try {
        const resp = await fetch('/api/portfolio-benchmark');
        const data = await resp.json();
        const bm = data.benchmark;
        renderBenchmarkKpis(bm.summary);
        renderBenchmarkTable(bm.years);
        renderBenchmarkChart(bm.years);
    } catch (e) {
        console.error('Error loading benchmark:', e);
    }
}

function renderBenchmarkKpis(s) {
    const el = document.getElementById('benchmarkKpis');
    if (!el || !s) return;
    const alphaColor = s.cumulativeAlpha >= 0 ? '#22c55e' : '#ef4444';
    el.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Cumulative Alpha</div><div class="kpi-value" style="color:${alphaColor}">${s.cumulativeAlpha >= 0 ? '+' : ''}${s.cumulativeAlpha.toFixed(2)}%</div><div class="kpi-sub">${s.yearsTracked} years tracked</div></div>
        <div class="kpi-card"><div class="kpi-label">Avg. Annual Alpha</div><div class="kpi-value" style="color:${alphaColor}">${s.avgAlpha >= 0 ? '+' : ''}${s.avgAlpha.toFixed(2)}%</div><div class="kpi-sub">vs S&P 500</div></div>
    `;
}

function renderBenchmarkTable(years) {
    const tbody = document.getElementById('benchmarkBody');
    if (!tbody) return;
    tbody.innerHTML = years.map(y => {
        const portColor = y.portfolioReturn >= 0 ? '#22c55e' : '#ef4444';
        const spColor = y.sp500Return >= 0 ? '#22c55e' : '#ef4444';
        const alphaColor = y.alpha >= 0 ? '#22c55e' : '#ef4444';
        const yieldAdvColor = y.yieldAdvantage >= 0 ? '#22c55e' : '#ef4444';
        return `<tr>
            <td><strong>${y.year}</strong></td>
            <td style="text-align:right; color:${portColor};">${formatPercent(y.portfolioReturn)}</td>
            <td style="text-align:right; color:${spColor};">${formatPercent(y.sp500Return)}</td>
            <td style="text-align:right; color:${alphaColor}; font-weight:600;">${y.alpha >= 0 ? '+' : ''}${formatPercent(y.alpha)}</td>
            <td style="text-align:right;">${formatPercent(y.portfolioDivYield)}</td>
            <td style="text-align:right;">${formatPercent(y.sp500DivYield)}</td>
            <td style="text-align:right; color:${yieldAdvColor};">${y.yieldAdvantage >= 0 ? '+' : ''}${formatPercent(y.yieldAdvantage)}</td>
        </tr>`;
    }).join('');
}

function renderBenchmarkChart(years) {
    const canvas = document.getElementById('benchmarkChart');
    if (!canvas || !years.length) return;
    if (canvas._chart) canvas._chart.destroy();
    canvas._chart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: years.map(y => y.year),
            datasets: [
                { label: 'Portfolio', data: years.map(y => y.portfolioReturn), backgroundColor: '#3b82f688', borderColor: '#3b82f6', borderWidth: 1 },
                { label: 'S&P 500', data: years.map(y => y.sp500Return), backgroundColor: '#6b728088', borderColor: '#6b7280', borderWidth: 1 },
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#9ca3af' } } },
            scales: {
                x: { ticks: { color: '#9ca3af' }, grid: { color: '#ffffff10' } },
                y: { ticks: { callback: v => v + '%', color: '#9ca3af' }, grid: { color: '#ffffff10' } },
            }
        }
    });
}
