// ── Tab 6: Rebalancing ──

function populateRebalancing() {
    if (!portfolioData) return;

    const summary = portfolioData.summary || {};
    const targets = portfolioData.targets || {};
    const allocations = portfolioData.allocations || {};
    const positions = portfolioData.positions || [];

    const totalMV = positions.reduce((s, p) => s + (p.marketValue || 0), 0);
    const cash = summary.cash || 0;

    // Buying power KPIs
    const buyingPowerCards = document.getElementById('buyingPowerCards');
    buyingPowerCards.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-emoji">💵</div>
            <div class="kpi-label">Cash Available</div>
            <div class="kpi-value">${formatMoney(cash)}</div>
            <div class="kpi-sub">Ready to deploy</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-emoji">💰</div>
            <div class="kpi-label">Portfolio Div Yield</div>
            <div class="kpi-value">${(summary.portfolioDivYield || 0).toFixed(2)}%</div>
            <div class="kpi-sub">Weighted average</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-emoji">📊</div>
            <div class="kpi-label">Remaining Cash</div>
            <div class="kpi-value" id="remainingCash">${formatMoney(cash)}</div>
            <div class="kpi-sub">After proposed buys</div>
        </div>
    `;

    // Category allocation comparators
    const comparators = document.getElementById('rebalancingComparators');
    const categoryAlloc = allocations.category || {};
    const categoryTarget = targets.category || targets || {};

    comparators.innerHTML = Object.entries(categoryTarget).map(([category, targetPercent]) => {
        const actualPercent = categoryAlloc[category] || 0;
        const difference = actualPercent - targetPercent;
        const status = Math.abs(difference) > 5 ? '⚠️' : '✓';

        return `
            <div class="comparator-card">
                <div class="comparator-label">${status} ${category}</div>
                <div class="comparator-row">
                    <span>Actual:</span>
                    <span class="comparator-value">${formatPercent(actualPercent)}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(actualPercent, 100)}%"></div>
                </div>
                <div class="comparator-row">
                    <span>Target:</span>
                    <span class="comparator-value">${formatPercent(targetPercent)}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(targetPercent, 100)}%; background: #60a5fa;"></div>
                </div>
                <div class="comparator-row" style="margin-top: 12px;">
                    <span>Difference:</span>
                    <span class="comparator-value" style="color: ${difference > 0 ? '#ef4444' : '#22c55e'}">${difference > 0 ? '+' : ''}${formatPercent(difference)}</span>
                </div>
            </div>
        `;
    }).join('');

    // Rebalancing calculator table
    const tbody = document.getElementById('rebalancingBody');
    const tfoot = document.getElementById('rebalancingFoot');
    const signalMode = document.getElementById('signalMode')?.value || 'avgCost';
    const useIV = signalMode === 'iv';

    const totalPortfolio = summary.totalPortfolio || 1;
    let totalBuyCost = 0;

    tbody.innerHTML = positions.map(p => {
        const buyingPower = p.price > 0 ? Math.floor(cash / p.price) : 0;
        const signal = useIV ? (p.ivSignal || p.avgCostSignal) : p.avgCostSignal;

        return `<tr>
            <td><strong>${p.ticker}</strong></td>
            <td>${formatMoney(p.price)}</td>
            <td>${parseFloat(p.shares).toFixed(3)}</td>
            <td>${formatMoney(p.marketValue)}</td>
            <td>${formatPercent(p.weight)}</td>
            <td>${p.divYield ? p.divYield.toFixed(2) + '%' : '—'}</td>
            <td>${getSignalBadge(signal)}</td>
            <td>${getCategoryBadge(p.category)}</td>
            <td>${buyingPower}</td>
            <td><input type="number" min="0" max="${buyingPower}" value="0" step="1"
                class="rebal-input" data-ticker="${p.ticker}" data-price="${p.price}"
                data-shares="${p.shares}" data-avgcost="${p.avgCost}" data-mv="${p.marketValue}"
                data-alloc="${p.weight}" onchange="updateRebalRow(this)"
                style="width: 70px; padding: 4px 6px; background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; text-align: center;"></td>
            <td class="rebal-cost">$0.00</td>
            <td class="rebal-newmv">${formatMoney(p.marketValue)}</td>
            <td class="rebal-newalloc">${formatPercent(p.weight)}</td>
            <td class="rebal-newavg">${formatMoney(p.avgCost)}</td>
        </tr>`;
    }).join('');

    tfoot.innerHTML = `<tr style="font-weight: 600; border-top: 2px solid var(--border);">
        <td colspan="10" style="text-align: right;">Totals:</td>
        <td id="rebalTotalCost">$0.00</td>
        <td id="rebalTotalNewMV">${formatMoney(totalMV)}</td>
        <td colspan="2"></td>
    </tr>`;

    // Current allocation chart
    const catAlloc = {};
    positions.forEach(p => {
        const cat = p.category || 'Other';
        catAlloc[cat] = (catAlloc[cat] || 0) + (p.marketValue || 0);
    });
    const totalWithCash = totalMV + cash;
    const catAllocPct = {};
    Object.entries(catAlloc).forEach(([k, v]) => {
        catAllocPct[k] = round2(v / totalWithCash * 100);
    });
    if (cash > 0) catAllocPct['Cash'] = round2(cash / totalWithCash * 100);
    createAllocationChart('rebalCurrentChart', catAllocPct, 'Current');
    // Initial projected = same as current
    createAllocationChart('rebalProjectedChart', catAllocPct, 'After Buys');
}

function updateRebalRow(input) {
    const row = input.closest('tr');
    const sharesToBuy = parseInt(input.value) || 0;
    const price = parseFloat(input.dataset.price);
    const currentShares = parseFloat(input.dataset.shares);
    const avgCost = parseFloat(input.dataset.avgcost);
    const currentMV = parseFloat(input.dataset.mv);

    const buyCost = sharesToBuy * price;
    const newMV = currentMV + buyCost;
    const newShares = currentShares + sharesToBuy;
    const newAvgCost = newShares > 0 ? (avgCost * currentShares + buyCost) / newShares : avgCost;

    row.querySelector('.rebal-cost').textContent = formatMoney(buyCost);
    row.querySelector('.rebal-newmv').textContent = formatMoney(newMV);
    row.querySelector('.rebal-newavg').textContent = formatMoney(newAvgCost);

    // Recalculate all allocations and totals
    const allInputs = document.querySelectorAll('.rebal-input');
    let totalBuyCost = 0;
    let totalNewMV = 0;

    allInputs.forEach(inp => {
        const qty = parseInt(inp.value) || 0;
        const p = parseFloat(inp.dataset.price);
        const mv = parseFloat(inp.dataset.mv);
        totalBuyCost += qty * p;
        totalNewMV += mv + qty * p;
    });

    const cash = portfolioData?.summary?.cash || 0;
    const remaining = cash - totalBuyCost;
    const newTotalPortfolio = totalNewMV + remaining;

    // Update all new allocation %
    allInputs.forEach(inp => {
        const r = inp.closest('tr');
        const qty = parseInt(inp.value) || 0;
        const p = parseFloat(inp.dataset.price);
        const mv = parseFloat(inp.dataset.mv);
        const rowNewMV = mv + qty * p;
        const newAlloc = newTotalPortfolio > 0 ? (rowNewMV / newTotalPortfolio * 100) : 0;
        r.querySelector('.rebal-newalloc').textContent = formatPercent(newAlloc);
    });

    document.getElementById('rebalTotalCost').textContent = formatMoney(totalBuyCost);
    document.getElementById('rebalTotalNewMV').textContent = formatMoney(totalNewMV);

    const remainingEl = document.getElementById('remainingCash');
    if (remainingEl) {
        remainingEl.textContent = formatMoney(remaining);
        remainingEl.className = `kpi-value ${remaining >= 0 ? '' : 'negative'}`;
    }

    // Update projected allocation chart
    const positions = portfolioData?.positions || [];
    const projCatMV = {};
    positions.forEach(p => {
        const cat = p.category || 'Other';
        projCatMV[cat] = (projCatMV[cat] || 0) + (p.marketValue || 0);
    });
    // Add buy amounts per category
    allInputs.forEach(inp => {
        const qty = parseInt(inp.value) || 0;
        if (qty > 0) {
            const ticker = inp.dataset.ticker;
            const pos = positions.find(p => p.ticker === ticker);
            const cat = pos?.category || 'Other';
            projCatMV[cat] = (projCatMV[cat] || 0) + qty * parseFloat(inp.dataset.price);
        }
    });
    const projAllocPct = {};
    Object.entries(projCatMV).forEach(([k, v]) => {
        projAllocPct[k] = round2(v / newTotalPortfolio * 100);
    });
    if (remaining > 0) projAllocPct['Cash'] = round2(remaining / newTotalPortfolio * 100);
    createAllocationChart('rebalProjectedChart', projAllocPct, 'After Buys');
}
