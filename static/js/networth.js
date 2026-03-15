// ── Net Worth Tab ────────────────────────────────────────────────────
// Editable asset/liability grid, growth tracking, charts.

let netWorthData = null;

const NW_GROUP_LABELS = {
    bankAccounts: '🏦 Bank Accounts',
    investments: '📈 Investments',
    property: '🏠 Property',
    otherAssets: '📦 Other Assets',
    debt: '💳 Debt',
    otherLiabilities: '📋 Other Liabilities',
};
const NW_ASSET_GROUPS = ['bankAccounts', 'investments', 'property', 'otherAssets'];
const NW_LIAB_GROUPS = ['debt', 'otherLiabilities'];

const NW_MONTH_LABELS = {
    start: 'Start', january: 'Jan', february: 'Feb', march: 'Mar',
    april: 'Apr', may: 'May', june: 'Jun', july: 'Jul',
    august: 'Aug', september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec'
};

const NW_MONTH_KEYS_FULL = [
    'start', 'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];


// ── Data Fetching ────────────────────────────────────────────────────

async function fetchNetWorthData() {
    try {
        const res = await fetch('/api/net-worth');
        const json = await res.json();
        netWorthData = json.netWorth;
        if (!netWorthData || !netWorthData.snapshots || netWorthData.snapshots.length === 0) {
            document.getElementById('netWorthKpis').innerHTML =
                '<div class="card" style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-dim);">' +
                'No net worth data yet. Import your budget Excel to load net worth snapshots.</div>';
            return;
        }
        renderNetWorth();
    } catch (e) {
        console.error('Net worth fetch error:', e);
    }
}


// ── Render ───────────────────────────────────────────────────────────

function renderNetWorth() {
    const snaps = netWorthData.snapshots;
    const latest = snaps[snaps.length - 1];
    const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;

    // KPIs (6)
    const nominalChange = prev ? latest.netWorth - prev.netWorth : 0;
    renderKpiGrid('netWorthKpis', [
        { label: '💰 Net Worth', value: formatMoney(latest.netWorth), sub: NW_MONTH_LABELS[latest.month] + ' ' + latest.year },
        { label: '📈 Monthly Growth', value: formatPercent(latest.monthlyGrowth), sub: prev ? 'vs ' + NW_MONTH_LABELS[prev.month] : '—', positive: latest.monthlyGrowth > 0 },
        { label: '📊 Cumulative Growth', value: formatPercent(latest.cumulativeGrowth), sub: 'Since start', positive: latest.cumulativeGrowth > 0 },
        { label: '🏦 Total Assets', value: formatMoney(latest.totalAssets), sub: 'All accounts' },
        { label: '💳 Total Liabilities', value: formatMoney(latest.totalLiabilities), sub: 'Outstanding debt' },
        { label: '📉 Nominal Change', value: formatMoney(nominalChange), sub: prev ? 'vs ' + NW_MONTH_LABELS[prev.month] : '—', positive: nominalChange >= 0 },
    ]);

    renderNWEditableGrid();
    renderNWGrowthTable(snaps);
    renderNWContributors(latest, prev);
    renderNWCharts(snaps);
}


// ── Editable Asset/Liability Grid ───────────────────────────────────

function renderNWEditableGrid() {
    const container = document.getElementById('nwEditableGrid');
    if (!container) return;
    const snaps = netWorthData.snapshots;
    const snapMonths = snaps.map(s => s.month);

    // Month headers
    const monthHeaders = snapMonths.map(m =>
        `<th style="padding:6px 8px;font-size:10px;color:var(--text-dim);text-align:center;min-width:65px;">${NW_MONTH_LABELS[m] || m}</th>`
    ).join('');

    // Asset section
    let assetHtml = '';
    for (const group of NW_ASSET_GROUPS) {
        const items = netWorthData.assets.filter(a => a.group === group);
        if (items.length === 0) continue;

        const label = NW_GROUP_LABELS[group] || group;
        assetHtml += `<tr style="background:var(--card-hover);"><td colspan="${snapMonths.length + 2}" style="padding:6px 8px;font-size:12px;font-weight:600;color:var(--text);">${label}
            <button onclick="nwAddItem('asset','${group}')" class="add-row-btn" style="font-size:10px;padding:2px 6px;margin-left:8px;">+ Add</button>
        </td></tr>`;

        for (const item of items) {
            const cells = snaps.map(snap => {
                const val = (snap.assets || {})[item.name] || 0;
                return `<td style="padding:4px 6px;font-size:11px;text-align:center;">
                    <span class="editable-cell" style="cursor:pointer;padding:1px 4px;border-radius:3px;" onclick="nwEditCell(this,'${snap.month}','asset','${escapeHtml(item.name)}',${val})">${formatMoney(val)}</span>
                </td>`;
            }).join('');

            const total = snaps.reduce((s, snap) => s + ((snap.assets || {})[item.name] || 0), 0);
            assetHtml += `<tr>
                <td style="padding:4px 8px;font-size:11px;white-space:nowrap;position:sticky;left:0;background:var(--card);z-index:1;">${escapeHtml(item.name)}
                    <button onclick="nwRemoveItem('asset','${escapeHtml(item.name)}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:9px;padding:0 2px;margin-left:4px;" title="Remove">✕</button>
                </td>
                ${cells}
                <td style="padding:4px 8px;font-size:11px;text-align:center;font-weight:600;">${formatMoney(snaps[snaps.length-1]?.assets[item.name] || 0)}</td>
            </tr>`;
        }

        // Group subtotal
        const groupCells = snaps.map(snap => {
            const total = items.reduce((s, i) => s + ((snap.assets || {})[i.name] || 0), 0);
            return `<td style="padding:4px 6px;font-size:11px;text-align:center;font-weight:600;border-top:1px solid var(--border);">${formatMoney(total)}</td>`;
        }).join('');
        const latestGroupTotal = items.reduce((s, i) => s + ((snaps[snaps.length-1]?.assets || {})[i.name] || 0), 0);
        assetHtml += `<tr>
            <td style="padding:4px 8px;font-size:11px;font-weight:600;position:sticky;left:0;background:var(--card);z-index:1;border-top:1px solid var(--border);">Subtotal</td>
            ${groupCells}
            <td style="padding:4px 8px;font-size:11px;text-align:center;font-weight:600;border-top:1px solid var(--border);">${formatMoney(latestGroupTotal)}</td>
        </tr>`;
    }

    // Liability section
    let liabHtml = '';
    for (const group of NW_LIAB_GROUPS) {
        const items = netWorthData.liabilities.filter(l => l.group === group);
        if (items.length === 0) continue;

        const label = NW_GROUP_LABELS[group] || group;
        liabHtml += `<tr style="background:var(--card-hover);"><td colspan="${snapMonths.length + 2}" style="padding:6px 8px;font-size:12px;font-weight:600;color:var(--text);">${label}
            <button onclick="nwAddItem('liability','${group}')" class="add-row-btn" style="font-size:10px;padding:2px 6px;margin-left:8px;">+ Add</button>
        </td></tr>`;

        for (const item of items) {
            const cells = snaps.map(snap => {
                const val = (snap.liabilities || {})[item.name] || 0;
                return `<td style="padding:4px 6px;font-size:11px;text-align:center;">
                    <span class="editable-cell" style="cursor:pointer;padding:1px 4px;border-radius:3px;" onclick="nwEditCell(this,'${snap.month}','liability','${escapeHtml(item.name)}',${val})">${formatMoney(val)}</span>
                </td>`;
            }).join('');

            liabHtml += `<tr>
                <td style="padding:4px 8px;font-size:11px;white-space:nowrap;position:sticky;left:0;background:var(--card);z-index:1;">${escapeHtml(item.name)}
                    <button onclick="nwRemoveItem('liability','${escapeHtml(item.name)}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:9px;padding:0 2px;margin-left:4px;" title="Remove">✕</button>
                </td>
                ${cells}
                <td style="padding:4px 8px;font-size:11px;text-align:center;font-weight:600;">${formatMoney(snaps[snaps.length-1]?.liabilities[item.name] || 0)}</td>
            </tr>`;
        }

        // Group subtotal
        const groupCells = snaps.map(snap => {
            const total = items.reduce((s, i) => s + ((snap.liabilities || {})[i.name] || 0), 0);
            return `<td style="padding:4px 6px;font-size:11px;text-align:center;font-weight:600;border-top:1px solid var(--border);">${formatMoney(total)}</td>`;
        }).join('');
        const latestGroupTotal = items.reduce((s, i) => s + ((snaps[snaps.length-1]?.liabilities || {})[i.name] || 0), 0);
        liabHtml += `<tr>
            <td style="padding:4px 8px;font-size:11px;font-weight:600;position:sticky;left:0;background:var(--card);z-index:1;border-top:1px solid var(--border);">Subtotal</td>
            ${groupCells}
            <td style="padding:4px 8px;font-size:11px;text-align:center;font-weight:600;border-top:1px solid var(--border);">${formatMoney(latestGroupTotal)}</td>
        </tr>`;
    }

    container.innerHTML = `<div class="table-wrapper"><table style="width:100%;border-collapse:collapse;">
        <thead><tr>
            <th style="padding:6px 8px;font-size:10px;color:var(--text-dim);text-align:left;position:sticky;left:0;background:var(--card);z-index:2;">Item</th>
            ${monthHeaders}
            <th style="padding:6px 8px;font-size:10px;color:var(--text-dim);text-align:center;">Latest</th>
        </tr></thead>
        <tbody>
            <tr style="background:var(--accent);"><td colspan="${snapMonths.length + 2}" style="padding:6px 8px;font-size:12px;font-weight:700;color:white;">ASSETS</td></tr>
            ${assetHtml}
            <tr style="background:var(--accent);"><td colspan="${snapMonths.length + 2}" style="padding:6px 8px;font-size:12px;font-weight:700;color:white;">LIABILITIES</td></tr>
            ${liabHtml}
        </tbody>
    </table></div>`;
}


// ── Inline Cell Editing ─────────────────────────────────────────────

function nwEditCell(td, month, type, name, currentVal) {
    if (td.querySelector('input')) return;
    const originalHTML = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentVal;
    input.style.cssText = 'width:65px;padding:2px 4px;background:var(--card-hover);border:1px solid var(--accent);border-radius:4px;color:var(--text);font-size:11px;text-align:center;';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const save = async () => {
        const newVal = parseFloat(input.value);
        if (isNaN(newVal) || newVal === currentVal) { td.innerHTML = originalHTML; return; }
        try {
            const res = await fetch('/api/net-worth/snapshot/cell', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month, type, name, value: newVal })
            });
            if ((await res.json()).ok) {
                showSaveToast('Value updated');
                await fetchNetWorthData();
            }
        } catch (e) { td.innerHTML = originalHTML; }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.removeEventListener('blur', save); td.innerHTML = originalHTML; }
    });
}


