let _analyzerData = null; // stored for client-side recalculation
let _invtScoreLoaded = false;
let _invtScoreCache = null; // {score, label} from last InvT Score fetch

async function _fetchSummaryInvtScore(ticker) {
    if (_invtScoreCache) {
        _updateSummaryInvtScoreTile(_invtScoreCache.score, _invtScoreCache.label);
        return;
    }
    try {
        const data = await fetch(`/api/invt-score/${ticker}`).then(r => r.json());
        _invtScoreCache = { score: data.score, label: data.label };
        _updateSummaryInvtScoreTile(data.score, data.label);
    } catch(e) { _updateSummaryInvtScoreTile(null, null); }
}

function _updateSummaryInvtScoreTile(score, label) {
    const el = document.getElementById('summary-invt-score-value');
    if (!el) return;
    if (score != null) {
        const c = _invtScoreColor(score);
        el.textContent = Number(score).toFixed(1);
        el.style.color = c;
        const lbl = document.getElementById('summary-invt-score-label');
        if (lbl) { lbl.textContent = label || ''; lbl.style.color = c; }
    } else {
        el.textContent = 'N/A';
        el.style.color = 'var(--text-dim)';
    }
}

function recalcGraham() {
    if (!_analyzerData || !_analyzerData.valuation || !_analyzerData.valuation.graham) return;
    const g = _analyzerData.valuation.graham;
    const eps = g.eps;
    const basePE = parseFloat(document.getElementById('graham-basePE').value) || 7;
    const cg = parseFloat(document.getElementById('graham-cg').value) || 1;
    const growth = parseFloat(document.getElementById('graham-growth').value) || 0;
    const yieldBase = parseFloat(document.getElementById('graham-yieldBase').value) || 4.4;
    const yieldCurr = parseFloat(document.getElementById('graham-yieldCurr').value) || 5.3;
    const mos = parseFloat(document.getElementById('graham-mos').value) || 70;

    const adjMultiple = basePE + cg * growth;
    const bondAdj = yieldBase / yieldCurr;
    const iv = eps * adjMultiple * bondAdj;
    const mosIv = iv * (mos / 100);
    const price = _analyzerData.price || 0;
    const upside = price > 0 ? ((mosIv - price) / price * 100) : 0;

    document.getElementById('graham-adjMultiple').textContent = adjMultiple.toFixed(1);
    document.getElementById('graham-formula').textContent = `IV = EPS × (${basePE} + ${cg}g) × ${yieldBase} / ${yieldCurr}`;
    document.getElementById('graham-bondAdj').textContent = bondAdj.toFixed(4);
    // Update banner
    const bIv = document.getElementById('graham-banner-iv');
    if (bIv) bIv.textContent = formatMoney(iv);
    const bMos = document.getElementById('graham-banner-mos');
    if (bMos) bMos.textContent = formatMoney(mosIv);
    const bUp = document.getElementById('graham-banner-upside');
    if (bUp) { bUp.textContent = (upside >= 0 ? '+' : '') + upside.toFixed(1) + '%'; bUp.style.color = upside >= 0 ? '#22c55e' : '#ef4444'; }
    const sig = upside > 50 ? 'Strong Buy' : upside > 20 ? 'Buy' : upside > -10 ? 'Hold' : upside > -30 ? 'Expensive' : 'Overrated';
    const bannerSig = document.querySelector('#av-graham .model-result-signal span:last-child');
    if (bannerSig) { const sc = signalColor(sig); bannerSig.textContent = sig; bannerSig.style.background = sc.bg; bannerSig.style.color = sc.fg; }
}

function grahamPreset(mode) {
    if (mode === 'original') {
        document.getElementById('graham-basePE').value = 8.5;
        document.getElementById('graham-cg').value = 2;
    } else {
        document.getElementById('graham-basePE').value = 7;
        document.getElementById('graham-cg').value = 1;
    }
    const btnCons = document.getElementById('graham-mode-conservative');
    const btnOrig = document.getElementById('graham-mode-original');
    if (btnCons && btnOrig) {
        const active = 'font-size:0.7rem; padding:2px 8px; border-radius:4px; background:var(--accent); color:#fff;';
        const inactive = 'font-size:0.7rem; padding:2px 8px; border-radius:4px; background:transparent; color:var(--text-dim);';
        btnCons.style.cssText = mode === 'conservative' ? active : inactive;
        btnOrig.style.cssText = mode === 'original' ? active : inactive;
    }
    recalcGraham();
}

function _runDcf(baseFcf, growthRate, wacc, perpGrowth, totalDebt, totalCash, shares, mos, price) {
    let pvSum = 0, fcfVal = baseFcf;
    const projected = [];
    for (let yr = 1; yr <= 9; yr++) {
        fcfVal *= (1 + growthRate);
        const pv = fcfVal / Math.pow(1 + wacc, yr);
        pvSum += pv;
        projected.push({year: yr, fcf: fcfVal, pvFcf: pv});
    }
    if (wacc <= perpGrowth) return null;
    const terminal = fcfVal * (1 + perpGrowth) / (wacc - perpGrowth);
    const pvTerminal = terminal / Math.pow(1 + wacc, 9);
    const ev = pvSum + pvTerminal;
    const eqVal = ev - totalDebt + totalCash;
    const iv = shares > 0 ? eqVal / shares : 0;
    const mosIv = iv * (mos / 100);
    const upside = price > 0 ? ((mosIv - price) / price * 100) : 0;
    return {projected, terminal, pvTerminal, ev, eqVal, iv, mosIv, upside};
}

function _runDcfScenario(fcfPS, growth1, growth2, termFactor, discountRate) {
    const yearByYear = [];
    let currentFcf = fcfPS, pvSum = 0;
    for (let yr = 1; yr <= 10; yr++) {
        const g = yr <= 5 ? growth1 : growth2;
        currentFcf *= (1 + g);
        const pv = currentFcf / Math.pow(1 + discountRate, yr);
        pvSum += pv;
        yearByYear.push({year: yr, fcfPS: currentFcf, pv: pv});
    }
    const terminalValue = currentFcf * termFactor;
    const pvTerminal = terminalValue / Math.pow(1 + discountRate, 10);
    const iv = pvSum + pvTerminal;
    return {yearByYear, terminalValue, pvTerminal, iv};
}

function recalcDcfScenarios() {
    if (!_analyzerData || !_analyzerData.valuation || !_analyzerData.valuation.dcfScenarios) return;
    const e2 = _analyzerData.valuation.dcfScenarios;
    const fcfPS = parseFloat(document.getElementById('e2-fcfps').value) || e2.fcfPerShare;
    const discountPct = parseFloat(document.getElementById('e2-discount').value) || e2.discountRate;
    const discount = discountPct / 100;
    const mos = parseFloat(document.getElementById('e2-mos').value) || 70;
    const price = _analyzerData.price || 0;

    const scenarioKeys = ['base', 'best', 'worst'];
    let compositeIv = 0;

    for (const sc of scenarioKeys) {
        const g1 = parseFloat(document.getElementById(`e2-${sc}-g1`).value) / 100;
        const g2 = parseFloat(document.getElementById(`e2-${sc}-g2`).value) / 100;
        const tf = parseFloat(document.getElementById(`e2-${sc}-tf`).value);
        const prob = parseFloat(document.getElementById(`e2-${sc}-prob`).value) / 100;

        const result = _runDcfScenario(fcfPS, g1, g2, tf, discount);
        compositeIv += result.iv * prob;

        const tbody = document.getElementById(`e2-${sc}-tbody`);
        if (tbody) {
            tbody.innerHTML = result.yearByYear.map(r => `<tr>
                <td>${r.year}${r.year === 6 ? ' <span style="color:var(--text-dim);font-size:0.65rem;">(P2)</span>' : ''}</td>
                <td>$${r.fcfPS.toFixed(2)}</td>
                <td>$${r.pv.toFixed(2)}</td>
            </tr>`).join('') + `<tr style="font-weight:700; border-top:2px solid var(--border);">
                <td>Term</td>
                <td>$${result.terminalValue.toFixed(2)}</td>
                <td>$${result.pvTerminal.toFixed(2)}</td>
            </tr>`;
        }
        const ivEl = document.getElementById(`e2-${sc}-iv`);
        if (ivEl) ivEl.textContent = formatMoney(result.iv);
        const barEl = document.getElementById(`e2-${sc}-bar`);
        if (barEl) barEl.innerHTML = _e2ValueBar(result.iv, price);
    }

    const mosIv = compositeIv * (mos / 100);
    const upside = price > 0 ? ((mosIv - price) / price * 100) : 0;
    const diff = price > 0 ? ((compositeIv - price) / price * 100) : 0;
    const impliedGrowth = price > 0 ? (Math.pow(price / fcfPS / 15, 1/10) - 1) * 100 : 0;

    // Update banner
    const bIv = document.getElementById('e2-banner-iv');
    if (bIv) bIv.textContent = formatMoney(compositeIv);
    const bMos = document.getElementById('e2-banner-mos');
    if (bMos) bMos.textContent = formatMoney(mosIv);
    const bUp = document.getElementById('e2-banner-upside');
    if (bUp) { bUp.textContent = (upside >= 0 ? '+' : '') + upside.toFixed(1) + '%'; bUp.style.color = upside >= 0 ? '#22c55e' : '#ef4444'; }
    const sig = upside > 50 ? 'Strong Buy' : upside > 20 ? 'Buy' : upside > -10 ? 'Hold' : upside > -30 ? 'Expensive' : 'Overrated';
    const bannerSig = document.querySelector('#av-dcfScenarios .model-result-signal span:last-child');
    if (bannerSig) { const sc2 = signalColor(sig); bannerSig.textContent = sig; bannerSig.style.background = sc2.bg; bannerSig.style.color = sc2.fg; }
    // Update implied growth
    const hImpl = document.getElementById('e2-header-implied');
    if (hImpl) hImpl.textContent = impliedGrowth.toFixed(2) + '%';

    // Update sensitivity matrix
    const baseG1 = parseFloat(document.getElementById('e2-base-g1').value);
    const baseG2 = parseFloat(document.getElementById('e2-base-g2').value);
    const baseTf = parseFloat(document.getElementById('e2-base-tf').value);
    const sensEl = document.getElementById('e2-sensitivity');
    if (sensEl) sensEl.innerHTML = _e2SensitivityMatrix(fcfPS, baseG1, baseG2, discountPct, baseTf);

    // Update projection chart
    if (_analyzerData) {
        const chartData = JSON.parse(JSON.stringify(_analyzerData));
        const e2Copy = chartData.valuation.dcfScenarios;
        e2Copy.fcfPerShare = fcfPS;
        e2Copy.discountRate = discountPct;
        for (const sc of scenarioKeys) {
            e2Copy.scenarios[sc].growth1_5 = parseFloat(document.getElementById(`e2-${sc}-g1`).value);
            e2Copy.scenarios[sc].growth6_10 = parseFloat(document.getElementById(`e2-${sc}-g2`).value);
        }
        _renderE2Chart(chartData);
    }
}

