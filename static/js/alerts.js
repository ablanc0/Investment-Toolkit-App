// ── Dashboard: Screening + Notes & Goals ──

function populateScreening() {
    if (!portfolioData || !watchlistData) return;

    const positions = portfolioData.positions || [];
    const watchlist = watchlistData.watchlist || [];
    const sb = _signalThresholds?.avgCost?.strongBuy ?? -15;
    const buy = _signalThresholds?.avgCost?.buy ?? -5;
    const oc = _signalThresholds?.avgCost?.overcost ?? 15;
    const filter = document.getElementById('portfolioSignalFilter')?.value || 'all';

    // Compute signals for portfolio positions
    const signaled = positions.map(p => {
        let signal;
        const ret = p.returnPercent || 0;
        if (ret <= sb) signal = 'Strong Buy';
        else if (ret <= buy) signal = 'Buy';
        else if (ret >= oc) signal = 'Overcost';
        else signal = 'Hold';
        return { ...p, signal };
    });

    // Filter
    let filtered = signaled;
    if (filter !== 'all') {
        const filterMap = { 'strong-buy': 'Strong Buy', 'buy': 'Buy', 'overcost': 'Overcost', 'overrated': 'Overrated' };
        filtered = signaled.filter(p => p.signal === filterMap[filter]);
    }

    // Sort: Strong Buy first, then Buy, then Overcost
    const signalOrder = { 'Strong Buy': 0, 'Buy': 1, 'Overcost': 2, 'Overrated': 3, 'Hold': 4 };
    filtered.sort((a, b) => (signalOrder[a.signal] || 4) - (signalOrder[b.signal] || 4));

    // Portfolio signals table
    document.getElementById('portfolioSignalsBody').innerHTML = filtered.length > 0 ?
        filtered.map(p => `
            <tr>
                <td><strong>${p.ticker}</strong></td>
                <td>${formatMoney(p.price)}</td>
                <td>${formatMoney(p.avgCost)}</td>
                <td class="${(p.returnPercent || 0) >= 0 ? 'positive' : 'negative'}">${formatPercent(p.returnPercent)}</td>
                <td>${p.intrinsicValue ? formatMoney(p.intrinsicValue) : '—'}</td>
                <td class="${(p.distance || 0) <= 0 ? 'positive' : 'negative'}">${p.distance != null ? formatPercent(p.distance) : '—'}</td>
                <td>${getSignalBadge(p.signal)}</td>
                <td>${p.invtScore ? '<span style="color:' + _invtScoreColor(p.invtScore) + ';font-weight:600">' + Number(p.invtScore).toFixed(1) + '</span>' : '—'}</td>
                <td>${p.category || '—'}</td>
            </tr>
        `).join('') :
        '<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:24px;">No signals matching filter</td></tr>';

    // Watchlist opportunities - compute signals from distance (same logic as watchlist.js)
    const wlSignaled = watchlist.map(item => {
        const distance = item.distance || 0;
        let signal;
        if (distance < -5) signal = 'Strong Buy';
        else if (distance < 0) signal = 'Buy';
        else if (distance > 50) signal = 'Overrated';
        else if (distance > 20) signal = 'Expensive';
        else signal = 'Hold';
        return { ...item, signal };
    }).sort((a, b) => (a.distance || 0) - (b.distance || 0));

    document.getElementById('watchlistSignalsBody').innerHTML = wlSignaled.length > 0 ?
        wlSignaled.map(item => `
            <tr>
                <td><strong>${item.ticker}</strong></td>
                <td>${formatMoney(item.price)}</td>
                <td>${item.intrinsicValue ? formatMoney(item.intrinsicValue) : '—'}</td>
                <td class="${(item.distance || 0) <= 0 ? 'positive' : 'negative'}">${formatPercent(item.distance)}</td>
                <td>${getSignalBadge(item.signal)}</td>
                <td>${item.invtScore ? '<span style="color:' + _invtScoreColor(item.invtScore) + ';font-weight:600">' + Number(item.invtScore).toFixed(1) + '</span>' : '—'}</td>
                <td>${item.divYield ? item.divYield.toFixed(2) + '%' : '—'}</td>
                <td>${item.sector || '—'}</td>
                <td>${item.priority || 'Low'}</td>
            </tr>
        `).join('') :
        '<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:24px;">No watchlist items</td></tr>';

    // KPI summary
    const strongBuyCount = signaled.filter(p => p.signal === 'Strong Buy').length;
    const overcostCount = signaled.filter(p => p.signal === 'Overcost').length;
    const wlOpportunities = wlSignaled.filter(w => w.signal === 'Strong Buy' || w.signal === 'Buy').length;
    document.getElementById('screeningKpis').innerHTML = [
        { label: '🟢 Strong Buy', value: strongBuyCount, sub: 'Portfolio positions' },
        { label: '🔴 Overcost', value: overcostCount, sub: 'Portfolio positions' },
        { label: '🔍 WL Opportunities', value: wlOpportunities, sub: 'Watchlist buys' },
        { label: '📋 Total Watchlist', value: watchlist.length, sub: 'Items tracked' },
    ].map(kpi => `
        <div class="kpi-card">
            <div class="kpi-emoji">${kpi.label.split(' ')[0]}</div>
            <div class="kpi-label">${kpi.label.split(' ').slice(1).join(' ')}</div>
            <div class="kpi-value">${kpi.value}</div>
            <div class="kpi-sub">${kpi.sub}</div>
        </div>
    `).join('');
}

// ── Notes & Goals ──

function populateNotesGoals() {
    renderStrategyNotes();
    renderGoalTracker();
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
            <p class="note-text" style="flex: 1; margin: 0; line-height: 1.6; cursor: pointer;" title="Click to edit" onclick="editStrategyNote(this, ${i})">${note}</p>
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
            <td style="padding: 12px; border-bottom: 1px solid var(--border);">${item.date}</td>
            <td style="padding: 12px; border-bottom: 1px solid var(--border);">${item.ticker}</td>
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
                <td style="padding: 12px; border-bottom: 1px solid var(--border);"><strong>${item.ticker}</strong></td>
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
