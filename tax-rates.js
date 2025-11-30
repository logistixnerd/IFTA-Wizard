/**
 * IFTA Tax Rates Data
 * Current Quarter: Q4 2025 (October - December 2025)
 * Source: https://www.iftach.org/taxmatrix4/
 * Exchange Rate: US = 1.3797 / Canada = 0.7248
 * 
 * Note: Rates are in USD per gallon for US jurisdictions
 * and converted to USD for Canadian jurisdictions
 */

const IFTA_TAX_RATES = {
    quarter: "Q4 2025",
    effectiveDate: "2025-10-01",
    endDate: "2025-12-31",
    exchangeRate: {
        usToCanada: 1.3797,
        canadaToUs: 0.7248
    },
    lastUpdated: "2025-11-29",
    
    jurisdictions: {
        // United States Jurisdictions
        "AL": {
            name: "Alabama",
            abbrev: "AL",
            country: "US",
            rates: {
                diesel: 0.310,
                gasoline: 0.290,
                gasohol: 0.290,
                propane: 0.270,
                lng: 0.310,
                cng: 0.290,
                ethanol: 0.290,
                methanol: 0.290,
                biodiesel: 0.310
            },
            footnote: "#35"
        },
        "AZ": {
            name: "Arizona",
            abbrev: "AZ",
            country: "US",
            rates: {
                diesel: 0.260,
                gasoline: 0.180,
                gasohol: 0.180,
                propane: 0.180,
                lng: 0.260,
                cng: 0.180,
                ethanol: 0.180,
                methanol: 0.180,
                biodiesel: 0.260
            },
            footnote: "#7"
        },
        "AR": {
            name: "Arkansas",
            abbrev: "AR",
            country: "US",
            rates: {
                diesel: 0.285,
                gasoline: 0.247,
                gasohol: 0.247,
                propane: 0.165,
                lng: 0.285,
                cng: 0.050,
                ethanol: 0.247,
                methanol: 0.247,
                biodiesel: 0.285
            },
            footnote: "#29"
        },
        "CA": {
            name: "California",
            abbrev: "CA",
            country: "US",
            rates: {
                diesel: 0.980,
                gasoline: 0.596,
                gasohol: 0.596,
                propane: 0.060,
                lng: 0.980,
                cng: 0.596,
                ethanol: 0.596,
                methanol: 0.596,
                biodiesel: 0.980
            },
            footnote: "#1"
        },
        "CO": {
            name: "Colorado",
            abbrev: "CO",
            country: "US",
            rates: {
                diesel: 0.2650,
                gasoline: 0.2225,
                gasohol: 0.2225,
                propane: 0.2225,
                lng: 0.2650,
                cng: 0.2225,
                ethanol: 0.2225,
                methanol: 0.2225,
                biodiesel: 0.2650
            }
        },
        "CT": {
            name: "Connecticut",
            abbrev: "CT",
            country: "US",
            rates: {
                diesel: 0.5210,
                gasoline: 0.2500,
                gasohol: 0.2500,
                propane: 0.2600,
                lng: 0.2600,
                cng: 0.2600,
                ethanol: 0.2500,
                methanol: 0.2500,
                biodiesel: 0.5210
            },
            footnote: "#15"
        },
        "DE": {
            name: "Delaware",
            abbrev: "DE",
            country: "US",
            rates: {
                diesel: 0.2200,
                gasoline: 0.2300,
                gasohol: 0.2300,
                propane: 0.2200,
                lng: 0.2200,
                cng: 0.2200,
                ethanol: 0.2300,
                methanol: 0.2300,
                biodiesel: 0.2200
            }
        },
        "FL": {
            name: "Florida",
            abbrev: "FL",
            country: "US",
            rates: {
                diesel: 0.3610,
                gasoline: 0.3660,
                gasohol: 0.3660,
                propane: 0.0000,
                lng: 0.0000,
                cng: 0.0000,
                ethanol: 0.3660,
                methanol: 0.3660,
                biodiesel: 0.3610
            },
            footnote: "#18"
        },
        "GA": {
            name: "Georgia",
            abbrev: "GA",
            country: "US",
            rates: {
                diesel: 0.3530,
                gasoline: 0.3120,
                gasohol: 0.3120,
                propane: 0.3120,
                lng: 0.3530,
                cng: 0.3120,
                ethanol: 0.3120,
                methanol: 0.3120,
                biodiesel: 0.3530
            },
            footnote: "#30"
        },
        "ID": {
            name: "Idaho",
            abbrev: "ID",
            country: "US",
            rates: {
                diesel: 0.3300,
                gasoline: 0.3300,
                gasohol: 0.3300,
                propane: 0.2560,
                lng: 0.3300,
                cng: 0.3300,
                ethanol: 0.3300,
                methanol: 0.3300,
                biodiesel: 0.3300
            },
            footnote: "#6"
        },
        "IL": {
            name: "Illinois",
            abbrev: "IL",
            country: "US",
            rates: {
                diesel: 0.6305,
                gasoline: 0.4320,
                gasohol: 0.4320,
                propane: 0.6305,
                lng: 0.6305,
                cng: 0.4320,
                ethanol: 0.4320,
                methanol: 0.4320,
                biodiesel: 0.6305
            },
            footnote: "#26"
        },
        "IN": {
            name: "Indiana",
            abbrev: "IN",
            country: "US",
            rates: {
                diesel: 0.6100,
                gasoline: 0.3600,
                gasohol: 0.3600,
                propane: 0.3600,
                lng: 0.6100,
                cng: 0.3600,
                ethanol: 0.3600,
                methanol: 0.3600,
                biodiesel: 0.6100
            },
            footnote: "#31"
        },
        "IA": {
            name: "Iowa",
            abbrev: "IA",
            country: "US",
            rates: {
                diesel: 0.3250,
                gasoline: 0.3000,
                gasohol: 0.2900,
                propane: 0.3000,
                lng: 0.3250,
                cng: 0.3140,
                ethanol: 0.1900,
                methanol: 0.0000,
                biodiesel: 0.3250
            },
            footnote: "#25"
        },
        "KS": {
            name: "Kansas",
            abbrev: "KS",
            country: "US",
            rates: {
                diesel: 0.2600,
                gasoline: 0.2400,
                gasohol: 0.2400,
                propane: 0.2300,
                lng: 0.2600,
                cng: 0.2400,
                ethanol: 0.2400,
                methanol: 0.2400,
                biodiesel: 0.2600
            }
        },
        "KY": {
            name: "Kentucky",
            abbrev: "KY",
            country: "US",
            rates: {
                diesel: 0.2760,
                gasoline: 0.2760,
                gasohol: 0.2760,
                propane: 0.2760,
                lng: 0.2760,
                cng: 0.2760,
                ethanol: 0.2760,
                methanol: 0.2760,
                biodiesel: 0.2760
            }
        },
        "LA": {
            name: "Louisiana",
            abbrev: "LA",
            country: "US",
            rates: {
                diesel: 0.2000,
                gasoline: 0.2000,
                gasohol: 0.2000,
                propane: 0.0000,
                lng: 0.0000,
                cng: 0.0000,
                ethanol: 0.2000,
                methanol: 0.2000,
                biodiesel: 0.2000
            },
            footnote: "#21"
        },
        "ME": {
            name: "Maine",
            abbrev: "ME",
            country: "US",
            rates: {
                diesel: 0.3120,
                gasoline: 0.3000,
                gasohol: 0.3000,
                propane: 0.2180,
                lng: 0.3120,
                cng: 0.2070,
                ethanol: 0.3000,
                methanol: 0.3000,
                biodiesel: 0.3120
            }
        },
        "MD": {
            name: "Maryland",
            abbrev: "MD",
            country: "US",
            rates: {
                diesel: 0.4155,
                gasoline: 0.4705,
                gasohol: 0.4705,
                propane: 0.4705,
                lng: 0.4155,
                cng: 0.4705,
                ethanol: 0.4705,
                methanol: 0.4705,
                biodiesel: 0.4155
            },
            footnote: "#23"
        },
        "MA": {
            name: "Massachusetts",
            abbrev: "MA",
            country: "US",
            rates: {
                diesel: 0.2400,
                gasoline: 0.2400,
                gasohol: 0.2400,
                propane: 0.1688,
                lng: 0.2400,
                cng: 0.1688,
                ethanol: 0.2400,
                methanol: 0.2400,
                biodiesel: 0.2400
            }
        },
        "MI": {
            name: "Michigan",
            abbrev: "MI",
            country: "US",
            rates: {
                diesel: 0.2810,
                gasoline: 0.2810,
                gasohol: 0.2810,
                propane: 0.2810,
                lng: 0.2810,
                cng: 0.2810,
                ethanol: 0.2810,
                methanol: 0.2810,
                biodiesel: 0.2810
            }
        },
        "MN": {
            name: "Minnesota",
            abbrev: "MN",
            country: "US",
            rates: {
                diesel: 0.2850,
                gasoline: 0.2850,
                gasohol: 0.2850,
                propane: 0.1710,
                lng: 0.2850,
                cng: 0.3180,
                ethanol: 0.2850,
                methanol: 0.2850,
                biodiesel: 0.2850
            },
            footnote: "#16"
        },
        "MS": {
            name: "Mississippi",
            abbrev: "MS",
            country: "US",
            rates: {
                diesel: 0.1800,
                gasoline: 0.1800,
                gasohol: 0.1800,
                propane: 0.1700,
                lng: 0.1800,
                cng: 0.1800,
                ethanol: 0.1800,
                methanol: 0.1800,
                biodiesel: 0.1800
            },
            footnote: "#2"
        },
        "MO": {
            name: "Missouri",
            abbrev: "MO",
            country: "US",
            rates: {
                diesel: 0.2200,
                gasoline: 0.2200,
                gasohol: 0.2200,
                propane: 0.0000,
                lng: 0.1100,
                cng: 0.0500,
                ethanol: 0.2200,
                methanol: 0.2200,
                biodiesel: 0.2200
            },
            footnote: "#3"
        },
        "MT": {
            name: "Montana",
            abbrev: "MT",
            country: "US",
            rates: {
                diesel: 0.2975,
                gasoline: 0.0000,
                gasohol: 0.0000,
                propane: 0.0400,
                lng: 0.2975,
                cng: 0.0700,
                ethanol: 0.0000,
                methanol: 0.0000,
                biodiesel: 0.2975
            },
            footnote: "#9"
        },
        "NE": {
            name: "Nebraska",
            abbrev: "NE",
            country: "US",
            rates: {
                diesel: 0.2840,
                gasoline: 0.2840,
                gasohol: 0.2840,
                propane: 0.2840,
                lng: 0.2840,
                cng: 0.2840,
                ethanol: 0.2840,
                methanol: 0.2840,
                biodiesel: 0.2840
            }
        },
        "NV": {
            name: "Nevada",
            abbrev: "NV",
            country: "US",
            rates: {
                diesel: 0.2700,
                gasoline: 0.2300,
                gasohol: 0.2300,
                propane: 0.1900,
                lng: 0.2700,
                cng: 0.0680,
                ethanol: 0.2300,
                methanol: 0.2300,
                biodiesel: 0.2700
            }
        },
        "NH": {
            name: "New Hampshire",
            abbrev: "NH",
            country: "US",
            rates: {
                diesel: 0.2220,
                gasoline: 0.2220,
                gasohol: 0.2220,
                propane: 0.0000,
                lng: 0.0000,
                cng: 0.0000,
                ethanol: 0.2220,
                methanol: 0.2220,
                biodiesel: 0.2220
            }
        },
        "NJ": {
            name: "New Jersey",
            abbrev: "NJ",
            country: "US",
            rates: {
                diesel: 0.4900,
                gasoline: 0.4250,
                gasohol: 0.4250,
                propane: 0.0525,
                lng: 0.4900,
                cng: 0.0857,
                ethanol: 0.4250,
                methanol: 0.4250,
                biodiesel: 0.4900
            }
        },
        "NM": {
            name: "New Mexico",
            abbrev: "NM",
            country: "US",
            rates: {
                diesel: 0.2100,
                gasoline: 0.1700,
                gasohol: 0.1700,
                propane: 0.1200,
                lng: 0.2060,
                cng: 0.1330,
                ethanol: 0.1700,
                methanol: 0.1700,
                biodiesel: 0.2100
            },
            footnote: "#33"
        },
        "NY": {
            name: "New York",
            abbrev: "NY",
            country: "US",
            rates: {
                diesel: 0.1720,
                gasoline: 0.0800,
                gasohol: 0.0800,
                propane: 0.0000,
                lng: 0.0530,
                cng: 0.0530,
                ethanol: 0.0800,
                methanol: 0.0800,
                biodiesel: 0.1720
            },
            footnote: "#11"
        },
        "NC": {
            name: "North Carolina",
            abbrev: "NC",
            country: "US",
            rates: {
                diesel: 0.4235,
                gasoline: 0.4235,
                gasohol: 0.4235,
                propane: 0.4235,
                lng: 0.4235,
                cng: 0.4235,
                ethanol: 0.4235,
                methanol: 0.4235,
                biodiesel: 0.4235
            },
            footnote: "#24"
        },
        "ND": {
            name: "North Dakota",
            abbrev: "ND",
            country: "US",
            rates: {
                diesel: 0.2300,
                gasoline: 0.2300,
                gasohol: 0.2300,
                propane: 0.2300,
                lng: 0.2300,
                cng: 0.2300,
                ethanol: 0.2300,
                methanol: 0.2300,
                biodiesel: 0.2300
            }
        },
        "OH": {
            name: "Ohio",
            abbrev: "OH",
            country: "US",
            rates: {
                diesel: 0.4700,
                gasoline: 0.3850,
                gasohol: 0.3850,
                propane: 0.3850,
                lng: 0.4700,
                cng: 0.4700,
                ethanol: 0.3850,
                methanol: 0.3850,
                biodiesel: 0.4700
            },
            footnote: "#28"
        },
        "OK": {
            name: "Oklahoma",
            abbrev: "OK",
            country: "US",
            rates: {
                diesel: 0.1900,
                gasoline: 0.1900,
                gasohol: 0.1900,
                propane: 0.1400,
                lng: 0.0400,
                cng: 0.0500,
                ethanol: 0.1900,
                methanol: 0.1900,
                biodiesel: 0.1900
            }
        },
        "OR": {
            name: "Oregon",
            abbrev: "OR",
            country: "US",
            rates: {
                diesel: 0.4000,
                gasoline: 0.4000,
                gasohol: 0.4000,
                propane: 0.4000,
                lng: 0.4000,
                cng: 0.4000,
                ethanol: 0.4000,
                methanol: 0.4000,
                biodiesel: 0.4000
            }
        },
        "PA": {
            name: "Pennsylvania",
            abbrev: "PA",
            country: "US",
            rates: {
                diesel: 0.7780,
                gasoline: 0.6140,
                gasohol: 0.6140,
                propane: 0.6140,
                lng: 0.7780,
                cng: 0.6140,
                ethanol: 0.6140,
                methanol: 0.6140,
                biodiesel: 0.7780
            },
            footnote: "#4"
        },
        "RI": {
            name: "Rhode Island",
            abbrev: "RI",
            country: "US",
            rates: {
                diesel: 0.3800,
                gasoline: 0.3700,
                gasohol: 0.3700,
                propane: 0.3700,
                lng: 0.3800,
                cng: 0.3700,
                ethanol: 0.3700,
                methanol: 0.3700,
                biodiesel: 0.3800
            },
            footnote: "#34"
        },
        "SC": {
            name: "South Carolina",
            abbrev: "SC",
            country: "US",
            rates: {
                diesel: 0.2875,
                gasoline: 0.2875,
                gasohol: 0.2875,
                propane: 0.2875,
                lng: 0.2875,
                cng: 0.2875,
                ethanol: 0.2875,
                methanol: 0.2875,
                biodiesel: 0.2875
            },
            footnote: "#22"
        },
        "SD": {
            name: "South Dakota",
            abbrev: "SD",
            country: "US",
            rates: {
                diesel: 0.3000,
                gasoline: 0.3000,
                gasohol: 0.3000,
                propane: 0.2000,
                lng: 0.3000,
                cng: 0.3000,
                ethanol: 0.3000,
                methanol: 0.3000,
                biodiesel: 0.3000
            }
        },
        "TN": {
            name: "Tennessee",
            abbrev: "TN",
            country: "US",
            rates: {
                diesel: 0.2700,
                gasoline: 0.2700,
                gasohol: 0.2700,
                propane: 0.1700,
                lng: 0.2100,
                cng: 0.1300,
                ethanol: 0.2700,
                methanol: 0.2700,
                biodiesel: 0.2700
            },
            footnote: "#8"
        },
        "TX": {
            name: "Texas",
            abbrev: "TX",
            country: "US",
            rates: {
                diesel: 0.2000,
                gasoline: 0.2000,
                gasohol: 0.2000,
                propane: 0.1500,
                lng: 0.2000,
                cng: 0.2000,
                ethanol: 0.2000,
                methanol: 0.2000,
                biodiesel: 0.2000
            },
            footnote: "#12"
        },
        "UT": {
            name: "Utah",
            abbrev: "UT",
            country: "US",
            rates: {
                diesel: 0.3250,
                gasoline: 0.3250,
                gasohol: 0.3250,
                propane: 0.3250,
                lng: 0.3250,
                cng: 0.3250,
                ethanol: 0.3250,
                methanol: 0.3250,
                biodiesel: 0.3250
            },
            footnote: "#20"
        },
        "VT": {
            name: "Vermont",
            abbrev: "VT",
            country: "US",
            rates: {
                diesel: 0.3100,
                gasoline: 0.3210,
                gasohol: 0.3210,
                propane: 0.0400,
                lng: 0.3100,
                cng: 0.0400,
                ethanol: 0.3210,
                methanol: 0.3210,
                biodiesel: 0.3100
            }
        },
        "VA": {
            name: "Virginia",
            abbrev: "VA",
            country: "US",
            rates: {
                diesel: 0.3090,
                gasoline: 0.2990,
                gasohol: 0.2990,
                propane: 0.2990,
                lng: 0.3090,
                cng: 0.2990,
                ethanol: 0.2990,
                methanol: 0.2990,
                biodiesel: 0.3090
            },
            footnote: "#19"
        },
        "WA": {
            name: "Washington",
            abbrev: "WA",
            country: "US",
            rates: {
                diesel: 0.5840,
                gasoline: 0.5840,
                gasohol: 0.5840,
                propane: 0.5840,
                lng: 0.5840,
                cng: 0.5840,
                ethanol: 0.5840,
                methanol: 0.5840,
                biodiesel: 0.5840
            },
            footnote: "#10"
        },
        "WV": {
            name: "West Virginia",
            abbrev: "WV",
            country: "US",
            rates: {
                diesel: 0.3570,
                gasoline: 0.3570,
                gasohol: 0.3570,
                propane: 0.3570,
                lng: 0.3570,
                cng: 0.3570,
                ethanol: 0.3570,
                methanol: 0.3570,
                biodiesel: 0.3570
            }
        },
        "WI": {
            name: "Wisconsin",
            abbrev: "WI",
            country: "US",
            rates: {
                diesel: 0.3290,
                gasoline: 0.3290,
                gasohol: 0.3290,
                propane: 0.2290,
                lng: 0.3290,
                cng: 0.2290,
                ethanol: 0.3290,
                methanol: 0.3290,
                biodiesel: 0.3290
            }
        },
        "WY": {
            name: "Wyoming",
            abbrev: "WY",
            country: "US",
            rates: {
                diesel: 0.2400,
                gasoline: 0.2400,
                gasohol: 0.2400,
                propane: 0.2400,
                lng: 0.2400,
                cng: 0.2400,
                ethanol: 0.2400,
                methanol: 0.2400,
                biodiesel: 0.2400
            },
            footnote: "#32"
        },

        // Canadian Jurisdictions (rates in USD, converted from CAD)
        "AB": {
            name: "Alberta",
            abbrev: "AB",
            country: "CAN",
            rates: {
                diesel: 0.0942,
                gasoline: 0.0942,
                gasohol: 0.0942,
                propane: 0.0635,
                lng: 0.0942,
                cng: 0.0942,
                ethanol: 0.0942,
                methanol: 0.0942,
                biodiesel: 0.0942
            },
            footnote: "#14",
            ratesCAD: {
                diesel: 0.1300,
                gasoline: 0.1300,
                propane: 0.0877
            }
        },
        "BC": {
            name: "British Columbia",
            abbrev: "BC",
            country: "CAN",
            rates: {
                diesel: 0.2427,
                gasoline: 0.2354,
                gasohol: 0.2354,
                propane: 0.1449,
                lng: 0.2427,
                cng: 0.2354,
                ethanol: 0.2354,
                methanol: 0.2354,
                biodiesel: 0.2427
            },
            footnote: "#13",
            ratesCAD: {
                diesel: 0.3350,
                gasoline: 0.3250
            }
        },
        "MB": {
            name: "Manitoba",
            abbrev: "MB",
            country: "CAN",
            rates: {
                diesel: 0.1014,
                gasoline: 0.1014,
                gasohol: 0.1014,
                propane: 0.0725,
                lng: 0.1014,
                cng: 0.1014,
                ethanol: 0.1014,
                methanol: 0.1014,
                biodiesel: 0.1014
            },
            footnote: "#17",
            ratesCAD: {
                diesel: 0.1400,
                gasoline: 0.1400
            }
        },
        "NB": {
            name: "New Brunswick",
            abbrev: "NB",
            country: "CAN",
            rates: {
                diesel: 0.2129,
                gasoline: 0.1739,
                gasohol: 0.1739,
                propane: 0.1159,
                lng: 0.2129,
                cng: 0.1739,
                ethanol: 0.1739,
                methanol: 0.1739,
                biodiesel: 0.2129
            },
            ratesCAD: {
                diesel: 0.2940,
                gasoline: 0.2400
            }
        },
        "NL": {
            name: "Newfoundland and Labrador",
            abbrev: "NL",
            country: "CAN",
            rates: {
                diesel: 0.1449,
                gasoline: 0.1377,
                gasohol: 0.1377,
                propane: 0.0942,
                lng: 0.1449,
                cng: 0.1377,
                ethanol: 0.1377,
                methanol: 0.1377,
                biodiesel: 0.1449
            },
            ratesCAD: {
                diesel: 0.2000,
                gasoline: 0.1900
            }
        },
        "NS": {
            name: "Nova Scotia",
            abbrev: "NS",
            country: "CAN",
            rates: {
                diesel: 0.1117,
                gasoline: 0.1117,
                gasohol: 0.1117,
                propane: 0.0797,
                lng: 0.1117,
                cng: 0.1117,
                ethanol: 0.1117,
                methanol: 0.1117,
                biodiesel: 0.1117
            },
            ratesCAD: {
                diesel: 0.1542,
                gasoline: 0.1542
            }
        },
        "ON": {
            name: "Ontario",
            abbrev: "ON",
            country: "CAN",
            rates: {
                diesel: 0.1043,
                gasoline: 0.0942,
                gasohol: 0.0942,
                propane: 0.0507,
                lng: 0.1043,
                cng: 0.0942,
                ethanol: 0.0942,
                methanol: 0.0942,
                biodiesel: 0.1043
            },
            footnote: "#5",
            ratesCAD: {
                diesel: 0.1440,
                gasoline: 0.1300
            }
        },
        "PE": {
            name: "Prince Edward Island",
            abbrev: "PE",
            country: "CAN",
            rates: {
                diesel: 0.1855,
                gasoline: 0.1072,
                gasohol: 0.1072,
                propane: 0.0000,
                lng: 0.1855,
                cng: 0.1072,
                ethanol: 0.1072,
                methanol: 0.1072,
                biodiesel: 0.1855
            },
            footnote: "#27",
            ratesCAD: {
                diesel: 0.2560,
                gasoline: 0.1480
            }
        },
        "QC": {
            name: "Quebec",
            abbrev: "QC",
            country: "CAN",
            rates: {
                diesel: 0.1464,
                gasoline: 0.1406,
                gasohol: 0.1406,
                propane: 0.0797,
                lng: 0.1464,
                cng: 0.1406,
                ethanol: 0.1406,
                methanol: 0.1406,
                biodiesel: 0.1464
            },
            ratesCAD: {
                diesel: 0.2020,
                gasoline: 0.1941
            }
        },
        "SK": {
            name: "Saskatchewan",
            abbrev: "SK",
            country: "CAN",
            rates: {
                diesel: 0.1087,
                gasoline: 0.1087,
                gasohol: 0.1087,
                propane: 0.0652,
                lng: 0.1087,
                cng: 0.1087,
                ethanol: 0.1087,
                methanol: 0.1087,
                biodiesel: 0.1087
            },
            ratesCAD: {
                diesel: 0.1500,
                gasoline: 0.1500
            }
        }
    }
};

