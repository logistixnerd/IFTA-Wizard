// IFTA Tax Rates - Q4 2025 (Official IFTACH Rates)
// Source: https://www.iftach.org/taxmatrix4/TaxDownload.php
// Effective: October 1, 2025 - December 31, 2025
// Exchange Rate for Canadian Provinces: 1.4335 (as specified by IFTACH for Q4 2025)

const IFTA_TAX_RATES = {
    jurisdictions: {
        // United States - Official Q4 2025 IFTACH Rates
        "AL": { name: "Alabama", diesel: 0.3100, gasoline: 0.2900 },
        "AZ": { name: "Arizona", diesel: 0.2600, gasoline: 0.1800 },
        "AR": { name: "Arkansas", diesel: 0.2850, gasoline: 0.2450 },
        "CA": { name: "California", diesel: 0.9710, gasoline: 0.6510 },
        "CO": { name: "Colorado", diesel: 0.3250, gasoline: 0.2200 },
        "CT": { name: "Connecticut", diesel: 0.4890, gasoline: 0.2500 },
        "DE": { name: "Delaware", diesel: 0.2200, gasoline: 0.2300 },
        "FL": { name: "Florida", diesel: 0.4027, gasoline: 0.3777 },
        "GA": { name: "Georgia", diesel: 0.3710, gasoline: 0.3510 },
        "ID": { name: "Idaho", diesel: 0.3800, gasoline: 0.3300 },
        "IL": { name: "Illinois", diesel: 0.7490, gasoline: 0.5670 },
        "IN": { name: "Indiana", diesel: 0.6100, gasoline: 0.5000 },
        "IA": { name: "Iowa", diesel: 0.3250, gasoline: 0.3000 },
        "KS": { name: "Kansas", diesel: 0.2600, gasoline: 0.2400 },
        "KY": { name: "Kentucky", diesel: 0.3250, gasoline: 0.2870 },
        "LA": { name: "Louisiana", diesel: 0.2000, gasoline: 0.2000 },
        "ME": { name: "Maine", diesel: 0.3420, gasoline: 0.3020 },
        "MD": { name: "Maryland", diesel: 0.4175, gasoline: 0.4700 },
        "MA": { name: "Massachusetts", diesel: 0.2540, gasoline: 0.2400 },
        "MI": { name: "Michigan", diesel: 0.5070, gasoline: 0.3230 },
        "MN": { name: "Minnesota", diesel: 0.2850, gasoline: 0.2850 },
        "MS": { name: "Mississippi", diesel: 0.1800, gasoline: 0.1800 },
        "MO": { name: "Missouri", diesel: 0.2200, gasoline: 0.2200 },
        "MT": { name: "Montana", diesel: 0.3295, gasoline: 0.3300 },
        "NE": { name: "Nebraska", diesel: 0.2990, gasoline: 0.2990 },
        "NV": { name: "Nevada", diesel: 0.2800, gasoline: 0.2300 },
        "NH": { name: "New Hampshire", diesel: 0.2340, gasoline: 0.2200 },
        "NJ": { name: "New Jersey", diesel: 0.5190, gasoline: 0.3700 },
        "NM": { name: "New Mexico", diesel: 0.2438, gasoline: 0.1875 },
        "NY": { name: "New York", diesel: 0.1770, gasoline: 0.0800 },
        "NC": { name: "North Carolina", diesel: 0.4080, gasoline: 0.4080 },
        "ND": { name: "North Dakota", diesel: 0.2300, gasoline: 0.2300 },
        "OH": { name: "Ohio", diesel: 0.4700, gasoline: 0.3850 },
        "OK": { name: "Oklahoma", diesel: 0.1900, gasoline: 0.2000 },
        "OR": { name: "Oregon", diesel: 0.0000, gasoline: 0.4000 },
        "PA": { name: "Pennsylvania", diesel: 0.7410, gasoline: 0.5830 },
        "RI": { name: "Rhode Island", diesel: 0.3400, gasoline: 0.3400 },
        "SC": { name: "South Carolina", diesel: 0.2800, gasoline: 0.2800 },
        "SD": { name: "South Dakota", diesel: 0.2800, gasoline: 0.2800 },
        "TN": { name: "Tennessee", diesel: 0.2700, gasoline: 0.2600 },
        "TX": { name: "Texas", diesel: 0.2000, gasoline: 0.2000 },
        "UT": { name: "Utah", diesel: 0.3350, gasoline: 0.3150 },
        "VT": { name: "Vermont", diesel: 0.3400, gasoline: 0.2620 },
        "VA": { name: "Virginia", diesel: 0.4700, gasoline: 0.3020 },
        "WA": { name: "Washington", diesel: 0.5840, gasoline: 0.4940 },
        "WV": { name: "West Virginia", diesel: 0.3570, gasoline: 0.3570 },
        "WI": { name: "Wisconsin", diesel: 0.3090, gasoline: 0.3090 },
        "WY": { name: "Wyoming", diesel: 0.2400, gasoline: 0.2400 },
        
        // Canadian Provinces - Official Q4 2025 IFTACH Rates (USD equivalent)
        "AB": { name: "Alberta", diesel: 0.0935, gasoline: 0.0935 },
        "BC": { name: "British Columbia", diesel: 0.2267, gasoline: 0.1999 },
        "MB": { name: "Manitoba", diesel: 0.0978, gasoline: 0.0978 },
        "NB": { name: "New Brunswick", diesel: 0.1934, gasoline: 0.1170 },
        "NL": { name: "Newfoundland", diesel: 0.2288, gasoline: 0.1659 },
        "NS": { name: "Nova Scotia", diesel: 0.1100, gasoline: 0.1100 },
        "ON": { name: "Ontario", diesel: 0.1017, gasoline: 0.0967 },
        "PE": { name: "Prince Edward Island", diesel: 0.1449, gasoline: 0.0966 },
        "QC": { name: "Quebec", diesel: 0.1456, gasoline: 0.1353 },
        "SK": { name: "Saskatchewan", diesel: 0.1050, gasoline: 0.1050 },
        "NT": { name: "Northwest Territories", diesel: 0.0635, gasoline: 0.0740 },
        "NU": { name: "Nunavut", diesel: 0.0635, gasoline: 0.0640 },
        "YT": { name: "Yukon", diesel: 0.0527, gasoline: 0.0473 }
    },
    
    // Function to get tax rate for a jurisdiction and fuel type
    getTaxRate: function(jurisdiction, fuelType = 'diesel') {
        const j = this.jurisdictions[jurisdiction.toUpperCase()];
        if (!j) return null;
        return fuelType.toLowerCase() === 'gasoline' ? j.gasoline : j.diesel;
    },
    
    // Get all jurisdiction codes
    getJurisdictionCodes: function() {
        return Object.keys(this.jurisdictions);
    },
    
    // Get jurisdiction name
    getJurisdictionName: function(code) {
        const j = this.jurisdictions[code.toUpperCase()];
        return j ? j.name : null;
    },
    
    // Check if jurisdiction exists
    hasJurisdiction: function(code) {
        return this.jurisdictions.hasOwnProperty(code.toUpperCase());
    }
};

