// ── Risk Analysis Tab ──

async function fetchRiskAnalysis() {
    try {
        const resp = await fetch('/api/risk-analysis');
        const data = await resp.json();
        renderRiskKpis(data.riskMetrics, data.marketMetrics);
        renderSectorConcentration(data.sectorConcentration);
        renderStressTests(data.stressTests, data.totalMarketValue);
        renderRecoveryProjections(data.recoveryProjections, data.totalMarketValue);
    } catch (e) {
        console.error('Error loading risk analysis:', e);
    }
}

function renderRiskKpis(m, mkt) {
    const el = document.getElementById('riskKpis');
    if (!el || !m) return;
    const sharpeColor = m.sharpeRatio >= 1 ? '#22c55e' : m.sharpeRatio >= 0.5 ? '#f59e0b' : '#ef4444';
    const ddColor = m.maxDrawdown <= -20 ? '#ef4444' : m.maxDrawdown <= -10 ? '#f59e0b' : '#22c55e';

    function mktSub(label, val, fmt) {
        if (!mkt || val === undefined) return '';
        return '<div class="kpi-sub" style="margin-top:2px;">S&P 500: <strong>' + fmt(val) + '</strong></div>';
    }
    const fPct = v => v.toFixed(1) + '%';
    const fDec = v => v.toFixed(2);

    el.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">TWR</div><div class="kpi-value" style="color:${m.twr >= 0 ? '#22c55e' : '#ef4444'}">${m.twr.toFixed(1)}%</div><div class="kpi-sub">Cumulative, ${m.monthCount} months</div>${mktSub('S&P', mkt && mkt.twr, fPct)}</div>
        <div class="kpi-card"><div class="kpi-label">Annualized Return</div><div class="kpi-value" style="color:${m.annualizedReturn >= 0 ? '#22c55e' : '#ef4444'}">${m.annualizedReturn.toFixed(1)}%</div>${mktSub('S&P', mkt && mkt.annualizedReturn, fPct)}</div>
        <div class="kpi-card"><div class="kpi-label">Sharpe Ratio</div><div class="kpi-value" style="color:${sharpeColor}">${m.sharpeRatio.toFixed(2)}</div><div class="kpi-sub">${m.sharpeRatio >= 1 ? 'Good' : m.sharpeRatio >= 0.5 ? 'Moderate' : 'Low'} risk-adjusted return</div>${mktSub('S&P', mkt && mkt.sharpeRatio, fDec)}</div>
        <div class="kpi-card"><div class="kpi-label">Sortino Ratio</div><div class="kpi-value">${m.sortinoRatio.toFixed(2)}</div><div class="kpi-sub">Downside risk-adjusted</div>${mktSub('S&P', mkt && mkt.sortinoRatio, fDec)}</div>
        <div class="kpi-card"><div class="kpi-label">Portfolio Beta</div><div class="kpi-value">${m.portfolioBeta.toFixed(2)}</div><div class="kpi-sub">${m.portfolioBeta > 1.1 ? 'More volatile than market' : m.portfolioBeta < 0.9 ? 'Less volatile' : 'Near market'}</div></div>
        <div class="kpi-card"><div class="kpi-label">Annualized Volatility</div><div class="kpi-value">${m.annualizedVolatility.toFixed(1)}%</div>${mktSub('S&P', mkt && mkt.annualizedVolatility, fPct)}</div>
        <div class="kpi-card"><div class="kpi-label">Max Drawdown</div><div class="kpi-value" style="color:${ddColor}">${m.maxDrawdown.toFixed(1)}%</div><div class="kpi-sub">${m.maxDrawdownPeriod || '-'}</div>${mktSub('S&P', mkt && mkt.maxDrawdown, fPct)}</div>
    `;
    let disc = document.getElementById('riskKpisDisclaimer');
    if (!disc) {
        el.insertAdjacentHTML('afterend', '<p id="riskKpisDisclaimer" style="color:var(--text-dim); font-size:11px; margin-top:8px; font-style:italic;">Approximate — based on monthly snapshots with simplified contribution adjustments. Ratios may differ from tools using daily TWR.</p>');
    }
}

function renderSectorConcentration(sectors) {
    const el = document.getElementById('sectorConcentrationTable');
    if (!el) return;
    let html = '<table style="width:100%; font-size:0.85rem;"><thead><tr><th>Sector</th><th style="text-align:right;">Weight</th><th>Risk</th><th>Recommendation</th></tr></thead><tbody>';
    sectors.forEach(s => {
        const badgeColor = s.riskLevel === 'HIGH' ? '#ef4444' : s.riskLevel === 'MEDIUM' ? '#f59e0b' : '#22c55e';
        const barWidth = Math.min(s.weight, 100);
        html += `<tr>
            <td><strong>${s.sector}</strong></td>
            <td style="text-align:right;">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">
                    <div style="width:80px; height:6px; background:var(--card-hover); border-radius:3px; overflow:hidden;">
                        <div style="width:${barWidth}%; height:100%; background:${badgeColor}; border-radius:3px;"></div>
                    </div>
                    <span>${s.weight.toFixed(1)}%</span>
                </div>
            </td>
            <td><span style="background:${badgeColor}22; color:${badgeColor}; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">${s.riskLevel}</span></td>
            <td style="font-size:12px; color:var(--text-dim);">${s.recommendation}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    el.innerHTML = html;
}

