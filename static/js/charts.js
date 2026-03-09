// ── Chart Helper Functions ───────────────────────────────────────
// Extracted from dashboard.html — keep in global scope (no modules)
// Uses the global `charts` object declared here.

function getChartTextColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e0e6ed';
}
function getChartGridColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#2a2e42';
}

let charts = {};

function createPortfolioValueChart(monthlyData) {
    const canvas = document.getElementById('portfolioValueChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts.portfolioValue) charts.portfolioValue.destroy();

    const filtered = monthlyData.filter(m => m.portfolioValue > 0);
    if (filtered.length === 0) return;

    const labels = filtered.map(m => m.month);
    const values = filtered.map(m => m.portfolioValue);
    // Carry forward accumulated investment when a month has 0 (not yet filled)
    let lastAI = 0;
    const invested = filtered.map(m => {
        if (m.accumulatedInvestment > 0) lastAI = m.accumulatedInvestment;
        return lastAI;
    });

    charts.portfolioValue = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Portfolio Value',
                    data: values,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    borderWidth: 2.5,
                },
                {
                    label: 'Accumulated Investment',
                    data: invested,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: getChartTextColor(), usePointStyle: true, padding: 15 },
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.dataset.label + ': ' + formatMoney(ctx.parsed.y);
                        },
                        afterBody: function(tooltipItems) {
                            if (tooltipItems.length >= 2) {
                                const pv = tooltipItems[0].parsed.y;
                                const ai = tooltipItems[1].parsed.y;
                                const gain = pv - ai;
                                const pct = ai > 0 ? ((gain / ai) * 100).toFixed(2) : '0.00';
                                return 'Market Gain: ' + formatMoney(gain) + ' (' + pct + '%)';
                            }
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: getChartTextColor(), maxTicksLimit: 12, maxRotation: 45 },
                    grid: { display: false },
                },
                y: {
                    ticks: {
                        color: getChartTextColor(),
                        callback: function(v) {
                            if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
                            if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
                            return '$' + v;
                        },
                    },
                    grid: { color: getChartGridColor() },
                },
            },
        },
    });
}

function createAllocationChart(elementId, data, label) {
    const ctx = document.getElementById(elementId).getContext('2d');
    if (charts[elementId]) charts[elementId].destroy();

    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4'];
    const entries = Object.entries(data);

    charts[elementId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: entries.map(e => e[0]),
            datasets: [{
                data: entries.map(e => e[1]),
                backgroundColor: colors,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0f1117',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: getChartTextColor(),
                        usePointStyle: true,
                        padding: 15
                    }
                }
            }
        }
    });
}

function createMonthlyDividendChart(monthlyTotals) {
    const entries = Object.entries(monthlyTotals);
    const ctx = document.getElementById('monthlyDividendChart').getContext('2d');
    if (charts.monthlyDividend) charts.monthlyDividend.destroy();

    charts.monthlyDividend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: entries.map(e => e[0]),
            datasets: [{
                label: 'Dividend Income ($)',
                data: entries.map(e => e[1]),
                backgroundColor: '#f59e0b',
                borderColor: '#f59e0b',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    ticks: { color: getChartTextColor() },
                    grid: { color: getChartGridColor() }
                },
                x: {
                    ticks: { color: getChartTextColor() },
                    grid: { display: false }
                }
            }
        }
    });
}

function createHoldingDividendChart(byHolding) {
    const entries = Object.entries(byHolding).sort((a, b) => b[1] - a[1]);
    const canvas = document.getElementById('holdingDividendChart');
    const ctx = canvas.getContext('2d');
    // Dynamic height: 30px per bar, min 300px
    canvas.parentElement.style.height = Math.max(300, entries.length * 30) + 'px';
    if (charts.holdingDividend) charts.holdingDividend.destroy();

    charts.holdingDividend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: entries.map(e => e[0]),
            datasets: [{
                label: 'Annual Dividend ($)',
                data: entries.map(e => e[1]),
                backgroundColor: '#22c55e',
                borderColor: '#22c55e',
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: { color: getChartTextColor() },
                    grid: { color: getChartGridColor() }
                },
                y: {
                    ticks: { color: getChartTextColor() },
                    grid: { display: false }
                }
            }
        }
    });
}
