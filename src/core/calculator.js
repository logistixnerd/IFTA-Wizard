// src/core/calculator.js
// Pure IFTA math — zero DOM access, zero window/global references.
// Every function is a deterministic transformation: same inputs → same output.
// Callers own all state mutations and UI updates.

// ── Constants (local so this file has no imports) ──────────────────────────

const MAX_MILES   = 1_000_000;
const MAX_GALLONS = 100_000;
const MIN_MPG     = 1;
const MAX_MPG     = 20;
const MAX_RATE    = 2.0;   // $2.00/gal — sanity ceiling for IFTA rates

// ── Low-level helpers ──────────────────────────────────────────────────────

/**
 * Clamp a numeric value to [min, max].  Non-numeric input returns min.
 */
export function sanitizeNumber(value, min = 0, max = Infinity) {
    const n = parseFloat(value);
    if (!isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

/**
 * Round num to a fixed number of decimal places using the "round half away
 * from zero" rule (avoids the floating-point drift of toFixed).
 */
export function roundTo(num, decimals) {
    const factor = 10 ** decimals;
    return Math.round(num * factor) / factor;
}

// ── Display helper ─────────────────────────────────────────────────────────

/**
 * Determine the amount to display for tax due, accounting for jurisdictions
 * that only allow a carry-forward credit (never issue a cash refund).
 *
 * @param {number} taxDue       Raw calculated tax due (may be negative = credit).
 * @param {string} jurisdiction Two-letter jurisdiction code, e.g. "TX".
 * @param {object} taxRates     The IFTA_TAX_RATES data object from tax-rates.js.
 * @returns {number}
 */
export function getDisplayTaxDue(taxDue, jurisdiction, taxRates) {
    if (taxDue >= 0) return taxDue;                                      // tax owed — always show
    const jData = taxRates?.jurisdictions?.[jurisdiction];
    if (jData?.refundPolicy === 'credit') return 0;                     // credit-only — show $0
    return taxDue;                                                       // refund available — show credit
}

// ── Row calculation ────────────────────────────────────────────────────────

/**
 * Calculate all derived values for one IFTA row.
 *
 * @param {object} params
 * @param {number} params.totalMiles
 * @param {number} params.taxableMiles
 * @param {number} params.taxPaidGallons
 * @param {number} params.taxRate         Already-validated rate from tax-rates.js.
 * @param {number} params.fleetMpg        Fleet average MPG.
 * @param {string} params.jurisdiction    Two-letter code; used for getDisplayTaxDue.
 * @param {object} params.taxRates        Full IFTA_TAX_RATES object.
 * @returns {object} Plain object with all computed fields.
 */
export function calculateRowValues({
    totalMiles,
    taxableMiles,
    taxPaidGallons,
    taxRate = 0,
    fleetMpg,
    jurisdiction,
    taxRates
}) {
    // 1. Sanitize — whole numbers only, bounded to sensible maxima
    const safeTotalMiles     = Math.round(sanitizeNumber(totalMiles,    0, MAX_MILES));
    const rawTaxableMiles    = Math.round(sanitizeNumber(taxableMiles,  0, MAX_MILES));
    const safeTaxPaidGallons = Math.round(sanitizeNumber(taxPaidGallons,0, MAX_GALLONS));
    const safeMpg            = sanitizeNumber(fleetMpg, MIN_MPG, MAX_MPG) || MIN_MPG;

    // 2. Taxable miles cannot exceed total miles
    const safeTaxableMiles = Math.min(rawTaxableMiles, safeTotalMiles);

    // 3. Validate rate — must be a real number in [0, MAX_RATE]
    const safeRate = (
        typeof taxRate === 'number' &&
        isFinite(taxRate) &&
        taxRate >= 0 &&
        taxRate <= MAX_RATE
    ) ? taxRate : 0;

    // 4. IFTA formula — all intermediate values are whole gallons per spec
    //    Taxable Gallons = Taxable Miles ÷ Fleet MPG  (rounded)
    const taxableGallons    = Math.round(safeTaxableMiles / safeMpg);

    //    Net Taxable Gallons = Taxable Gallons − Tax Paid Gallons  (can be negative → credit)
    const netTaxableGallons = taxableGallons - safeTaxPaidGallons;

    //    Tax Due = Net Taxable Gallons × Rate  (rounded to cents)
    const taxDue            = roundTo(netTaxableGallons * safeRate, 2);

    //    Display tax — $0 for credit-only states
    const displayTaxDue     = getDisplayTaxDue(taxDue, jurisdiction, taxRates);

    return {
        totalMiles:        safeTotalMiles,
        taxableMiles:      safeTaxableMiles,
        taxPaidGallons:    safeTaxPaidGallons,
        taxRate:           safeRate,
        taxableGallons,
        netTaxableGallons,
        taxDue,
        displayTaxDue
    };
}

// ── Totals aggregation ─────────────────────────────────────────────────────

/**
 * Sum all rows into a totals object.
 *
 * @param {Array<object>} rows     Array of row objects that already contain
 *                                 the computed fields from calculateRowValues.
 * @param {object}        taxRates Full IFTA_TAX_RATES object (for refundPolicy).
 * @returns {object} Plain totals object.
 */
export function calculateTotals(rows, taxRates) {
    let totalMiles          = 0;
    let totalTaxableMiles   = 0;
    let totalGallons        = 0;
    let totalTaxableGallons = 0;
    let totalNetGallons     = 0;
    let totalTax            = 0;

    for (const row of rows) {
        totalMiles          += row.totalMiles          || 0;
        totalTaxableMiles   += row.taxableMiles        || 0;
        totalGallons        += row.taxPaidGallons      || 0;
        totalTaxableGallons += row.taxableGallons      || 0;
        totalNetGallons     += row.netTaxableGallons   || 0;
        // Use display tax so credit-only states contribute $0, not a negative
        totalTax            += getDisplayTaxDue(row.taxDue || 0, row.jurisdiction, taxRates);
    }

    const currentMpg = totalGallons > 0 ? totalMiles / totalGallons : 0;

    return {
        totalMiles:          Math.round(totalMiles),
        totalTaxableMiles:   Math.round(totalTaxableMiles),
        totalGallons:        Math.round(totalGallons),
        totalTaxableGallons: Math.round(totalTaxableGallons),
        totalNetGallons:     Math.round(totalNetGallons),
        totalTax:            roundTo(totalTax, 2),
        currentMpg                                             // raw float — caller rounds for display
    };
}

