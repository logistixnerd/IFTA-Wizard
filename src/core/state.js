// src/core/state.js
// Singleton application state and the one pure state-mutation helper.
// All modules import appState by reference — mutations are live.

export const appState = {
    rows: [],
    unitNumber: '',
    selectedFuelType: 'diesel',
    selectedQuarter: (() => {
        const d = new Date(), q = Math.ceil((d.getMonth() + 1) / 3);
        return `Q${q} ${d.getFullYear()}`;
    })(),
    baseJurisdiction: '',
    fleetMpg: 6.5,
    currentMpg: 0,
    rowIdCounter: 0,
    isInitialized: false
};

// DOM element references — populated by main.js → initializeElements()
export const elements = {
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

// Pure state mutation — no DOM side effects.
export function updateRowField(rowId, field, value) {
    const rowData = appState.rows.find(r => r.id === rowId);
    if (rowData) rowData[field] = value;
}