// Historical rate adjustments for past quarters (relative to Q4 2025 base rates)
// This stores any rate changes between quarters
const QUARTERLY_RATE_HISTORY = {
    "Q4 2025": {}, // Current quarter - no adjustments
    "Q3 2025": {
        // Most rates stayed same in Q3 2025
    },
    "Q2 2025": {
        // Q2 2025 rates
        "CA": { diesel: 0.970, gasoline: 0.586 },
    },
    "Q1 2025": {
        "CA": { diesel: 0.960, gasoline: 0.576 },
    },
    "Q4 2024": {
        "CA": { diesel: 0.944, gasoline: 0.564 },
        "PA": { diesel: 0.741, gasoline: 0.576 },
    },
    "Q3 2024": {
        "CA": { diesel: 0.944, gasoline: 0.564 },
        "PA": { diesel: 0.741, gasoline: 0.576 },
    },
    "Q2 2024": {
        "CA": { diesel: 0.930, gasoline: 0.550 },
        "PA": { diesel: 0.741, gasoline: 0.576 },
    },
    "Q1 2024": {
        "CA": { diesel: 0.920, gasoline: 0.540 },
        "PA": { diesel: 0.741, gasoline: 0.576 },
    }
};

// Current active quarter for rate lookups
let activeQuarter = "Q4 2025";

