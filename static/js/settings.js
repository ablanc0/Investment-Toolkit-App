// ── Settings Tab ─────────────────────────────────────────────────

let _settingsCache = null;

async function fetchSettingsData() {
    try {
        const resp = await fetch('/api/settings');
        _settingsCache = await resp.json();
        renderPortfolioName();
        renderCategoryEditor();
        renderSignalThresholdEditor();
        renderGoalsEditor();
        renderTargetAllocEditor();
        renderValuationDefaults();
        renderDisplayPreferences();
        renderApiKeys();
        fetchApiHealth();
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

function renderCategoryEditor() {
    if (!_settingsCache) return;
    const cats = _settingsCache.categories || [];
    const container = document.getElementById('categoryEditor');
    if (!container) return;

    container.innerHTML = cats.map((cat, i) => `
        <div class="settings-cat-row" style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
            <input type="color" value="${cat.color}" data-idx="${i}" class="cat-color-input"
                   style="width: 36px; height: 30px; border: none; background: none; cursor: pointer;">
            <input type="text" value="${cat.name}" data-idx="${i}" class="cat-name-input"
                   style="flex: 1; padding: 6px 8px; background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px;">
            <span class="badge" style="background:${cat.color}20; color:${cat.color}; min-width: 80px; text-align: center;">${cat.name}</span>
            <button class="delete-row-btn" onclick="removeCategoryRow(${i})" title="Remove category">✕</button>
        </div>
    `).join('');

    // Update default category dropdown
    const defSelect = document.getElementById('defaultCategorySelect');
    if (defSelect) {
        const current = _settingsCache.defaultCategory || '';
        defSelect.innerHTML = cats.map(c =>
            `<option ${c.name === current ? 'selected' : ''}>${c.name}</option>`
        ).join('');
    }

    // Live preview on input change
    container.querySelectorAll('.cat-name-input, .cat-color-input').forEach(el => {
        el.addEventListener('input', updateCategoryPreview);
    });
}

function updateCategoryPreview(e) {
    const row = e.target.closest('.settings-cat-row');
    if (!row) return;
    const nameInput = row.querySelector('.cat-name-input');
    const colorInput = row.querySelector('.cat-color-input');
    const badge = row.querySelector('.badge');
    if (badge && nameInput && colorInput) {
        badge.textContent = nameInput.value;
        badge.style.background = colorInput.value + '20';
        badge.style.color = colorInput.value;
    }
}

function addCategoryRow() {
    if (!_settingsCache) return;
    _settingsCache.categories.push({ name: 'New Category', color: '#6366f1' });
    renderCategoryEditor();
}

function removeCategoryRow(index) {
    if (!_settingsCache) return;
    _settingsCache.categories.splice(index, 1);
    renderCategoryEditor();
}

async function saveCategories() {
    const container = document.getElementById('categoryEditor');
    if (!container) return;

    const names = container.querySelectorAll('.cat-name-input');
    const colors = container.querySelectorAll('.cat-color-input');
    const categories = [];
    names.forEach((input, i) => {
        const name = input.value.trim();
        if (name) categories.push({ name, color: colors[i].value });
    });

    const defaultCategory = document.getElementById('defaultCategorySelect')?.value || categories[0]?.name || '';

    try {
        const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categories, defaultCategory })
        });
        _settingsCache = await resp.json();
        _categorySettings = _settingsCache.categories;
        renderCategoryEditor();
        populateCategorySelect('newCategory');
        populateCategorySelect('spCategory');
        showSaveToast('Categories saved');
    } catch (e) {
        showAlert('Failed to save categories', 'error');
    }
}

// ── Portfolio Name ───────────────────────────────────────────────

function renderPortfolioName() {
    const input = document.getElementById('settingsPortfolioName');
    if (input && _settingsCache?.portfolioName) input.value = _settingsCache.portfolioName;
}

async function savePortfolioName() {
    const name = document.getElementById('settingsPortfolioName')?.value?.trim();
    if (!name) return;
    try {
        const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portfolioName: name })
        });
        _settingsCache = await resp.json();
        const h1 = document.getElementById('portfolioName');
        if (h1) h1.textContent = name;
        showSaveToast('Portfolio name saved');
    } catch (e) {
        showAlert('Failed to save portfolio name', 'error');
    }
}

