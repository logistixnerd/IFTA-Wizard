// src/ui/table.js
// All data-table UI: row creation, event listeners, cell editing, totals, paste.
// Circular dependency with calculator.js is broken by main.js injecting
// calculateRow and forceUpdateTaxRate into this module via initTable().

import { appState, updateRowField } from '../core/state.js';
import { roundTo } from '../core/validators.js';
import { formatRate, formatCurrency, formatNumber, formatWholeGallons } from '../core/formatters.js';
import { getJurisdictionList, getIftaTaxRates } from '../core/tax-utils.js';
import { showToast } from './toast.js';

// Injected from main.js to break circular dependency
let _calculateRow    = () => {};
let _forceUpdateRate = () => {};

export function initTable({ calculateRow, forceUpdateTaxRate }) {
    _calculateRow    = calculateRow;
    _forceUpdateRate = forceUpdateTaxRate;
}

// ── Pure rendering ─────────────────────────────────────────────────────────

/**
 * Returns the inner HTML string (the <td> cells) for one data row.
 * No appState or window reads — everything is passed via context.
 *
 * @param {object} rowData
 * @param {{
 *   jurisdictionList:  { code: string, name: string, country: string }[],
 *   usedJurisdictions: string[],   // codes already used by OTHER rows
 *   displayTaxDue:     number,     // pre-computed by the caller
 *   formatters:        { formatRate: Function, formatWholeGallons: Function, formatCurrency: Function }
 * }} context
 * @returns {string}
 */
export function renderRow(rowData, context) {
    const { jurisdictionList, usedJurisdictions, displayTaxDue, formatters } = context;
    const { formatRate: fmtRate, formatWholeGallons: fmtGal, formatCurrency: fmtCur } = formatters;

    let opts = '<option value="">Select...</option>';
    opts += '<optgroup label="United States">';
    jurisdictionList.filter(j => j.country === 'US').forEach(j => {
        const selected = rowData.jurisdiction === j.code ? 'selected' : '';
        const isUsed   = usedJurisdictions.includes(j.code);
        opts += `<option value="${j.code}" ${selected} ${isUsed ? 'disabled' : ''}>${j.name} (${j.code})${isUsed ? ' (already added)' : ''}</option>`;
    });
    opts += '</optgroup><optgroup label="Canada">';
    jurisdictionList.filter(j => j.country === 'CAN').forEach(j => {
        const selected = rowData.jurisdiction === j.code ? 'selected' : '';
        const isUsed   = usedJurisdictions.includes(j.code);
        opts += `<option value="${j.code}" ${selected} ${isUsed ? 'disabled' : ''}>${j.name} (${j.code})${isUsed ? ' (already added)' : ''}</option>`;
    });
    opts += '</optgroup>';

    const taxClass          = displayTaxDue >= 0 ? 'positive' : 'negative';
    const totalMilesVal     = rowData.totalMiles     ? Math.round(rowData.totalMiles)     : 0;
    const taxableMilesVal   = rowData.taxableMiles   ? Math.round(rowData.taxableMiles)   : 0;
    const taxPaidGallonsVal = rowData.taxPaidGallons ? Math.round(rowData.taxPaidGallons) : 0;
    const jurisdictionLabel = rowData.jurisdiction   || '<span class="cell-placeholder">Select...</span>';

    return `
        <td class="ifta-cell ifta-cell-jurisdiction" data-field="jurisdiction">
            <div class="ifta-cell-display">${jurisdictionLabel}</div>
            <select class="jurisdiction-select ifta-cell-editor" data-field="jurisdiction">
                ${opts}
            </select>
        </td>
        <td class="ifta-cell ifta-cell-number" data-field="totalMiles">
            <div class="ifta-cell-display">${totalMilesVal ? totalMilesVal.toLocaleString() : '<span class="cell-placeholder">0</span>'}</div>
            <input type="number" class="total-miles ifta-cell-editor" data-field="totalMiles"
                   value="${totalMilesVal || ''}" min="0" step="1" placeholder="0">
        </td>
        <td class="ifta-cell ifta-cell-number" data-field="taxableMiles">
            <div class="ifta-cell-display">${taxableMilesVal ? taxableMilesVal.toLocaleString() : '<span class="cell-placeholder">0</span>'}</div>
            <input type="number" class="taxable-miles ifta-cell-editor" data-field="taxableMiles"
                   value="${taxableMilesVal || ''}" min="0" step="1" placeholder="0">
        </td>
        <td class="ifta-cell ifta-cell-number" data-field="taxPaidGallons">
            <div class="ifta-cell-display">${taxPaidGallonsVal ? taxPaidGallonsVal.toLocaleString() : '<span class="cell-placeholder">0</span>'}</div>
            <input type="number" class="tax-paid-gallons ifta-cell-editor" data-field="taxPaidGallons"
                   value="${taxPaidGallonsVal || ''}" min="0" step="1" placeholder="0">
        </td>
        <td class="rate-display">${fmtRate(rowData.taxRate)}</td>
        <td class="taxable-gallons">${fmtGal(rowData.taxableGallons)}</td>
        <td class="net-taxable-gallons">${fmtGal(rowData.netTaxableGallons)}</td>
        <td class="tax-amount ${taxClass}">${fmtCur(displayTaxDue)}</td>
        <td>
            <button class="delete-row" title="Delete row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
            </button>
        </td>
    `;
}

