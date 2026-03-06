// ── Settings Tab: Category Management ────────────────────────────

let _settingsCache = null;

async function fetchSettingsData() {
    try {
        const resp = await fetch('/api/settings');
        _settingsCache = await resp.json();
        renderCategoryEditor();
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
