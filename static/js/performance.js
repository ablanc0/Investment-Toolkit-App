// ── Tab 3: Performance ──

function populatePerformance() {
    if (!portfolioData || !portfolioData.positions) return;

    const positions = portfolioData.positions;
    const sorted = [...positions].sort((a, b) => b.returnPercent - a.returnPercent);

    const topPerformers = sorted.slice(0, 5);
    document.getElementById('topPerformers').innerHTML = topPerformers.map((p, i) => `
        <div class="performer-card">
            <div class="performer-rank">#${i + 1}</div>
            <div class="performer-ticker">${p.ticker}</div>
            <div class="performer-value positive">${formatPercent(p.returnPercent)}</div>
        </div>
    `).join('');

    const bottomPerformers = sorted.slice(-5).reverse();
    document.getElementById('bottomPerformers').innerHTML = bottomPerformers.map((p, i) => `
        <div class="performer-card">
            <div class="performer-rank">#${i + 1}</div>
            <div class="performer-ticker">${p.ticker}</div>
            <div class="performer-value negative">${formatPercent(p.returnPercent)}</div>
        </div>
    `).join('');

    const byDayChange = [...positions].sort((a, b) => b.dayChange - a.dayChange);
    const bestDay = byDayChange[0];
    const worstDay = byDayChange[byDayChange.length - 1];

    document.getElementById('bestDayChange').innerHTML = `
        <div class="performer-card">
            <div class="performer-ticker">${bestDay.ticker}</div>
            <div class="performer-value positive">${formatMoney(bestDay.dayChange)}</div>
            <div style="font-size: 12px; color: var(--text-dim);">${formatPercent(bestDay.dayChangePercent)}</div>
        </div>
    `;

    document.getElementById('worstDayChange').innerHTML = `
        <div class="performer-card">
            <div class="performer-ticker">${worstDay.ticker}</div>
            <div class="performer-value negative">${formatMoney(worstDay.dayChange)}</div>
            <div style="font-size: 12px; color: var(--text-dim);">${formatPercent(worstDay.dayChangePercent)}</div>
        </div>
    `;
}
