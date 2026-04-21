// src/core/formatters.js
// Pure display-formatting helpers. No dependencies.

export function formatWholeGallons(value) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    return Math.round(value).toLocaleString();
}

export function formatNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return Math.round(num).toLocaleString();
}

export function formatGallons(num) {
    if (typeof num !== 'number' || isNaN(num)) return '0.000';
    return num.toFixed(3);
}

export function formatCurrency(num) {
    if (typeof num !== 'number' || isNaN(num)) return '$0.00';
    const prefix = num < 0 ? '-' : '';
    return prefix + '$' + Math.abs(num).toFixed(2);
}

export function formatRate(rate) {
    if (typeof rate !== 'number' || isNaN(rate) || rate === 0) return '—';
    return '$' + rate.toFixed(4);
}

export function formatQuarterDisplay(quarter) {
    if (/^Q[1-4] \d{4}$/.test(quarter)) return quarter;
    const match = quarter.match(/(\d)Q(\d{4})/);
    if (match) return `Q${match[1]} ${match[2]}`;
    return quarter;
}