function renderStressTests(scenarios, totalMV) {
    const el = document.getElementById('stressTestContainer');
    if (!el) return;
    el.innerHTML = scenarios.map((sc, idx) => {
        const posTable = sc.positions.slice(0, 5).map(p => {
            const color = p.estimatedLoss < 0 ? '#ef4444' : '#22c55e';
            return `<tr><td>${p.ticker}</td><td style="text-align:right;">${p.beta.toFixed(2)}</td><td style="text-align:right;">${p.adjustedDrop.toFixed(1)}%</td><td style="text-align:right; color:${color};">${formatMoney(p.estimatedLoss)}</td><td><span style="color:${p.priority === 'HIGH' ? '#ef4444' : p.priority === 'MEDIUM' ? '#f59e0b' : '#22c55e'}; font-size:11px; font-weight:600;">${p.priority}</span></td></tr>`;
        }).join('');
        const dropColor = Math.abs(sc.drop) >= 50 ? '#ef4444' : Math.abs(sc.drop) >= 20 ? '#f59e0b' : '#6b7280';
        return `<div style="background:var(--card-hover); padding:12px 16px; border-radius:10px; margin-bottom:8px; cursor:pointer;" onclick="this.querySelector('.stress-detail').style.display = this.querySelector('.stress-detail').style.display === 'none' ? 'block' : 'none'">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>${sc.name}</strong>
                    <span style="color:var(--text-dim); font-size:12px; margin-left:8px;">${sc.description}</span>
                </div>
                <div style="text-align:right;">
                    <span style="color:${dropColor}; font-weight:600;">${sc.stressedDropPct.toFixed(1)}%</span>
                    <span style="color:var(--text-dim); font-size:12px; margin-left:8px;">${formatMoney(sc.totalEstimatedLoss)}</span>
                </div>
            </div>
            <div class="stress-detail" style="display:none; margin-top:12px;">
                <div style="display:flex; gap:16px; margin-bottom:8px; font-size:13px;">
                    <span>Market Drop: <strong style="color:${dropColor}">${sc.drop}%</strong></span>
                    <span>Stressed Value: <strong>${formatMoney(sc.stressedValue)}</strong></span>
                </div>
                <table style="width:100%; font-size:0.8rem;"><thead><tr><th>Ticker</th><th style="text-align:right;">Beta</th><th style="text-align:right;">Adj. Drop</th><th style="text-align:right;">Est. Loss</th><th>Priority</th></tr></thead><tbody>${posTable}</tbody></table>
            </div>
        </div>`;
    }).join('');
}

async function loadCorrelationMatrix() {
    const btn = document.getElementById('corrMatrixBtn');
    const container = document.getElementById('correlationContainer');
    if (!container) return;
    btn.disabled = true;
    btn.textContent = 'Loading...';
    container.innerHTML = '<p style="color:var(--text-dim); font-size:13px;">Fetching historical prices and computing correlations...</p>';

    try {
        const resp = await fetch('/api/risk-analysis/correlation');
        const data = await resp.json();
        renderCorrelationMatrix(data.tickers, data.matrix);
    } catch (e) {
        container.innerHTML = '<p style="color:#ef4444;">Failed to load correlation data.</p>';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Reload Matrix';
    }
}

