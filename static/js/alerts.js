// ── Tab 7: Alerts & Strategy + Bootstrap Dispatchers ──

function populateAlerts() {
    if (!portfolioData) return;

    const positions = portfolioData.positions || [];
    const sb = _signalThresholds?.strongBuy ?? -5;
    const o  = _signalThresholds?.overrated ?? 50;

    const strongBuys = positions.filter(p => p.returnPercent < sb);
    document.getElementById('strongBuyAlerts').innerHTML = strongBuys.length > 0 ?
        strongBuys.map(p => `
            <div class="alert success">
                <strong>${p.ticker}</strong> - ${formatPercent(p.returnPercent)}
            </div>
        `).join('') : '<p style="color: var(--text-dim);">No strong buy signals detected</p>';

    const overvalued = positions.filter(p => p.returnPercent > o);
    document.getElementById('overvaluedAlerts').innerHTML = overvalued.length > 0 ?
        overvalued.map(p => `
            <div class="alert warning">
                <strong>${p.ticker}</strong> - ${formatPercent(p.returnPercent)}
            </div>
        `).join('') : '<p style="color: var(--text-dim);">No overvalued positions</p>';

    const tp = _signalThresholds?.topPerformer ?? 30;
    const topPerformers = positions.filter(p => p.returnPercent > tp).sort((a, b) => b.returnPercent - a.returnPercent);
    document.getElementById('topPerformerAlerts').innerHTML = topPerformers.length > 0 ?
        topPerformers.map(p => `
            <div class="alert info">
                <strong>${p.ticker}</strong> - ${formatPercent(p.returnPercent)}
            </div>
        `).join('') : '<p style="color: var(--text-dim);">No top performers (>30%)</p>';

    const strategy = portfolioData.strategy || [];
    document.getElementById('strategyNotes').innerHTML = strategy.length > 0 ?
        strategy.map(note => `<p style="margin-bottom: 12px; line-height: 1.6;">${note}</p>`).join('') :
        '<p style="color: var(--text-dim);">No strategy notes available</p>';

    const goals = portfolioData.goals || [];
    document.getElementById('goalTracker').innerHTML = goals.length > 0 ?
        goals.map(goal => {
            const progress = Math.min((goal.current / goal.target) * 100, 100);
            return `
                <div class="goal-item">
                    <div class="goal-header">
                        <span>${goal.name}</span>
                        <span>${formatPercent(progress)}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">
                        ${formatMoney(goal.current)} of ${formatMoney(goal.target)}
                    </div>
                </div>
            `;
        }).join('') :
        '<p style="color: var(--text-dim);">No goals configured</p>';
}

// New Tabs Population
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
    } else {
        container.innerHTML = '<p style="color: var(--text-dim);">Dividend log not available.</p>';
    }
}

function populateMonthlyData() {
    // Placeholder until fetchMonthlyData loads the actual data
}

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