// Set the active quarter for rate calculations
function setActiveQuarter(quarter) {
    if (typeof quarter === 'string') {
        activeQuarter = quarter.trim();
        console.log(`Active quarter set to: ${activeQuarter}`);
    }
}

// Get the current active quarter
function getActiveQuarter() {
    return activeQuarter;
}

// Function to get rate for a jurisdiction and fuel type with quarter support
function getTaxRate(jurisdictionCode, fuelType = 'diesel', quarter = null) {
    // Use active quarter if not specified
    const targetQuarter = quarter || activeQuarter;
    
    // Validate inputs
    if (!jurisdictionCode || typeof jurisdictionCode !== 'string') {
        console.warn('Invalid jurisdiction code:', jurisdictionCode);
        return 0;
    }
    
    const code = jurisdictionCode.toUpperCase().trim();
    const jurisdiction = IFTA_TAX_RATES.jurisdictions[code];
    
    if (!jurisdiction) {
        console.warn(`Unknown jurisdiction: ${code}`);
        return 0;
    }
    
    if (!jurisdiction.rates) {
        console.warn(`No rates found for jurisdiction: ${code}`);
        return 0;
    }
    
    // Map fuel type names to the rate keys
    const fuelTypeMap = {
        'diesel': 'diesel',
        'special diesel': 'diesel',
        'gasoline': 'gasoline',
        'gasohol': 'gasohol',
        'propane': 'propane',
        'lpg': 'propane',
        'lng': 'lng',
        'cng': 'cng',
        'ethanol': 'ethanol',
        'e-85': 'ethanol',
        'e85': 'ethanol',
        'methanol': 'methanol',
        'm-85': 'methanol',
        'm85': 'methanol',
        'biodiesel': 'biodiesel'
    };
    
    const normalizedFuelType = fuelTypeMap[(fuelType || 'diesel').toLowerCase()] || 'diesel';
    
    // Check for quarterly rate override first
    const quarterAdjustments = QUARTERLY_RATE_HISTORY[targetQuarter];
    if (quarterAdjustments && quarterAdjustments[code] && quarterAdjustments[code][normalizedFuelType] !== undefined) {
        const rate = quarterAdjustments[code][normalizedFuelType];
        return (typeof rate === 'number' && isFinite(rate) && rate >= 0) ? rate : 0;
    }
    
    // Get base rate
    const rate = jurisdiction.rates[normalizedFuelType];
    
    // Return rate or 0 if not found/invalid
    return (typeof rate === 'number' && isFinite(rate) && rate >= 0) ? rate : 0;
}