function recalcSummaryCategory() {
    if (!_analyzerData || !_analyzerData.valuation) return;
    const v = _analyzerData.valuation;
    const cat = document.getElementById('summary-category').value;
    const weightSets = {
        'Growth': {dcf: 0.30, graham: 0.10, relative: 0.10, dcfScenarios: 0.50},
        'Value': {dcf: 0.15, graham: 0.30, relative: 0.25, dcfScenarios: 0.30},
        'Blend': {dcf: 0.25, graham: 0.20, relative: 0.20, dcfScenarios: 0.35},
    };
    const weights = weightSets[cat] || weightSets['Blend'];
    const models = {};
    if (v.dcf && v.dcf.ivPerShare > 0) models.dcf = v.dcf.ivPerShare;
    if (v.graham && v.graham.ivPerShare > 0) models.graham = v.graham.ivPerShare;
    if (v.relative && v.relative.ivPerShare > 0) models.relative = v.relative.ivPerShare;
    if (v.dcfScenarios && v.dcfScenarios.ivPerShare > 0) models.dcfScenarios = v.dcfScenarios.ivPerShare;
    const totalW = Object.keys(models).reduce((s, k) => s + (weights[k] || 0), 0);
    if (totalW <= 0) return;
    const composite = Object.keys(models).reduce((s, k) => s + models[k] * weights[k] / totalW, 0);
    const mosIv = composite * 0.70;
    const price = _analyzerData.price || 0;
    const upside = price > 0 ? ((mosIv - price) / price * 100) : 0;
    const signal = upside > 50 ? 'Strong Buy' : upside > 20 ? 'Buy' : upside > -10 ? 'Hold' : upside > -30 ? 'Expensive' : 'Overrated';

    // Update banner
    const bIv = document.getElementById('summary-banner-iv');
    if (bIv) bIv.textContent = formatMoney(composite);
    const bMos = document.getElementById('summary-banner-mos');
    if (bMos) bMos.textContent = formatMoney(mosIv);
    const bUp = document.getElementById('summary-banner-upside');
    if (bUp) { bUp.textContent = (upside >= 0 ? '+' : '') + upside.toFixed(1) + '%'; bUp.style.color = upside >= 0 ? '#22c55e' : '#ef4444'; }
    const bannerSig = document.querySelector('#av-summary .model-result-signal span:last-child');
    if (bannerSig) { const sc2 = signalColor(signal); bannerSig.textContent = signal; bannerSig.style.background = sc2.bg; bannerSig.style.color = sc2.fg; }

    // Update weight row in table
    const weightCells = document.querySelectorAll('#summary-weight-row td');
    const modelKeys = ['dcf', 'graham', 'relative', 'dcfScenarios'];
    if (weightCells.length > 1) {
        for (let i = 0; i < modelKeys.length; i++) {
            if (weightCells[i + 1]) weightCells[i + 1].textContent = weights[modelKeys[i]] ? (weights[modelKeys[i]] * 100).toFixed(0) + '%' : '—';
        }
    }

    // Update explanation text
    const catExplain = {
        'Growth': 'Growth stocks weight DCF Scenarios (50%) and DCF (30%) heavily — forward-looking cash flow projections best capture growth potential.',
        'Value': 'Value stocks weight Graham (30%) and Relative (25%) heavily — earnings-based and peer comparison models are most reliable for stable earners.',
        'Blend': 'Blend stocks use balanced weights across all models, with DCF Scenarios slightly favored (35%).',
    };
    const explainEl = document.getElementById('summary-cat-explain');
    if (explainEl) explainEl.textContent = catExplain[cat] || '';

    // Update InvT Composite IV in benchmarks card
    const compositeEl = document.getElementById('summary-composite-iv');
    if (compositeEl) compositeEl.textContent = formatMoney(composite);

    // Re-render number line with updated InvT IV
    const nlContainer = document.getElementById('summary-number-line');
    if (nlContainer) {
        const bm = _analyzerData.benchmarks || {};
        const fmpDcf = bm.fmpDcf || 0;
        const analystMean = bm.analystMean || _analyzerData.targetMeanPrice || 0;
        const analystLow = bm.analystLow || _analyzerData.targetLowPrice || 0;
        const analystHigh = bm.analystHigh || _analyzerData.targetHighPrice || 0;
        const fmpGraham = bm.fmpGrahamNumber || 0;
        const nlPoints = [
            {value: composite, label: 'InvT IV', color: 'var(--accent)'},
            {value: price, label: 'Price', color: '#94a3b8'},
        ];
        if (fmpDcf > 0) nlPoints.push({value: fmpDcf, label: 'FMP DCF', color: '#f59e0b'});
        if (fmpGraham > 0) nlPoints.push({value: fmpGraham, label: 'Graham #', color: '#a78bfa'});
        if (analystMean > 0) nlPoints.push({value: analystMean, label: 'Analyst', color: '#22d3ee'});
        const allVals = nlPoints.map(p => p.value).filter(v => v > 0);
        if (analystLow > 0) allVals.push(analystLow);
        if (analystHigh > 0) allVals.push(analystHigh);
        const nlMin = Math.min(...allVals) * 0.9;
        const nlMax = Math.max(...allVals) * 1.05;
        nlContainer.innerHTML = _ivNumberLine(nlPoints, nlMin, nlMax);
    }
}

