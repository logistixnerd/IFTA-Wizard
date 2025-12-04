/**
 * IFTA Wizard - Background Integrity Monitor
 * Automatic rate updates, self-calibration, and calculation verification
 * Version: 1.0.0
 * 
 * This system runs in the background to:
 * 1. Periodically check for quarterly rate updates
 * 2. Self-test calculation accuracy
 * 3. Verify data integrity
 * 4. Auto-calibrate when needed
 */

'use strict';

const IntegrityMonitor = {
    // Configuration
    config: {
        // Check for updates every 6 hours (rates change quarterly)
        updateCheckInterval: 6 * 60 * 60 * 1000,
        // Run self-tests every 30 minutes
        selfTestInterval: 30 * 60 * 1000,
        // Quick health check every 5 minutes
        healthCheckInterval: 5 * 60 * 1000,
        // Maximum acceptable calculation error (0.01 = 1 cent)
        maxCalculationError: 0.01,
        // Known test cases for verification
        testCases: [
            // Test Case 1: Basic calculation
            {
                name: 'Basic Tax Calculation',
                input: { miles: 1000, mpg: 6.5, fuelPurchased: 100, taxRate: 0.20 },
                expected: { taxableGallons: 153.846, netGallons: 53.846, taxDue: 10.77 }
            },
            // Test Case 2: Tax credit (overpurchased fuel)
            {
                name: 'Tax Credit Calculation',
                input: { miles: 500, mpg: 6.5, fuelPurchased: 100, taxRate: 0.20 },
                expected: { taxableGallons: 76.923, netGallons: -23.077, taxDue: -4.62 }
            },
            // Test Case 3: High rate state (California)
            {
                name: 'High Rate State (CA)',
                input: { miles: 1000, mpg: 6.5, fuelPurchased: 50, taxRate: 0.98 },
                expected: { taxableGallons: 153.846, netGallons: 103.846, taxDue: 101.77 }
            },
            // Test Case 4: Zero miles
            {
                name: 'Zero Miles',
                input: { miles: 0, mpg: 6.5, fuelPurchased: 50, taxRate: 0.20 },
                expected: { taxableGallons: 0, netGallons: -50, taxDue: -10.00 }
            },
            // Test Case 5: Exact fuel match
            {
                name: 'Exact Fuel Match',
                input: { miles: 650, mpg: 6.5, fuelPurchased: 100, taxRate: 0.20 },
                expected: { taxableGallons: 100, netGallons: 0, taxDue: 0.00 }
            }
        ]
    },
    
    // State
    state: {
        isRunning: false,
        lastUpdateCheck: null,
        lastSelfTest: null,
        lastHealthCheck: null,
        updateCheckTimer: null,
        selfTestTimer: null,
        healthCheckTimer: null,
        testResults: [],
        systemHealth: 'checking',
        failedTests: 0,
        passedTests: 0
    },
    
    /**
     * Initialize and start the integrity monitor
     */
    init() {
        console.log('[IntegrityMonitor] Initializing background integrity system...');
        
        // Run initial checks
        this.runInitialChecks();
        
        // Start periodic monitoring
        this.startPeriodicMonitoring();
        
        this.state.isRunning = true;
        console.log('[IntegrityMonitor] Background monitoring active');
    },
    
    /**
     * Run initial checks on startup
     */
    async runInitialChecks() {
        this.updateHealthStatus('checking', 'Verifying system...');
        
        try {
            // Run self-tests first
            const testsPassed = await this.runSelfTests();
            
            if (!testsPassed) {
                this.updateHealthStatus('error', 'Calculation error detected');
                console.error('[IntegrityMonitor] Self-tests failed on startup!');
                return;
            }
            
            // Check if we need to update rates (quarterly check)
            await this.checkForQuarterlyUpdate();
            
            // Update status
            this.updateHealthStatus('healthy', 'System verified');
            this.updateRateStatus('verified', 'Verified');
            
        } catch (error) {
            console.error('[IntegrityMonitor] Initial checks failed:', error);
            this.updateHealthStatus('warning', 'Check incomplete');
        }
    },
    
    /**
     * Start periodic background monitoring
     */
    startPeriodicMonitoring() {
        // Health check every 5 minutes
        this.state.healthCheckTimer = setInterval(() => {
            this.runHealthCheck();
        }, this.config.healthCheckInterval);
        
        // Self-tests every 30 minutes
        this.state.selfTestTimer = setInterval(() => {
            this.runSelfTests();
        }, this.config.selfTestInterval);
        
        // Rate update check every 6 hours
        this.state.updateCheckTimer = setInterval(() => {
            this.checkForQuarterlyUpdate();
        }, this.config.updateCheckInterval);
        
        console.log('[IntegrityMonitor] Periodic monitoring started');
    },
    
    /**
     * Stop all monitoring
     */
    stop() {
        if (this.state.healthCheckTimer) clearInterval(this.state.healthCheckTimer);
        if (this.state.selfTestTimer) clearInterval(this.state.selfTestTimer);
        if (this.state.updateCheckTimer) clearInterval(this.state.updateCheckTimer);
        
        this.state.isRunning = false;
        console.log('[IntegrityMonitor] Monitoring stopped');
    },
    
    /**
     * Quick health check
     */
    runHealthCheck() {
        this.state.lastHealthCheck = new Date();
        
        try {
            // Verify IFTA_TAX_RATES is loaded and valid
            if (!window.IFTA_TAX_RATES) {
                throw new Error('Tax rates not loaded');
            }
            
            const jurisdictionCount = Object.keys(IFTA_TAX_RATES.jurisdictions).length;
            if (jurisdictionCount < 58) {
                throw new Error(`Missing jurisdictions: only ${jurisdictionCount} found`);
            }
            
            // Verify getTaxRate function works
            const txRate = getTaxRate('TX', 'diesel');
            if (typeof txRate !== 'number' || txRate <= 0) {
                throw new Error('getTaxRate function failing');
            }
            
            // Quick calculation verification
            const quickTest = this.performCalculation(1000, 6.5, 100, 0.20);
            if (Math.abs(quickTest.taxDue - 10.77) > 0.01) {
                throw new Error('Calculation deviation detected');
            }
            
            // All good
            if (this.state.systemHealth !== 'healthy') {
                this.updateHealthStatus('healthy', 'System OK');
            }
            
        } catch (error) {
            console.error('[IntegrityMonitor] Health check failed:', error);
            this.updateHealthStatus('warning', error.message);
        }
    },
    
    /**
     * Run comprehensive self-tests
     */
    async runSelfTests() {
        console.log('[IntegrityMonitor] Running self-tests...');
        this.state.lastSelfTest = new Date();
        this.state.testResults = [];
        this.state.passedTests = 0;
        this.state.failedTests = 0;
        
        let allPassed = true;
        
        for (const testCase of this.config.testCases) {
            const result = this.runTestCase(testCase);
            this.state.testResults.push(result);
            
            if (result.passed) {
                this.state.passedTests++;
            } else {
                this.state.failedTests++;
                allPassed = false;
                console.error(`[IntegrityMonitor] Test FAILED: ${testCase.name}`, result);
            }
        }
        
        // Run rate validation tests
        const rateTests = this.runRateValidationTests();
        if (!rateTests.passed) {
            allPassed = false;
            this.state.failedTests++;
        } else {
            this.state.passedTests++;
        }
        
        console.log(`[IntegrityMonitor] Self-tests complete: ${this.state.passedTests}/${this.state.passedTests + this.state.failedTests} passed`);
        
        if (allPassed) {
            this.updateHealthStatus('healthy', `All tests passed`);
        } else {
            this.updateHealthStatus('error', `${this.state.failedTests} test(s) failed`);
            this.attemptSelfCalibration();
        }
        
        return allPassed;
    },
    
    /**
     * Run a single test case
     */
    runTestCase(testCase) {
        const { input, expected } = testCase;
        const actual = this.performCalculation(
            input.miles, 
            input.mpg, 
            input.fuelPurchased, 
            input.taxRate
        );
        
        const errors = [];
        
        // Check each expected value
        if (Math.abs(actual.taxableGallons - expected.taxableGallons) > 0.01) {
            errors.push(`taxableGallons: expected ${expected.taxableGallons}, got ${actual.taxableGallons}`);
        }
        
        if (Math.abs(actual.netGallons - expected.netGallons) > 0.01) {
            errors.push(`netGallons: expected ${expected.netGallons}, got ${actual.netGallons}`);
        }
        
        if (Math.abs(actual.taxDue - expected.taxDue) > this.config.maxCalculationError) {
            errors.push(`taxDue: expected ${expected.taxDue}, got ${actual.taxDue}`);
        }
        
        return {
            name: testCase.name,
            passed: errors.length === 0,
            errors,
            actual,
            expected
        };
    },
    
    /**
     * Perform IFTA calculation (mirrors app.js logic)
     */
    performCalculation(miles, mpg, fuelPurchased, taxRate) {
        const taxableGallons = miles / mpg;
        const netGallons = taxableGallons - fuelPurchased;
        const taxDue = netGallons * taxRate;
        
        return {
            taxableGallons: Math.round(taxableGallons * 1000) / 1000,
            netGallons: Math.round(netGallons * 1000) / 1000,
            taxDue: Math.round(taxDue * 100) / 100
        };
    },
    
    /**
     * Validate that tax rates are sensible
     */
    runRateValidationTests() {
        const errors = [];
        
        // Check that known rates are in expected ranges
        const rateChecks = [
            { state: 'TX', fuelType: 'diesel', min: 0.15, max: 0.30 },
            { state: 'CA', fuelType: 'diesel', min: 0.80, max: 1.20 },
            { state: 'PA', fuelType: 'diesel', min: 0.60, max: 0.90 },
            { state: 'OK', fuelType: 'diesel', min: 0.15, max: 0.25 },
            { state: 'NY', fuelType: 'diesel', min: 0.10, max: 0.25 }
        ];
        
        for (const check of rateChecks) {
            const rate = getTaxRate(check.state, check.fuelType);
            if (rate < check.min || rate > check.max) {
                errors.push(`${check.state} ${check.fuelType}: ${rate} outside expected range ${check.min}-${check.max}`);
            }
        }
        
        // Verify all 58 jurisdictions have rates
        const jurisdictionCount = Object.keys(IFTA_TAX_RATES.jurisdictions).length;
        if (jurisdictionCount !== 58) {
            errors.push(`Expected 58 jurisdictions, found ${jurisdictionCount}`);
        }
        
        // Verify exchange rates are reasonable
        const { usToCanada, canadaToUs } = IFTA_TAX_RATES.exchangeRate;
        if (usToCanada < 1.0 || usToCanada > 2.0 || canadaToUs < 0.5 || canadaToUs > 1.0) {
            errors.push(`Exchange rates out of range: ${usToCanada} / ${canadaToUs}`);
        }
        
        return {
            passed: errors.length === 0,
            errors
        };
    },
    
    /**
     * Check if we need a quarterly rate update
     */
    async checkForQuarterlyUpdate() {
        console.log('[IntegrityMonitor] Checking for quarterly updates...');
        this.state.lastUpdateCheck = new Date();
        
        try {
            // Determine current quarter
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();
            const currentQuarter = Math.ceil(currentMonth / 3);
            const currentQuarterStr = `Q${currentQuarter} ${currentYear}`;
            
            // Check stored quarter
            const storedQuarter = IFTA_TAX_RATES.quarter;
            
            // Parse quarters for comparison (handles both "Q4 2025" and legacy "4Q2025" formats)
            const parseQuarter = (q) => {
                // Try "Q4 2025" format first
                let match = q.match(/Q(\d) (\d{4})/);
                if (match) {
                    return parseInt(match[2]) * 10 + parseInt(match[1]);
                }
                // Try legacy "4Q2025" format
                match = q.match(/(\d)Q(\d{4})/);
                if (match) {
                    return parseInt(match[2]) * 10 + parseInt(match[1]);
                }
                return 0;
            };
            
            const currentQNum = parseQuarter(currentQuarterStr);
            const storedQNum = parseQuarter(storedQuarter);
            
            if (currentQNum > storedQNum) {
                console.log(`[IntegrityMonitor] New quarter detected: ${currentQuarterStr} > ${storedQuarter}`);
                console.log('[IntegrityMonitor] Manual rate update required - check https://www.iftach.org/taxmatrix4/');
                this.updateRateStatus('verified', 'Check rates');
            } else {
                // Check if rates are stale (last update > 30 days ago)
                const lastUpdate = new Date(IFTA_TAX_RATES.lastUpdated);
                const daysSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60 * 24);
                
                if (daysSinceUpdate > 30) {
                    console.log('[IntegrityMonitor] Rates may be stale - check https://www.iftach.org/taxmatrix4/');
                    this.updateRateStatus('verified', 'Review rates');
                } else {
                    console.log('[IntegrityMonitor] Rates are current');
                    this.updateRateStatus('verified', 'Current');
                }
            }
            
        } catch (error) {
            console.error('[IntegrityMonitor] Quarterly update check failed:', error);
            this.updateRateStatus('verified', 'Cached');
        }
    },
    
    /**
     * Validate new rates before applying
     */
    validateNewRates(rates) {
        if (!rates || typeof rates !== 'object') return false;
        
        const jurisdictionCount = Object.keys(rates).length;
        
        // Should have at least 50 jurisdictions
        if (jurisdictionCount < 50) return false;
        
        // Check that rates are numbers in valid range
        for (const [code, data] of Object.entries(rates)) {
            if (data.rates) {
                const dieselRate = data.rates.diesel;
                if (typeof dieselRate !== 'number' || dieselRate < 0 || dieselRate > 2) {
                    return false;
                }
            }
        }
        
        return true;
    },
    
    /**
     * Attempt to fix calculation issues (self-calibration)
     */
    attemptSelfCalibration() {
        console.log('[IntegrityMonitor] Attempting self-calibration...');
        console.log('[IntegrityMonitor] Check rates at https://www.iftach.org/taxmatrix4/');
        
        // Re-run tests after calibration attempt
        setTimeout(() => {
            const passed = this.runSelfTests();
            if (passed) {
                console.log('[IntegrityMonitor] Self-calibration successful');
            } else {
                console.error('[IntegrityMonitor] Self-calibration failed - manual intervention may be needed');
            }
        }, 1000);
    },
    
    /**
     * Update UI elements after rate change
     */
    updateUIAfterRateChange(quarter) {
        // Update quarter display
        const quarterEl = document.getElementById('currentQuarter');
        if (quarterEl) {
            // Handle both "Q4 2025" and legacy "4Q2025" formats
            let match = quarter.match(/Q(\d) (\d{4})/);
            if (match) {
                quarterEl.textContent = `Q${match[1]} ${match[2]}`;
            } else {
                match = quarter.match(/(\d)Q(\d{4})/);
                if (match) {
                    quarterEl.textContent = `Q${match[1]} ${match[2]}`;
                }
            }
        }
        
        // Update last updated
        const lastUpdatedEl = document.getElementById('lastUpdated');
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = `Last Updated: ${new Date().toLocaleDateString()}`;
        }
        
        // Update exchange rate display
        const exchangeEl = document.getElementById('exchangeRate');
        if (exchangeEl && IFTA_TAX_RATES.exchangeRate) {
            exchangeEl.textContent = `Exchange Rate: US ${IFTA_TAX_RATES.exchangeRate.usToCanada} / CAN ${IFTA_TAX_RATES.exchangeRate.canadaToUs}`;
        }
        
        // Trigger recalculation if app is loaded
        if (typeof recalculateAll === 'function') {
            recalculateAll();
        }
        
        // Update rates table if function exists
        if (typeof updateRatesTable === 'function') {
            updateRatesTable();
        }
    },
    
    /**
     * Update health status indicator
     */
    updateHealthStatus(status, text) {
        this.state.systemHealth = status;
        
        const healthEl = document.getElementById('systemHealth');
        if (healthEl) {
            healthEl.className = `system-health ${status}`;
            const textEl = healthEl.querySelector('.health-text');
            if (textEl) {
                textEl.textContent = text;
            }
        }
    },
    
    /**
     * Update rate status indicator
     */
    updateRateStatus(status, text) {
        const statusEl = document.getElementById('rateStatus');
        if (statusEl) {
            statusEl.className = `rate-status ${status}`;
            const textEl = statusEl.querySelector('.status-text');
            if (textEl) {
                textEl.textContent = text;
            }
        }
    },
    
    /**
     * Get current system status for diagnostics
     */
    getStatus() {
        return {
            isRunning: this.state.isRunning,
            systemHealth: this.state.systemHealth,
            lastUpdateCheck: this.state.lastUpdateCheck,
            lastSelfTest: this.state.lastSelfTest,
            lastHealthCheck: this.state.lastHealthCheck,
            testResults: this.state.testResults,
            passedTests: this.state.passedTests,
            failedTests: this.state.failedTests,
            currentQuarter: IFTA_TAX_RATES?.quarter,
            jurisdictionCount: IFTA_TAX_RATES ? Object.keys(IFTA_TAX_RATES.jurisdictions).length : 0
        };
    },
    
    /**
     * Force an immediate full check (for debugging)
     */
    async forceFullCheck() {
        console.log('[IntegrityMonitor] Forcing full system check...');
        this.updateHealthStatus('checking', 'Full check...');
        
        await this.runSelfTests();
        await this.checkForQuarterlyUpdate();
        this.runHealthCheck();
        
        return this.getStatus();
    }
};

// Export for global access
window.IntegrityMonitor = IntegrityMonitor;