// ── Event binding ──────────────────────────────────────────────────────────

/**
 * Attach all event listeners to an existing <tr> element.
 * Reads rowId from rowEl.dataset.rowId.
 *
 * @param {HTMLTableRowElement} rowEl
 * @param {{
 *   onJurisdictionChange(rowId: number, value: string): void,
 *   onTotalMilesInput(rowId: number, value: number, syncTaxableMiles: (v: number) => void): void,
 *   onTaxableMilesInput(rowId: number, value: number): void,
 *   onTaxPaidGallonsInput(rowId: number, value: number): void,
 *   onDelete(rowId: number): void,
 *   onAddRow(rowId: number): void
 * }} handlers
 */
export function bindRowEvents(rowEl, handlers) {
    const rowId = parseInt(rowEl.dataset.rowId, 10);

    // ── Jurisdiction change ──────────────────────────────────────────────
    rowEl.querySelector('.jurisdiction-select').addEventListener('change', (e) => {
        const value = e.target.value;
        const cell  = e.target.closest('.ifta-cell');
        if (cell) {
            cell.querySelector('.ifta-cell-display').innerHTML =
                value || '<span class="cell-placeholder">Select...</span>';
            exitCellEdit(cell);
        }
        handlers.onJurisdictionChange(rowId, value);
    });

    // ── Total miles (optionally mirrors to taxable miles) ────────────────
    rowEl.querySelector('.total-miles').addEventListener('input', (e) => {
        let value = Math.round(parseFloat(e.target.value) || 0);
        if (value < 0) value = 0;
        e.target.value = value || '';

        // DOM closure — only updates the sibling input + display cell
        const syncTaxableMiles = (v) => {
            const taxableInput = rowEl.querySelector('.taxable-miles');
            if (taxableInput) taxableInput.value = v || '';
            const taxableCell = rowEl.querySelector('[data-field="taxableMiles"]');
            if (taxableCell) {
                const display = taxableCell.querySelector('.ifta-cell-display');
                if (display) display.innerHTML = v
                    ? v.toLocaleString()
                    : '<span class="cell-placeholder">0</span>';
            }
        };
        handlers.onTotalMilesInput(rowId, value, syncTaxableMiles);
    });

    // ── Taxable miles ────────────────────────────────────────────────────
    rowEl.querySelector('.taxable-miles').addEventListener('input', (e) => {
        let value = Math.round(parseFloat(e.target.value) || 0);
        if (value < 0) value = 0;
        e.target.value = value || '';
        handlers.onTaxableMilesInput(rowId, value);
    });

    // ── Tax paid gallons ─────────────────────────────────────────────────
    rowEl.querySelector('.tax-paid-gallons').addEventListener('input', (e) => {
        let value = Math.round(parseFloat(e.target.value) || 0);
        if (value < 0) value = 0;
        e.target.value = value || '';
        handlers.onTaxPaidGallonsInput(rowId, value);
    });

    // ── Numeric input keyboard / blur ────────────────────────────────────
    ['.total-miles', '.taxable-miles', '.tax-paid-gallons'].forEach(sel => {
        const input = rowEl.querySelector(sel);
        if (!input) return;

        input.addEventListener('keydown', (e) => {
            if (e.key === '.' || e.key === ',' || e.key === '-') e.preventDefault();
            if (e.key === 'Enter') {
                e.preventDefault();
                const cell = input.closest('.ifta-cell');
                if (cell) commitCellEdit(cell);
                handlers.onAddRow(rowId);
            }
            if (e.key === 'Escape') {
                const cell = input.closest('.ifta-cell');
                if (cell) exitCellEdit(cell);
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                const cell = input.closest('.ifta-cell');
                if (cell) commitCellEdit(cell);
                tabToNextCell(cell, e.shiftKey, handlers.onAddRow);
            }
        });

        input.addEventListener('blur', (e) => {
            let value = Math.round(parseFloat(e.target.value) || 0);
            if (value < 0) value = 0;
            e.target.value = value || '';
            const cell = input.closest('.ifta-cell');
            if (cell) commitCellEdit(cell);
        });
    });

    // ── Jurisdiction select keyboard ─────────────────────────────────────
    rowEl.querySelector('.jurisdiction-select').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handlers.onAddRow(rowId); }
        if (e.key === 'Escape') {
            const cell = e.target.closest('.ifta-cell');
            if (cell) exitCellEdit(cell);
        }
    });

    // ── Click-to-edit ────────────────────────────────────────────────────
    rowEl.querySelectorAll('.ifta-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            if (cell.classList.contains('editing')) return;
            if (e.target.closest('.ifta-cell-editor')) return;
            enterCellEdit(cell);
        });
    });

    // ── Delete ───────────────────────────────────────────────────────────
    rowEl.querySelector('.delete-row').addEventListener('click', () => handlers.onDelete(rowId));
}

