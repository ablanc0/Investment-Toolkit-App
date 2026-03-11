// ── Dashboard: Screening + Notes & Goals ──

function populateScreening() {
    if (!portfolioData || !watchlistData) return;

    const positions = portfolioData.positions || [];
    const watchlist = watchlistData.watchlist || [];
    const sb = _signalThresholds?.avgCost?.strongBuy ?? -15;
    const buy = _signalThresholds?.avgCost?.buy ?? -5;
    const oc = _signalThresholds?.avgCost?.overcost ?? 15;
    const filter = document.getElementById('portfolioSignalFilter')?.value || 'all';

    // Compute signals for portfolio positions — ETFs/Funds get no signal
    const signaled = positions.map(p => {
        const isStock = (p.secType || 'Stocks') === 'Stocks';
        let signal = null;
        if (isStock) {
            const ret = p.returnPercent || 0;
            if (ret <= sb) signal = 'Strong Buy';
            else if (ret <= buy) signal = 'Buy';
            else if (ret >= oc) signal = 'Overcost';
            else signal = 'Hold';
        }
        return { ...p, signal, isStock };
    });

    // Filter (only applies to stocks with signals)
    let filtered = signaled;
    if (filter !== 'all') {
        const filterMap = { 'strong-buy': 'Strong Buy', 'buy': 'Buy', 'overcost': 'Overcost' };
        filtered = signaled.filter(p => p.signal === filterMap[filter]);
    }

    // Sort: Strong Buy first, then Buy, then Overcost, then Hold, then N/A (ETFs) last
    const signalOrder = { 'Strong Buy': 0, 'Buy': 1, 'Overcost': 2, 'Hold': 3 };
    filtered.sort((a, b) => (signalOrder[a.signal] ?? 9) - (signalOrder[b.signal] ?? 9));

    // Portfolio signals table
    document.getElementById('portfolioSignalsBody').innerHTML = filtered.length > 0 ?
        filtered.map(p => `
            <tr>
                <td>${tickerLogo(p.ticker)}<strong>${escapeHtml(p.ticker)}</strong></td>
                <td>${formatMoney(p.price)}</td>
                <td>${formatMoney(p.avgCost)}</td>
                <td class="${(p.returnPercent || 0) >= 0 ? 'positive' : 'negative'}">${formatPercent(p.returnPercent)}</td>
                <td>${p.isStock ? getSignalBadge(p.signal) : '<span style="color: var(--text-dim);">—</span>'}</td>
                <td>${p.invtScore ? '<span style="color:' + _invtScoreColor(p.invtScore) + ';font-weight:600">' + Number(p.invtScore).toFixed(1) + '</span>' : '—'}</td>
                <td>${escapeHtml(p.category || '—')}</td>
            </tr>
        `).join('') :
        '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:24px;">No signals matching filter</td></tr>';

    // Portfolio panel summary
    const stocks = signaled.filter(p => p.isStock);
    const sbCount = stocks.filter(p => p.signal === 'Strong Buy').length;
    const buyCount = stocks.filter(p => p.signal === 'Buy').length;
    const ocCount = stocks.filter(p => p.signal === 'Overcost').length;
    const holdCount = stocks.filter(p => p.signal === 'Hold').length;
    const etfCount = signaled.filter(p => !p.isStock).length;
    document.getElementById('portfolioSignalsSummary').innerHTML = [
        sbCount > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#4ade8020;color:#4ade80;">${sbCount} Strong Buy</span>` : '',
        buyCount > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#22d3ee20;color:#22d3ee;">${buyCount} Buy</span>` : '',
        ocCount > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#f8717120;color:#f87171;">${ocCount} Overcost</span>` : '',
        holdCount > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#6b728020;color:#9ca3af;">${holdCount} Hold</span>` : '',
        etfCount > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#6b728020;color:#9ca3af;">${etfCount} ETF/Fund</span>` : '',
    ].filter(Boolean).join('');

    // Watchlist opportunities — use server-computed IV signal
    const wlSignaled = watchlist.map(item => {
        const hasIV = item.intrinsicValue && item.intrinsicValue > 0;
        return { ...item, signal: item.signal || null, hasIV };
    }).sort((a, b) => (a.distance || 0) - (b.distance || 0));

    document.getElementById('watchlistSignalsBody').innerHTML = wlSignaled.length > 0 ?
        wlSignaled.map(item => `
            <tr>
                <td>${tickerLogo(item.ticker)}<strong>${escapeHtml(item.ticker)}</strong></td>
                <td>${formatMoney(item.price)}</td>
                <td>${item.hasIV ? getSignalBadge(item.signal) : '<span style="color: var(--text-dim);">—</span>'}</td>
                <td>${item.invtScore ? '<span style="color:' + _invtScoreColor(item.invtScore) + ';font-weight:600">' + Number(item.invtScore).toFixed(1) + '</span>' : '—'}</td>
                <td>${item.divYield ? item.divYield.toFixed(2) + '%' : '—'}</td>
                <td>${escapeHtml(item.sector || '—')}</td>
                <td>${escapeHtml(item.priority || 'Low')}</td>
            </tr>
        `).join('') :
        '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:24px;">No watchlist items</td></tr>';

    // Watchlist panel summary
    const wlWithIV = wlSignaled.filter(w => w.hasIV);
    const wlSB = wlWithIV.filter(w => w.signal === 'Strong Buy').length;
    const wlBuy = wlWithIV.filter(w => w.signal === 'Buy').length;
    const wlExp = wlWithIV.filter(w => w.signal === 'Expensive' || w.signal === 'Overrated').length;
    const wlNoIV = wlSignaled.filter(w => !w.hasIV).length;
    document.getElementById('watchlistSignalsSummary').innerHTML = [
        wlSB > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#4ade8020;color:#4ade80;">${wlSB} Strong Buy</span>` : '',
        wlBuy > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#22d3ee20;color:#22d3ee;">${wlBuy} Buy</span>` : '',
        wlExp > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#f59e0b20;color:#f59e0b;">${wlExp} Expensive</span>` : '',
        `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#6b728020;color:#9ca3af;">${watchlist.length} Total</span>`,
        wlNoIV > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#6b728020;color:#9ca3af;">${wlNoIV} No IV</span>` : '',
    ].filter(Boolean).join('');
}

