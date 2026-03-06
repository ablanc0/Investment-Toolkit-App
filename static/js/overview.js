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
    if (allocations.category) {
        createAllocationChart('strategyChart', allocations.category, 'Strategy Mix');
    }
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
