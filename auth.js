// IFTA Wizard - Authentication & Lead Capture Module
'use strict';

const IFTAAuth = {
    isAuthenticated: false,
    user: null,
    
    // Initialize authentication
    init() {
        this.checkExistingSession();
        this.setupEventListeners();
        this.populateHeaderQuarter();
    },
    
    // Check if user has existing session
    checkExistingSession() {
        const savedUser = localStorage.getItem('ifta_user');
        if (savedUser) {
            try {
                this.user = JSON.parse(savedUser);
                this.isAuthenticated = true;
                this.hideAuthModal();
                this.updateUIForLoggedInUser();
            } catch (e) {
                localStorage.removeItem('ifta_user');
                this.showAuthModal();
            }
        } else {
            this.showAuthModal();
        }
    },
    
    // Setup event listeners
    setupEventListeners() {
        // Auth mode toggle (Sign In / Create Account)
        const authModeButtons = document.querySelectorAll('.auth-mode-btn');
        authModeButtons.forEach(btn => {
            btn.addEventListener('click', () => this.toggleAuthMode(btn.dataset.mode));
        });
        
        // Auth form submission
        const authForm = document.getElementById('authForm');
        if (authForm) {
            authForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
        
        // Google sign in
        const googleBtn = document.getElementById('googleSignIn');
        if (googleBtn) {
            googleBtn.addEventListener('click', () => this.handleGoogleSignIn());
        }
        
        // Apple sign in
        const appleBtn = document.getElementById('appleSignIn');
        if (appleBtn) {
            appleBtn.addEventListener('click', () => this.handleAppleSignIn());
        }
        
        // Logout button
        const logoutBtn = document.getElementById('menuLogout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
        
        // Header quarter dropdown
        const headerQuarter = document.getElementById('headerQuarterSelect');
        if (headerQuarter) {
            headerQuarter.addEventListener('change', (e) => this.handleQuarterChange(e));
        }
    },
    
    // Logout user
    logout() {
        // Clear user data
        this.user = null;
        this.isAuthenticated = false;
        localStorage.removeItem('ifta_user');
        
        // Show auth modal
        this.showAuthModal();
        
        // Close profile menu if open
        const profileMenu = document.getElementById('profileMenu');
        if (profileMenu) {
            profileMenu.classList.remove('active');
        }
        
        if (typeof showToast === 'function') {
            showToast('Logged out successfully', 'info');
        }
    },
    
    // Toggle between Sign In and Create Account modes
    toggleAuthMode(mode) {
        const signinFields = document.querySelector('.signin-fields');
        const signupFields = document.querySelector('.signup-fields');
        const authModeButtons = document.querySelectorAll('.auth-mode-btn');
        
        // Update button states
        authModeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        // Toggle field visibility
        if (mode === 'signin') {
            if (signinFields) signinFields.style.display = 'block';
            if (signupFields) signupFields.style.display = 'none';
        } else {
            if (signinFields) signinFields.style.display = 'none';
            if (signupFields) signupFields.style.display = 'block';
        }
    },
    
    // Populate header quarter dropdown (2 years back)
    populateHeaderQuarter() {
        const headerSelect = document.getElementById('headerQuarterSelect');
        const hiddenSelect = document.getElementById('quarterSelect');
        
        if (!headerSelect) return;
        
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const currentQuarter = Math.floor(currentMonth / 3) + 1;
        
        const quarters = [];
        
        // Go back 2 years (8 quarters)
        for (let i = 0; i < 9; i++) {
            let q = currentQuarter - (i % 4);
            let y = currentYear - Math.floor(i / 4);
            
            if (q <= 0) {
                q += 4;
                y -= 1;
            }
            
            // Don't go more than 2 years back
            if (y < currentYear - 2) break;
            
            quarters.push({ quarter: q, year: y });
        }
        
        // Remove duplicates and sort
        const uniqueQuarters = [];
        const seen = new Set();
        for (const q of quarters) {
            const key = `Q${q.quarter} ${q.year}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueQuarters.push(q);
            }
        }
        
        headerSelect.innerHTML = uniqueQuarters.map((q, i) => 
            `<option value="Q${q.quarter} ${q.year}" ${i === 0 ? 'selected' : ''}>Q${q.quarter} ${q.year}</option>`
        ).join('');
        
        // Sync with hidden select if it exists
        if (hiddenSelect) {
            hiddenSelect.innerHTML = headerSelect.innerHTML;
        }
    },
    
    // Handle quarter change
    handleQuarterChange(e) {
        const value = e.target.value;
        const hiddenSelect = document.getElementById('quarterSelect');
        
        if (hiddenSelect) {
            hiddenSelect.value = value;
            // Trigger change event on hidden select for app.js to catch
            hiddenSelect.dispatchEvent(new Event('change'));
        }
        
        // Update rates if available
        if (typeof recalculateAll === 'function') {
            recalculateAll();
        }
    },
    
    // Show auth modal
    showAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    },
    
    // Hide auth modal
    hideAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    // Handle form submission
    handleFormSubmit(e) {
        e.preventDefault();
        
        const formData = {
            email: document.getElementById('authEmail')?.value?.trim() || '',
            name: document.getElementById('authName')?.value?.trim() || '',
            company: document.getElementById('authCompany')?.value?.trim() || '',
            phone: document.getElementById('authPhone')?.value?.trim() || '',
            fleetSize: document.getElementById('authFleetSize')?.value || '',
            driverCount: document.getElementById('authDriverCount')?.value || '',
            signupDate: new Date().toISOString(),
            signupMethod: 'email'
        };
        
        // Validate required fields
        if (!formData.email || !formData.name) {
            this.showError('Please fill in all required fields');
            return;
        }
        
        // Validate email format
        if (!this.isValidEmail(formData.email)) {
            this.showError('Please enter a valid email address');
            return;
        }
        
        this.saveUserAndAuthenticate(formData);
    },
    
    // Handle Google Sign In
    handleGoogleSignIn() {
        console.log('Google Sign-In clicked');
        
        // Check if Google Identity Services is loaded
        if (typeof google === 'undefined' || !google.accounts) {
            console.error('Google Identity Services not loaded yet');
            if (typeof showToast === 'function') {
                showToast('Google Sign-In is loading, please try again', 'error');
            }
            return;
        }
        
        console.log('Initializing Google OAuth...');
        
        try {
            // Go directly to OAuth popup (more reliable than One Tap)
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: '1005752295612-5ib4pggv00hgrnoiho50fvguln8a75sn.apps.googleusercontent.com',
                scope: 'email profile',
                callback: (tokenResponse) => this.handleGoogleTokenCallback(tokenResponse)
            });
            
            tokenClient.requestAccessToken();
        } catch (error) {
            console.error('Google Sign-In error:', error);
            if (typeof showToast === 'function') {
                showToast('Error initializing Google Sign-In', 'error');
            }
        }
    },
    
    // Handle Google Sign-In callback (from One Tap)
    handleGoogleCallback(response) {
        if (response.credential) {
            // Decode the JWT to get user info
            const payload = this.decodeJWT(response.credential);
            
            const googleUser = {
                email: payload.email,
                name: payload.name,
                picture: payload.picture,
                company: '',
                signupDate: new Date().toISOString(),
                signupMethod: 'google',
                googleId: payload.sub
            };
            
            this.saveUserAndAuthenticate(googleUser);
        }
    },
    
    // Handle Google OAuth token callback (from popup)
    async handleGoogleTokenCallback(tokenResponse) {
        if (tokenResponse.access_token) {
            try {
                // Fetch user info from Google
                const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: {
                        'Authorization': `Bearer ${tokenResponse.access_token}`
                    }
                });
                
                const userInfo = await response.json();
                
                const googleUser = {
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    company: '',
                    signupDate: new Date().toISOString(),
                    signupMethod: 'google',
                    googleId: userInfo.sub
                };
                
                this.saveUserAndAuthenticate(googleUser);
            } catch (error) {
                console.error('Error fetching Google user info:', error);
                if (typeof showToast === 'function') {
                    showToast('Error signing in with Google', 'error');
                }
            }
        }
    },
    
    // Decode JWT token
    decodeJWT(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => 
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
            ).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('Error decoding JWT:', e);
            return {};
        }
    },
    
    // Handle Apple Sign In
    handleAppleSignIn() {
        // Simulate Apple Sign In
        // In production, this would use Apple Sign In JS SDK
        const mockAppleUser = {
            email: 'user@icloud.com',
            name: 'Apple User',
            company: '',
            phone: '',
            fleetSize: '',
            driverCount: '',
            signupDate: new Date().toISOString(),
            signupMethod: 'apple',
            appleId: 'apple_' + Math.random().toString(36).substr(2, 9)
        };
        
        this.showAdditionalInfoPrompt(mockAppleUser);
    },
    
    // Show prompt for additional info after social login
    showAdditionalInfoPrompt(userData) {
        // For demo, just authenticate and show toast asking for more info later
        this.saveUserAndAuthenticate(userData);
        
        // In production, you'd show a secondary modal to collect fleet info
        setTimeout(() => {
            if (typeof showToast === 'function') {
                showToast('Complete your profile for personalized reports', 'info');
            }
        }, 2000);
    },
    
    // Save user data and authenticate
    saveUserAndAuthenticate(userData) {
        this.user = userData;
        this.isAuthenticated = true;
        
        // Save to localStorage
        localStorage.setItem('ifta_user', JSON.stringify(userData));
        
        // Save lead to leads collection
        this.saveLead(userData);
        
        // Hide modal and update UI
        this.hideAuthModal();
        this.updateUIForLoggedInUser();
        
        if (typeof showToast === 'function') {
            showToast(`Welcome, ${userData.name}!`, 'success');
        }
    },
    
    // Save lead data (in production, this would go to a backend)
    saveLead(userData) {
        // Get existing leads
        let leads = [];
        try {
            leads = JSON.parse(localStorage.getItem('ifta_leads') || '[]');
        } catch (e) {
            leads = [];
        }
        
        // Check if email already exists
        const existingIndex = leads.findIndex(l => l.email === userData.email);
        if (existingIndex >= 0) {
            // Update existing lead
            leads[existingIndex] = { ...leads[existingIndex], ...userData, lastLogin: new Date().toISOString() };
        } else {
            // Add new lead
            leads.push({
                ...userData,
                leadId: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                createdAt: new Date().toISOString()
            });
        }
        
        localStorage.setItem('ifta_leads', JSON.stringify(leads));
        
        // Log lead capture (in production, send to analytics/CRM)
        console.log('Lead captured:', userData);
    },
    
    // Update UI for logged in user
    updateUIForLoggedInUser() {
        // Update profile dropdown
        const profileName = document.getElementById('profileName');
        const profileAvatar = document.getElementById('profileAvatar');
        
        if (this.user) {
            const firstName = this.user.name ? this.user.name.split(' ')[0] : 'User';
            if (profileName) profileName.textContent = firstName;
            if (profileAvatar) profileAvatar.textContent = firstName.charAt(0).toUpperCase();
        }
        
        // Update reports module if available
        if (typeof IFTAReports !== 'undefined') {
            IFTAReports.updateProfileMenuInfo();
        }
    },
    
    // Logout
    logout() {
        this.user = null;
        this.isAuthenticated = false;
        localStorage.removeItem('ifta_user');
        
        const profileName = document.getElementById('profileName');
        const profileAvatar = document.getElementById('profileAvatar');
        
        if (profileName) profileName.textContent = 'Account';
        if (profileAvatar) profileAvatar.textContent = 'U';
        
        this.showAuthModal();
    },
    
    // Validate email format
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    // Show error message
    showError(message) {
        if (typeof showToast === 'function') {
            showToast(message, 'error');
        } else {
            alert(message);
        }
    },
    
    // Get all leads (for admin use)
    getAllLeads() {
        try {
            return JSON.parse(localStorage.getItem('ifta_leads') || '[]');
        } catch (e) {
            return [];
        }
    },
    
    // Export leads as CSV
    exportLeadsCSV() {
        const leads = this.getAllLeads();
        if (leads.length === 0) {
            console.log('No leads to export');
            return;
        }
        
        const headers = ['Email', 'Name', 'Company', 'Phone', 'Fleet Size', 'Driver Count', 'Signup Method', 'Signup Date'];
        const rows = leads.map(l => [
            l.email || '',
            l.name || '',
            l.company || '',
            l.phone || '',
            l.fleetSize || '',
            l.driverCount || '',
            l.signupMethod || '',
            l.signupDate || ''
        ]);
        
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ifta_leads_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    IFTAAuth.init();
});

// Expose for console access (lead management)
window.IFTAAuth = IFTAAuth;
