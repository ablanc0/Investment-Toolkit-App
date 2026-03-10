// ── Tab 3: Performance ──

function populatePerformance() {
    if (!portfolioData || !portfolioData.positions) return;

    const positions = portfolioData.positions;
    const sorted = [...positions].sort((a, b) => b.returnPercent - a.returnPercent);

    const topPerformers = sorted.slice(0, 5);
    document.getElementById('topPerformers').innerHTML = topPerformers.map((p, i) => `
        <div class="performer-card">
            <div class="performer-rank">#${i + 1}</div>
            <div class="performer-ticker">${tickerLogo(p.ticker, 18)}${escapeHtml(p.ticker)}</div>
            <div class="performer-value positive">${formatPercent(p.returnPercent)}</div>
        </div>
    `).join('');

    const bottomPerformers = sorted.slice(-5).reverse();
    document.getElementById('bottomPerformers').innerHTML = bottomPerformers.map((p, i) => `
        <div class="performer-card">
            <div class="performer-rank">#${i + 1}</div>
            <div class="performer-ticker">${tickerLogo(p.ticker, 18)}${escapeHtml(p.ticker)}</div>
            <div class="performer-value negative">${formatPercent(p.returnPercent)}</div>
        </div>
    `).join('');

    const byDayChange = [...positions].sort((a, b) => b.dayChange - a.dayChange);
    const bestDay = byDayChange[0];
    const worstDay = byDayChange[byDayChange.length - 1];

    document.getElementById('bestDayChange').innerHTML = `
        <div class="performer-card">
            <div class="performer-ticker">${tickerLogo(bestDay.ticker, 18)}${escapeHtml(bestDay.ticker)}</div>
            <div class="performer-value positive">${formatMoney(bestDay.dayChange)}</div>
            <div style="font-size: 12px; color: var(--text-dim);">${formatPercent(bestDay.dayChangePercent)}</div>
        </div>
    `;

    document.getElementById('worstDayChange').innerHTML = `
        <div class="performer-card">
            <div class="performer-ticker">${tickerLogo(worstDay.ticker, 18)}${escapeHtml(worstDay.ticker)}</div>
            <div class="performer-value negative">${formatMoney(worstDay.dayChange)}</div>
            <div style="font-size: 12px; color: var(--text-dim);">${formatPercent(worstDay.dayChangePercent)}</div>
        </div>
    `;

    // Holdings performance ranking — sorted horizontal bar chart
    renderHoldingsRanking(sorted);

    // Load performance attribution (merged into this tab)
    if (typeof fetchAttribution === 'function') fetchAttribution();
}

function renderHoldingsRanking(sorted) {
    const container = document.getElementById('holdingsRankingChart');
    if (!container) return;

    const maxAbs = Math.max(...sorted.map(p => Math.abs(p.returnPercent || 0)), 1);

    container.innerHTML = sorted.map(p => {
        const pct = p.returnPercent || 0;
        const isPositive = pct >= 0;
        const barWidth = Math.min(Math.abs(pct) / maxAbs * 60, 60);
        const color = isPositive ? '#22c55e' : '#ef4444';
        return `
            <div style="display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--border);">
                <span style="width: 75px; font-weight: 600; font-size: 13px; color: var(--text);">${tickerLogo(p.ticker, 16)}${escapeHtml(p.ticker)}</span>
                <div style="flex: 1; display: flex; align-items: center;">
                    <div style="width: ${barWidth}%; height: 8px; background: ${color}; border-radius: 4px; transition: width 0.4s;"></div>
                </div>
                <span style="width: 75px; text-align: right; color: ${color}; font-weight: 600; font-size: 13px;">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>
                <span style="width: 80px; text-align: right; color: var(--text-dim); font-size: 12px;">${formatMoney(p.marketReturn || 0)}</span>
            </div>
        `;
    }).join('');
}