// ── Signal Thresholds ────────────────────────────────────────────

function renderSignalThresholdEditor() {
    renderIVThresholdEditor();
    renderAvgCostThresholdEditor();

    // Signal mode dropdown
    const modeSelect = document.getElementById('defaultSignalMode');
    if (modeSelect) modeSelect.value = _settingsCache?.signalMode || 'avgCost';

    // Top Performer
    const tpInput = document.getElementById('thresh_topPerformer');
    if (tpInput) tpInput.value = _settingsCache?.signalThresholds?.topPerformer ?? 30;
}

function renderIVThresholdEditor() {
    const t = _settingsCache?.signalThresholds?.iv || {};
    const container = document.getElementById('ivThresholdEditor');
    if (!container) return;

    const fields = [
        { key: 'strongBuy', label: 'Strong Buy', hint: 'below %', color: '#4ade80', default: -15 },
        { key: 'buy', label: 'Buy', hint: 'below %', color: '#22d3ee', default: 0 },
        { key: 'expensive', label: 'Expensive', hint: 'above %', color: '#fb923c', default: 15 },
    ];

    container.innerHTML = fields.map(f => `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge" style="background:${f.color}20; color:${f.color}; min-width: 90px; text-align: center;">${f.label}</span>
            <input type="number" id="iv_thresh_${f.key}" value="${t[f.key] ?? f.default}" step="1"
                   style="width: 80px; padding: 6px 8px; background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; text-align: right;">
            <span style="color: var(--text-dim); font-size: 12px;">${f.hint}</span>
        </div>
    `).join('');

    updateIVPreview();
    container.querySelectorAll('input').forEach(el => el.addEventListener('input', updateIVPreview));
}

function updateIVPreview() {
    const preview = document.getElementById('ivSignalPreview');
    if (!preview) return;
    const sb = document.getElementById('iv_thresh_strongBuy')?.value ?? -15;
    const b = document.getElementById('iv_thresh_buy')?.value ?? 0;
    const e = document.getElementById('iv_thresh_expensive')?.value ?? 15;
    preview.innerHTML = `<span style="font-size: 12px; color: var(--text-dim);">
        <strong style="color:#4ade80">Strong Buy</strong> &le; ${sb}%
        &middot; <strong style="color:#22d3ee">Buy</strong> &lt; ${b}%
        &middot; <strong style="color:#fb923c">Expensive</strong> &le; ${e}%
        &middot; <strong style="color:#f87171">Overrated</strong> &gt; ${e}%
    </span>`;
}

function renderAvgCostThresholdEditor() {
    const t = _settingsCache?.signalThresholds?.avgCost || {};
    const container = document.getElementById('avgCostThresholdEditor');
    if (!container) return;

    const fields = [
        { key: 'strongBuy', label: 'Strong Buy', hint: 'below %', color: '#4ade80', default: -15 },
        { key: 'buy', label: 'Buy', hint: 'below %', color: '#22d3ee', default: -5 },
        { key: 'avgCost', label: 'Avg. Cost', hint: 'below %', color: '#60a5fa', default: 5 },
        { key: 'overcost', label: 'Overcost', hint: 'above %', color: '#fb923c', default: 15 },
    ];

    container.innerHTML = fields.map(f => `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge" style="background:${f.color}20; color:${f.color}; min-width: 90px; text-align: center;">${f.label}</span>
            <input type="number" id="ac_thresh_${f.key}" value="${t[f.key] ?? f.default}" step="1"
                   style="width: 80px; padding: 6px 8px; background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; text-align: right;">
            <span style="color: var(--text-dim); font-size: 12px;">${f.hint}</span>
        </div>
    `).join('');

    updateAvgCostPreview();
    container.querySelectorAll('input').forEach(el => el.addEventListener('input', updateAvgCostPreview));
}