// ── Add/Remove Items ────────────────────────────────────────────────

async function nwAddItem(type, group) {
    const name = prompt(`New ${type} name:`);
    if (!name || !name.trim()) return;
    try {
        const res = await fetch('/api/net-worth/asset', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, name: name.trim(), group, action: 'add' })
        });
        const json = await res.json();
        if (json.ok) {
            showSaveToast(`${name.trim()} added`);
            await fetchNetWorthData();
        } else {
            showAlert(json.error || 'Failed to add item', 'error');
        }
    } catch (e) { console.error(e); }
}

async function nwRemoveItem(type, name) {
    try {
        const res = await fetch('/api/net-worth/asset', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, name, action: 'remove' })
        });
        if ((await res.json()).ok) {
            showSaveToast(`${name} removed`);
            await fetchNetWorthData();
        }
    } catch (e) { console.error(e); }
}


// ── Growth Table ────────────────────────────────────────────────────

function renderNWGrowthTable(snaps) {
    const tbody = document.querySelector('#netWorthTable tbody');
    if (!tbody) return;
    tbody.innerHTML = snaps.map(s => {
        const growthColor = s.monthlyGrowth > 0 ? '#10b981' : s.monthlyGrowth < 0 ? '#ef4444' : 'var(--text-dim)';
        const cumColor = s.cumulativeGrowth > 0 ? '#10b981' : s.cumulativeGrowth < 0 ? '#ef4444' : 'var(--text-dim)';
        return `<tr>
            <td>${NW_MONTH_LABELS[s.month] || s.month}</td>
            <td>${formatMoney(s.totalAssets)}</td>
            <td>${formatMoney(s.totalLiabilities)}</td>
            <td style="font-weight:600;">${formatMoney(s.netWorth)}</td>
            <td style="color:${growthColor};">${s.month === 'start' ? '—' : (s.monthlyGrowth > 0 ? '+' : '') + formatPercent(s.monthlyGrowth)}</td>
            <td style="color:${cumColor};">${s.month === 'start' ? '—' : (s.cumulativeGrowth > 0 ? '+' : '') + formatPercent(s.cumulativeGrowth)}</td>
        </tr>`;
    }).join('');
}