// ── Cell editing ───────────────────────────────────────────────────────────

export function enterCellEdit(cell) {
    document.querySelectorAll('.ifta-cell.editing').forEach(c => {
        if (c !== cell) commitCellEdit(c);
    });
    cell.classList.add('editing');
    const editor = cell.querySelector('.ifta-cell-editor');
    if (editor) {
        editor.focus();
        if (editor.type === 'number' && editor.value) editor.select();
    }
}

/** Updates the display div from the editor value and removes the editing class. */
export function commitCellEdit(cell) {
    if (!cell.classList.contains('editing')) return;
    const field   = cell.dataset.field;
    const editor  = cell.querySelector('.ifta-cell-editor');
    const display = cell.querySelector('.ifta-cell-display');
    if (!editor || !display) return;

    if (field === 'jurisdiction') {
        display.innerHTML = editor.value || '<span class="cell-placeholder">Select...</span>';
    } else {
        const val = Math.round(parseFloat(editor.value) || 0);
        display.innerHTML = val ? val.toLocaleString() : '<span class="cell-placeholder">0</span>';
    }
    cell.classList.remove('editing');
}

export function exitCellEdit(cell) {
    cell.classList.remove('editing');
}

// ── Navigation ─────────────────────────────────────────────────────────────

/**
 * Move focus to the next/previous editable cell.
 * @param {HTMLElement} currentCell
 * @param {boolean} reverse - true for Shift+Tab
 * @param {(lastRowId: number) => void} onEndOfTable - called when Tab goes past the last cell
 */
export function tabToNextCell(currentCell, reverse, onEndOfTable) {
    const allCells = Array.from(document.querySelectorAll('#dataTable tbody .ifta-cell'));
    const idx = allCells.indexOf(currentCell);
    if (idx === -1) return;

    const nextIdx = reverse ? idx - 1 : idx + 1;
    if (nextIdx >= 0 && nextIdx < allCells.length) {
        enterCellEdit(allCells[nextIdx]);
    } else if (!reverse && onEndOfTable) {
        const lastRow = appState.rows[appState.rows.length - 1];
        if (lastRow) onEndOfTable(lastRow.id);
    }
}

// ── Jurisdiction options refresh ───────────────────────────────────────────

/**
 * Rebuild <option> lists in every row's jurisdiction <select>.
 * Both arguments are explicit — no getJurisdictionList() call inside.
 * @param {{ id: number, jurisdiction: string }[]} rows
 * @param {{ code: string, name: string, country: string }[]} jurisdictionList
 */