function updateAvgCostPreview() {
    const preview = document.getElementById('avgCostSignalPreview');
    if (!preview) return;
    const sb = document.getElementById('ac_thresh_strongBuy')?.value ?? -15;
    const b = document.getElementById('ac_thresh_buy')?.value ?? -5;
    const ac = document.getElementById('ac_thresh_avgCost')?.value ?? 5;
    const oc = document.getElementById('ac_thresh_overcost')?.value ?? 15;
    preview.innerHTML = `<span style="font-size: 12px; color: var(--text-dim);">
        <strong style="color:#4ade80">Strong Buy</strong> &lt; ${sb}%
        &middot; <strong style="color:#22d3ee">Buy</strong> &lt; ${b}%
        &middot; <strong style="color:#60a5fa">Avg. Cost</strong> &lt; ${ac}%
        &middot; <strong style="color:#fb923c">Overcost</strong> &le; ${oc}%
        &middot; <strong style="color:#f59e0b">Hold</strong> &gt; ${oc}%
    </span>`;
}

async function saveSignalThresholds() {
    const signalThresholds = {
        iv: {
            strongBuy: parseFloat(document.getElementById('iv_thresh_strongBuy').value),
            buy: parseFloat(document.getElementById('iv_thresh_buy').value),
            expensive: parseFloat(document.getElementById('iv_thresh_expensive').value),
        },
        avgCost: {
            strongBuy: parseFloat(document.getElementById('ac_thresh_strongBuy').value),
            buy: parseFloat(document.getElementById('ac_thresh_buy').value),
            avgCost: parseFloat(document.getElementById('ac_thresh_avgCost').value),
            overcost: parseFloat(document.getElementById('ac_thresh_overcost').value),
        },
        topPerformer: parseFloat(document.getElementById('thresh_topPerformer').value),
    };
    const signalMode = document.getElementById('defaultSignalMode')?.value || 'avgCost';

    try {
        const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signalThresholds, signalMode })
        });
        _settingsCache = await resp.json();
        _signalThresholds = _settingsCache.signalThresholds;
        _defaultSignalMode = _settingsCache.signalMode;
        renderSignalThresholdEditor();
        showSaveToast('Signal thresholds saved');
    } catch (e) {
        showAlert('Failed to save thresholds', 'error');
    }
}

// ── Goals Editor ─────────────────────────────────────────────────

function renderGoalsEditor() {
    const container = document.getElementById('goalsEditor');
    if (!container) return;

    // Goals live in portfolio.goals, not settings — fetch from portfolioData or API
    const goals = portfolioData?.goals_raw || window._goalsRaw || {};
    const fields = [
        { key: 'portfolioTarget', label: 'Portfolio Target ($)', icon: '💼' },
        { key: 'dividendTarget', label: 'Annual Dividend Target ($)', icon: '💰' },
        { key: 'maxHoldings', label: 'Max Holdings', icon: '📊' },
        { key: 'cashReserveMin', label: 'Cash Reserve Min ($)', icon: '🏦' },
    ];

    container.innerHTML = fields.map(f => `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 13px; color: var(--text-dim); min-width: 180px;">${f.icon} ${f.label}</span>
            <input type="number" id="goal_${f.key}" value="${goals[f.key] || ''}" step="1"
                   placeholder="0"
                   style="width: 120px; padding: 6px 8px; background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; text-align: right;">
        </div>
    `).join('');
}

async function saveGoals() {
    const body = {};
    ['portfolioTarget', 'dividendTarget', 'maxHoldings', 'cashReserveMin'].forEach(key => {
        const val = document.getElementById('goal_' + key)?.value;
        if (val !== '' && val !== undefined) body[key] = parseFloat(val);
    });

    try {
        const resp = await fetch('/api/goals/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (resp.ok) {
            const data = await resp.json();
            window._goalsRaw = data.goals;
            showSaveToast('Goals saved');
        }
    } catch (e) {
        showAlert('Failed to save goals', 'error');
    }
}

// ── Target Allocations ───────────────────────────────────────────