async function saveCompositeIvToList() {
    if (!_analyzerData) return;
    const d = _analyzerData;
    const s = d.valuation?.summary;
    if (!s) return;
    // Read current composite IV from banner (may have been recalculated via category change)
    const bannerIv = document.getElementById('summary-banner-iv');
    const compositeIv = bannerIv ? parseFloat(bannerIv.textContent.replace(/[$,]/g, '')) : s.compositeIv;
    const cat = document.getElementById('summary-category')?.value || s.category;
    const bannerSig = document.querySelector('#av-summary .model-result-signal span:last-child');
    const signal = bannerSig ? bannerSig.textContent : s.signal;

    const body = {
        ticker: d.ticker || d.symbol || '',
        companyName: d.name || d.shortName || d.companyName || '',
        currentPrice: d.price || 0,
        intrinsicValue: compositeIv,
        targetPrice: d.targetMeanPrice || 0,
        week52Low: d.fiftyTwoWeekLow || 0,
        week52High: d.fiftyTwoWeekHigh || 0,
        sector: d.sector || '',
        category: cat,
        peRatio: d.trailingPE || 0,
        eps: d.earningsPerShare || d.trailingEps || 0,
        annualDividend: d.dividendRate || 0,
        dividendYield: d.dividendYield || 0,
        signal: signal,
        invtScore: _invtScoreCache || '',
    };
    try {
        const resp = await fetch('/api/intrinsic-values/upsert', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        const result = await resp.json();
        if (result.ok) {
            showSaveToast(`${result.ticker} ${result.action} in IV list`);
        } else {
            showSaveToast('Error saving IV', true);
        }
    } catch(e) {
        console.error(e);
        showSaveToast('Error saving IV', true);
    }
}

function rebuildFcfTable() {
    const tbody = document.getElementById('dcf-hist-tbody');
    if (!tbody || !window._dcfFcfLookup) return;
    const period = parseInt(document.getElementById('dcf-fcf-period').value) || 5;
    const latest = window._dcfLatestYear;
    const lookup = window._dcfFcfLookup;

    let rows = '';
    for (let i = period - 1; i >= 0; i--) {
        const year = latest - i;
        const hasFcf = lookup[String(year)] != null;
        const fcfVal = hasFcf ? lookup[String(year)] : '';
        const fcfDisplay = hasFcf ? Math.round(fcfVal) : '';
        rows += `<tr>
            <td>${year}</td>
            <td><input type="number" class="dcf-fcf-input form-input" data-year="${year}"
                value="${fcfDisplay}" placeholder="Enter FCF"
                style="width:130px; text-align:right; padding:2px 6px; font-size:0.82rem;${hasFcf ? '' : ' border-color:var(--accent); background: rgba(99,102,241,0.05);'}"
                onchange="recalcFcfGrowth()"></td>
            <td class="dcf-growth-cell" data-year="${year}" style="font-size:0.82rem;">—</td>
        </tr>`;
    }
    tbody.innerHTML = rows;
    recalcFcfGrowth();
}

function recalcFcfGrowth() {
    const inputs = document.querySelectorAll('.dcf-fcf-input');
    const pairs = [];
    inputs.forEach(inp => {
        const yr = parseInt(inp.dataset.year);
        const val = inp.value !== '' ? parseFloat(inp.value) : null;
        pairs.push({year: yr, fcf: val});
    });
    // Compute growth rates
    const growths = [];
    for (let i = 1; i < pairs.length; i++) {
        const cell = document.querySelector(`.dcf-growth-cell[data-year="${pairs[i].year}"]`);
        if (pairs[i].fcf != null && pairs[i-1].fcf != null && pairs[i-1].fcf > 0 && pairs[i].fcf > 0) {
            const g = (pairs[i].fcf - pairs[i-1].fcf) / pairs[i-1].fcf;
            growths.push(g);
            if (cell) {
                cell.textContent = (g * 100).toFixed(1) + '%';
                cell.style.color = g >= 0 ? '#22c55e' : '#ef4444';
            }
        } else {
            if (cell) { cell.textContent = '—'; cell.style.color = ''; }
        }
    }
    // First row has no growth
    const firstCell = document.querySelector(`.dcf-growth-cell[data-year="${pairs[0]?.year}"]`);
    if (firstCell) { firstCell.textContent = '—'; firstCell.style.color = ''; }

    // Trimmed mean (drop 20% extremes)
    let avgGrowth = 0;
    if (growths.length > 0) {
        const sorted = [...growths].sort((a, b) => a - b);
        const trimN = Math.floor(sorted.length * 0.2);
        const trimmed = sorted.slice(trimN, sorted.length - trimN || sorted.length);
        avgGrowth = trimmed.length > 0 ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length : 0;
    }
    const avgEl = document.getElementById('dcf-histAvgGrowth');
    if (avgEl) avgEl.textContent = (avgGrowth * 100).toFixed(1) + '%';

    // Update growth rate input (conservative: avg × 0.7)
    const growthInput = document.getElementById('dcf-growth');
    if (growthInput) {
        const projected = avgGrowth * 0.7;
        const capped = Math.max(-0.05, Math.min(projected, 0.30));
        growthInput.value = (capped * 100).toFixed(1);
    }

    recalcDcf();
}

function recalcDcf() {
    if (!_analyzerData || !_analyzerData.valuation || !_analyzerData.valuation.dcf) return;
    const dcf = _analyzerData.valuation.dcf;
    const riskFree = parseFloat(document.getElementById('dcf-riskFree').value) / 100 || 0.0425;
    const mktReturn = parseFloat(document.getElementById('dcf-mktReturn').value) / 100 || 0.10;
    const growthRate = parseFloat(document.getElementById('dcf-growth').value) / 100;
    const perpGrowth = parseFloat(document.getElementById('dcf-perpGrowth').value) / 100 || 0.025;
    const mos = parseFloat(document.getElementById('dcf-mos').value) || 70;

    // Recalc WACC
    const beta = dcf.beta;
    const costOfEquity = riskFree + beta * (mktReturn - riskFree);
    const debtW = dcf.debtToCapital / 100;
    const eqW = dcf.equityToCapital / 100;
    const costOfDebt = dcf.costOfDebt / 100;
    const wacc = Math.max(eqW * costOfEquity + debtW * costOfDebt, 0.05);

    // Get base FCF from the last filled row in the editable table
    let baseFcf = dcf.historicalFcf[dcf.historicalFcf.length - 1].fcf;
    const fcfInputs = document.querySelectorAll('.dcf-fcf-input');
    if (fcfInputs.length > 0) {
        for (let i = fcfInputs.length - 1; i >= 0; i--) {
            if (fcfInputs[i].value !== '') {
                baseFcf = parseFloat(fcfInputs[i].value);
                break;
            }
        }
    }
    const info = _analyzerData;
    const totalDebt = info.totalDebt || 0;
    const totalCash = info.totalCash || 0;
    const shares = info.sharesOutstanding || 0;
    const price = info.price || 0;
    if (shares <= 0) return;

    // Run pure DCF — single growth rate, 9 years
    const result = _runDcf(baseFcf, growthRate, wacc, perpGrowth, totalDebt, totalCash, shares, mos, price);
    if (!result) return;

    // Update display
    document.getElementById('dcf-costOfEquity').textContent = (costOfEquity * 100).toFixed(2) + '%';
    document.getElementById('dcf-wacc-display').textContent = (wacc * 100).toFixed(2) + '%';
    document.getElementById('dcf-ev').textContent = fmtBigNum(result.ev);
    document.getElementById('dcf-eqVal').textContent = fmtBigNum(result.eqVal);
    // Update banner
    const bIv = document.getElementById('dcf-banner-iv');
    if (bIv) bIv.textContent = formatMoney(result.iv);
    const bMos = document.getElementById('dcf-banner-mos');
    if (bMos) bMos.textContent = formatMoney(result.mosIv);
    const bUp = document.getElementById('dcf-banner-upside');
    if (bUp) { bUp.textContent = (result.upside >= 0 ? '+' : '') + result.upside.toFixed(1) + '%'; bUp.style.color = result.upside >= 0 ? '#22c55e' : '#ef4444'; }
    // Update banner signal
    const sig = result.upside > 50 ? 'Strong Buy' : result.upside > 20 ? 'Buy' : result.upside > -10 ? 'Hold' : result.upside > -30 ? 'Expensive' : 'Overrated';
    const bannerSig = document.querySelector('#av-dcf .model-result-signal span:last-child');
    if (bannerSig) { const sc = signalColor(sig); bannerSig.textContent = sig; bannerSig.style.background = sc.bg; bannerSig.style.color = sc.fg; }

    // Update projected FCF table
    const tbody = document.getElementById('dcf-proj-tbody');
    if (tbody) {
        tbody.innerHTML = result.projected.map(r => `<tr>
            <td>Year ${r.year}</td>
            <td>${fmtBigNum(r.fcf)}</td>
            <td>${fmtBigNum(r.pvFcf)}</td>
        </tr>`).join('') + `<tr style="font-weight: 700; border-top: 2px solid var(--border);">
            <td>Terminal Value</td>
            <td>${fmtBigNum(result.terminal)}</td>
            <td>${fmtBigNum(result.pvTerminal)}</td>
        </tr>`;
    }
}

function switchAnalyzerView(viewId) {
    document.querySelectorAll('.analyzer-subview').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.analyzer-subtab').forEach(t => t.classList.remove('active'));
    const view = document.getElementById('av-' + viewId);
    const tab = document.querySelector(`.analyzer-subtab[data-view="${viewId}"]`);
    if (view) view.classList.add('active');
    if (tab) tab.classList.add('active');
    if (viewId === 'invtScore' && !_invtScoreLoaded) loadInvtScore();
}

function renderAnalyzerHeader(d) {
    const rc = recColor(d.recommendationKey);
    const low52 = d.fiftyTwoWeekLow || 0;
    const high52 = d.fiftyTwoWeekHigh || 0;
    const pricePos = high52 > low52 ? ((d.price - low52) / (high52 - low52) * 100) : 50;
    // Summary signal badge if available
    const v = d.valuation || {};
    const s = v.summary;
    return `
        <div class="analyzer-header">
            <span class="ticker-badge">${escapeHtml(d.ticker)}</span>
            <div>
                <h2>${escapeHtml(d.name)}</h2>
                <span style="color: var(--text-dim); font-size: 0.85rem;">${escapeHtml(d.sector || '')} ${d.industry ? '· ' + escapeHtml(d.industry) : ''}</span>
            </div>
            <div style="margin-left: auto; text-align: right;">
                <div style="font-size: 1.6rem; font-weight: 700;">${formatMoney(d.price)}</div>
            </div>
        </div>
        <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-bottom:16px;">
            ${s && s.signal ? `<div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                <span style="font-size:0.65rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:0.5px;">InvT Valuation</span>
                <span style="background:${signalColor(s.signal).bg}; color:${signalColor(s.signal).fg}; font-size:1rem; font-weight:700; padding:6px 20px; border-radius:6px;">${s.signal}</span>
            </div>` : ''}
            ${d.recommendationKey ? `<div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                <span style="font-size:0.65rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:0.5px;">Wall St. Analysts (${d.analystConsensus ? d.analystConsensus.numberOfAnalysts : ''})</span>
                <span class="rec-badge" style="background:${rc.bg}; color:${rc.fg}; font-size:1rem; font-weight:700; padding:6px 20px; border-radius:6px;">${escapeHtml(d.recommendationKey.replace('_',' '))}</span>
            </div>` : ''}
            ${d.analystConsensus && d.analystConsensus.targetMean ? `<div style="display:flex; flex-direction:column; align-items:center; gap:2px; margin-left:auto;">
                <span style="font-size:0.65rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:0.5px;">Analyst Target</span>
                <span style="font-size:1rem; font-weight:700; color:var(--text);">${formatMoney(d.analystConsensus.targetLow)} — ${formatMoney(d.analystConsensus.targetMean)} — ${formatMoney(d.analystConsensus.targetHigh)}</span>
            </div>` : ''}
        </div>
        <div style="margin-bottom: 20px;">
            <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-dim); margin-bottom:4px;">
                <span>52W Low: ${formatMoney(low52)}</span>
                <span>52W High: ${formatMoney(high52)}</span>
            </div>
            <div class="analyzer-price-range">
                <div class="analyzer-price-bar"></div>
                <div class="analyzer-price-dot" style="left: ${Math.max(2, Math.min(98, pricePos))}%"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-dim); margin-top:4px;">
                <span>50D Avg: ${formatMoney(d.fiftyDayAvg)}</span>
                <span>200D Avg: ${formatMoney(d.twoHundredDayAvg)}</span>
            </div>
        </div>`;
}

function signalColor(signal) {
    const s = (signal || '').toLowerCase();
    if (s.includes('strong buy')) return {bg:'#4ade8020', fg:'#4ade80'};
    if (s.includes('buy')) return {bg:'#22d3ee20', fg:'#22d3ee'};
    if (s.includes('hold')) return {bg:'#f59e0b20', fg:'#f59e0b'};
    if (s.includes('expensive')) return {bg:'#fb923c20', fg:'#fb923c'};
    if (s.includes('overrated')) return {bg:'#f8717120', fg:'#f87171'};
    return {bg:'#6366f120', fg:'#6366f1'};
}

function ivResultBox(items) {
    return '<div class="iv-result-box">' + items.map(it => {
        const cls = it.colorClass || '';
        return `<div class="iv-result-item"><div class="label">${it.label}</div><div class="value ${cls}">${it.value}</div></div>`;
    }).join('') + '</div>';
}

function _modelResultBanner(opts) {
    const sc = signalColor(opts.signal);
    const up = opts.upside;
    const upColor = up >= 0 ? '#22c55e' : '#ef4444';
    return `<div class="model-result-banner">
        <div class="model-result-signal">
            <span style="font-size:0.65rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:0.5px;">${opts.label}</span>
            <span style="background:${sc.bg}; color:${sc.fg}; font-size:1.1rem; font-weight:700; padding:8px 24px; border-radius:8px;">${opts.signal}</span>
        </div>
        <div class="model-result-metrics">
            <div class="model-result-metric"><span class="label">IV / Share</span><span class="value" id="${opts.id}-banner-iv">${formatMoney(opts.iv)}</span></div>
            <div class="model-result-metric"><span class="label">MoS IV</span><span class="value" id="${opts.id}-banner-mos">${formatMoney(opts.mosIv)}</span></div>
            <div class="model-result-metric"><span class="label">Current Price</span><span class="value">${formatMoney(opts.price)}</span></div>
            <div class="model-result-metric"><span class="label">Upside</span><span class="value" id="${opts.id}-banner-upside" style="color:${upColor}">${(up >= 0 ? '+' : '') + up}%</span></div>
        </div>
    </div>`;
}

// ── InvT Score Tab ──────────────────────────────────────
function _invtScoreColor(s) {
    if (s >= 9) return '#4ade80';
    if (s >= 8) return '#22d3ee';
    if (s >= 6) return '#3b82f6';
    if (s >= 4) return '#f59e0b';
    return '#f87171';
}

const INVT_CAT_ORDER = ['growth', 'profitability', 'debt', 'efficiency', 'shareholder_returns'];

async function loadInvtScore(refresh = false) {
    const ticker = _analyzerData && _analyzerData.ticker;
    if (!ticker) return;
    const container = document.getElementById('invt-score-content');
    if (!container) return;
    container.innerHTML = '<p style="padding:20px; text-align:center; color:var(--text-dim);">Loading InvT Score...</p>';
    try {
        const qs = refresh ? '?refresh=true' : '';
        const resp = await fetch(`/api/invt-score/${ticker}${qs}`);
        if (!resp.ok) throw new Error('API error');
        const data = await resp.json();
        _invtScoreLoaded = true;
        _invtScoreCache = { score: data.score, label: data.label };
        container.innerHTML = renderInvtScore(data);
        renderInvtRadarChart(data);
        renderInvtMetricCharts(data);
    } catch (e) {
        container.innerHTML = '<p style="color:var(--red); padding:20px;">Failed to load InvT Score. Check console.</p>';
        console.error('InvT Score error:', e);
    }
}

// Score label descriptions (from Excel)
const INVT_SCORE_DESC = {
    'Elite \u{1F680}': 'A top-tier company with outstanding fundamentals. Strong growth, profitability, and financial efficiency, with a well-managed balance sheet.',
    'High Quality \u2705': 'A strong company with excellent fundamentals and few weaknesses. Reliable growth, profitability, and shareholder returns.',
    'Above Average \u{1F44D}': 'A good business with positive attributes but some weaknesses, such as inconsistent profitability or moderate growth challenges.',
    'Below Average \u{1F4C9}': 'A company with mixed fundamentals and notable concerns. Potential weaknesses in debt, profitability, or growth.',
    'Poor Quality \u{1F6A8}': 'A struggling business with significant weaknesses. High risk due to declining revenue, excessive debt, or poor profitability.',
    'Insufficient Data': 'Relatively new company and/or not enough data reported.',
};

// Metric descriptions for tooltips
const INVT_METRIC_DESC = {
    revenue_cagr: 'Measures how fast total sales are increasing or decreasing over time.',
    eps_cagr: 'Measures the growth in Earnings Per Share, showing how much profit the company generates per share.',
    fcf_share_cagr: 'Measures how much real cash a company generates per share, crucial for dividends, buybacks, and reinvestment.',
    gpm: 'Measures core profitability before operating expenses.',
    npm: 'Shows how much of each $1 in revenue turns into profit.',
    fcf_margin: 'Measures real cash profitability, a key indicator of financial strength.',
    net_debt_cagr: 'Measures whether debt is increasing or decreasing over time. Lower is better.',
    net_debt_fcf: 'Measures how much net debt a company has relative to its Free Cash Flow. Lower is better.',
    interest_cov: 'Measures how easily a company can cover its interest payments with operating profits. Higher is better.',
    div_yield: 'Measures how much cash return shareholders get as a percentage of stock price.',
    dps_cagr: 'Measures the rate at which dividends per share are increasing over time.',
    payout_ratio: 'Measures the percentage of earnings paid out as dividends. A moderate ratio is preferred.',
    fcf_payout: 'Measures how much of Free Cash Flow is used for dividends. A lower ratio indicates sustainability.',
    shares_cagr: 'Measures the change in outstanding shares. A declining number indicates share buybacks.',
    roa: 'Measures how efficiently a company generates profit from its assets.',
    roe: 'Measures profitability relative to equity — how efficiently management uses shareholder capital.',
    roic: 'Measures how well a company allocates its capital to generate returns.',
};

// Short names for compact collapsible table
const INVT_METRIC_SHORT = {
    'Revenue CAGR': 'Rev. CAGR',
    'EPS CAGR': 'EPS CAGR',
    'FCF/Share CAGR': 'FCF/Sh CAGR',
    'Gross Profit Margin': 'GPM',
    'Net Profit Margin': 'NPM',
    'FCF Margin': 'FCF Margin',
    'Net Debt CAGR': 'Net Debt CAGR',
    'Net Debt / FCF': 'ND/FCF',
    'Interest Coverage': 'Int. Coverage',
    'Dividend Yield': 'Div Yield',
    'Div/Share CAGR': 'DPS CAGR',
    'Payout Ratio': 'Payout %',
    'FCF Payout Ratio': 'FCF Payout %',
    'Shares Outstanding CAGR': 'Shares CAGR',
    'Return on Assets': 'ROA',
    'Return on Equity': 'ROE',
    'Return on Invested Capital': 'ROIC',
};

// Chart tooltip descriptions (keyed by yearlyData field)
const INVT_CHART_DESC = {
    revenue: INVT_METRIC_DESC.revenue_cagr,
    eps: INVT_METRIC_DESC.eps_cagr,
    fcfPerShare: INVT_METRIC_DESC.fcf_share_cagr,
    gpm: INVT_METRIC_DESC.gpm, npm: INVT_METRIC_DESC.npm, fcfMargin: INVT_METRIC_DESC.fcf_margin,
    netDebt: INVT_METRIC_DESC.net_debt_cagr, netDebtFcf: INVT_METRIC_DESC.net_debt_fcf, interestCov: INVT_METRIC_DESC.interest_cov,
    divYield: INVT_METRIC_DESC.div_yield, dps: INVT_METRIC_DESC.dps_cagr, divGrowth: 'Year-over-year growth rate of dividends per share.',
    payoutRatio: INVT_METRIC_DESC.payout_ratio, fcfPayout: INVT_METRIC_DESC.fcf_payout, sharesOut: INVT_METRIC_DESC.shares_cagr,
    roa: INVT_METRIC_DESC.roa, roe: INVT_METRIC_DESC.roe, roic: INVT_METRIC_DESC.roic,
};

// Per-category chart definitions matching Excel layout
const INVT_CHART_DEFS = {
    growth: [
        { key: 'revenue', title: 'Revenue', unit: '$', type: 'bar' },
        { key: 'eps', title: 'Earnings per Share', unit: '$', type: 'bar' },
        { key: 'fcfPerShare', title: 'FCF per Share', unit: '$', type: 'bar' },
    ],
    profitability: [
        { key: 'gpm', title: 'Gross Profit Margin', unit: '%', type: 'bar' },
        { key: 'npm', title: 'Net Profit Margin', unit: '%', type: 'bar' },
        { key: 'fcfMargin', title: 'FCF Margin', unit: '%', type: 'bar' },
    ],
    debt: [
        { key: 'netDebt', title: 'Net Debt', unit: '$', type: 'bar' },
        { key: 'netDebtFcf', title: 'Net Debt / FCF', unit: 'x', type: 'bar' },
        { key: 'interestCov', title: 'Interest Coverage', unit: 'x', type: 'bar' },
    ],
    shareholder_returns: [
        { key: 'divYield', title: 'Dividend Yield', unit: '%', type: 'line' },
        { key: 'dps', title: 'Dividends per Share', unit: '$', type: 'bar' },
        { key: 'divGrowth', title: 'Dividend Growth', unit: '%', type: 'bar' },
        { key: 'payoutRatio', title: 'Payout Ratio', unit: '%', type: 'bar' },
        { key: 'fcfPayout', title: 'FCF Payout Ratio', unit: '%', type: 'bar' },
        { key: 'sharesOut', title: 'Shares Outstanding', unit: '#', type: 'bar' },
    ],
    efficiency: [
        { key: 'roa', title: 'Return on Assets', unit: '%', type: 'bar' },
        { key: 'roe', title: 'Return on Equity', unit: '%', type: 'bar' },
        { key: 'roic', title: 'Return on Invested Capital', unit: '%', type: 'bar' },
    ],
};
const INVT_CAT_COLORS = {
    growth: '#4ade80', profitability: '#3b82f6', debt: '#f59e0b',
    efficiency: '#f97316', shareholder_returns: '#a78bfa',
};

function renderInvtScore(data) {
    const c = _invtScoreColor(data.score);
    const catOrder = INVT_CAT_ORDER;
    const updatedStr = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : '';

    // Section 1: Hero Banner
    let html = `
    <p style="color:var(--text-dim); font-size:12px; margin:0 0 16px 0;">Composite quality score (0–10) across four dimensions: Growth, Profitability, Debt Health, and Efficiency. Each metric is scored against sector benchmarks. 8+ is strong, 6–8 average, below 6 needs attention.</p>
    <div style="display:flex; align-items:center; gap:24px; margin-bottom:24px; flex-wrap:wrap;">
        <div style="position:relative; width:110px; height:110px; flex-shrink:0;">
            <svg viewBox="0 0 110 110" style="width:110px; height:110px; transform:rotate(-90deg);">
                <circle cx="55" cy="55" r="48" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
                <circle cx="55" cy="55" r="48" fill="none" stroke="${c}" stroke-width="8"
                    stroke-dasharray="${(data.score / 10) * 301.6} 301.6" stroke-linecap="round"/>
            </svg>
            <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <span style="font-size:1.8rem; font-weight:800; color:${c};">${data.score}</span>
                <span style="font-size:0.65rem; color:var(--text-dim);">/ 10</span>
            </div>
        </div>
        <div style="flex:1; min-width:200px;">
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="font-size:1.1rem; font-weight:700; color:${c}; margin-bottom:4px;">${escapeHtml(data.label)}</div>
                <button onclick="loadInvtScore(true)" title="Refresh" style="background:none; border:1px solid var(--border); border-radius:6px; padding:4px 8px; cursor:pointer; color:var(--text-dim); font-size:0.75rem; line-height:1;">&#x21bb;</button>
            </div>
            <div style="display:flex; gap:16px; font-size:0.82rem; color:var(--text-dim);">
                <span>10yr: <b style="color:var(--text);">${data.score10yr != null ? Number(data.score10yr).toFixed(1) : '—'}</b></span>
                <span>5yr: <b style="color:var(--text);">${data.score5yr != null ? Number(data.score5yr).toFixed(1) : '—'}</b></span>
                <span>Hybrid (70/30): <b style="color:${c};">${Number(data.score).toFixed(1)}</b></span>
            </div>
            ${data.shareholderReturnsScore != null ? `<div style="font-size:0.78rem; color:var(--text-dim); margin-top:4px;">
                Dividend & Buyback: <b style="color:#a78bfa;">${Number(data.shareholderReturnsScore).toFixed(1)}</b>
                <span style="font-size:0.68rem; opacity:0.7;">(informational, not in overall)</span>
            </div>` : ''}
            <div style="font-size:0.75rem; color:var(--text-dim); margin-top:6px; display:flex; gap:12px; flex-wrap:wrap;">
                <span>${data.years ? data.years[0] + '–' + data.years[data.years.length - 1] : ''} (${data.years ? data.years.length : 0} yr)</span>
                <span>Source: <strong style="color:var(--text);">${escapeHtml(data.dataSource)}</strong></span>
                ${updatedStr ? `<span>Updated: ${updatedStr}</span>` : ''}
            </div>
        </div>
        <div style="flex:1; min-width:240px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:8px; padding:12px 16px;">
            <div style="font-size:0.78rem; color:var(--text-dim); line-height:1.5;">${INVT_SCORE_DESC[data.label] || ''}</div>
        </div>
    </div>`;

    // Section 2: Radar Chart (1yr/5yr only) + Category Score Bars
    html += `<div class="invt-grid-2col" style="margin-bottom:24px;">
        <div class="analyzer-section" style="padding:16px;">
            <canvas id="invt-radar-chart" height="280"></canvas>
        </div>
        <div class="analyzer-section" style="padding:16px;">
            <div class="analyzer-section-title">Category Scores</div>
            ${catOrder.map(k => {
                const cat = data.categories[k];
                if (!cat) return '';
                const isInfo = cat.scored === false;
                const sc = cat.score;
                let prefix = '';
                if (isInfo) {
                    prefix = `<div style="border-top:1px dashed rgba(255,255,255,0.15); margin:8px 0 12px; padding-top:6px;">
                        <span style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em;">\u2139\uFE0F Informational</span>
                    </div>`;
                }
                if (sc == null) {
                    return prefix + `<div style="margin-bottom:14px; opacity:0.4;">
                        <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">
                            <span style="color:var(--text);">${escapeHtml(cat.label)}</span>
                            <span style="font-size:0.72rem; color:var(--text-dim);">${escapeHtml(cat.note || 'Insufficient data')}</span>
                        </div>
                        <div style="background:rgba(255,255,255,0.06); border-radius:6px; height:10px;"></div>
                    </div>`;
                }
                const col = _invtScoreColor(sc);
                const infoNote = isInfo ? ` <span style="font-size:0.68rem; color:var(--text-dim); font-weight:400;">(not in overall)</span>` : '';
                const noteStr = cat.note ? `<div style="font-size:0.68rem; color:var(--text-dim); margin-top:1px;">${escapeHtml(cat.note)}</div>` : '';
                const barStyle = isInfo ? 'border:1px dashed rgba(255,255,255,0.15);' : '';
                return prefix + `<div style="margin-bottom:14px;${isInfo ? ' opacity:0.75;' : ''}">
                    <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">
                        <span style="color:var(--text);">${escapeHtml(cat.label)}${infoNote}</span>
                        <span style="font-weight:700; color:${col};">${Number(sc).toFixed(1)}</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.06); border-radius:6px; height:10px; overflow:hidden;${barStyle}">
                        <div style="width:${sc * 10}%; height:100%; background:${col}; border-radius:6px; transition:width 0.4s;"></div>
                    </div>
                    <div style="display:flex; gap:12px; font-size:0.7rem; color:var(--text-dim); margin-top:2px;">
                        <span>10yr: ${cat.score10yr != null ? Number(cat.score10yr).toFixed(1) : '—'}</span><span>5yr: ${cat.score5yr != null ? Number(cat.score5yr).toFixed(1) : '—'}</span>
                    </div>
                    ${noteStr}
                </div>`;
            }).join('')}
        </div>
    </div>`;

    // Section 3: Per-category chart rows (3 charts per row, matching Excel)
    catOrder.forEach(k => {
        const cat = data.categories[k];
        if (!cat) return;
        const charts = INVT_CHART_DEFS[k];
        if (!charts) return;
        const col = INVT_CAT_COLORS[k] || '#6366f1';
        const sc = cat.score;
        const scCol = sc != null ? _invtScoreColor(sc) : 'var(--text-dim)';
        const isInfo = cat.scored === false;
        const scoreLabel = sc != null ? `<span style="color:${scCol};">${Number(sc).toFixed(1)}</span>` : `<span style="color:var(--text-dim);">—</span>`;
        const infoTag = isInfo ? ` <span style="font-size:0.68rem; color:var(--text-dim); font-weight:400;">(informational)</span>` : '';
        const sectionBorder = isInfo ? ' border-style:dashed;' : '';
        const noteStr = cat.note ? `<p style="color:var(--text-dim); font-size:0.8rem; padding:4px 0 0;">${escapeHtml(cat.note)}</p>` : '';

        html += `<div class="analyzer-section" style="margin-bottom:16px;${sectionBorder}">
            <div class="analyzer-section-title" style="color:${col};">${escapeHtml(cat.label)}${infoTag} — ${scoreLabel}</div>
            ${noteStr}
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
                ${charts.map(ch => {
                    const desc = INVT_CHART_DESC[ch.key] || '';
                    const tip = desc ? ` title="${desc}"` : '';
                    return `<div>
                    <div${tip} style="font-size:0.75rem; color:var(--text-dim); margin-bottom:6px; text-align:center; font-weight:600; cursor:${desc ? 'help' : 'default'};">${ch.title}</div>
                    <div style="position:relative; height:180px;"><canvas id="invt-mc-${ch.key}"></canvas></div>
                </div>`;
                }).join('')}
            </div>
        </div>`;
    });

    // Collapsible metric details
    html += `<details style="margin-top:8px;">
        <summary style="cursor:pointer; color:var(--text-dim); font-size:0.8rem; padding:8px 0;">Show metric details</summary>
        <div class="invt-grid-2col" style="margin-top:12px;">`;
    catOrder.forEach(k => {
        const cat = data.categories[k];
        if (!cat) return;
        const isInfo = cat.scored === false;
        const styles = [];
        if (k === 'shareholder_returns') styles.push('grid-column: span 2');
        if (isInfo) styles.push('border-style:dashed');
        const styleAttr = styles.length ? ` style="${styles.join('; ')};"` : '';
        const scDisplay = cat.score != null ? `<span style="color:${_invtScoreColor(cat.score)};">${Number(cat.score).toFixed(1)}</span>` : `<span style="color:var(--text-dim);">—</span>`;
        const infoTag = isInfo ? ' <span style="font-size:0.68rem; color:var(--text-dim);">(informational)</span>' : '';
        html += `<div class="analyzer-section"${styleAttr}>
            <div class="analyzer-section-title">${escapeHtml(cat.label)}${infoTag} — ${scDisplay}</div>
            <table class="fcf-table">
                <thead><tr><th>Metric</th><th>10yr</th><th>5yr</th><th>Score</th></tr></thead>
                <tbody>`;
        cat.metrics.forEach(m => {
            const s10 = m.score10yr ?? m.score5yr ?? 0;
            const s5 = m.score5yr ?? m.score10yr ?? 0;
            const avg = Math.round((s10 * 0.7 + s5 * 0.3) * 10) / 10;
            const mcol = _invtScoreColor(avg);
            const fmt = v => v == null ? '—' : (m.unit === '%' ? v.toFixed(2) + '%' : m.unit === 'x' ? v.toFixed(2) + 'x' : v.toFixed(2));
            const shortName = INVT_METRIC_SHORT[m.name] || m.name;
            const desc = INVT_METRIC_DESC[m.key] || '';
            const tip = desc ? ` title="${desc}"` : '';
            html += `<tr>
                <td${tip} style="cursor:${desc ? 'help' : 'default'};">${shortName}</td>
                <td>${fmt(m.value10yr)}</td>
                <td>${fmt(m.value5yr)}</td>
                <td><span style="display:inline-block; padding:3px 10px; border-radius:10px; font-size:0.8rem; font-weight:700; background:${mcol}20; color:${mcol};">${avg}</span></td>
            </tr>`;
        });
        html += '</tbody></table></div>';
    });
    html += '</div></details>';
    return html;
}

