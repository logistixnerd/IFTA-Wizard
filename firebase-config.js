// Firebase Configuration for IFTA Wizard
// ==========================================

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDrjI76QLlhLnmX80_XdFaD4QHP32I9QxY",
    authDomain: "ifta-wizard-a9061.firebaseapp.com",
    projectId: "ifta-wizard-a9061",
    storageBucket: "ifta-wizard-a9061.firebasestorage.app",
    messagingSenderId: "1019904853500",
    appId: "1:1019904853500:web:c2759d4078f107d9e65e79",
    measurementId: "G-D42MQDKFP2"
};

// Initialize Firebase
let app, auth, db;

function initializeFirebase() {
    try {
        // Initialize Firebase App
        app = firebase.initializeApp(firebaseConfig);
        
        // Initialize Auth
        auth = firebase.auth();
        
        // Initialize Firestore
        db = firebase.firestore();
        
        console.log('Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return false;
    }
}

// User roles
const USER_ROLES = {
    USER: 'user',
    MODERATOR: 'moderator', 
    ADMIN: 'admin'
};

// Firestore Collections
const COLLECTIONS = {
    USERS: 'users',
    COMPANIES: 'companies',
    REPORTS: 'reports',
    TAX_RATES: 'tax_rates',
    TAX_RATE_APPROVALS: 'tax_rate_approvals',
    ACTIVITY_LOGS: 'activity_logs',
    ERROR_LOGS: 'error_logs'
};

// ==========================================
// FIRESTORE HELPER FUNCTIONS
// ==========================================

const FirebaseDB = {
    // ----- USER MANAGEMENT -----
    
    // Create or update user profile in Firestore
    async saveUserProfile(uid, userData) {
        try {
            const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
            const userDoc = await userRef.get();
            
            if (userDoc.exists) {
                // Update existing user
                await userRef.update({
                    ...userData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Create new user with default role
                await userRef.set({
                    ...userData,
                    role: USER_ROLES.USER,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            return { success: true };
        } catch (error) {
            console.error('Error saving user profile:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get user profile
    async getUserProfile(uid) {
        try {
            const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
            if (userDoc.exists) {
                return { success: true, data: { id: userDoc.id, ...userDoc.data() } };
            }
            return { success: false, error: 'User not found' };
        } catch (error) {
            console.error('Error getting user profile:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get user role
    async getUserRole(uid) {
        const result = await this.getUserProfile(uid);
        if (result.success) {
            return result.data.role || USER_ROLES.USER;
        }
        return USER_ROLES.USER;
    },
    
    // Check if user is admin
    async isAdmin(uid) {
        const role = await this.getUserRole(uid);
        return role === USER_ROLES.ADMIN;
    },
    
    // Check if user is moderator or admin
    async isModerator(uid) {
        const role = await this.getUserRole(uid);
        return role === USER_ROLES.ADMIN || role === USER_ROLES.MODERATOR;
    },
    
    // Update user role (admin only)
    async updateUserRole(uid, newRole) {
        try {
            await db.collection(COLLECTIONS.USERS).doc(uid).update({
                role: newRole,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Error updating user role:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get all users (admin/mod only)
    async getAllUsers() {
        try {
            const snapshot = await db.collection(COLLECTIONS.USERS)
                .orderBy('createdAt', 'desc')
                .get();
            
            const users = [];
            snapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, data: users };
        } catch (error) {
            console.error('Error getting users:', error);
            return { success: false, error: error.message };
        }
    },
    
    // ----- COMPANY MANAGEMENT -----
    
    // Save company
    async saveCompany(companyData) {
        try {
            const docRef = await db.collection(COLLECTIONS.COMPANIES).add({
                ...companyData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Error saving company:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get all companies
    async getAllCompanies() {
        try {
            const snapshot = await db.collection(COLLECTIONS.COMPANIES)
                .orderBy('createdAt', 'desc')
                .get();
            
            const companies = [];
            snapshot.forEach(doc => {
                companies.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, data: companies };
        } catch (error) {
            console.error('Error getting companies:', error);
            return { success: false, error: error.message };
        }
    },
    
    // ----- TAX RATE MANAGEMENT -----
    
    // Get current tax rates
    async getCurrentTaxRates() {
        try {
            const doc = await db.collection(COLLECTIONS.TAX_RATES).doc('current').get();
            if (doc.exists) {
                return { success: true, data: doc.data() };
            }
            return { success: false, error: 'No tax rates found' };
        } catch (error) {
            console.error('Error getting tax rates:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Submit tax rate update for approval
    async submitTaxRateUpdate(ratesData, submittedBy) {
        try {
            const docRef = await db.collection(COLLECTIONS.TAX_RATE_APPROVALS).add({
                rates: ratesData,
                status: 'pending', // pending, approved, rejected
                submittedBy: submittedBy,
                submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                quarter: ratesData.quarter,
                year: ratesData.year
            });
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Error submitting tax rate update:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get pending tax rate approvals
    async getPendingTaxRateApprovals() {
        try {
            const snapshot = await db.collection(COLLECTIONS.TAX_RATE_APPROVALS)
                .where('status', '==', 'pending')
                .orderBy('submittedAt', 'desc')
                .get();
            
            const approvals = [];
            snapshot.forEach(doc => {
                approvals.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, data: approvals };
        } catch (error) {
            console.error('Error getting pending approvals:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Approve tax rate update (admin only)
    async approveTaxRateUpdate(approvalId, approvedBy) {
        try {
            const approvalRef = db.collection(COLLECTIONS.TAX_RATE_APPROVALS).doc(approvalId);
            const approvalDoc = await approvalRef.get();
            
            if (!approvalDoc.exists) {
                return { success: false, error: 'Approval not found' };
            }
            
            const approvalData = approvalDoc.data();
            
            // Update approval status
            await approvalRef.update({
                status: 'approved',
                approvedBy: approvedBy,
                approvedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update current tax rates
            await db.collection(COLLECTIONS.TAX_RATES).doc('current').set({
                ...approvalData.rates,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                approvedBy: approvedBy
            });
            
            return { success: true };
        } catch (error) {
            console.error('Error approving tax rate update:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Reject tax rate update (admin only)
    async rejectTaxRateUpdate(approvalId, rejectedBy, reason) {
        try {
            await db.collection(COLLECTIONS.TAX_RATE_APPROVALS).doc(approvalId).update({
                status: 'rejected',
                rejectedBy: rejectedBy,
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                rejectionReason: reason
            });
            return { success: true };
        } catch (error) {
            console.error('Error rejecting tax rate update:', error);
            return { success: false, error: error.message };
        }
    },
    
    // ----- ACTIVITY LOGGING -----
    
    // Log activity
    async logActivity(userId, action, details) {
        try {
            await db.collection(COLLECTIONS.ACTIVITY_LOGS).add({
                userId: userId,
                action: action,
                details: details,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userAgent: navigator.userAgent
            });
            return { success: true };
        } catch (error) {
            console.error('Error logging activity:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get activity logs
    async getActivityLogs(limit = 100) {
        try {
            const snapshot = await db.collection(COLLECTIONS.ACTIVITY_LOGS)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            
            const logs = [];
            snapshot.forEach(doc => {
                logs.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, data: logs };
        } catch (error) {
            console.error('Error getting activity logs:', error);
            return { success: false, error: error.message };
        }
    },
    
    // ----- ERROR LOGGING -----
    
    // Log error
    async logError(errorData) {
        try {
            await db.collection(COLLECTIONS.ERROR_LOGS).add({
                ...errorData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userAgent: navigator.userAgent,
                url: window.location.href
            });
            return { success: true };
        } catch (error) {
            console.error('Error logging error:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get error logs
    async getErrorLogs(limit = 100) {
        try {
            const snapshot = await db.collection(COLLECTIONS.ERROR_LOGS)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            
            const logs = [];
            snapshot.forEach(doc => {
                logs.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, data: logs };
        } catch (error) {
            console.error('Error getting error logs:', error);
            return { success: false, error: error.message };
        }
    },
    
    // ----- REPORTS -----
    
    // Save report
    async saveReport(userId, reportData) {
        try {
            const docRef = await db.collection(COLLECTIONS.REPORTS).add({
                userId: userId,
                ...reportData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Error saving report:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get user reports
    async getUserReports(userId) {
        try {
            const snapshot = await db.collection(COLLECTIONS.REPORTS)
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .get();
            
            const reports = [];
            snapshot.forEach(doc => {
                reports.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, data: reports };
        } catch (error) {
            console.error('Error getting user reports:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get all reports (admin only)
    async getAllReports() {
        try {
            const snapshot = await db.collection(COLLECTIONS.REPORTS)
                .orderBy('createdAt', 'desc')
                .get();
            
            const reports = [];
            snapshot.forEach(doc => {
                reports.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, data: reports };
        } catch (error) {
            console.error('Error getting all reports:', error);
            return { success: false, error: error.message };
        }
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
});

// ==========================================
// ADMIN SETUP (Development only - disabled in production)
// ==========================================

// These functions are disabled in production for security
// To manage users, use Firebase Console directly:
// https://console.firebase.google.com/project/ifta-wizard-a9061/firestore

const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

if (isDevelopment) {
    // Call this from browser console: setupAdmin('your@email.com')
    window.setupAdmin = async function(email) {
        if (!db) {
            console.error('Firebase not initialized. Please refresh the page and try again.');
            return;
        }
        
        if (!email) {
            console.error('Please provide an email: setupAdmin("your@email.com")');
            return;
        }
        
        try {
            const docId = email.replace(/[^a-zA-Z0-9]/g, '_');
            const userRef = db.collection('users').doc(docId);
            const userDoc = await userRef.get();
            
            if (userDoc.exists) {
                await userRef.update({
                    role: 'admin',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ ${email} has been upgraded to ADMIN role`);
            } else {
                await userRef.set({
                    email: email.toLowerCase(),
                    name: 'Admin',
                    role: 'admin',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ Admin user created for ${email}`);
            }
        } catch (error) {
            console.error('Error setting up admin:', error);
        }
    };

    // Call this from browser console: setupAdminWithPassword('your@email.com', 'yourpassword')
    window.setupAdminWithPassword = async function(email, password) {
        if (!db) {
            console.error('Firebase not initialized. Please refresh the page and try again.');
            return;
        }
        
        if (!email || !password) {
            console.error('Please provide email and password: setupAdminWithPassword("your@email.com", "yourpassword")');
            return;
        }
        
        if (password.length < 6) {
            console.error('Password must be at least 6 characters');
            return;
        }
        
        function hashPassword(pwd) {
            let hash = 0;
            for (let i = 0; i < pwd.length; i++) {
                const char = pwd.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return 'hash_' + Math.abs(hash).toString(36) + '_' + pwd.length;
        }
        
        try {
            const docId = email.replace(/[^a-zA-Z0-9]/g, '_');
            const userRef = db.collection('users').doc(docId);
            const passwordHash = hashPassword(password);
            const userDoc = await userRef.get();
            
            if (userDoc.exists) {
                await userRef.update({
                    role: 'admin',
                    email: email.toLowerCase(),
                    passwordHash: passwordHash,
                    emailVerified: true,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ ${email} has been upgraded to ADMIN with password`);
            } else {
                await userRef.set({
                    email: email.toLowerCase(),
                    name: 'Admin',
                    role: 'admin',
                    passwordHash: passwordHash,
                    emailVerified: true,
                    signupMethod: 'email',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ Admin user created for ${email} with password`);
            }
            
            console.log('You can now log in with this email and password!');
        } catch (error) {
            console.error('Error setting up admin:', error);
        }
    };
    
    console.log('🔧 Development mode: Admin setup functions available');
} else {
    // Production - no admin functions exposed
    console.log('🔒 Production mode: Admin functions disabled');
}
