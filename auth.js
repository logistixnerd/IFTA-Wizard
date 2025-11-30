// IFTA Wizard - Authentication & Lead Capture Module
'use strict';

const IFTAAuth = {
    isAuthenticated: false,
    user: null,
    currentMode: 'signin', // 'signin' or 'signup'
    
    // 2FA / Email Verification state
    pendingUser: null,           // User waiting for email verification
    verificationCode: null,      // Current verification code
    verificationExpiry: null,    // Code expiry time
    verificationType: null,      // 'signup' or 'signin'
    resendCooldown: 0,           // Cooldown timer for resend
    resendInterval: null,        // Timer interval reference
    
    // Forgot password state
    forgotPasswordUser: null,
    forgotVerificationCode: null,
    forgotCodeExpiry: null,
    forgotResendCooldown: 0,
    forgotResendInterval: null,
    
    // EmailJS Configuration - Using EmailJS free tier (200 emails/month)
    // Sign up at https://www.emailjs.com/ and replace these values
    emailjsPublicKey: 'A9hDtCZZwXPLh-jny',
    emailjsServiceId: 'service_qkuqkgx',
    emailjsTemplateId: 'template_5x32df8',
    
    // Initialize authentication
    init() {
        this.initEmailJS();
        this.checkExistingSession();
        this.setupEventListeners();
        this.populateHeaderQuarter();
    },
    
    // Initialize EmailJS
    initEmailJS() {
        if (typeof emailjs !== 'undefined' && this.emailjsPublicKey !== 'YOUR_EMAILJS_PUBLIC_KEY') {
            emailjs.init(this.emailjsPublicKey);
            console.log('EmailJS initialized');
        } else {
            console.log('EmailJS running in demo mode - codes shown in toast');
        }
    },
    
    // Simple hash function for passwords (not for production - use bcrypt on backend)
    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'hash_' + Math.abs(hash).toString(36) + '_' + password.length;
    },
    
    // Get all registered users
    getUsers() {
        try {
            return JSON.parse(localStorage.getItem('ifta_users') || '[]');
        } catch (e) {
            return [];
        }
    },
    
    // Save users to localStorage
    saveUsers(users) {
        localStorage.setItem('ifta_users', JSON.stringify(users));
    },
    
    // Find user by email
    findUserByEmail(email) {
        const users = this.getUsers();
        return users.find(u => u.email.toLowerCase() === email.toLowerCase());
    },
    
    // Register new user (initially unverified)
    registerUser(email, password, name, company) {
        const users = this.getUsers();
        
        // Check if email already exists
        const existingUser = this.findUserByEmail(email);
        if (existingUser && existingUser.emailVerified) {
            return { success: false, error: 'An account with this email already exists' };
        }
        
        // Remove any unverified accounts with same email
        const filteredUsers = users.filter(u => u.email.toLowerCase() !== email.toLowerCase());
        
        const newUser = {
            id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            email: email.toLowerCase(),
            passwordHash: this.hashPassword(password),
            name: name,
            company: company || '',
            createdAt: new Date().toISOString(),
            signupMethod: 'email',
            emailVerified: false  // Must verify email
        };
        
        filteredUsers.push(newUser);
        this.saveUsers(filteredUsers);
        
        // Return user without password hash
        const { passwordHash, ...safeUser } = newUser;
        return { success: true, user: safeUser };
    },
    
    // Authenticate user (password check only)
    authenticateUser(email, password) {
        const user = this.findUserByEmail(email);
        
        if (!user) {
            return { success: false, error: 'No account found with this email' };
        }
        
        // Legacy users without emailVerified property are considered verified
        // New users must verify their email
        if (user.emailVerified === false) {
            return { success: false, error: 'Please verify your email first', needsVerification: true, user: user };
        }
        
        if (user.passwordHash !== this.hashPassword(password)) {
            return { success: false, error: 'Incorrect password' };
        }
        
        // Return user without password hash
        const { passwordHash, ...safeUser } = user;
        return { success: true, user: safeUser };
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
        
        // Forgot password button
        const forgotBtn = document.getElementById('forgotPasswordBtn');
        if (forgotBtn) {
            forgotBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForgotPassword();
            });
        }
        
        // Header quarter dropdown
        const headerQuarter = document.getElementById('headerQuarterSelect');
        if (headerQuarter) {
            headerQuarter.addEventListener('change', (e) => this.handleQuarterChange(e));
        }
        
        // Password strength indicator
        const forgotNewPassword = document.getElementById('forgotNewPassword');
        if (forgotNewPassword) {
            forgotNewPassword.addEventListener('input', (e) => this.updatePasswordStrength(e.target.value));
        }
        
        // Close forgot password modal on overlay click
        const forgotModal = document.getElementById('forgotPasswordModal');
        if (forgotModal) {
            forgotModal.addEventListener('click', (e) => {
                if (e.target === forgotModal) {
                    this.closeForgotPassword();
                }
            });
        }
        
        // Close email verify modal on overlay click
        const verifyModal = document.getElementById('emailVerifyModal');
        if (verifyModal) {
            verifyModal.addEventListener('click', (e) => {
                if (e.target === verifyModal) {
                    this.closeEmailVerify();
                }
            });
        }
        
        // Allow Enter key in forgot password inputs
        document.getElementById('forgotEmail')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.verifyForgotEmail();
            }
        });
        document.getElementById('forgotVerification')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.verifySecurityAnswer();
            }
        });
        document.getElementById('forgotConfirmPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.resetPasswordSubmit();
            }
        });
        
        // Setup verification code input handlers
        this.setupCodeInputHandlers();
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
        this.currentMode = mode;
        const signinFields = document.querySelector('.signin-fields');
        const signupFields = document.querySelector('.signup-fields');
        const authModeButtons = document.querySelectorAll('.auth-mode-btn');
        
        // Update button states
        authModeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        // Toggle field visibility and clear fields
        if (mode === 'signin') {
            if (signinFields) signinFields.style.display = 'block';
            if (signupFields) signupFields.style.display = 'none';
        } else {
            if (signinFields) signinFields.style.display = 'none';
            if (signupFields) signupFields.style.display = 'block';
        }
        
        // Clear any error messages
        this.clearErrors();
    },
    
    // Clear error styling
    clearErrors() {
        document.querySelectorAll('.auth-form input').forEach(input => {
            input.classList.remove('error');
        });
        document.querySelectorAll('.auth-error').forEach(el => el.remove());
    },
    
    // Show inline error
    showFieldError(inputId, message) {
        const input = document.getElementById(inputId);
        if (input) {
            input.classList.add('error');
            const errorEl = document.createElement('div');
            errorEl.className = 'auth-error';
            errorEl.textContent = message;
            input.parentNode.appendChild(errorEl);
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
        this.clearErrors();
        
        console.log('Form submitted, currentMode:', this.currentMode);
        
        if (this.currentMode === 'signin') {
            this.handleSignIn();
        } else {
            this.handleSignUp();
        }
    },
    
    // Handle Sign In (password + 2FA)
    handleSignIn() {
        const email = document.getElementById('signinEmail')?.value?.trim() || '';
        const password = document.getElementById('signinPassword')?.value || '';
        
        // Validate
        if (!email) {
            this.showFieldError('signinEmail', 'Email is required');
            return;
        }
        if (!this.isValidEmail(email)) {
            this.showFieldError('signinEmail', 'Please enter a valid email');
            return;
        }
        if (!password) {
            this.showFieldError('signinPassword', 'Password is required');
            return;
        }
        
        // Authenticate (password check)
        const result = this.authenticateUser(email, password);
        
        if (result.success) {
            // Password correct, login directly
            this.saveUserAndAuthenticate(result.user);
        } else if (result.needsVerification) {
            // Account exists but email not verified - send new code
            this.pendingUser = result.user;
            this.verificationType = 'signup';
            this.showError('Your email is not verified. Sending a new code...');
            setTimeout(() => {
                this.sendVerificationCode(result.user.email, result.user.name);
            }, 1000);
        } else {
            this.showError(result.error);
        }
    },
    
    // Handle Sign Up (Creates account, then requires email verification)
    handleSignUp() {
        console.log('handleSignUp called');
        const email = document.getElementById('authEmail')?.value?.trim() || '';
        const password = document.getElementById('authPassword')?.value || '';
        const passwordConfirm = document.getElementById('authPasswordConfirm')?.value || '';
        const name = document.getElementById('authName')?.value?.trim() || '';
        const company = document.getElementById('authCompany')?.value?.trim() || '';
        
        console.log('SignUp values:', { email, password: password ? '***' : '', name, company });
        
        // Validate
        let hasError = false;
        
        if (!email) {
            this.showFieldError('authEmail', 'Email is required');
            hasError = true;
        } else if (!this.isValidEmail(email)) {
            this.showFieldError('authEmail', 'Please enter a valid email');
            hasError = true;
        }
        
        if (!password) {
            this.showFieldError('authPassword', 'Password is required');
            hasError = true;
        } else if (password.length < 6) {
            this.showFieldError('authPassword', 'Password must be at least 6 characters');
            hasError = true;
        }
        
        if (password !== passwordConfirm) {
            this.showFieldError('authPasswordConfirm', 'Passwords do not match');
            hasError = true;
        }
        
        if (!name) {
            this.showFieldError('authName', 'Name is required');
            hasError = true;
        }
        
        if (hasError) return;
        
        // Register (creates unverified account)
        const result = this.registerUser(email, password, name, company);
        
        if (result.success) {
            // Account created, now verify email
            this.pendingUser = result.user;
            this.verificationType = 'signup';
            this.sendVerificationCode(email, name);
        } else {
            this.showError(result.error);
        }
    },
    
    // ==========================================
    // EMAIL VERIFICATION & 2FA FUNCTIONS
    // ==========================================
    
    // Generate 6-digit verification code
    generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    },
    
    // Send verification code via email
    async sendVerificationCode(email, name) {
        // Generate code
        this.verificationCode = this.generateVerificationCode();
        this.verificationExpiry = Date.now() + (10 * 60 * 1000); // 10 minutes
        
        // Update modal UI
        const emailDisplay = document.getElementById('verifyEmailDisplay');
        if (emailDisplay) emailDisplay.textContent = email;
        
        // Set modal content based on type
        const icon = document.getElementById('verifyIcon');
        const title = document.getElementById('verifyTitle');
        const desc = document.getElementById('verifyDescription');
        
        if (this.verificationType === 'signin') {
            if (icon) icon.textContent = '🔐';
            if (title) title.textContent = 'Verification Code';
            if (desc) desc.innerHTML = `We sent a code to <strong>${email}</strong>`;
        } else {
            if (icon) icon.textContent = '✉️';
            if (title) title.textContent = 'Verify Your Email';
            if (desc) desc.innerHTML = `We sent a code to <strong>${email}</strong>`;
        }
        
        // Clear previous code inputs
        this.clearCodeInputs();
        
        // Show the modal
        this.showEmailVerifyModal();
        
        // Send email via EmailJS
        const emailSent = await this.sendEmailWithCode(email, name, this.verificationCode);
        
        if (emailSent) {
            if (typeof showToast === 'function') {
                showToast('Code sent to your email', 'success');
            }
        }
        
        // Start resend cooldown
        this.startResendCooldown();
    },
    
    // Send email using EmailJS
    async sendEmailWithCode(email, name, code) {
        // Check if EmailJS is configured
        if (typeof emailjs === 'undefined') {
            console.log('EmailJS not loaded');
            this.showDemoCode(code);
            return false;
        }
        
        if (this.emailjsPublicKey === 'YOUR_EMAILJS_PUBLIC_KEY') {
            console.log('EmailJS not configured - showing demo code');
            this.showDemoCode(code);
            return false;
        }
        
        try {
            const templateParams = {
                to_email: email,
                to_name: name || 'User',
                verification_code: code,
                app_name: 'IFTA Wizard',
                valid_minutes: '10'
            };
            
            await emailjs.send(
                this.emailjsServiceId,
                this.emailjsTemplateId,
                templateParams
            );
            
            console.log('Email sent successfully to:', email);
            return true;
        } catch (error) {
            console.error('EmailJS error:', error);
            this.showDemoCode(code);
            return false;
        }
    },
    
    // Show demo code when email isn't configured
    showDemoCode(code) {
        console.log('📧 VERIFICATION CODE:', code);
        if (typeof showToast === 'function') {
            showToast(`Demo: ${code}`, 'info');
        }
    },
    
    // Show email verification modal
    showEmailVerifyModal() {
        const modal = document.getElementById('emailVerifyModal');
        if (modal) {
            modal.classList.remove('hidden');
            // Focus first input
            setTimeout(() => {
                const firstInput = modal.querySelector('.code-input');
                if (firstInput) firstInput.focus();
            }, 100);
        }
    },
    
    // Close email verification modal
    closeEmailVerify() {
        const modal = document.getElementById('emailVerifyModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.clearCodeInputs();
        this.hideVerifyError();
    },
    
    // Clear code inputs
    clearCodeInputs() {
        const inputs = document.querySelectorAll('#verifyCodeInputs .code-input');
        inputs.forEach(input => {
            input.value = '';
            input.classList.remove('filled', 'error');
        });
    },
    
    // Get entered code
    getEnteredCode() {
        const inputs = document.querySelectorAll('#verifyCodeInputs .code-input');
        return Array.from(inputs).map(i => i.value).join('');
    },
    
    // Verify the entered code
    verifyEmailCode() {
        const enteredCode = this.getEnteredCode();
        
        if (enteredCode.length !== 6) {
            this.showVerifyError('Please enter all 6 digits');
            return;
        }
        
        // Check if code expired
        if (Date.now() > this.verificationExpiry) {
            this.showVerifyError('Code has expired. Please request a new one.');
            return;
        }
        
        // Check if code matches
        if (enteredCode !== this.verificationCode) {
            this.showVerifyError('Incorrect code. Please try again.');
            this.shakeCodeInputs();
            return;
        }
        
        // Code is correct!
        if (this.verificationType === 'signup') {
            // Mark email as verified
            this.markEmailVerified(this.pendingUser.email);
            this.pendingUser.emailVerified = true;
        }
        
        // Complete authentication
        this.closeEmailVerify();
        this.saveUserAndAuthenticate(this.pendingUser);
        
        if (typeof showToast === 'function') {
            if (this.verificationType === 'signup') {
                showToast('Email verified! Welcome to IFTA Wizard!', 'success');
            } else {
                showToast('Sign-in successful!', 'success');
            }
        }
        
        // Clear pending state
        this.pendingUser = null;
        this.verificationCode = null;
        this.verificationType = null;
    },
    
    // Mark user's email as verified in storage
    markEmailVerified(email) {
        const users = this.getUsers();
        const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
        if (userIndex >= 0) {
            users[userIndex].emailVerified = true;
            users[userIndex].verifiedAt = new Date().toISOString();
            this.saveUsers(users);
        }
    },
    
    // Show verification error
    showVerifyError(message) {
        const errorEl = document.getElementById('verifyError');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    },
    
    // Hide verification error
    hideVerifyError() {
        const errorEl = document.getElementById('verifyError');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    },
    
    // Shake code inputs on error
    shakeCodeInputs() {
        const inputs = document.querySelectorAll('#verifyCodeInputs .code-input');
        inputs.forEach(input => {
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 500);
        });
    },
    
    // Start resend cooldown timer
    startResendCooldown() {
        // Clear any existing interval
        if (this.resendInterval) {
            clearInterval(this.resendInterval);
        }
        
        this.resendCooldown = 30; // 30 seconds
        const resendBtn = document.getElementById('resendCodeBtn');
        const timerSpan = document.getElementById('resendTimer');
        
        if (resendBtn) resendBtn.disabled = true;
        if (timerSpan) timerSpan.textContent = `(${this.resendCooldown}s)`;
        
        this.resendInterval = setInterval(() => {
            this.resendCooldown--;
            if (timerSpan) {
                timerSpan.textContent = this.resendCooldown > 0 ? `(${this.resendCooldown}s)` : '';
            }
            if (this.resendCooldown <= 0) {
                clearInterval(this.resendInterval);
                this.resendInterval = null;
                if (resendBtn) resendBtn.disabled = false;
            }
        }, 1000);
    },
    
    // Resend verification code
    resendVerificationCode() {
        if (this.resendCooldown > 0) return;
        
        if (this.pendingUser) {
            this.sendVerificationCode(this.pendingUser.email, this.pendingUser.name);
        }
    },
    
    // Setup code input handlers
    setupCodeInputHandlers() {
        const container = document.getElementById('verifyCodeInputs');
        if (!container) return;
        
        const inputs = container.querySelectorAll('.code-input');
        
        inputs.forEach((input, index) => {
            // Auto-advance on input
            input.addEventListener('input', (e) => {
                const value = e.target.value.replace(/\D/g, ''); // Only digits
                e.target.value = value;
                
                if (value) {
                    e.target.classList.add('filled');
                    // Move to next input
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                } else {
                    e.target.classList.remove('filled');
                }
                
                this.hideVerifyError();
            });
            
            // Handle backspace
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                }
                // Handle paste
                if (e.key === 'Enter') {
                    this.verifyEmailCode();
                }
            });
            
            // Handle paste
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = (e.clipboardData || window.clipboardData).getData('text');
                const digits = pastedData.replace(/\D/g, '').slice(0, 6);
                
                digits.split('').forEach((digit, i) => {
                    if (inputs[i]) {
                        inputs[i].value = digit;
                        inputs[i].classList.add('filled');
                    }
                });
                
                // Focus last filled or next empty
                const focusIndex = Math.min(digits.length, inputs.length - 1);
                inputs[focusIndex].focus();
            });
        });
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
                callback: (tokenResponse) => this.handleGoogleTokenCallback(tokenResponse),
                error_callback: (error) => {
                    console.error('Google OAuth error:', error);
                    if (error.type === 'popup_closed') {
                        if (typeof showToast === 'function') {
                            showToast('Sign-in cancelled', 'info');
                        }
                    } else if (error.type === 'popup_blocked') {
                        if (typeof showToast === 'function') {
                            showToast('Pop-up blocked. Please allow pop-ups for this site.', 'error');
                        }
                    } else {
                        // Access blocked error - likely unauthorized origin
                        const currentOrigin = window.location.origin;
                        console.error(`OAuth Error: Add "${currentOrigin}" to Google Cloud Console authorized origins`);
                        if (typeof showToast === 'function') {
                            showToast('Google Sign-In not configured for this domain', 'error');
                        }
                    }
                }
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
    
    // Show forgot password prompt
    showForgotPassword() {
        console.log('showForgotPassword called');
        
        // Pre-fill email if available
        const signinEmail = document.getElementById('signinEmail')?.value?.trim() || '';
        const forgotEmail = document.getElementById('forgotEmail');
        if (forgotEmail && signinEmail) {
            forgotEmail.value = signinEmail;
        }
        
        // Reset to step 1
        this.showForgotStep(1);
        this.forgotPasswordUser = null;
        
        // Show modal (on top of auth modal)
        const modal = document.getElementById('forgotPasswordModal');
        console.log('Modal element:', modal);
        if (modal) {
            modal.classList.remove('hidden');
            console.log('Modal shown');
        }
    },
    
    // Close forgot password modal
    closeForgotPassword() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        // Clear inputs
        const forgotEmail = document.getElementById('forgotEmail');
        const forgotNewPassword = document.getElementById('forgotNewPassword');
        const forgotConfirmPassword = document.getElementById('forgotConfirmPassword');
        if (forgotEmail) forgotEmail.value = '';
        if (forgotNewPassword) forgotNewPassword.value = '';
        if (forgotConfirmPassword) forgotConfirmPassword.value = '';
        
        // Clear code inputs
        const codeInputs = document.querySelectorAll('#forgotCodeInputs .code-input');
        codeInputs.forEach(input => input.value = '');
        
        // Clear state
        this.forgotPasswordUser = null;
        this.forgotVerificationCode = null;
        this.forgotCodeExpiry = null;
        if (this.forgotResendInterval) {
            clearInterval(this.forgotResendInterval);
            this.forgotResendInterval = null;
        }
        // Auth modal is still visible behind, no need to show it again
    },
    
    // Show specific step
    showForgotStep(step) {
        for (let i = 1; i <= 4; i++) {
            const stepEl = document.getElementById(`forgotStep${i}`);
            if (stepEl) {
                stepEl.style.display = i === step ? 'block' : 'none';
            }
        }
    },
    
    // Step 1: Verify email exists and send code
    verifyForgotEmail() {
        console.log('verifyForgotEmail called');
        const email = document.getElementById('forgotEmail')?.value?.trim() || '';
        console.log('Email entered:', email);
        
        // Hide previous error
        this.hideForgotEmailError();
        
        if (!email) {
            this.showForgotEmailError('please enter your email address');
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.showForgotEmailError('please enter a valid email address');
            return;
        }
        
        const user = this.findUserByEmail(email);
        console.log('User found:', user);
        
        if (!user) {
            this.showForgotEmailError('no account found with this email');
            return;
        }
        
        // Store user for later steps
        this.forgotPasswordUser = user;
        
        // Update step 2 UI
        const avatar = document.getElementById('forgotUserAvatar');
        const name = document.getElementById('forgotUserName');
        if (avatar && user.name) {
            avatar.textContent = user.name.charAt(0).toUpperCase();
        }
        if (name) {
            name.textContent = email;
        }
        
        // Send verification code
        this.sendForgotPasswordCode(email, user.name);
        
        // Move to step 2
        this.showForgotStep(2);
        
        // Setup code input handlers for forgot password
        this.setupForgotCodeInputs();
        
        // Focus first input
        setTimeout(() => {
            const firstInput = document.querySelector('#forgotCodeInputs .code-input');
            if (firstInput) firstInput.focus();
        }, 100);
    },
    
    // Send forgot password verification code
    async sendForgotPasswordCode(email, name) {
        // Generate code
        this.forgotVerificationCode = this.generateVerificationCode();
        this.forgotCodeExpiry = Date.now() + (10 * 60 * 1000); // 10 minutes
        
        // Send email via EmailJS
        const emailSent = await this.sendEmailWithCode(email, name, this.forgotVerificationCode);
        
        if (emailSent) {
            if (typeof showToast === 'function') {
                showToast('Code sent to your email', 'success');
            }
        }
        
        // Start resend cooldown
        this.startForgotResendCooldown();
    },
    
    // Setup forgot password code inputs
    setupForgotCodeInputs() {
        const container = document.getElementById('forgotCodeInputs');
        if (!container) return;
        
        const inputs = container.querySelectorAll('.code-input');
        
        inputs.forEach((input, index) => {
            // Clear previous listeners by cloning
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
        });
        
        // Get fresh references
        const freshInputs = container.querySelectorAll('.code-input');
        
        freshInputs.forEach((input, index) => {
            input.value = '';
            
            input.addEventListener('input', (e) => {
                const value = e.target.value.replace(/\D/g, '');
                e.target.value = value;
                
                if (value && index < freshInputs.length - 1) {
                    freshInputs[index + 1].focus();
                }
                
                this.hideForgotCodeError();
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    freshInputs[index - 1].focus();
                }
                if (e.key === 'Enter') {
                    this.verifyForgotCode();
                }
            });
            
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = (e.clipboardData || window.clipboardData).getData('text');
                const digits = pastedData.replace(/\D/g, '').slice(0, 6);
                
                digits.split('').forEach((digit, i) => {
                    if (freshInputs[i]) {
                        freshInputs[i].value = digit;
                    }
                });
                
                const focusIndex = Math.min(digits.length, freshInputs.length - 1);
                freshInputs[focusIndex].focus();
            });
        });
    },
    
    // Get entered forgot password code
    getForgotCode() {
        const inputs = document.querySelectorAll('#forgotCodeInputs .code-input');
        return Array.from(inputs).map(i => i.value).join('');
    },
    
    // Verify the forgot password code
    verifyForgotCode() {
        const enteredCode = this.getForgotCode();
        
        if (enteredCode.length !== 6) {
            this.showForgotCodeError('Please enter all 6 digits');
            return;
        }
        
        // Check if code expired
        if (Date.now() > this.forgotCodeExpiry) {
            this.showForgotCodeError('Code has expired. Please request a new one.');
            return;
        }
        
        // Check if code matches
        if (enteredCode !== this.forgotVerificationCode) {
            this.showForgotCodeError('Incorrect code. Please try again.');
            this.shakeForgotCodeInputs();
            return;
        }
        
        // Code is correct, go to password reset
        this.showForgotStep(3);
    },
    
    // Show forgot email error (step 1)
    showForgotEmailError(message) {
        const errorEl = document.getElementById('forgotEmailError');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    },
    
    // Hide forgot email error
    hideForgotEmailError() {
        const errorEl = document.getElementById('forgotEmailError');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    },
    
    // Show forgot code error
    showForgotCodeError(message) {
        const errorEl = document.getElementById('forgotCodeError');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    },
    
    // Hide forgot code error
    hideForgotCodeError() {
        const errorEl = document.getElementById('forgotCodeError');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    },
    
    // Shake forgot code inputs on error
    shakeForgotCodeInputs() {
        const inputs = document.querySelectorAll('#forgotCodeInputs .code-input');
        inputs.forEach(input => {
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 500);
        });
    },
    
    // Start forgot password resend cooldown
    startForgotResendCooldown() {
        if (this.forgotResendInterval) {
            clearInterval(this.forgotResendInterval);
        }
        
        this.forgotResendCooldown = 30;
        const resendBtn = document.getElementById('forgotResendBtn');
        const timerSpan = document.getElementById('forgotResendTimer');
        
        if (resendBtn) resendBtn.disabled = true;
        if (timerSpan) timerSpan.textContent = `(${this.forgotResendCooldown}s)`;
        
        this.forgotResendInterval = setInterval(() => {
            this.forgotResendCooldown--;
            if (timerSpan) {
                timerSpan.textContent = this.forgotResendCooldown > 0 ? `(${this.forgotResendCooldown}s)` : '';
            }
            if (this.forgotResendCooldown <= 0) {
                clearInterval(this.forgotResendInterval);
                this.forgotResendInterval = null;
                if (resendBtn) resendBtn.disabled = false;
            }
        }, 1000);
    },
    
    // Resend forgot password code
    resendForgotCode() {
        if (this.forgotResendCooldown > 0) return;
        
        if (this.forgotPasswordUser) {
            this.sendForgotPasswordCode(this.forgotPasswordUser.email, this.forgotPasswordUser.name);
        }
    },
    
    // Step 3: Submit new password
    resetPasswordSubmit() {
        const newPassword = document.getElementById('forgotNewPassword')?.value || '';
        const confirmPassword = document.getElementById('forgotConfirmPassword')?.value || '';
        
        if (!newPassword) {
            this.showError('Please enter a new password');
            return;
        }
        
        if (newPassword.length < 6) {
            this.showError('Password must be at least 6 characters');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }
        
        if (!this.forgotPasswordUser) {
            this.showError('Session expired. Please start over.');
            this.showForgotStep(1);
            return;
        }
        
        // Reset the password
        const success = this.resetPassword(this.forgotPasswordUser.email, newPassword);
        
        if (success) {
            this.showForgotStep(4);
        } else {
            this.showError('Failed to reset password. Please try again.');
        }
    },
    
    // Toggle password visibility
    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    },
    
    // Update password strength indicator
    updatePasswordStrength(password) {
        const strengthEl = document.getElementById('passwordStrength');
        if (!strengthEl) return;
        
        strengthEl.classList.remove('weak', 'medium', 'strong');
        
        if (!password) return;
        
        let strength = 0;
        if (password.length >= 6) strength++;
        if (password.length >= 10) strength++;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        
        if (strength <= 2) {
            strengthEl.classList.add('weak');
        } else if (strength <= 3) {
            strengthEl.classList.add('medium');
        } else {
            strengthEl.classList.add('strong');
        }
    },
    
    // Reset user password
    resetPassword(email, newPassword) {
        const users = this.getUsers();
        const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
        
        if (userIndex >= 0) {
            users[userIndex].passwordHash = this.hashPassword(newPassword);
            users[userIndex].updatedAt = new Date().toISOString();
            this.saveUsers(users);
            return true;
        }
        return false;
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

// Expose for inline onclick handlers and console access
window.IFTAAuth = IFTAAuth;