function renderTargetAllocEditor() {
    const container = document.getElementById('targetAllocEditor');
    if (!container) return;

    const categories = getCategoryOptions();
    const targets = portfolioData?.targets?.category || portfolioData?.targets || window._targetAllocs || {};

    container.innerHTML = categories.map(cat => `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            ${getCategoryBadge(cat)}
            <input type="number" id="alloc_${cat.replace(/\s+/g, '_')}" value="${targets[cat] || ''}" step="1" min="0" max="100"
                   placeholder="0"
                   style="width: 80px; padding: 6px 8px; background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; text-align: right;"
                   oninput="updateAllocTotal()">
            <span style="color: var(--text-dim); font-size: 12px;">%</span>
        </div>
    `).join('');

    updateAllocTotal();
}

function updateAllocTotal() {
    const categories = getCategoryOptions();
    let total = 0;
    categories.forEach(cat => {
        total += parseFloat(document.getElementById('alloc_' + cat.replace(/\s+/g, '_'))?.value || 0);
    });
    const warning = document.getElementById('allocTotalWarning');
    if (!warning) return;
    const color = Math.abs(total - 100) < 0.01 ? '#22c55e' : '#f59e0b';
    warning.innerHTML = `<span style="font-size: 12px; color: ${color}; font-weight: 600;">Total: ${total.toFixed(0)}%${Math.abs(total - 100) >= 0.01 ? ' (should be 100%)' : ' ✓'}</span>`;
}

async function saveTargetAllocations() {
    const categories = getCategoryOptions();
    const targets = {};
    categories.forEach(cat => {
        const val = parseFloat(document.getElementById('alloc_' + cat.replace(/\s+/g, '_'))?.value || 0);
        if (val > 0) targets[cat] = val;
    });

    try {
        const resp = await fetch('/api/targets/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: targets })
        });
        if (resp.ok) {
            window._targetAllocs = targets;
            showSaveToast('Target allocations saved');
        }
    } catch (e) {
        showAlert('Failed to save targets', 'error');
    }
}

// ── Valuation Defaults ───────────────────────────────────────────

function renderValuationDefaults() {
    const container = document.getElementById('valuationDefaultsEditor');
    if (!container) return;

    const v = _settingsCache?.valuationDefaults || {};
    const fields = [
        { key: 'discountRate', label: 'Discount Rate', unit: '%', default: 10, step: 0.25 },
        { key: 'marginOfSafety', label: 'Margin of Safety', unit: '%', default: 25, step: 1 },
        { key: 'terminalGrowth', label: 'Terminal Growth', unit: '%', default: 3, step: 0.25 },
        { key: 'riskFreeRate', label: 'Risk-Free Rate', unit: '%', default: 4.25, step: 0.25 },
        { key: 'marketReturn', label: 'Market Return', unit: '%', default: 9.9, step: 0.1 },
    ];

    container.innerHTML = fields.map(f => `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 13px; color: var(--text-dim); min-width: 130px;">${f.label}</span>
            <input type="number" id="valdef_${f.key}" value="${v[f.key] ?? f.default}" step="${f.step}"
                   style="width: 80px; padding: 6px 8px; background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; text-align: right;">
            <span style="color: var(--text-dim); font-size: 12px;">${f.unit}</span>
        </div>
    `).join('');
}

async function saveValuationDefaults() {
    const valuationDefaults = {
        discountRate: parseFloat(document.getElementById('valdef_discountRate').value),
        marginOfSafety: parseFloat(document.getElementById('valdef_marginOfSafety').value),
        terminalGrowth: parseFloat(document.getElementById('valdef_terminalGrowth').value),
        riskFreeRate: parseFloat(document.getElementById('valdef_riskFreeRate').value),
        marketReturn: parseFloat(document.getElementById('valdef_marketReturn').value),
    };

    try {
        const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valuationDefaults })
        });
        _settingsCache = await resp.json();
        showSaveToast('Valuation defaults saved');
    } catch (e) {
        showAlert('Failed to save valuation defaults', 'error');
    }
}

// ── Display & Preferences ───────────────────────────────────────

