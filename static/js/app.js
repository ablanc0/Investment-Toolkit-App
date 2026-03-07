// Theme initialization (runs immediately to prevent flash)
(function() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
})();

// ── App Initialization & Navigation ─────────────────────────────
// Extracted from dashboard.html — keep in global scope (no modules)

// Global state
let portfolioData = null;
let watchlistData = null;
let dividendData = null;
let statusData = null;
let isLoading = false;

// Generic CRUD Table Builder
class CrudTable {
    constructor(containerId, config) {
        this.containerId = containerId;
        this.config = config; // { columns, apiBase, section, addFields }
        this.data = [];
    }

    async load() {
        try {
            const resp = await fetch(`${this.config.apiBase}`);
            this.data = await resp.json();
            this.render();
        } catch (e) {
            console.error('Error loading data:', e);
        }
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        let html = '<div class="table-wrapper"><table style="width: 100%; border-collapse: collapse;"><thead>';
        html += '<tr>';
        this.config.columns.forEach(col => {
            html += `<th style="padding: 12px; text-align: left; background: var(--card-hover); border-bottom: 2px solid var(--border); font-weight: 600; font-size: 12px; text-transform: uppercase;">${col.label}</th>`;
        });
        html += '<th style="padding: 12px; width: 40px;"></th></tr></thead><tbody>';

        this.data.forEach(row => {
            html += '<tr>';
            this.config.columns.forEach(col => {
                const value = row[col.key];
                html += `<td style="padding: 12px; border-bottom: 1px solid var(--border);">${this.formatValue(value, col)}</td>`;
            });
            html += `<td style="padding: 12px;"><button class="delete-row-btn" onclick="crudDelete('${this.containerId}', '${row.id}')">✕</button></td></tr>`;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    }

    formatValue(value, col) {
        if (!value) return '-';
        if (col.type === 'money') return '$' + parseFloat(value).toFixed(2);
        if (col.type === 'percent') return parseFloat(value).toFixed(2) + '%';
        return value;
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = next === 'dark' ? '\u{1F319}' : '\u{2600}\u{FE0F}';
}

// ── API Health Badge ─────────────────────────────────────────────
function updateHealthBadge(data) {
    const dot = document.getElementById('apiHealthDot');
    const text = document.getElementById('apiHealthText');
    if (!dot || !text) return;
    const statuses = Object.values(data.apis || {}).map(a => a.status);
    const okCount = statuses.filter(s => s === 'ok').length;
    if (statuses.every(s => s === 'ok')) {
        dot.style.background = '#22c55e';
        text.textContent = 'APIS OK';
        text.style.color = '#22c55e';
    } else if (statuses.some(s => s === 'error')) {
        const errCount = statuses.filter(s => s === 'error').length;
        dot.style.background = '#ef4444';
        text.textContent = `APIS ${okCount}/${statuses.length}`;
        text.style.color = '#ef4444';
    } else {
        dot.style.background = '#6b7280';
        text.textContent = 'APIS';
        text.style.color = '';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupTabNavigation();
    setupRefreshButton();
    fetchAllData();
    // Set theme toggle icon
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.textContent = (localStorage.getItem('theme') || 'dark') === 'dark' ? '\u{1F319}' : '\u{2600}\u{FE0F}';
    // Auto-load last analyzed ticker from saved data (no API calls)
    const lastTicker = localStorage.getItem('analyzerLastTicker');
    if (lastTicker) {
        const input = document.getElementById('analyzerTicker');
        if (input) { input.value = lastTicker; analyzeStock(false); }
    }
    // Auto health check on startup
    fetch('/api/health/check', { method: 'POST' })
        .then(r => r.json())
        .then(data => updateHealthBadge(data))
        .catch(() => {});
});

// Two-Level Navigation
function setupTabNavigation() {
    // Group buttons (top row)
    document.querySelectorAll('.group-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchGroup(btn.dataset.group);
        });
    });

    // Tab buttons (second row)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab) {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.tab);
            });
        }
    });

    // Restore last active tab, or use settings default
    const lastTab = localStorage.getItem('activeTab');
    const defaultTab = _displaySettings?.defaultTab || 'overview';
    const tabToLoad = (lastTab && document.getElementById(lastTab)) ? lastTab : defaultTab;
    if (document.getElementById(tabToLoad)) {
        switchTab(tabToLoad);
    }
}

