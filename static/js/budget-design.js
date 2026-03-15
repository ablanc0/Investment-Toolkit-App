// ── Budget Design Tab ────────────────────────────────────────────────
// Master budget: goals, categories, subcategories, monthly overrides.

let budgetDesignData = null;

const BD_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
const BD_MONTH_KEYS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];
const BD_CAT_ICONS = {
    income: '💰', essential: '🏠', discretionary: '🎭',
    debt: '💳', savings: '🏦', investments: '📈'
};


// ── Data Fetching ────────────────────────────────────────────────────

async function fetchBudgetDesign() {
    try {
        const res = await fetch('/api/budget');
        const json = await res.json();
        budgetDesignData = json.budget;
        if (!budgetDesignData || !budgetDesignData.categories) {
            document.getElementById('budgetDesignKpis').innerHTML =
                '<div class="card" style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-dim);">' +
                'No budget data yet. Click <strong>Import Excel</strong> to load your budget.</div>';
            return;
        }
        renderBudgetDesign();
    } catch (e) {
        console.error('Budget design fetch error:', e);
    }
}


// ── Import ───────────────────────────────────────────────────────────

async function importBudget() {
    const btn = document.getElementById('budgetImportBtn');
    btn.textContent = 'Importing...';
    btn.disabled = true;
    try {
        const res = await fetch('/api/budget/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const json = await res.json();
        if (json.ok) {
            showSaveToast(`Imported ${json.months} months, ${json.assets} assets, ${json.snapshots} snapshots`);
            await fetchBudgetDesign();
        } else {
            showAlert(json.error || 'Import failed', 'error');
        }
    } catch (e) {
        showAlert('Import error: ' + e.message, 'error');
    } finally {
        btn.textContent = 'Import Excel';
        btn.disabled = false;
    }
}


// ── Render ───────────────────────────────────────────────────────────

function renderBudgetDesign() {
    if (!budgetDesignData) return;
    const categories = budgetDesignData.categories;

    // Goals
    renderBDGoals();

    // KPIs
    const totalBudget = categories.filter(c => c.id !== 'income').reduce((s, c) =>
        s + c.subcategories.reduce((ss, sub) => ss + sub.budgeted, 0), 0);
    const totalIncome = categories.filter(c => c.id === 'income').reduce((s, c) =>
        s + c.subcategories.reduce((ss, sub) => ss + sub.budgeted, 0), 0);
    const remainder = totalIncome - totalBudget;
    const savingsCategory = categories.find(c => c.id === 'savings');
    const investCategory = categories.find(c => c.id === 'investments');
    const savingsAmt = (savingsCategory ? savingsCategory.subcategories.reduce((s, sub) => s + sub.budgeted, 0) : 0)
        + (investCategory ? investCategory.subcategories.reduce((s, sub) => s + sub.budgeted, 0) : 0);
    const budgetSavingsRate = totalIncome > 0 ? (savingsAmt / totalIncome * 100) : 0;

    renderKpiGrid('budgetDesignKpis', [
        { label: '📋 Total Monthly Budget', value: formatMoney(totalBudget), sub: 'Expenses + Savings + Investments' },
        { label: '💰 Total Monthly Income', value: formatMoney(totalIncome), sub: 'Budgeted income' },
        { label: '🎯 REMAINDER', value: formatMoney(remainder), sub: remainder >= 0 ? 'Surplus' : 'Over budget', positive: remainder >= 0 },
        { label: '📊 Budget Savings Rate', value: formatPercent(budgetSavingsRate), sub: 'Target savings rate', positive: budgetSavingsRate >= 20 },
    ]);

    // Category cards
    renderBDCategories();
}


// ── Goals ────────────────────────────────────────────────────────────

function renderBDGoals() {
    const container = document.getElementById('budgetDesignGoals');
    if (!container) return;
    const goals = budgetDesignData.goals || [];

    let html = goals.map((g, i) =>
        `<span class="editable-cell" style="background:var(--card-hover);padding:4px 10px;border-radius:12px;font-size:12px;color:var(--text);cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="bdEditGoal(${i})">${escapeHtml(g)}<button onclick="event.stopPropagation();bdDeleteGoal(${i})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:10px;padding:0 2px;">✕</button></span>`
    ).join('');
    html += `<button onclick="bdAddGoal()" class="add-row-btn" style="font-size:12px;padding:4px 10px;">+ Add Goal</button>`;
    container.innerHTML = html;
}

function bdEditGoal(index) {
    const goals = budgetDesignData.goals || [];
    const newVal = prompt('Edit goal:', goals[index]);
    if (newVal === null || newVal.trim() === '') return;
    goals[index] = newVal.trim();
    bdSaveGoals(goals);
}

function bdDeleteGoal(index) {
    const goals = [...(budgetDesignData.goals || [])];
    goals.splice(index, 1);
    bdSaveGoals(goals);
}

function bdAddGoal() {
    const newVal = prompt('New goal:');
    if (!newVal || !newVal.trim()) return;
    const goals = [...(budgetDesignData.goals || []), newVal.trim()];
    bdSaveGoals(goals);
}

async function bdSaveGoals(goals) {
    try {
        const res = await fetch('/api/budget/goals', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goals })
        });
        if ((await res.json()).ok) {
            budgetDesignData.goals = goals;
            renderBDGoals();
            showSaveToast('Goals updated');
        }
    } catch (e) { console.error(e); }
}