export function refreshJurisdictionOptions(rows, jurisdictionList) {
    const usedJurisdictions = rows.filter(r => r.jurisdiction).map(r => r.jurisdiction);

    rows.forEach(rowData => {
        const rowEl = document.getElementById(`row-${rowData.id}`);
        if (!rowEl) return;
        const select = rowEl.querySelector('.jurisdiction-select');
        if (!select) return;

        let opts = '<option value="">Select...</option><optgroup label="United States">';
        jurisdictionList.filter(j => j.country === 'US').forEach(j => {
            const selected = rowData.jurisdiction === j.code ? 'selected' : '';
            const isUsed   = usedJurisdictions.includes(j.code) && rowData.jurisdiction !== j.code;
            opts += `<option value="${j.code}" ${selected} ${isUsed ? 'disabled' : ''}>${j.name} (${j.code})${isUsed ? ' (already added)' : ''}</option>`;
        });
        opts += '</optgroup><optgroup label="Canada">';
        jurisdictionList.filter(j => j.country === 'CAN').forEach(j => {
            const selected = rowData.jurisdiction === j.code ? 'selected' : '';
            const isUsed   = usedJurisdictions.includes(j.code) && rowData.jurisdiction !== j.code;
            opts += `<option value="${j.code}" ${selected} ${isUsed ? 'disabled' : ''}>${j.name} (${j.code})${isUsed ? ' (already added)' : ''}</option>`;
        });
        opts += '</optgroup>';
        select.innerHTML = opts;
    });
}

// ── Row management ─────────────────────────────────────────────────────────

export function addNewRow(data = null) {
    const rowId = ++appState.rowIdCounter;

    const rowData = {
        id:                         rowId,
        jurisdiction:               data?.jurisdiction || '',
        totalMiles:                 data?.totalMiles || 0,
        taxableMiles:               data?.taxableMiles || 0,
        taxPaidGallons:             data?.taxPaidGallons || 0,
        taxRate:                    data?.taxRate || 0,
        taxableGallons:             data?.taxableGallons || 0,
        netTaxableGallons:          data?.netTaxableGallons || 0,
        taxDue:                     data?.taxDue || 0,
        taxableMilesManuallyEdited: data?.taxableMilesManuallyEdited || false
    };

    appState.rows.push(rowData);

    const tbody = document.getElementById('dataTableBody');
    const rowEl = document.createElement('tr');
    rowEl.id           = `row-${rowId}`;
    rowEl.dataset.rowId = rowId;

    const jurisdictionList  = getJurisdictionList();
    const usedJurisdictions = appState.rows
        .filter(r => r.id !== rowId && r.jurisdiction)
        .map(r => r.jurisdiction);

    rowEl.innerHTML = renderRow(rowData, {
        jurisdictionList,
        usedJurisdictions,
        displayTaxDue: getDisplayTaxDue(rowData.taxDue, rowData.jurisdiction),
        formatters: { formatRate, formatWholeGallons, formatCurrency }
    });
    tbody.appendChild(rowEl);

    bindRowEvents(rowEl, {
        onJurisdictionChange(id, value) {
            if (value) {
                const existing = appState.rows.find(r => r.id !== id && r.jurisdiction === value);
                if (existing) {
                    showToast(`${value} is already added in another row`, 'warning');
                    const el = document.getElementById(`row-${id}`);
                    if (el) el.querySelector('.jurisdiction-select').value = '';
                    return;
                }
            }
            updateRowField(id, 'jurisdiction', value);
            _forceUpdateRate(id);
            _calculateRow(id);
            refreshJurisdictionOptions(appState.rows, getJurisdictionList());
        },
        onTotalMilesInput(id, value, syncTaxableMiles) {
            updateRowField(id, 'totalMiles', value);
            const rd = appState.rows.find(r => r.id === id);
            if (!rd) return;
            if (!rd.taxableMilesManuallyEdited || rd.taxableMiles === rd.totalMiles || !rd.taxableMiles) {
                syncTaxableMiles(value);
                updateRowField(id, 'taxableMiles', value);
                rd.taxableMilesManuallyEdited = false;
            }
            _calculateRow(id);
        },
        onTaxableMilesInput(id, value) {
            const rd = appState.rows.find(r => r.id === id);
            if (rd) rd.taxableMilesManuallyEdited = true;
            updateRowField(id, 'taxableMiles', value);
            _calculateRow(id);
        },
        onTaxPaidGallonsInput(id, value) {
            updateRowField(id, 'taxPaidGallons', value);
            _calculateRow(id);
        },
        onDelete(id) { deleteRow(id); },
        onAddRow(id)  { handleEnterKeyAddRow(id); }
    });

    refreshJurisdictionOptions(appState.rows, jurisdictionList);

    if (!data || !data.jurisdiction) {
        const cell = rowEl.querySelector('.ifta-cell-jurisdiction');
        if (cell) setTimeout(() => enterCellEdit(cell), 50);
    }

    return rowData;
}