function switchGroup(groupId) {
    // Update group buttons
    document.querySelectorAll('.group-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.group-btn[data-group="${groupId}"]`).classList.add('active');

    // Show matching tab row, hide others
    document.querySelectorAll('.tab-row').forEach(row => {
        row.style.display = row.dataset.group === groupId ? 'flex' : 'none';
    });

    // Auto-select first tab in group if none active
    const tabRow = document.querySelector(`.tab-row[data-group="${groupId}"]`);
    const activeTab = tabRow.querySelector('.tab-btn.active');
    if (!activeTab) {
        const firstTab = tabRow.querySelector('.tab-btn');
        if (firstTab) switchTab(firstTab.dataset.tab);
    }
}

let loadedTabs = {};

function switchTab(tabId) {
    // Find which group this tab belongs to and activate it
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (tabBtn) {
        const tabRow = tabBtn.closest('.tab-row');
        const groupId = tabRow?.dataset.group;
        if (groupId) {
            document.querySelectorAll('.group-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector(`.group-btn[data-group="${groupId}"]`)?.classList.add('active');
            document.querySelectorAll('.tab-row').forEach(row => {
                row.style.display = row.dataset.group === groupId ? 'flex' : 'none';
            });
        }
    } else {
        // Standalone tab (e.g. Settings) — deactivate nav
        document.querySelectorAll('.group-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-row').forEach(row => row.style.display = 'none');
    }

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (tabBtn) tabBtn.classList.add('active');

    // Switch tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    // Persist active tab
    localStorage.setItem('activeTab', tabId);

    // Lazy load new tabs on first visit
    if (!loadedTabs[tabId]) {
        loadedTabs[tabId] = true;
        loadTabData(tabId);
    }

    setTimeout(() => {
        Object.values(charts).forEach(chart => { if (chart && chart.resize) chart.resize(); });
    }, 100);
}

function loadTabData(tabId) {
    const loaders = {
        sold: fetchSoldPositions,
        divlog: fetchDividendLog,
        monthly: fetchMonthlyData,
        annual: fetchAnnualData,
        lab: fetchMyLab,
        ivlist: fetchIntrinsicValues,
        superinv: fetchSuperInvestors,
        salary: fetchSalaryData,
        passive: fetchPassiveIncome,
        rule4pct: fetchRule4Pct,
        costOfLiving: fetchCostOfLiving,
        projections: fetchProjections,
        settingsCategories: fetchSettingsData,
        apiHealth: fetchApiHealth,
    };
    if (loaders[tabId]) loaders[tabId]();
}

// Refresh Button
function setupRefreshButton() {
    document.getElementById('refreshBtn').addEventListener('click', () => {
        fetchAllData();
    });
}

// Fetch Data
async function fetchAllData(retryCount = 0) {
    if (isLoading) return;
    isLoading = true;

    setLoadingState(true);
    try {
        const safeFetch = (url) => fetch(url).then(r => r.json()).catch(() => null);
        await loadCategorySettings();
        const [portfolio, watchlist, dividends, status] = await Promise.all([
            safeFetch('/api/portfolio'),
            safeFetch('/api/watchlist'),
            safeFetch('/api/dividends'),
            safeFetch('/api/status'),
        ]);

        if (!portfolio && retryCount < 2) {
            isLoading = false;
            setLoadingState(false);
            setTimeout(() => fetchAllData(retryCount + 1), 1500);
            return;
        }

        if (portfolio) {
            portfolioData = portfolio;
            window._portfolioSummary = portfolio.summary || {};
        }
        if (watchlist) watchlistData = watchlist;
        if (dividends) dividendData = dividends;
        if (status) statusData = status;

        // Populate all tabs
        populateOverview();
        populatePositions();
        populatePerformance();
        populateDividends();
        populateWatchlist();
        populateRebalancing();
        populateAlerts();
        populateNewTabs();

        // Re-render settings editors that depend on portfolioData
        if (typeof renderGoalsEditor === 'function') renderGoalsEditor();
        if (typeof renderTargetAllocEditor === 'function') renderTargetAllocEditor();

        setLoadingState(false);
        updateTimestamp();
    } catch (error) {
        console.error('Error fetching data:', error);
        if (retryCount < 2) {
            isLoading = false;
            setTimeout(() => fetchAllData(retryCount + 1), 1500);
            return;
        }
        showAlert('Could not load data. Is the server running?', 'error');
        setLoadingState(false);
    }

    isLoading = false;
}

function setLoadingState(loading) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const refreshBtn = document.getElementById('refreshBtn');

    if (loading) {
        statusDot.classList.add('loading');
        statusText.textContent = 'LOADING...';
        statusText.style.color = '#f59e0b';
        refreshBtn.disabled = true;
    } else {
        statusDot.classList.remove('loading');
        statusText.textContent = 'LIVE DATA';
        statusText.style.color = '#22c55e';
        refreshBtn.disabled = false;
    }
}

function updateTimestamp() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastUpdated').textContent = time;
    fetchBackupStatus();
}

// ── Backup Status ────────────────────────────────────────────────
async function fetchBackupStatus() {
    try {
        const resp = await fetch('/api/backup/status');
        const data = await resp.json();
        const el = document.getElementById('lastBackup');
        if (!el) return;
        if (data.lastBackup) {
            const d = new Date(data.lastBackup);
            el.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            el.title = `${data.filesCopied} copied, ${data.filesSkipped} skipped`;
        } else if (data.error) {
            el.textContent = 'Error';
        }
    } catch { /* silent */ }
}

document.addEventListener('DOMContentLoaded', () => {
    const backupEl = document.getElementById('backupStatus');
    if (backupEl) {
        backupEl.addEventListener('click', async () => {
            const span = document.getElementById('lastBackup');
            span.textContent = '...';
            await fetch('/api/backup/now', { method: 'POST' });
            setTimeout(fetchBackupStatus, 2000);
        });
    }
    setInterval(fetchBackupStatus, 60000);
});
