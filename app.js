/**
 * IFTA Wizard - Main Application
 * Fuel Tax Calculator for Interstate Motor Carriers
 * Version: 1.1.0
 */

'use strict';

// Application State
const appState = {
    rows: [],
    selectedFuelType: 'diesel',
    selectedQuarter: 'Q4 2025',
    baseJurisdiction: 'TX',
    fleetMpg: 6.5,
    rowIdCounter: 0,
    isInitialized: false
};

// Constants
const CONSTANTS = {
    MIN_MPG: 1,
    MAX_MPG: 20,
    DEFAULT_MPG: 6.5,
    MAX_MILES: 1000000,
    MAX_GALLONS: 100000,
    DECIMAL_PLACES: {
        gallons: 3,
        currency: 2,
        rate: 4
    }
};

// DOM Elements
const elements = {
    dataTableBody: null,
    quarterSelect: null,
    fuelTypeSelect: null,
    baseJurisdictionSelect: null,
    fleetMpgInput: null,
    loadingOverlay: null,
    toastContainer: null
};

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        initializeElements();
        
        // Validate required elements exist
        if (!validateRequiredElements()) {
            throw new Error('Required DOM elements not found');
        }
        
        populateJurisdictionDropdowns();
        attachEventListeners();
        
        // Set active quarter in tax-rates.js for initial rate lookup
        if (typeof setActiveQuarter === 'function') {
            setActiveQuarter(appState.selectedQuarter);
        }
        
        addNewRow(); // Start with one row
        updateRatesTable();
        
        // Load saved data if exists (silently on init)
        loadFromLocalStorage(true);
        
        // Start background integrity monitoring (handles rate updates automatically)
        if (typeof IntegrityMonitor !== 'undefined') {
            IntegrityMonitor.init();
        } else {
            // Fallback to simple rate check if monitor not loaded
            await checkForRateUpdates();
        }
        
        appState.isInitialized = true;
        hideLoading();
        showToast('IFTA Wizard loaded successfully!', 'success');
    } catch (error) {
        console.error('Initialization error:', error);
        hideLoading();
        showToast('Error loading application. Please refresh the page.', 'error');
    }
});

// Validate required DOM elements exist
function validateRequiredElements() {
    const requiredIds = [
        'dataTableBody', 'quarterSelect', 'fuelType', 'baseJurisdiction',
        'fleetMpg', 'loadingOverlay', 'toastContainer', 'addRow', 'clearAll'
    ];
    
    for (const id of requiredIds) {
        if (!document.getElementById(id)) {
            console.error(`Required element not found: ${id}`);
            return false;
        }
    }
    return true;
}

// Check for rate updates on load
async function checkForRateUpdates() {
    try {
        updateRateStatus('fetching', 'Checking...');
        const result = await IFTARateFetcher.autoUpdate();
        
        if (result.updated) {
            showToast(`Rates updated`, 'success');
            updateRatesTable();
            recalculateAll();
            updateRateStatus('live', 'Updated');
        } else {
            updateRateStatus('verified', 'Current');
        }
    } catch (error) {
        console.log('Auto-update check completed');
        updateRateStatus('verified', 'Cached');
    }
}

// Initialize DOM element references
function initializeElements() {
    elements.dataTableBody = document.getElementById('dataTableBody');
    elements.quarterSelect = document.getElementById('quarterSelect');
    elements.fuelTypeSelect = document.getElementById('fuelType');
    elements.baseJurisdictionSelect = document.getElementById('baseJurisdiction');
    elements.fleetMpgInput = document.getElementById('fleetMpg');
    elements.loadingOverlay = document.getElementById('loadingOverlay');
    elements.toastContainer = document.getElementById('toastContainer');
    
    // Populate quarter dropdown dynamically
    populateQuarterDropdown();
}

// Populate quarter dropdown with current and past quarters
function populateQuarterDropdown() {
    const select = elements.quarterSelect;
    if (!select) return;
    
    // The header quarter dropdown is now populated by auth.js
    // This function syncs the hidden quarterSelect with header dropdown
    const headerSelect = document.getElementById('headerQuarterSelect');
    if (headerSelect && headerSelect.options.length > 0) {
        // Sync from header dropdown
        select.innerHTML = headerSelect.innerHTML;
        select.value = headerSelect.value;
        appState.selectedQuarter = headerSelect.value;
    } else {
        // Fallback: populate directly
        select.innerHTML = '';
        
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentQuarter = Math.ceil(currentMonth / 3);
        
        // Generate quarters (current + 2 years back)
        for (let i = 0; i < 9; i++) {
            let q = currentQuarter - (i % 4);
            let y = currentYear - Math.floor(i / 4);
            
            if (q <= 0) {
                q += 4;
                y -= 1;
            }
            
            if (y < currentYear - 2) break;
            
            const option = document.createElement('option');
            option.value = `Q${q} ${y}`;
            option.textContent = `Q${q} ${y}`;
            if (i === 0) {
                option.selected = true;
                appState.selectedQuarter = option.value;
            }
            select.appendChild(option);
        }
    }
}

