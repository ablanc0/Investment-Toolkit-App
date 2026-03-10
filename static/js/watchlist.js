// ── Tab 5: Watchlist ──

function populateWatchlist() {
    if (!watchlistData || !watchlistData.watchlist) return;

    const items = watchlistData.watchlist;

    // KPI cards
    const kpis = document.getElementById('watchlistKpis');
    if (kpis) {
        const total = items.length;
        const highPriority = items.filter(i => i.priority === 'High').length;
        const strongBuy = items.filter(i => i.signal === 'Strong Buy').length;
        const buy = items.filter(i => i.signal === 'Buy').length;
        const belowIV = items.filter(i => i.distance < 0).length;
        kpis.innerHTML = `
            <div class="kpi-card">
                <div class="kpi-emoji">👁️</div>
                <div class="kpi-label">Watching</div>
                <div class="kpi-value">${total}</div>
                <div class="kpi-sub">Total tickers</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-emoji">🔴</div>
                <div class="kpi-label">High Priority</div>
                <div class="kpi-value">${highPriority}</div>
                <div class="kpi-sub">Needs attention</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-emoji">💎</div>
                <div class="kpi-label">Strong Buy</div>
                <div class="kpi-value positive">${strongBuy}</div>
                <div class="kpi-sub">Below intrinsic value</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-emoji">📉</div>
                <div class="kpi-label">Below IV</div>
                <div class="kpi-value positive">${belowIV}</div>
                <div class="kpi-sub"><span style="color:#4ade80;font-size:8px;">●</span> marked in table</div>
            </div>
        `;
    }

    // Sort by priority: High > Medium > Low
    const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
    const sorted = [...items].sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 2;
        const pb = priorityOrder[b.priority] ?? 2;
        return pa - pb;
    });

    const tbody = document.getElementById('watchlistBody');
    tbody.innerHTML = sorted.map(item => {
        const distance = item.distance || 0;
        const signal = item.signal || 'Hold';
        const belowIV = distance < 0;

        // Priority badge
        const priorityBadge = getPriorityBadge(item.priority || 'Low');

        // Notes (truncated)
        const notes = escapeHtml(item.notes || '');
        const notesTruncated = notes.length > 30 ? notes.substring(0, 30) + '…' : notes;

        // Price alert indicator (green dot if below IV)
        const alertDot = belowIV ? '<span style="color:#4ade80;font-size:8px;margin-right:4px;">●</span>' : '';

        return `
            <tr>
                <td>${alertDot}${tickerLogo(item.ticker)}<a href="#" onclick="openAnalyzer('${escapeHtml(item.ticker)}');return false;" style="color:var(--text);text-decoration:none;"><strong>${escapeHtml(item.ticker)}</strong></a></td>
                <td>${escapeHtml(item.company)}</td>
                <td>${formatMoney(item.price)}</td>
                <td class="${(item.dayChangeShare||0) >= 0 ? 'positive' : 'negative'}">${formatMoney(item.dayChangeShare)}</td>
                <td class="${(item.dayChangePct||0) >= 0 ? 'positive' : 'negative'}">${formatPercent(item.dayChangePct)}</td>
                <td>${formatMoney(item.fiftyTwoWeekLow)}</td>
                <td>${formatMoney(item.fiftyTwoWeekHigh)}</td>
                <td>${formatMoney(item.intrinsicValue)}</td>
                <td class="${distance <= 0 ? 'positive' : 'negative'}">${formatPercent(distance)}</td>
                <td>${getSignalBadge(signal)}</td>
                <td style="text-align:right;">${item.invtScore ? `<span style="color:${_invtScoreColor(item.invtScore)};font-weight:600">${Number(item.invtScore).toFixed(1)}</span>` : '—'}</td>
                <td>${item.pe ? item.pe.toFixed(1) : '—'}</td>
                <td>${item.eps ? formatMoney(item.eps) : '—'}</td>
                <td>${item.divYield ? item.divYield.toFixed(2) + '%' : '—'}</td>
                <td>${item.divRate ? formatMoney(item.divRate) : '—'}</td>
                <td>${item.annualIncome100 ? formatMoney(item.annualIncome100) : '—'}</td>
                <td>${formatMoney(item.cost100Shares)}</td>
                <td>${escapeHtml(item.sector)}</td>
                <td class="editable" onclick="editWatchlistPriority(this, '${escapeHtml(item.ticker)}', '${escapeHtml(item.priority || 'Low')}')">${priorityBadge}</td>
                <td class="editable" onclick="editWatchlistNotes(this, '${escapeHtml(item.ticker)}', '${escapeHtml(item.notes || '')}')" title="${notes}">${notesTruncated || '<span style="color:var(--text-dim);font-size:12px;">+ Add note</span>'}</td>
                <td><button class="delete-row-btn" onclick="deleteFromWatchlist('${escapeHtml(item.ticker)}')" title="Remove">✕</button></td>
            </tr>
        `;
    }).join('');
}

