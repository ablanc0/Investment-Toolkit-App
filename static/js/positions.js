// ── Tab 2: Positions ──

function populatePositions() {
    if (!portfolioData || !portfolioData.positions) return;

    const positions = portfolioData.positions;
    const tbody = document.getElementById('positionsBody');
    tbody.innerHTML = '';

    const categories = [...new Set(positions.map(p => p.category))];
    const sectors = [...new Set(positions.map(p => p.sector))];

    const categoryFilter = document.getElementById('categoryFilter');
    const sectorFilter = document.getElementById('sectorFilter');

    categoryFilter.innerHTML = '<option value="">All Categories</option>' +
        categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    sectorFilter.innerHTML = '<option value="">All Sectors</option>' +
        sectors.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

    // Set default signal mode from settings
    const signalModeSelect = document.getElementById('signalMode');
    if (_defaultSignalMode) signalModeSelect.value = _defaultSignalMode === 'iv' ? 'iv' : 'avgCost';

    renderPositionsTable(positions);
    populateCategorySelect('newCategory');

    const searchInput = document.getElementById('positionSearch');
    searchInput.addEventListener('input', () => filterPositionsTable(positions));
    categoryFilter.addEventListener('change', () => filterPositionsTable(positions));
    sectorFilter.addEventListener('change', () => filterPositionsTable(positions));
    document.getElementById('signalMode').addEventListener('change', () => filterPositionsTable(positions));
}

function renderPositionsTable(positions) {
    const tbody = document.getElementById('positionsBody');
    const categories = getCategoryOptions();
    const mode = document.getElementById('signalMode').value;
    const useIV = mode === 'iv';

    const rows = positions.map(p => {
        const dist = useIV ? p.distFromIV : p.distFromAvgCost;
        const signal = useIV ? (p.ivSignal || p.avgCostSignal) : p.avgCostSignal;
        const distClass = useIV
            ? ((p.distFromIV||0) <= 0 ? 'positive' : 'negative')
            : ((p.distFromAvgCost||0) >= 0 ? 'positive' : 'negative');
        const distDisplay = useIV && !p.intrinsicValue ? '—' : formatPercent(dist);

        return `<tr>
            <td>${tickerLogo(p.ticker)}<strong>${escapeHtml(p.ticker)}</strong></td>
            <td>${escapeHtml(p.company)}</td>
            <td class="editable" onclick="editCell(this, '${escapeHtml(p.ticker)}', 'shares', ${p.shares}, 'number')">${parseFloat(p.shares).toFixed(3)}</td>
            <td class="editable" onclick="editCell(this, '${escapeHtml(p.ticker)}', 'avgCost', ${p.avgCost}, 'number')">${formatMoney(p.avgCost)}</td>
            <td>${formatMoney(p.price)}</td>
            <td class="${(p.dayChangeShare||0) >= 0 ? 'positive' : 'negative'}">${formatMoney(p.dayChangeShare)}</td>
            <td class="${(p.dayChangePct||0) >= 0 ? 'positive' : 'negative'}">${formatPercent(p.dayChangePct)}</td>
            <td>${formatMoney(p.costBasis)}</td>
            <td>${formatMoney(p.marketValue)}</td>
            <td class="${(p.marketReturn||0) >= 0 ? 'positive' : 'negative'}">${formatMoney(p.marketReturn)}</td>
            <td class="${(p.marketReturnPct||0) >= 0 ? 'positive' : 'negative'}">${formatPercent(p.marketReturnPct)}</td>
            <td>${formatMoney(p.totalDivsReceived)}</td>
            <td class="${p.totalReturn >= 0 ? 'positive' : 'negative'}">${formatMoney(p.totalReturn)}</td>
            <td class="${p.returnPercent >= 0 ? 'positive' : 'negative'}">${formatPercent(p.returnPercent)}</td>
            <td>${formatPercent(p.weight)}</td>
            <td>${p.divYield ? p.divYield.toFixed(2) + '%' : '—'}</td>
            <td>${p.yieldOnCost ? p.yieldOnCost.toFixed(2) + '%' : '—'}</td>
            <td>${formatMoney(p.annualDivIncome)}</td>
            <td>${p.pctOfTotalIncome ? p.pctOfTotalIncome.toFixed(1) + '%' : '—'}</td>
            <td>${p.annualSharesPurch ? p.annualSharesPurch.toFixed(3) : '—'}</td>
            <td>${p.intrinsicValue ? formatMoney(p.intrinsicValue) : '—'}</td>
            <td style="text-align:right;">${p.invtScore ? `<span style="color:${_invtScoreColor(p.invtScore)};font-weight:600">${Number(p.invtScore).toFixed(1)}</span>` : '—'}</td>
            <td class="${distClass}">${distDisplay}</td>
            <td>${getSignalBadge(signal)}</td>
            <td class="editable" onclick="editCellSelect(this, '${escapeHtml(p.ticker)}', 'category', '${escapeHtml(p.category)}', ${JSON.stringify(categories).replace(/"/g, '&quot;')})">${getCategoryBadge(p.category)}</td>
            <td class="editable" onclick="editCell(this, '${escapeHtml(p.ticker)}', 'sector', '${escapeHtml(p.sector)}', 'text')">${escapeHtml(p.sector)}</td>
            <td><button class="delete-row-btn" onclick="deletePosition('${escapeHtml(p.ticker)}')" title="Remove position">✕</button></td>
        </tr>`;
    }).join('');

    // Cash row (27 columns total)
    const cash = portfolioData?.summary?.cash || 0;
    const totalPortfolio = portfolioData?.summary?.totalPortfolio || 1;
    const cashWeight = (cash / totalPortfolio * 100);
    const cashRow = `<tr class="summary-row">
        <td><strong>CASH</strong></td>
        <td>Cash & Equivalents</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
        <td>—</td>
        <td>${formatMoney(cash)}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
        <td>${formatPercent(cashWeight)}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
        <td>—</td><td>—</td><td>—</td><td>—</td>
        <td>${getCategoryBadge('Cash')}</td>
        <td>—</td>
        <td></td>
    </tr>`;

    tbody.innerHTML = rows + cashRow;
}