// Populate jurisdiction dropdowns
function populateJurisdictionDropdowns() {
    const jurisdictions = getJurisdictionList();
    
    // Populate base jurisdiction dropdown
    const baseSelect = elements.baseJurisdictionSelect;
    baseSelect.innerHTML = '';
    
    // Add US jurisdictions group
    const usGroup = document.createElement('optgroup');
    usGroup.label = 'United States';
    jurisdictions.filter(j => j.country === 'US').forEach(j => {
        const option = document.createElement('option');
        option.value = j.code;
        option.textContent = `${j.name} (${j.code})`;
        usGroup.appendChild(option);
    });
    baseSelect.appendChild(usGroup);
    
    // Add Canadian jurisdictions group
    const canGroup = document.createElement('optgroup');
    canGroup.label = 'Canada';
    jurisdictions.filter(j => j.country === 'CAN').forEach(j => {
        const option = document.createElement('option');
        option.value = j.code;
        option.textContent = `${j.name} (${j.code})`;
        canGroup.appendChild(option);
    });
    baseSelect.appendChild(canGroup);
    
    // Set default
    baseSelect.value = appState.baseJurisdiction;
}

// Attach event listeners
function attachEventListeners() {
    // Add row button
    document.getElementById('addRow').addEventListener('click', addNewRow);
    
    // Clear all button
    document.getElementById('clearAll').addEventListener('click', clearAllRows);
    
    // Import CSV button
    document.getElementById('importData').addEventListener('click', () => {
        document.getElementById('csvFileInput').click();
    });
    
    document.getElementById('csvFileInput').addEventListener('change', handleCsvImport);
    
    // Configuration changes
    elements.quarterSelect.addEventListener('change', (e) => {
        appState.selectedQuarter = e.target.value;
        
        // Set active quarter in tax-rates.js for rate lookup
        if (typeof setActiveQuarter === 'function') {
            setActiveQuarter(e.target.value);
        }
        
        // Sync with header dropdown
        const headerSelect = document.getElementById('headerQuarterSelect');
        if (headerSelect) {
            headerSelect.value = e.target.value;
        }
        recalculateAll();
    });
    
    elements.fuelTypeSelect.addEventListener('change', (e) => {
        appState.selectedFuelType = e.target.value;
        recalculateAll();
    });
    
    elements.baseJurisdictionSelect.addEventListener('change', (e) => {
        appState.baseJurisdiction = e.target.value;
    });
    
    elements.fleetMpgInput.addEventListener('change', (e) => {
        let mpg = parseFloat(e.target.value);
        
        // Validate MPG range
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
    
    // Also validate on blur
    elements.fleetMpgInput.addEventListener('blur', (e) => {
        if (!e.target.value || parseFloat(e.target.value) <= 0) {
            e.target.value = appState.fleetMpg;
        }
    });
    
    // Rates search/filter
    document.getElementById('ratesSearch').addEventListener('input', filterRatesTable);
    document.getElementById('countryFilter').addEventListener('change', filterRatesTable);
    
    // Export buttons
    document.getElementById('exportPdf').addEventListener('click', exportToPdf);
    document.getElementById('exportCsv').addEventListener('click', exportToCsv);
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
    document.getElementById('printReport').addEventListener('click', printReport);
    
    // Note: saveReport, sendEmail, saveToDrive are handled by reports.js
}

// Add a new data row
function addNewRow(data = null) {
    const rowId = ++appState.rowIdCounter;
    const rowData = data || {
        id: rowId,
        jurisdiction: '',
        totalMiles: 0,
        taxableMiles: 0,
        taxPaidGallons: 0,
        taxRate: 0,
        taxableGallons: 0,
        netTaxableGallons: 0,
        taxDue: 0
    };
    
    if (!data) {
        rowData.id = rowId;
        appState.rows.push(rowData);
    }
    
    const row = document.createElement('tr');
    row.id = `row-${rowData.id}`;
    row.innerHTML = createRowHtml(rowData);
    elements.dataTableBody.appendChild(row);
    
    attachRowEventListeners(row, rowData.id);
    
    return rowData;
}

// Create HTML for a table row
function createRowHtml(rowData) {
    const jurisdictions = getJurisdictionList();
    
    let jurisdictionOptions = '<option value="">Select...</option>';
    
    // US jurisdictions
    jurisdictionOptions += '<optgroup label="United States">';
    jurisdictions.filter(j => j.country === 'US').forEach(j => {
        const selected = rowData.jurisdiction === j.code ? 'selected' : '';
        jurisdictionOptions += `<option value="${j.code}" ${selected}>${j.name} (${j.code})</option>`;
    });
    jurisdictionOptions += '</optgroup>';
    
    // Canadian jurisdictions
    jurisdictionOptions += '<optgroup label="Canada">';
    jurisdictions.filter(j => j.country === 'CAN').forEach(j => {
        const selected = rowData.jurisdiction === j.code ? 'selected' : '';
        jurisdictionOptions += `<option value="${j.code}" ${selected}>${j.name} (${j.code})</option>`;
    });
    jurisdictionOptions += '</optgroup>';
    
    const taxClass = rowData.taxDue >= 0 ? 'positive' : 'negative';
    
    return `
        <td>
            <select class="jurisdiction-select" data-field="jurisdiction">
                ${jurisdictionOptions}
            </select>
        </td>
        <td>
            <input type="number" class="total-miles" data-field="totalMiles" 
                   value="${rowData.totalMiles || ''}" min="0" step="1" placeholder="0">
        </td>
        <td>
            <input type="number" class="taxable-miles" data-field="taxableMiles" 
                   value="${rowData.taxableMiles || ''}" min="0" step="1" placeholder="0">
        </td>
        <td>
            <input type="number" class="tax-paid-gallons" data-field="taxPaidGallons" 
                   value="${rowData.taxPaidGallons || ''}" min="0" step="0.001" placeholder="0.000">
        </td>
        <td class="rate-display">${formatRate(rowData.taxRate)}</td>
        <td class="taxable-gallons">${formatGallons(rowData.taxableGallons)}</td>
        <td class="net-taxable-gallons">${formatGallons(rowData.netTaxableGallons)}</td>
        <td class="tax-amount ${taxClass}">${formatCurrency(rowData.taxDue)}</td>
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

// Attach event listeners to a row
function attachRowEventListeners(row, rowId) {
    // Jurisdiction change
    row.querySelector('.jurisdiction-select').addEventListener('change', (e) => {
        updateRowField(rowId, 'jurisdiction', e.target.value);
        calculateRow(rowId);
    });
    
    // Total miles change
    row.querySelector('.total-miles').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value) || 0;
        updateRowField(rowId, 'totalMiles', value);
        
        // Auto-fill taxable miles if empty
        const taxableMilesInput = row.querySelector('.taxable-miles');
        if (!taxableMilesInput.value) {
            taxableMilesInput.value = value;
            updateRowField(rowId, 'taxableMiles', value);
        }
        
        calculateRow(rowId);
    });
    
    // Taxable miles change
    row.querySelector('.taxable-miles').addEventListener('input', (e) => {
        updateRowField(rowId, 'taxableMiles', parseFloat(e.target.value) || 0);
        calculateRow(rowId);
    });
    
    // Tax paid gallons change
    row.querySelector('.tax-paid-gallons').addEventListener('input', (e) => {
        updateRowField(rowId, 'taxPaidGallons', parseFloat(e.target.value) || 0);
        calculateRow(rowId);
    });
    
    // Delete row
    row.querySelector('.delete-row').addEventListener('click', () => {
        deleteRow(rowId);
    });
}

// Update a field in the row data
function updateRowField(rowId, field, value) {
    const rowData = appState.rows.find(r => r.id === rowId);
    if (rowData) {
        rowData[field] = value;
    }
}

// Calculate values for a single row
function calculateRow(rowId) {
    const rowData = appState.rows.find(r => r.id === rowId);
    if (!rowData) {
        console.warn(`Row ${rowId} not found for calculation`);
        return;
    }
    
    try {
        // Sanitize input values
        rowData.totalMiles = sanitizeNumber(rowData.totalMiles, 0, CONSTANTS.MAX_MILES);
        rowData.taxableMiles = sanitizeNumber(rowData.taxableMiles, 0, CONSTANTS.MAX_MILES);
        rowData.taxPaidGallons = sanitizeNumber(rowData.taxPaidGallons, 0, CONSTANTS.MAX_GALLONS);
        
        // Get tax rate for the selected jurisdiction, fuel type, and active QUARTER
        // Use getValidatedTaxRate for bulletproof rate lookup (it uses activeQuarter internally)
        let taxRate = 0;
        if (rowData.jurisdiction) {
            if (typeof getValidatedTaxRate === 'function') {
                taxRate = getValidatedTaxRate(rowData.jurisdiction, appState.selectedFuelType);
            } else if (typeof getTaxRate === 'function') {
                taxRate = getTaxRate(rowData.jurisdiction, appState.selectedFuelType);
            }
        }
        rowData.taxRate = sanitizeNumber(taxRate, 0, 2);
        
        // Calculate taxable gallons = taxable miles / fleet MPG
        const mpg = Math.max(appState.fleetMpg, CONSTANTS.MIN_MPG);
        const taxableGallons = rowData.taxableMiles / mpg;
        rowData.taxableGallons = roundTo(taxableGallons, CONSTANTS.DECIMAL_PLACES.gallons);
        
        // Calculate net taxable gallons = taxable gallons - tax paid gallons
        const netTaxableGallons = rowData.taxableGallons - rowData.taxPaidGallons;
        rowData.netTaxableGallons = roundTo(netTaxableGallons, CONSTANTS.DECIMAL_PLACES.gallons);
        
        // Calculate tax due/credit using bulletproof calculation
        let taxDue;
        if (typeof calculateTax === 'function') {
            taxDue = calculateTax(rowData.netTaxableGallons, rowData.taxRate);
        } else {
            taxDue = rowData.netTaxableGallons * rowData.taxRate;
        }
        rowData.taxDue = roundTo(taxDue, CONSTANTS.DECIMAL_PLACES.currency);
        
        // Update UI
        updateRowUI(rowId, rowData);
        updateTotals();
    } catch (error) {
        console.error(`Error calculating row ${rowId}:`, error);
    }
}

// Sanitize number input
function sanitizeNumber(value, min = 0, max = Infinity) {
    const num = parseFloat(value);
    if (isNaN(num)) return min;
    return Math.max(min, Math.min(max, num));
}

// Round to specified decimal places
function roundTo(num, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

// Update row UI with calculated values
function updateRowUI(rowId, rowData) {
    const row = document.getElementById(`row-${rowId}`);
    if (!row) return;
    
    row.querySelector('.rate-display').textContent = formatRate(rowData.taxRate);
    row.querySelector('.taxable-gallons').textContent = formatGallons(rowData.taxableGallons);
    row.querySelector('.net-taxable-gallons').textContent = formatGallons(rowData.netTaxableGallons);
    
    const taxCell = row.querySelector('.tax-amount');
    taxCell.textContent = formatCurrency(rowData.taxDue);
    taxCell.className = `tax-amount ${rowData.taxDue >= 0 ? 'positive' : 'negative'}`;
}

// Delete a row
function deleteRow(rowId) {
    const index = appState.rows.findIndex(r => r.id === rowId);
    if (index > -1) {
        appState.rows.splice(index, 1);
    }
    
    const row = document.getElementById(`row-${rowId}`);
    if (row) {
        row.remove();
    }
    
    updateTotals();
    
    // Add a new row if all rows are deleted
    if (appState.rows.length === 0) {
        addNewRow();
    }
}

// Clear all rows
function clearAllRows() {
    if (!confirm('Are you sure you want to clear all data?')) return;
    
    appState.rows = [];
    appState.rowIdCounter = 0;
    elements.dataTableBody.innerHTML = '';
    addNewRow();
    updateTotals();
    showToast('All data cleared', 'info');
}

// Recalculate all rows
function recalculateAll() {
    appState.rows.forEach(row => {
        calculateRow(row.id);
    });
}

// Update totals in footer
function updateTotals() {
    let totalMiles = 0;
    let totalTaxableMiles = 0;
    let totalGallons = 0;
    let totalTaxableGallons = 0;
    let totalNetGallons = 0;
    let totalTax = 0;
    
    appState.rows.forEach(row => {
        totalMiles += row.totalMiles || 0;
        totalTaxableMiles += row.taxableMiles || 0;
        totalGallons += row.taxPaidGallons || 0;
        totalTaxableGallons += row.taxableGallons || 0;
        totalNetGallons += row.netTaxableGallons || 0;
        totalTax += row.taxDue || 0;
    });
    
    // Update table footer
    document.getElementById('totalMiles').textContent = formatNumber(totalMiles);
    document.getElementById('totalTaxableMiles').textContent = formatNumber(totalTaxableMiles);
    document.getElementById('totalGallons').textContent = formatGallons(totalGallons);
    document.getElementById('totalTaxableGallons').textContent = formatGallons(totalTaxableGallons);
    document.getElementById('totalNetGallons').textContent = formatGallons(totalNetGallons);
    
    const totalTaxCell = document.getElementById('totalTax');
    totalTaxCell.textContent = formatCurrency(totalTax);
    totalTaxCell.className = `tax-amount ${totalTax >= 0 ? 'positive' : 'negative'}`;
    
    // Update summary cards
    document.getElementById('summaryMiles').textContent = formatNumber(totalMiles);
    document.getElementById('summaryGallons').textContent = formatGallons(totalGallons);
    
    const overallMpg = totalGallons > 0 ? totalMiles / totalGallons : 0;
    document.getElementById('summaryMpg').textContent = overallMpg.toFixed(2);
    
    const summaryTax = document.getElementById('summaryTax');
    summaryTax.textContent = formatCurrency(totalTax);
}

// Update the rates reference table
function updateRatesTable() {
    const tbody = document.getElementById('ratesTableBody');
    tbody.innerHTML = '';
    
    const jurisdictions = getJurisdictionList();
    
    jurisdictions.forEach(j => {
        const data = IFTA_TAX_RATES.jurisdictions[j.code];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${data.name}</strong> (${j.code})</td>
            <td>${j.country}</td>
            <td>${formatRate(data.rates.diesel)}</td>
            <td>${formatRate(data.rates.gasoline)}</td>
            <td>${formatRate(data.rates.gasohol)}</td>
            <td>${formatRate(data.rates.propane)}</td>
            <td>${formatRate(data.rates.lng)}</td>
            <td>${formatRate(data.rates.cng)}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Update exchange rate display
    document.getElementById('exchangeRate').textContent = 
        `Exchange Rate: US ${IFTA_TAX_RATES.exchangeRate.usToCanada} / CAN ${IFTA_TAX_RATES.exchangeRate.canadaToUs}`;
    
    // Update last updated
    document.getElementById('lastUpdated').textContent = 
        `Last Updated: ${IFTA_TAX_RATES.lastUpdated}`;
}

// Filter rates table
function filterRatesTable() {
    const searchTerm = document.getElementById('ratesSearch').value.toLowerCase();
    const countryFilter = document.getElementById('countryFilter').value;
    
    const rows = document.querySelectorAll('#ratesTableBody tr');
    
    rows.forEach(row => {
        const name = row.cells[0].textContent.toLowerCase();
        const country = row.cells[1].textContent;
        
        const matchesSearch = name.includes(searchTerm);
        const matchesCountry = countryFilter === 'all' || country === countryFilter;
        
        row.style.display = matchesSearch && matchesCountry ? '' : 'none';
    });
}

// Background rate update check (fallback when IntegrityMonitor not available)
async function checkForRateUpdates() {
    try {
        updateRateStatus('fetching', 'Verifying...');
        
        if (typeof IFTARateFetcher !== 'undefined') {
            const result = await IFTARateFetcher.autoUpdate();
            
            if (result.updated) {
                updateRatesTable();
                recalculateAll();
                updateRateStatus('verified', 'Updated');
            } else {
                updateRateStatus('verified', 'Current');
            }
        } else {
            updateRateStatus('verified', 'Cached');
        }
    } catch (error) {
        console.log('Rate check completed with fallback');
        updateRateStatus('verified', 'Cached');
    }
}

// Update rate status indicator
function updateRateStatus(status, text) {
    const statusEl = document.getElementById('rateStatus');
    if (statusEl) {
        statusEl.className = `rate-status ${status}`;
        statusEl.querySelector('.status-text').textContent = text;
    }
}

// Handle CSV import
function handleCsvImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const csv = e.target.result;
            const lines = csv.split('\n');
            
            // Skip header row
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const [jurisdiction, totalMiles, taxableMiles, taxPaidGallons] = 
                    line.split(',').map(s => s.trim());
                
                if (jurisdiction) {
                    const rowData = addNewRow();
                    rowData.jurisdiction = jurisdiction.toUpperCase();
                    rowData.totalMiles = parseFloat(totalMiles) || 0;
                    rowData.taxableMiles = parseFloat(taxableMiles) || 0;
                    rowData.taxPaidGallons = parseFloat(taxPaidGallons) || 0;
                    
                    // Update the row's UI
                    const row = document.getElementById(`row-${rowData.id}`);
                    if (row) {
                        row.querySelector('.jurisdiction-select').value = rowData.jurisdiction;
                        row.querySelector('.total-miles').value = rowData.totalMiles;
                        row.querySelector('.taxable-miles').value = rowData.taxableMiles;
                        row.querySelector('.tax-paid-gallons').value = rowData.taxPaidGallons;
                    }
                    
                    calculateRow(rowData.id);
                }
            }
            
            showToast(`Imported ${lines.length - 1} rows from CSV`, 'success');
        } catch (error) {
            console.error('CSV import error:', error);
            showToast('Error importing CSV file', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
}

// Export to CSV
function exportToCsv() {
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (dataRows.length === 0) {
        showToast('No data to export. Please add some trip data first.', 'warning');
        return;
    }
    
    try {
        // Use BOM for proper Excel UTF-8 encoding
        let csv = '\uFEFF';
        csv += 'Jurisdiction,Total Miles,Taxable Miles,Tax Paid Gallons,Tax Rate,Taxable Gallons,Net Taxable Gallons,Tax Due\n';
        
        dataRows.forEach(row => {
            const jurisdictionData = IFTA_TAX_RATES.jurisdictions[row.jurisdiction];
            const name = jurisdictionData ? jurisdictionData.name : row.jurisdiction;
            csv += `"${name} (${row.jurisdiction})",${row.totalMiles},${row.taxableMiles},${row.taxPaidGallons},${row.taxRate.toFixed(4)},${row.taxableGallons.toFixed(3)},${row.netTaxableGallons.toFixed(3)},${row.taxDue.toFixed(2)}\n`;
        });
        
        const timestamp = new Date().toISOString().slice(0,10);
        downloadFile(csv, `ifta-report-${appState.selectedQuarter}-${timestamp}.csv`, 'text/csv;charset=utf-8');
        showToast(`CSV exported with ${dataRows.length} rows`, 'success');
    } catch (error) {
        console.error('CSV export error:', error);
        showToast('Error exporting CSV file', 'error');
    }
}

// Export to Excel (CSV format that Excel opens)
function exportToExcel() {
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (dataRows.length === 0) {
        showToast('No data to export. Please add some trip data first.', 'warning');
        return;
    }
    
    try {
        // Use BOM for proper Excel UTF-8 encoding
        let csv = '\uFEFF';
        csv += 'IFTA Fuel Tax Report\n';
        csv += `Quarter:,${formatQuarterDisplay(appState.selectedQuarter)}\n`;
        csv += `Fuel Type:,${appState.selectedFuelType.charAt(0).toUpperCase() + appState.selectedFuelType.slice(1)}\n`;
        csv += `Fleet MPG:,${appState.fleetMpg}\n`;
        csv += `Base Jurisdiction:,${appState.baseJurisdiction}\n`;
        csv += `Generated:,${new Date().toLocaleString()}\n\n`;
        
        csv += 'Jurisdiction,Total Miles,Taxable Miles,Tax Paid Gallons,Tax Rate,Taxable Gallons,Net Taxable Gallons,Tax Due\n';
        
        let totals = { miles: 0, taxableMiles: 0, gallons: 0, taxableGallons: 0, netGallons: 0, tax: 0 };
        
        dataRows.forEach(row => {
            const jurisdictionData = IFTA_TAX_RATES.jurisdictions[row.jurisdiction];
            const name = jurisdictionData ? jurisdictionData.name : row.jurisdiction;
            csv += `"${name} (${row.jurisdiction})",${row.totalMiles},${row.taxableMiles},${row.taxPaidGallons},${row.taxRate.toFixed(4)},${row.taxableGallons.toFixed(3)},${row.netTaxableGallons.toFixed(3)},${row.taxDue.toFixed(2)}\n`;
            
            totals.miles += row.totalMiles;
            totals.taxableMiles += row.taxableMiles;
            totals.gallons += row.taxPaidGallons;
            totals.taxableGallons += row.taxableGallons;
            totals.netGallons += row.netTaxableGallons;
            totals.tax += row.taxDue;
        });
        
        csv += `\nTOTALS,${totals.miles},${totals.taxableMiles},${roundTo(totals.gallons, 3)},,${roundTo(totals.taxableGallons, 3)},${roundTo(totals.netGallons, 3)},${roundTo(totals.tax, 2)}\n`;
        csv += `\n"Tax Status:","${totals.tax >= 0 ? 'Tax Due' : 'Credit/Refund'}",,,,,,$${Math.abs(totals.tax).toFixed(2)}\n`;
        
        const timestamp = new Date().toISOString().slice(0,10);
        downloadFile(csv, `ifta-report-${appState.selectedQuarter}-${timestamp}.xlsx`, 'application/vnd.ms-excel');
        showToast(`Excel file exported with ${dataRows.length} jurisdictions`, 'success');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Error exporting Excel file', 'error');
    }
}

// Export to PDF using jsPDF
function exportToPdf() {
    // Check if there's data to export
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (dataRows.length === 0) {
        showToast('No data to export. Please add some trip data first.', 'warning');
        return;
    }
    
    // Check if jsPDF is loaded
    if (typeof window.jspdf === 'undefined') {
        showToast('PDF library loading... please try again in a moment.', 'warning');
        return;
    }
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Colors
        const primaryColor = [91, 155, 213]; // Ocean blue
        const headerBg = [240, 247, 255];
        const positiveTax = [198, 40, 40]; // Red for tax due
        const negativeTax = [46, 125, 50]; // Green for credit
        
        // Title
        doc.setFontSize(22);
        doc.setTextColor(...primaryColor);
        doc.text('IFTA Fuel Tax Report', 14, 22);
        
        // Subtitle line
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.5);
        doc.line(14, 26, 196, 26);
        
        // Report Info Section
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        
        const infoY = 35;
        const col1X = 14;
        const col2X = 110;
        
        doc.setFont(undefined, 'bold');
        doc.text('Quarter:', col1X, infoY);
        doc.text('Fuel Type:', col1X, infoY + 6);
        doc.text('Fleet MPG:', col1X, infoY + 12);
        doc.text('Base Jurisdiction:', col2X, infoY);
        doc.text('Report Date:', col2X, infoY + 6);
        
        doc.setFont(undefined, 'normal');
        doc.text(formatQuarterDisplay(appState.selectedQuarter), col1X + 25, infoY);
        doc.text(appState.selectedFuelType.charAt(0).toUpperCase() + appState.selectedFuelType.slice(1), col1X + 25, infoY + 6);
        doc.text(String(appState.fleetMpg), col1X + 25, infoY + 12);
        doc.text(appState.baseJurisdiction, col2X + 40, infoY);
        doc.text(new Date().toLocaleDateString(), col2X + 40, infoY + 6);
        
        // Prepare table data
        const tableData = [];
        let totals = { miles: 0, taxableMiles: 0, gallons: 0, taxableGallons: 0, netGallons: 0, tax: 0 };
        
        dataRows.forEach(row => {
            const jurisdictionData = IFTA_TAX_RATES.jurisdictions[row.jurisdiction];
            const name = jurisdictionData ? `${jurisdictionData.name} (${row.jurisdiction})` : row.jurisdiction;
            
            tableData.push([
                name,
                formatNumber(row.totalMiles),
                formatNumber(row.taxableMiles),
                formatGallons(row.taxPaidGallons),
                formatRate(row.taxRate),
                formatGallons(row.taxableGallons),
                formatGallons(row.netTaxableGallons),
                formatCurrency(row.taxDue)
            ]);
            
            totals.miles += row.totalMiles || 0;
            totals.taxableMiles += row.taxableMiles || 0;
            totals.gallons += row.taxPaidGallons || 0;
            totals.taxableGallons += row.taxableGallons || 0;
            totals.netGallons += row.netTaxableGallons || 0;
            totals.tax += row.taxDue || 0;
        });
        
        // Add totals row
        tableData.push([
            'TOTALS',
            formatNumber(totals.miles),
            formatNumber(totals.taxableMiles),
            formatGallons(totals.gallons),
            '—',
            formatGallons(totals.taxableGallons),
            formatGallons(totals.netGallons),
            formatCurrency(totals.tax)
        ]);
        
        // Create table
        doc.autoTable({
            startY: infoY + 22,
            head: [['Jurisdiction', 'Total Miles', 'Taxable Miles', 'Tax Paid Gal', 'Rate', 'Taxable Gal', 'Net Taxable', 'Tax Due']],
            body: tableData,
            theme: 'striped',
            headStyles: {
                fillColor: primaryColor,
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 9
            },
            bodyStyles: {
                fontSize: 8
            },
            alternateRowStyles: {
                fillColor: [250, 250, 250]
            },
            columnStyles: {
                0: { cellWidth: 40 },
                1: { halign: 'right', cellWidth: 20 },
                2: { halign: 'right', cellWidth: 22 },
                3: { halign: 'right', cellWidth: 20 },
                4: { halign: 'right', cellWidth: 18 },
                5: { halign: 'right', cellWidth: 20 },
                6: { halign: 'right', cellWidth: 20 },
                7: { halign: 'right', cellWidth: 22 }
            },
            didParseCell: function(data) {
                // Style the totals row
                if (data.row.index === tableData.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [232, 245, 233];
                }
                // Color the tax column based on positive/negative
                if (data.column.index === 7 && data.section === 'body') {
                    const value = parseFloat(data.cell.raw.replace(/[$,]/g, ''));
                    if (value > 0) {
                        data.cell.styles.textColor = positiveTax;
                    } else if (value < 0) {
                        data.cell.styles.textColor = negativeTax;
                    }
                }
            },
            margin: { left: 14, right: 14 }
        });
        
        // Footer
        const finalY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text('Generated by IFTA Wizard | Tax rates sourced from IFTA, Inc.', 14, finalY);
        doc.text('Disclaimer: This report is for estimation purposes only. Verify all rates with official sources before filing.', 14, finalY + 4);
        
        // Save the PDF
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `IFTA-Report-${appState.selectedQuarter.replace(' ', '-')}-${timestamp}.pdf`;
        doc.save(filename);
        
        showToast('PDF downloaded successfully!', 'success');
        
    } catch (error) {
        console.error('PDF export error:', error);
        showToast('Error generating PDF. Please try again.', 'error');
        
        // Fallback to print dialog
        if (confirm('PDF generation failed. Would you like to use the print dialog instead?')) {
            printReportAsPdf();
        }
    }
}

// Fallback: Print-based PDF export
function printReportAsPdf() {
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (dataRows.length === 0) {
        showToast('No data to export.', 'warning');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked! Please allow popups.', 'error');
        return;
    }
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>IFTA Report - ${appState.selectedQuarter}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #5b9bd5; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                th { background: #5b9bd5; color: white; }
                .totals { background: #e8f5e9; font-weight: bold; }
                .positive { color: #c62828; }
                .negative { color: #2e7d32; }
                .info { margin-bottom: 20px; }
                .info p { margin: 5px 0; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>IFTA Fuel Tax Report</h1>
            <div class="info">
                <p><strong>Quarter:</strong> ${formatQuarterDisplay(appState.selectedQuarter)}</p>
                <p><strong>Fuel Type:</strong> ${appState.selectedFuelType.charAt(0).toUpperCase() + appState.selectedFuelType.slice(1)}</p>
                <p><strong>Fleet MPG:</strong> ${appState.fleetMpg}</p>
                <p><strong>Base Jurisdiction:</strong> ${appState.baseJurisdiction}</p>
                <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Jurisdiction</th>
                        <th>Total Miles</th>
                        <th>Taxable Miles</th>
                        <th>Tax Paid Gallons</th>
                        <th>Tax Rate</th>
                        <th>Taxable Gallons</th>
                        <th>Net Taxable Gal</th>
                        <th>Tax Due/Credit</th>
                    </tr>
                </thead>
                <tbody>`;
    
    let totals = { miles: 0, taxableMiles: 0, gallons: 0, taxableGallons: 0, netGallons: 0, tax: 0 };
    
    dataRows.forEach(row => {
        const jurisdictionData = IFTA_TAX_RATES.jurisdictions[row.jurisdiction];
        const name = jurisdictionData ? jurisdictionData.name : row.jurisdiction;
        const taxClass = row.taxDue >= 0 ? 'positive' : 'negative';
        
        html += `
            <tr>
                <td>${name} (${row.jurisdiction})</td>
                <td>${formatNumber(row.totalMiles)}</td>
                <td>${formatNumber(row.taxableMiles)}</td>
                <td>${formatGallons(row.taxPaidGallons)}</td>
                <td>${formatRate(row.taxRate)}</td>
                <td>${formatGallons(row.taxableGallons)}</td>
                <td>${formatGallons(row.netTaxableGallons)}</td>
                <td class="${taxClass}">${formatCurrency(row.taxDue)}</td>
            </tr>`;
        
        totals.miles += row.totalMiles || 0;
        totals.taxableMiles += row.taxableMiles || 0;
        totals.gallons += row.taxPaidGallons || 0;
        totals.taxableGallons += row.taxableGallons || 0;
        totals.netGallons += row.netTaxableGallons || 0;
        totals.tax += row.taxDue || 0;
    });
    
    const totalTaxClass = totals.tax >= 0 ? 'positive' : 'negative';
    
    html += `
                <tr class="totals">
                    <td>TOTALS</td>
                    <td>${formatNumber(totals.miles)}</td>
                    <td>${formatNumber(totals.taxableMiles)}</td>
                    <td>${formatGallons(totals.gallons)}</td>
                    <td>—</td>
                    <td>${formatGallons(totals.taxableGallons)}</td>
                    <td>${formatGallons(totals.netGallons)}</td>
                    <td class="${totalTaxClass}">${formatCurrency(totals.tax)}</td>
                </tr>
            </tbody>
        </table>
        <p style="margin-top: 30px; font-size: 12px; color: #666;">
            Generated by IFTA Wizard | Disclaimer: For estimation purposes only.
        </p>
        <script>window.print(); window.onafterprint = function() { window.close(); }</script>
        </body>
        </html>`;
    
    printWindow.document.write(html);
    printWindow.document.close();
}

// Print report
function printReport() {
    window.print();
}

// Save to localStorage
function saveToLocalStorage() {
    try {
        // Check if localStorage is available
        if (!isLocalStorageAvailable()) {
            showToast('Browser storage not available. Try enabling cookies.', 'error');
            return;
        }
        
        const data = {
            version: '1.1.0',
            rows: appState.rows,
            selectedFuelType: appState.selectedFuelType,
            selectedQuarter: appState.selectedQuarter,
            baseJurisdiction: appState.baseJurisdiction,
            fleetMpg: appState.fleetMpg,
            savedAt: new Date().toISOString()
        };
        
        const jsonData = JSON.stringify(data);
        
        // Check storage quota (roughly)
        if (jsonData.length > 5000000) { // 5MB limit
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

// Check if localStorage is available
function isLocalStorageAvailable() {
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        return false;
    }
}

// Load from localStorage
function loadFromLocalStorage(silent = false) {
    if (!isLocalStorageAvailable()) {
        if (!silent) showToast('Browser storage not available', 'error');
        return;
    }
    
    const savedData = localStorage.getItem('iftaWizardData');
    
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            
            // Validate data structure
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid data format');
            }
            
            // Restore settings with validation
            appState.selectedFuelType = ['diesel', 'gasoline', 'gasohol', 'propane', 'lng', 'cng'].includes(data.selectedFuelType) 
                ? data.selectedFuelType : 'diesel';
            appState.selectedQuarter = /^Q[1-4] \d{4}$/.test(data.selectedQuarter) 
                ? data.selectedQuarter : 'Q4 2025';
            appState.baseJurisdiction = IFTA_TAX_RATES.jurisdictions[data.baseJurisdiction] 
                ? data.baseJurisdiction : 'TX';
            appState.fleetMpg = sanitizeNumber(data.fleetMpg, CONSTANTS.MIN_MPG, CONSTANTS.MAX_MPG) || CONSTANTS.DEFAULT_MPG;
            
            // Update UI
            elements.fuelTypeSelect.value = appState.selectedFuelType;
            elements.quarterSelect.value = appState.selectedQuarter;
            elements.baseJurisdictionSelect.value = appState.baseJurisdiction;
            elements.fleetMpgInput.value = appState.fleetMpg;
            
            // Clear existing rows and restore saved rows
            if (data.rows && data.rows.length > 0) {
                appState.rows = [];
                appState.rowIdCounter = 0;
                elements.dataTableBody.innerHTML = '';
                
                data.rows.forEach(rowData => {
                    const newRow = addNewRow();
                    Object.assign(newRow, rowData);
                    newRow.id = appState.rowIdCounter;
                    
                    // Update UI
                    const row = document.getElementById(`row-${newRow.id}`);
                    if (row) {
                        row.querySelector('.jurisdiction-select').value = newRow.jurisdiction || '';
                        row.querySelector('.total-miles').value = newRow.totalMiles || '';
                        row.querySelector('.taxable-miles').value = newRow.taxableMiles || '';
                        row.querySelector('.tax-paid-gallons').value = newRow.taxPaidGallons || '';
                    }
                    
                    calculateRow(newRow.id);
                });
                
                if (!silent) {
                    const savedAt = new Date(data.savedAt).toLocaleString();
                    showToast(`Loaded ${data.rows.length} trip${data.rows.length !== 1 ? 's' : ''} from ${savedAt}`, 'success');
                }
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
            if (!silent) {
                showToast('Error loading saved data. Data may be corrupted.', 'error');
            }
            // Clear corrupted data
            try {
                localStorage.removeItem('iftaWizardData');
            } catch (e) { /* ignore */ }
        }
    } else {
        if (!silent) {
            showToast('No saved data found', 'info');
        }
    }
}

// Load report data from saved report (used by reports.js)
function loadReportData(reportData) {
    if (!reportData) return;
    
    try {
        // Restore settings
        if (reportData.fuelType) {
            appState.selectedFuelType = reportData.fuelType;
            elements.fuelTypeSelect.value = reportData.fuelType;
        }
        
        if (reportData.quarter) {
            appState.selectedQuarter = reportData.quarter;
            elements.quarterSelect.value = reportData.quarter;
            
            // Sync header dropdown
            const headerSelect = document.getElementById('headerQuarterSelect');
            if (headerSelect) {
                headerSelect.value = reportData.quarter;
            }
            
            // Set active quarter for rate lookup
            if (typeof setActiveQuarter === 'function') {
                setActiveQuarter(reportData.quarter);
            }
        }
        
        if (reportData.baseJurisdiction) {
            appState.baseJurisdiction = reportData.baseJurisdiction;
            elements.baseJurisdictionSelect.value = reportData.baseJurisdiction;
        }
        
        if (reportData.mpg) {
            appState.fleetMpg = reportData.mpg;
            elements.fleetMpgInput.value = reportData.mpg;
        }
        
        // Clear existing rows
        appState.rows = [];
        appState.rowIdCounter = 0;
        elements.dataTableBody.innerHTML = '';
        
        // Load rows
        if (reportData.rows && reportData.rows.length > 0) {
            reportData.rows.forEach(rowData => {
                const newRow = addNewRow();
                newRow.jurisdiction = rowData.jurisdiction || '';
                newRow.totalMiles = rowData.totalMiles || 0;
                newRow.taxableMiles = rowData.taxableMiles || 0;
                newRow.taxPaidGallons = rowData.taxPaidGallons || 0;
                
                // Update UI
                const row = document.getElementById(`row-${newRow.id}`);
                if (row) {
                    row.querySelector('.jurisdiction-select').value = newRow.jurisdiction;
                    row.querySelector('.total-miles').value = newRow.totalMiles || '';
                    row.querySelector('.taxable-miles').value = newRow.taxableMiles || '';
                    row.querySelector('.tax-paid-gallons').value = newRow.taxPaidGallons || '';
                }
                
                calculateRow(newRow.id);
            });
        } else {
            // Add at least one empty row
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

// Expose loadReportData globally for reports.js
window.loadReportData = loadReportData;

// Utility: Download file
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Utility: Format number
function formatNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) {
        return '0';
    }
    return Math.round(num).toLocaleString();
}

// Utility: Format gallons
function formatGallons(num) {
    if (typeof num !== 'number' || isNaN(num)) {
        return '0.000';
    }
    return num.toFixed(3);
}

// Utility: Format currency
function formatCurrency(num) {
    if (typeof num !== 'number' || isNaN(num)) {
        return '$0.00';
    }
    const prefix = num < 0 ? '-' : '';
    return prefix + '$' + Math.abs(num).toFixed(2);
}

// Utility: Format tax rate
function formatRate(rate) {
    if (typeof rate !== 'number' || isNaN(rate) || rate === 0) {
        return '$0.0000';
    }
    return '$' + rate.toFixed(4);
}

// Utility: Format quarter display
function formatQuarterDisplay(quarter) {
    // Handle "Q4 2025" format (already correct)
    if (/^Q[1-4] \d{4}$/.test(quarter)) {
        return quarter;
    }
    // Handle "4Q2025" format (legacy)
    const match = quarter.match(/(\d)Q(\d{4})/);
    if (match) {
        const q = match[1];
        const year = match[2];
        return `Q${q} ${year}`;
    }
    return quarter;
}

// UI: Show loading overlay
function showLoading() {
    elements.loadingOverlay.classList.add('active');
}

// UI: Hide loading overlay
function hideLoading() {
    elements.loadingOverlay.classList.remove('active');
}

// UI: Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    switch (type) {
        case 'success':
            icon = '✓';
            break;
        case 'error':
            icon = '✕';
            break;
        case 'warning':
            icon = '⚠';
            break;
        default:
            icon = 'ℹ';
    }
    
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    elements.toastContainer.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
