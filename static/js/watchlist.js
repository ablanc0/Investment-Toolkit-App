// ── Tab 5: Watchlist ──

function populateWatchlist() {
    if (!watchlistData || !watchlistData.watchlist) return;

    const tbody = document.getElementById('watchlistBody');
    tbody.innerHTML = watchlistData.watchlist.map(item => {
        const distance = item.distance || 0;
        let signal;
        if (distance < -5) signal = 'Strong Buy';
        else if (distance < 0) signal = 'Buy';
        else if (distance > 50) signal = 'Overrated';
        else if (distance > 20) signal = 'Expensive';
        else signal = 'Hold';

        return `
            <tr>
                <td>${tickerLogo(item.ticker)}<strong>${escapeHtml(item.ticker)}</strong></td>
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
                <td>${escapeHtml(item.priority || 'Low')}</td>
                <td><button class="delete-row-btn" onclick="deleteFromWatchlist('${escapeHtml(item.ticker)}')" title="Remove">✕</button></td>
            </tr>
        `;
    }).join('');
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