function renderInvtMetricCharts(data) {
    if (!data.yearlyData || !data.yearlyData.length) return;
    const yd = data.yearlyData;
    const years = yd.map(d => d.year);

    const fmtVal = (v, key) => {
        if (v == null) return '';
        if (key === 'revenue' || key === 'netDebt' || key === 'sharesOut') {
            const abs = Math.abs(v);
            if (abs >= 1e12) return (v / 1e12).toFixed(1) + 'T';
            if (abs >= 1e9) return (v / 1e9).toFixed(1) + 'B';
            if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        }
        return typeof v === 'number' ? v.toFixed(1) : v;
    };

    for (const catKey of INVT_CAT_ORDER) {
        const charts = INVT_CHART_DEFS[catKey];
        if (!charts) continue;
        const cat = data.categories[catKey];
        if (!cat) continue;
        const color = INVT_CAT_COLORS[catKey] || '#6366f1';

        for (const ch of charts) {
            const canvas = document.getElementById('invt-mc-' + ch.key);
            if (!canvas) continue;
            const vals = yd.map(d => d[ch.key]);
            // Show placeholder if all values are null/0
            if (vals.every(v => !v && v !== 0)) {
                const parent = canvas.parentElement;
                parent.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-dim); font-size:0.78rem; opacity:0.5; text-align:center; padding:12px;">No data reported</div>`;
                continue;
            }
            const suffix = ch.unit === '%' ? '%' : ch.unit === 'x' ? 'x' : '';
            const isLine = ch.type === 'line';
            const dsProps = isLine
                ? { fill: false, borderColor: color, borderWidth: 2, pointBackgroundColor: color, pointRadius: 3, tension: 0.3 }
                : { backgroundColor: color + '80', borderColor: color, borderWidth: 1, borderRadius: 3 };
            new Chart(canvas.getContext('2d'), {
                type: ch.type || 'bar',
                data: {
                    labels: years,
                    datasets: [{ data: vals, ...dsProps }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: { label: ctx => fmtVal(ctx.raw, ch.key) + suffix }
                        }
                    },
                    scales: {
                        x: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } }, grid: { display: false } },
                        y: {
                            ticks: {
                                color: 'rgba(255,255,255,0.3)', font: { size: 9 }, maxTicksLimit: 5,
                                callback: v => fmtVal(v, ch.key) + suffix
                            },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        }
                    }
                }
            });
        }
    }
}

function renderInvtRadarChart(data) {
    const canvas = document.getElementById('invt-radar-chart');
    if (!canvas) return;
    // Filter out N/A categories (non-dividend payers) from radar
    const catOrder = INVT_CAT_ORDER.filter(k => data.categories[k] && data.categories[k].score != null);
    const labels = catOrder.map(k => data.categories[k].label);
    const fiveYr = catOrder.map(k => data.categories[k].score10yr ?? 0);
    const oneYr = catOrder.map(k => data.categories[k].score5yr ?? 0);
    new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [
                { label: '10yr', data: fiveYr, borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.12)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#f87171' },
                { label: '5yr', data: oneYr, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#3b82f6' },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { r: { min: 0, max: 10, ticks: { stepSize: 2, color: 'rgba(255,255,255,0.3)', backdropColor: 'transparent' }, grid: { color: 'rgba(255,255,255,0.08)' }, pointLabels: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } } } },
            plugins: { legend: { labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 12, font: { size: 11 } } } }
        }
    });
}

