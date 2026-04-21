// src/core/tax-utils.js
// Re-exports the tax-rates globals defined in tax-rates.js (loaded as a non-module
// <script> before src/main.js) so ES module code can import them by name.
// This avoids duplicating the 1 500-line data file.

export function getJurisdictionList()                           { return window.getJurisdictionList(); }
export function getTaxRate(code, fuel, quarter)                  { return window.getTaxRate(code, fuel, quarter); }
export function getValidatedTaxRate(code, fuel, quarter)         { return window.getValidatedTaxRate(code, fuel, quarter); }
export function calculateTax(netGallons, rate)                   { return window.calculateTax(netGallons, rate); }
export function setActiveQuarter(quarter)                        { return window.setActiveQuarter(quarter); }
export function getActiveQuarter()                               { return window.getActiveQuarter(); }
export function verifyCalculation(miles, mpg, gallons, rate)     { return window.verifyCalculation(miles, mpg, gallons, rate); }

// The data object itself is referenced directly in several modules.
// Use a getter so it resolves after the script tag has run.
export function getIftaTaxRates() { return window.IFTA_TAX_RATES; }
