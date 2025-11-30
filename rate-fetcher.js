/**
 * IFTA Rate Fetcher
 * Uses web scraping and AI parsing to fetch current IFTA tax rates
 * Version: 1.1.0
 */

'use strict';

const IFTARateFetcher = {
    // CORS proxy services (free options) - multiple fallbacks
    corsProxies: [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://cors-anywhere.herokuapp.com/',
        'https://thingproxy.freeboard.io/fetch/'
    ],
    
    // IFTA official sources
    sources: {
        taxMatrix: 'https://www.iftach.org/taxmatrix4/Taxmatrix.php',
        xmlData: 'https://www.iftach.org/taxmatrix/charts/',
        csvData: 'https://www.iftach.org/taxmatrix/charts/'
    },
    
    // Configuration
    config: {
        timeout: 15000, // 15 seconds timeout
        maxRetries: 3,
        cacheExpireDays: 7
    },
    
    currentProxyIndex: 0,
    lastError: null,
    
    /**
     * Get the current quarter string (e.g., "Q4 2025")
     */
    getCurrentQuarter() {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const quarter = Math.ceil(month / 3);
        return `Q${quarter} ${year}`;
    },
    
    /**
     * Get the next quarter string
     */
    getNextQuarter() {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        let quarter = Math.ceil(month / 3) + 1;
        let nextYear = year;
        
        if (quarter > 4) {
            quarter = 1;
            nextYear = year + 1;
        }
        
        return `Q${quarter} ${nextYear}`;
    },
    
    /**
     * Fetch data through CORS proxy with timeout
     */
    async fetchWithProxy(url) {
        const errors = [];
        
        for (let i = 0; i < this.corsProxies.length; i++) {
            const proxyIndex = (this.currentProxyIndex + i) % this.corsProxies.length;
            const proxy = this.corsProxies[proxyIndex];
            
            try {
                // Create AbortController for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
                
                const response = await fetch(proxy + encodeURIComponent(url), {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const text = await response.text();
                    if (text && text.length > 100) { // Validate we got real data
                        this.currentProxyIndex = proxyIndex; // Remember working proxy
                        this.lastError = null;
                        return text;
                    }
                }
                errors.push(`Proxy ${proxyIndex}: Invalid response`);
            } catch (error) {
                const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
                errors.push(`Proxy ${proxyIndex}: ${errorMsg}`);
            }
        }
        
        this.lastError = errors.join('; ');
        throw new Error(`All proxies failed: ${errors.join('; ')}`);
    },
    
    /**
     * Fetch XML tax rate data for a specific quarter
     */
    async fetchXMLRates(quarter) {
        const url = `${this.sources.xmlData}${quarter}.xml`;
        console.log(`Fetching rates from: ${url}`);
        
        try {
            const xmlText = await this.fetchWithProxy(url);
            return this.parseXMLRates(xmlText);
        } catch (error) {
            console.error('Failed to fetch XML rates:', error);
            throw error;
        }
    },
    
    /**
     * Parse XML tax rate data with validation
     */
    parseXMLRates(xmlText) {
        if (!xmlText || typeof xmlText !== 'string') {
            throw new Error('Invalid XML data');
        }
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Check for parsing errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('XML parsing failed: ' + parseError.textContent.slice(0, 100));
        }
        
        const rates = {};
        const records = xmlDoc.querySelectorAll('RECORD');
        
        if (records.length === 0) {
            throw new Error('No rate records found in XML');
        }
        
        let parsedCount = 0;
        records.forEach(record => {
            try {
                const jurisdiction = record.querySelector('JURISDICTION');
                if (!jurisdiction) return;
                
                const code = jurisdiction.textContent.trim().toUpperCase();
                if (!code || code.length !== 2) return;
                
                const country = record.querySelector('COUNTRY')?.textContent.trim() || 'US';
                
                // Initialize jurisdiction if not exists
                if (!rates[code]) {
                    rates[code] = {
                        code,
                        country,
                        rates: {}
                    };
                }
                
                // Get fuel type and rates
                const fuelTypes = record.querySelectorAll('FUEL_TYPE');
                const rateElements = record.querySelectorAll('RATE');
                
                fuelTypes.forEach((fuelType, index) => {
                    const fuel = this.normalizeFuelType(fuelType.textContent.trim());
                    const rateEl = rateElements[index * 2]; // US rate is first
                    
                    if (rateEl) {
                        const rate = parseFloat(rateEl.textContent.trim()) || 0;
                        if (rate >= 0 && rate < 2) { // Sanity check
                            rates[code].rates[fuel] = rate;
                        }
                    }
                });
                parsedCount++;
            } catch (e) {
                console.warn('Error parsing record:', e);
            }
        });
        
        console.log(`Parsed ${parsedCount} jurisdiction records`);
        
        // Extract exchange rate with validation
        const exchangeRateEl = xmlDoc.querySelector('EXCHANGE_RATE');
        let exchangeRate = { usToCanada: 1.3797, canadaToUs: 0.7248 }; // Fallback defaults
        
        if (exchangeRateEl) {
            const text = exchangeRateEl.textContent;
            // Try multiple patterns
            const patterns = [
                /(\d+\.\d+)\s*[-/]\s*(\d+\.\d+)/,
                /US\s*=?\s*(\d+\.\d+).*CAN\s*=?\s*(\d+\.\d+)/i,
                /(\d+\.\d{3,})/g
            ];
            
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1] && match[2]) {
                    const rate1 = parseFloat(match[1]);
                    const rate2 = parseFloat(match[2]);
                    // Validate rates are sensible (CAD typically 1.2-1.5 USD)
                    if (rate1 > 1 && rate1 < 2 && rate2 > 0.5 && rate2 < 1) {
                        exchangeRate = {
                            usToCanada: rate1,
                            canadaToUs: rate2
                        };
                        break;
                    }
                }
            }
        }
        
        return { rates, exchangeRate };
    },
    
    /**
     * Normalize fuel type names
     */
    normalizeFuelType(fuelType) {
        const mapping = {
            'gasoline': 'gasoline',
            'special diesel': 'diesel',
            'diesel': 'diesel',
            'gasohol': 'gasohol',
            'propane': 'propane',
            'lpg': 'propane',
            'lng': 'lng',
            'cng': 'cng',
            'ethanol': 'ethanol',
            'e-85': 'ethanol',
            'methanol': 'methanol',
            'm-85': 'methanol',
            'biodiesel': 'biodiesel',
            'a-55': 'ethanol',
            'hydrogen': 'hydrogen',
            'electricity': 'electricity'
        };
        
        return mapping[fuelType.toLowerCase()] || fuelType.toLowerCase();
    },
    
    /**
     * Scrape rates from HTML page using AI-style pattern matching
     */
    async scrapeHTMLRates() {
        try {
            const html = await this.fetchWithProxy(this.sources.taxMatrix);
            return this.parseHTMLRates(html);
        } catch (error) {
            console.error('Failed to scrape HTML rates:', error);
            throw error;
        }
    },
    
    /**
     * Parse HTML using pattern recognition (AI-like parsing)
     */
    parseHTMLRates(html) {
        const rates = {};
        
        // Extract jurisdiction blocks using regex patterns
        const jurisdictionPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>([A-Z]{2})<\/td>[\s\S]*?<\/tr>/gi;
        const ratePattern = /\$?([\d.]+)/g;
        
        // State/Province name patterns
        const stateNames = {
            'AL': 'Alabama', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
            'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida',
            'GA': 'Georgia', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana',
            'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
            'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan',
            'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana',
            'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
            'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 
            'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon',
            'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
            'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
            'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
            'WI': 'Wisconsin', 'WY': 'Wyoming',
            // Canadian
            'AB': 'Alberta', 'BC': 'British Columbia', 'MB': 'Manitoba',
            'NB': 'New Brunswick', 'NL': 'Newfoundland and Labrador',
            'NS': 'Nova Scotia', 'ON': 'Ontario', 'PE': 'Prince Edward Island',
            'QC': 'Quebec', 'SK': 'Saskatchewan'
        };
        
        // Try to extract structured data from tables
        const tablePattern = /<table[^>]*class="[^"]*matrix[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
        let match;
        
        while ((match = tablePattern.exec(html)) !== null) {
            const tableHtml = match[1];
            // Process table rows
            const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let rowMatch;
            
            while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
                const rowHtml = rowMatch[1];
                const cells = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
                
                if (cells.length >= 2) {
                    // First cell might be jurisdiction
                    const firstCell = cells[0].replace(/<[^>]*>/g, '').trim();
                    const code = firstCell.match(/^([A-Z]{2})$/)?.[1];
                    
                    if (code && stateNames[code]) {
                        rates[code] = {
                            code,
                            name: stateNames[code],
                            country: ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'QC', 'SK'].includes(code) ? 'CAN' : 'US',
                            rates: {}
                        };
                        
                        // Try to extract rates from subsequent cells
                        for (let i = 1; i < cells.length && i <= 8; i++) {
                            const cellContent = cells[i].replace(/<[^>]*>/g, '').trim();
                            const rateMatch = cellContent.match(/\$?([\d.]+)/);
                            if (rateMatch) {
                                const fuelTypes = ['gasoline', 'diesel', 'gasohol', 'propane', 'lng', 'cng', 'ethanol', 'methanol'];
                                if (fuelTypes[i - 1]) {
                                    rates[code].rates[fuelTypes[i - 1]] = parseFloat(rateMatch[1]);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return rates;
    },
    
    /**
     * Main function to fetch latest rates
     */
    async fetchLatestRates(quarter = null) {
        const targetQuarter = quarter || this.getCurrentQuarter();
        
        console.log(`Fetching IFTA rates for ${targetQuarter}...`);
        
        // Try XML first (most reliable)
        try {
            const result = await this.fetchXMLRates(targetQuarter);
            console.log(`Successfully fetched ${Object.keys(result.rates).length} jurisdictions from XML`);
            return {
                success: true,
                quarter: targetQuarter,
                source: 'xml',
                ...result
            };
        } catch (xmlError) {
            console.log('XML fetch failed, trying HTML scrape...');
        }
        
        // Fallback to HTML scraping
        try {
            const rates = await this.scrapeHTMLRates();
            console.log(`Successfully scraped ${Object.keys(rates).length} jurisdictions from HTML`);
            return {
                success: true,
                quarter: targetQuarter,
                source: 'html',
                rates,
                exchangeRate: { usToCanada: 1.3797, canadaToUs: 0.7248 }
            };
        } catch (htmlError) {
            console.error('All fetch methods failed');
            return {
                success: false,
                quarter: targetQuarter,
                error: 'Unable to fetch rates. Please check your internet connection or try again later.'
            };
        }
    },
    
    /**
     * Update the local tax rates with fetched data
     */
    updateLocalRates(fetchedData) {
        if (!fetchedData.success || !fetchedData.rates) {
            return false;
        }
        
        // Update exchange rate
        if (fetchedData.exchangeRate) {
            IFTA_TAX_RATES.exchangeRate = fetchedData.exchangeRate;
        }
        
        // Update quarter
        IFTA_TAX_RATES.quarter = fetchedData.quarter;
        IFTA_TAX_RATES.lastUpdated = new Date().toISOString().split('T')[0];
        
        // Update individual jurisdiction rates
        Object.entries(fetchedData.rates).forEach(([code, data]) => {
            if (IFTA_TAX_RATES.jurisdictions[code]) {
                // Merge new rates with existing
                Object.entries(data.rates).forEach(([fuelType, rate]) => {
                    if (rate > 0) {
                        IFTA_TAX_RATES.jurisdictions[code].rates[fuelType] = rate;
                    }
                });
            }
        });
        
        // Save to localStorage for persistence
        try {
            localStorage.setItem('iftaRatesCache', JSON.stringify({
                quarter: IFTA_TAX_RATES.quarter,
                lastUpdated: IFTA_TAX_RATES.lastUpdated,
                exchangeRate: IFTA_TAX_RATES.exchangeRate,
                jurisdictions: IFTA_TAX_RATES.jurisdictions
            }));
        } catch (e) {
            console.warn('Could not cache rates to localStorage');
        }
        
        return true;
    },
    
    /**
     * Load cached rates from localStorage
     */
    loadCachedRates() {
        try {
            const cached = localStorage.getItem('iftaRatesCache');
            if (!cached) return false;
            
            const data = JSON.parse(cached);
            
            // Validate data structure
            if (!data || !data.lastUpdated || !data.jurisdictions) {
                console.warn('Invalid cache structure');
                return false;
            }
            
            // Check if cache is recent
            const cacheDate = new Date(data.lastUpdated);
            if (isNaN(cacheDate.getTime())) {
                console.warn('Invalid cache date');
                return false;
            }
            
            const now = new Date();
            const daysDiff = (now - cacheDate) / (1000 * 60 * 60 * 24);
            
            if (daysDiff < this.config.cacheExpireDays) {
                console.log(`Loading rates from cache (${Math.round(daysDiff)} days old)...`);
                IFTA_TAX_RATES.quarter = data.quarter || IFTA_TAX_RATES.quarter;
                IFTA_TAX_RATES.lastUpdated = data.lastUpdated;
                
                if (data.exchangeRate && data.exchangeRate.usToCanada) {
                    IFTA_TAX_RATES.exchangeRate = data.exchangeRate;
                }
                
                Object.entries(data.jurisdictions).forEach(([code, jurisdiction]) => {
                    if (IFTA_TAX_RATES.jurisdictions[code] && jurisdiction.rates) {
                        IFTA_TAX_RATES.jurisdictions[code].rates = { 
                            ...IFTA_TAX_RATES.jurisdictions[code].rates,
                            ...jurisdiction.rates 
                        };
                    }
                });
                
                return true;
            } else {
                console.log('Cache expired, will fetch fresh rates');
            }
        } catch (e) {
            console.warn('Could not load cached rates:', e.message);
        }
        return false;
    },
    
    /**
     * Check if rates need updating (new quarter started)
     */
    needsUpdate() {
        const currentQuarter = this.getCurrentQuarter();
        const storedQuarter = IFTA_TAX_RATES.quarter;
        
        // Parse quarters to compare
        const parseQuarter = (q) => {
            const match = q.match(/(\d)Q(\d{4})/);
            if (match) {
                return parseInt(match[2]) * 10 + parseInt(match[1]);
            }
            return 0;
        };
        
        return parseQuarter(currentQuarter) > parseQuarter(storedQuarter);
    },
    
    /**
     * Auto-update rates if needed
     */
    async autoUpdate() {
        // First try to load from cache
        this.loadCachedRates();
        
        // Check if we need to fetch new rates
        if (this.needsUpdate()) {
            console.log('New quarter detected, fetching updated rates...');
            const result = await this.fetchLatestRates();
            
            if (result.success) {
                this.updateLocalRates(result);
                return {
                    updated: true,
                    quarter: result.quarter,
                    message: `Rates updated to ${result.quarter}`
                };
            } else {
                return {
                    updated: false,
                    error: result.error
                };
            }
        }
        
        return {
            updated: false,
            message: 'Rates are current'
        };
    }
};

// Export for use in app
window.IFTARateFetcher = IFTARateFetcher;
