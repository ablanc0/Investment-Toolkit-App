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

function createReturnsChart(positions) {
    const sorted = positions
        .filter(p => p.totalReturn > 0)
        .sort((a, b) => b.totalReturn - a.totalReturn)
        .slice(0, 10);

    const ctx = document.getElementById('returnsChart').getContext('2d');
    if (charts.returns) charts.returns.destroy();

    charts.returns = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(p => p.ticker),
            datasets: [{
                label: 'Total Return ($)',
                data: sorted.map(p => p.totalReturn),
                backgroundColor: '#22c55e',
                borderColor: '#22c55e',
                borderRadius: 8,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
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
    const ctx = document.getElementById('holdingDividendChart').getContext('2d');
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