// ── Row validation / Enter key ─────────────────────────────────────────────

function handleEnterKeyAddRow(currentRowId) {
    const rowData = appState.rows.find(r => r.id === currentRowId);
    if (!rowData) return;

    const errors = [];
    if (!rowData.jurisdiction) errors.push('Jurisdiction is required');
    if (!rowData.totalMiles || rowData.totalMiles <= 0) errors.push('Total Miles must be greater than 0');

    if (errors.length > 0) {
        showToast(errors.join('. '), 'error');
        const rowEl = document.getElementById(`row-${currentRowId}`);
        if (rowEl) {
            if (!rowData.jurisdiction) rowEl.querySelector('.jurisdiction-select').focus();
            else rowEl.querySelector('.total-miles').focus();
        }
        return;
    }

    const newRowData = addNewRow();
    setTimeout(() => {
        const newRow = document.getElementById(`row-${newRowData.id}`);
        if (newRow) newRow.querySelector('.jurisdiction-select').focus();
    }, 50);
    showToast('New row added', 'success');
}

// ── UI updates ─────────────────────────────────────────────────────────────

export function updateRowUI(rowId, rowData) {
    const rowEl = document.getElementById(`row-${rowId}`);
    if (!rowEl) return;

    rowEl.querySelector('.rate-display').textContent    = formatRate(rowData.taxRate);
    rowEl.querySelector('.taxable-gallons').textContent = formatWholeGallons(rowData.taxableGallons);

    const netGallonsCell = rowEl.querySelector('.net-taxable-gallons');
    netGallonsCell.textContent = formatWholeGallons(rowData.netTaxableGallons);
    netGallonsCell.className   = `net-taxable-gallons ${rowData.netTaxableGallons >= 0 ? '' : 'negative'}`;

    const displayTaxDue = getDisplayTaxDue(rowData.taxDue, rowData.jurisdiction);
    const taxCell = rowEl.querySelector('.tax-amount');
    taxCell.textContent = formatCurrency(displayTaxDue);
    taxCell.className   = `tax-amount ${displayTaxDue >= 0 ? 'positive' : 'negative'}`;

    const updateCellDisplay = (field, value, formatter) => {
        const cell = rowEl.querySelector(`.ifta-cell[data-field="${field}"]`);
        if (cell && !cell.classList.contains('editing')) {
            const display = cell.querySelector('.ifta-cell-display');
            if (display) display.innerHTML = value
                ? formatter(value)
                : '<span class="cell-placeholder">0</span>';
        }
    };
    updateCellDisplay('totalMiles',     rowData.totalMiles,     v => Math.round(v).toLocaleString());
    updateCellDisplay('taxableMiles',   rowData.taxableMiles,   v => Math.round(v).toLocaleString());
    updateCellDisplay('taxPaidGallons', rowData.taxPaidGallons, v => Math.round(v).toLocaleString());
}

export function deleteRow(rowId) {
    const index = appState.rows.findIndex(r => r.id === rowId);
    if (index > -1) appState.rows.splice(index, 1);

    const rowEl = document.getElementById(`row-${rowId}`);
    if (rowEl) rowEl.remove();

    updateTotals();
    refreshJurisdictionOptions(appState.rows, getJurisdictionList());

    if (appState.rows.length === 0) addNewRow();
}