// ── Category Cards ──────────────────────────────────────────────────

function renderBDCategories() {
    const container = document.getElementById('budgetDesignCategories');
    if (!container) return;
    const categories = budgetDesignData.categories;

    container.innerHTML = categories.map(cat => {
        const icon = BD_CAT_ICONS[cat.id] || '📋';
        const total = cat.subcategories.reduce((s, sub) => s + sub.budgeted, 0);

        const rows = cat.subcategories.map(sub =>
            `<tr>
                <td style="padding:4px 0;font-size:12px;">
                    <span class="editable-cell" style="cursor:pointer;padding:2px 6px;border-radius:4px;" onclick="bdEditSubName(this,'${cat.id}','${escapeHtml(sub.name)}')">${escapeHtml(sub.name)}</span>
                </td>
                <td style="padding:4px 8px;font-size:12px;text-align:right;">
                    <span class="editable-cell" style="cursor:pointer;padding:2px 6px;border-radius:4px;" onclick="bdEditSubAmount(this,'${cat.id}','${escapeHtml(sub.name)}',${sub.budgeted})">${formatMoney(sub.budgeted)}</span>
                </td>
                <td style="padding:4px 0;width:24px;text-align:center;">
                    <button onclick="bdDeleteSub('${cat.id}','${escapeHtml(sub.name)}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:11px;padding:2px;">✕</button>
                </td>
            </tr>`
        ).join('');

        return `<div class="card" style="padding:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div class="card-title" style="margin:0;">${icon} ${escapeHtml(cat.name)}</div>
                <span style="font-size:13px;font-weight:600;color:var(--text);">${formatMoney(total)}</span>
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr>
                    <th style="text-align:left;font-size:11px;color:var(--text-dim);padding-bottom:4px;">Subcategory</th>
                    <th style="text-align:right;font-size:11px;color:var(--text-dim);padding-bottom:4px;">Budgeted</th>
                    <th style="width:24px;"></th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div id="bdAddForm_${cat.id}" style="display:none;margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">
                <div style="display:flex;gap:6px;align-items:center;">
                    <input type="text" id="bdNewSubName_${cat.id}" placeholder="Name" style="flex:1;padding:4px 8px;background:var(--card-hover);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;">
                    <input type="number" id="bdNewSubAmt_${cat.id}" placeholder="Amount" step="0.01" style="width:80px;padding:4px 8px;background:var(--card-hover);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;">
                    <button onclick="bdAddSub('${cat.id}')" class="add-row-btn" style="font-size:12px;padding:4px 10px;">Add</button>
                    <button onclick="bdHideAddForm('${cat.id}')" class="add-row-btn" style="font-size:12px;padding:4px 10px;">Cancel</button>
                </div>
            </div>
            <button onclick="bdShowAddForm('${cat.id}')" id="bdAddBtn_${cat.id}" class="add-row-btn" style="margin-top:8px;font-size:12px;">+ Add Subcategory</button>

            <details style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px;">
                <summary style="cursor:pointer;font-size:12px;color:var(--text-dim);user-select:none;">Monthly Overrides</summary>
                <div class="table-wrapper" style="margin-top:8px;">
                    ${_bdOverrideGrid(cat)}
                </div>
            </details>
        </div>`;
    }).join('');
}

