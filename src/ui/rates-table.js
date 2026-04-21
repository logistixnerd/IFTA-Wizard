// src/ui/rates-table.js
// Manages the tax-rates reference table and its search/filter UI.

import { formatRate } from '../core/formatters.js';
import { getJurisdictionList, getIftaTaxRates } from '../core/tax-utils.js';

export function updateRatesTable() {
    const tbody = document.getElementById('ratesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const IFTA_TAX_RATES = getIftaTaxRates();
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

    const erEl = document.getElementById('exchangeRate');
    if (erEl) erEl.textContent =
        `Exchange Rate: US ${IFTA_TAX_RATES.exchangeRate.usToCanada} / CAN ${IFTA_TAX_RATES.exchangeRate.canadaToUs}`;

    const luEl = document.getElementById('lastUpdated');
    if (luEl) luEl.textContent = `Last Updated: ${IFTA_TAX_RATES.lastUpdated}`;
}

export function filterRatesTable() {
    const searchTerm = document.getElementById('ratesSearch').value.toLowerCase();
    const countryFilter = document.getElementById('countryFilter').value;

    document.querySelectorAll('#ratesTableBody tr').forEach(row => {
        const name = row.cells[0].textContent.toLowerCase();
        const country = row.cells[1].textContent;
        const matchesSearch  = name.includes(searchTerm);
        const matchesCountry = countryFilter === 'all' || country === countryFilter;
        row.style.display = matchesSearch && matchesCountry ? '' : 'none';
    });
}

export function updateRateStatus(status, text) {
    const statusEl = document.getElementById('rateStatus');
    if (statusEl) {
        statusEl.className = `rate-status ${status}`;
        statusEl.querySelector('.status-text').textContent = text;
    }
}