// ── Notes & Goals ──

function populateNotesGoals() {
    renderStrategyNotes();
    renderGoalTracker();
    renderIncomeGoals();
}

function renderStrategyNotes() {
    const container = document.getElementById('strategyNotesContainer');
    if (!container) return;
    const strategy = portfolioData?.strategy || [];

    if (strategy.length === 0) {
        container.innerHTML = '<p style="color: var(--text-dim); font-style: italic;">No strategy notes yet. Click "Add Note" to create one.</p>';
        return;
    }

    container.innerHTML = strategy.map((note, i) => `
        <div class="strategy-note" style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; margin-bottom: 8px; background: var(--card-hover); border-radius: 8px; border-left: 3px solid var(--accent);">
            <p class="note-text" style="flex: 1; margin: 0; line-height: 1.6; cursor: pointer;" title="Click to edit" onclick="editStrategyNote(this, ${i})">${escapeHtml(note)}</p>
            <button class="delete-row-btn" onclick="deleteStrategyNote(${i})" title="Delete note" style="flex-shrink: 0;">✕</button>
        </div>
    `).join('');
}

function editStrategyNote(element, index) {
    if (element.querySelector('textarea')) return;
    const original = element.textContent;
    const textarea = document.createElement('textarea');
    textarea.value = original;
    textarea.style.cssText = 'width: 100%; min-height: 60px; padding: 8px; background: var(--bg); border: 2px solid var(--accent); border-radius: 6px; color: var(--text); font-size: 14px; font-family: Inter, sans-serif; resize: vertical; line-height: 1.6;';
    element.innerHTML = '';
    element.appendChild(textarea);
    textarea.focus();

    const save = async () => {
        const newText = textarea.value.trim();
        if (!newText || newText === original) {
            element.innerHTML = original;
            element.onclick = () => editStrategyNote(element, index);
            return;
        }
        try {
            const resp = await fetch('/api/strategy/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ index, note: newText })
            });
            if (resp.ok) {
                showSaveToast('Note updated');
                portfolioData.strategy[index] = newText;
                element.innerHTML = newText;
                element.onclick = () => editStrategyNote(element, index);
            } else {
                element.innerHTML = original;
                element.onclick = () => editStrategyNote(element, index);
            }
        } catch (e) {
            element.innerHTML = original;
            element.onclick = () => editStrategyNote(element, index);
        }
    };

    textarea.addEventListener('blur', save);
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            textarea.removeEventListener('blur', save);
            element.innerHTML = original;
            element.onclick = () => editStrategyNote(element, index);
        }
    });
}