// ── Top/Bottom Contributors ─────────────────────────────────────────

function renderNWContributors(latest, prev) {
    const container = document.getElementById('nwContributors');
    if (!container || !prev) { if (container) container.innerHTML = ''; return; }

    const changes = [];
    for (const [name, val] of Object.entries(latest.assets || {})) {
        const prevVal = (prev.assets || {})[name] || 0;
        const diff = val - prevVal;
        if (diff !== 0) changes.push({ name, diff, type: 'asset' });
    }
    for (const [name, val] of Object.entries(latest.liabilities || {})) {
        const prevVal = (prev.liabilities || {})[name] || 0;
        const diff = -(val - prevVal); // Liability decrease is positive for net worth
        if (diff !== 0) changes.push({ name: name + ' (debt)', diff, type: 'liability' });
    }
    changes.sort((a, b) => b.diff - a.diff);

    const topPositive = changes.filter(c => c.diff > 0).slice(0, 5);
    const topNegative = changes.filter(c => c.diff < 0).slice(-5).reverse();

    const renderList = (items, label) => {
        if (items.length === 0) return `<p style="color:var(--text-dim);font-size:12px;">No changes</p>`;
        return items.map(c =>
            `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;">
                <span>${escapeHtml(c.name)}</span>
                <span style="color:${c.diff >= 0 ? '#10b981' : '#ef4444'};font-weight:500;">${c.diff > 0 ? '+' : ''}${formatMoney(c.diff)}</span>
            </div>`
        ).join('');
    };

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
                <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;">📈 Top Gainers</div>
                ${renderList(topPositive)}
            </div>
            <div>
                <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;">📉 Biggest Declines</div>
                ${renderList(topNegative)}
            </div>
        </div>
    `;
}


// ── Charts ──────────────────────────────────────────────────────────

function renderNWCharts(snaps) {
    const textColor = getChartTextColor();
    const gridColor = getChartGridColor();
    const labels = snaps.map(s => NW_MONTH_LABELS[s.month] || s.month);
    const pieColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316'];

    // 1. Net worth line chart
    const ctx1 = document.getElementById('netWorthLineChart');
    if (ctx1) {
        if (charts.netWorthLine) charts.netWorthLine.destroy();
        charts.netWorthLine = new Chart(ctx1, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Net Worth',
                    data: snaps.map(s => s.netWorth),
                    borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)',
                    fill: true, tension: 0.3, pointRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor } } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: gridColor } }
                }
            }
        });
    }

    // 2. Assets vs Liabilities stacked bar
    const ctx2 = document.getElementById('netWorthBarChart');
    if (ctx2) {
        if (charts.netWorthBar) charts.netWorthBar.destroy();
        charts.netWorthBar = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Assets', data: snaps.map(s => s.totalAssets), backgroundColor: '#3b82f6' },
                    { label: 'Liabilities', data: snaps.map(s => s.totalLiabilities), backgroundColor: '#ef4444' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor } } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: gridColor } }
                }
            }
        });
    }

    // 3. Asset distribution doughnut
    const latest = snaps[snaps.length - 1];
    const assetEntries = Object.entries(latest.assets || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

    const ctx3 = document.getElementById('netWorthPieChart');
    if (ctx3) {
        if (charts.netWorthPie) charts.netWorthPie.destroy();
        charts.netWorthPie = new Chart(ctx3, {
            type: 'doughnut',
            data: {
                labels: assetEntries.map(([name]) => name),
                datasets: [{ data: assetEntries.map(([, v]) => v), backgroundColor: pieColors }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 11 } } } }
            }
        });
    }

    // 4. Top contributors bar
    if (snaps.length >= 2) {
        const prev = snaps[snaps.length - 2];
        const changes = [];
        for (const [name, val] of Object.entries(latest.assets || {})) {
            const prevVal = (prev.assets || {})[name] || 0;
            if (val - prevVal !== 0) changes.push({ name, diff: val - prevVal });
        }
        for (const [name, val] of Object.entries(latest.liabilities || {})) {
            const prevVal = (prev.liabilities || {})[name] || 0;
            if (val - prevVal !== 0) changes.push({ name: name + ' (debt)', diff: -(val - prevVal) });
        }
        changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        const topChanges = changes.slice(0, 8);

        const ctx4 = document.getElementById('netWorthContribChart');
        if (ctx4) {
            if (charts.netWorthContrib) charts.netWorthContrib.destroy();
            charts.netWorthContrib = new Chart(ctx4, {
                type: 'bar',
                data: {
                    labels: topChanges.map(c => c.name),
                    datasets: [{
                        label: 'Change',
                        data: topChanges.map(c => c.diff),
                        backgroundColor: topChanges.map(c => c.diff >= 0 ? '#10b981' : '#ef4444')
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: textColor, callback: v => '$' + v.toLocaleString() }, grid: { color: gridColor } },
                        y: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } }
                    }
                }
            });
        }
    }

    // 5. Assets only bar (over time)
    const ctx5 = document.getElementById('netWorthAssetsChart');
    if (ctx5) {
        if (charts.netWorthAssets) charts.netWorthAssets.destroy();
        charts.netWorthAssets = new Chart(ctx5, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Total Assets', data: snaps.map(s => s.totalAssets), backgroundColor: '#3b82f6' }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: gridColor } }
                }
            }
        });
    }

    // 6. Liabilities only bar (over time)
    const ctx6 = document.getElementById('netWorthLiabChart');
    if (ctx6) {
        if (charts.netWorthLiab) charts.netWorthLiab.destroy();
        charts.netWorthLiab = new Chart(ctx6, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Total Liabilities', data: snaps.map(s => s.totalLiabilities), backgroundColor: '#ef4444' }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: gridColor } }
                }
            }
        });
    }
}
