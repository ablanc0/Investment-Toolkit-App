// ── Risk Analysis Tab ──

async function fetchRiskAnalysis() {
    try {
        var params = _getCustomScenarioParams();
        var url = '/api/risk-analysis' + (params ? '?' + params : '');
        var resp = await fetch(url);
        var data = await resp.json();
        renderRiskKpis(data.riskMetrics, data.marketMetrics);
        renderSectorConcentration(data.sectorConcentration);
        renderCustomScenarioInputs();
        renderStressTests(data.stressTests, data.totalMarketValue);
        renderRecoveryProjections(data.recoveryProjections, data.totalMarketValue);
    } catch (e) {
        console.error('Error loading risk analysis:', e);
    }
}

function _getCustomScenarioParams() {
    var drop = document.getElementById('customDrop');
    var sf = document.getElementById('customStressFactor');
    var rec = document.getElementById('customRecoveryYears');
    if (!drop || !sf || !rec) return '';
    return 'customDrop=' + drop.value + '&customStressFactor=' + sf.value + '&customRecoveryYears=' + rec.value;
}

function renderCustomScenarioInputs() {
    if (document.getElementById('customScenarioInputs')) return;
    var container = document.getElementById('stressTestContainer');
    if (!container) return;
    var wrapper = document.createElement('div');
    wrapper.id = 'customScenarioInputs';
    wrapper.style.cssText = 'background:var(--card); border:1px dashed #6366f144; padding:10px 16px; border-radius:10px; margin-bottom:12px; display:flex; align-items:center; gap:16px; flex-wrap:wrap;';
    wrapper.innerHTML = '<span style="font-size:12px; color:var(--text-dim); font-weight:600;">Custom Scenario</span>'
        + '<label style="font-size:11px; color:var(--text-dim);">S&P 500 Decline %'
        + '<input id="customDrop" type="number" value="-20" min="-100" max="0" step="1" style="width:60px; margin-left:4px; padding:3px 6px; background:var(--card-hover); border:1px solid var(--border); border-radius:6px; color:var(--text); font-size:12px;">'
        + '</label>'
        + '<label style="font-size:11px; color:var(--text-dim);">Stress Factor (VIX)'
        + '<input id="customStressFactor" type="number" value="1.2" min="1.0" max="3.0" step="0.1" style="width:56px; margin-left:4px; padding:3px 6px; background:var(--card-hover); border:1px solid var(--border); border-radius:6px; color:var(--text); font-size:12px;">'
        + '</label>'
        + '<label style="font-size:11px; color:var(--text-dim);">Recovery (years)'
        + '<input id="customRecoveryYears" type="number" value="1.0" min="0.1" max="30" step="0.5" style="width:56px; margin-left:4px; padding:3px 6px; background:var(--card-hover); border:1px solid var(--border); border-radius:6px; color:var(--text); font-size:12px;">'
        + '</label>'
        + '<button onclick="fetchRiskAnalysis()" style="padding:4px 12px; background:#6366f1; color:#fff; border:none; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">Apply</button>';
    container.parentNode.insertBefore(wrapper, container);
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
    el.innerHTML = scenarios.map(function(sc) {
        var dropColor = Math.abs(sc.drop) >= 50 ? '#ef4444' : Math.abs(sc.drop) >= 20 ? '#f59e0b' : '#6b7280';
        var sf = sc.stressFactor || 1;
        var sfBadge = sf > 1 ? '<span style="background:#6366f122; color:#a5b4fc; padding:2px 6px; border-radius:8px; font-size:10px; font-weight:600; margin-left:6px;">VIX x' + sf.toFixed(1) + '</span>' : '';
        var avgRecYrs = sc.avgRecoveryYears || 0;
        var recLabel = avgRecYrs < 1 ? Math.round(avgRecYrs * 12) + ' mo' : avgRecYrs.toFixed(1) + ' yrs';

        // Header with dual Normal | Max Stress
        var header = '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">'
            + '<div>'
            + '<strong>' + sc.name + '</strong>'
            + '<span style="color:var(--text-dim); font-size:12px; margin-left:8px;">' + sc.description + '</span>'
            + sfBadge
            + '</div>'
            + '<div style="display:flex; gap:16px; align-items:center; font-size:12px;">'
            + '<div style="text-align:right;">'
            + '<div style="color:var(--text-dim); font-size:10px;">Normal</div>'
            + '<span style="color:' + dropColor + '; font-weight:600;">' + (sc.normalDropPct || sc.stressedDropPct).toFixed(1) + '%</span>'
            + '<span style="color:var(--text-dim); margin-left:4px;">' + formatMoney(sc.normalTotalLoss || sc.totalEstimatedLoss) + '</span>'
            + '</div>'
            + '<div style="text-align:right;">'
            + '<div style="color:var(--text-dim); font-size:10px;">Max Stress</div>'
            + '<span style="color:#ef4444; font-weight:600;">' + (sc.maxStressDropPct || sc.stressedDropPct).toFixed(1) + '%</span>'
            + '<span style="color:var(--text-dim); margin-left:4px;">' + formatMoney(sc.maxStressTotalLoss || sc.totalEstimatedLoss) + '</span>'
            + '</div>'
            + '</div>'
            + '</div>';

        // Per-position table (all positions)
        var posRows = (sc.positions || []).map(function(p) {
            var nColor = p.normalLoss < 0 ? '#ef4444' : '#22c55e';
            var mColor = p.maxStressLoss < 0 ? '#ef4444' : '#22c55e';
            var prioColor = p.priority === 'HIGH' ? '#ef4444' : p.priority === 'MEDIUM' ? '#f59e0b' : '#22c55e';
            var recYrs = p.recoveryYears || 0;
            var recStr = recYrs < 1 ? Math.round(recYrs * 12) + ' mo' : recYrs.toFixed(1) + ' yrs';
            return '<tr>'
                + '<td><strong>' + p.ticker + '</strong></td>'
                + '<td style="text-align:right;">' + formatMoney(p.marketValue) + '</td>'
                + '<td style="text-align:right;">' + p.beta.toFixed(2) + '</td>'
                + '<td style="text-align:right;">' + p.normalDrop.toFixed(1) + '%</td>'
                + '<td style="text-align:right; color:' + nColor + ';">' + formatMoney(p.normalLoss) + '</td>'
                + '<td style="text-align:right;">' + p.maxStressDrop.toFixed(1) + '%</td>'
                + '<td style="text-align:right; color:' + mColor + ';">' + formatMoney(p.maxStressLoss) + '</td>'
                + '<td style="text-align:center;">' + recStr + '</td>'
                + '<td><span style="color:' + prioColor + '; font-size:11px; font-weight:600;">' + p.priority + '</span></td>'
                + '</tr>';
        }).join('');

        var detail = '<div class="stress-detail" style="display:none; margin-top:12px;">'
            + '<div style="display:flex; gap:16px; margin-bottom:8px; font-size:13px; flex-wrap:wrap;">'
            + '<span>S&P 500 Drop: <strong style="color:' + dropColor + '">' + sc.drop + '%</strong></span>'
            + '<span>Normal Value: <strong>' + formatMoney(sc.normalStressedValue || sc.stressedValue) + '</strong></span>'
            + '<span>Max Stress Value: <strong style="color:#ef4444;">' + formatMoney(sc.maxStressStressedValue || sc.stressedValue) + '</strong></span>'
            + '<span>Avg Recovery: <strong>' + recLabel + '</strong></span>'
            + '</div>'
            + '<div style="overflow-x:auto;"><table style="width:100%; font-size:0.78rem;"><thead><tr>'
            + '<th>Ticker</th><th style="text-align:right;">MV</th><th style="text-align:right;">Beta</th>'
            + '<th style="text-align:right;">Normal %</th><th style="text-align:right;">Normal $</th>'
            + '<th style="text-align:right;">Max Stress %</th><th style="text-align:right;">Max Stress $</th>'
            + '<th style="text-align:center;">Recovery</th><th>Risk</th>'
            + '</tr></thead><tbody>' + posRows + '</tbody></table></div>'
            + '</div>';

        var isCustom = sc.name === 'Custom Scenario';
        var cardBorder = isCustom ? 'border:1px dashed #6366f144;' : '';
        return '<div style="background:var(--card-hover); padding:12px 16px; border-radius:10px; margin-bottom:8px; cursor:pointer;' + cardBorder + '" onclick="this.querySelector(\'.stress-detail\').style.display = this.querySelector(\'.stress-detail\').style.display === \'none\' ? \'block\' : \'none\'">'
            + header + detail + '</div>';
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
    var el = document.getElementById('recoveryProjectionContainer');
    if (!el || !projections || !projections.length) {
        if (el) el.innerHTML = '<p style="color:var(--text-dim);">No recovery data available.</p>';
        return;
    }

    var cards = projections.map(function(p) {
        var shapeColor = p.shape === 'V-shaped' ? '#22c55e' : p.shape === 'U-shaped' ? '#f59e0b' : '#ef4444';
        var years = p.recoveryYears;
        var yearsLabel = years < 1 ? p.recoveryMonths + ' mo' : years === 1 ? '1 yr' : years + ' yrs';
        var norm = p.normal || {};
        var maxS = p.maxStress || {};
        var normalPath = norm.path || p.path || [];
        var maxPath = maxS.path || normalPath;

        // Compute sparkline bounds from both paths
        var allValues = normalPath.map(function(pt) { return pt.value; })
            .concat(maxPath.map(function(pt) { return pt.value; }));
        var maxVal = Math.max.apply(null, allValues.concat([1]));
        var minVal = Math.min.apply(null, allValues.concat([0]));
        var range = maxVal - minVal || 1;
        var w = 280, h = 60;

        function toPoints(path) {
            return path.map(function(pt, i) {
                var x = (i / Math.max(path.length - 1, 1)) * w;
                var y = h - ((pt.value - minVal) / range) * h;
                return x.toFixed(1) + ',' + y.toFixed(1);
            }).join(' ');
        }

        var normalPts = toPoints(normalPath);
        var maxPts = toPoints(maxPath);

        // Build band polygon (normal line forward, then max stress line reversed)
        var normalCoords = normalPath.map(function(pt, i) {
            var x = (i / Math.max(normalPath.length - 1, 1)) * w;
            var y = h - ((pt.value - minVal) / range) * h;
            return x.toFixed(1) + ',' + y.toFixed(1);
        });
        var maxCoords = maxPath.map(function(pt, i) {
            var x = (i / Math.max(maxPath.length - 1, 1)) * w;
            var y = h - ((pt.value - minVal) / range) * h;
            return x.toFixed(1) + ',' + y.toFixed(1);
        });
        var bandPoly = normalCoords.concat(maxCoords.slice().reverse()).join(' ');

        var baselineY = (h - ((totalMV - minVal) / range) * h).toFixed(1);

        // Values for stats
        var normStressed = norm.stressedValue || p.stressedValue || 0;
        var normFinal = norm.finalValue || p.finalValue || 0;
        var normDivs = norm.dividendsDuringRecovery || p.dividendsDuringRecovery || 0;
        var maxStressed = maxS.stressedValue || normStressed;
        var maxFinal = maxS.finalValue || normFinal;
        var maxDivs = maxS.dividendsDuringRecovery || normDivs;
        var avgPosRec = p.avgPositionRecoveryYears || 0;
        var avgPosLabel = avgPosRec < 1 ? Math.round(avgPosRec * 12) + ' mo' : avgPosRec.toFixed(1) + ' yrs';

        return '<div style="background:var(--card-hover); padding:14px; border-radius:10px; border-left:3px solid ' + shapeColor + ';">'
            + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">'
            + '<strong style="font-size:13px;">' + p.name + '</strong>'
            + '<span style="padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; background:' + shapeColor + '22; color:' + shapeColor + ';">' + p.shape + '</span>'
            + '</div>'
            // SVG with band between normal and max stress
            + '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%; height:60px; margin:8px 0;">'
            + '<polygon points="' + bandPoly + '" fill="' + shapeColor + '" opacity="0.12" />'
            + '<polyline points="' + normalPts + '" fill="none" stroke="' + shapeColor + '" stroke-width="2" />'
            + '<polyline points="' + maxPts + '" fill="none" stroke="' + shapeColor + '" stroke-width="1.5" stroke-dasharray="4,3" />'
            + '<line x1="0" y1="' + baselineY + '" x2="' + w + '" y2="' + baselineY + '" stroke="var(--text-dim)" stroke-width="0.5" stroke-dasharray="4,3" />'
            + '</svg>'
            // Legend
            + '<div style="display:flex; gap:12px; font-size:10px; color:var(--text-dim); margin-bottom:8px;">'
            + '<span><span style="display:inline-block; width:16px; height:2px; background:' + shapeColor + '; vertical-align:middle; margin-right:4px;"></span>Normal</span>'
            + '<span><span style="display:inline-block; width:16px; height:2px; background:' + shapeColor + '; vertical-align:middle; margin-right:4px; border-top:1px dashed ' + shapeColor + '; height:0;"></span>Max Stress</span>'
            + '</div>'
            // Stats grid: Normal vs Max Stress
            + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:12px;">'
            + '<div style="color:var(--text-dim);">Normal: <strong style="color:var(--text);">' + formatMoney(normStressed) + ' → ' + formatMoney(normFinal) + '</strong></div>'
            + '<div style="color:var(--text-dim);">Max Stress: <strong style="color:var(--text);">' + formatMoney(maxStressed) + ' → ' + formatMoney(maxFinal) + '</strong></div>'
            + '<div style="color:var(--text-dim);">Divs (normal): <strong style="color:var(--text);">' + formatMoney(normDivs) + '</strong></div>'
            + '<div style="color:var(--text-dim);">Divs (max): <strong style="color:var(--text);">' + formatMoney(maxDivs) + '</strong></div>'
            + '</div>'
            + '<div style="font-size:11px; color:var(--text-dim); margin-top:6px;">'
            + 'Recovery: <strong>' + yearsLabel + '</strong> · Avg position: <strong>' + avgPosLabel + '</strong>'
            + '</div>'
            + '</div>';
    }).join('');

    el.innerHTML = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px;">' + cards + '</div>';
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