function renderAnalyzerOverview(d) {
    let warningBar = '';
    if (d._warnings && d._warnings.length > 0) {
        const count = d._warnings.length;
        warningBar = `<div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:8px; padding:8px 12px; margin-bottom:12px; font-size:0.8rem; color:#f59e0b;">
            &#9888; ${count} data warning${count > 1 ? 's' : ''}: some fields may be missing or unavailable. Hover &#9888; icons for details.
        </div>`;
    }
    return warningBar + `
        <div class="analyzer-sections">
            <div class="analyzer-section">
                <div class="analyzer-section-title">📊 Valuation</div>
                ${statRow('Trailing P/E', d.trailingPE, null, 'trailingPE')}
                ${statRow('Forward P/E', d.forwardPE)}
                ${statRow('PEG Ratio', d.pegRatio)}
                ${statRow('Price/Book', d.priceToBook, 'x')}
                ${statRow('Price/Sales', d.priceToSales, 'x')}
                ${statRow('EV/EBITDA', d.evToEbitda, 'x')}
                ${statRow('EV/Revenue', d.evToRevenue, 'x')}
            </div>
            <div class="analyzer-section">
                <div class="analyzer-section-title">💰 Dividends</div>
                ${statRow('Dividend Yield', d.dividendYield, '%')}
                ${statRow('Dividend Rate', d.dividendRate, '$')}
                ${statRow('Payout Ratio', d.payoutRatio, '%')}
                ${statRow('5Y Avg Yield', d.fiveYearAvgDivYield, '%')}
            </div>
            <div class="analyzer-section">
                <div class="analyzer-section-title">📈 Profitability</div>
                ${statRow('Gross Margin', d.grossMargin, '%')}
                ${statRow('Operating Margin', d.operatingMargin, '%')}
                ${statRow('Profit Margin', d.profitMargin, '%')}
                ${statRow('Return on Equity', d.returnOnEquity, '%')}
                ${statRow('Return on Assets', d.returnOnAssets, '%')}
            </div>
            <div class="analyzer-section">
                <div class="analyzer-section-title">🏦 Financial Health</div>
                ${statRow('Debt/Equity', d.debtToEquity)}
                ${statRow('Current Ratio', d.currentRatio, 'x')}
                ${statRow('Quick Ratio', d.quickRatio, 'x')}
                ${statRow('Total Debt', d.totalDebt, 'big')}
                ${statRow('Total Cash', d.totalCash, 'big')}
            </div>
            <div class="analyzer-section">
                <div class="analyzer-section-title">🚀 Growth</div>
                ${statRow('Revenue Growth', d.revenueGrowth, '%')}
                ${statRow('Earnings Growth', d.earningsGrowth, '%')}
                ${statRow('EPS (TTM)', d.earningsPerShare, '$', 'earningsPerShare')}
                ${statRow('Forward EPS', d.forwardEps, '$')}
                ${statRow('Revenue/Share', d.revenuePerShare, '$')}
            </div>
            <div class="analyzer-section">
                <div class="analyzer-section-title">🎯 Analyst Targets</div>
                ${statRow('Target Low', d.targetLowPrice, '$')}
                ${statRow('Target Mean', d.targetMeanPrice, '$')}
                ${statRow('Target High', d.targetHighPrice, '$')}
                ${statRow('# of Analysts', d.numberOfAnalysts)}
                ${statRow('Recommendation', d.recommendationKey ? d.recommendationKey.replace('_',' ').toUpperCase() : null)}
            </div>
            <div class="analyzer-section">
                <div class="analyzer-section-title">📋 Key Metrics</div>
                ${statRow('Market Cap', d.marketCap, 'big')}
                ${statRow('Enterprise Value', d.enterpriseValue, 'big', 'enterpriseValue')}
                ${statRow('Beta', d.beta, null, 'beta')}
                ${statRow('Book Value', d.bookValue, '$', 'bookValue')}
                ${statRow('Short Ratio', d.shortRatio)}
            </div>
            <div class="analyzer-section">
                <div class="analyzer-section-title">💵 Cash Flow</div>
                ${statRow('Free Cash Flow', d.freeCashflow, 'big', 'freeCashflow')}
                ${statRow('Operating CF', d.operatingCashflow, 'big', 'operatingCashflow')}
                ${statRow('Total Revenue', d.totalRevenue, 'big', 'totalRevenue')}
            </div>
        </div>
        <div style="margin-top:8px; font-size:0.75rem; color:var(--text-dim); display:flex; gap:12px; flex-wrap:wrap;">
            ${(() => { const ds = d.dataSources || {}; return `
                <span>Profile: <strong style="color:var(--text);">${ds.profile || 'Yahoo Finance'}</strong></span>
                <span>Financials: <strong style="color:var(--text);">${ds.financials || 'SEC EDGAR'}</strong></span>
                <span>Peers: <strong style="color:var(--text);">${ds.peers || 'Finviz'}</strong></span>
            `; })()}
            <span style="margin-left:auto; color:var(--text-dim);">FMP: 250 calls/day</span>
        </div>`;
}

function renderAnalyzerDcf(d) {
    const dcf = (d.valuation || {}).dcf;
    if (!dcf) return '<p style="color: var(--text-dim); padding: 20px;">DCF model not available — insufficient financial data.</p>';

    const mosVal = 70;
    // Result banner at top
    let html = _modelResultBanner({
        id: 'dcf', label: 'DCF Model', iv: dcf.ivPerShare, mosIv: dcf.marginOfSafetyIv,
        price: d.price, upside: dcf.upside, signal: dcf.signal
    });

    // WACC components with editable inputs
    html += `<div class="valuation-card">
        <div class="valuation-card-title">WACC — Weighted Average Cost of Capital</div>
        <div class="wacc-grid">
            <div class="wacc-item">
                <span class="wlabel">Risk-Free Rate %</span>
                <input id="dcf-riskFree" type="number" step="0.25" value="${dcf.riskFreeRate}" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcf()">
            </div>
            <div class="wacc-item">
                <span class="wlabel">Market Return %</span>
                <input id="dcf-mktReturn" type="number" step="0.5" value="${dcf.marketReturn}" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcf()">
            </div>
            <div class="wacc-item"><span class="wlabel">Beta</span><span class="wvalue">${dcf.beta}</span></div>
            <div class="wacc-item"><span class="wlabel">Cost of Equity</span><span class="wvalue" id="dcf-costOfEquity">${dcf.costOfEquity}%</span></div>
            <div class="wacc-item"><span class="wlabel">Cost of Debt</span><span class="wvalue">${dcf.costOfDebt}%</span></div>
            <div class="wacc-item"><span class="wlabel">Tax Rate</span><span class="wvalue">${dcf.taxRate}%</span></div>
            <div class="wacc-item"><span class="wlabel">Debt Weight</span><span class="wvalue">${dcf.debtToCapital}%</span></div>
            <div class="wacc-item"><span class="wlabel">Equity Weight</span><span class="wvalue">${dcf.equityToCapital}%</span></div>
        </div>
        <div style="margin-top: 12px; font-size: 1.1rem; font-weight: 700; color: var(--accent);">WACC: <span id="dcf-wacc-display">${dcf.wacc}%</span></div>
    </div>`;

    // Historical FCF with editable values and period selector
    const apiYears = dcf.historicalFcf.map(r => ({year: String(r.year).replace(/^.*(\d{4}).*$/, '$1'), fcf: r.fcf}));
    const latestYear = apiYears.length > 0 ? parseInt(apiYears[apiYears.length - 1].year) : new Date().getFullYear();
    const fcfLookup = {};
    apiYears.forEach(r => fcfLookup[r.year] = r.fcf);

    const fcfYearCount = dcf.historicalFcf ? dcf.historicalFcf.length : 0;
    const fcfSource = (d.dataSources || {}).financials || 'Unknown';
    const fcfNotice = fcfYearCount < 10
        ? `<div style="margin-top:6px; padding:6px 10px; background:rgba(245,158,11,0.1); border-left:3px solid #f59e0b; border-radius:4px; font-size:0.78rem; color:#f59e0b;">
            &#9888; Only ${fcfYearCount} year${fcfYearCount !== 1 ? 's' : ''} available from <strong>${fcfSource}</strong>. Empty cells are editable — fill in manually for better accuracy.
           </div>`
        : '';
    html += `<div class="valuation-card">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div class="valuation-card-title" style="margin-bottom:0;">Historical Free Cash Flow</div>
            <div style="display:flex; align-items: center; gap: 8px; font-size: 0.82rem;">
                <span style="color: var(--text-dim);">Period:</span>
                <select id="dcf-fcf-period" class="form-input" style="padding:2px 8px; font-size:0.82rem;" onchange="rebuildFcfTable()">
                    <option value="5">5 Years</option>
                    <option value="10" ${fcfYearCount > 5 ? 'selected' : ''}>10 Years</option>
                </select>
            </div>
        </div>
        ${fcfNotice}
        <table class="fcf-table">
            <thead><tr><th>Year</th><th>FCF ($)</th><th>Growth</th></tr></thead>
            <tbody id="dcf-hist-tbody"></tbody>
        </table>
        <div style="margin-top: 8px; font-size: 0.82rem; color: var(--text-dim);">Historical Avg Growth: <strong style="color: var(--text);" id="dcf-histAvgGrowth">${dcf.histAvgGrowth}%</strong></div>
        <div style="margin-top: 8px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="color: var(--text-dim);">FCF Growth Rate %</span>
            <input id="dcf-growth" type="number" step="0.5" value="${dcf.growthRate}" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcf()">
            <span style="color: var(--text-dim); font-size: 0.78rem;">(conservative: avg × 0.7)</span>
        </div>
    </div>`;

    // Store FCF data globally for table rebuild
    window._dcfFcfLookup = fcfLookup;
    window._dcfLatestYear = latestYear;
    setTimeout(() => rebuildFcfTable(), 0);

    // Future Free Cash Flow (9 years)
    html += `<div class="valuation-card">
        <div class="valuation-card-title">Future Free Cash Flow (9 Years)</div>
        <div style="margin-bottom: 8px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="color: var(--text-dim);">Perpetual Growth %</span>
            <input id="dcf-perpGrowth" type="number" step="0.25" value="2.5" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcf()">
            <span style="color: var(--text-dim);">Margin of Safety %</span>
            <input id="dcf-mos" type="number" step="5" value="${mosVal}" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcf()">
        </div>
        <table class="fcf-table">
            <thead><tr><th>Year</th><th>FCF</th><th>PV of FCF</th></tr></thead>
            <tbody id="dcf-proj-tbody">${dcf.projectedFcf.map(r => `<tr>
                <td>Year ${r.year}</td>
                <td>${fmtBigNum(r.fcf)}</td>
                <td>${fmtBigNum(r.pvFcf)}</td>
            </tr>`).join('')}
            <tr style="font-weight: 700; border-top: 2px solid var(--border);">
                <td>Terminal Value</td>
                <td>${fmtBigNum(dcf.terminalValue)}</td>
                <td>${fmtBigNum(dcf.pvTerminal)}</td>
            </tr></tbody>
        </table>
    </div>`;

    // EV / Equity inline
    html += `<div style="display:flex; gap:16px; margin-top:8px; font-size:0.85rem;">
        <span style="color:var(--text-dim);">Enterprise Value: <strong id="dcf-ev" style="color:var(--text);">${fmtBigNum(dcf.enterpriseValue)}</strong></span>
        <span style="color:var(--text-dim);">Equity Value: <strong id="dcf-eqVal" style="color:var(--text);">${fmtBigNum(dcf.equityValue)}</strong></span>
    </div>`;

    // Data sources
    const ds = d.dataSources || {};
    html += `<div style="margin-top:8px; font-size:0.75rem; color:var(--text-dim); display:flex; gap:12px; flex-wrap:wrap;">
        <span>Financials: <strong style="color:var(--text);">${ds.financials || 'FMP'}</strong> (${fcfYearCount} yr)</span>
        <span>Profile: <strong style="color:var(--text);">${ds.profile || 'Yahoo Finance'}</strong></span>
        <span>Bonds: <strong style="color:var(--text);">${ds.bonds || 'FRED'}</strong></span>
    </div>`;

    return html;
}

