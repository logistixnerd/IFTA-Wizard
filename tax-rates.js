// IFTA Tax Rates - Q4 2025 (Official IFTACH Rates)
// Source: https://www.iftach.org/taxmatrix4/TaxDownload.php
// Effective: October 1, 2025 - December 31, 2025
// Exchange Rate for Canadian Provinces: 1.4335 (as specified by IFTACH for Q4 2025)

const IFTA_TAX_RATES = {
    quarter: "Q4 2025",
    lastUpdated: "2025-12-04",
    exchangeRate: 1.4335,
    jurisdictions: {
        // United States - Official Q4 2025 IFTACH Rates
        "AL": {
            name: "Alabama",
            abbrev: "AL",
            country: "US",
            rates: {
                diesel: 0.3100,
                gasoline: 0.2900,
                gasohol: 0.2900,
                propane: 0.2100,
                lng: 0.2100,
                cng: 0.2100,
                ethanol: 0.2900,
                methanol: 0.2900,
                biodiesel: 0.3100
            }
        },
        "AZ": {
            name: "Arizona",
            abbrev: "AZ",
            country: "US",
            rates: {
                diesel: 0.2600,
                gasoline: 0.1800,
                gasohol: 0.1800,
                propane: 0.1800,
                lng: 0.1800,
                cng: 0.1800,
                ethanol: 0.1800,
                methanol: 0.1800,
                biodiesel: 0.2600
            }
        },
        "AR": {
            name: "Arkansas",
            abbrev: "AR",
            country: "US",
            rates: {
                diesel: 0.2850,
                gasoline: 0.2450,
                gasohol: 0.2450,
                propane: 0.1650,
                lng: 0.2850,
                cng: 0.0500,
                ethanol: 0.2450,
                methanol: 0.2450,
                biodiesel: 0.2850
            }
        },
        "CA": {
            name: "California",
            abbrev: "CA",
            country: "US",
            rates: {
                diesel: 0.9710,
                gasoline: 0.6510,
                gasohol: 0.6510,
                propane: 0.0600,
                lng: 0.1163,
                cng: 0.1163,
                ethanol: 0.6510,
                methanol: 0.6510,
                biodiesel: 0.9710
            }
        },
        "CO": {
            name: "Colorado",
            abbrev: "CO",
            country: "US",
            rates: {
                diesel: 0.3250,
                gasoline: 0.2200,
                gasohol: 0.2200,
                propane: 0.2200,
                lng: 0.2200,
                cng: 0.2200,
                ethanol: 0.2200,
                methanol: 0.2200,
                biodiesel: 0.3250
            }
        },
        "CT": {
            name: "Connecticut",
            abbrev: "CT",
            country: "US",
            rates: {
                diesel: 0.4890,
                gasoline: 0.2500,
                gasohol: 0.2500,
                propane: 0.2500,
                lng: 0.2640,
                cng: 0.2640,
                ethanol: 0.2500,
                methanol: 0.2500,
                biodiesel: 0.4890
            }
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
                diesel: 0.4027,
                gasoline: 0.3777,
                gasohol: 0.3777,
                propane: 0.2077,
                lng: 0.2077,
                cng: 0.2077,
                ethanol: 0.3777,
                methanol: 0.3777,
                biodiesel: 0.4027
            }
        },
        "GA": {
            name: "Georgia",
            abbrev: "GA",
            country: "US",
            rates: {
                diesel: 0.3710,
                gasoline: 0.3510,
                gasohol: 0.3510,
                propane: 0.3510,
                lng: 0.3510,
                cng: 0.3510,
                ethanol: 0.3510,
                methanol: 0.3510,
                biodiesel: 0.3710
            }
        },
        "ID": {
            name: "Idaho",
            abbrev: "ID",
            country: "US",
            rates: {
                diesel: 0.3800,
                gasoline: 0.3300,
                gasohol: 0.3300,
                propane: 0.2620,
                lng: 0.3800,
                cng: 0.3300,
                ethanol: 0.3300,
                methanol: 0.3300,
                biodiesel: 0.3800
            }
        },
        "IL": {
            name: "Illinois",
            abbrev: "IL",
            country: "US",
            rates: {
                diesel: 0.7490,
                gasoline: 0.5670,
                gasohol: 0.5670,
                propane: 0.5670,
                lng: 0.5670,
                cng: 0.5670,
                ethanol: 0.5670,
                methanol: 0.5670,
                biodiesel: 0.7490
            }
        },
        "IN": {
            name: "Indiana",
            abbrev: "IN",
            country: "US",
            rates: {
                diesel: 0.6100,
                gasoline: 0.5000,
                gasohol: 0.5000,
                propane: 0.5500,
                lng: 0.6600,
                cng: 0.5500,
                ethanol: 0.5000,
                methanol: 0.5000,
                biodiesel: 0.6100
            }
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
                cng: 0.3100,
                ethanol: 0.2900,
                methanol: 0.3000,
                biodiesel: 0.3150
            }
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
                diesel: 0.3250,
                gasoline: 0.2870,
                gasohol: 0.2870,
                propane: 0.2870,
                lng: 0.2870,
                cng: 0.2870,
                ethanol: 0.2870,
                methanol: 0.2870,
                biodiesel: 0.3250
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
                propane: 0.2000,
                lng: 0.2000,
                cng: 0.2000,
                ethanol: 0.2000,
                methanol: 0.2000,
                biodiesel: 0.2000
            }
        },
        "ME": {
            name: "Maine",
            abbrev: "ME",
            country: "US",
            rates: {
                diesel: 0.3420,
                gasoline: 0.3020,
                gasohol: 0.3020,
                propane: 0.2180,
                lng: 0.2180,
                cng: 0.2180,
                ethanol: 0.3020,
                methanol: 0.3020,
                biodiesel: 0.3420
            }
        },
        "MD": {
            name: "Maryland",
            abbrev: "MD",
            country: "US",
            rates: {
                diesel: 0.4175,
                gasoline: 0.4700,
                gasohol: 0.4700,
                propane: 0.4175,
                lng: 0.4175,
                cng: 0.4175,
                ethanol: 0.4700,
                methanol: 0.4700,
                biodiesel: 0.4175
            }
        },
        "MA": {
            name: "Massachusetts",
            abbrev: "MA",
            country: "US",
            rates: {
                diesel: 0.2540,
                gasoline: 0.2400,
                gasohol: 0.2400,
                propane: 0.1970,
                lng: 0.2540,
                cng: 0.2540,
                ethanol: 0.2400,
                methanol: 0.2400,
                biodiesel: 0.2540
            }
        },
        "MI": {
            name: "Michigan",
            abbrev: "MI",
            country: "US",
            rates: {
                diesel: 0.5070,
                gasoline: 0.3230,
                gasohol: 0.3230,
                propane: 0.3230,
                lng: 0.3230,
                cng: 0.3230,
                ethanol: 0.3230,
                methanol: 0.3230,
                biodiesel: 0.5070
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
                lng: 0.1710,
                cng: 0.1710,
                ethanol: 0.2850,
                methanol: 0.2850,
                biodiesel: 0.2850
            }
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
            }
        },
        "MO": {
            name: "Missouri",
            abbrev: "MO",
            country: "US",
            rates: {
                diesel: 0.2200,
                gasoline: 0.2200,
                gasohol: 0.2200,
                propane: 0.2200,
                lng: 0.2200,
                cng: 0.1100,
                ethanol: 0.2200,
                methanol: 0.2200,
                biodiesel: 0.2200
            }
        },
        "MT": {
            name: "Montana",
            abbrev: "MT",
            country: "US",
            rates: {
                diesel: 0.3295,
                gasoline: 0.3300,
                gasohol: 0.3300,
                propane: 0.0700,
                lng: 0.0700,
                cng: 0.0700,
                ethanol: 0.3300,
                methanol: 0.3300,
                biodiesel: 0.3295
            }
        },
        "NE": {
            name: "Nebraska",
            abbrev: "NE",
            country: "US",
            rates: {
                diesel: 0.2990,
                gasoline: 0.2990,
                gasohol: 0.2990,
                propane: 0.2990,
                lng: 0.2990,
                cng: 0.2990,
                ethanol: 0.2990,
                methanol: 0.2990,
                biodiesel: 0.2990
            }
        },
        "NV": {
            name: "Nevada",
            abbrev: "NV",
            country: "US",
            rates: {
                diesel: 0.2800,
                gasoline: 0.2300,
                gasohol: 0.2300,
                propane: 0.2200,
                lng: 0.2700,
                cng: 0.2100,
                ethanol: 0.2300,
                methanol: 0.2300,
                biodiesel: 0.2800
            }
        },
        "NH": {
            name: "New Hampshire",
            abbrev: "NH",
            country: "US",
            rates: {
                diesel: 0.2340,
                gasoline: 0.2200,
                gasohol: 0.2200,
                propane: 0.2200,
                lng: 0.2200,
                cng: 0.2200,
                ethanol: 0.2200,
                methanol: 0.2200,
                biodiesel: 0.2340
            }
        },
        "NJ": {
            name: "New Jersey",
            abbrev: "NJ",
            country: "US",
            rates: {
                diesel: 0.5190,
                gasoline: 0.3700,
                gasohol: 0.3700,
                propane: 0.0575,
                lng: 0.0575,
                cng: 0.0575,
                ethanol: 0.3700,
                methanol: 0.3700,
                biodiesel: 0.5190
            }
        },
        "NM": {
            name: "New Mexico",
            abbrev: "NM",
            country: "US",
            rates: {
                diesel: 0.2438,
                gasoline: 0.1875,
                gasohol: 0.1875,
                propane: 0.1200,
                lng: 0.1200,
                cng: 0.1200,
                ethanol: 0.1875,
                methanol: 0.1875,
                biodiesel: 0.2438
            }
        },
        "NY": {
            name: "New York",
            abbrev: "NY",
            country: "US",
            rates: {
                diesel: 0.1770,
                gasoline: 0.0800,
                gasohol: 0.0800,
                propane: 0.0800,
                lng: 0.0800,
                cng: 0.0800,
                ethanol: 0.0800,
                methanol: 0.0800,
                biodiesel: 0.1770
            }
        },
        "NC": {
            name: "North Carolina",
            abbrev: "NC",
            country: "US",
            rates: {
                diesel: 0.4080,
                gasoline: 0.4080,
                gasohol: 0.4080,
                propane: 0.4080,
                lng: 0.4080,
                cng: 0.4080,
                ethanol: 0.4080,
                methanol: 0.4080,
                biodiesel: 0.4080
            }
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
                cng: 0.3850,
                ethanol: 0.3850,
                methanol: 0.3850,
                biodiesel: 0.4700
            }
        },
        "OK": {
            name: "Oklahoma",
            abbrev: "OK",
            country: "US",
            rates: {
                diesel: 0.1900,
                gasoline: 0.2000,
                gasohol: 0.2000,
                propane: 0.1900,
                lng: 0.0500,
                cng: 0.0500,
                ethanol: 0.2000,
                methanol: 0.2000,
                biodiesel: 0.1900
            }
        },
        "OR": {
            name: "Oregon",
            abbrev: "OR",
            country: "US",
            rates: {
                diesel: 0.0000,
                gasoline: 0.4000,
                gasohol: 0.4000,
                propane: 0.0000,
                lng: 0.0000,
                cng: 0.0000,
                ethanol: 0.4000,
                methanol: 0.4000,
                biodiesel: 0.0000
            }
        },
        "PA": {
            name: "Pennsylvania",
            abbrev: "PA",
            country: "US",
            rates: {
                diesel: 0.7410,
                gasoline: 0.5830,
                gasohol: 0.5830,
                propane: 0.5830,
                lng: 0.5830,
                cng: 0.5830,
                ethanol: 0.5830,
                methanol: 0.5830,
                biodiesel: 0.7410
            }
        },
        "RI": {
            name: "Rhode Island",
            abbrev: "RI",
            country: "US",
            rates: {
                diesel: 0.3400,
                gasoline: 0.3400,
                gasohol: 0.3400,
                propane: 0.3400,
                lng: 0.3400,
                cng: 0.3400,
                ethanol: 0.3400,
                methanol: 0.3400,
                biodiesel: 0.3400
            }
        },
        "SC": {
            name: "South Carolina",
            abbrev: "SC",
            country: "US",
            rates: {
                diesel: 0.2800,
                gasoline: 0.2800,
                gasohol: 0.2800,
                propane: 0.2800,
                lng: 0.2800,
                cng: 0.2800,
                ethanol: 0.2800,
                methanol: 0.2800,
                biodiesel: 0.2800
            }
        },
        "SD": {
            name: "South Dakota",
            abbrev: "SD",
            country: "US",
            rates: {
                diesel: 0.2800,
                gasoline: 0.2800,
                gasohol: 0.2800,
                propane: 0.2000,
                lng: 0.2800,
                cng: 0.2800,
                ethanol: 0.2800,
                methanol: 0.2800,
                biodiesel: 0.2800
            }
        },
        "TN": {
            name: "Tennessee",
            abbrev: "TN",
            country: "US",
            rates: {
                diesel: 0.2700,
                gasoline: 0.2600,
                gasohol: 0.2600,
                propane: 0.1700,
                lng: 0.1700,
                cng: 0.1300,
                ethanol: 0.2600,
                methanol: 0.2600,
                biodiesel: 0.2700
            }
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
                lng: 0.1500,
                cng: 0.1500,
                ethanol: 0.2000,
                methanol: 0.2000,
                biodiesel: 0.2000
            }
        },
        "UT": {
            name: "Utah",
            abbrev: "UT",
            country: "US",
            rates: {
                diesel: 0.3350,
                gasoline: 0.3150,
                gasohol: 0.3150,
                propane: 0.3150,
                lng: 0.3350,
                cng: 0.3350,
                ethanol: 0.3150,
                methanol: 0.3150,
                biodiesel: 0.3350
            }
        },
        "VT": {
            name: "Vermont",
            abbrev: "VT",
            country: "US",
            rates: {
                diesel: 0.3400,
                gasoline: 0.2620,
                gasohol: 0.2620,
                propane: 0.2620,
                lng: 0.2620,
                cng: 0.2620,
                ethanol: 0.2620,
                methanol: 0.2620,
                biodiesel: 0.3400
            }
        },
        "VA": {
            name: "Virginia",
            abbrev: "VA",
            country: "US",
            rates: {
                diesel: 0.4700,
                gasoline: 0.3020,
                gasohol: 0.3020,
                propane: 0.3020,
                lng: 0.3020,
                cng: 0.3020,
                ethanol: 0.3020,
                methanol: 0.3020,
                biodiesel: 0.4700
            }
        },
        "WA": {
            name: "Washington",
            abbrev: "WA",
            country: "US",
            rates: {
                diesel: 0.5840,
                gasoline: 0.4940,
                gasohol: 0.4940,
                propane: 0.4940,
                lng: 0.4940,
                cng: 0.4940,
                ethanol: 0.4940,
                methanol: 0.4940,
                biodiesel: 0.5840
            }
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
                diesel: 0.3090,
                gasoline: 0.3090,
                gasohol: 0.3090,
                propane: 0.3090,
                lng: 0.3090,
                cng: 0.3090,
                ethanol: 0.3090,
                methanol: 0.3090,
                biodiesel: 0.3090
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
            }
        },
        
        // Canadian Provinces - Official Q4 2025 IFTACH Rates (USD equivalent)
        "AB": {
            name: "Alberta",
            abbrev: "AB",
            country: "CA",
            rates: {
                diesel: 0.0935,
                gasoline: 0.0935,
                gasohol: 0.0935,
                propane: 0.0627,
                lng: 0.0935,
                cng: 0.0935,
                ethanol: 0.0935,
                methanol: 0.0935,
                biodiesel: 0.0935
            }
        },
        "BC": {
            name: "British Columbia",
            abbrev: "BC",
            country: "CA",
            rates: {
                diesel: 0.2267,
                gasoline: 0.1999,
                gasohol: 0.1999,
                propane: 0.0523,
                lng: 0.0313,
                cng: 0.0313,
                ethanol: 0.1999,
                methanol: 0.1999,
                biodiesel: 0.2267
            }
        },
        "MB": {
            name: "Manitoba",
            abbrev: "MB",
            country: "CA",
            rates: {
                diesel: 0.0978,
                gasoline: 0.0978,
                gasohol: 0.0978,
                propane: 0.0209,
                lng: 0.0978,
                cng: 0.0978,
                ethanol: 0.0978,
                methanol: 0.0978,
                biodiesel: 0.0978
            }
        },
        "NB": {
            name: "New Brunswick",
            abbrev: "NB",
            country: "CA",
            rates: {
                diesel: 0.1934,
                gasoline: 0.1170,
                gasohol: 0.1170,
                propane: 0.0740,
                lng: 0.1934,
                cng: 0.1934,
                ethanol: 0.1170,
                methanol: 0.1170,
                biodiesel: 0.1934
            }
        },
        "NL": {
            name: "Newfoundland",
            abbrev: "NL",
            country: "CA",
            rates: {
                diesel: 0.2288,
                gasoline: 0.1659,
                gasohol: 0.1659,
                propane: 0.0769,
                lng: 0.2288,
                cng: 0.2288,
                ethanol: 0.1659,
                methanol: 0.1659,
                biodiesel: 0.2288
            }
        },
        "NS": {
            name: "Nova Scotia",
            abbrev: "NS",
            country: "CA",
            rates: {
                diesel: 0.1100,
                gasoline: 0.1100,
                gasohol: 0.1100,
                propane: 0.0700,
                lng: 0.1100,
                cng: 0.1100,
                ethanol: 0.1100,
                methanol: 0.1100,
                biodiesel: 0.1100
            }
        },
        "ON": {
            name: "Ontario",
            abbrev: "ON",
            country: "CA",
            rates: {
                diesel: 0.1017,
                gasoline: 0.0967,
                gasohol: 0.0967,
                propane: 0.0314,
                lng: 0.1017,
                cng: 0.1017,
                ethanol: 0.0967,
                methanol: 0.0967,
                biodiesel: 0.1017
            }
        },
        "PE": {
            name: "Prince Edward Island",
            abbrev: "PE",
            country: "CA",
            rates: {
                diesel: 0.1449,
                gasoline: 0.0966,
                gasohol: 0.0966,
                propane: 0.0966,
                lng: 0.1449,
                cng: 0.1449,
                ethanol: 0.0966,
                methanol: 0.0966,
                biodiesel: 0.1449
            }
        },
        "QC": {
            name: "Quebec",
            abbrev: "QC",
            country: "CA",
            rates: {
                diesel: 0.1456,
                gasoline: 0.1353,
                gasohol: 0.1353,
                propane: 0.0978,
                lng: 0.1456,
                cng: 0.1456,
                ethanol: 0.1353,
                methanol: 0.1353,
                biodiesel: 0.1456
            }
        },
        "SK": {
            name: "Saskatchewan",
            abbrev: "SK",
            country: "CA",
            rates: {
                diesel: 0.1050,
                gasoline: 0.1050,
                gasohol: 0.1050,
                propane: 0.0700,
                lng: 0.1050,
                cng: 0.1050,
                ethanol: 0.1050,
                methanol: 0.1050,
                biodiesel: 0.1050
            }
        },
        "NT": {
            name: "Northwest Territories",
            abbrev: "NT",
            country: "CA",
            rates: {
                diesel: 0.0635,
                gasoline: 0.0740,
                gasohol: 0.0740,
                propane: 0.0635,
                lng: 0.0635,
                cng: 0.0635,
                ethanol: 0.0740,
                methanol: 0.0740,
                biodiesel: 0.0635
            }
        },
        "NU": {
            name: "Nunavut",
            abbrev: "NU",
            country: "CA",
            rates: {
                diesel: 0.0635,
                gasoline: 0.0640,
                gasohol: 0.0640,
                propane: 0.0635,
                lng: 0.0635,
                cng: 0.0635,
                ethanol: 0.0640,
                methanol: 0.0640,
                biodiesel: 0.0635
            }
        },
        "YT": {
            name: "Yukon",
            abbrev: "YT",
            country: "CA",
            rates: {
                diesel: 0.0527,
                gasoline: 0.0473,
                gasohol: 0.0473,
                propane: 0.0473,
                lng: 0.0527,
                cng: 0.0527,
                ethanol: 0.0473,
                methanol: 0.0473,
                biodiesel: 0.0527
            }
        }
    },
    
    // Function to get tax rate for a jurisdiction and fuel type
    getTaxRate: function(jurisdiction, fuelType = 'diesel') {
        const j = this.jurisdictions[jurisdiction.toUpperCase()];
        if (!j || !j.rates) return null;
        return j.rates[fuelType.toLowerCase()] || j.rates.diesel;
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
    module.exports = { IFTA_TAX_RATES, JURISDICTION_NOTES };
}
