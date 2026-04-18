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

// FMCSA QCMobile API (free public key)
const FMCSA_CONFIG = {
    baseUrl: 'https://mobile.fmcsa.dot.gov/qc/services',
    webKey: '76969b3c7d50d2d32324e7601514d5c4b5ff0f96'
};

// Initialize Firebase
let app, auth, db, storage;

function initializeFirebase() {
    try {
        // Initialize Firebase App
        app = firebase.initializeApp(firebaseConfig);
        
        // Initialize Auth
        auth = firebase.auth();
        
        // Initialize Firestore
        db = firebase.firestore();

        // Initialize Storage
        storage = firebase.storage();
        
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
    },
    
    // ----- TASK MANAGEMENT (History/Tasks in subcollections) -----
    
    // Get custom task statuses from company dashboard
    async getCustomStatuses(userId) {
        try {
            const userDoc = await db.collection('users').doc(userId).get();
            if (!userDoc.exists) return { success: false, error: 'User not found' };
            
            const data = userDoc.data();
            const statuses = data.companyDashboard?.taskStatuses || [
                { name: 'Open', color: '#ef4444' },
                { name: 'In Progress', color: '#f59e0b' },
                { name: 'Resolved', color: '#10b981' }
            ];
            
            return { success: true, data: statuses };
        } catch (error) {
            console.error('Error getting custom statuses:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Create a new task
    async createTask(userId, entityType, entityId, taskData) {
        try {
            if (!['drivers', 'trucks', 'trailers'].includes(entityType)) {
                return { success: false, error: 'Invalid entity type' };
            }
            
            const taskRef = db.collection('users').doc(userId)
                .collection(entityType).doc(entityId)
                .collection('history').doc();
            
            const newTask = {
                ...taskData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdAtIso: new Date().toISOString(),
                resolvedAt: null,
                resolvedBy: null,
                resolutionNotes: null
            };
            
            await taskRef.set(newTask);
            return { success: true, id: taskRef.id };
        } catch (error) {
            console.error('Error creating task:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get tasks for a specific entity
    async getTasks(userId, entityType, entityId, filters = {}) {
        try {
            let query = db.collection('users').doc(userId)
                .collection(entityType).doc(entityId)
                .collection('history');
            
            // Filter by status if provided
            if (filters.status && filters.status.length > 0) {
                query = query.where('status', 'in', filters.status);
            }
            
            // Order by creation date
            query = query.orderBy('createdAt', 'desc');
            
            // Apply limit
            if (filters.limit) query = query.limit(filters.limit);
            
            const snapshot = await query.get();
            const tasks = [];
            snapshot.forEach(doc => {
                tasks.push({ id: doc.id, ...doc.data() });
            });
            
            return { success: true, data: tasks };
        } catch (error) {
            console.error('Error getting tasks:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get all tasks across entities for task board
    async getAllTasks(userId, filters = {}) {
        try {
            const entityTypes = ['drivers', 'trucks', 'trailers'];
            const userRef = db.collection('users').doc(userId);

            // Fetch all 3 entity collections in parallel
            const entitySnapshots = await Promise.all(
                entityTypes.map(t => userRef.collection(t).get())
            );

            // Build a flat list of { entityType, entityDoc } then fetch all history in parallel
            const jobs = [];
            entityTypes.forEach((entityType, i) => {
                entitySnapshots[i].docs.forEach(entityDoc => {
                    jobs.push(
                        entityDoc.ref.collection('history')
                            .orderBy('createdAt', 'desc').get()
                            .then(tasksSnap => ({ entityType, entityDoc, tasksSnap }))
                    );
                });
            });

            const results = await Promise.all(jobs);

            const allTasks = [];
            for (const { entityType, entityDoc, tasksSnap } of results) {
                const nameKey = entityType === 'drivers' ? 'firstName' : 'unit';
                const entityName = entityDoc.data()[nameKey] || entityDoc.id;
                tasksSnap.forEach(taskDoc => {
                    const data = taskDoc.data();
                    if (!data.status) return;
                    allTasks.push({
                        id: taskDoc.id,
                        entityType,
                        entityId: entityDoc.id,
                        entityName,
                        ...data
                    });
                });
            }

            // Sort by creation date
            allTasks.sort((a, b) => {
                const aTime = a.createdAt?.toDate?.() || new Date(a.createdAtIso || 0);
                const bTime = b.createdAt?.toDate?.() || new Date(b.createdAtIso || 0);
                return bTime - aTime;
            });
            
            return { success: true, data: allTasks };
        } catch (error) {
            console.error('Error getting all tasks:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Update task status
    async updateTaskStatus(userId, entityType, entityId, taskId, newStatus) {
        try {
            await db.collection('users').doc(userId)
                .collection(entityType).doc(entityId)
                .collection('history').doc(taskId)
                .update({
                    status: newStatus,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            
            return { success: true };
        } catch (error) {
            console.error('Error updating task status:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Update task (text, type, assignees, dueDate)
    async updateTask(userId, entityType, entityId, taskId, updateData) {
        try {
            await db.collection('users').doc(userId)
                .collection(entityType).doc(entityId)
                .collection('history').doc(taskId)
                .update({
                    ...updateData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            
            return { success: true };
        } catch (error) {
            console.error('Error updating task:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Resolve a task
    async resolveTask(userId, entityType, entityId, taskId, resolutionNotes, resolvedBy) {
        try {
            await db.collection('users').doc(userId)
                .collection(entityType).doc(entityId)
                .collection('history').doc(taskId)
                .update({
                    status: 'Resolved',
                    resolutionNotes: resolutionNotes || '',
                    resolvedBy: resolvedBy,
                    resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            
            return { success: true };
        } catch (error) {
            console.error('Error resolving task:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Reopen a resolved task
    async reopenTask(userId, entityType, entityId, taskId) {
        try {
            await db.collection('users').doc(userId)
                .collection(entityType).doc(entityId)
                .collection('history').doc(taskId)
                .update({
                    status: 'Open',
                    resolutionNotes: null,
                    resolvedBy: null,
                    resolvedAt: null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            
            return { success: true };
        } catch (error) {
            console.error('Error reopening task:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Delete a task
    async deleteTask(userId, entityType, entityId, taskId) {
        try {
            await db.collection('users').doc(userId)
                .collection(entityType).doc(entityId)
                .collection('history').doc(taskId)
                .delete();
            
            return { success: true };
        } catch (error) {
            console.error('Error deleting task:', error);
            return { success: false, error: error.message };
        }
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
});

// ==========================================
// CENTRALIZED ADMIN EMAILS - Single source of truth
// ==========================================
const ADMIN_EMAILS = [
    'milan.pericic@logistixnerd.com',
    'milanpericic@gmail.com',
    'admin@iftawizard.com'
].map(e => e.toLowerCase());

// Export for other modules
window.ADMIN_EMAILS = ADMIN_EMAILS;

// ==========================================
// ADMIN SETUP - Development only for security
// ==========================================
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

if (isDevelopment) {
    // Make current logged-in user an admin (DEV ONLY)
    window.makeCurrentUserAdmin = async function() {
        if (!db) {
            console.error('Firebase not initialized. Please refresh the page and try again.');
            return;
        }
        
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.error('You must be logged in first! Sign in with Google or Email, then run this again.');
            return;
        }
        
        try {
            const userRef = db.collection('users').doc(currentUser.uid);
            const userDoc = await userRef.get();
            
            if (userDoc.exists) {
                await userRef.update({
                    role: 'admin',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await userRef.set({
                    email: currentUser.email,
                    name: currentUser.displayName || 'Admin',
                    role: 'admin',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            console.log(`SUCCESS! ${currentUser.email} (UID: ${currentUser.uid}) is now an ADMIN`);
            console.log('Please refresh the page to see admin features.');
        } catch (error) {
            console.error('Error setting up admin:', error);
        }
    };

    // Setup admin by email (DEV ONLY)
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
            const emailLower = email.toLowerCase();
            // Find user by email query instead of document ID
            const usersRef = db.collection('users');
            const snapshot = await usersRef.where('email', '==', emailLower).get();
            
            if (!snapshot.empty) {
                const userDoc = snapshot.docs[0];
                await userDoc.ref.update({
                    role: 'admin',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`SUCCESS! ${email} has been upgraded to ADMIN role`);
            } else {
                console.error(`No user found with email: ${email}`);
                console.log('The user must sign up first before being made admin.');
            }
        } catch (error) {
            console.error('Error setting up admin:', error);
        }
    };
    
    console.log('Development mode: Admin setup functions available');
    console.log('   - makeCurrentUserAdmin() - Make yourself admin while logged in');
    console.log('   - setupAdmin("email") - Make existing user admin by email');
} else {
    // Production - no admin functions exposed
    console.log('Production mode: Admin functions disabled');
}