function renderDisplayPreferences() {
    const d = _settingsCache?.display || {};
    const cacheTTL = _settingsCache?.cacheTTL ?? 300;

    const currInput = document.getElementById('pref_currencySymbol');
    const dpInput = document.getElementById('pref_decimalPlaces');
    const pctInput = document.getElementById('pref_percentDecimals');
    const tabSelect = document.getElementById('pref_defaultTab');
    const cacheInput = document.getElementById('pref_cacheTTL');

    if (currInput) currInput.value = d.currencySymbol || '$';
    if (dpInput) dpInput.value = d.decimalPlaces ?? 2;
    if (pctInput) pctInput.value = d.percentDecimals ?? 2;
    if (tabSelect) tabSelect.value = d.defaultTab || 'overview';
    if (cacheInput) cacheInput.value = Math.round(cacheTTL / 60);

    updateFormatPreview();
}

function updateFormatPreview() {
    const preview = document.getElementById('formatPreview');
    if (!preview) return;
    const sym = document.getElementById('pref_currencySymbol')?.value || '$';
    const dp = parseInt(document.getElementById('pref_decimalPlaces')?.value) || 2;
    const pct = parseInt(document.getElementById('pref_percentDecimals')?.value) || 2;
    const sample = (1234.5678).toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    preview.innerHTML = `<span style="font-size: 12px; color: var(--text-dim);">
        Money: <strong style="color:var(--text)">${sym}${sample}</strong>
        &middot; Percent: <strong style="color:var(--text)">${(12.3456).toFixed(pct)}%</strong>
    </span>`;
}

async function saveDisplayPreferences() {
    const display = {
        currencySymbol: document.getElementById('pref_currencySymbol').value.trim() || '$',
        decimalPlaces: parseInt(document.getElementById('pref_decimalPlaces').value) || 2,
        percentDecimals: parseInt(document.getElementById('pref_percentDecimals').value) || 2,
        defaultTab: document.getElementById('pref_defaultTab').value,
    };
    const cacheMinutes = parseFloat(document.getElementById('pref_cacheTTL').value) || 5;
    const cacheTTL = Math.round(cacheMinutes * 60);

    try {
        const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display, cacheTTL })
        });
        _settingsCache = await resp.json();
        _displaySettings = { ..._displaySettings, ...display };
        renderDisplayPreferences();
        showSaveToast('Display preferences saved');
    } catch (e) {
        showAlert('Failed to save preferences', 'error');
    }
}

// ── API Keys ────────────────────────────────────────────────────

function renderApiKeys() {
    const current = document.getElementById('apiKeyFmpCurrent');
    if (!current) return;
    const masked = (_settingsCache?.apiKeys?.fmp) || '';
    if (masked) {
        current.textContent = 'Current key: ' + masked;
    } else {
        current.textContent = 'No API key configured (using default)';
    }
}

async function testApiKey(provider) {
    const input = document.getElementById('apiKeyFmp');
    const status = document.getElementById('apiKeyFmpStatus');
    if (!input || !status) return;

    const key = input.value.trim();
    if (!key) {
        status.innerHTML = '<span style="color: var(--red);">Enter a key first</span>';
        return;
    }

    status.innerHTML = '<span style="color: var(--gold);">Testing...</span>';
    try {
        const resp = await fetch('/api/settings/test-api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
        const data = await resp.json();
        if (data.valid) {
            status.innerHTML = '<span style="color: var(--green);">\u2713 Valid</span>';
        } else {
            status.innerHTML = '<span style="color: var(--red);">\u2715 Invalid</span>';
        }
    } catch (e) {
        status.innerHTML = '<span style="color: var(--red);">\u2715 Error</span>';
    }
}

async function saveApiKeys() {
    const fmpKey = document.getElementById('apiKeyFmp')?.value?.trim();
    if (!fmpKey) return;

    try {
        const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKeys: { fmp: fmpKey } })
        });
        _settingsCache = await resp.json();
        renderApiKeys();
        document.getElementById('apiKeyFmp').value = '';
        showSaveToast('API key saved');
    } catch (e) {
        showAlert('Failed to save API key', 'error');
    }
}

// ── API Health ──────────────────────────────────────────────────

async function fetchApiHealth() {
    try {
        const resp = await fetch('/api/health');
        const data = await resp.json();
        renderApiHealthTable(data);
    } catch (e) {
        console.error('Error fetching API health:', e);
    }
}

