// ── Shared Utility Functions ─────────────────────────────────────
// Extracted from dashboard.html — keep in global scope (no modules)

// ── XSS prevention ──────────────────────────────────────────────
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ── Display settings (populated from /api/settings) ──────────────
let _displaySettings = { currencySymbol: '$', decimalPlaces: 2, percentDecimals: 2, defaultTab: 'overview' };

function formatMoney(value) {
    if (value === null || value === undefined) return _displaySettings.currencySymbol + '0.00';
    const dp = _displaySettings.decimalPlaces ?? 2;
    return _displaySettings.currencySymbol + parseFloat(value).toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPercent(value) {
    if (value === null || value === undefined) return '0.00%';
    const dp = _displaySettings.percentDecimals ?? 2;
    return parseFloat(value).toFixed(dp) + '%';
}

function getSignalBadge(signal) {
    if (!signal) return '';
    const key = signal.toLowerCase().replace(/\s+/g, '-');
    const signalMap = {
        'strong-buy': 'signal-strong-buy',
        'buy': 'signal-buy',
        'hold': 'signal-hold',
        'overrated': 'signal-overrated',
        'expensive': 'signal-expensive',
        'avg.-cost': 'signal-avg-cost',
        'overcost': 'signal-overcost'
    };
    const className = signalMap[key] || 'signal-hold';
    return `<span class="badge ${className}">${escapeHtml(signal.toUpperCase())}</span>`;
}

// ── Settings (loaded from /api/settings) ─────────────────────────
let _categorySettings = null;
let _signalThresholds = null;
let _defaultSignalMode = 'avgCost';

async function loadCategorySettings() {
    try {
        const resp = await fetch('/api/settings');
        const data = await resp.json();
        _categorySettings = data.categories || [];
        _signalThresholds = data.signalThresholds || {};
        _defaultSignalMode = data.signalMode || 'avgCost';
        if (data.display) _displaySettings = { ..._displaySettings, ...data.display };
        // Portfolio name
        const nameEl = document.getElementById('portfolioName');
        if (nameEl && data.portfolioName) nameEl.textContent = data.portfolioName;
    } catch { _categorySettings = []; _signalThresholds = {}; }
}

function getCategoryBadge(category) {
    if (!category) return '';
    const cat = (_categorySettings || []).find(
        c => c.name.toLowerCase() === category.toLowerCase()
    );
    const color = cat ? cat.color : '#6366f1';
    return `<span class="badge" style="background:${color}20; color:${color};">${escapeHtml(category)}</span>`;
}

function getCategoryOptions() {
    return (_categorySettings || []).map(c => c.name);
}

function populateCategorySelect(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = getCategoryOptions().map(c => `<option>${escapeHtml(c)}</option>`).join('');
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${type}`;
    alertDiv.textContent = message;
    document.body.insertBefore(alertDiv, document.body.firstChild);
    setTimeout(() => alertDiv.remove(), 5000);
}

function showSaveToast(message) {
    const toast = document.createElement('div');
    toast.className = 'save-toast';
    toast.textContent = '✓ ' + message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

function round2(n) { return Math.round(n * 100) / 100; }

function fmtBigNum(n) {
    if (!n) return '—';
    if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
    return formatMoney(n);
}
function fmtVal(v, fmt) {
    if (v === null || v === undefined || v === 0) return '—';
    if (fmt === '$') return formatMoney(v);
    if (fmt === '%') return formatPercent(v);
    if (fmt === 'big') return fmtBigNum(v);
    if (fmt === 'x') return v.toFixed(2) + 'x';
    return typeof v === 'number' ? v.toFixed(2) : v;
}
function statRow(label, val, fmt, fieldKey) {
    const display = fmtVal(val, fmt);
    const color = fmt === '%' && val !== 0 ? (val > 0 ? '#22c55e' : '#ef4444') : 'var(--text)';
    let warn = '';
    if ((val == null || val === 0) && fieldKey && window._analyzerWarnings) {
        const w = window._analyzerWarnings.find(w => w.field === fieldKey);
        if (w) warn = `<span title="${escapeHtml(w.reason)}" style="cursor:help; margin-left:4px; color:#f59e0b; font-size:0.75rem;">&#9888;</span>`;
    }
    return `<div class="analyzer-stat"><span class="analyzer-stat-label">${escapeHtml(label)}</span><span class="analyzer-stat-value" style="color:${display === '—' ? 'var(--text-dim)' : color}">${display}${warn}</span></div>`;
}
function recColor(rec) {
    const r = (rec || '').toLowerCase();
    if (r.includes('strong_buy') || r.includes('strongbuy')) return {bg:'#4ade8020', fg:'#4ade80'};
    if (r.includes('buy')) return {bg:'#22d3ee20', fg:'#22d3ee'};
    if (r.includes('sell')) return {bg:'#f8717120', fg:'#f87171'};
    if (r.includes('hold')) return {bg:'#f59e0b20', fg:'#f59e0b'};
    return {bg:'#6366f120', fg:'#6366f1'};
}

function signalColor(signal) {
    const s = (signal || '').toLowerCase();
    if (s.includes('strong buy')) return {bg:'#4ade8020', fg:'#4ade80'};
    if (s.includes('buy')) return {bg:'#22d3ee20', fg:'#22d3ee'};
    if (s.includes('avg')) return {bg:'#60a5fa20', fg:'#60a5fa'};
    if (s.includes('overcost')) return {bg:'#fb923c20', fg:'#fb923c'};
    if (s.includes('hold')) return {bg:'#f59e0b20', fg:'#f59e0b'};
    if (s.includes('expensive')) return {bg:'#fb923c20', fg:'#fb923c'};
    if (s.includes('overrated')) return {bg:'#f8717120', fg:'#f87171'};
    return {bg:'#6366f120', fg:'#6366f1'};
}