function renderAnalyzerGraham(d) {
    const g = (d.valuation || {}).graham;
    if (!g) return '<p style="color: var(--text-dim); padding: 20px;">Graham model not available — no data.</p>';

    // Negative EPS warning
    if (g.negativeEps) {
        return `<div class="valuation-card">
            <div class="valuation-card-title">Graham Revised Formula</div>
            <div style="padding:20px; text-align:center;">
                <div style="font-size:1.2rem; color:#f59e0b; margin-bottom:8px;">&#9888; Negative EPS: ${formatMoney(g.eps)}</div>
                <div style="color:var(--text-dim);">Graham formula requires positive earnings. This model is not applicable for companies with negative EPS.</div>
            </div>
        </div>`;
    }

    const inputStyle = 'class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;"';
    const aaaDateLabel = g.aaaYieldDate ? ` (${g.aaaYieldDate.substring(0,7)})` : ' (live)';
    let html = _modelResultBanner({
        id: 'graham', label: 'Graham Formula', iv: g.ivPerShare, mosIv: g.marginOfSafetyIv,
        price: d.price, upside: g.upside, signal: g.signal
    });
    html += `
        <div class="valuation-card">
            <div class="valuation-card-title" style="display:flex; justify-content:space-between; align-items:center;">
                Graham Revised Formula
                <div style="display:inline-flex; gap:2px; background:var(--bg); border-radius:6px; padding:2px;">
                    <button id="graham-mode-conservative" class="btn btn-sm" style="font-size:0.7rem; padding:2px 8px; border-radius:4px; background:var(--accent); color:#fff;" onclick="grahamPreset('conservative')" title="Base P/E=7, Cg=1">Conservative</button>
                    <button id="graham-mode-original" class="btn btn-sm" style="font-size:0.7rem; padding:2px 8px; border-radius:4px; background:transparent; color:var(--text-dim);" onclick="grahamPreset('original')" title="Base P/E=8.5, Cg=2">Original</button>
                </div>
            </div>
            <div class="formula-display" id="graham-formula">IV = EPS × (${g.basePE} + ${g.cg}g) × ${g.aaaYieldBaseline} / ${g.aaaYieldCurrent}</div>
            <div class="wacc-grid">
                <div class="wacc-item"><span class="wlabel">EPS (TTM)</span><span class="wvalue">${formatMoney(g.eps)}</span></div>
                <div class="wacc-item">
                    <span class="wlabel">Earnings Growth (g) %</span>
                    <input id="graham-growth" type="number" step="0.1" value="${g.growthRate}" ${inputStyle} onchange="recalcGraham()">
                </div>
                <div class="wacc-item">
                    <span class="wlabel">Base P/E (no growth)</span>
                    <input id="graham-basePE" type="number" step="0.5" value="${g.basePE}" ${inputStyle} onchange="recalcGraham()">
                </div>
                <div class="wacc-item">
                    <span class="wlabel">Cg (growth multiplier)</span>
                    <input id="graham-cg" type="number" step="0.1" value="${g.cg}" ${inputStyle} onchange="recalcGraham()">
                </div>
                <div class="wacc-item"><span class="wlabel">Adjusted Multiple (${g.basePE} + ${g.cg}g)</span><span class="wvalue" id="graham-adjMultiple">${g.adjustedMultiple}</span></div>
                <div class="wacc-item">
                    <span class="wlabel">AAA Yield Baseline (Y) %</span>
                    <input id="graham-yieldBase" type="number" step="0.1" value="${g.aaaYieldBaseline}" ${inputStyle} onchange="recalcGraham()">
                </div>
                <div class="wacc-item">
                    <span class="wlabel">AAA Yield Current (C) %</span>
                    <input id="graham-yieldCurr" type="number" step="0.1" value="${g.aaaYieldCurrent}" ${inputStyle} onchange="recalcGraham()">
                </div>
                <div class="wacc-item"><span class="wlabel">Bond Adjustment (Y/C)</span><span class="wvalue" id="graham-bondAdj">${g.bondAdjustment}</span></div>
                <div class="wacc-item">
                    <span class="wlabel">Margin of Safety %</span>
                    <input id="graham-mos" type="number" step="1" value="70" ${inputStyle} onchange="recalcGraham()">
                </div>
            </div>
        </div>
        <div style="color:var(--text-dim); font-size:0.75rem; margin-top:8px; padding:0 12px;">
            Data: EPS &amp; earnings growth from FMP · AAA yield from FRED${aaaDateLabel}
        </div>`;
    return html;
}

function renderAnalyzerRelative(d) {
    const rel = (d.valuation || {}).relative;
    if (!rel) return '<p style="color: var(--text-dim); padding: 20px;">Relative valuation not available — insufficient data.</p>';

    const defs = rel.sectorDefaults || {pe: 20, evEbitda: 13, pb: 3};
    const pc = rel.peerComparison;
    const hasPeers = pc && pc.peers && pc.peers.length > 0;

    // Peer comparison table
    let peerHtml = '';
    if (hasPeers) {
        const fmt = v => v != null ? v.toFixed(1) + 'x' : '—';
        peerHtml = `<div class="valuation-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div class="valuation-card-title" style="margin-bottom:0;">Peer Comparison</div>
                <div style="display:flex; gap:4px; background:var(--bg); border-radius:6px; padding:2px;">
                    <button id="rel-mode-median" class="btn btn-sm" onclick="relApplyPeerAvg('median')" style="font-size:0.72rem; padding:3px 10px; background:var(--accent); color:#fff; border-radius:4px;">Median</button>
                    <button id="rel-mode-avg" class="btn btn-sm" onclick="relApplyPeerAvg('avg')" style="font-size:0.72rem; padding:3px 10px; background:transparent; color:var(--text-dim); border-radius:4px;">Average</button>
                </div>
            </div>
            <div style="overflow-x:auto;"><table class="fcf-table" style="font-size:0.82rem;">
                <thead><tr><th style="width:24px;"></th><th>Ticker</th><th>Company</th><th style="text-align:right;">P/E</th><th style="text-align:right;">EV/EBITDA</th><th style="text-align:right;">P/B</th></tr></thead>
                <tbody>
                    ${pc.peers.map((p, i) => `<tr>
                        <td><input type="checkbox" class="rel-peer-cb" data-idx="${i}" checked onchange="relUpdatePeerAvg()"></td>
                        <td style="font-weight:600; color:var(--accent);">${escapeHtml(p.ticker)}</td>
                        <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.name || '')}</td>
                        <td style="text-align:right;">${fmt(p.pe)}</td>
                        <td style="text-align:right;">${fmt(p.evEbitda)}</td>
                        <td style="text-align:right;">${fmt(p.pb)}</td>
                    </tr>`).join('')}
                </tbody>
                <tfoot>
                    <tr style="font-weight:600; border-top:2px solid var(--border);">
                        <td></td><td colspan="2" id="rel-peer-summary">Median (${pc.peers.length} peers)</td>
                        <td style="text-align:right;" id="rel-peer-avg-pe">${pc.medians.pe ? pc.medians.pe.toFixed(1) + 'x' : '—'}</td>
                        <td style="text-align:right;" id="rel-peer-avg-ev">${pc.medians.evEbitda ? pc.medians.evEbitda.toFixed(1) + 'x' : '—'}</td>
                        <td style="text-align:right;" id="rel-peer-avg-pb">${pc.medians.pb ? pc.medians.pb.toFixed(1) + 'x' : '—'}</td>
                    </tr>
                </tfoot>
            </table></div>
            <div style="font-size:0.72rem; color:var(--text-dim); margin-top:6px;">Source: Finviz · Check/uncheck peers to adjust averages</div>
        </div>`;
    }

    // Use peer medians if available, else sector defaults
    const initPE = (hasPeers && pc.medians.pe) ? pc.medians.pe : defs.pe;
    const initEV = (hasPeers && pc.medians.evEbitda) ? pc.medians.evEbitda : defs.evEbitda;
    const initPB = (hasPeers && pc.medians.pb) ? pc.medians.pb : defs.pb;

    let html = _modelResultBanner({
        id: 'relative', label: 'Relative Valuation', iv: rel.ivPerShare, mosIv: rel.marginOfSafetyIv,
        price: d.price, upside: rel.upside, signal: rel.signal
    });
    html += peerHtml;
    html += `
        <div class="valuation-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div class="valuation-card-title" style="margin-bottom:0;">Implied Fair Value — ${escapeHtml(rel.sector || 'Market Average')}</div>
                ${!hasPeers ? '<span style="font-size:0.72rem; color:var(--text-dim);">Sector defaults (no peer data)</span>' : ''}
            </div>
            <table class="fcf-table">
                <thead><tr><th>Metric</th><th>Stock</th><th>Peer Avg</th><th>Implied Price</th></tr></thead>
                <tbody>
                    <tr>
                        <td>P/E</td>
                        <td>${rel.metrics[0].stockVal ? rel.metrics[0].stockVal.toFixed(1) + 'x' : '—'}</td>
                        <td><input id="rel-pe" type="number" step="0.5" value="${initPE}" class="form-input" style="width:64px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcRelative()">x</td>
                        <td id="rel-pe-implied">—</td>
                    </tr>
                    <tr>
                        <td>EV/EBITDA</td>
                        <td>${rel.metrics[1].stockVal ? rel.metrics[1].stockVal.toFixed(1) + 'x' : '—'}</td>
                        <td><input id="rel-evEbitda" type="number" step="0.5" value="${initEV}" class="form-input" style="width:64px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcRelative()">x</td>
                        <td id="rel-ev-implied">—</td>
                    </tr>
                    <tr>
                        <td>P/B</td>
                        <td>${rel.metrics[2].stockVal ? rel.metrics[2].stockVal.toFixed(1) + 'x' : '—'}</td>
                        <td><input id="rel-pb" type="number" step="0.5" value="${initPB}" class="form-input" style="width:64px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcRelative()">x</td>
                        <td id="rel-pb-implied">—</td>
                    </tr>
                </tbody>
            </table>
            <div style="margin-top:8px; display:flex; align-items:center; gap:8px; font-size:0.85rem;">
                <span style="color:var(--text-dim);">Margin of Safety %</span>
                <input id="rel-mos" type="number" step="5" value="30" class="form-input" style="width:64px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcRelative()">
            </div>
        </div>
        <div style="font-size:0.72rem; color:var(--text-dim); margin-top:8px; padding:0 4px;">Data: EPS, book value & EBITDA from FMP · Peer multiples from Finviz</div>`;
    return html;
}

function relUpdatePeerAvg() {
    // Re-apply current mode when checkboxes change
    const btnMedian = document.getElementById('rel-mode-median');
    const isMedian = btnMedian && btnMedian.style.background.includes('var(--accent)');
    relApplyPeerAvg(isMedian ? 'median' : 'avg');
}