function renderApiHealthTable(data) {
    const container = document.getElementById('apiHealthTable');
    if (!container) return;

    const apis = [
        { key: 'fmp', name: 'FMP (Financial Modeling Prep)', icon: '📈' },
        { key: 'yfinance', name: 'Yahoo Finance', icon: '📊' },
        { key: 'fred', name: 'FRED (AAA Bond Yield)', icon: '🏛' },
        { key: 'edgar', name: 'SEC EDGAR', icon: '📋' },
    ];

    const dotColor = (status) => {
        const colors = { ok: '#22c55e', degraded: '#f59e0b', error: '#ef4444', unknown: '#6b7280' };
        return colors[status] || colors.unknown;
    };

    let html = '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
    html += '<thead><tr>';
    html += '<th style="text-align:left; padding:8px; border-bottom:2px solid var(--border); font-weight:600; font-size:12px; text-transform:uppercase;">API</th>';
    html += '<th style="text-align:center; padding:8px; border-bottom:2px solid var(--border); font-weight:600; font-size:12px; text-transform:uppercase;">Status</th>';
    html += '<th style="text-align:right; padding:8px; border-bottom:2px solid var(--border); font-weight:600; font-size:12px; text-transform:uppercase;">Latency</th>';
    html += '<th style="text-align:right; padding:8px; border-bottom:2px solid var(--border); font-weight:600; font-size:12px; text-transform:uppercase;">Last Success</th>';
    html += '</tr></thead><tbody>';

    for (const api of apis) {
        const h = (data.apis || {})[api.key] || {};
        const latency = h.latencyMs != null ? h.latencyMs + 'ms' : '—';
        const lastSuccess = h.lastSuccess ? new Date(h.lastSuccess).toLocaleTimeString() : 'Never';
        const color = dotColor(h.status);
        html += '<tr>';
        html += `<td style="padding:8px; border-bottom:1px solid var(--border);">${api.icon} ${api.name}</td>`;
        html += `<td style="padding:8px; text-align:center; border-bottom:1px solid var(--border);"><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; margin-right:6px; vertical-align:middle;"></span><span style="font-size:12px; color:${color}; text-transform:uppercase;">${h.status || 'unknown'}</span></td>`;
        html += `<td style="padding:8px; text-align:right; border-bottom:1px solid var(--border); color:var(--text-dim);">${latency}</td>`;
        html += `<td style="padding:8px; text-align:right; border-bottom:1px solid var(--border); color:var(--text-dim);">${lastSuccess}</td>`;
        html += '</tr>';
        if (h.lastErrorMsg) {
            html += `<tr><td colspan="4" style="padding:2px 8px 8px 32px; font-size:11px; color:#ef4444; border-bottom:1px solid var(--border);">Last error: ${h.lastErrorMsg}</td></tr>`;
        }
    }
    html += '</tbody></table>';

    // FMP Quota bar
    const quota = data.fmpQuota || {};
    if (quota.limit) {
        const used = quota.used || 0;
        const pct = Math.min(100, (used / quota.limit) * 100);
        const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
        html += '<div style="margin-top:12px;">';
        html += `<div style="font-size:12px; color:var(--text-dim); margin-bottom:4px;">FMP Quota: ${used} / ${quota.limit} calls today (${quota.remaining} remaining)</div>`;
        html += `<div style="height:8px; background:var(--border); border-radius:4px; overflow:hidden;">`;
        html += `<div style="height:100%; width:${pct}%; background:${barColor}; border-radius:4px; transition:width 0.3s;"></div>`;
        html += '</div></div>';
    }

    container.innerHTML = html;
}

async function runHealthCheck() {
    const btn = document.getElementById('healthCheckBtn');
    const status = document.getElementById('healthCheckStatus');
    btn.disabled = true;
    status.textContent = 'Checking...';
    status.style.color = 'var(--gold)';
    try {
        const resp = await fetch('/api/health/check', { method: 'POST' });
        const data = await resp.json();
        renderApiHealthTable(data);
        status.textContent = 'Done — ' + new Date().toLocaleTimeString();
        status.style.color = 'var(--green)';
    } catch (e) {
        status.textContent = 'Error running health check';
        status.style.color = 'var(--red)';
    }
    btn.disabled = false;
}