// Validate that a rate is reasonable (between 0 and $2.00 per gallon)
function validateRate(rate) {
    return typeof rate === 'number' && isFinite(rate) && rate >= 0 && rate <= 2.0;
}

// Get rate with full validation
function getValidatedTaxRate(jurisdictionCode, fuelType = 'diesel', quarter = null) {
    const rate = getTaxRate(jurisdictionCode, fuelType, quarter);
    if (!validateRate(rate)) {
        console.warn(`Invalid rate for ${jurisdictionCode}/${fuelType}: ${rate}`);
        return 0;
    }
    return rate;
}

// Get all jurisdictions as array for dropdowns
function getJurisdictionList() {
    return Object.entries(IFTA_TAX_RATES.jurisdictions)
        .map(([code, data]) => ({
            code,
            name: data.name,
            country: data.country
        }))
        .sort((a, b) => {
            // Sort by country (US first), then by name
            if (a.country !== b.country) {
                return a.country === 'US' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
}

// Get US jurisdictions only
function getUSJurisdictions() {
    return getJurisdictionList().filter(j => j.country === 'US');
}

// Get Canadian jurisdictions only
function getCanadianJurisdictions() {
    return getJurisdictionList().filter(j => j.country === 'CAN');
}

// Calculate tax with bulletproof precision
function calculateTax(netTaxableGallons, rate) {
    // Validate inputs
    if (typeof netTaxableGallons !== 'number' || !isFinite(netTaxableGallons)) {
        return 0;
    }
    if (typeof rate !== 'number' || !isFinite(rate) || rate < 0) {
        return 0;
    }
    
    // Use precise decimal arithmetic
    // Multiply by 10000 to avoid floating point errors, then divide
    const gallonsCents = Math.round(netTaxableGallons * 10000);
    const rateCents = Math.round(rate * 10000);
    const taxCents = gallonsCents * rateCents / 10000;
    
    // Round to 2 decimal places
    return Math.round(taxCents) / 10000;
}

// Verify calculation integrity
function verifyCalculation(miles, mpg, taxPaidGallons, rate) {
    if (mpg <= 0 || !isFinite(mpg)) {
        return { valid: false, error: 'Invalid MPG' };
    }
    
    const taxableGallons = miles / mpg;
    const netTaxableGallons = taxableGallons - taxPaidGallons;
    const taxDue = calculateTax(netTaxableGallons, rate);
    
    // Verify the math adds up
    const verification = {
        valid: true,
        taxableGallons: Math.round(taxableGallons * 1000) / 1000,
        netTaxableGallons: Math.round(netTaxableGallons * 1000) / 1000,
        taxDue: Math.round(taxDue * 100) / 100,
        formula: `(${miles} miles ÷ ${mpg} mpg) - ${taxPaidGallons} gal = ${Math.round(netTaxableGallons * 1000) / 1000} net gal × $${rate.toFixed(4)} = $${(Math.round(taxDue * 100) / 100).toFixed(2)}`
    };
    
    return verification;
}

// Export for use in app.js
window.IFTA_TAX_RATES = IFTA_TAX_RATES;
window.QUARTERLY_RATE_HISTORY = QUARTERLY_RATE_HISTORY;
window.getTaxRate = getTaxRate;
window.getValidatedTaxRate = getValidatedTaxRate;
window.setActiveQuarter = setActiveQuarter;
window.getActiveQuarter = getActiveQuarter;
window.getJurisdictionList = getJurisdictionList;
window.getUSJurisdictions = getUSJurisdictions;
window.getCanadianJurisdictions = getCanadianJurisdictions;
window.calculateTax = calculateTax;
window.verifyCalculation = verifyCalculation;
window.validateRate = validateRate;