function filterPositionsTable(positions) {
    const search = document.getElementById('positionSearch').value.toLowerCase();
    const category = document.getElementById('categoryFilter').value;
    const sector = document.getElementById('sectorFilter').value;

    const filtered = positions.filter(p => {
        const matchesSearch = p.ticker.toLowerCase().includes(search) ||
                             p.company.toLowerCase().includes(search);
        const matchesCategory = !category || p.category === category;
        const matchesSector = !sector || p.sector === sector;
        return matchesSearch && matchesCategory && matchesSector;
    });

    renderPositionsTable(filtered);
}

function sortTable(th) {
    const table = document.getElementById('positionsTable');
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const index = Array.from(th.parentNode.children).indexOf(th);
    const isAscending = th.classList.contains('ascending');

    rows.sort((a, b) => {
        const aVal = a.cells[index].textContent.trim();
        const bVal = b.cells[index].textContent.trim();

        const aNum = parseFloat(aVal.replace(/[$,%]/g, ''));
        const bNum = parseFloat(bVal.replace(/[$,%]/g, ''));

        if (!isNaN(aNum) && !isNaN(bNum)) {
            return isAscending ? bNum - aNum : aNum - bNum;
        }
        return isAscending ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    });

    th.classList.toggle('ascending');
    rows.forEach(row => table.querySelector('tbody').appendChild(row));
}

function editCell(td, ticker, field, currentValue, inputType) {
    if (td.querySelector('input')) return;

    const originalHTML = td.innerHTML;
    td.classList.add('cell-editing');
    td.classList.remove('editable');

    const input = document.createElement('input');
    input.type = inputType === 'number' ? 'number' : 'text';
    input.value = currentValue;
    if (inputType === 'number') input.step = field === 'shares' ? '0.001' : '0.01';

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const save = async () => {
        const newValue = inputType === 'number' ? parseFloat(input.value) : input.value;
        if (newValue === currentValue || (inputType === 'number' && isNaN(newValue))) {
            td.innerHTML = originalHTML;
            td.classList.remove('cell-editing');
            td.classList.add('editable');
            return;
        }

        try {
            const resp = await fetch('/api/position/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ticker, field, value: newValue})
            });
            if (resp.ok) {
                showSaveToast(`${ticker} ${field} updated`);
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

function editCellSelect(td, ticker, field, currentValue, options) {
    if (td.querySelector('select')) return;

    const originalHTML = td.innerHTML;
    td.classList.add('cell-editing');
    td.classList.remove('editable');

    const select = document.createElement('select');
    options.forEach(opt => {
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
            const resp = await fetch('/api/position/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ticker, field, value: newValue})
            });
            if (resp.ok) {
                showSaveToast(`${ticker} ${field} updated`);
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

function showAddPositionForm() {
    document.getElementById('addPositionBtn').style.display = 'none';
    document.getElementById('addPositionForm').style.display = 'block';
    document.getElementById('newTicker').focus();
}

function hideAddPositionForm() {
    document.getElementById('addPositionBtn').style.display = 'inline-flex';
    document.getElementById('addPositionForm').style.display = 'none';
    document.getElementById('newTicker').value = '';
    document.getElementById('newShares').value = '';
    document.getElementById('newAvgCost').value = '';
}

async function addPosition() {
    const ticker = document.getElementById('newTicker').value.toUpperCase().trim();
    const shares = parseFloat(document.getElementById('newShares').value);
    const avgCost = parseFloat(document.getElementById('newAvgCost').value);
    const category = document.getElementById('newCategory').value;
    const secType = document.getElementById('newSecType').value;

    if (!ticker) { alert('Enter a ticker symbol'); return; }
    if (isNaN(shares) || shares <= 0) { alert('Enter valid shares'); return; }
    if (isNaN(avgCost) || avgCost <= 0) { alert('Enter valid avg cost'); return; }

    try {
        const resp = await fetch('/api/position/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ticker, shares, avgCost, category, secType})
        });
        const data = await resp.json();
        if (resp.ok) {
            showSaveToast(`${ticker} added`);
            hideAddPositionForm();
            await fetchAllData();
        } else {
            alert(data.error || 'Error adding position');
        }
    } catch (e) {
        alert('Network error');
    }
}

async function deletePosition(ticker) {
    if (!confirm(`Remove ${ticker} from portfolio?`)) return;

    try {
        const resp = await fetch('/api/position/delete', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ticker})
        });
        if (resp.ok) {
            showSaveToast(`${ticker} removed`);
            await fetchAllData();
        }
    } catch (e) {
        alert('Network error');
    }
}
