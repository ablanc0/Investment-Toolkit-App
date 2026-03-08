// ── Tab 1: Overview ──

function renderKpiGrid(containerId, kpis) {
    const grid = document.getElementById(containerId);
    grid.innerHTML = kpis.map(kpi => `
        <div class="kpi-card">
            <div class="kpi-emoji">${kpi.label.split(' ')[0]}</div>
            <div class="kpi-label">${kpi.label.split(' ').slice(1).join(' ')}</div>
            <div class="kpi-value ${kpi.positive !== undefined ? (kpi.positive ? 'positive' : 'negative') : ''}">
                ${kpi.value}
            </div>
            <div class="kpi-sub">${kpi.sub}</div>
        </div>
    `).join('');
    return grid;
}

function populateOverview() {
    if (!portfolioData) return;

    const summary = portfolioData.summary || {};
    const allocations = portfolioData.allocations || {};

    // Section 1: Portfolio Overview
    const overviewKpis = [
        {
            label: '💼 Total Portfolio',
            value: formatMoney(summary.totalPortfolio),
            sub: `Market: ${formatMoney(summary.totalMarketValue)} + Cash: ${formatMoney(summary.cash)}`
        },
        {
            label: '📈 Total Return',
            value: formatMoney(summary.totalReturn),
            sub: `${formatPercent(summary.totalReturnPercent)}`,
            positive: summary.totalReturn >= 0
        },
        {
            label: '📉 Day Change',
            value: formatMoney(summary.dayChange),
            sub: `${formatPercent(summary.dayChangePercent)}`,
            positive: summary.dayChange >= 0
        },
        {
            label: '💵 Cash Position',
            value: formatMoney(summary.cash),
            sub: `${formatPercent(summary.cashWeight)} of portfolio`
        },
        {
            label: '💰 Cost Basis',
            value: formatMoney(summary.totalCostBasis),
            sub: `Market: ${formatMoney(summary.totalMarketValue)}`
        },
        {
            label: '📌 Holdings',
            value: (portfolioData.positions || []).length,
            sub: 'Active positions'
        }
    ];

    const kpiGrid = renderKpiGrid('overviewKpis', overviewKpis);

    // Make cash KPI editable (4th card, index 3)
    const cashCard = kpiGrid.children[3];
    if (cashCard) {
        const cashValue = cashCard.querySelector('.kpi-value');
        cashValue.classList.add('kpi-editable');
        cashValue.title = 'Click to edit';
        cashValue.onclick = () => editCashValue(cashValue, summary.cash);
    }

    // Health summary bar
    renderHealthSummary();

    // Section 2: Dividend Stats
    const divStatsKpis = [
        {
            label: '📊 Portfolio Yield',
            value: `${(summary.portfolioDivYield || 0).toFixed(2)}%`,
            sub: 'Dividend yield on market value'
        },
        {
            label: '🎯 Yield on Cost',
            value: `${(summary.portfolioYOC || 0).toFixed(2)}%`,
            sub: 'Dividend yield on cost basis'
        },
        {
            label: '💰 Dividends Received',
            value: formatMoney(summary.lifetimeDivsReceived),
            sub: 'Lifetime total'
        },
        {
            label: '📈 Annual Income',
            value: formatMoney(summary.annualDivIncome),
            sub: 'Expected annual dividends'
        }
    ];
    renderKpiGrid('dividendKpis', divStatsKpis);

    // Section 3: Dividend Income Expected
    const divIncomeKpis = [
        {
            label: '📅 Annual',
            value: formatMoney(summary.annualDivIncome),
            sub: 'Expected per year'
        },
        {
            label: '🗓️ Monthly',
            value: formatMoney(summary.monthlyDivIncome),
            sub: 'Expected per month'
        },
        {
            label: '📆 Weekly',
            value: formatMoney(summary.weeklyDivIncome),
            sub: 'Expected per week'
        },
        {
            label: '⏰ Daily',
            value: formatMoney(summary.dailyDivIncome),
            sub: 'Expected per day'
        }
    ];
    renderKpiGrid('divIncomeKpis', divIncomeKpis);

    // Section 4: Sold Positions
    const soldKpis = [
        {
            label: '📦 Sold Positions',
            value: summary.soldPositionsCount || 0,
            sub: 'Closed positions'
        },
        {
            label: '💵 Sold Return',
            value: formatMoney(summary.soldReturn),
            sub: 'Realized gains/losses',
            positive: (summary.soldReturn || 0) >= 0
        }
    ];
    renderKpiGrid('soldKpis', soldKpis);

    // Charts
    if (portfolioData.positions && portfolioData.positions.length > 0) {
        createReturnsChart(portfolioData.positions);
    }
    if (allocations.category) {
        createAllocationChart('categoryChart', allocations.category, 'Category Allocation');
    }
    if (allocations.sector) {
        createAllocationChart('sectorChart', allocations.sector, 'Sector Allocation');
    }
    if (allocations.securityType) {
        createAllocationChart('securityChart', allocations.securityType, 'Security Type');
    }
    // Day Movers — top 5 gainers/losers by day change
    renderDayMovers();
}