function renderRecoveryProjections(projections, totalMV) {
    const el = document.getElementById('recoveryProjectionContainer');
    if (!el || !projections || !projections.length) {
        if (el) el.innerHTML = '<p style="color:var(--text-dim);">No recovery data available.</p>';
        return;
    }

    const cards = projections.map(p => {
        const shapeColor = p.shape === 'V-shaped' ? '#22c55e' : p.shape === 'U-shaped' ? '#f59e0b' : '#ef4444';
        const years = p.recoveryYears;
        const yearsLabel = years < 1 ? p.recoveryMonths + ' mo' : years === 1 ? '1 yr' : years + ' yrs';

        // Mini sparkline path from recovery data
        const path = p.path || [];
        const maxVal = Math.max(...path.map(pt => pt.value), 1);
        const minVal = Math.min(...path.map(pt => pt.value), 0);
        const range = maxVal - minVal || 1;
        const w = 280, h = 50;
        const points = path.map((pt, i) => {
            const x = (i / Math.max(path.length - 1, 1)) * w;
            const y = h - ((pt.value - minVal) / range) * h;
            return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');

        const baselineY = (h - ((totalMV - minVal) / range) * h).toFixed(1);

        return '<div style="background:var(--card-hover); padding:14px; border-radius:10px; border-left:3px solid ' + shapeColor + ';">'
            + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">'
            + '<strong style="font-size:13px;">' + p.name + '</strong>'
            + '<span style="padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; background:' + shapeColor + '22; color:' + shapeColor + ';">' + p.shape + '</span>'
            + '</div>'
            + '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%; height:50px; margin:8px 0;">'
            + '<polyline points="' + points + '" fill="none" stroke="' + shapeColor + '" stroke-width="2" />'
            + '<line x1="0" y1="' + baselineY + '" x2="' + w + '" y2="' + baselineY + '" stroke="var(--text-dim)" stroke-width="0.5" stroke-dasharray="4,3" />'
            + '</svg>'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-dim);">'
            + '<span>Recovery: <strong style="color:var(--text);">' + yearsLabel + '</strong></span>'
            + '<span>Divs earned: <strong style="color:var(--text);">' + formatMoney(p.dividendsDuringRecovery) + '</strong></span>'
            + '</div>'
            + '<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">'
            + formatMoney(p.stressedValue) + ' → ' + formatMoney(p.finalValue)
            + '</div>'
            + '</div>';
    }).join('');

    el.innerHTML = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">' + cards + '</div>';
}

function renderCorrelationMatrix(tickers, matrix) {
    const el = document.getElementById('correlationContainer');
    if (!el || !tickers.length || !matrix.length) {
        if (el) el.innerHTML = '<p style="color:var(--text-dim);">Not enough data for correlation.</p>';
        return;
    }

    function corrColor(val) {
        if (val >= 0.8) return '#ef4444';
        if (val >= 0.5) return '#f59e0b';
        if (val >= 0.2) return '#fbbf24';
        if (val >= -0.2) return '#6b7280';
        return '#22c55e';
    }

    let html = '<table style="font-size:0.7rem; border-collapse:collapse;"><thead><tr><th></th>';
    tickers.forEach(t => { html += `<th style="padding:4px 6px; writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); font-weight:600;">${t}</th>`; });
    html += '</tr></thead><tbody>';
    matrix.forEach((row, i) => {
        html += `<tr><td style="padding:4px 8px; font-weight:600; white-space:nowrap;">${tickers[i]}</td>`;
        row.forEach((val, j) => {
            const bg = i === j ? 'var(--card-hover)' : corrColor(Math.abs(val)) + '33';
            const color = i === j ? 'var(--text-dim)' : corrColor(Math.abs(val));
            html += `<td style="padding:4px 6px; text-align:center; background:${bg}; color:${color}; font-weight:500;" title="${tickers[i]} vs ${tickers[j]}: ${val}">${i === j ? '1' : val.toFixed(2)}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
}