function _bdOverrideGrid(cat) {
    const months = budgetDesignData.months || {};
    const headers = BD_MONTH_NAMES.map((m, i) =>
        `<th style="padding:4px 6px;font-size:10px;color:var(--text-dim);text-align:center;min-width:55px;">${m.slice(0,3)}</th>`
    ).join('');

    const rows = cat.subcategories.map(sub => {
        const cells = BD_MONTH_KEYS.map((mk, i) => {
            const monthData = months[mk] || {};
            const overrides = (monthData.overrides || {})[cat.id] || {};
            const isOverridden = overrides[sub.name] !== undefined;
            const effectiveAmt = isOverridden ? overrides[sub.name] : sub.budgeted;
            const indicator = isOverridden ? ' <span style="color:#3b82f6;font-size:9px;" title="Override">🔹</span>' : '';

            return `<td style="padding:4px 6px;font-size:11px;text-align:center;">
                <span class="editable-cell" style="cursor:pointer;padding:1px 4px;border-radius:3px;" onclick="bdEditOverride(this,'${cat.id}','${escapeHtml(sub.name)}','${mk}',${effectiveAmt},${sub.budgeted})">${formatMoney(effectiveAmt)}${indicator}</span>
            </td>`;
        }).join('');

        return `<tr>
            <td style="padding:4px 6px;font-size:11px;color:var(--text);white-space:nowrap;position:sticky;left:0;background:var(--card);z-index:1;">${escapeHtml(sub.name)}</td>
            ${cells}
        </tr>`;
    }).join('');

    return `<table style="width:100%;border-collapse:collapse;">
        <thead><tr>
            <th style="padding:4px 6px;font-size:10px;color:var(--text-dim);text-align:left;position:sticky;left:0;background:var(--card);z-index:1;">Subcategory</th>
            ${headers}
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}


// ── Inline Edit Handlers ────────────────────────────────────────────

function bdEditSubName(td, catId, oldName) {
    if (td.querySelector('input')) return;
    const originalHTML = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.style.cssText = 'width:100%;padding:2px 6px;background:var(--card-hover);border:1px solid var(--accent);border-radius:4px;color:var(--text);font-size:12px;';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const save = async () => {
        const newName = input.value.trim();
        if (!newName || newName === oldName) { td.innerHTML = originalHTML; return; }
        // Update subcategory name by deleting old and adding new
        const cat = budgetDesignData.categories.find(c => c.id === catId);
        const sub = cat.subcategories.find(s => s.name === oldName);
        if (!sub) { td.innerHTML = originalHTML; return; }

        try {
            // Delete old
            await fetch('/api/budget/subcategory/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId: catId, name: oldName })
            });
            // Add with new name
            await fetch('/api/budget/category', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId: catId, subcategory: { name: newName, budgeted: sub.budgeted } })
            });
            showSaveToast('Subcategory renamed');
            await fetchBudgetDesign();
        } catch (e) { td.innerHTML = originalHTML; }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.removeEventListener('blur', save); td.innerHTML = originalHTML; }
    });
}

function bdEditSubAmount(td, catId, subName, currentVal) {
    if (td.querySelector('input')) return;
    const originalHTML = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentVal;
    input.style.cssText = 'width:80px;padding:2px 6px;background:var(--card-hover);border:1px solid var(--accent);border-radius:4px;color:var(--text);font-size:12px;text-align:right;';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const save = async () => {
        const newVal = parseFloat(input.value);
        if (isNaN(newVal) || newVal === currentVal) { td.innerHTML = originalHTML; return; }
        try {
            const res = await fetch('/api/budget/category', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId: catId, subcategory: { name: subName, budgeted: newVal } })
            });
            if ((await res.json()).ok) {
                showSaveToast('Budget updated');
                await fetchBudgetDesign();
            }
        } catch (e) { td.innerHTML = originalHTML; }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.removeEventListener('blur', save); td.innerHTML = originalHTML; }
    });
}

function bdEditOverride(td, catId, subName, month, currentVal, masterVal) {
    if (td.querySelector('input')) return;
    const originalHTML = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentVal;
    input.style.cssText = 'width:55px;padding:2px 4px;background:var(--card-hover);border:1px solid var(--accent);border-radius:4px;color:var(--text);font-size:11px;text-align:center;';
    input.title = 'Set to master value (' + formatMoney(masterVal) + ') to clear override';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const save = async () => {
        const newVal = parseFloat(input.value);
        if (isNaN(newVal)) { td.innerHTML = originalHTML; return; }

        // If set back to master value, clear override
        const amount = (newVal === masterVal) ? null : newVal;
        try {
            const res = await fetch('/api/budget/override', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month, categoryId: catId, subcategory: subName, amount })
            });
            if ((await res.json()).ok) {
                showSaveToast(amount === null ? 'Override cleared' : 'Override set');
                await fetchBudgetDesign();
            }
        } catch (e) { td.innerHTML = originalHTML; }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.removeEventListener('blur', save); td.innerHTML = originalHTML; }
    });
}


// ── Add/Delete Subcategory ──────────────────────────────────────────

function bdShowAddForm(catId) {
    document.getElementById('bdAddForm_' + catId).style.display = 'block';
    document.getElementById('bdAddBtn_' + catId).style.display = 'none';
    document.getElementById('bdNewSubName_' + catId).focus();
}

function bdHideAddForm(catId) {
    document.getElementById('bdAddForm_' + catId).style.display = 'none';
    document.getElementById('bdAddBtn_' + catId).style.display = '';
}

async function bdAddSub(catId) {
    const nameInput = document.getElementById('bdNewSubName_' + catId);
    const amtInput = document.getElementById('bdNewSubAmt_' + catId);
    const name = nameInput.value.trim();
    const amount = parseFloat(amtInput.value) || 0;
    if (!name) return;

    try {
        const res = await fetch('/api/budget/category', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryId: catId, subcategory: { name, budgeted: amount } })
        });
        if ((await res.json()).ok) {
            showSaveToast('Subcategory added');
            nameInput.value = '';
            amtInput.value = '';
            bdHideAddForm(catId);
            await fetchBudgetDesign();
        }
    } catch (e) { console.error(e); }
}

async function bmMigrateTxns() {
    try {
        const res = await fetch('/api/budget/transactions/migrate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        const json = await res.json();
        if (json.ok) {
            showSaveToast(`Migrated ${json.migrated} transactions`);
            await fetchBudgetDesign();
        }
    } catch (e) { console.error(e); }
}

async function bdDeleteSub(catId, name) {
    try {
        const res = await fetch('/api/budget/subcategory/delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryId: catId, name })
        });
        if ((await res.json()).ok) {
            showSaveToast('Subcategory removed');
            await fetchBudgetDesign();
        }
    } catch (e) { console.error(e); }
}
