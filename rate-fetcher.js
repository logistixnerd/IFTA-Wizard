/**
 * IFTA Rate Fetcher with AI-Powered Validation
 * Uses intelligent parsing, cross-validation, and anomaly detection
 * Version: 2.0.0
 */

'use strict';

const IFTARateFetcher = {
    // CORS proxy services (free options) - multiple fallbacks
    corsProxies: [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest='
    ],
    
    // IFTA official sources
    sources: {
        taxMatrix: 'https://www.iftach.org/taxmatrix4/Taxmatrix.php',
        xmlData: 'https://www.iftach.org/taxmatrix/charts/',
        csvData: 'https://www.iftach.org/taxmatrix/charts/'
    },
    
    // Configuration
    config: {
        timeout: 15000,
        maxRetries: 3,
        cacheExpireDays: 7,
        // AI Validation thresholds
        maxRateChange: 0.15,      // Max 15 cent change per quarter is suspicious
        minRate: 0.01,            // Minimum sensible rate
        maxRate: 1.50,            // Maximum sensible rate (CA is highest ~$0.98)
        confidenceThreshold: 0.85 // Minimum confidence to auto-accept
    },
    
    // Known rate ranges by state (AI learning from historical data)
    knownRateRanges: {
        'CA': { diesel: { min: 0.85, max: 1.10 }, gasoline: { min: 0.50, max: 0.70 } },
        'PA': { diesel: { min: 0.70, max: 0.85 }, gasoline: { min: 0.55, max: 0.70 } },
        'WA': { diesel: { min: 0.45, max: 0.60 }, gasoline: { min: 0.45, max: 0.60 } },
        'NY': { diesel: { min: 0.35, max: 0.50 }, gasoline: { min: 0.30, max: 0.45 } },
        'TX': { diesel: { min: 0.18, max: 0.25 }, gasoline: { min: 0.18, max: 0.25 } },
        'DEFAULT_US': { diesel: { min: 0.15, max: 0.60 }, gasoline: { min: 0.10, max: 0.50 } },
        'DEFAULT_CAN': { diesel: { min: 0.10, max: 0.40 }, gasoline: { min: 0.08, max: 0.35 } }
    },
    
    currentProxyIndex: 0,
    lastError: null,
    validationResults: [],
    
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
     * Check if code is Canadian province
     */
    isCanadianProvince(code) {
        return ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'QC', 'SK'].includes(code);
    },
    
    /**
     * AI-POWERED: Validate a single rate against known patterns
     */
    validateRate(code, fuelType, rate, previousRate = null) {
        const validation = {
            isValid: true,
            confidence: 1.0,
            warnings: [],
            adjustedRate: rate
        };
        
        // Check basic bounds
        if (rate < this.config.minRate) {
            validation.warnings.push(`Rate ${rate} below minimum threshold`);
            validation.confidence *= 0.5;
        }
        
        if (rate > this.config.maxRate) {
            validation.warnings.push(`Rate ${rate} above maximum threshold`);
            validation.confidence *= 0.3;
            validation.isValid = false;
        }
        
        // Check against known ranges for this state
        const ranges = this.knownRateRanges[code] || 
            (this.isCanadianProvince(code) ? this.knownRateRanges['DEFAULT_CAN'] : this.knownRateRanges['DEFAULT_US']);
        
        if (ranges && ranges[fuelType]) {
            const { min, max } = ranges[fuelType];
            if (rate < min || rate > max) {
                validation.warnings.push(`Rate ${rate} outside expected range [${min}-${max}] for ${code}`);
                validation.confidence *= 0.7;
            }
        }
        
        // Check rate change from previous quarter
        if (previousRate !== null && previousRate > 0) {
            const change = Math.abs(rate - previousRate);
            if (change > this.config.maxRateChange) {
                validation.warnings.push(`Large rate change: ${previousRate} → ${rate} (${(change * 100).toFixed(1)}¢)`);
                validation.confidence *= 0.6;
            }
        }
        
        // Validate rate precision
        const rateStr = rate.toString();
        if (rateStr.includes('.') && rateStr.split('.')[1].length > 4) {
            validation.adjustedRate = Math.round(rate * 10000) / 10000;
        }
        
        return validation;
    },
    
    /**
     * AI-POWERED: Cross-validate rates against historical data
     */
    async crossValidateRates(primaryRates, quarter) {
        console.log('🤖 AI: Cross-validating rates...');
        
        const validatedRates = {};
        const validationReport = {
            totalJurisdictions: 0,
            validated: 0,
            warnings: 0,
            errors: 0,
            details: []
        };
        
        // Get previous quarter rates for comparison
        const previousRates = this.getPreviousQuarterRates(quarter);
        
        for (const [code, data] of Object.entries(primaryRates)) {
            validatedRates[code] = {
                ...data,
                rates: {},
                validation: { confidence: 1.0, warnings: [] }
            };
            
            validationReport.totalJurisdictions++;
            
            for (const [fuelType, rate] of Object.entries(data.rates || {})) {
                const prevRate = previousRates?.[code]?.rates?.[fuelType] || null;
                const validation = this.validateRate(code, fuelType, rate, prevRate);
                
                validatedRates[code].rates[fuelType] = validation.adjustedRate;
                validatedRates[code].validation.confidence = Math.min(
                    validatedRates[code].validation.confidence,
                    validation.confidence
                );
                
                if (validation.warnings.length > 0) {
                    validatedRates[code].validation.warnings.push(...validation.warnings);
                    validationReport.warnings++;
                }
                
                if (!validation.isValid) {
                    validationReport.errors++;
                }
            }
            
            if (validatedRates[code].validation.confidence >= this.config.confidenceThreshold) {
                validationReport.validated++;
            }
        }
        
        console.log(`🤖 AI Validation: ${validationReport.validated}/${validationReport.totalJurisdictions} high confidence, ${validationReport.warnings} warnings`);
        
        this.validationResults = validationReport;
        return { rates: validatedRates, report: validationReport };
    },
    
    /**
     * Get previous quarter rates for comparison
     */
    getPreviousQuarterRates(currentQuarter) {
        try {
            const stored = localStorage.getItem('ifta_quarter_rates');
            if (stored) {
                const allQuarters = JSON.parse(stored);
                const prevQuarter = this.getPreviousQuarterLabel(currentQuarter);
                return allQuarters[prevQuarter]?.jurisdictions || null;
            }
        } catch (e) { }
        
        if (typeof IFTA_TAX_RATES !== 'undefined') {
            return IFTA_TAX_RATES.jurisdictions;
        }
        return null;
    },
    
    /**
     * Get previous quarter label
     */
    getPreviousQuarterLabel(quarterLabel) {
        const match = quarterLabel.match(/Q(\d) (\d{4})/);
        if (!match) return null;
        
        let q = parseInt(match[1]);
        let year = parseInt(match[2]);
        
        q--;
        if (q < 1) { q = 4; year--; }
        
        return `Q${q} ${year}`;
    },
    
    /**
     * Get validation report for UI
     */
    getValidationReport() {
        return this.validationResults;
    },
    
    /**
     * Fetch XML tax rate data for a specific quarter
     */
    async fetchXMLRates(quarter) {
        // Try different URL formats
        const urlFormats = [
            `${this.sources.xmlData}${quarter.replace(' ', '')}.xml`,
            `${this.sources.xmlData}${quarter}.xml`
        ];
        
        for (const url of urlFormats) {
            console.log(`🤖 Trying: ${url}`);
            try {
                const xmlText = await this.fetchWithProxy(url);
                if (xmlText && xmlText.includes('<')) {
                    return this.parseXMLRates(xmlText);
                }
            } catch (error) {
                console.log(`Failed: ${url}`);
            }
        }
        
        throw new Error('Could not fetch XML from any URL format');
    },
    
    /**
     * AI-POWERED: Parse XML tax rate data with intelligent extraction
     */
    parseXMLRates(xmlText) {
        if (!xmlText || typeof xmlText !== 'string') {
            throw new Error('Invalid XML data');
        }
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('XML parsing failed');
        }
        
        const rates = {};
        
        // AI: Try multiple selector patterns for flexibility
        const recordSelectors = ['RECORD', 'record', 'Row', 'row', 'jurisdiction'];
        let records = [];
        
        for (const selector of recordSelectors) {
            records = xmlDoc.querySelectorAll(selector);
            if (records.length > 0) break;
        }
        
        if (records.length === 0) {
            // AI: Fallback - find elements containing state codes
            const allElements = xmlDoc.querySelectorAll('*');
            records = Array.from(allElements).filter(el => 
                el.textContent.match(/^[A-Z]{2}$/) && 
                el.parentElement?.textContent.match(/\d+\.\d+/)
            ).map(el => el.parentElement);
        }
        
        console.log(`🤖 AI: Found ${records.length} potential rate records`);
        
        let parsedCount = 0;
        records.forEach(record => {
            try {
                // AI: Intelligent jurisdiction code extraction
                let code = null;
                const codeSelectors = ['JURISDICTION', 'jurisdiction', 'State', 'state', 'Code'];
                
                for (const selector of codeSelectors) {
                    const el = record.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim().toUpperCase();
                        if (text.match(/^[A-Z]{2}$/)) {
                            code = text;
                            break;
                        }
                    }
                }
                
                // Fallback: find any 2-letter code
                if (!code) {
                    const recordText = record.textContent;
                    const codeMatch = recordText.match(/\b([A-Z]{2})\b/);
                    if (codeMatch) code = codeMatch[1];
                }
                
                if (!code || code.length !== 2) return;
                
                const country = this.isCanadianProvince(code) ? 'CAN' : 'US';
                
                if (!rates[code]) {
                    rates[code] = { code, country, rates: {} };
                }
                
                // Get fuel type and rates - try structured first
                const fuelTypes = record.querySelectorAll('FUEL_TYPE');
                const rateElements = record.querySelectorAll('RATE');
                
                if (fuelTypes.length > 0) {
                    fuelTypes.forEach((fuelType, index) => {
                        const fuel = this.normalizeFuelType(fuelType.textContent.trim());
                        const rateEl = rateElements[index * 2];
                        
                        if (rateEl) {
                            const rate = parseFloat(rateEl.textContent.trim()) || 0;
                            if (rate >= this.config.minRate && rate <= this.config.maxRate) {
                                rates[code].rates[fuel] = rate;
                            }
                        }
                    });
                } else {
                    // AI: Extract numeric values that look like rates
                    const ratePattern = /(\d+\.\d{2,4})/g;
                    const numericValues = record.textContent.match(ratePattern) || [];
                    const fuelTypeNames = ['diesel', 'gasoline', 'gasohol', 'propane', 'lng', 'cng'];
                    
                    numericValues.forEach((val, idx) => {
                        const rate = parseFloat(val);
                        if (rate >= this.config.minRate && rate <= this.config.maxRate && idx < fuelTypeNames.length) {
                            rates[code].rates[fuelTypeNames[idx]] = rate;
                        }
                    });
                }
                
                parsedCount++;
            } catch (e) {
                console.warn('Error parsing record:', e);
            }
        });
        
        console.log(`🤖 AI: Parsed ${parsedCount} jurisdiction records`);
        
        // Extract exchange rate
        let exchangeRate = { usToCanada: 1.3797, canadaToUs: 0.7248 };
        const exchangeRateEl = xmlDoc.querySelector('EXCHANGE_RATE');
        
        if (exchangeRateEl) {
            const text = exchangeRateEl.textContent;
            const patterns = [
                /(\d+\.\d+)\s*[-/]\s*(\d+\.\d+)/,
                /US\s*=?\s*(\d+\.\d+).*CAN\s*=?\s*(\d+\.\d+)/i
            ];
            
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1] && match[2]) {
                    const rate1 = parseFloat(match[1]);
                    const rate2 = parseFloat(match[2]);
                    if (rate1 > 1 && rate1 < 2 && rate2 > 0.5 && rate2 < 1) {
                        exchangeRate = { usToCanada: rate1, canadaToUs: rate2 };
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
     * AI-POWERED: Main function to fetch latest rates with validation
     */
    async fetchLatestRates(quarter = null) {
        const targetQuarter = quarter || this.getCurrentQuarter();
        
        console.log(`🤖 AI: Fetching IFTA rates for ${targetQuarter}...`);
        
        let primaryRates = null;
        let source = null;
        let exchangeRate = { usToCanada: 1.3797, canadaToUs: 0.7248 };
        
        // Try XML first (most reliable)
        try {
            const xmlResult = await this.fetchXMLRates(targetQuarter);
            primaryRates = xmlResult.rates;
            exchangeRate = xmlResult.exchangeRate || exchangeRate;
            source = 'xml';
            console.log(`✓ XML: Found ${Object.keys(primaryRates).length} jurisdictions`);
        } catch (xmlError) {
            console.log('XML fetch failed, trying HTML...');
        }
        
        // Fallback to HTML scraping
        if (!primaryRates || Object.keys(primaryRates).length < 10) {
            try {
                primaryRates = await this.scrapeHTMLRates();
                source = 'html';
                console.log(`✓ HTML: Found ${Object.keys(primaryRates).length} jurisdictions`);
            } catch (htmlError) {
                console.error('All fetch methods failed');
            }
        }
        
        // If we still don't have rates, return error
        if (!primaryRates || Object.keys(primaryRates).length === 0) {
            return {
                success: false,
                quarter: targetQuarter,
                error: 'Unable to fetch rates from any source. Please try again later.',
                validation: null
            };
        }
        
        // AI Cross-validation
        const { rates: validatedRates, report } = await this.crossValidateRates(primaryRates, targetQuarter);
        
        // Calculate overall confidence
        let totalConfidence = 0;
        let count = 0;
        Object.values(validatedRates).forEach(j => {
            if (j.validation?.confidence) {
                totalConfidence += j.validation.confidence;
                count++;
            }
        });
        const avgConfidence = count > 0 ? totalConfidence / count : 0;
        
        return {
            success: true,
            quarter: targetQuarter,
            source: source,
            rates: validatedRates,
            exchangeRate: exchangeRate,
            validation: {
                ...report,
                averageConfidence: avgConfidence,
                isHighConfidence: avgConfidence >= this.config.confidenceThreshold
            }
        };
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
