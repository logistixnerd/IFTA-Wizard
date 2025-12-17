// IFTA Wizard - Firebase Authentication Module
// Uses Firebase Auth for secure authentication
'use strict';

const IFTAAuth = {
    isAuthenticated: false,
    user: null,
    currentMode: 'signin', // 'signin' or 'signup'
    firebaseReady: false,
    authStateInitialized: false,
    
    // Admin emails - use centralized list from firebase-config.js or fallback
    get adminEmails() {
        return window.ADMIN_EMAILS || [
            'milan.pericic@logistixnerd.com',
            'milanpericic@gmail.com',
            'admin@iftawizard.com'
        ].map(e => e.toLowerCase());
    },
    
    // Initialize authentication
    init() {
        this.initFirebase();
        this.setupEventListeners();
        this.populateHeaderQuarter();
        
        // Fallback: if auth state doesn't initialize within 3 seconds, show login
        setTimeout(() => {
            if (!this.authStateInitialized) {
                this.showAuthModal();
            }
        }, 3000);
    },
    
    // Initialize Firebase
    initFirebase() {
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK not loaded');
            return;
        }
        
        // Initialize Firebase if not already done
        if (firebase.apps.length === 0 && typeof initializeFirebase === 'function') {
            initializeFirebase();
        }
        
        this.firebaseReady = firebase.apps.length > 0;
        
        if (!this.firebaseReady) {
            console.error('Firebase initialization failed');
            return;
        }
        
        // Check for redirect result (from Google Sign-In)
        firebase.auth().getRedirectResult().then((result) => {
            if (result.user) {
                // User signed in via redirect
                localStorage.setItem('ifta_login_time', Date.now().toString());
                
                const isNewUser = result.additionalUserInfo?.isNewUser;
                if (isNewUser) {
                    this.saveUserProfile(result.user.uid, {
                        email: result.user.email.toLowerCase(),
                        name: result.user.displayName || '',
                        company: '',
                        signupMethod: 'google',
                        emailVerified: true
                    });
                }
                
                if (typeof showToast === 'function') {
                    showToast(`Welcome, ${result.user.displayName || 'User'}!`, 'success');
                }
            }
        }).catch((error) => {
            if (error.code && error.code !== 'auth/popup-closed-by-user') {
                console.error('Redirect sign-in error:', error);
            }
        });
        
        // Listen for auth state changes
        firebase.auth().onAuthStateChanged((user) => {
            this.handleAuthStateChange(user);
        });
    },
    
    // Handle Firebase auth state changes
    async handleAuthStateChange(firebaseUser) {
        this.authStateInitialized = true;
        
        if (firebaseUser) {
            // Check session expiry (7 days)
            const loginTime = localStorage.getItem('ifta_login_time');
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
            
            if (loginTime && (Date.now() - parseInt(loginTime)) > SEVEN_DAYS) {
                // Session expired - log out
                await this.logout();
                if (typeof showToast === 'function') {
                    showToast('Session expired. Please sign in again.', 'info');
                }
                return;
            }
            
            // User is signed in
            try {
                // Get additional user data from Firestore
                const userProfile = await this.getUserProfile(firebaseUser.uid);
                
                this.user = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    name: userProfile?.name || firebaseUser.displayName || '',
                    company: userProfile?.company || '',
                    role: userProfile?.role || 'user',
                    emailVerified: firebaseUser.emailVerified,
                    photoURL: firebaseUser.photoURL,
                    signupMethod: userProfile?.signupMethod || 'email'
                };
                
                this.isAuthenticated = true;
                this.hideAuthModal();
                this.updateUIForLoggedInUser();
                
                // Show login success notification
                const firstName = this.user.name?.split(' ')[0] || 'there';
                if (typeof showToast === 'function') {
                    showToast(`Welcome back, ${firstName}!`, 'success');
                }
                
                // Sync reports from Firebase
                if (typeof IFTAReports !== 'undefined' && IFTAReports.syncReportsFromFirebase) {
                    IFTAReports.syncReportsFromFirebase();
                }
                
                // Log activity
                this.logActivity('login', `${this.user.email} signed in`);
                
            } catch (error) {
                console.error('Error loading user profile:', error);
                // Still authenticate with basic info
                this.user = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    name: firebaseUser.displayName || '',
                    emailVerified: firebaseUser.emailVerified
                };
                this.isAuthenticated = true;
                this.hideAuthModal();
                this.updateUIForLoggedInUser();
                
                // Still try to sync reports
                if (typeof IFTAReports !== 'undefined' && IFTAReports.syncReportsFromFirebase) {
                    IFTAReports.syncReportsFromFirebase();
                }
            }
        } else {
            // User is signed out
            this.user = null;
            this.isAuthenticated = false;
            localStorage.removeItem('ifta_login_time');
            this.showAuthModal();
        }
    },
    
    // Get user profile from Firestore
    async getUserProfile(uid) {
        if (!this.firebaseReady || typeof db === 'undefined') return null;
        
        try {
            const doc = await db.collection('users').doc(uid).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error getting user profile:', error);
            return null;
        }
    },
    
    // Save/update user profile in Firestore
    async saveUserProfile(uid, data) {
        if (!this.firebaseReady || typeof db === 'undefined') return;
        
        try {
            const userRef = db.collection('users').doc(uid);
            const existing = await userRef.get();
            
            if (existing.exists) {
                await userRef.update({
                    ...data,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await userRef.set({
                    ...data,
                    role: 'user',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error('Error saving user profile:', error);
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
    },
    
    // Handle form submission
    handleFormSubmit(e) {
        e.preventDefault();
        e.stopPropagation();
        this.clearErrors();
        
        if (this.currentMode === 'signin') {
            this.handleSignIn();
        } else {
            this.handleSignUp();
        }
    },
    
    // Email validation helper
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },
    
    // Handle Sign In
    async handleSignIn() {
        const emailInput = document.getElementById('signinEmail');
        const passwordInput = document.getElementById('signinPassword');
        const savePassword = document.getElementById('savePassword')?.checked ?? false;
        
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value;
        
        if (!email || !password) {
            this.showFormError('signin', 'Please enter email and password');
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.showFormError('signin', 'Please enter a valid email address');
            return;
        }
        
        // Show loading
        const submitBtn = document.querySelector('.auth-form button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in...';
        }
        
        try {
            // Always use LOCAL persistence (remember session)
            await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            
            // Save credentials (email always, password if checkbox checked)
            this.saveCredentials(email, password, savePassword);
            
            // Save login timestamp for 7-day expiry check
            localStorage.setItem('ifta_login_time', Date.now().toString());
            
            // Auth state change listener will handle the rest
            
            if (typeof showToast === 'function') {
                showToast('Signed in successfully!', 'success');
            }
        } catch (error) {
            console.error('Sign in error:', error);
            
            let message = 'Sign in failed';
            switch (error.code) {
                case 'auth/user-not-found':
                    message = 'No account found with this email';
                    break;
                case 'auth/wrong-password':
                    message = 'Incorrect password';
                    break;
                case 'auth/invalid-email':
                    message = 'Invalid email address';
                    break;
                case 'auth/user-disabled':
                    message = 'This account has been disabled';
                    break;
                case 'auth/too-many-requests':
                    message = 'Too many failed attempts. Please try again later.';
                    break;
                case 'auth/invalid-credential':
                    message = 'Invalid email or password';
                    break;
                default:
                    message = error.message || 'Sign in failed';
            }
            
            this.showFormError('signin', message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = this.currentMode === 'signin' ? 'Sign In' : 'Create Account';
            }
        }
    },
    
    // Handle Sign Up
    async handleSignUp() {
        const emailInput = document.getElementById('authEmail');
        const passwordInput = document.getElementById('authPassword');
        const confirmInput = document.getElementById('authPasswordConfirm');
        const nameInput = document.getElementById('authName');
        const companyInput = document.getElementById('authCompany');
        
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value;
        const confirmPassword = confirmInput?.value;
        const name = nameInput?.value?.trim();
        const company = companyInput?.value?.trim() || '';
        
        if (!email || !password || !name) {
            this.showFormError('signup', 'Please fill in all required fields');
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.showFormError('signup', 'Please enter a valid email address');
            return;
        }
        
        if (password.length < 6) {
            this.showFormError('signup', 'Password must be at least 6 characters');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showFormError('signup', 'Passwords do not match');
            return;
        }
        
        // Show loading
        const submitBtn = document.querySelector('.auth-form button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
        }
        
        try {
            // Create user in Firebase Auth
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Update display name
            await user.updateProfile({ displayName: name });
            
            // Save additional profile data to Firestore
            await this.saveUserProfile(user.uid, {
                email: email.toLowerCase(),
                name: name,
                company: company,
                signupMethod: 'email',
                emailVerified: false
            });
            
            // Send email verification
            await user.sendEmailVerification();
            
            // Save as lead
            await this.saveLead({
                email: email,
                name: name,
                company: company,
                signupMethod: 'email'
            });
            
            if (typeof showToast === 'function') {
                showToast('Account created! Please verify your email.', 'success');
            }
            
            // Auth state change listener will handle the rest
            
        } catch (error) {
            console.error('Sign up error:', error);
            
            let message = 'Sign up failed';
            switch (error.code) {
                case 'auth/email-already-in-use':
                    message = 'An account with this email already exists';
                    break;
                case 'auth/invalid-email':
                    message = 'Invalid email address';
                    break;
                case 'auth/weak-password':
                    message = 'Password is too weak. Use at least 6 characters.';
                    break;
                default:
                    message = error.message || 'Sign up failed';
            }
            
            this.showFormError('signup', message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = this.currentMode === 'signin' ? 'Sign In' : 'Create Account';
            }
        }
    },
    
    // Handle Google Sign In
    async handleGoogleSignIn() {
        const googleBtn = document.getElementById('googleSignIn');
        const originalText = googleBtn?.innerHTML;
        
        try {
            // Show loading
            if (googleBtn) {
                googleBtn.disabled = true;
                googleBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid #ccc;border-top-color:#4285F4;border-radius:50%;animation:spin 1s linear infinite;margin-right:8px;"></span>Signing in...';
            }
            
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.addScope('email');
            provider.addScope('profile');
            
            // Try redirect instead of popup (works better with custom domains)
            await firebase.auth().signInWithRedirect(provider);
            
            // Note: The page will redirect, so code below won't run
            // The result will be handled in initFirebase via getRedirectResult
            
        } catch (error) {
            console.error('Google sign in error:', error);
            
            // Show specific error to help debug
            let errorMessage = 'Google sign-in failed.';
            
            if (error.code === 'auth/unauthorized-domain') {
                errorMessage = 'Domain not authorized. Add this domain to Firebase Auth settings.';
            } else if (error.code === 'auth/operation-not-allowed') {
                errorMessage = 'Google sign-in not enabled. Enable it in Firebase Console.';
            } else {
                errorMessage = `Error: ${error.code || error.message || 'Unknown error'}`;
            }
            
            if (typeof showToast === 'function') {
                showToast(errorMessage, 'error');
            }
            
            // Restore button on error
            if (googleBtn && originalText) {
                googleBtn.disabled = false;
                googleBtn.innerHTML = originalText;
            }
        }
    },
    
    // Logout
    async logout() {
        try {
            await firebase.auth().signOut();
            
            // Clear local data
            this.user = null;
            this.isAuthenticated = false;
            
            // Close profile menu if open
            const profileMenu = document.getElementById('profileMenu');
            if (profileMenu) {
                profileMenu.classList.remove('active');
            }
            
            if (typeof showToast === 'function') {
                showToast('Logged out successfully', 'info');
            }
            
            // Auth state listener will show the modal
            
        } catch (error) {
            console.error('Logout error:', error);
            if (typeof showToast === 'function') {
                showToast('Error logging out', 'error');
            }
        }
    },
    
    // Show Forgot Password
    showForgotPassword() {
        const email = document.getElementById('signinEmail')?.value?.trim() || '';
        
        // Create a simple prompt for password reset
        const resetEmail = prompt('Enter your email address to reset your password:', email);
        
        if (resetEmail && resetEmail.trim()) {
            this.sendPasswordReset(resetEmail.trim());
        }
    },
    
    // Send password reset email
    async sendPasswordReset(email) {
        try {
            await firebase.auth().sendPasswordResetEmail(email);
            
            if (typeof showToast === 'function') {
                showToast('Password reset email sent! Check your inbox.', 'success');
            }
        } catch (error) {
            console.error('Password reset error:', error);
            
            let message = 'Failed to send reset email';
            if (error.code === 'auth/user-not-found') {
                message = 'No account found with this email';
            } else if (error.code === 'auth/invalid-email') {
                message = 'Invalid email address';
            }
            
            if (typeof showToast === 'function') {
                showToast(message, 'error');
            }
        }
    },
    
    // Save lead to Firestore
    async saveLead(userData) {
        if (!this.firebaseReady || typeof db === 'undefined') return;
        
        try {
            await db.collection('leads').add({
                email: userData.email?.toLowerCase() || '',
                name: userData.name || '',
                company: userData.company || '',
                signupMethod: userData.signupMethod || 'email',
                source: window.location.hostname,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error saving lead:', error);
        }
    },
    
    // Log activity
    async logActivity(action, details) {
        if (!this.firebaseReady || typeof db === 'undefined') return;
        
        try {
            await db.collection('activity_logs').add({
                action: action,
                details: details,
                userId: this.user?.uid || 'anonymous',
                email: this.user?.email || '',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userAgent: navigator.userAgent
            });
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    },
    
    // Toggle auth mode
    toggleAuthMode(mode) {
        this.currentMode = mode;
        const signinFields = document.querySelector('.signin-fields');
        const signupFields = document.querySelector('.signup-fields');
        const authModeButtons = document.querySelectorAll('.auth-mode-btn');
        
        authModeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        if (mode === 'signin') {
            if (signinFields) signinFields.style.display = 'block';
            if (signupFields) signupFields.style.display = 'none';
        } else {
            if (signinFields) signinFields.style.display = 'none';
            if (signupFields) signupFields.style.display = 'block';
        }
        
        this.clearErrors();
    },
    
    // Show auth modal
    showAuthModal() {
        const modal = document.getElementById('authModal');
        const appContainer = document.querySelector('.app-container');
        
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex'; // Show the modal
        }
        
        // Hide app content when showing auth modal
        if (appContainer) {
            appContainer.style.display = 'none';
        }
        
        // Load saved credentials
        this.loadSavedCredentials();
    },
    
    // Load saved email and optionally password
    loadSavedCredentials() {
        try {
            const savedEmail = localStorage.getItem('ifta_saved_email');
            const savedPassword = localStorage.getItem('ifta_saved_password');
            const hasSavedPassword = !!savedPassword;
            
            const emailInput = document.getElementById('signinEmail');
            const passwordInput = document.getElementById('signinPassword');
            const savePasswordCheckbox = document.getElementById('savePassword');
            
            if (emailInput && savedEmail) {
                emailInput.value = savedEmail;
            }
            
            if (passwordInput && savedPassword) {
                // Decrypt the saved password using security module
                if (typeof IFTASecurity !== 'undefined' && IFTASecurity.decryptData) {
                    const decrypted = IFTASecurity.decryptData(savedPassword, 'ifta_pwd_key');
                    if (decrypted) {
                        passwordInput.value = decrypted;
                    }
                } else {
                    // Fallback to base64 decode
                    try { passwordInput.value = atob(savedPassword); } catch(e) {}
                }
            }
            
            if (savePasswordCheckbox) {
                savePasswordCheckbox.checked = hasSavedPassword;
            }
        } catch (e) {
            // Silent fail for credential loading
        }
    },
    
    // Save email (always) and password (if checkbox checked)
    saveCredentials(email, password, savePassword) {
        try {
            // Always save email
            if (email) {
                localStorage.setItem('ifta_saved_email', email);
            }
            
            // Save or clear password based on checkbox
            if (savePassword && password) {
                // Use security module encryption if available
                if (typeof IFTASecurity !== 'undefined' && IFTASecurity.encryptData) {
                    const encrypted = IFTASecurity.encryptData(password, 'ifta_pwd_key');
                    localStorage.setItem('ifta_saved_password', encrypted);
                } else {
                    // Fallback to basic encoding
                    localStorage.setItem('ifta_saved_password', btoa(password));
                }
            } else {
                localStorage.removeItem('ifta_saved_password');
            }
        } catch (e) {
            // Silent fail for credential saving
        }
    },
    
    // Hide auth modal
    hideAuthModal() {
        const modal = document.getElementById('authModal');
        const appContainer = document.querySelector('.app-container');
        
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none'; // Force hide as fallback
        }
        
        // Show app content when hiding auth modal
        if (appContainer) {
            appContainer.style.display = 'block';
        }
    },
    
    // Clear errors
    clearErrors() {
        document.querySelectorAll('.auth-form input').forEach(input => {
            input.classList.remove('error');
        });
        document.querySelectorAll('.auth-error').forEach(el => el.remove());
        document.querySelectorAll('.form-error-message').forEach(el => el.remove());
    },
    
    // Show form error
    showFormError(formType, message) {
        const emailInputId = formType === 'signin' ? 'signinEmail' : 'authEmail';
        const emailInput = document.getElementById(emailInputId);
        
        if (!emailInput) return;
        
        this.hideFormError(formType);
        emailInput.classList.add('error');
        
        const errorEl = document.createElement('div');
        errorEl.className = 'form-error-message';
        errorEl.id = `${formType}FormError`;
        errorEl.textContent = message;
        
        emailInput.parentNode.appendChild(errorEl);
    },
    
    // Hide form error
    hideFormError(formType) {
        const errorEl = document.getElementById(`${formType}FormError`);
        if (errorEl) {
            errorEl.remove();
        }
    },
    
    // Update UI for logged in user
    updateUIForLoggedInUser() {
        // Get user's first name for display
        const firstName = this.user?.name?.split(' ')[0] || '';
        const displayName = firstName || 'Account';
        const avatarLetter = (firstName || this.user?.email || 'U').charAt(0).toUpperCase();
        
        // Update profile button
        const profileName = document.getElementById('profileName');
        const profileAvatar = document.getElementById('profileAvatar');
        
        if (profileName) profileName.textContent = displayName;
        if (profileAvatar) profileAvatar.textContent = avatarLetter;
        
        // Update profile menu header
        const menuUserName = document.getElementById('menuUserName');
        const menuUserEmail = document.getElementById('menuUserEmail');
        
        if (menuUserName) menuUserName.textContent = this.user?.name || 'User';
        if (menuUserEmail) menuUserEmail.textContent = this.user?.email || '';
        
        // Show/hide admin link in profile menu
        const adminLink = document.getElementById('menuAdminConsole');
        if (adminLink) {
            const userEmail = this.user?.email?.toLowerCase() || '';
            const isAdmin = this.adminEmails.some(email => email.toLowerCase() === userEmail);
            adminLink.style.display = isAdmin ? 'flex' : 'none';
        }
        
        // Update header avatar if user has photo
        const headerAvatar = document.querySelector('.user-avatar');
        if (headerAvatar && this.user?.photoURL) {
            headerAvatar.style.backgroundImage = `url(${this.user.photoURL})`;
            headerAvatar.style.backgroundSize = 'cover';
            headerAvatar.textContent = '';
        }
        
        // Note: Profile toggle is handled by reports.js
    },

    // Populate header quarter dropdown
    populateHeaderQuarter() {
        const headerSelect = document.getElementById('headerQuarterSelect');
        const hiddenSelect = document.getElementById('quarterSelect');
        
        if (!headerSelect) return;
        
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const currentQuarter = Math.floor(currentMonth / 3) + 1;
        
        const quarters = [];
        
        for (let i = 0; i < 9; i++) {
            let q = currentQuarter - (i % 4);
            let y = currentYear - Math.floor(i / 4);
            
            if (q <= 0) {
                q += 4;
                y -= 1;
            }
            
            if (y < currentYear - 2) break;
            
            quarters.push({ quarter: q, year: y });
        }
        
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
            hiddenSelect.dispatchEvent(new Event('change'));
        }
        
        if (typeof recalculateAll === 'function') {
            recalculateAll();
        }
    },
    
    // Check if current user is admin
    isAdmin() {
        return this.adminEmails.includes(this.user?.email?.toLowerCase());
    },
    
    // Get current user
    getCurrentUser() {
        return this.user;
    },
    
    // Resend email verification
    async resendVerification() {
        const user = firebase.auth().currentUser;
        if (user && !user.emailVerified) {
            try {
                await user.sendEmailVerification();
                if (typeof showToast === 'function') {
                    showToast('Verification email sent!', 'success');
                }
            } catch (error) {
                console.error('Error sending verification:', error);
                if (typeof showToast === 'function') {
                    showToast('Failed to send verification email', 'error');
                }
            }
        }
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    IFTAAuth.init();
});
