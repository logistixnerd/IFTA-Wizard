// src/main.js — Application bootstrap.
//
// THE ONLY file loaded as type="module".
// Rules:
//   • Orchestrate modules; own no business logic.
//   • Stateful wrappers (forceUpdateTaxRate, calculateRow) live here to keep
//     calculator.js pure and break circular deps.
//   • Expose the minimal window globals that legacy non-module scripts need.
//
// Load order (from index.html):
//   Firebase compat → tax-rates.js → auth-firebase.js → reports.js → [this]

'use strict';

import { appState, elements } from './core/state.js';
import { CONSTANTS }          from './core/constants.js';

import { calculateRowValues } from './core/calculator.js';
import { setActiveQuarter, getValidatedTaxRate, getIftaTaxRates } from './core/tax-utils.js';

import { showToast }          from './ui/toast.js';
import { updateRatesTable, filterRatesTable, updateRateStatus } from './ui/rates-table.js';
import { populateQuarterDropdown, populateJurisdictionDropdowns } from './ui/header.js';
import { initTable, addNewRow, updateRowUI, updateTotals, handleExcelPaste, parseAndInsertPastedData } from './ui/table.js';

import { initExports, handleCsvImport, exportToCsv, exportToExcel, exportToPdf, printReport } from './features/exports.js';
import { initLocalStorage, saveToLocalStorage, loadFromLocalStorage } from './features/local-storage.js';
import { listenForTrucks }    from './features/fleet.js';
import { setupOfflineDetection } from './features/offline.js';

// ── Stateful wrappers ──────────────────────────────────────────────────────
// These own state mutations + DOM side-effects so calculator.js stays pure.

// Look up the validated tax rate for a row and write it back to appState.
// Called whenever jurisdiction or fuel-type changes.
function forceUpdateTaxRate(rowId) {
    const rowData = appState.rows.find(r => r.id === rowId);
    if (!rowData) return;
    if (!rowData.jurisdiction) { rowData.taxRate = 0; return; }

    const rate = getValidatedTaxRate(rowData.jurisdiction, appState.selectedFuelType);
    rowData.taxRate = (
        typeof rate === 'number' && isFinite(rate) && rate >= 0 && rate <= 2
    ) ? rate : 0;
}

// Run pure IFTA math for one row, write results to appState, push to DOM.
function calculateRow(rowId) {
    const rowData = appState.rows.find(r => r.id === rowId);
    if (!rowData) return;

    try {
        const taxRate = getValidatedTaxRate(rowData.jurisdiction, appState.selectedFuelType);

        const computed = calculateRowValues({
            totalMiles:     rowData.totalMiles,
            taxableMiles:   rowData.taxableMiles,
            taxPaidGallons: rowData.taxPaidGallons,
            taxRate,
            fleetMpg:       appState.fleetMpg,
            jurisdiction:   rowData.jurisdiction,
            taxRates:       getIftaTaxRates()
        });

        Object.assign(rowData, computed);
        updateRowUI(rowId, rowData);
        updateTotals();
    } catch (err) {
        console.error(`calculateRow(${rowId}):`, err);
    }
}

// Recalculate every row (e.g. after fuel-type / MPG / quarter change).
function recalculateAll() {
    appState.rows.forEach(row => calculateRow(row.id));
}

// Confirm then wipe all rows and reset to one blank row.
function clearAllRows() {
    if (!confirm('Are you sure you want to clear all data?')) return;
    appState.rows = [];
    appState.rowIdCounter = 0;
    const tbody = document.getElementById('dataTableBody');
    if (tbody) tbody.innerHTML = '';
    addNewRow();
    updateTotals();
    showToast('All data cleared', 'info');
}

// ── Dependency injection ───────────────────────────────────────────────────
// Pass stateful wrappers as callbacks so modules don't import from main.js.

initTable({ calculateRow, forceUpdateTaxRate });
initExports({ calculateRow });
initLocalStorage({ forceUpdateTaxRate, calculateRow });

// ── Window globals for non-module scripts ─────────────────────────────────
// reports.js and auth-firebase.js are loaded as plain <script> tags and
// access these as globals.  Keep this list minimal.

window.appState      = appState;        // reports.js reads rows/quarter/fuelType
window.recalculateAll = recalculateAll; // auth-firebase.js calls after quarter change

// ── DOM init ───────────────────────────────────────────────────────────────

function initializeElements() {
    elements.dataTableBody          = document.getElementById('dataTableBody');
    elements.quarterSelect          = document.getElementById('quarterSelect');  // hidden compat select
    elements.unitNumberInput        = document.getElementById('unitNumber');
    elements.fuelTypeSelect         = document.getElementById('fuelType');
    elements.baseJurisdictionSelect = document.getElementById('baseJurisdiction');
    elements.fleetMpgInput          = document.getElementById('fleetMpg');
    elements.currentMpgInput        = document.getElementById('currentMpg');
    elements.loadingOverlay         = document.getElementById('loadingOverlay');
    elements.toastContainer         = document.getElementById('toastContainer');

    populateQuarterDropdown();
}

