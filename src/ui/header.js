// src/ui/header.js
// Populates the quarter dropdown and the base-jurisdiction dropdown.

import { appState } from '../core/state.js';
import { getJurisdictionList } from '../core/tax-utils.js';

export function populateQuarterDropdown() {
    const select = document.getElementById('quarterSelect');
    if (!select) return;

    // Sync from header dropdown if already populated by auth.js
    const headerSelect = document.getElementById('headerQuarterSelect');
    if (headerSelect && headerSelect.options.length > 0) {
        select.innerHTML = headerSelect.innerHTML;
        select.value = headerSelect.value;
        appState.selectedQuarter = headerSelect.value;
        return;
    }

    // Fallback: build dropdown from current date
    select.innerHTML = '';
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentQuarter = Math.ceil(currentMonth / 3);

    for (let i = 0; i < 9; i++) {
        let q = currentQuarter - (i % 4);
        let y = currentYear - Math.floor(i / 4);
        if (q <= 0) { q += 4; y -= 1; }
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

export function populateJurisdictionDropdowns() {
    const jurisdictions = getJurisdictionList();
    const baseSelect = document.getElementById('baseJurisdiction');
    if (!baseSelect) return;

    baseSelect.innerHTML = '';

    const selectOption = document.createElement('option');
    selectOption.value = '';
    selectOption.textContent = 'Select...';
    baseSelect.appendChild(selectOption);

    const usGroup = document.createElement('optgroup');
    usGroup.label = 'United States';
    jurisdictions.filter(j => j.country === 'US').forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.code;
        opt.textContent = `${j.name} (${j.code})`;
        usGroup.appendChild(opt);
    });
    baseSelect.appendChild(usGroup);

    const canGroup = document.createElement('optgroup');
    canGroup.label = 'Canada';
    jurisdictions.filter(j => j.country === 'CAN').forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.code;
        opt.textContent = `${j.name} (${j.code})`;
        canGroup.appendChild(opt);
    });
    baseSelect.appendChild(canGroup);

    baseSelect.value = appState.baseJurisdiction || '';
}