function getPriorityBadge(priority) {
    const styles = {
        'High': 'background:#3f1d1d;color:#f87171;',
        'Medium': 'background:#4b3f1d;color:#f59e0b;',
        'Low': 'background:#1e293b;color:#94a3b8;',
    };
    const style = styles[priority] || styles['Low'];
    return `<span class="badge" style="${style}">${escapeHtml(priority)}</span>`;
}

function editWatchlistPriority(td, ticker, currentValue) {
    if (td.querySelector('select')) return;

    const originalHTML = td.innerHTML;
    td.classList.add('cell-editing');
    td.classList.remove('editable');

    const select = document.createElement('select');
    ['High', 'Medium', 'Low'].forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (opt === currentValue) option.selected = true;
        select.appendChild(option);
    });

    td.innerHTML = '';
    td.appendChild(select);
    select.focus();

    const save = async () => {
        const newValue = select.value;
        if (newValue === currentValue) {
            td.innerHTML = originalHTML;
            td.classList.remove('cell-editing');
            td.classList.add('editable');
            return;
        }

        try {
            const resp = await fetch('/api/watchlist/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ticker, priority: newValue})
            });
            if (resp.ok) {
                showSaveToast(`${ticker} priority updated`);
                await fetchAllData();
            } else {
                td.innerHTML = originalHTML;
                td.classList.remove('cell-editing');
                td.classList.add('editable');
            }
        } catch (e) {
            td.innerHTML = originalHTML;
            td.classList.remove('cell-editing');
            td.classList.add('editable');
        }
    };

    select.addEventListener('blur', save);
    select.addEventListener('change', () => select.blur());
}

function editWatchlistNotes(td, ticker, currentValue) {
    if (td.querySelector('input')) return;

    const originalHTML = td.innerHTML;
    td.classList.add('cell-editing');
    td.classList.remove('editable');

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.placeholder = 'Add a note...';
    input.style.minWidth = '120px';

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const save = async () => {
        const newValue = input.value.trim();
        if (newValue === currentValue) {
            td.innerHTML = originalHTML;
            td.classList.remove('cell-editing');
            td.classList.add('editable');
            return;
        }

        try {
            const resp = await fetch('/api/watchlist/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ticker, notes: newValue})
            });
            if (resp.ok) {
                showSaveToast(`${ticker} note updated`);
                await fetchAllData();
            } else {
                td.innerHTML = originalHTML;
                td.classList.remove('cell-editing');
                td.classList.add('editable');
            }
        } catch (e) {
            td.innerHTML = originalHTML;
            td.classList.remove('cell-editing');
            td.classList.add('editable');
        }
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            input.removeEventListener('blur', save);
            td.innerHTML = originalHTML;
            td.classList.remove('cell-editing');
            td.classList.add('editable');
        }
    });
}

async function addToWatchlist() {
    const ticker = document.getElementById('wlNewTicker').value.toUpperCase().trim();
    const priority = document.getElementById('wlNewPriority').value;

    if (!ticker) { alert('Enter a ticker symbol'); return; }

    try {
        const resp = await fetch('/api/watchlist/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ticker, priority})
        });
        const data = await resp.json();
        if (resp.ok) {
            showSaveToast(`${ticker} added to watchlist`);
            document.getElementById('wlNewTicker').value = '';
            await fetchAllData();
        } else {
            alert(data.error || 'Error adding to watchlist');
        }
    } catch (e) {
        alert('Network error');
    }
}

async function deleteFromWatchlist(ticker) {
    if (!confirm(`Remove ${ticker} from watchlist?`)) return;

    try {
        const resp = await fetch('/api/watchlist/delete', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ticker})
        });
        if (resp.ok) {
            showSaveToast(`${ticker} removed from watchlist`);
            await fetchAllData();
        }
    } catch (e) {
        alert('Network error');
    }
}
