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
    const t = _settingsCache?.signalThresholds || {};
    const container = document.getElementById('signalThresholdEditor');
    if (!container) return;

    const fields = [
        { key: 'strongBuy', label: 'Strong Buy', hint: 'below %', color: '#4ade80', default: -5 },
        { key: 'buy', label: 'Buy', hint: 'below %', color: '#22d3ee', default: 5 },
        { key: 'expensive', label: 'Expensive', hint: 'above %', color: '#fb923c', default: 20 },
        { key: 'overrated', label: 'Overrated', hint: 'above %', color: '#f87171', default: 50 },
        { key: 'topPerformer', label: 'Top Performer', hint: 'above %', color: '#a78bfa', default: 30 },
    ];

    container.innerHTML = fields.map(f => `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge" style="background:${f.color}20; color:${f.color}; min-width: 90px; text-align: center;">${f.label}</span>
            <input type="number" id="thresh_${f.key}" value="${t[f.key] ?? f.default}" step="1"
                   style="width: 80px; padding: 6px 8px; background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; text-align: right;">
            <span style="color: var(--text-dim); font-size: 12px;">${f.hint}</span>
        </div>
    `).join('');

    // Signal mode dropdown
    const modeSelect = document.getElementById('defaultSignalMode');
    if (modeSelect) modeSelect.value = _settingsCache?.signalMode || 'avgCost';

    // Live preview
    updateSignalPreview();
    container.querySelectorAll('input').forEach(el => el.addEventListener('input', updateSignalPreview));
}

function updateSignalPreview() {
    const preview = document.getElementById('signalPreview');
    if (!preview) return;
    const sb = document.getElementById('thresh_strongBuy')?.value ?? -5;
    const b = document.getElementById('thresh_buy')?.value ?? 5;
    const e = document.getElementById('thresh_expensive')?.value ?? 20;
    const o = document.getElementById('thresh_overrated')?.value ?? 50;
    preview.innerHTML = `<span style="font-size: 12px; color: var(--text-dim);">
        <strong style="color:#4ade80">Strong Buy</strong> &lt; ${sb}%
        &middot; <strong style="color:#22d3ee">Buy</strong> &lt; ${b}%
        &middot; <strong style="color:#f59e0b">Hold</strong>
        &middot; <strong style="color:#fb923c">Expensive</strong> &gt; ${e}%
        &middot; <strong style="color:#f87171">Overrated</strong> &gt; ${o}%
    </span>`;
}

async function saveSignalThresholds() {
    const signalThresholds = {
        strongBuy: parseFloat(document.getElementById('thresh_strongBuy').value),
        buy: parseFloat(document.getElementById('thresh_buy').value),
        expensive: parseFloat(document.getElementById('thresh_expensive').value),
        overrated: parseFloat(document.getElementById('thresh_overrated').value),
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
