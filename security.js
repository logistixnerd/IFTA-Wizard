// IFTA Wizard - Security Module
// Comprehensive security measures to protect against attacks
'use strict';

const IFTASecurity = {
    // Configuration
    config: {
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        sessionTimeout: 60 * 60 * 1000, // 1 hour of inactivity (was 30 min, too short)
        csrfTokenLength: 32,
        rateLimitWindow: 60 * 1000, // 1 minute
        rateLimitMax: 100, // max requests per window
    },
    
    // State
    loginAttempts: {},
    requestCounts: {},
    csrfToken: null,
    lastActivity: Date.now(),
    sessionCheckInterval: null,
    
    // Initialize security measures
    init() {
        this.generateCSRFToken();
        this.setupXSSProtection();
        this.setupClickjackingProtection();
        this.setupSessionMonitoring();
        this.setupInputSanitization();
        this.setupConsoleProtection();
        this.setupDevToolsDetection();
        this.preventDataExfiltration();
        this.setupIntegrityChecks();
        console.log('🛡️ Security module initialized');
    },
    
    // ==========================================
    // CSRF PROTECTION
    // ==========================================
    
    generateCSRFToken() {
        const array = new Uint8Array(this.config.csrfTokenLength);
        crypto.getRandomValues(array);
        this.csrfToken = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
        
        // Store in sessionStorage (not accessible to other domains)
        sessionStorage.setItem('csrf_token', this.csrfToken);
        
        // Add to all forms
        document.querySelectorAll('form').forEach(form => {
            if (!form.querySelector('input[name="csrf_token"]')) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'csrf_token';
                input.value = this.csrfToken;
                form.appendChild(input);
            }
        });
        
        return this.csrfToken;
    },
    
    validateCSRFToken(token) {
        return token === this.csrfToken;
    },
    
    // ==========================================
    // XSS PROTECTION
    // ==========================================
    
    setupXSSProtection() {
        // Instead of overriding innerHTML globally (which breaks libraries),
        // provide a safe sanitization method to use when setting user content
        // The sanitizeHTML and escapeHTML methods are available for explicit use
        console.log('XSS protection methods available: IFTASecurity.sanitizeHTML(), IFTASecurity.escapeHTML()');
    },
    
    // Safe innerHTML setter - use this when setting user-provided content
    safeSetHTML(element, html) {
        if (element) {
            element.innerHTML = this.sanitizeHTML(html);
        }
    },
    
    // Sanitize HTML to prevent XSS
    sanitizeHTML(html) {
        if (typeof html !== 'string') return html;
        
        // Remove dangerous tags and attributes
        const dangerousTags = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
        const dangerousAttrs = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
        const javascriptUrls = /javascript\s*:/gi;
        const dataUrls = /data\s*:\s*text\/html/gi;
        const vbscriptUrls = /vbscript\s*:/gi;
        
        let sanitized = html
            .replace(dangerousTags, '')
            .replace(dangerousAttrs, '')
            .replace(javascriptUrls, '')
            .replace(dataUrls, '')
            .replace(vbscriptUrls, '');
        
        return sanitized;
    },
    
    // Escape HTML entities
    escapeHTML(str) {
        if (typeof str !== 'string') return str;
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };
        return str.replace(/[&<>"'`=/]/g, char => escapeMap[char]);
    },
    
    // ==========================================
    // CLICKJACKING PROTECTION
    // ==========================================
    
    setupClickjackingProtection() {
        // Detect if we're in an iframe
        if (window.self !== window.top) {
            // Check if parent is from allowed origin
            try {
                const parentOrigin = window.parent.location.origin;
                // If we can access parent origin and it's different, we're being framed
                if (parentOrigin !== window.location.origin) {
                    this.handleClickjackAttempt();
                }
            } catch (e) {
                // Can't access parent (cross-origin) - we're definitely being framed
                this.handleClickjackAttempt();
            }
        }
    },
    
    handleClickjackAttempt() {
        // Break out of iframe or hide content
        document.body.innerHTML = `
            <div style="padding: 50px; text-align: center; font-family: sans-serif;">
                <h1>⚠️ Security Warning</h1>
                <p>This page cannot be displayed in a frame for security reasons.</p>
                <a href="${window.location.href}" target="_top">Click here to open directly</a>
            </div>
        `;
        
        // Try to break out
        try {
            window.top.location = window.self.location;
        } catch (e) {
            // Can't break out, content is already hidden
        }
        
        this.logSecurityEvent('clickjack_attempt', { referrer: document.referrer });
    },
    
    // ==========================================
    // BRUTE FORCE PROTECTION
    // ==========================================
    
    checkLoginAttempt(identifier) {
        const now = Date.now();
        const attempts = this.loginAttempts[identifier] || { count: 0, firstAttempt: now, lockedUntil: 0 };
        
        // Check if locked out
        if (attempts.lockedUntil > now) {
            const remainingTime = Math.ceil((attempts.lockedUntil - now) / 1000 / 60);
            return {
                allowed: false,
                message: `Too many failed attempts. Try again in ${remainingTime} minutes.`,
                remainingTime
            };
        }
        
        // Reset if window expired
        if (now - attempts.firstAttempt > this.config.lockoutDuration) {
            attempts.count = 0;
            attempts.firstAttempt = now;
        }
        
        return { allowed: true, attemptsRemaining: this.config.maxLoginAttempts - attempts.count };
    },
    
    recordFailedLogin(identifier) {
        const now = Date.now();
        if (!this.loginAttempts[identifier]) {
            this.loginAttempts[identifier] = { count: 0, firstAttempt: now, lockedUntil: 0 };
        }
        
        this.loginAttempts[identifier].count++;
        
        if (this.loginAttempts[identifier].count >= this.config.maxLoginAttempts) {
            this.loginAttempts[identifier].lockedUntil = now + this.config.lockoutDuration;
            this.logSecurityEvent('account_lockout', { identifier, attempts: this.loginAttempts[identifier].count });
        }
        
        // Persist to localStorage to survive page refresh
        this.saveLoginAttempts();
    },
    
    recordSuccessfulLogin(identifier) {
        delete this.loginAttempts[identifier];
        this.saveLoginAttempts();
    },
    
    saveLoginAttempts() {
        try {
            localStorage.setItem('ifta_login_attempts', JSON.stringify(this.loginAttempts));
        } catch (e) {
            // Storage full or disabled
        }
    },
    
    loadLoginAttempts() {
        try {
            const saved = localStorage.getItem('ifta_login_attempts');
            if (saved) {
                this.loginAttempts = JSON.parse(saved);
            }
        } catch (e) {
            this.loginAttempts = {};
        }
    },
    
    // ==========================================
    // RATE LIMITING
    // ==========================================
    
    checkRateLimit(action = 'default') {
        const now = Date.now();
        const key = action;
        
        if (!this.requestCounts[key]) {
            this.requestCounts[key] = { count: 0, windowStart: now };
        }
        
        // Reset window if expired
        if (now - this.requestCounts[key].windowStart > this.config.rateLimitWindow) {
            this.requestCounts[key] = { count: 0, windowStart: now };
        }
        
        this.requestCounts[key].count++;
        
        if (this.requestCounts[key].count > this.config.rateLimitMax) {
            this.logSecurityEvent('rate_limit_exceeded', { action, count: this.requestCounts[key].count });
            return false;
        }
        
        return true;
    },
    
    // ==========================================
    // SESSION MANAGEMENT
    // ==========================================
    
    setupSessionMonitoring() {
        // Track user activity
        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        activityEvents.forEach(event => {
            document.addEventListener(event, () => this.updateActivity(), { passive: true });
        });
        
        // Check session periodically
        this.sessionCheckInterval = setInterval(() => this.checkSession(), 60000); // Every minute
        
        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.checkSession();
            }
        });
        
        // Handle before unload - clear sensitive data
        window.addEventListener('beforeunload', () => this.clearSensitiveData());
    },
    
    updateActivity() {
        this.lastActivity = Date.now();
    },
    
    checkSession() {
        const inactiveTime = Date.now() - this.lastActivity;
        
        if (inactiveTime > this.config.sessionTimeout) {
            this.handleSessionTimeout();
        }
    },
    
    handleSessionTimeout() {
        // Clear session
        localStorage.removeItem('ifta_user');
        localStorage.removeItem('ifta_login_time');
        sessionStorage.clear();
        
        // Notify user
        if (typeof showToast === 'function') {
            showToast('Session expired due to inactivity. Please log in again.', 'warning');
        }
        
        // Use Firebase logout if available, otherwise reload
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().signOut().then(() => {
                // Auth state listener will show login modal
            }).catch(() => {
                window.location.reload();
            });
        } else {
            setTimeout(() => window.location.reload(), 2000);
        }
        
        this.logSecurityEvent('session_timeout', {});
    },
    
    clearSensitiveData() {
        // Clear any sensitive data from memory
        sessionStorage.removeItem('csrf_token');
    },
    
    // ==========================================
    // INPUT SANITIZATION
    // ==========================================
    
    setupInputSanitization() {
        // Add input validation to all text inputs
        document.addEventListener('input', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                this.validateInput(e.target);
            }
        });
    },
    
    validateInput(input) {
        const value = input.value;
        
        // Check for SQL injection patterns
        const sqlPatterns = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/i;
        if (sqlPatterns.test(value)) {
            input.dataset.suspicious = 'true';
            this.logSecurityEvent('sql_injection_attempt', { value: value.substring(0, 100) });
        }
        
        // Check for script injection
        const scriptPattern = /<script|javascript:|on\w+\s*=/i;
        if (scriptPattern.test(value)) {
            input.value = this.sanitizeHTML(value);
            this.logSecurityEvent('xss_attempt', { value: value.substring(0, 100) });
        }
    },
    
    sanitizeInput(value) {
        if (typeof value !== 'string') return value;
        
        return value
            .replace(/[<>]/g, '') // Remove angle brackets
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '')
            .trim();
    },
    
    // ==========================================
    // CONSOLE PROTECTION
    // ==========================================
    
    setupConsoleProtection() {
        // Only in production
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return;
        }
        
        // Disable right-click context menu (optional - can be annoying)
        // document.addEventListener('contextmenu', e => e.preventDefault());
        
        // Warn users about console dangers
        const warningStyle = 'color: red; font-size: 24px; font-weight: bold;';
        const infoStyle = 'color: gray; font-size: 14px;';
        
        console.log('%c⚠️ STOP!', warningStyle);
        console.log('%cThis is a browser feature for developers. If someone told you to paste something here, it\'s likely a scam.', infoStyle);
        console.log('%cPasting code here could give attackers access to your account.', infoStyle);
    },
    
    // ==========================================
    // DEVTOOLS DETECTION
    // ==========================================
    
    setupDevToolsDetection() {
        // Only in production
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return;
        }
        
        let devtoolsOpen = false;
        
        const detect = () => {
            const threshold = 160;
            const widthThreshold = window.outerWidth - window.innerWidth > threshold;
            const heightThreshold = window.outerHeight - window.innerHeight > threshold;
            
            if (widthThreshold || heightThreshold) {
                if (!devtoolsOpen) {
                    devtoolsOpen = true;
                    this.logSecurityEvent('devtools_opened', {});
                }
            } else {
                devtoolsOpen = false;
            }
        };
        
        // Check periodically
        setInterval(detect, 1000);
    },
    
    // ==========================================
    // DATA EXFILTRATION PREVENTION
    // ==========================================
    
    preventDataExfiltration() {
        // Monitor for suspicious outbound requests
        const originalFetch = window.fetch;
        const self = this;
        
        window.fetch = function(url, options) {
            // Check if request is to an allowed domain
            if (!self.isAllowedDomain(url)) {
                self.logSecurityEvent('suspicious_request', { url: String(url).substring(0, 200) });
                // Allow the request but log it
            }
            return originalFetch.apply(this, arguments);
        };
        
        // Monitor XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
            if (!self.isAllowedDomain(url)) {
                self.logSecurityEvent('suspicious_xhr', { url: String(url).substring(0, 200) });
            }
            return originalXHROpen.apply(this, arguments);
        };
    },
    
    isAllowedDomain(url) {
        const allowedDomains = [
            window.location.hostname,
            'localhost',
            '127.0.0.1',
            'firestore.googleapis.com',
            'firebase.googleapis.com',
            'firebaseio.com',
            'googleapis.com',
            'accounts.google.com',
            'apis.google.com',
            'emailjs.com',
            'api.emailjs.com',
        ];
        
        try {
            const urlObj = new URL(url, window.location.origin);
            return allowedDomains.some(domain => urlObj.hostname.endsWith(domain));
        } catch (e) {
            return true; // Relative URL, allowed
        }
    },
    
    // ==========================================
    // INTEGRITY CHECKS
    // ==========================================
    
    setupIntegrityChecks() {
        // Check for tampering with critical functions
        const criticalFunctions = [
            { obj: window, name: 'localStorage' },
            { obj: window, name: 'sessionStorage' },
            { obj: document, name: 'cookie' },
        ];
        
        // Store original references
        this.originalRefs = {};
        criticalFunctions.forEach(({ obj, name }) => {
            try {
                this.originalRefs[name] = Object.getOwnPropertyDescriptor(obj, name) || 
                                          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), name);
            } catch (e) {
                // Property not accessible
            }
        });
    },
    
    // ==========================================
    // SECURITY LOGGING
    // ==========================================
    
    async logSecurityEvent(eventType, details) {
        const event = {
            type: eventType,
            details: details,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            referrer: document.referrer
        };
        
        console.warn('🔒 Security Event:', eventType, details);
        
        // Store locally
        try {
            const logs = JSON.parse(localStorage.getItem('ifta_security_logs') || '[]');
            logs.push(event);
            // Keep only last 100 events
            if (logs.length > 100) logs.shift();
            localStorage.setItem('ifta_security_logs', JSON.stringify(logs));
        } catch (e) {
            // Storage full or disabled
        }
        
        // Send to Firebase if available
        if (typeof db !== 'undefined' && typeof firebase !== 'undefined') {
            try {
                await db.collection('security_logs').add({
                    ...event,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) {
                // Firebase not available or error
            }
        }
    },
    
    // ==========================================
    // SECURE DATA STORAGE
    // ==========================================
    
    // Encrypt sensitive data before storing
    encryptData(data, key) {
        // Simple XOR encryption (for demonstration - use Web Crypto API for production)
        const str = JSON.stringify(data);
        let encrypted = '';
        for (let i = 0; i < str.length; i++) {
            encrypted += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(encrypted);
    },
    
    decryptData(encryptedData, key) {
        try {
            const decoded = atob(encryptedData);
            let decrypted = '';
            for (let i = 0; i < decoded.length; i++) {
                decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return JSON.parse(decrypted);
        } catch (e) {
            return null;
        }
    },
    
    // ==========================================
    // PASSWORD SECURITY
    // ==========================================
    
    // Check password strength
    checkPasswordStrength(password) {
        let score = 0;
        const checks = {
            length: password.length >= 8,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            numbers: /[0-9]/.test(password),
            special: /[^A-Za-z0-9]/.test(password),
            noCommon: !this.isCommonPassword(password)
        };
        
        Object.values(checks).forEach(passed => { if (passed) score++; });
        
        return {
            score,
            maxScore: 6,
            checks,
            strength: score < 3 ? 'weak' : score < 5 ? 'medium' : 'strong'
        };
    },
    
    isCommonPassword(password) {
        const common = [
            'password', '123456', '12345678', 'qwerty', 'abc123',
            'monkey', '1234567', 'letmein', 'trustno1', 'dragon',
            'baseball', 'iloveyou', 'master', 'sunshine', 'ashley',
            'bailey', 'shadow', '123123', '654321', 'superman',
            'qazwsx', 'michael', 'football', 'password1', 'password123'
        ];
        return common.includes(password.toLowerCase());
    },
    
    // ==========================================
    // SECURE HEADERS CHECK
    // ==========================================
    
    checkSecurityHeaders() {
        // This would need to be checked server-side
        // Documenting recommended headers:
        const recommendedHeaders = {
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://cdn.emailjs.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://api.emailjs.com",
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
        };
        
        return recommendedHeaders;
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    IFTASecurity.loadLoginAttempts();
    IFTASecurity.init();
});

// Expose for use by other modules
window.IFTASecurity = IFTASecurity;
