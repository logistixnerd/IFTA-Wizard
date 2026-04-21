// src/features/local-storage.js
// Persist / restore IFTA report data in browser localStorage.

import { appState } from '../core/state.js';
import { CONSTANTS } from '../core/constants.js';
import { sanitizeNumber, isLocalStorageAvailable } from '../core/validators.js';
import { getIftaTaxRates, setActiveQuarter } from '../core/tax-utils.js';
import { showToast } from '../ui/toast.js';
import { addNewRow, updateTotals } from '../ui/table.js';

// Injected from main.js
let _forceUpdateRate = () => {};
let _calculateRow    = () => {};
export function initLocalStorage({ forceUpdateTaxRate, calculateRow }) {
    _forceUpdateRate = forceUpdateTaxRate;
    _calculateRow    = calculateRow;
}

// ── Save ───────────────────────────────────────────────────────────────────

export function saveToLocalStorage() {
    if (!isLocalStorageAvailable()) {
        showToast('Browser storage not available. Try enabling cookies.', 'error');
        return;
    }

    try {
        const data = {
            version: '1.1.0',
            rows: appState.rows,
            selectedFuelType: appState.selectedFuelType,
            selectedQuarter:  appState.selectedQuarter,
            baseJurisdiction: appState.baseJurisdiction,
            fleetMpg:         appState.fleetMpg,
            savedAt:          new Date().toISOString()
        };

        const jsonData = JSON.stringify(data);
        if (jsonData.length > 5_000_000) {
            showToast('Data too large to save. Consider exporting to CSV instead.', 'error');
            return;
        }

        localStorage.setItem('iftaWizardData', jsonData);
        const rowCount = appState.rows.filter(r => r.jurisdiction).length;
        showToast(`Saved ${rowCount} trip${rowCount !== 1 ? 's' : ''} to browser storage`, 'success');
    } catch (error) {
        console.error('Save error:', error);
        if (error.name === 'QuotaExceededError') {
            showToast('Browser storage full. Please clear some data.', 'error');
        } else {
            showToast('Error saving data: ' + error.message, 'error');
        }
    }
}

// ── Load ───────────────────────────────────────────────────────────────────

export function loadFromLocalStorage(silent = false) {
    if (!isLocalStorageAvailable()) {
        if (!silent) showToast('Browser storage not available', 'error');
        return;
    }

    const savedData = localStorage.getItem('iftaWizardData');
    if (!savedData) {
        if (!silent) showToast('No saved data found', 'info');
        return;
    }

    try {
        const IFTA_TAX_RATES = getIftaTaxRates();
        const data = JSON.parse(savedData);
        if (!data || typeof data !== 'object') throw new Error('Invalid data format');

        appState.selectedFuelType = ['diesel','gasoline','gasohol','propane','lng','cng'].includes(data.selectedFuelType)
            ? data.selectedFuelType : 'diesel';
        appState.selectedQuarter = /^Q[1-4] \d{4}$/.test(data.selectedQuarter)
            ? data.selectedQuarter : 'Q4 2025';
        appState.baseJurisdiction = IFTA_TAX_RATES.jurisdictions[data.baseJurisdiction]
            ? data.baseJurisdiction : 'TX';
        appState.fleetMpg = sanitizeNumber(data.fleetMpg, CONSTANTS.MIN_MPG, CONSTANTS.MAX_MPG) || CONSTANTS.DEFAULT_MPG;

        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setEl('fuelType',        appState.selectedFuelType);
        setEl('quarterSelect',   appState.selectedQuarter);
        setEl('baseJurisdiction',appState.baseJurisdiction);
        setEl('fleetMpg',        appState.fleetMpg);

        if (data.rows && data.rows.length > 0) {
            appState.rows = [];
            appState.rowIdCounter = 0;
            const tbody = document.getElementById('dataTableBody');
            if (tbody) tbody.innerHTML = '';

            data.rows.forEach(savedRow => {
                const newRow = addNewRow(savedRow);
                const rowEl  = document.getElementById(`row-${newRow.id}`);
                if (rowEl) {
                    rowEl.querySelector('.jurisdiction-select').value = newRow.jurisdiction || '';
                    rowEl.querySelector('.total-miles').value          = newRow.totalMiles  || '';
                    rowEl.querySelector('.taxable-miles').value        = newRow.taxableMiles || '';
                    rowEl.querySelector('.tax-paid-gallons').value     = newRow.taxPaidGallons || '';
                }
                _forceUpdateRate(newRow.id);
                _calculateRow(newRow.id);
            });

            if (!silent) {
                const savedAt = new Date(data.savedAt).toLocaleString();
                showToast(`Loaded ${data.rows.length} trip${data.rows.length !== 1 ? 's' : ''} from ${savedAt}`, 'success');
            }
        }
    } catch (error) {
        console.error('Error loading saved data:', error);
        if (!silent) showToast('Error loading saved data. Data may be corrupted.', 'error');
        try { localStorage.removeItem('iftaWizardData'); } catch (_) { /* ignore */ }
    }
}

// ── Load from saved report (called by reports.js) ──────────────────────────

export function loadReportData(reportData) {
    if (!reportData) return false;

    try {
        if (reportData.fuelType) {
            appState.selectedFuelType = reportData.fuelType;
            const el = document.getElementById('fuelType');
            if (el) el.value = reportData.fuelType;
        }
        if (reportData.quarter) {
            appState.selectedQuarter = reportData.quarter;
            const el = document.getElementById('quarterSelect');
            if (el) el.value = reportData.quarter;
            const header = document.getElementById('headerQuarterSelect');
            if (header) header.value = reportData.quarter;
            setActiveQuarter(reportData.quarter);
        }
        if (reportData.baseJurisdiction) {
            appState.baseJurisdiction = reportData.baseJurisdiction;
            const el = document.getElementById('baseJurisdiction');
            if (el) el.value = reportData.baseJurisdiction;
        }
        if (reportData.mpg) {
            appState.fleetMpg = reportData.mpg;
            const el = document.getElementById('fleetMpg');
            if (el) el.value = reportData.mpg;
        }

        appState.rows = [];
        appState.rowIdCounter = 0;
        const tbody = document.getElementById('dataTableBody');
        if (tbody) tbody.innerHTML = '';

        if (reportData.rows && reportData.rows.length > 0) {
            reportData.rows.forEach(rowData => {
                const newRow = addNewRow();
                newRow.jurisdiction    = rowData.jurisdiction    || '';
                newRow.totalMiles      = rowData.totalMiles      || 0;
                newRow.taxableMiles    = rowData.taxableMiles    || 0;
                newRow.taxPaidGallons  = rowData.taxPaidGallons  || 0;

                const row = document.getElementById(`row-${newRow.id}`);
                if (row) {
                    row.querySelector('.jurisdiction-select').value = newRow.jurisdiction;
                    row.querySelector('.total-miles').value          = newRow.totalMiles  || '';
                    row.querySelector('.taxable-miles').value        = newRow.taxableMiles || '';
                    row.querySelector('.tax-paid-gallons').value     = newRow.taxPaidGallons || '';
                }
                _calculateRow(newRow.id);
            });
        } else {
            addNewRow();
        }

        updateTotals();
        return true;
    } catch (error) {
        console.error('Error loading report data:', error);
        showToast('Error loading report', 'error');
        return false;
    }
}

// Expose for reports.js which calls window.loadReportData(...)
window.loadReportData = loadReportData;