export function updateTotals() {
    let totalMiles = 0, totalTaxableMiles = 0, totalGallons = 0;
    let totalTaxableGallons = 0, totalNetGallons = 0, totalTax = 0;

    appState.rows.forEach(row => {
        totalMiles          += row.totalMiles         || 0;
        totalTaxableMiles   += row.taxableMiles        || 0;
        totalGallons        += row.taxPaidGallons      || 0;
        totalTaxableGallons += row.taxableGallons      || 0;
        totalNetGallons     += row.netTaxableGallons   || 0;
        totalTax            += getDisplayTaxDue(row.taxDue || 0, row.jurisdiction);
    });

    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    set('totalMiles',          formatNumber(Math.round(totalMiles)));
    set('totalTaxableMiles',   formatNumber(Math.round(totalTaxableMiles)));
    set('totalGallons',        formatNumber(Math.round(totalGallons)));
    set('totalTaxableGallons', formatNumber(Math.round(totalTaxableGallons)));
    set('totalNetGallons',     formatNumber(Math.round(totalNetGallons)));

    const totalTaxCell = document.getElementById('totalTax');
    if (totalTaxCell) {
        totalTaxCell.textContent = formatCurrency(roundTo(totalTax, 2));
        totalTaxCell.className   = `tax-amount ${totalTax >= 0 ? 'positive' : 'negative'}`;
    }

    set('summaryMiles',   formatNumber(Math.round(totalMiles)));
    set('summaryGallons', formatNumber(Math.round(totalGallons)));

    const currentMpg = totalGallons > 0 ? totalMiles / totalGallons : 0;
    appState.currentMpg = currentMpg;

    const currentMpgInput = document.getElementById('currentMpg');
    if (currentMpgInput) currentMpgInput.value = totalGallons > 0 ? currentMpg.toFixed(2) : '—';

    const summaryMpgEl = document.getElementById('summaryMpg');
    if (summaryMpgEl) summaryMpgEl.textContent = currentMpg > 0 ? currentMpg.toFixed(2) : '—';

    const summaryTax = document.getElementById('summaryTax');
    if (summaryTax) summaryTax.textContent = formatCurrency(roundTo(totalTax, 2));
}

// ── Paste from Excel ───────────────────────────────────────────────────────

export function handleExcelPaste(e) {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text || !text.includes('\t')) return;
    e.preventDefault();
    parseAndInsertPastedData(text);
}

export function parseAndInsertPastedData(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return;

    const firstCols = lines[0].split('\t').map(c => c.trim().toLowerCase());
    const headerKws = ['jurisdiction', 'state', 'province', 'miles', 'gallons', 'gal', 'fuel'];
    const isHeader  = headerKws.some(kw => firstCols.some(c => c.includes(kw)));
    const dataLines = isHeader ? lines.slice(1) : lines;

    if (!dataLines.length) {
        showToast('No data rows found in pasted content', 'warning');
        return;
    }

    const jurisdictionList = getJurisdictionList();
    const jurisMap = {};
    jurisdictionList.forEach(j => {
        jurisMap[j.name.toUpperCase()] = j.code;
        jurisMap[j.code.toUpperCase()] = j.code;
    });

    let addedCount   = 0;
    let skippedCount = 0;

    dataLines.forEach(line => {
        const cols = line.split('\t').map(c => c.trim());
        if (cols.length < 2) return;

        let jurisdiction = '';
        const rawJuris = cols[0].toUpperCase().replace(/[^A-Z\s]/g, '').trim();
        if (jurisMap[rawJuris]) {
            jurisdiction = jurisMap[rawJuris];
        } else {
            const match = Object.keys(jurisMap).find(k => k.startsWith(rawJuris) || rawJuris.startsWith(k));
            if (match) jurisdiction = jurisMap[match];
        }

        if (jurisdiction && appState.rows.some(r => r.jurisdiction === jurisdiction)) {
            skippedCount++;
            return;
        }

        const totalMiles     = Math.round(parseFloat(cols[1]?.replace(/[^0-9.]/g, '')) || 0);
        const taxableMiles   = cols.length > 2 ? Math.round(parseFloat(cols[2]?.replace(/[^0-9.]/g, '')) || 0) : totalMiles;
        const taxPaidGallons = cols.length > 3 ? Math.round(parseFloat(cols[3]?.replace(/[^0-9.]/g, '')) || 0) : 0;

        const rowData = addNewRow({
            jurisdiction,
            totalMiles,
            taxableMiles: taxableMiles || totalMiles,
            taxPaidGallons
        });
        if (rowData) {
            if (jurisdiction) _forceUpdateRate(rowData.id);
            _calculateRow(rowData.id);
            addedCount++;
        }
    });

    if (addedCount > 0) {
        showToast(
            `Pasted ${addedCount} row${addedCount > 1 ? 's' : ''}` +
            `${skippedCount ? ` (${skippedCount} skipped - duplicate jurisdiction)` : ''}`,
            'success'
        );
    } else {
        showToast('No valid data found in clipboard. Expected: Jurisdiction, Total Miles, Taxable Miles, Tax Paid Gallons', 'warning');
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function getDisplayTaxDue(taxDue, jurisdiction) {
    if (taxDue >= 0) return taxDue;
    const IFTA_TAX_RATES = getIftaTaxRates();
    const jData = IFTA_TAX_RATES?.jurisdictions?.[jurisdiction];
    if (jData?.refundPolicy === 'credit') return 0;
    return taxDue;
}