function renderHealthSummary() {
    const bar = document.getElementById('healthSummaryBar');
    if (!bar) return;

    const positions = portfolioData?.positions || [];
    const watchlist = watchlistData?.watchlist || [];
    const sb = _signalThresholds?.avgCost?.strongBuy ?? -15;
    const oc = _signalThresholds?.avgCost?.overcost ?? 15;

    const strongBuys = positions.filter(p => (p.returnPercent || 0) <= sb).length;
    const overcost = positions.filter(p => (p.returnPercent || 0) >= oc).length;
    const wlOpps = watchlist.filter(w => (w.distance || 0) < 0).length;

    const items = [];
    if (strongBuys > 0) items.push(`<span style="color: #4ade80; cursor: pointer;" onclick="switchTab('screening')">${strongBuys} Strong Buy</span>`);
    if (overcost > 0) items.push(`<span style="color: #f87171; cursor: pointer;" onclick="switchTab('screening')">${overcost} Overcost</span>`);
    if (wlOpps > 0) items.push(`<span style="color: #22d3ee; cursor: pointer;" onclick="switchTab('screening')">${wlOpps} WL Opportunities</span>`);
    items.push(`<span style="color: var(--text-dim);">${positions.length} Holdings</span>`);

    bar.innerHTML = items.map(item =>
        `<div style="padding: 4px 12px; background: var(--card-hover); border-radius: 6px; font-size: 13px; font-weight: 500;">${item}</div>`
    ).join('');
}

function renderDayMovers() {
    const container = document.getElementById('dayMoversContainer');
    if (!container) return;

    const positions = portfolioData?.positions || [];
    if (positions.length === 0) {
        container.innerHTML = '<p style="color: var(--text-dim);">No positions data</p>';
        return;
    }

    const sorted = [...positions].sort((a, b) => (b.dayChangePercent || b.dayChangePct || 0) - (a.dayChangePercent || a.dayChangePct || 0));
    const gainers = sorted.slice(0, 5).filter(p => (p.dayChangePercent || p.dayChangePct || 0) > 0);
    const losers = sorted.slice(-5).reverse().filter(p => (p.dayChangePercent || p.dayChangePct || 0) < 0);

    const renderRow = (p, isGainer) => {
        const pct = p.dayChangePercent || p.dayChangePct || 0;
        const chg = p.dayChange || p.dayChangeShare || 0;
        const maxWidth = 60;
        const absMax = Math.max(...positions.map(x => Math.abs(x.dayChangePercent || x.dayChangePct || 0)), 1);
        const barWidth = Math.min(Math.abs(pct) / absMax * maxWidth, maxWidth);
        const color = isGainer ? '#22c55e' : '#ef4444';
        return `
            <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border);">
                <span style="width: 60px; font-weight: 600; font-size: 13px;">${escapeHtml(p.ticker)}</span>
                <div style="flex: 1; display: flex; align-items: center; ${isGainer ? '' : 'flex-direction: row-reverse;'}">
                    <div style="width: ${barWidth}%; height: 6px; background: ${color}; border-radius: 3px;"></div>
                </div>
                <span style="width: 70px; text-align: right; color: ${color}; font-weight: 600; font-size: 13px;">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
                <span style="width: 70px; text-align: right; color: var(--text-dim); font-size: 12px;">${formatMoney(chg)}</span>
            </div>
        `;
    };

    let html = '';
    if (gainers.length > 0) {
        html += '<div style="margin-bottom: 12px;"><div style="font-size: 12px; text-transform: uppercase; color: #22c55e; font-weight: 600; margin-bottom: 6px;">Gainers</div>';
        html += gainers.map(p => renderRow(p, true)).join('');
        html += '</div>';
    }
    if (losers.length > 0) {
        html += '<div><div style="font-size: 12px; text-transform: uppercase; color: #ef4444; font-weight: 600; margin-bottom: 6px;">Losers</div>';
        html += losers.map(p => renderRow(p, false)).join('');
        html += '</div>';
    }
    if (gainers.length === 0 && losers.length === 0) {
        html = '<p style="color: var(--text-dim);">No day change data available</p>';
    }

    container.innerHTML = html;
}

function editCashValue(element, currentValue) {
    if (element.querySelector('input')) return;

    const originalHTML = element.innerHTML;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentValue;
    input.step = '0.01';
    input.style.cssText = 'width: 140px; padding: 4px 8px; background: var(--bg); border: 2px solid var(--accent); border-radius: 6px; color: var(--text); font-size: 20px; font-weight: 700; font-family: Inter, sans-serif;';

    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    input.select();

    const save = async () => {
        const newValue = parseFloat(input.value);
        if (isNaN(newValue) || newValue === currentValue) {
            element.innerHTML = originalHTML;
            return;
        }
        try {
            const resp = await fetch('/api/cash/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({cash: newValue})
            });
            if (resp.ok) {
                showSaveToast('Cash balance updated');
                await fetchAllData();
            } else {
                element.innerHTML = originalHTML;
            }
        } catch (e) {
            element.innerHTML = originalHTML;
        }
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            input.removeEventListener('blur', save);
            element.innerHTML = originalHTML;
        }
    });
}
