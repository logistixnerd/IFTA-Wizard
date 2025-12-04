/**
 * IFTA Wizard - Main Application
 * Fuel Tax Calculator for Interstate Motor Carriers
 * Version: 1.1.0
 */

'use strict';

// Application State
const appState = {
    rows: [],
    unitNumber: '',           // Truck/unit number or empty for company-wide
    selectedFuelType: 'diesel',
    selectedQuarter: 'Q4 2025',
    baseJurisdiction: '',  // Empty by default - user must select
    fleetMpg: 6.5,
    currentMpg: 0,  // Calculated from current data entry
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
    unitNumberInput: null,
    fuelTypeSelect: null,
    baseJurisdictionSelect: null,
    fleetMpgInput: null,
    currentMpgInput: null,
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
    elements.unitNumberInput = document.getElementById('unitNumber');
    elements.fuelTypeSelect = document.getElementById('fuelType');
    elements.baseJurisdictionSelect = document.getElementById('baseJurisdiction');
    elements.fleetMpgInput = document.getElementById('fleetMpg');
    elements.currentMpgInput = document.getElementById('currentMpg');
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
    
    // Add "Select..." placeholder option
    const selectOption = document.createElement('option');
    selectOption.value = '';
    selectOption.textContent = 'Select...';
    baseSelect.appendChild(selectOption);
    
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
    
    // Set to empty (Select...) by default
    baseSelect.value = appState.baseJurisdiction || '';
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
    elements.unitNumberInput.addEventListener('input', (e) => {
        appState.unitNumber = e.target.value.trim();
    });
    
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
    
    // Create row data object
    const rowData = {
        id: rowId,
        jurisdiction: data?.jurisdiction || '',
        totalMiles: data?.totalMiles || 0,
        taxableMiles: data?.taxableMiles || 0,
        taxPaidGallons: data?.taxPaidGallons || 0,
        taxRate: data?.taxRate || 0,
        taxableGallons: data?.taxableGallons || 0,
        netTaxableGallons: data?.netTaxableGallons || 0,
        taxDue: data?.taxDue || 0,
        taxableMilesManuallyEdited: data?.taxableMilesManuallyEdited || false
    };
    
    // Add to state FIRST so createRowHtml can see all rows
    appState.rows.push(rowData);
    
    console.log(`addNewRow: Creating row ${rowId}, appState.rows now has ${appState.rows.length} rows`);
    
    // Create the row element
    const row = document.createElement('tr');
    row.id = `row-${rowId}`;
    row.innerHTML = createRowHtml(rowData);
    elements.dataTableBody.appendChild(row);
    
    // Attach all event listeners with the correct rowId
    attachRowEventListeners(row, rowId);
    
    // Refresh all dropdowns to show updated disabled states
    refreshAllJurisdictionDropdowns();
    
    console.log(`addNewRow: Row ${rowId} fully created with event listeners`);
    
    return rowData;
}