function validateRequiredElements() {
    const requiredIds = ['dataTableBody','quarterSelect','fuelType','baseJurisdiction',
        'fleetMpg','loadingOverlay','toastContainer','addRow','clearAll'];
    for (const id of requiredIds) {
        if (!document.getElementById(id)) {
            console.error(`Required element not found: ${id}`);
            return false;
        }
    }
    return true;
}

// ── Event listeners ────────────────────────────────────────────────────────

function attachEventListeners() {
    document.getElementById('addRow').addEventListener('click', addNewRow);
    document.getElementById('clearAll').addEventListener('click', clearAllRows);

    document.getElementById('importData').addEventListener('click', () => {
        document.getElementById('csvFileInput').click();
    });
    document.getElementById('csvFileInput').addEventListener('change', handleCsvImport);

    // Unit number
    elements.unitNumberInput.addEventListener('change', (e) => {
        const val = e.target.value;
        appState.unitNumber = val;
        if (val && e.target.selectedOptions?.[0]) {
            const fuel = e.target.selectedOptions[0].dataset.fuel;
            if (fuel && elements.fuelTypeSelect) {
                elements.fuelTypeSelect.value = fuel;
                appState.selectedFuelType = fuel;
                recalculateAll();
            }
        }
    });

    // Quarter select
    elements.quarterSelect.addEventListener('change', (e) => {
        appState.selectedQuarter = e.target.value;
        setActiveQuarter(e.target.value);
        const headerSelect = document.getElementById('headerQuarterSelect');
        if (headerSelect) headerSelect.value = e.target.value;
        recalculateAll();
    });

    // Fuel type
    elements.fuelTypeSelect.addEventListener('change', (e) => {
        appState.selectedFuelType = e.target.value;
        recalculateAll();
    });

    // Base jurisdiction
    elements.baseJurisdictionSelect.addEventListener('change', (e) => {
        appState.baseJurisdiction = e.target.value;
    });

    // Fleet MPG
    elements.fleetMpgInput.addEventListener('change', (e) => {
        let mpg = parseFloat(e.target.value);
        if (isNaN(mpg) || mpg < CONSTANTS.MIN_MPG) {
            mpg = CONSTANTS.DEFAULT_MPG;
            showToast(`MPG must be at least ${CONSTANTS.MIN_MPG}. Reset to default.`, 'warning');
        } else if (mpg > CONSTANTS.MAX_MPG) {
            mpg = CONSTANTS.MAX_MPG;
            showToast(`MPG capped at maximum ${CONSTANTS.MAX_MPG}.`, 'warning');
        }
        e.target.value = mpg;
        appState.fleetMpg = mpg;
        recalculateAll();
    });
    elements.fleetMpgInput.addEventListener('blur', (e) => {
        if (!e.target.value || parseFloat(e.target.value) <= 0) e.target.value = appState.fleetMpg;
    });

    // Rates search / filter
    document.getElementById('ratesSearch')?.addEventListener('input', filterRatesTable);
    document.getElementById('countryFilter')?.addEventListener('change', filterRatesTable);

    // Export / print
    document.getElementById('exportPdf')?.addEventListener('click', exportToPdf);
    document.getElementById('exportCsv')?.addEventListener('click', exportToCsv);
    document.getElementById('exportExcel')?.addEventListener('click', exportToExcel);
    document.getElementById('printReport')?.addEventListener('click', printReport);

    // Save / load localStorage (optional buttons in HTML)
    document.getElementById('saveData')?.addEventListener('click', saveToLocalStorage);
    document.getElementById('loadData')?.addEventListener('click', () => loadFromLocalStorage(false));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const isInput = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    if (typeof window.IFTAReports !== 'undefined') window.IFTAReports.openSaveReportModal();
                    break;
                case 'e':
                    e.preventDefault();
                    exportToPdf();
                    break;
                case 'n':
                    if (!isInput) { e.preventDefault(); addNewRow(); }
                    break;
                case 'p':
                    e.preventDefault();
                    printReport();
                    break;
            }
        }
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
            document.getElementById('profileDropdown')?.classList.remove('open');
        }
    });

    // Excel paste on data table
    const tableBody = document.getElementById('dataTableBody');
    if (tableBody) tableBody.addEventListener('paste', handleExcelPaste);

    // Global paste fallback (when not focused inside an input)
    document.addEventListener('paste', (e) => {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text && text.includes('\t')) {
            e.preventDefault();
            parseAndInsertPastedData(text);
        }
    });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        initializeElements();

        if (!validateRequiredElements()) throw new Error('Required DOM elements not found');

        populateJurisdictionDropdowns();
        attachEventListeners();

        setActiveQuarter(appState.selectedQuarter);

        addNewRow();
        updateRatesTable();

        listenForTrucks();

        // Load saved data silently on init
        loadFromLocalStorage(true);

        // Start integrity monitoring if available
        if (typeof window.IntegrityMonitor !== 'undefined') {
            window.IntegrityMonitor.init();
        } else {
            updateRateStatus('verified', 'Current');
        }

        appState.isInitialized = true;

        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.remove('active');

        setupOfflineDetection();
        showToast('IFTA Wizard loaded successfully!', 'success');

    } catch (error) {
        console.error('Initialization error:', error);
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.remove('active');
        showToast('Error loading application. Please refresh the page.', 'error');
    }
});