async function addStrategyNote() {
    try {
        const resp = await fetch('/api/strategy/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: 'New note — click to edit' })
        });
        if (resp.ok) {
            if (!portfolioData.strategy) portfolioData.strategy = [];
            portfolioData.strategy.push('New note — click to edit');
            renderStrategyNotes();
            showSaveToast('Note added');
            // Auto-focus the new note for editing
            const notes = document.querySelectorAll('.note-text');
            const last = notes[notes.length - 1];
            if (last) editStrategyNote(last, portfolioData.strategy.length - 1);
        }
    } catch (e) {
        console.error('Error adding note:', e);
    }
}

async function deleteStrategyNote(index) {
    if (!confirm('Delete this note?')) return;
    try {
        const resp = await fetch('/api/strategy/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index })
        });
        if (resp.ok) {
            portfolioData.strategy.splice(index, 1);
            renderStrategyNotes();
            showSaveToast('Note deleted');
        }
    } catch (e) {
        console.error('Error deleting note:', e);
    }
}

function renderGoalTracker() {
    const container = document.getElementById('goalTrackerContainer');
    if (!container) return;

    const goals = portfolioData?.goals || [];
    const goalsRaw = portfolioData?.goals_raw || {};
    const summary = portfolioData?.summary || {};

    // Build enhanced goals with proper current values
    const enhancedGoals = [];

    if (goalsRaw.portfolioTarget) {
        enhancedGoals.push({
            key: 'portfolioTarget',
            name: 'Portfolio Value',
            current: summary.totalMarketValue || 0,
            target: goalsRaw.portfolioTarget,
            format: 'money'
        });
    }
    if (goalsRaw.dividendTarget) {
        enhancedGoals.push({
            key: 'dividendTarget',
            name: 'Annual Dividends',
            current: summary.annualDivIncome || 0,
            target: goalsRaw.dividendTarget,
            format: 'money'
        });
    }
    if (goalsRaw.maxHoldings) {
        enhancedGoals.push({
            key: 'maxHoldings',
            name: 'Max Holdings',
            current: (portfolioData.positions || []).length,
            target: goalsRaw.maxHoldings,
            format: 'number'
        });
    }
    if (goalsRaw.cashReserveMin) {
        enhancedGoals.push({
            key: 'cashReserveMin',
            name: 'Min Cash Reserve',
            current: summary.cash || 0,
            target: goalsRaw.cashReserveMin,
            format: 'money'
        });
    }
    if (goalsRaw.cashReserveMax) {
        enhancedGoals.push({
            key: 'cashReserveMax',
            name: 'Max Cash Reserve',
            current: summary.cash || 0,
            target: goalsRaw.cashReserveMax,
            format: 'money',
            inverse: true
        });
    }

    if (enhancedGoals.length === 0) {
        container.innerHTML = '<p style="color: var(--text-dim); font-style: italic;">No goals configured. Go to Settings to set portfolio targets.</p>';
        return;
    }

    container.innerHTML = enhancedGoals.map(goal => {
        const progress = goal.inverse
            ? Math.min((goal.target / Math.max(goal.current, 1)) * 100, 100)
            : Math.min((goal.current / goal.target) * 100, 100);
        const progressColor = progress >= 75 ? '#22c55e' : progress >= 50 ? '#f59e0b' : '#ef4444';
        const currentFormatted = goal.format === 'money' ? formatMoney(goal.current) : Math.round(goal.current);
        const targetFormatted = goal.format === 'money' ? formatMoney(goal.target) : Math.round(goal.target);

        return `
            <div style="margin-bottom: 16px; padding: 12px; background: var(--card-hover); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 600; font-size: 14px;">${goal.name}</span>
                    <span style="font-size: 13px; color: var(--text-dim);">
                        ${currentFormatted} / <span class="goal-target-value" style="cursor: pointer; text-decoration: underline dotted;" title="Click to edit" onclick="editGoalTarget(this, '${goal.key}', ${goal.target})">${targetFormatted}</span>
                    </span>
                </div>
                <div style="background: var(--bg); border-radius: 6px; height: 8px; overflow: hidden;">
                    <div style="width: ${progress}%; height: 100%; background: ${progressColor}; border-radius: 6px; transition: width 0.5s ease;"></div>
                </div>
                <div style="text-align: right; font-size: 12px; color: ${progressColor}; margin-top: 4px; font-weight: 600;">${progress.toFixed(1)}%</div>
            </div>
        `;
    }).join('');
}