function relApplyPeerAvg(mode) {
    if (!_analyzerData) return;
    const rel = (_analyzerData.valuation || {}).relative;
    const pc = rel && rel.peerComparison;
    if (!pc || !pc.peers) return;

    const checkboxes = document.querySelectorAll('.rel-peer-cb');
    const selected = [];
    checkboxes.forEach(cb => { if (cb.checked) selected.push(pc.peers[parseInt(cb.dataset.idx)]); });
    if (selected.length === 0) return;

    const calc = (key) => {
        const vals = selected.filter(p => p[key] != null && p[key] > 0).map(p => p[key]).sort((a, b) => a - b);
        if (vals.length === 0) return null;
        if (mode === 'median') {
            const mid = Math.floor(vals.length / 2);
            return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
        }
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const pe = calc('pe'), ev = calc('evEbitda'), pb = calc('pb');
    if (pe != null) document.getElementById('rel-pe').value = pe.toFixed(1);
    if (ev != null) document.getElementById('rel-evEbitda').value = ev.toFixed(1);
    if (pb != null) document.getElementById('rel-pb').value = pb.toFixed(1);

    // Toggle button styles
    const btnMedian = document.getElementById('rel-mode-median');
    const btnAvg = document.getElementById('rel-mode-avg');
    if (btnMedian && btnAvg) {
        const active = 'background:var(--accent); color:#fff;';
        const inactive = 'background:transparent; color:var(--text-dim);';
        btnMedian.style.cssText = 'font-size:0.72rem; padding:3px 10px; border-radius:4px;' + (mode === 'median' ? active : inactive);
        btnAvg.style.cssText = 'font-size:0.72rem; padding:3px 10px; border-radius:4px;' + (mode === 'avg' ? active : inactive);
    }

    // Update footer label
    const label = mode === 'median' ? 'Median' : 'Avg';
    const fmt = v => v != null ? v.toFixed(1) + 'x' : '—';
    document.getElementById('rel-peer-summary').textContent = `${label} (${selected.length} peers)`;
    document.getElementById('rel-peer-avg-pe').textContent = fmt(pe);
    document.getElementById('rel-peer-avg-ev').textContent = fmt(ev);
    document.getElementById('rel-peer-avg-pb').textContent = fmt(pb);

    recalcRelative();
}

function recalcRelative() {
    if (!_analyzerData) return;
    const rel = (_analyzerData.valuation || {}).relative;
    if (!rel) return;
    const price = _analyzerData.price || 0;
    const eps = rel.eps || 0;
    const bookVal = rel.bookValue || 0;
    const ebitdaPS = rel.ebitdaPerShare || 0;

    const avgPE = parseFloat(document.getElementById('rel-pe').value) || 0;
    const avgEV = parseFloat(document.getElementById('rel-evEbitda').value) || 0;
    const avgPB = parseFloat(document.getElementById('rel-pb').value) || 0;
    const mosPct = parseFloat(document.getElementById('rel-mos').value) || 30;

    const peImpl = eps > 0 ? avgPE * eps : 0;
    const evImpl = ebitdaPS > 0 ? avgEV * ebitdaPS : 0;
    const pbImpl = bookVal > 0 ? avgPB * bookVal : 0;

    document.getElementById('rel-pe-implied').textContent = peImpl > 0 ? formatMoney(peImpl) : '—';
    document.getElementById('rel-ev-implied').textContent = evImpl > 0 ? formatMoney(evImpl) : '—';
    document.getElementById('rel-pb-implied').textContent = pbImpl > 0 ? formatMoney(pbImpl) : '—';

    const implied = [peImpl, evImpl, pbImpl].filter(v => v > 0);
    if (implied.length === 0) return;
    const iv = implied.reduce((a, b) => a + b, 0) / implied.length;
    const mosIv = iv * (1 - mosPct / 100);
    const upside = price > 0 ? ((mosIv - price) / price * 100) : 0;
    const upsideColor = upside >= 0 ? 'green' : 'red';

    // Update banner
    const bIv = document.getElementById('relative-banner-iv');
    if (bIv) bIv.textContent = formatMoney(iv);
    const bMos = document.getElementById('relative-banner-mos');
    if (bMos) bMos.textContent = formatMoney(mosIv);
    const bUp = document.getElementById('relative-banner-upside');
    if (bUp) { bUp.textContent = (upside >= 0 ? '+' : '') + upside.toFixed(1) + '%'; bUp.style.color = upside >= 0 ? '#22c55e' : '#ef4444'; }
    const sig = upside > 50 ? 'Strong Buy' : upside > 20 ? 'Buy' : upside > -10 ? 'Hold' : upside > -30 ? 'Expensive' : 'Overrated';
    const bannerSig = document.querySelector('#av-relative .model-result-signal span:last-child');
    if (bannerSig) { const sc = signalColor(sig); bannerSig.textContent = sig; bannerSig.style.background = sc.bg; bannerSig.style.color = sc.fg; }
}

// _e2ValueBar, _e2SensitivityMatrix defined in utils.js

function renderAnalyzerDcfScenarios(d) {
    const e2 = (d.valuation || {}).dcfScenarios;
    if (!e2) return '<p style="color: var(--text-dim); padding: 20px;">DCF Scenarios model not available — requires positive Free Cash Flow.</p>';

    const mosVal = 70;
    const price = d.price || 0;
    const compositeIv = e2.compositeIv;
    const mosIv = compositeIv * mosVal / 100;
    const diff = price > 0 ? ((compositeIv - price) / price * 100) : 0;
    const mos_pct = price > 0 ? ((mosIv - price) / price * 100).toFixed(1) : '0';
    // Implied growth: what growth rate would justify current price
    const impliedGrowth = price > 0 ? (Math.pow(price / e2.fcfPerShare / 15, 1/10) - 1) * 100 : 0;

    // Result banner at top
    let html = _modelResultBanner({
        id: 'e2', label: 'DCF Scenarios', iv: compositeIv, mosIv: mosIv,
        price: price, upside: e2.upside, signal: e2.signal
    });

    // Global inputs card
    html += `<div class="valuation-card">
        <div class="valuation-card-title">DCF Scenarios — Multi-Scenario Intrinsic Value</div>
        <div class="wacc-grid">
            <div class="wacc-item">
                <span class="wlabel">FCF / Share</span>
                <input id="e2-fcfps" type="number" step="0.01" value="${e2.fcfPerShare}" class="form-input" style="width:90px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcfScenarios()">
            </div>
            <div class="wacc-item">
                <span class="wlabel">Discount Rate %</span>
                <input id="e2-discount" type="number" step="0.25" value="${e2.discountRate}" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcfScenarios()">
            </div>
            <div class="wacc-item"><span class="wlabel">WACC (computed)</span><span class="wvalue">${e2.wacc}%</span></div>
            <div class="wacc-item">
                <span class="wlabel">Margin of Safety %</span>
                <input id="e2-mos" type="number" step="5" value="${mosVal}" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcfScenarios()">
            </div>
            <div class="wacc-item"><span class="wlabel">Implied Growth</span><span class="wvalue" id="e2-header-implied">${impliedGrowth.toFixed(2)}%</span></div>
        </div>
    </div>`;

    // Compact scenario comparison table
    const scenarioOrder = [
        {key: 'base', label: 'Base', color: 'var(--accent)'},
        {key: 'best', label: 'Best', color: '#22c55e'},
        {key: 'worst', label: 'Worst', color: '#ef4444'},
    ];
    html += `<div class="valuation-card">
        <div class="valuation-card-title">Scenario Comparison</div>
        <table class="fcf-table" style="font-size:0.85rem;">
            <thead><tr>
                <th></th>
                ${scenarioOrder.map(s => `<th style="text-align:center; color:${s.color};">${s.label}</th>`).join('')}
            </tr></thead>
            <tbody>
                <tr><td style="color:var(--text-dim);">Growth 1-5 yrs %</td>${scenarioOrder.map(s => `<td style="text-align:center;"><input id="e2-${s.key}-g1" type="number" step="0.5" value="${e2.scenarios[s.key].growth1_5}" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcfScenarios()"></td>`).join('')}</tr>
                <tr><td style="color:var(--text-dim);">Growth 6-10 yrs %</td>${scenarioOrder.map(s => `<td style="text-align:center;"><input id="e2-${s.key}-g2" type="number" step="0.5" value="${e2.scenarios[s.key].growth6_10}" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcfScenarios()"></td>`).join('')}</tr>
                <tr><td style="color:var(--text-dim);">Terminal Multiple</td>${scenarioOrder.map(s => `<td style="text-align:center;"><input id="e2-${s.key}-tf" type="number" step="0.5" value="${e2.scenarios[s.key].terminalFactor}" class="form-input" style="width:72px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcfScenarios()"></td>`).join('')}</tr>
                <tr><td style="color:var(--text-dim);">Probability %</td>${scenarioOrder.map(s => `<td style="text-align:center;"><input id="e2-${s.key}-prob" type="number" step="5" value="${e2.scenarios[s.key].probability}" class="form-input" style="width:60px; text-align:right; padding:2px 6px; font-size:0.85rem;" onchange="recalcDcfScenarios()"></td>`).join('')}</tr>
                <tr style="font-weight:700; border-top:2px solid var(--border);">
                    <td>IV / Share</td>
                    ${scenarioOrder.map(s => `<td style="text-align:center; font-size:1rem;" id="e2-${s.key}-iv">${formatMoney(e2.scenarios[s.key].ivPerShare)}</td>`).join('')}
                </tr>
            </tbody>
        </table>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-top:12px;">
            ${scenarioOrder.map(s => `<div id="e2-${s.key}-bar">${_e2ValueBar(e2.scenarios[s.key].ivPerShare, price)}</div>`).join('')}
        </div>
    </div>`;

    // FCF/PS Projection Chart — all 3 scenarios + implied growth
    html += `<div class="valuation-card">
        <div class="valuation-card-title">Estimated Growth vs Implied Growth</div>
        <canvas id="e2-projection-chart" height="180"></canvas>
    </div>`;

    // Collapsible year-by-year detail
    html += `<div class="valuation-card" style="padding-bottom:0;">
        <div onclick="const d=this.parentElement.querySelector('.e2-detail'); d.classList.toggle('e2-collapsed'); this.querySelector('.e2-toggle').textContent = d.classList.contains('e2-collapsed') ? '▶' : '▼';"
             style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding-bottom:12px;">
            <div class="valuation-card-title" style="margin-bottom:0;">Year-by-Year Detail</div>
            <span class="e2-toggle" style="color:var(--text-dim); font-size:0.8rem;">▶</span>
        </div>
        <div class="e2-detail e2-collapsed">
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; padding-bottom:16px;">
            ${scenarioOrder.map(s => {
                const data = e2.scenarios[s.key];
                return `<div>
                    <div style="font-size:0.8rem; font-weight:600; color:${s.color}; margin-bottom:6px;">${s.label}</div>
                    <table class="fcf-table" style="font-size:0.78rem;">
                        <thead><tr><th>Year</th><th>FCF/PS</th><th>PV</th></tr></thead>
                        <tbody id="e2-${s.key}-tbody">${data.yearByYear.map(r => `<tr>
                            <td>${r.year}${r.year === 6 ? ' <span style="color:var(--text-dim);font-size:0.65rem;">(P2)</span>' : ''}</td>
                            <td>$${r.fcfPS.toFixed(2)}</td>
                            <td>$${r.pv.toFixed(2)}</td>
                        </tr>`).join('')}
                        <tr style="font-weight:700; border-top:2px solid var(--border);">
                            <td>Term</td>
                            <td>$${data.terminalValue.toFixed(2)}</td>
                            <td>$${data.pvTerminal.toFixed(2)}</td>
                        </tr></tbody>
                    </table>
                </div>`;
            }).join('')}
            </div>
        </div>
    </div>`;

    // Sensitivity matrix for Base scenario
    const baseData = e2.scenarios.base;
    html += `<div class="valuation-card" id="e2-sensitivity">${_e2SensitivityMatrix(e2.fcfPerShare, baseData.growth1_5, baseData.growth6_10, e2.discountRate, baseData.terminalFactor)}</div>`;

    // (Composite result is in the top banner)

    // Data sources
    const ds = d.dataSources || {};
    html += `<div style="margin-top:8px; font-size:0.75rem; color:var(--text-dim); display:flex; gap:12px; flex-wrap:wrap;">
        <span>Financials: <strong style="color:var(--text);">${ds.financials || 'FMP'}</strong></span>
        <span>Profile: <strong style="color:var(--text);">${ds.profile || 'Yahoo Finance'}</strong></span>
        <span>WACC: <strong style="color:var(--text);">${ds.ratios || 'Computed'}</strong></span>
    </div>`;

    return html;
}

// _ivNumberLine defined in utils.js

function renderAnalyzerSummary(d) {
    const v = d.valuation || {};
    const s = v.summary;
    if (!s) return '<p style="color: var(--text-dim); padding: 20px;">No valuation models produced valid results.</p>';

    const price = d.price || 0;

    // 1. Result banner at top with save button integrated
    const _sc = signalColor(s.signal);
    const _up = s.upside;
    const _upColor = _up >= 0 ? '#22c55e' : '#ef4444';
    let html = `<div class="model-result-banner">
        <div class="model-result-signal">
            <span style="font-size:0.65rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:0.5px;">INVT Valuation</span>
            <span style="background:${_sc.bg}; color:${_sc.fg}; font-size:1.1rem; font-weight:700; padding:8px 24px; border-radius:8px;">${s.signal}</span>
        </div>
        <div class="model-result-metrics">
            <div class="model-result-metric"><span class="label">IV / Share</span><span class="value" id="summary-banner-iv">${formatMoney(s.compositeIv)}</span></div>
            <div class="model-result-metric"><span class="label">MoS IV</span><span class="value" id="summary-banner-mos">${formatMoney(s.marginOfSafetyIv)}</span></div>
            <div class="model-result-metric"><span class="label">Current Price</span><span class="value">${formatMoney(price)}</span></div>
            <div class="model-result-metric"><span class="label">Upside</span><span class="value" id="summary-banner-upside" style="color:${_upColor}">${(_up >= 0 ? '+' : '') + _up}%</span></div>
        </div>
        <div style="display:flex; align-items:center;">
            <button onclick="saveCompositeIvToList()" style="background:var(--accent); color:#fff; border:none; padding:6px 14px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer; white-space:nowrap;">Save to IV List</button>
        </div>
    </div>`;

    // 2. Valuation style + weight explanation (editable dropdown)
    const catExplain = {
        'Growth': 'Growth stocks weight DCF Scenarios (50%) and DCF (30%) heavily — forward-looking cash flow projections best capture growth potential.',
        'Value': 'Value stocks weight Graham (30%) and Relative (25%) heavily — earnings-based and peer comparison models are most reliable for stable earners.',
        'Blend': 'Blend stocks use balanced weights across all models, with DCF Scenarios slightly favored (35%).',
    };
    html += `<div class="valuation-card" style="text-align:center; padding:12px 24px;">
        <span style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:1px;">Valuation Style: </span>
        <select id="summary-category" class="form-input" style="width:auto; padding:2px 8px; font-size:0.9rem; font-weight:700; text-align:center;" onchange="recalcSummaryCategory()">
            <option value="Growth"${s.category === 'Growth' ? ' selected' : ''}>Growth</option>
            <option value="Value"${s.category === 'Value' ? ' selected' : ''}>Value</option>
            <option value="Blend"${s.category === 'Blend' ? ' selected' : ''}>Blend</option>
        </select>
        <div id="summary-cat-explain" style="font-size:0.75rem; color:var(--text-dim); margin-top:6px;">${catExplain[s.category] || ''}</div>
    </div>`;

    // 3. Model comparison table
    const models = [
        {key: 'dcf', name: 'DCF', data: v.dcf},
        {key: 'graham', name: 'Graham', data: v.graham},
        {key: 'relative', name: 'Relative', data: v.relative},
        {key: 'dcfScenarios', name: 'DCF Scenarios', data: v.dcfScenarios},
    ];
    html += `<div class="valuation-card">
        <div class="valuation-card-title">Model Comparison</div>
        <table class="fcf-table" style="font-size:0.85rem;">
            <thead><tr>
                <th></th>
                ${models.map(m => `<th style="text-align:center;">${m.name}</th>`).join('')}
            </tr></thead>
            <tbody>
                <tr><td style="color:var(--text-dim);">IV / Share</td>${models.map(m => {
                    if (!m.data) return '<td style="text-align:center; color:var(--text-dim);">N/A</td>';
                    return `<td style="text-align:center; font-weight:700;">${formatMoney(m.data.ivPerShare)}</td>`;
                }).join('')}</tr>
                <tr><td style="color:var(--text-dim);">Upside</td>${models.map(m => {
                    if (!m.data) return '<td style="text-align:center; color:var(--text-dim);">—</td>';
                    const up = m.data.upside;
                    const c = up >= 0 ? '#22c55e' : '#ef4444';
                    return `<td style="text-align:center; color:${c};">${up >= 0 ? '+' : ''}${up}%</td>`;
                }).join('')}</tr>
                <tr id="summary-weight-row"><td style="color:var(--text-dim);">Weight</td>${models.map(m => {
                    const w = s.weights[m.key] ? (s.weights[m.key] * 100).toFixed(0) + '%' : '—';
                    return `<td style="text-align:center;">${w}</td>`;
                }).join('')}</tr>
                <tr><td style="color:var(--text-dim);">Signal</td>${models.map(m => {
                    if (!m.data) return '<td style="text-align:center; color:var(--text-dim);">—</td>';
                    const sc = signalColor(m.data.signal || '');
                    return `<td style="text-align:center;"><span style="background:${sc.bg}; color:${sc.fg}; font-size:0.72rem; padding:2px 8px; border-radius:6px;">${m.data.signal || '—'}</span></td>`;
                }).join('')}</tr>
            </tbody>
        </table>
        <div style="display:grid; grid-template-columns:repeat(${models.filter(m=>m.data).length}, 1fr); gap:12px; margin-top:12px;">
            ${models.filter(m => m.data).map(m => `<div>${_e2ValueBar(m.data.ivPerShare, price)}</div>`).join('')}
        </div>
    </div>`;

    // 4. External benchmarks
    const bm = d.benchmarks || {};
    const fmpDcf = bm.fmpDcf || 0;
    const fmpGraham = bm.fmpGrahamNumber || 0;
    const fmpRating = bm.fmpRating || '';
    const fmpRatingScore = bm.fmpRatingScore || 0;
    const fmpAltmanZ = bm.fmpAltmanZ || 0;
    const fmpPiotroski = bm.fmpPiotroski || 0;
    const fmpEarningsYield = bm.fmpEarningsYield || 0;
    const fmpFcfYield = bm.fmpFcfYield || 0;
    const fmpRoic = bm.fmpRoic || 0;
    const analystMean = bm.analystMean || d.targetMeanPrice || 0;
    const analystHigh = bm.analystHigh || d.targetHighPrice || 0;
    const analystLow = bm.analystLow || d.targetLowPrice || 0;
    const analystCount = bm.analystCount || d.numberOfAnalysts || 0;

    // Number line points
    const nlPoints = [
        {value: s.compositeIv, label: 'InvT IV', color: 'var(--accent)'},
        {value: price, label: 'Price', color: '#94a3b8'},
    ];
    if (fmpDcf > 0) nlPoints.push({value: fmpDcf, label: 'FMP DCF', color: '#f59e0b'});
    if (fmpGraham > 0) nlPoints.push({value: fmpGraham, label: 'Graham #', color: '#a78bfa'});
    if (analystMean > 0) nlPoints.push({value: analystMean, label: 'Analyst', color: '#22d3ee'});
    const allVals = nlPoints.map(p => p.value).filter(v => v > 0);
    if (analystLow > 0) allVals.push(analystLow);
    if (analystHigh > 0) allVals.push(analystHigh);
    const nlMin = Math.min(...allVals) * 0.9;
    const nlMax = Math.max(...allVals) * 1.05;

    // Rating badge color
    const ratingColors = {S:'#4ade80', A:'#22d3ee', B:'#60a5fa', C:'#f59e0b', D:'#f87171', F:'#ef4444'};
    const ratingColor = ratingColors[fmpRating] || '#64748b';

    // Altman Z interpretation
    const zLabel = fmpAltmanZ > 2.99 ? 'Safe' : fmpAltmanZ > 1.81 ? 'Grey Zone' : fmpAltmanZ > 0 ? 'Distress' : '';
    const zColor = fmpAltmanZ > 2.99 ? '#4ade80' : fmpAltmanZ > 1.81 ? '#f59e0b' : '#f87171';

    // Piotroski interpretation
    const pColor = fmpPiotroski >= 7 ? '#4ade80' : fmpPiotroski >= 4 ? '#f59e0b' : '#f87171';

    html += `<div class="valuation-card">
        <div class="valuation-card-title">External Benchmarks & Reference Data</div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; font-size:0.85rem; margin-bottom:12px;">
            <div>
                <span style="color:var(--text-dim);">InvT Composite IV</span>
                <span id="summary-composite-iv" style="float:right; font-weight:600; color:var(--accent);">${formatMoney(s.compositeIv)}</span>
            </div>
            <div>
                <span style="color:var(--text-dim);">FMP DCF Fair Value</span>
                <span style="float:right; font-weight:600; color:#f59e0b;">${fmpDcf > 0 ? formatMoney(fmpDcf) : 'N/A'}</span>
            </div>
            <div>
                <span style="color:var(--text-dim);">FMP Graham Number</span>
                <span style="float:right; font-weight:600; color:#a78bfa;">${fmpGraham > 0 ? formatMoney(fmpGraham) : 'N/A'}</span>
            </div>
            <div>
                <span style="color:var(--text-dim);">Analyst Mean Target</span>
                <span style="float:right; font-weight:600; color:#22d3ee;">${analystMean > 0 ? formatMoney(analystMean) : 'N/A'}${analystCount > 0 ? ` <span style="font-size:0.72rem; color:var(--text-dim);">(${analystCount})</span>` : ''}</span>
            </div>
            <div>
                <span style="color:var(--text-dim);">Analyst Range</span>
                <span style="float:right; color:var(--text);">${analystLow > 0 ? formatMoney(analystLow) + ' — ' + formatMoney(analystHigh) : 'N/A'}</span>
            </div>
            <div>
                <span style="color:var(--text-dim);">FMP Rating</span>
                <span style="float:right;">${fmpRating ? `<span style="background:${ratingColor}20; color:${ratingColor}; padding:1px 10px; border-radius:6px; font-weight:700; font-size:0.82rem;">${fmpRating}</span> <span style="color:var(--text-dim); font-size:0.72rem;">(${fmpRatingScore}/5)</span>` : 'N/A'}</span>
            </div>
        </div>

        <div id="summary-number-line">${_ivNumberLine(nlPoints, nlMin, nlMax)}</div>

        <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; margin-top:8px;">
            <div style="text-align:center; padding:8px; background:var(--bg); border-radius:8px;">
                <div style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase;">InvT Score</div>
                <div id="summary-invt-score-value" style="font-size:1.1rem; font-weight:700; color:var(--text-dim);">...</div>
                <div id="summary-invt-score-label" style="font-size:0.62rem; color:var(--text-dim);"></div>
            </div>
            <div style="text-align:center; padding:8px; background:var(--bg); border-radius:8px;">
                <div style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase;">Altman Z</div>
                <div style="font-size:1.1rem; font-weight:700; color:${zColor};">${fmpAltmanZ > 0 ? fmpAltmanZ.toFixed(2) : 'N/A'}</div>
                ${zLabel ? `<div style="font-size:0.62rem; color:${zColor};">${zLabel}</div>` : ''}
            </div>
            <div style="text-align:center; padding:8px; background:var(--bg); border-radius:8px;">
                <div style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase;">Piotroski</div>
                <div style="font-size:1.1rem; font-weight:700; color:${pColor};">${fmpPiotroski > 0 ? fmpPiotroski + '/9' : 'N/A'}</div>
                ${fmpPiotroski > 0 ? `<div style="font-size:0.62rem; color:${pColor};">${fmpPiotroski >= 7 ? 'Strong' : fmpPiotroski >= 4 ? 'Neutral' : 'Weak'}</div>` : ''}
            </div>
            <div style="text-align:center; padding:8px; background:var(--bg); border-radius:8px;">
                <div style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase;">Earnings Yield</div>
                <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${fmpEarningsYield ? fmpEarningsYield.toFixed(1) + '%' : 'N/A'}</div>
                ${fmpFcfYield ? `<div style="font-size:0.62rem; color:var(--text-dim);">FCF Yield: ${fmpFcfYield.toFixed(1)}%</div>` : ''}
            </div>
            <div style="text-align:center; padding:8px; background:var(--bg); border-radius:8px;">
                <div style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase;">ROIC</div>
                <div style="font-size:1.1rem; font-weight:700; color:${fmpRoic > 15 ? '#4ade80' : fmpRoic > 8 ? '#f59e0b' : '#f87171'};">${fmpRoic ? fmpRoic.toFixed(1) + '%' : 'N/A'}</div>
            </div>
        </div>
    </div>`;

    return html;
}

async function analyzeStock(refresh = true) {
    const ticker = document.getElementById('analyzerTicker').value.toUpperCase().trim();
    if (!ticker) return;

    const resultsDiv = document.getElementById('analyzerResults');
    resultsDiv.innerHTML = '<p style="color: var(--text-dim); padding: 20px;">🔍 ' + (refresh ? 'Analyzing' : 'Loading') + ' ' + ticker + '…</p>';

    try {
        const url = `/api/stock-analyzer/${ticker}` + (refresh ? '?refresh=true' : '');
        const resp = await fetch(url);
        const d = await resp.json();

        if (!resp.ok) {
            resultsDiv.innerHTML = '<p style="color: var(--red); padding: 20px;">Stock not found or API error.</p>';
            return;
        }

        _analyzerData = d;
        window._analyzerWarnings = d._warnings || [];
        localStorage.setItem('analyzerLastTicker', ticker);

        const hasValuation = d.valuation && (d.valuation.dcf || d.valuation.graham || d.valuation.relative);
        _invtScoreLoaded = false;
        _invtScoreCache = null;
        const tabs = [
            {id: 'overview', label: 'Overview'},
            {id: 'invtScore', label: 'InvT Score'},
            {id: 'dcf', label: 'DCF Model'},
            {id: 'graham', label: 'Graham'},
            {id: 'relative', label: 'Relative'},
            {id: 'dcfScenarios', label: 'DCF Scenarios'},
            {id: 'summary', label: 'Summary'},
        ];

        let html = renderAnalyzerHeader(d);

        // Sub-tabs
        html += '<div class="analyzer-subtabs">';
        tabs.forEach((t, i) => {
            html += `<button class="analyzer-subtab${i === 0 ? ' active' : ''}" data-view="${t.id}" onclick="switchAnalyzerView('${t.id}')">${t.label}</button>`;
        });
        html += '</div>';

        // Sub-views
        html += `<div id="av-overview" class="analyzer-subview active">${renderAnalyzerOverview(d)}</div>`;
        html += `<div id="av-invtScore" class="analyzer-subview"><div id="invt-score-content" style="padding:20px; text-align:center; color:var(--text-dim);">Loading InvT Score...</div></div>`;
        html += `<div id="av-dcf" class="analyzer-subview">${renderAnalyzerDcf(d)}</div>`;
        html += `<div id="av-graham" class="analyzer-subview">${renderAnalyzerGraham(d)}</div>`;
        html += `<div id="av-relative" class="analyzer-subview">${renderAnalyzerRelative(d)}</div>`;
        html += `<div id="av-dcfScenarios" class="analyzer-subview">${renderAnalyzerDcfScenarios(d)}</div>`;
        html += `<div id="av-summary" class="analyzer-subview">${renderAnalyzerSummary(d)}</div>`;

        resultsDiv.innerHTML = html;
        recalcRelative();
        _renderE2Chart(d);
        _fetchSummaryInvtScore(ticker);
    } catch (e) {
        resultsDiv.innerHTML = '<p style="color: var(--red); padding: 20px;">Error fetching data. Check console.</p>';
        console.error('Analyzer error:', e);
    }
}

function _renderE2Chart(d) {
    const e2 = (d.valuation || {}).dcfScenarios;
    if (!e2) return;
    const canvas = document.getElementById('e2-projection-chart');
    if (!canvas) return;
    const fcfPS = e2.fcfPerShare;
    const price = d.price || 0;
    const discount = e2.discountRate / 100;

    // Compute implied growth (uniform rate that justifies current price at terminal multiple 15)
    const impliedG = price > 0 ? Math.pow(price / fcfPS / 15, 1/10) - 1 : 0;

    const labels = ['Now', 'Yr 1', 'Yr 2', 'Yr 3', 'Yr 4', 'Yr 5', 'Yr 6', 'Yr 7', 'Yr 8', 'Yr 9', 'Yr 10'];

    function buildLine(g1, g2) {
        let v = fcfPS, arr = [v];
        for (let yr = 1; yr <= 10; yr++) { v *= (1 + (yr <= 5 ? g1 : g2)); arr.push(v); }
        return arr.map(x => parseFloat(x.toFixed(2)));
    }

    const base = e2.scenarios.base, best = e2.scenarios.best, worst = e2.scenarios.worst;
    const baseData = buildLine(base.growth1_5 / 100, base.growth6_10 / 100);
    const bestData = buildLine(best.growth1_5 / 100, best.growth6_10 / 100);
    const worstData = buildLine(worst.growth1_5 / 100, worst.growth6_10 / 100);
    const impliedData = buildLine(impliedG, impliedG);

    if (window._e2Chart) window._e2Chart.destroy();
    window._e2Chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Base', data: baseData, borderColor: '#6366f1', backgroundColor: '#6366f120', borderWidth: 2, pointRadius: 3, tension: 0.3 },
                { label: 'Best', data: bestData, borderColor: '#22c55e', backgroundColor: '#22c55e20', borderWidth: 2, pointRadius: 3, tension: 0.3 },
                { label: 'Worst', data: worstData, borderColor: '#ef4444', backgroundColor: '#ef444420', borderWidth: 2, pointRadius: 3, tension: 0.3 },
                { label: 'Implied Growth', data: impliedData, borderColor: '#9ca3af', borderDash: [6, 4], borderWidth: 2, pointRadius: 2, tension: 0.3 },
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}` } }
            },
            scales: {
                x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
                y: { ticks: { color: '#64748b', callback: v => '$' + v.toFixed(0) }, grid: { color: '#1e293b' } }
            }
        }
    });
}