// Create HTML for a table row
function createRowHtml(rowData) {
    const jurisdictions = getJurisdictionList();
    
    // Get already used jurisdictions (exclude current row's jurisdiction)
    const usedJurisdictions = appState.rows
        .filter(r => r.id !== rowData.id && r.jurisdiction)
        .map(r => r.jurisdiction);
    
    let jurisdictionOptions = '<option value="">Select...</option>';
    
    // US jurisdictions
    jurisdictionOptions += '<optgroup label="United States">';
    jurisdictions.filter(j => j.country === 'US').forEach(j => {
        const selected = rowData.jurisdiction === j.code ? 'selected' : '';
        const disabled = usedJurisdictions.includes(j.code) ? 'disabled' : '';
        const usedLabel = usedJurisdictions.includes(j.code) ? ' (already added)' : '';
        jurisdictionOptions += `<option value="${j.code}" ${selected} ${disabled}>${j.name} (${j.code})${usedLabel}</option>`;
    });
    jurisdictionOptions += '</optgroup>';
    
    // Canadian jurisdictions
    jurisdictionOptions += '<optgroup label="Canada">';
    jurisdictions.filter(j => j.country === 'CAN').forEach(j => {
        const selected = rowData.jurisdiction === j.code ? 'selected' : '';
        const disabled = usedJurisdictions.includes(j.code) ? 'disabled' : '';
        const usedLabel = usedJurisdictions.includes(j.code) ? ' (already added)' : '';
        jurisdictionOptions += `<option value="${j.code}" ${selected} ${disabled}>${j.name} (${j.code})${usedLabel}</option>`;
    });
    jurisdictionOptions += '</optgroup>';
    
    const taxClass = rowData.taxDue >= 0 ? 'positive' : 'negative';
    
    // Display values - whole numbers for miles, integers for gallons
    const totalMilesDisplay = rowData.totalMiles ? Math.round(rowData.totalMiles) : '';
    const taxableMilesDisplay = rowData.taxableMiles ? Math.round(rowData.taxableMiles) : '';
    const taxPaidGallonsDisplay = rowData.taxPaidGallons ? Math.round(rowData.taxPaidGallons) : '';
    
    return `
        <td>
            <select class="jurisdiction-select" data-field="jurisdiction">
                ${jurisdictionOptions}
            </select>
        </td>
        <td>
            <input type="number" class="total-miles" data-field="totalMiles" 
                   value="${totalMilesDisplay}" min="0" step="1" placeholder="0"
                   title="Total miles traveled in this jurisdiction">
        </td>
        <td>
            <input type="number" class="taxable-miles" data-field="taxableMiles" 
                   value="${taxableMilesDisplay}" min="0" step="1" placeholder="0"
                   title="Taxable miles (defaults to total miles, editable for exemptions)">
        </td>
        <td>
            <input type="number" class="tax-paid-gallons" data-field="taxPaidGallons" 
                   value="${taxPaidGallonsDisplay}" min="0" step="1" placeholder="0"
                   title="Gallons purchased with tax already paid in this jurisdiction">
        </td>
        <td class="rate-display" title="Tax rate from IFTA reference - not editable">${formatRate(rowData.taxRate)}</td>
        <td class="taxable-gallons" title="Taxable Miles ÷ Fleet MPG">${formatWholeGallons(rowData.taxableGallons)}</td>
        <td class="net-taxable-gallons" title="Taxable Gallons - Tax Paid Gallons">${formatWholeGallons(rowData.netTaxableGallons)}</td>
        <td class="tax-amount ${taxClass}" title="Net Taxable Gallons × Tax Rate">${formatCurrency(rowData.taxDue)}</td>
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

// Format gallons as whole numbers
function formatWholeGallons(value) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    return Math.round(value).toLocaleString();
}

// Attach event listeners to a row
function attachRowEventListeners(row, rowId) {
    // Jurisdiction change - ALWAYS update tax rate from reference
    row.querySelector('.jurisdiction-select').addEventListener('change', (e) => {
        const newJurisdiction = e.target.value;
        console.log(`Jurisdiction change for row ${rowId}: ${newJurisdiction}`);
        console.log(`appState.rows:`, appState.rows.map(r => ({id: r.id, jurisdiction: r.jurisdiction})));
        
        // Check if jurisdiction is already used in another row
        if (newJurisdiction) {
            const existingRow = appState.rows.find(r => r.id !== rowId && r.jurisdiction === newJurisdiction);
            if (existingRow) {
                showToast(`${newJurisdiction} is already added in another row`, 'warning');
                e.target.value = ''; // Reset selection
                return;
            }
        }
        
        updateRowField(rowId, 'jurisdiction', newJurisdiction);
        // Force tax rate refresh from reference
        forceUpdateTaxRate(rowId);
        calculateRow(rowId);
        
        // Refresh all jurisdiction dropdowns to update disabled states
        refreshAllJurisdictionDropdowns();
    });
    
    // Total miles change - automatically mirror to taxable miles
    row.querySelector('.total-miles').addEventListener('input', (e) => {
        // Force positive whole numbers only
        let value = Math.round(parseFloat(e.target.value) || 0);
        if (value < 0) value = 0;
        e.target.value = value || '';
        
        console.log(`Total miles input for row ${rowId}: ${value}`);
        updateRowField(rowId, 'totalMiles', value);
        
        // Auto-mirror to taxable miles (always, unless user has manually edited)
        const rowData = appState.rows.find(r => r.id === rowId);
        if (!rowData) {
            console.error(`Row ${rowId} not found in appState.rows!`);
            return;
        }
        
        const taxableMilesInput = row.querySelector('.taxable-miles');
        
        // If taxable miles was same as total (or empty), keep them in sync
        if (!rowData.taxableMilesManuallyEdited || rowData.taxableMiles === rowData.totalMiles || !taxableMilesInput.value) {
            taxableMilesInput.value = value || '';
            updateRowField(rowId, 'taxableMiles', value);
            rowData.taxableMilesManuallyEdited = false;
            console.log(`Taxable miles mirrored to ${value} for row ${rowId}`);
        }
        
        calculateRow(rowId);
    });
    
    // Taxable miles change - mark as manually edited
    row.querySelector('.taxable-miles').addEventListener('input', (e) => {
        // Force positive whole numbers only
        let value = Math.round(parseFloat(e.target.value) || 0);
        if (value < 0) value = 0;
        e.target.value = value || '';
        
        const rowData = appState.rows.find(r => r.id === rowId);
        if (rowData) {
            rowData.taxableMilesManuallyEdited = true;
        }
        
        updateRowField(rowId, 'taxableMiles', value);
        calculateRow(rowId);
    });
    
    // Tax paid gallons change - whole numbers only
    row.querySelector('.tax-paid-gallons').addEventListener('input', (e) => {
        // Force positive whole numbers only
        let value = Math.round(parseFloat(e.target.value) || 0);
        if (value < 0) value = 0;
        e.target.value = value || '';
        
        updateRowField(rowId, 'taxPaidGallons', value);
        calculateRow(rowId);
    });
    
    // Prevent decimal input on number fields AND handle Enter key to add new row
    ['.total-miles', '.taxable-miles', '.tax-paid-gallons'].forEach(selector => {
        const input = row.querySelector(selector);
        if (input) {
            input.addEventListener('keydown', (e) => {
                // Block decimal point, comma, and minus sign
                if (e.key === '.' || e.key === ',' || e.key === '-') {
                    e.preventDefault();
                }
                // Enter key - validate and add new row
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleEnterKeyAddRow(rowId);
                }
            });
            // On blur, ensure positive whole number
            input.addEventListener('blur', (e) => {
                let value = Math.round(parseFloat(e.target.value) || 0);
                if (value < 0) value = 0;
                e.target.value = value || '';
            });
        }
    });
    
    // Also handle Enter on jurisdiction select
    row.querySelector('.jurisdiction-select').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleEnterKeyAddRow(rowId);
        }
    });
    
    // Delete row
    row.querySelector('.delete-row').addEventListener('click', () => {
        deleteRow(rowId);
    });
}

// Handle Enter key to validate current row and add new row
function handleEnterKeyAddRow(currentRowId) {
    const rowData = appState.rows.find(r => r.id === currentRowId);
    if (!rowData) return;
    
    // Validate current row has required data
    const errors = [];
    
    if (!rowData.jurisdiction) {
        errors.push('Jurisdiction is required');
    }
    
    if (!rowData.totalMiles || rowData.totalMiles <= 0) {
        errors.push('Total Miles must be greater than 0');
    }
    
    // Show errors if validation fails
    if (errors.length > 0) {
        showToast(errors.join('. '), 'error');
        
        // Focus on the first missing field
        const row = document.getElementById(`row-${currentRowId}`);
        if (row) {
            if (!rowData.jurisdiction) {
                row.querySelector('.jurisdiction-select').focus();
            } else if (!rowData.totalMiles || rowData.totalMiles <= 0) {
                row.querySelector('.total-miles').focus();
            }
        }
        return;
    }
    
    // Validation passed - add new row and focus on its jurisdiction select
    const newRowData = addNewRow();
    
    // Focus on the new row's jurisdiction dropdown
    setTimeout(() => {
        const newRow = document.getElementById(`row-${newRowData.id}`);
        if (newRow) {
            newRow.querySelector('.jurisdiction-select').focus();
        }
    }, 50);
    
    showToast('New row added', 'success');
}

// Force update tax rate from reference data - CRITICAL for accuracy
function forceUpdateTaxRate(rowId) {
    const rowData = appState.rows.find(r => r.id === rowId);
    if (!rowData) {
        console.warn(`forceUpdateTaxRate: Row ${rowId} not found in appState.rows`);
        return;
    }
    
    if (!rowData.jurisdiction) {
        rowData.taxRate = 0;
        console.log(`forceUpdateTaxRate: Row ${rowId} has no jurisdiction, rate set to 0`);
        return;
    }
    
    // ALWAYS get rate from reference - never allow manual override
    let taxRate = 0;
    if (typeof getValidatedTaxRate === 'function') {
        taxRate = getValidatedTaxRate(rowData.jurisdiction, appState.selectedFuelType);
        console.log(`forceUpdateTaxRate: Got rate ${taxRate} for ${rowData.jurisdiction}/${appState.selectedFuelType} via getValidatedTaxRate`);
    } else if (typeof getTaxRate === 'function') {
        taxRate = getTaxRate(rowData.jurisdiction, appState.selectedFuelType);
        console.log(`forceUpdateTaxRate: Got rate ${taxRate} for ${rowData.jurisdiction}/${appState.selectedFuelType} via getTaxRate`);
    } else {
        console.error('forceUpdateTaxRate: No tax rate function available!');
    }
    
    // Validate rate is reasonable
    if (typeof taxRate !== 'number' || isNaN(taxRate) || taxRate < 0 || taxRate > 2) {
        console.warn(`Invalid tax rate for ${rowData.jurisdiction}: ${taxRate}, defaulting to 0`);
        taxRate = 0;
    }
    
    rowData.taxRate = taxRate;
    console.log(`forceUpdateTaxRate: Row ${rowId} rate set to ${taxRate}`);
}

// Update a field in the row data
function updateRowField(rowId, field, value) {
    const rowData = appState.rows.find(r => r.id === rowId);
    if (rowData) {
        rowData[field] = value;
    }
}

// Calculate values for a single row - IFTA FORMULA
// This is the critical calculation that must be 100% accurate
function calculateRow(rowId) {
    console.log(`calculateRow called for row ${rowId}`);
    const rowData = appState.rows.find(r => r.id === rowId);
    if (!rowData) {
        console.error(`calculateRow: Row ${rowId} not found in appState.rows!`);
        console.log(`appState.rows IDs:`, appState.rows.map(r => r.id));
        return;
    }
    
    console.log(`calculateRow: Found row ${rowId}, data:`, JSON.stringify(rowData));
    
    try {
        // ==========================================
        // STEP 1: Sanitize and validate input values (whole numbers)
        // ==========================================
        rowData.totalMiles = Math.round(sanitizeNumber(rowData.totalMiles, 0, CONSTANTS.MAX_MILES));
        rowData.taxableMiles = Math.round(sanitizeNumber(rowData.taxableMiles, 0, CONSTANTS.MAX_MILES));
        rowData.taxPaidGallons = Math.round(sanitizeNumber(rowData.taxPaidGallons, 0, CONSTANTS.MAX_GALLONS));
        
        // Taxable miles cannot exceed total miles
        if (rowData.taxableMiles > rowData.totalMiles) {
            rowData.taxableMiles = rowData.totalMiles;
        }
        
        // ==========================================
        // STEP 2: Get TAX RATE from reference (NEVER allow manual input)
        // This is CRITICAL - rate must come from tax-rates.js
        // ==========================================
        let taxRate = 0;
        if (rowData.jurisdiction) {
            // Always use getValidatedTaxRate for bulletproof rate lookup
            if (typeof getValidatedTaxRate === 'function') {
                taxRate = getValidatedTaxRate(rowData.jurisdiction, appState.selectedFuelType);
            } else if (typeof getTaxRate === 'function') {
                taxRate = getTaxRate(rowData.jurisdiction, appState.selectedFuelType);
            }
            
            // Final validation - rate must be reasonable
            if (typeof taxRate !== 'number' || isNaN(taxRate) || taxRate < 0 || taxRate > 2) {
                console.error(`INVALID TAX RATE for ${rowData.jurisdiction}/${appState.selectedFuelType}: ${taxRate}`);
                taxRate = 0;
            }
        }
        rowData.taxRate = taxRate;
        
        // ==========================================
        // STEP 3: Calculate TAXABLE GALLONS
        // Formula: Taxable Miles ÷ Fleet MPG
        // ==========================================
        const mpg = Math.max(appState.fleetMpg, CONSTANTS.MIN_MPG);
        const rawTaxableGallons = rowData.taxableMiles / mpg;
        // Round to whole gallons for IFTA compliance
        rowData.taxableGallons = Math.round(rawTaxableGallons);
        
        // ==========================================
        // STEP 4: Calculate NET TAXABLE GALLONS
        // Formula: Taxable Gallons - Tax Paid Gallons
        // Can be negative (results in tax credit)
        // ==========================================
        rowData.netTaxableGallons = rowData.taxableGallons - rowData.taxPaidGallons;
        
        // ==========================================
        // STEP 5: Calculate TAX DUE
        // Formula: Net Taxable Gallons × Tax Rate
        // Positive = tax owed, Negative = tax credit
        // ==========================================
        let taxDue;
        if (typeof calculateTax === 'function') {
            taxDue = calculateTax(rowData.netTaxableGallons, rowData.taxRate);
        } else {
            taxDue = rowData.netTaxableGallons * rowData.taxRate;
        }
        // Round to 2 decimal places for currency
        rowData.taxDue = roundTo(taxDue, 2);
        
        console.log(`calculateRow: Final values for row ${rowId}: rate=${rowData.taxRate}, taxableGal=${rowData.taxableGallons}, netGal=${rowData.netTaxableGallons}, taxDue=${rowData.taxDue}`);
        
        // ==========================================
        // STEP 6: Update UI
        // ==========================================
        updateRowUI(rowId, rowData);
        updateTotals();
        
        console.log(`calculateRow: UI updated for row ${rowId}`);
        
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
    
    // Tax rate - display with 4 decimal places
    row.querySelector('.rate-display').textContent = formatRate(rowData.taxRate);
    
    // Taxable gallons - whole number
    row.querySelector('.taxable-gallons').textContent = formatWholeGallons(rowData.taxableGallons);
    
    // Net taxable gallons - whole number (can be negative)
    const netGallonsCell = row.querySelector('.net-taxable-gallons');
    netGallonsCell.textContent = formatWholeGallons(rowData.netTaxableGallons);
    netGallonsCell.className = `net-taxable-gallons ${rowData.netTaxableGallons >= 0 ? '' : 'negative'}`;
    
    // Tax due - currency format
    const taxCell = row.querySelector('.tax-amount');
    taxCell.textContent = formatCurrency(rowData.taxDue);
    taxCell.className = `tax-amount ${rowData.taxDue >= 0 ? 'positive' : 'negative'}`;
}

// Refresh all jurisdiction dropdowns to update disabled states
function refreshAllJurisdictionDropdowns() {
    const jurisdictions = getJurisdictionList();
    const usedJurisdictions = appState.rows
        .filter(r => r.jurisdiction)
        .map(r => r.jurisdiction);
    
    appState.rows.forEach(rowData => {
        const row = document.getElementById(`row-${rowData.id}`);
        if (!row) return;
        
        const select = row.querySelector('.jurisdiction-select');
        if (!select) return;
        
        // Build new options
        let jurisdictionOptions = '<option value="">Select...</option>';
        
        // US jurisdictions
        jurisdictionOptions += '<optgroup label="United States">';
        jurisdictions.filter(j => j.country === 'US').forEach(j => {
            const selected = rowData.jurisdiction === j.code ? 'selected' : '';
            // Disable if used in another row (but not this row)
            const isUsedElsewhere = usedJurisdictions.includes(j.code) && rowData.jurisdiction !== j.code;
            const disabled = isUsedElsewhere ? 'disabled' : '';
            const usedLabel = isUsedElsewhere ? ' (already added)' : '';
            jurisdictionOptions += `<option value="${j.code}" ${selected} ${disabled}>${j.name} (${j.code})${usedLabel}</option>`;
        });
        jurisdictionOptions += '</optgroup>';
        
        // Canadian jurisdictions
        jurisdictionOptions += '<optgroup label="Canada">';
        jurisdictions.filter(j => j.country === 'CAN').forEach(j => {
            const selected = rowData.jurisdiction === j.code ? 'selected' : '';
            const isUsedElsewhere = usedJurisdictions.includes(j.code) && rowData.jurisdiction !== j.code;
            const disabled = isUsedElsewhere ? 'disabled' : '';
            const usedLabel = isUsedElsewhere ? ' (already added)' : '';
            jurisdictionOptions += `<option value="${j.code}" ${selected} ${disabled}>${j.name} (${j.code})${usedLabel}</option>`;
        });
        jurisdictionOptions += '</optgroup>';
        
        select.innerHTML = jurisdictionOptions;
    });
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
    
    // Refresh dropdowns so deleted jurisdiction becomes available again
    refreshAllJurisdictionDropdowns();
    
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
    
    // Update table footer - use whole numbers for miles and gallons (with null checks)
    const totalMilesEl = document.getElementById('totalMiles');
    const totalTaxableMilesEl = document.getElementById('totalTaxableMiles');
    const totalGallonsEl = document.getElementById('totalGallons');
    const totalTaxableGallonsEl = document.getElementById('totalTaxableGallons');
    const totalNetGallonsEl = document.getElementById('totalNetGallons');
    
    if (totalMilesEl) totalMilesEl.textContent = formatNumber(Math.round(totalMiles));
    if (totalTaxableMilesEl) totalTaxableMilesEl.textContent = formatNumber(Math.round(totalTaxableMiles));
    if (totalGallonsEl) totalGallonsEl.textContent = formatNumber(Math.round(totalGallons));
    if (totalTaxableGallonsEl) totalTaxableGallonsEl.textContent = formatNumber(Math.round(totalTaxableGallons));
    if (totalNetGallonsEl) totalNetGallonsEl.textContent = formatNumber(Math.round(totalNetGallons));
    
    const totalTaxCell = document.getElementById('totalTax');
    if (totalTaxCell) {
        totalTaxCell.textContent = formatCurrency(roundTo(totalTax, 2));
        totalTaxCell.className = `tax-amount ${totalTax >= 0 ? 'positive' : 'negative'}`;
    }
    
    // Update summary cards
    const summaryMilesEl = document.getElementById('summaryMiles');
    const summaryGallonsEl = document.getElementById('summaryGallons');
    if (summaryMilesEl) summaryMilesEl.textContent = formatNumber(Math.round(totalMiles));
    if (summaryGallonsEl) summaryGallonsEl.textContent = formatNumber(Math.round(totalGallons));
    
    // Calculate and display Current MPG (from this report's data)
    const currentMpg = totalGallons > 0 ? totalMiles / totalGallons : 0;
    appState.currentMpg = currentMpg;
    
    // Update Current MPG display in config panel
    if (elements.currentMpgInput) {
        elements.currentMpgInput.value = totalGallons > 0 ? currentMpg.toFixed(2) : '—';
    }
    
    // Update summary bar MPG
    const summaryMpgEl = document.getElementById('summaryMpg');
    if (summaryMpgEl) summaryMpgEl.textContent = currentMpg > 0 ? currentMpg.toFixed(2) : '—';
    
    const summaryTax = document.getElementById('summaryTax');
    if (summaryTax) summaryTax.textContent = formatCurrency(roundTo(totalTax, 2));
}

// Update the rates reference table
function updateRatesTable() {
    const tbody = document.getElementById('ratesTableBody');
    if (!tbody) return;
    
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
            
            // Get valid jurisdiction codes
            const validJurisdictions = Object.keys(IFTA_TAX_RATES?.jurisdictions || {});
            let importedCount = 0;
            let skippedCount = 0;
            const skippedJurisdictions = [];
            
            // Skip header row
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const [jurisdiction, totalMiles, taxableMiles, taxPaidGallons] = 
                    line.split(',').map(s => s.trim());
                
                if (jurisdiction) {
                    const jurisdictionCode = jurisdiction.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
                    
                    // Validate jurisdiction code
                    if (validJurisdictions.length > 0 && !validJurisdictions.includes(jurisdictionCode)) {
                        skippedCount++;
                        if (!skippedJurisdictions.includes(jurisdiction)) {
                            skippedJurisdictions.push(jurisdiction);
                        }
                        continue;
                    }
                    
                    const rowData = addNewRow();
                    rowData.jurisdiction = jurisdictionCode;
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
                    importedCount++;
                }
            }
            
            // Show appropriate message
            if (skippedCount > 0) {
                showToast(`Imported ${importedCount} rows. Skipped ${skippedCount} invalid: ${skippedJurisdictions.join(', ')}`, 'warning');
            } else {
                showToast(`Imported ${importedCount} rows from CSV`, 'success');
            }
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
    // Check if base jurisdiction is selected
    if (!appState.baseJurisdiction) {
        showToast('Please select a Base Jurisdiction before exporting.', 'warning');
        elements.baseJurisdictionSelect.focus();
        return;
    }
    
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
    // Check if base jurisdiction is selected
    if (!appState.baseJurisdiction) {
        showToast('Please select a Base Jurisdiction before exporting.', 'warning');
        elements.baseJurisdictionSelect.focus();
        return;
    }
    
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
    // Check if base jurisdiction is selected
    if (!appState.baseJurisdiction) {
        showToast('Please select a Base Jurisdiction before exporting.', 'warning');
        elements.baseJurisdictionSelect.focus();
        return;
    }
    
    // Check if there's data to export
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (dataRows.length === 0) {
        showToast('No data to export. Please add some trip data first.', 'warning');
        return;
    }
    
    // Show the export options modal
    const modal = document.getElementById('exportPdfModal');
    if (modal) {
        modal.classList.remove('hidden');
        
        // Setup event listeners for the modal (only once)
        if (!modal.dataset.initialized) {
            document.getElementById('closeExportPdfModal')?.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
            document.getElementById('cancelExportPdf')?.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
            document.getElementById('confirmExportPdf')?.addEventListener('click', () => {
                modal.classList.add('hidden');
                generatePdfWithOptions();
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.add('hidden');
            });
            modal.dataset.initialized = 'true';
        }
    } else {
        // Fallback if modal not found - export with defaults
        generatePdfWithOptions();
    }
}

// Generate PDF with selected options
function generatePdfWithOptions() {
    const options = {
        includeUnitNumber: document.getElementById('pdfIncludeUnitNumber')?.checked ?? true,
        includeFleetMpg: document.getElementById('pdfIncludeFleetMpg')?.checked ?? true,
        includeCurrentMpg: document.getElementById('pdfIncludeCurrentMpg')?.checked ?? true,
        includeTaxRates: document.getElementById('pdfIncludeTaxRates')?.checked ?? false,
        includeSummary: document.getElementById('pdfIncludeSummary')?.checked ?? true
    };
    
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    
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
        
        let infoY = 35;
        const col1X = 14;
        const col2X = 110;
        
        // Build info rows based on options
        doc.setFont(undefined, 'bold');
        doc.text('Quarter:', col1X, infoY);
        doc.setFont(undefined, 'normal');
        doc.text(formatQuarterDisplay(appState.selectedQuarter), col1X + 30, infoY);
        
        doc.setFont(undefined, 'bold');
        doc.text('Fuel Type:', col1X, infoY + 6);
        doc.setFont(undefined, 'normal');
        doc.text(appState.selectedFuelType.charAt(0).toUpperCase() + appState.selectedFuelType.slice(1), col1X + 30, infoY + 6);
        
        let row = 2;
        
        if (options.includeFleetMpg) {
            doc.setFont(undefined, 'bold');
            doc.text('Fleet MPG:', col1X, infoY + (row * 6));
            doc.setFont(undefined, 'normal');
            doc.text(String(appState.fleetMpg), col1X + 30, infoY + (row * 6));
            row++;
        }
        
        if (options.includeCurrentMpg && appState.currentMpg > 0) {
            doc.setFont(undefined, 'bold');
            doc.text('Current MPG:', col1X, infoY + (row * 6));
            doc.setFont(undefined, 'normal');
            doc.text(appState.currentMpg.toFixed(2), col1X + 30, infoY + (row * 6));
            row++;
        }
        
        // Right column
        doc.setFont(undefined, 'bold');
        doc.text('Base Jurisdiction:', col2X, infoY);
        doc.setFont(undefined, 'normal');
        doc.text(appState.baseJurisdiction, col2X + 40, infoY);
        
        doc.setFont(undefined, 'bold');
        doc.text('Report Date:', col2X, infoY + 6);
        doc.setFont(undefined, 'normal');
        doc.text(new Date().toLocaleDateString(), col2X + 40, infoY + 6);
        
        if (options.includeUnitNumber && appState.unitNumber) {
            doc.setFont(undefined, 'bold');
            doc.text('Unit #:', col2X, infoY + 12);
            doc.setFont(undefined, 'normal');
            doc.text(appState.unitNumber, col2X + 40, infoY + 12);
        }
        
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
        
        // Calculate table start Y based on info rows
        const tableStartY = infoY + (Math.max(row, 3) * 6) + 10;
        
        // Create table
        doc.autoTable({
            startY: tableStartY,
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
        
        let finalY = doc.lastAutoTable.finalY + 10;
        
        // Add Summary Section if enabled
        if (options.includeSummary) {
            doc.setFontSize(12);
            doc.setTextColor(...primaryColor);
            doc.text('Summary', 14, finalY);
            finalY += 6;
            
            doc.setFontSize(9);
            doc.setTextColor(80, 80, 80);
            doc.text(`Total Jurisdictions: ${dataRows.length}`, 14, finalY);
            doc.text(`Total Miles: ${formatNumber(totals.miles)}`, 80, finalY);
            finalY += 5;
            doc.text(`Total Tax Paid Gallons: ${formatGallons(totals.gallons)}`, 14, finalY);
            doc.text(`Net Tax: ${formatCurrency(totals.tax)}`, 80, finalY);
            finalY += 10;
        }
        
        // Add Tax Rates Reference Table if enabled
        if (options.includeTaxRates) {
            // Check if we need a new page
            if (finalY > 200) {
                doc.addPage();
                finalY = 20;
            }
            
            doc.setFontSize(12);
            doc.setTextColor(...primaryColor);
            doc.text('Tax Rates Reference', 14, finalY);
            finalY += 6;
            
            // Build rates table data
            const ratesData = [];
            const jurisdictions = Object.keys(IFTA_TAX_RATES.jurisdictions).sort();
            jurisdictions.forEach(code => {
                const j = IFTA_TAX_RATES.jurisdictions[code];
                ratesData.push([
                    `${j.name} (${code})`,
                    formatRate(j.rates.diesel),
                    formatRate(j.rates.gasoline),
                    formatRate(j.rates.propane)
                ]);
            });
            
            doc.autoTable({
                startY: finalY,
                head: [['Jurisdiction', 'Diesel', 'Gasoline', 'Propane']],
                body: ratesData,
                theme: 'striped',
                headStyles: {
                    fillColor: [100, 100, 100],
                    textColor: 255,
                    fontSize: 8
                },
                bodyStyles: {
                    fontSize: 7
                },
                columnStyles: {
                    0: { cellWidth: 60 },
                    1: { halign: 'right', cellWidth: 25 },
                    2: { halign: 'right', cellWidth: 25 },
                    3: { halign: 'right', cellWidth: 25 }
                },
                margin: { left: 14, right: 14 }
            });
            
            finalY = doc.lastAutoTable.finalY + 10;
        }
        
        // Footer
        if (finalY > 270) {
            doc.addPage();
            finalY = 20;
        }
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text('Generated by IFTA Wizard | Tax rates sourced from IFTA, Inc.', 14, finalY);
        doc.text('Disclaimer: This report is for estimation purposes only. Verify all rates with official sources before filing.', 14, finalY + 4);
        
        // Save the PDF
        const timestamp = new Date().toISOString().slice(0, 10);
        const unitSuffix = appState.unitNumber ? `-Unit${appState.unitNumber}` : '';
        const filename = `IFTA-Report-${appState.selectedQuarter.replace(' ', '-')}${unitSuffix}-${timestamp}.pdf`;
        doc.save(filename);
        
        showToast('PDF downloaded successfully!', 'success');
        
    } catch (error) {
        console.error('PDF export error:', error);
        showToast('Error generating PDF. Please try again.', 'error');
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
                
                data.rows.forEach(savedRowData => {
                    // addNewRow now handles everything including adding to appState.rows
                    const newRow = addNewRow(savedRowData);
                    
                    // Update UI inputs
                    const rowElement = document.getElementById(`row-${newRow.id}`);
                    if (rowElement) {
                        rowElement.querySelector('.jurisdiction-select').value = newRow.jurisdiction || '';
                        rowElement.querySelector('.total-miles').value = newRow.totalMiles || '';
                        rowElement.querySelector('.taxable-miles').value = newRow.taxableMiles || '';
                        rowElement.querySelector('.tax-paid-gallons').value = newRow.taxPaidGallons || '';
                    }
                    
                    // Recalculate to ensure tax rate and values are correct
                    forceUpdateTaxRate(newRow.id);
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