function renderIncomeGoals() {
    const container = document.getElementById('incomeGoalsContainer');
    if (!container) return;

    const annualIncome = portfolioData?.summary?.annualDivIncome || 0;

    const milestones = [
        { label: '$1 a day', target: 365 },
        { label: '$50 a month', target: 600 },
        { label: '$100 a month', target: 1200 },
        { label: '$5 a day', target: 1825 },
        { label: '$200 a month', target: 2400 },
        { label: '$500 a month', target: 6000 },
        { label: '$1,000 a month', target: 12000 },
        { label: '$2,000 a month', target: 24000 },
    ];

    container.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
        ${milestones.map(m => {
            const progress = Math.min((annualIncome / m.target) * 100, 100);
            const achieved = progress >= 100;
            const progressColor = achieved ? '#22c55e' : progress >= 50 ? '#f59e0b' : '#ef4444';
            return `
                <div style="padding: 14px; background: var(--card-hover); border-radius: 8px; border-left: 3px solid ${progressColor};">
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px;">${m.label}</div>
                    <div style="font-size: 13px; margin-bottom: 8px;">
                        ${achieved
                            ? '<span style="color: #22c55e; font-weight: 600;">Achieved</span>'
                            : `<span style="color: ${progressColor}; font-weight: 600;">In Progress: ${progress.toFixed(0)}%</span>`
                        }
                    </div>
                    <div style="background: var(--bg); border-radius: 4px; height: 6px; overflow: hidden;">
                        <div style="width: ${progress}%; height: 100%; background: ${progressColor}; border-radius: 4px; transition: width 0.5s ease;"></div>
                    </div>
                    <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">${formatMoney(annualIncome)} / ${formatMoney(m.target)} per year</div>
                </div>
            `;
        }).join('')}
    </div>`;
}

async function editGoalTarget(element, key, currentValue) {
    if (element.querySelector('input')) return;
    const original = element.innerHTML;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentValue;
    input.step = key === 'maxHoldings' ? '1' : '100';
    input.style.cssText = 'width: 100px; padding: 2px 6px; background: var(--bg); border: 2px solid var(--accent); border-radius: 4px; color: var(--text); font-size: 13px; font-family: Inter, sans-serif;';
    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    input.select();

    const save = async () => {
        const newValue = parseFloat(input.value);
        if (isNaN(newValue) || newValue === currentValue) {
            element.innerHTML = original;
            return;
        }
        try {
            const resp = await fetch('/api/goals/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: newValue })
            });
            if (resp.ok) {
                showSaveToast('Goal updated');
                portfolioData.goals_raw[key] = newValue;
                renderGoalTracker();
            } else {
                element.innerHTML = original;
            }
        } catch (e) {
            element.innerHTML = original;
        }
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            input.removeEventListener('blur', save);
            element.innerHTML = original;
        }
    });
}

// Legacy compatibility — populateAlerts now calls populateScreening
function populateAlerts() {
    populateScreening();
}

// Dispatchers kept for backward compatibility
function populateNewTabs() {
    populateSoldPositions();
    populateDivLog();
    populateMonthlyData();
    populateAnnualData();
    populateLab();
    populateIVList();
}

function populateSoldPositions() {
    const container = document.getElementById('soldPositionsContainer');
    if (container) container.innerHTML = '<p style="color: var(--text-dim);">Sold positions data not yet available. Connect to API.</p>';
}

function populateDivLog() {
    const container = document.getElementById('divlogContainer');
    if (dividendData && dividendData.log) {
        const html = `<div class="table-wrapper"><table style="width: 100%;"><thead><tr>
            <th style="padding: 12px; text-align: left; background: var(--card-hover); border-bottom: 2px solid var(--border);">Date</th>
            <th style="padding: 12px; text-align: left; background: var(--card-hover); border-bottom: 2px solid var(--border);">Ticker</th>
            <th style="padding: 12px; text-align: left; background: var(--card-hover); border-bottom: 2px solid var(--border);">Amount</th>
        </tr></thead><tbody>
        ${dividendData.log.map(item => `<tr>
            <td style="padding: 12px; border-bottom: 1px solid var(--border);">${escapeHtml(item.date)}</td>
            <td style="padding: 12px; border-bottom: 1px solid var(--border);">${tickerLogo(item.ticker)}${escapeHtml(item.ticker)}</td>
            <td style="padding: 12px; border-bottom: 1px solid var(--border);">${formatMoney(item.amount)}</td>
        </tr>`).join('')}
        </tbody></table></div>`;
        container.innerHTML = html;
    } else if (container) {
        container.innerHTML = '<p style="color: var(--text-dim);">Dividend log not available.</p>';
    }
}

function populateMonthlyData() {}

function populateAnnualData() {
    const container = document.getElementById('annualContainer');
    if (container) container.innerHTML = '<p style="color: var(--text-dim);">Annual data view coming soon.</p>';
}

function populateLab() {
    const container = document.getElementById('labContainer');
    if (container) container.innerHTML = '<p style="color: var(--text-dim);">Experimental analysis tools available in lab.</p>';
}

function populateIVList() {
    const container = document.getElementById('ivlistContainer');
    if (!container) return;
    if (watchlistData && watchlistData.watchlist) {
        const html = `<div class="table-wrapper"><table style="width: 100%;"><thead><tr>
            <th style="padding: 12px; text-align: left; background: var(--card-hover); border-bottom: 2px solid var(--border);">Ticker</th>
            <th style="padding: 12px; text-align: left; background: var(--card-hover); border-bottom: 2px solid var(--border);">Current Price</th>
            <th style="padding: 12px; text-align: left; background: var(--card-hover); border-bottom: 2px solid var(--border);">Intrinsic Value</th>
            <th style="padding: 12px; text-align: left; background: var(--card-hover); border-bottom: 2px solid var(--border);">Discount %</th>
        </tr></thead><tbody>
        ${watchlistData.watchlist.map(item => {
            const discount = ((item.intrinsicValue - item.price) / item.intrinsicValue * 100);
            return `<tr>
                <td style="padding: 12px; border-bottom: 1px solid var(--border);">${tickerLogo(item.ticker)}<strong>${escapeHtml(item.ticker)}</strong></td>
                <td style="padding: 12px; border-bottom: 1px solid var(--border);">${formatMoney(item.price)}</td>
                <td style="padding: 12px; border-bottom: 1px solid var(--border);">${formatMoney(item.intrinsicValue)}</td>
                <td style="padding: 12px; border-bottom: 1px solid var(--border);" class="${discount > 0 ? 'positive' : 'negative'}">${formatPercent(discount)}</td>
            </tr>`;
        }).join('')}
        </tbody></table></div>`;
        container.innerHTML = html;
    } else {
        container.innerHTML = '<p style="color: var(--text-dim);">Intrinsic value list not available.</p>';
    }
}


// ── Find the Dip ───────────────────────────────────────────────────

let _dipData = null;

async function fetchFindTheDip() {
    try {
        const resp = await fetch('/api/find-the-dip');
        if (!resp.ok) return;
        _dipData = await resp.json();
        renderFindTheDip();
    } catch (e) {
        console.error('[find-the-dip]', e);
    }
}

function renderFindTheDip() {
    if (!_dipData || !_dipData.holdings) return;
    const sma = document.getElementById('dipSmaSelect')?.value || '200';
    const distKey = `dist${sma}`;
    const smaKey = `sma${sma}`;

    // Only holdings with this SMA available and trading below it
    const below = _dipData.holdings
        .filter(h => h[distKey] !== undefined && h[distKey] < 0)
        .sort((a, b) => a[distKey] - b[distKey]);

    // Chart
    _renderDipChart(below, distKey);

    // Table — show ALL holdings sorted by distance
    const all = _dipData.holdings
        .filter(h => h[distKey] !== undefined)
        .sort((a, b) => a[distKey] - b[distKey]);

    const tbody = document.getElementById('dipBody');
    if (!tbody) return;

    tbody.innerHTML = all.map(h => {
        const distCell = (key) => {
            const v = h[key];
            if (v === undefined) return '<td style="text-align:right; color: var(--text-dim);">—</td>';
            const color = v < 0 ? '#ef4444' : v > 0 ? '#22c55e' : 'var(--text-dim)';
            return `<td style="text-align:right; color: ${color}; font-weight: 600;">${v > 0 ? '+' : ''}${v.toFixed(1)}%</td>`;
        };
        return `<tr>
            <td>${tickerLogo(h.ticker)}<strong>${escapeHtml(h.ticker)}</strong></td>
            <td>${formatMoney(h.price)}</td>
            ${distCell('dist10')}
            ${distCell('dist50')}
            ${distCell('dist100')}
            ${distCell('dist200')}
            <td style="color: var(--text-dim); font-size: 12px;">${escapeHtml(h.category || '')}</td>
        </tr>`;
    }).join('');
}

function _renderDipChart(below, distKey) {
    const canvas = document.getElementById('dipChart');
    if (!canvas) return;
    const container = document.getElementById('dipChartContainer');

    if (below.length === 0) {
        if (charts.dip) charts.dip.destroy();
        if (container) container.style.display = 'none';
        return;
    }
    if (container) container.style.display = '';

    if (charts.dip) charts.dip.destroy();
    charts.dip = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: below.map(h => h.ticker),
            datasets: [{
                label: '% below SMA',
                data: below.map(h => h[distKey]),
                backgroundColor: below.map(h => {
                    const d = h[distKey];
                    return d < -10 ? '#ef4444cc' : d < -5 ? '#f59e0bcc' : '#fb923ccc';
                }),
                borderRadius: 4,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `${ctx.raw.toFixed(2)}% vs SMA` } }
            },
            scales: {
                x: { ticks: { color: getChartTextColor(), callback: v => v + '%' }, grid: { color: getChartGridColor() } },
                y: { ticks: { color: getChartTextColor() }, grid: { display: false } }
            }
        }
    });
}