function _invtScoreColor(s) {
    if (s >= 9) return '#4ade80';
    if (s >= 8) return '#22d3ee';
    if (s >= 6) return '#3b82f6';
    if (s >= 4) return '#f59e0b';
    return '#f87171';
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

function _ivNumberLine(points, minVal, maxVal) {
    // Render a horizontal number line with labeled markers
    const range = maxVal - minVal;
    if (range <= 0) return '';
    let html = '<div style="position:relative; height:40px; margin:16px 0 28px 0;">';
    // Base line
    html += '<div style="position:absolute; top:18px; left:0; right:0; height:2px; background:var(--border);"></div>';
    for (const p of points) {
        if (!p.value || p.value <= 0) continue;
        const pct = Math.max(0, Math.min(100, ((p.value - minVal) / range) * 100));
        html += `<div style="position:absolute; left:${pct}%; transform:translateX(-50%); text-align:center;">
            <div style="width:3px; height:14px; background:${p.color}; margin:0 auto; border-radius:2px; margin-top:12px;"></div>
            <div style="font-size:0.65rem; color:${p.color}; white-space:nowrap; margin-top:2px; font-weight:600;">${p.label}</div>
            <div style="font-size:0.6rem; color:var(--text-dim); white-space:nowrap;">${formatMoney(p.value)}</div>
        </div>`;
    }
    html += '</div>';
    return html;
}

function _e2ValueBar(iv, price) {
    const max = Math.max(iv, price) * 1.15;
    const ivPct = (iv / max * 100).toFixed(1);
    const pricePct = (price / max * 100).toFixed(1);
    const diff = price > 0 ? ((iv - price) / price * 100) : 0;
    const isUnder = diff >= 0;
    const solidColor = isUnder ? '#22c55e' : '#ef4444';
    const stripeColor = isUnder ? '#22c55e' : '#ef4444';
    const badgeText = isUnder ? `Undervalued ${Math.abs(diff).toFixed(0)}%` : `Overvalued ${Math.abs(diff).toFixed(0)}%`;
    // Striped pattern: solid portion up to min(iv,price), striped for the excess
    const minPct = (Math.min(iv, price) / max * 100).toFixed(1);
    const stripeCSS = `repeating-linear-gradient(135deg, ${stripeColor}44, ${stripeColor}44 4px, ${stripeColor}22 4px, ${stripeColor}22 8px)`;
    return `<div style="margin-top:4px;">
        <span style="display:inline-block; background:${solidColor}; color:#fff; font-size:0.72rem; font-weight:600; padding:2px 8px; border-radius:10px; margin-bottom:6px;">${badgeText}</span>
        <div style="font-size:0.72rem; color:var(--text-dim); margin-bottom:2px;">Value</div>
        <div style="position:relative; height:26px; border-radius:6px; overflow:hidden; margin-bottom:4px; background:${stripeCSS};">
            <div style="position:absolute; height:100%; width:${Math.min(parseFloat(ivPct), parseFloat(pricePct))}%; background:${solidColor}; border-radius:6px 0 0 6px;"></div>
            ${parseFloat(ivPct) > parseFloat(pricePct) ? `<div style="position:absolute; height:100%; left:${pricePct}%; width:${(parseFloat(ivPct) - parseFloat(pricePct)).toFixed(1)}%; background:${stripeCSS};"></div>` : ''}
            <span style="position:absolute; left:8px; top:4px; color:#fff; font-size:0.75rem; font-weight:600; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${formatMoney(iv)}</span>
        </div>
        <div style="font-size:0.72rem; color:var(--text-dim); margin-bottom:2px;">Price</div>
        <div style="position:relative; height:26px; background:var(--border); border-radius:6px; overflow:hidden;">
            <div style="height:100%; width:${pricePct}%; background:var(--border); border-radius:6px;"></div>
            <span style="position:absolute; left:8px; top:4px; color:var(--text); font-size:0.75rem; font-weight:600;">${formatMoney(price)}</span>
        </div>
    </div>`;
}

function _e2SensitivityMatrix(fcfPS, g1, g2, discountRate, termFactor) {
    const price = (_analyzerData && _analyzerData.price) || 0;
    const discounts = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5].map(d => discountRate + d);
    const multiples = [-3, -2, -1, 0, 1, 2, 3].map(m => termFactor + m);
    let html = '<div style="margin-top:12px;"><div style="font-size:0.85rem; font-weight:600; color:var(--text); margin-bottom:8px;">Sensitivity Matrix</div>';
    html += '<div style="overflow-x:auto;"><table class="fcf-table" style="font-size:0.75rem;">';
    html += '<thead><tr><th style="text-align:center;">Discount \\ Multiple</th>';
    for (const m of multiples) html += `<th style="text-align:center;">${m.toFixed(1)}x</th>`;
    html += '</tr></thead><tbody>';
    for (const dr of discounts) {
        html += `<tr><td style="font-weight:600; text-align:center;">${(dr).toFixed(1)}%</td>`;
        for (const m of multiples) {
            const res = _runDcfScenario(fcfPS, g1 / 100, g2 / 100, m, dr / 100);
            const isCenter = Math.abs(dr - discountRate) < 0.01 && Math.abs(m - termFactor) < 0.01;
            const abovePrice = res.iv >= price && price > 0;
            const bgColor = abovePrice ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)';
            const centerBorder = isCenter ? 'border:2px solid var(--accent); font-weight:700;' : '';
            html += `<td style="text-align:center; background:${bgColor}; ${centerBorder}">${res.iv.toFixed(2)}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table></div></div>';
    return html;
}