// Historical quarterly rates for reference and reporting
// IMPORTANT: Oregon uses weight-mile tax system, diesel rate is $0.00 for IFTA
const QUARTERLY_RATE_HISTORY = {
    "2025-Q4": {
        effectiveDate: "2025-10-01",
        endDate: "2025-12-31",
        exchangeRate: 1.4335,
        source: "IFTACH Official Tax Matrix",
        notes: "Oregon diesel is $0.00 - weight-mile tax state. KY includes $0.105 surcharge. VA includes $0.143 surcharge."
    },
    "2025-Q3": {
        effectiveDate: "2025-07-01",
        endDate: "2025-09-30",
        exchangeRate: 1.4312,
        source: "IFTACH Official Tax Matrix"
    },
    "2025-Q2": {
        effectiveDate: "2025-04-01",
        endDate: "2025-06-30",
        exchangeRate: 1.4312,
        source: "IFTACH Official Tax Matrix"
    },
    "2025-Q1": {
        effectiveDate: "2025-01-01",
        endDate: "2025-03-31",
        exchangeRate: 1.4312,
        source: "IFTACH Official Tax Matrix"
    }
};

// Special jurisdiction notes
const JURISDICTION_NOTES = {
    "OR": "Oregon uses weight-mile tax system. Diesel rate is $0.00 for IFTA reporting. Separate weight-mile taxes apply.",
    "KY": "Rate includes base tax of $0.2200 plus $0.1050 surtax = $0.3250 total for diesel.",
    "VA": "Rate includes base tax of $0.3270 plus $0.1430 surcharge = $0.4700 total for diesel.",
    "IN": "Additional $.05 surcharge applies to propane and LNG.",
    "CA": "California Special Diesel rate. Prepaid sales tax may also apply.",
    "NY": "Rate shown is state portion only. Additional carrier tax may apply.",
    "PA": "Pennsylvania Oil Company Franchise Tax rate."
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IFTA_TAX_RATES, QUARTERLY_RATE_HISTORY, JURISDICTION_NOTES };
}
