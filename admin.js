// Admin Panel JavaScript
// ==========================================

const AdminPanel = {
    currentUser: null,
    currentSection: 'dashboard',
    selectedUserId: null,
    selectedApprovalId: null,
    
    // Admin emails - use centralized list from firebase-config.js or fallback
    get adminEmails() {
        return window.ADMIN_EMAILS || [
            'milan.pericic@logistixnerd.com',
            'milanpericic@gmail.com',
            'admin@iftawizard.com'
        ];
    },
    
    // Initialize admin panel
    async init() {
        // Initialize Firebase first
        await this.initFirebaseIfAvailable();
        
        // Check Firebase Authentication
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    // User is signed in via Firebase Auth
                    this.currentUser = {
                        uid: user.uid,
                        email: user.email,
                        name: user.displayName || 'Admin'
                    };
                    
                    // Check if user is admin
                    if (this.isAdmin(user.email)) {
                        this.showAdminPanel();
                        this.loadUserProfileFromLocal();
                        this.setupEventListeners();
                        await this.loadDashboardData();
                    } else {
                        this.showAccessDenied();
                    }
                } else {
                    // Not signed in, redirect to main app
                    this.showAccessDenied();
                }
            });
        } else {
            // Firebase not available, show access denied
            this.showAccessDenied();
        }
    },
    
    // Check if email is admin
    isAdmin(email) {
        if (!email) return false;
        return this.adminEmails.includes(email.toLowerCase());
    },
    
    // Initialize Firebase if available
    async initFirebaseIfAvailable() {
        try {
            if (typeof firebase !== 'undefined') {
                if (firebase.apps.length === 0 && typeof initializeFirebase === 'function') {
                    initializeFirebase();
                }
            }
        } catch (error) {
            // Firebase not available, using localStorage only
        }
    },
    
    // Load user profile from localStorage
    loadUserProfileFromLocal() {
        if (this.currentUser) {
            document.getElementById('adminUserName').textContent = this.currentUser.name || 'Admin';
            document.getElementById('adminUserRole').textContent = 'Administrator';
        }
    },
    
    // Show admin panel
    showAdminPanel() {
        document.getElementById('adminLoading').classList.add('hidden');
        document.getElementById('accessDenied').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');
    },
    
    // Show access denied
    showAccessDenied() {
        document.getElementById('adminLoading').classList.add('hidden');
        document.getElementById('adminPanel').classList.add('hidden');
        document.getElementById('accessDenied').classList.remove('hidden');
    },
    
    // Setup event listeners
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.admin-nav-item[data-section]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSection(item.dataset.section);
            });
        });
        
        // Logout - sign out completely and go to main app login
        document.getElementById('adminLogout')?.addEventListener('click', async () => {
            try {
                await firebase.auth().signOut();
                // Clear any local storage auth data
                localStorage.removeItem('ifta_user');
                // Redirect to main app (will show login modal)
                window.location.href = '/';
            } catch (error) {
                console.error('Logout error:', error);
                window.location.href = '/';
            }
        });
        
        // Search handlers
        document.getElementById('userSearch')?.addEventListener('input', (e) => {
            this.filterTable('usersTableBody', e.target.value);
        });
        
        document.getElementById('companySearch')?.addEventListener('input', (e) => {
            this.filterTable('companiesTableBody', e.target.value);
        });
        
        document.getElementById('reportSearch')?.addEventListener('input', (e) => {
            this.filterTable('reportsTableBody', e.target.value);
        });
        
        // Fetch new rates button
        document.getElementById('fetchNewRatesBtn')?.addEventListener('click', () => {
            this.fetchNewTaxRates();
        });
        
        // Send reminder button
        document.getElementById('sendReminderBtn')?.addEventListener('click', () => {
            this.sendTaxRateReminder();
        });
    },
    
    // Switch section
    switchSection(section) {
        this.currentSection = section;
        
        // Update nav
        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });
        
        // Update sections
        document.querySelectorAll('.admin-section').forEach(s => {
            s.classList.toggle('active', s.id === `section-${section}`);
        });
        
        // Update title
        const titles = {
            'dashboard': 'Dashboard',
            'users': 'User Management',
            'companies': 'Companies',
            'reports': 'Reports',
            'tax-rates': 'Tax Rate Management',
            'activity': 'Activity Log',
            'errors': 'Error Log',
            'about-editor': 'About Page Editor'
        };
        document.getElementById('pageTitle').textContent = titles[section] || 'Admin';
        
        // Load section data
        this.loadSectionData(section);
    },
    
    // Load section data
    async loadSectionData(section) {
        switch (section) {
            case 'dashboard':
                await this.loadDashboardData();
                break;
            case 'users':
                await this.loadUsers();
                break;
            case 'companies':
                await this.loadCompanies();
                break;
            case 'reports':
                await this.loadReports();
                break;
            case 'tax-rates':
                await this.loadTaxRates();
                break;
            case 'activity':
                await this.loadActivityLog();
                break;
            case 'errors':
                await this.loadErrorLog();
                break;
            case 'about-editor':
                await this.loadAboutContent();
                break;
        }
    },
    
    // Load dashboard data
    async loadDashboardData() {
        try {
            // Get users from Firestore
            const users = await this.getUsersFromFirestore();
            
            // Get data from localStorage for reports and invites
            const reports = JSON.parse(localStorage.getItem('ifta_saved_reports') || '[]');
            const invites = JSON.parse(localStorage.getItem('ifta_invites') || '[]');
            
            // Get unique companies from users
            const companies = this.getCompaniesFromUsers(users);
            
            // Update stats
            document.getElementById('statTotalUsers').textContent = users.length;
            document.getElementById('statTotalCompanies').textContent = companies.length;
            document.getElementById('statTotalReports').textContent = reports.length;
            document.getElementById('statPendingApprovals').textContent = invites.filter(i => i.status === 'pending').length;
            
            // Update badge
            const badge = document.getElementById('pendingApprovalsBadge');
            if (badge) {
                const pending = invites.filter(i => i.status === 'pending').length;
                badge.textContent = pending > 0 ? pending : '';
            }
            
            // Load companies list on dashboard
            this.loadDashboardCompanies(companies, users);
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    },
    
    // Get users from Firestore
    async getUsersFromFirestore() {
        try {
            if (typeof db === 'undefined') {
                console.warn('Firestore not available, falling back to localStorage');
                return JSON.parse(localStorage.getItem('ifta_users') || '[]');
            }
            
            const snapshot = await db.collection('users').get();
            const users = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                users.push({
                    id: doc.id,
                    name: data.name || data.displayName || 'Unknown',
                    email: data.email || '',
                    company: data.company || '',
                    role: data.role || 'user',
                    createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
                    signupMethod: data.signupMethod || 'email'
                });
            });
            
            return users;
        } catch (error) {
            console.error('Error fetching users from Firestore:', error);
            return JSON.parse(localStorage.getItem('ifta_users') || '[]');
        }
    },
    
    // Get unique companies from users
    getCompaniesFromUsers(users) {
        const companyMap = new Map();
        users.forEach(user => {
            if (user.company && user.company.trim()) {
                const companyName = user.company.trim();
                if (!companyMap.has(companyName.toLowerCase())) {
                    companyMap.set(companyName.toLowerCase(), {
                        name: companyName,
                        users: [],
                        createdAt: user.createdAt
                    });
                }
                companyMap.get(companyName.toLowerCase()).users.push(user);
            }
        });
        return Array.from(companyMap.values());
    },
    
    // Load companies list on dashboard
    loadDashboardCompanies(companies, users) {
        const container = document.getElementById('dashboardCompaniesList');
        if (!container) return;
        
        if (companies.length === 0) {
            container.innerHTML = '<p class="empty-state">No companies yet</p>';
            return;
        }
        
        let html = '<div class="company-links">';
        companies.forEach(company => {
            const userCount = company.users.length;
            html += `
                <a href="#" class="company-link" onclick="AdminPanel.viewCompanyProfile('${encodeURIComponent(company.name)}'); return false;">
                    <span class="company-name">${company.name}</span>
                    <span class="company-user-count">${userCount} user${userCount !== 1 ? 's' : ''}</span>
                </a>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    },
    
    // View company profile
    async viewCompanyProfile(companyName) {
        companyName = decodeURIComponent(companyName);
        const users = await this.getUsersFromFirestore();
        const companyUsers = users.filter(u => u.company && u.company.toLowerCase() === companyName.toLowerCase());
        const reports = JSON.parse(localStorage.getItem('ifta_saved_reports') || '[]');
        const companyReports = reports.filter(r => {
            const user = users.find(u => u.id === r.userId);
            return user && user.company && user.company.toLowerCase() === companyName.toLowerCase();
        });
        
        // Show company modal
        this.showCompanyProfileModal(companyName, companyUsers, companyReports);
    },
    
    // Show company profile modal
    showCompanyProfileModal(companyName, users, reports) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('companyProfileModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'companyProfileModal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        
        let usersHtml = users.map(u => `
            <div class="company-user-item">
                <span>${u.name || 'Unknown'}</span>
                <span class="user-email">${u.email}</span>
                <span class="user-role">${u.role || 'user'}</span>
            </div>
        `).join('');
        
        if (users.length === 0) usersHtml = '<p class="empty-state">No users</p>';
        
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <button class="modal-close" onclick="AdminPanel.closeCompanyProfileModal()">&times;</button>
                <h2>${companyName}</h2>
                <div class="company-profile-stats">
                    <span>${users.length} user${users.length !== 1 ? 's' : ''}</span>
                    <span>${reports.length} report${reports.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="company-section">
                    <h3>Users</h3>
                    ${usersHtml}
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    closeCompanyProfileModal() {
        const modal = document.getElementById('companyProfileModal');
        if (modal) modal.classList.add('hidden');
    },
    
    // Load recent activity
    async loadRecentActivity() {
        try {
            const snapshot = await db.collection('activity_logs')
                .orderBy('timestamp', 'desc')
                .limit(10)
                .get();
            
            const container = document.getElementById('recentActivityList');
            
            if (snapshot.empty) {
                container.innerHTML = '<p class="empty-state">No recent activity</p>';
                return;
            }
            
            let html = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                const time = data.timestamp ? this.formatTime(data.timestamp.toDate()) : 'Unknown';
                const icon = this.getActivityIcon(data.action);
                
                html += `
                    <div class="activity-item">
                        <div class="activity-icon">${icon}</div>
                        <div class="activity-content">
                            <div class="activity-text">${data.details || data.action}</div>
                            <div class="activity-time">${time}</div>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    },
    
    // Load users
    async loadUsers() {
        try {
            const users = await this.getUsersFromFirestore();
            const tbody = document.getElementById('usersTableBody');
            
            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users found</td></tr>';
                return;
            }
            
            let html = '';
            users.forEach(user => {
                const created = user.createdAt ? this.formatDate(new Date(user.createdAt)) : 'Unknown';
                const role = user.role || 'user';
                
                html += `
                    <tr data-search="${(user.name + ' ' + user.email + ' ' + user.company).toLowerCase()}">
                        <td>
                            <strong>${user.name || 'Unknown'}</strong>
                        </td>
                        <td>${user.email || '-'}</td>
                        <td>${user.company || '-'}</td>
                        <td><span class="role-badge ${role}">${role}</span></td>
                        <td>${created}</td>
                        <td>
                            <button class="btn btn-sm" onclick="AdminPanel.openRoleModal('${user.id}', '${user.name || ''}', '${role}')">
                                Change Role
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            tbody.innerHTML = html;
        } catch (error) {
            console.error('Error loading users:', error);
            document.getElementById('usersTableBody').innerHTML = 
                '<tr><td colspan="6" class="empty-state">Error loading users</td></tr>';
        }
    },
    
    // Load companies (from Firestore users)
    async loadCompanies() {
        try {
            const tbody = document.getElementById('companiesTableBody');
            if (!tbody) return;
            
            // Get companies from Firestore users
            const users = await this.getUsersFromFirestore();
            const reports = JSON.parse(localStorage.getItem('ifta_saved_reports') || '[]');
            const companies = this.getCompaniesFromUsers(users);
            
            // Also check for standalone companies
            const standaloneCompanies = JSON.parse(localStorage.getItem('ifta_companies') || '[]');
            standaloneCompanies.forEach(sc => {
                if (!companies.find(c => c.name.toLowerCase() === sc.name.toLowerCase())) {
                    companies.push(sc);
                }
            });
            
            if (companies.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No companies found</td></tr>';
                return;
            }
            
            let html = '';
            companies.forEach((company, index) => {
                // Count reports for this company
                const companyUserIds = company.users ? company.users.map(u => u.id) : [];
                const companyReports = reports.filter(r => companyUserIds.includes(r.userId));
                const created = company.createdAt ? this.formatDate(new Date(company.createdAt)) : '-';
                const ownerUser = company.users?.find(u => u.role === 'admin' || u.role === 'owner') || company.users?.[0];
                const ownerName = ownerUser?.name || company.owner || '-';
                
                html += `
                    <tr data-search="${(company.name + ' ' + ownerName).toLowerCase()}" data-company-index="${index}">
                        <td><strong>${company.name || 'Unknown'}</strong></td>
                        <td>${ownerName}</td>
                        <td>${company.users?.length || 0}</td>
                        <td>${companyReports.length}</td>
                        <td>${created}</td>
                        <td>
                            <button class="btn btn-sm" onclick="AdminPanel.viewCompanyDetails('${encodeURIComponent(company.name)}')">
                                View
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="AdminPanel.editCompany('${encodeURIComponent(company.name)}')">
                                Edit
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="AdminPanel.deleteCompany('${encodeURIComponent(company.name)}')">
                                Delete
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            tbody.innerHTML = html;
        } catch (error) {
            console.error('Error loading companies:', error);
            const tbody = document.getElementById('companiesTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error loading companies</td></tr>';
            }
        }
    },
    
    // View company details
    viewCompanyDetails(encodedName) {
        const companyName = decodeURIComponent(encodedName);
        const users = JSON.parse(localStorage.getItem('ifta_users') || '[]');
        const reports = JSON.parse(localStorage.getItem('ifta_saved_reports') || '[]');
        
        const companyUsers = users.filter(u => 
            u.company && u.company.toLowerCase() === companyName.toLowerCase()
        );
        
        const companyUserIds = companyUsers.map(u => u.id);
        const companyReports = reports.filter(r => companyUserIds.includes(r.userId));
        
        // Calculate stats
        const totalMiles = companyReports.reduce((sum, r) => sum + (r.totalMiles || 0), 0);
        const totalTax = companyReports.reduce((sum, r) => sum + (r.netTax || 0), 0);
        
        // Create detailed modal
        let modal = document.getElementById('companyDetailsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'companyDetailsModal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        
        let usersHtml = companyUsers.length > 0 ? companyUsers.map(u => `
            <tr>
                <td>${u.name || 'Unknown'}</td>
                <td>${u.email}</td>
                <td><span class="role-badge ${u.role || 'user'}">${u.role || 'user'}</span></td>
                <td>${u.lastLogin ? this.formatDate(new Date(u.lastLogin)) : 'Never'}</td>
            </tr>
        `).join('') : '<tr><td colspan="4" class="empty-state">No users</td></tr>';
        
        let reportsHtml = companyReports.length > 0 ? companyReports.slice(0, 5).map(r => `
            <tr>
                <td>${r.quarter || '-'}</td>
                <td>${(r.totalMiles || 0).toLocaleString()}</td>
                <td>$${(r.netTax || 0).toFixed(2)}</td>
                <td>${r.createdAt ? this.formatDate(new Date(r.createdAt)) : '-'}</td>
            </tr>
        `).join('') : '<tr><td colspan="4" class="empty-state">No reports</td></tr>';
        
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <button class="modal-close" onclick="AdminPanel.closeModal('companyDetailsModal')">&times;</button>
                <h2>${companyName}</h2>
                
                <div class="company-stats-grid">
                    <div class="company-stat">
                        <div class="stat-value">${companyUsers.length}</div>
                        <div class="stat-label">Users</div>
                    </div>
                    <div class="company-stat">
                        <div class="stat-value">${companyReports.length}</div>
                        <div class="stat-label">Reports</div>
                    </div>
                    <div class="company-stat">
                        <div class="stat-value">${totalMiles.toLocaleString()}</div>
                        <div class="stat-label">Total Miles</div>
                    </div>
                    <div class="company-stat">
                        <div class="stat-value">$${totalTax.toFixed(2)}</div>
                        <div class="stat-label">Total Tax</div>
                    </div>
                </div>
                
                <div class="company-section">
                    <h3>Users</h3>
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Last Login</th>
                            </tr>
                        </thead>
                        <tbody>${usersHtml}</tbody>
                    </table>
                </div>
                
                <div class="company-section">
                    <h3>📄 Recent Reports</h3>
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Quarter</th>
                                <th>Miles</th>
                                <th>Net Tax</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>${reportsHtml}</tbody>
                    </table>
                    ${companyReports.length > 5 ? `<p class="text-muted">Showing 5 of ${companyReports.length} reports</p>` : ''}
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="AdminPanel.closeModal('companyDetailsModal')">Close</button>
                    <button class="btn" onclick="AdminPanel.closeModal('companyDetailsModal'); AdminPanel.editCompany('${encodedName}');">Edit Company</button>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    // Edit company
    editCompany(encodedName) {
        const companyName = decodeURIComponent(encodedName);
        const users = JSON.parse(localStorage.getItem('ifta_users') || '[]');
        const companyUsers = users.filter(u => 
            u.company && u.company.toLowerCase() === companyName.toLowerCase()
        );
        
        // Get standalone company data if exists
        const standaloneCompanies = JSON.parse(localStorage.getItem('ifta_companies') || '[]');
        const existingCompany = standaloneCompanies.find(c => c.name.toLowerCase() === companyName.toLowerCase());
        
        let modal = document.getElementById('editCompanyModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'editCompanyModal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close" onclick="AdminPanel.closeModal('editCompanyModal')">&times;</button>
                <h2>Edit Company</h2>
                
                <form id="editCompanyForm" onsubmit="AdminPanel.saveCompanyEdit(event, '${encodedName}')">
                    <div class="form-group">
                        <label>Company Name</label>
                        <input type="text" id="editCompanyName" class="form-control" value="${companyName}" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Address</label>
                        <input type="text" id="editCompanyAddress" class="form-control" value="${existingCompany?.address || ''}" placeholder="Street address">
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>City</label>
                            <input type="text" id="editCompanyCity" class="form-control" value="${existingCompany?.city || ''}">
                        </div>
                        <div class="form-group">
                            <label>State</label>
                            <input type="text" id="editCompanyState" class="form-control" value="${existingCompany?.state || ''}" maxlength="2">
                        </div>
                        <div class="form-group">
                            <label>ZIP</label>
                            <input type="text" id="editCompanyZip" class="form-control" value="${existingCompany?.zip || ''}">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="tel" id="editCompanyPhone" class="form-control" value="${existingCompany?.phone || ''}" placeholder="(555) 123-4567">
                    </div>
                    
                    <div class="form-group">
                        <label>USDOT Number</label>
                        <input type="text" id="editCompanyUSDOT" class="form-control" value="${existingCompany?.usdot || ''}" placeholder="USDOT #">
                    </div>
                    
                    <div class="form-group">
                        <label>Notes</label>
                        <textarea id="editCompanyNotes" class="form-control" rows="3" placeholder="Internal notes...">${existingCompany?.notes || ''}</textarea>
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="AdminPanel.closeModal('editCompanyModal')">Cancel</button>
                        <button type="submit" class="btn">Save Changes</button>
                    </div>
                </form>
            </div>
        `;
        
        modal.classList.remove('hidden');
    },
    
    // Save company edit
    saveCompanyEdit(event, originalEncodedName) {
        event.preventDefault();
        
        const originalName = decodeURIComponent(originalEncodedName);
        const newName = document.getElementById('editCompanyName').value.trim();
        
        if (!newName) {
            alert('Company name is required');
            return;
        }
        
        // Update users with new company name if changed
        if (newName.toLowerCase() !== originalName.toLowerCase()) {
            const users = JSON.parse(localStorage.getItem('ifta_users') || '[]');
            users.forEach(user => {
                if (user.company && user.company.toLowerCase() === originalName.toLowerCase()) {
                    user.company = newName;
                }
            });
            localStorage.setItem('ifta_users', JSON.stringify(users));
        }
        
        // Save/update standalone company data
        const standaloneCompanies = JSON.parse(localStorage.getItem('ifta_companies') || '[]');
        const existingIndex = standaloneCompanies.findIndex(c => c.name.toLowerCase() === originalName.toLowerCase());
        
        const companyData = {
            name: newName,
            address: document.getElementById('editCompanyAddress').value.trim(),
            city: document.getElementById('editCompanyCity').value.trim(),
            state: document.getElementById('editCompanyState').value.trim().toUpperCase(),
            zip: document.getElementById('editCompanyZip').value.trim(),
            phone: document.getElementById('editCompanyPhone').value.trim(),
            usdot: document.getElementById('editCompanyUSDOT').value.trim(),
            notes: document.getElementById('editCompanyNotes').value.trim(),
            updatedAt: new Date().toISOString()
        };
        
        if (existingIndex >= 0) {
            companyData.createdAt = standaloneCompanies[existingIndex].createdAt;
            standaloneCompanies[existingIndex] = companyData;
        } else {
            companyData.createdAt = new Date().toISOString();
            standaloneCompanies.push(companyData);
        }
        
        localStorage.setItem('ifta_companies', JSON.stringify(standaloneCompanies));
        
        this.closeModal('editCompanyModal');
        this.loadCompanies();
        this.logActivity('company_edit', `Updated company: ${newName}`);
        
        alert('Company updated successfully!');
    },
    
    // Delete company
    deleteCompany(encodedName) {
        const companyName = decodeURIComponent(encodedName);
        
        if (!confirm(`Are you sure you want to delete "${companyName}"?\n\nThis will remove the company association from all users, but will NOT delete the users themselves.`)) {
            return;
        }
        
        // Remove company from users
        const users = JSON.parse(localStorage.getItem('ifta_users') || '[]');
        users.forEach(user => {
            if (user.company && user.company.toLowerCase() === companyName.toLowerCase()) {
                user.company = '';
            }
        });
        localStorage.setItem('ifta_users', JSON.stringify(users));
        
        // Remove standalone company data
        const standaloneCompanies = JSON.parse(localStorage.getItem('ifta_companies') || '[]');
        const filtered = standaloneCompanies.filter(c => c.name.toLowerCase() !== companyName.toLowerCase());
        localStorage.setItem('ifta_companies', JSON.stringify(filtered));
        
        this.loadCompanies();
        this.loadDashboard();
        this.logActivity('company_delete', `Deleted company: ${companyName}`);
        
        alert('Company deleted successfully!');
    },
    
    // Close modal helper
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    },
    
    // Show add company modal
    showAddCompanyModal() {
        let modal = document.getElementById('addCompanyModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'addCompanyModal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close" onclick="AdminPanel.closeModal('addCompanyModal')">&times;</button>
                <h2>Add New Company</h2>
                
                <form id="addCompanyForm" onsubmit="AdminPanel.saveNewCompany(event)">
                    <div class="form-group">
                        <label>Company Name *</label>
                        <input type="text" id="newCompanyName" class="form-control" required placeholder="Enter company name">
                    </div>
                    
                    <div class="form-group">
                        <label>Owner Name</label>
                        <input type="text" id="newCompanyOwner" class="form-control" placeholder="Primary contact name">
                    </div>
                    
                    <div class="form-group">
                        <label>Address</label>
                        <input type="text" id="newCompanyAddress" class="form-control" placeholder="Street address">
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>City</label>
                            <input type="text" id="newCompanyCity" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>State</label>
                            <input type="text" id="newCompanyState" class="form-control" maxlength="2" placeholder="XX">
                        </div>
                        <div class="form-group">
                            <label>ZIP</label>
                            <input type="text" id="newCompanyZip" class="form-control">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="tel" id="newCompanyPhone" class="form-control" placeholder="(555) 123-4567">
                    </div>
                    
                    <div class="form-group">
                        <label>USDOT Number</label>
                        <input type="text" id="newCompanyUSDOT" class="form-control" placeholder="USDOT #">
                    </div>
                    
                    <div class="form-group">
                        <label>Notes</label>
                        <textarea id="newCompanyNotes" class="form-control" rows="3" placeholder="Internal notes..."></textarea>
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="AdminPanel.closeModal('addCompanyModal')">Cancel</button>
                        <button type="submit" class="btn">Add Company</button>
                    </div>
                </form>
            </div>
        `;
        
        modal.classList.remove('hidden');
        document.getElementById('newCompanyName').focus();
    },
    
    // Save new company
    saveNewCompany(event) {
        event.preventDefault();
        
        const name = document.getElementById('newCompanyName').value.trim();
        
        if (!name) {
            alert('Company name is required');
            return;
        }
        
        // Check for duplicates
        const standaloneCompanies = JSON.parse(localStorage.getItem('ifta_companies') || '[]');
        const users = JSON.parse(localStorage.getItem('ifta_users') || '[]');
        const existingCompanies = this.getCompaniesFromUsers(users);
        
        const allCompanyNames = [
            ...standaloneCompanies.map(c => c.name.toLowerCase()),
            ...existingCompanies.map(c => c.name.toLowerCase())
        ];
        
        if (allCompanyNames.includes(name.toLowerCase())) {
            alert('A company with this name already exists');
            return;
        }
        
        // Create new company
        const newCompany = {
            name: name,
            owner: document.getElementById('newCompanyOwner').value.trim(),
            address: document.getElementById('newCompanyAddress').value.trim(),
            city: document.getElementById('newCompanyCity').value.trim(),
            state: document.getElementById('newCompanyState').value.trim().toUpperCase(),
            zip: document.getElementById('newCompanyZip').value.trim(),
            phone: document.getElementById('newCompanyPhone').value.trim(),
            usdot: document.getElementById('newCompanyUSDOT').value.trim(),
            notes: document.getElementById('newCompanyNotes').value.trim(),
            users: [],
            createdAt: new Date().toISOString()
        };
        
        standaloneCompanies.push(newCompany);
        localStorage.setItem('ifta_companies', JSON.stringify(standaloneCompanies));
        
        this.closeModal('addCompanyModal');
        this.loadCompanies();
        this.loadDashboard();
        this.logActivity('company_create', `Created new company: ${name}`);
        
        alert('Company added successfully!');
    },

    // Load reports
    async loadReports() {
        try {
            const snapshot = await db.collection('reports')
                .orderBy('createdAt', 'desc')
                .get();
            
            const tbody = document.getElementById('reportsTableBody');
            
            if (snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No reports found</td></tr>';
                return;
            }
            
            let html = '';
            snapshot.forEach(doc => {
                const report = doc.data();
                const created = report.createdAt ? this.formatDate(report.createdAt.toDate()) : 'Unknown';
                const netTax = report.netTax || 0;
                const netTaxClass = netTax >= 0 ? 'color: #38a169' : 'color: #e53e3e';
                
                html += `
                    <tr>
                        <td><code>${doc.id.substring(0, 8)}...</code></td>
                        <td>${report.companyName || '-'}</td>
                        <td>${report.quarter || '-'} ${report.year || ''}</td>
                        <td>${(report.totalMiles || 0).toLocaleString()}</td>
                        <td style="${netTaxClass}; font-weight: 600;">
                            ${netTax >= 0 ? '+' : ''}$${netTax.toFixed(2)}
                        </td>
                        <td>${created}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="AdminPanel.viewReport('${doc.id}')">
                                View
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            tbody.innerHTML = html;
        } catch (error) {
            console.error('Error loading reports:', error);
        }
    },
    
    // ========== MULTI-QUARTER TAX RATE MANAGEMENT ==========
    
    // Store for tracking state
    modifiedRates: {},
    currentFuelType: 'diesel',
    originalRates: {},
    taxRatesInitialized: false,
    selectedQuarter: null, // e.g., "Q4 2025"
    quarterRatesStore: {}, // Stores all quarters' rates
    
    // Generate list of quarters (2 years back + current + 1 ahead)
    getQuartersList() {
        const quarters = [];
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
        
        // Start from 2 years ago Q1
        const startYear = currentYear - 2;
        
        for (let year = startYear; year <= currentYear + 1; year++) {
            for (let q = 1; q <= 4; q++) {
                // Stop after Q1 of next year (one quarter ahead)
                if (year === currentYear + 1 && q > 1) break;
                
                // Don't include future quarters beyond one ahead
                const isCurrentOrPast = year < currentYear || 
                    (year === currentYear && q <= currentQuarter) ||
                    (year === currentYear && q === currentQuarter + 1) ||
                    (year === currentYear + 1 && q === 1 && currentQuarter === 4);
                
                const isFuture = (year === currentYear && q > currentQuarter) || year > currentYear;
                const isCurrent = year === currentYear && q === currentQuarter;
                
                quarters.push({
                    label: `Q${q} ${year}`,
                    quarter: q,
                    year: year,
                    isFuture: isFuture,
                    isCurrent: isCurrent,
                    effectiveDate: this.getQuarterEffectiveDate(q, year),
                    endDate: this.getQuarterEndDate(q, year)
                });
            }
        }
        
        return quarters;
    },
    
    // Get effective date for a quarter
    getQuarterEffectiveDate(q, year) {
        const months = { 1: '01', 2: '04', 3: '07', 4: '10' };
        return `${year}-${months[q]}-01`;
    },
    
    // Get end date for a quarter
    getQuarterEndDate(q, year) {
        const endDates = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
        return `${year}-${endDates[q]}`;
    },
    
    // Load tax rates - main entry point
    async loadTaxRates() {
        try {
            // Check if IFTA_TAX_RATES is available from tax-rates.js
            if (typeof IFTA_TAX_RATES === 'undefined') {
                throw new Error('Tax rates data not loaded');
            }
            
            // Load stored quarters from localStorage
            this.loadQuarterRatesFromStorage();
            
            // Initialize event listeners only once
            if (!this.taxRatesInitialized) {
                this.initTaxRatesListeners();
                this.taxRatesInitialized = true;
            }
            
            // Render the quarter selector
            this.renderQuarterSelector();
            
            // Select current quarter by default, or Q4 2025 from IFTA_TAX_RATES
            const defaultQuarter = IFTA_TAX_RATES.quarter || this.getCurrentQuarterLabel();
            this.selectQuarter(defaultQuarter);
            
            // Render stored quarters overview
            this.renderStoredQuarters();
            
        } catch (error) {
            console.error('Error loading tax rates:', error);
            document.getElementById('taxRatesTableBody').innerHTML = 
                `<tr><td colspan="6" class="empty-state">Error: ${error.message}</td></tr>`;
        }
    },
    
    // Get current quarter label
    getCurrentQuarterLabel() {
        const now = new Date();
        const q = Math.ceil((now.getMonth() + 1) / 3);
        return `Q${q} ${now.getFullYear()}`;
    },
    
    // Initialize tax rates listeners (only once)
    initTaxRatesListeners() {
        // Fuel type filter
        const fuelFilter = document.getElementById('fuelTypeFilter');
        if (fuelFilter) {
            fuelFilter.value = this.currentFuelType;
            fuelFilter.addEventListener('change', (e) => {
                this.currentFuelType = e.target.value;
                this.renderTaxRatesTable();
            });
        }
        
        // State search filter
        const stateSearch = document.getElementById('stateSearch');
        if (stateSearch) {
            stateSearch.addEventListener('input', (e) => {
                this.filterTaxRatesTable(e.target.value);
            });
        }
        
        // Save button
        const saveBtn = document.getElementById('saveRatesBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveQuarterRates();
            });
        }
        
        // Copy from button
        const copyBtn = document.getElementById('copyFromQuarterBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                this.openCopyQuarterModal();
            });
        }
    },
    
    // Render quarter selector buttons
    renderQuarterSelector() {
        const container = document.getElementById('quarterSelector');
        if (!container) return;
        
        const quarters = this.getQuartersList();
        let html = '';
        
        quarters.forEach(q => {
            const hasData = this.quarterRatesStore[q.label] !== undefined;
            const classes = [
                'quarter-btn',
                q.isFuture ? 'future' : '',
                q.isCurrent ? 'current' : '',
                hasData ? 'has-data' : '',
                this.selectedQuarter === q.label ? 'active' : ''
            ].filter(Boolean).join(' ');
            
            html += `<button class="${classes}" onclick="AdminPanel.selectQuarter('${q.label}')">${q.label}</button>`;
        });
        
        container.innerHTML = html;
    },
    
    // Select a quarter to edit
    selectQuarter(quarterLabel) {
        this.selectedQuarter = quarterLabel;
        this.modifiedRates = {}; // Clear modifications when switching
        
        // Update quarter selector buttons
        document.querySelectorAll('.quarter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent === quarterLabel);
        });
        
        // Parse quarter info
        const match = quarterLabel.match(/Q(\d) (\d{4})/);
        if (!match) return;
        
        const q = parseInt(match[1]);
        const year = parseInt(match[2]);
        const now = new Date();
        const currentQ = Math.ceil((now.getMonth() + 1) / 3);
        const currentYear = now.getFullYear();
        
        // Determine quarter type
        let quarterType = 'past';
        if (year === currentYear && q === currentQ) {
            quarterType = 'current';
        } else if (year > currentYear || (year === currentYear && q > currentQ)) {
            quarterType = 'future';
        }
        
        // Update status display
        document.getElementById('selectedQuarterDisplay').textContent = quarterLabel;
        const badge = document.getElementById('quarterStatusBadge');
        badge.textContent = quarterType === 'current' ? 'Current' : quarterType === 'future' ? 'Upcoming' : 'Historical';
        badge.className = `quarter-status-badge ${quarterType}`;
        
        // Load rates for this quarter
        this.loadRatesForQuarter(quarterLabel);
    },
    
    // Load rates for a specific quarter
    loadRatesForQuarter(quarterLabel) {
        let rates;
        
        // Check if we have stored rates for this quarter
        if (this.quarterRatesStore[quarterLabel]) {
            rates = this.quarterRatesStore[quarterLabel];
        } else {
            // Use base rates from IFTA_TAX_RATES as template
            rates = {
                quarter: quarterLabel,
                lastUpdated: null,
                effectiveDate: this.getEffectiveDateForQuarter(quarterLabel),
                exchangeRate: { ...IFTA_TAX_RATES.exchangeRate },
                jurisdictions: JSON.parse(JSON.stringify(IFTA_TAX_RATES.jurisdictions))
            };
        }
        
        // Store original for comparison
        this.originalRates = JSON.parse(JSON.stringify(rates.jurisdictions));
        
        // Update UI
        document.getElementById('currentRatesQuarter').textContent = quarterLabel;
        document.getElementById('currentRatesUpdated').textContent = rates.lastUpdated || 'Not saved';
        document.getElementById('totalJurisdictions').textContent = 
            Object.keys(rates.jurisdictions || {}).length;
        document.getElementById('exchangeRateDisplay').textContent = 
            rates.exchangeRate ? `${rates.exchangeRate.usToCanada.toFixed(4)}` : '-';
        
        // Store for table rendering
        this.currentQuarterRates = rates;
        
        // Render table
        this.renderTaxRatesTable();
    },
    
    // Get effective date for quarter label
    getEffectiveDateForQuarter(quarterLabel) {
        const match = quarterLabel.match(/Q(\d) (\d{4})/);
        if (!match) return '-';
        return this.getQuarterEffectiveDate(parseInt(match[1]), parseInt(match[2]));
    },
    
    // Render the tax rates table
    renderTaxRatesTable() {
        const tbody = document.getElementById('taxRatesTableBody');
        if (!tbody) return;
        
        // Use current quarter rates or fall back to IFTA_TAX_RATES
        const ratesData = this.currentQuarterRates || IFTA_TAX_RATES;
        const rates = ratesData.jurisdictions;
        const fuelType = this.currentFuelType;
        const effectiveDate = ratesData.effectiveDate || '-';
        
        let html = '';
        
        // Sort jurisdictions: US first, then Canada, alphabetically
        const sortedKeys = Object.keys(rates).sort((a, b) => {
            const countryA = rates[a].country;
            const countryB = rates[b].country;
            if (countryA !== countryB) {
                return countryA === 'US' ? -1 : 1;
            }
            return a.localeCompare(b);
        });
        
        sortedKeys.forEach(code => {
            const jurisdiction = rates[code];
            const rate = jurisdiction.rates?.[fuelType] || 0;
            const modifiedRate = this.modifiedRates[`${code}_${fuelType}`];
            const displayRate = modifiedRate !== undefined ? modifiedRate : rate;
            const isModified = modifiedRate !== undefined && modifiedRate !== rate;
            
            // AI Validation indicator
            const validation = jurisdiction.validation;
            let validationIndicator = '';
            let validationClass = '';
            let validationTitle = '';
            
            if (validation) {
                const conf = validation.confidence || 1;
                if (conf >= 0.85) {
                    validationIndicator = '<span class="validation-indicator high" title="High confidence"></span>';
                } else if (conf >= 0.70) {
                    validationIndicator = '<span class="validation-indicator medium" title="Medium confidence - review recommended"></span>';
                    validationClass = 'ai-warning';
                    validationTitle = validation.warnings?.join('; ') || '';
                } else {
                    validationIndicator = '<span class="validation-indicator low" title="Low confidence - manual verification needed"></span>';
                    validationClass = 'ai-error';
                    validationTitle = validation.warnings?.join('; ') || '';
                }
            }
            
            html += `
                <tr data-state="${code}">
                    <td>
                        <span class="state-code">${code}</span>
                        ${validationIndicator}
                    </td>
                    <td>
                        <span class="state-name">${jurisdiction.name}</span>
                    </td>
                    <td>
                        <span class="country-badge ${jurisdiction.country === 'US' ? 'us' : 'can'}">
                            ${jurisdiction.country === 'US' ? 'US' : 'CAN'}
                        </span>
                    </td>
                    <td>
                        <input type="number" 
                               class="rate-input ${isModified ? 'modified' : ''} ${validationClass}" 
                               id="rate_${code}_${fuelType}"
                               value="${displayRate.toFixed(4)}" 
                               step="0.0001" 
                               min="0" 
                               max="2"
                               data-code="${code}"
                               data-fuel="${fuelType}"
                               data-original="${rate.toFixed(4)}"
                               title="${validationTitle}"
                               onchange="AdminPanel.onRateChange('${code}', '${fuelType}', this.value, ${rate})">
                    </td>
                    <td>${effectiveDate}</td>
                    <td class="rate-actions">
                        ${isModified ? `
                            <button class="rate-btn reset" onclick="AdminPanel.resetRate('${code}', '${fuelType}', ${rate})">
                                Reset
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        this.updateModifiedCount();
    },
    
    // Handle rate change
    onRateChange(code, fuelType, newValue, originalValue) {
        const key = `${code}_${fuelType}`;
        const parsedValue = parseFloat(newValue);
        
        if (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 2) {
            alert('Please enter a valid rate between 0 and 2');
            this.renderTaxRatesTable();
            return;
        }
        
        // Check if it's different from original
        if (Math.abs(parsedValue - originalValue) < 0.00001) {
            // Same as original, remove from modified
            delete this.modifiedRates[key];
        } else {
            // Different, add to modified
            this.modifiedRates[key] = parsedValue;
        }
        
        this.renderTaxRatesTable();
    },
    
    // Reset a single rate
    resetRate(code, fuelType, originalValue) {
        const key = `${code}_${fuelType}`;
        delete this.modifiedRates[key];
        this.renderTaxRatesTable();
    },
    
    // Update modified count display
    updateModifiedCount() {
        const count = Object.keys(this.modifiedRates).length;
        const countEl = document.getElementById('ratesModifiedCount');
        if (countEl) {
            countEl.textContent = `${count} rate${count !== 1 ? 's' : ''} modified`;
            countEl.classList.toggle('hidden', count === 0);
        }
    },
    
    // Filter tax rates table by search
    filterTaxRatesTable(searchTerm) {
        const term = searchTerm.toLowerCase();
        const rows = document.querySelectorAll('#taxRatesTableBody tr');
        
        rows.forEach(row => {
            const state = row.dataset.state?.toLowerCase() || '';
            const name = row.querySelector('.state-name')?.textContent.toLowerCase() || '';
            const matches = state.includes(term) || name.includes(term);
            row.style.display = matches ? '' : 'none';
        });
    },
    
    // Load all quarter rates from localStorage
    loadQuarterRatesFromStorage() {
        try {
            const saved = localStorage.getItem('ifta_quarter_rates');
            if (saved) {
                this.quarterRatesStore = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Could not load quarter rates from storage');
            this.quarterRatesStore = {};
        }
    },
    
    // Save all quarter rates to localStorage
    saveQuarterRatesToStorage() {
        try {
            localStorage.setItem('ifta_quarter_rates', JSON.stringify(this.quarterRatesStore));
        } catch (e) {
            console.warn('Could not save quarter rates to storage');
        }
    },
    
    // Save the current quarter's rates
    saveQuarterRates() {
        if (!this.selectedQuarter) {
            alert('No quarter selected');
            return;
        }
        
        try {
            // Get current rates data
            const ratesData = this.currentQuarterRates || {
                quarter: this.selectedQuarter,
                jurisdictions: JSON.parse(JSON.stringify(IFTA_TAX_RATES.jurisdictions)),
                exchangeRate: { ...IFTA_TAX_RATES.exchangeRate }
            };
            
            // Apply modifications
            Object.entries(this.modifiedRates).forEach(([key, value]) => {
                const [code, fuelType] = key.split('_');
                if (ratesData.jurisdictions[code]?.rates) {
                    ratesData.jurisdictions[code].rates[fuelType] = value;
                }
            });
            
            // Update metadata
            ratesData.lastUpdated = new Date().toISOString().split('T')[0];
            ratesData.effectiveDate = this.getEffectiveDateForQuarter(this.selectedQuarter);
            
            // Store in quarter rates store
            this.quarterRatesStore[this.selectedQuarter] = ratesData;
            
            // Save to localStorage
            this.saveQuarterRatesToStorage();
            
            // Show success feedback
            document.querySelectorAll('.rate-input.modified').forEach(input => {
                input.classList.remove('modified');
                input.classList.add('saved');
                setTimeout(() => input.classList.remove('saved'), 2000);
            });
            
            // Update last save time
            const lastSaveEl = document.getElementById('lastSaveTime');
            if (lastSaveEl) {
                lastSaveEl.textContent = `Last saved: ${new Date().toLocaleTimeString()}`;
            }
            
            // Clear modified tracking
            this.modifiedRates = {};
            this.updateModifiedCount();
            
            // Update the display
            document.getElementById('currentRatesUpdated').textContent = ratesData.lastUpdated;
            
            // Update current quarter rates
            this.currentQuarterRates = ratesData;
            this.originalRates = JSON.parse(JSON.stringify(ratesData.jurisdictions));
            
            // Update quarter selector to show has-data
            this.renderQuarterSelector();
            
            // Update stored quarters list
            this.renderStoredQuarters();
            
            const modCount = Object.keys(this.modifiedRates).length;
            alert(`Successfully saved ${this.selectedQuarter} rates!`);
            
            // Log activity
            this.logActivity('tax_rate_update', `Saved rates for ${this.selectedQuarter}`);
            
        } catch (error) {
            console.error('Error saving rates:', error);
            alert('Error saving rates: ' + error.message);
        }
    },
    
    // Render stored quarters overview
    renderStoredQuarters() {
        const container = document.getElementById('storedQuartersList');
        if (!container) return;
        
        const storedQuarters = Object.keys(this.quarterRatesStore);
        
        if (storedQuarters.length === 0) {
            container.innerHTML = '<p class="empty-state">No quarters saved yet. Select a quarter above and click "Save Quarter" to store rates.</p>';
            return;
        }
        
        // Sort quarters
        storedQuarters.sort((a, b) => {
            const [qa, ya] = a.match(/Q(\d) (\d{4})/).slice(1).map(Number);
            const [qb, yb] = b.match(/Q(\d) (\d{4})/).slice(1).map(Number);
            return (yb * 10 + qb) - (ya * 10 + qa); // Newest first
        });
        
        const currentQuarter = this.getCurrentQuarterLabel();
        
        let html = '';
        storedQuarters.forEach(quarter => {
            const data = this.quarterRatesStore[quarter];
            const isCurrent = quarter === currentQuarter;
            
            html += `
                <div class="stored-quarter-item ${isCurrent ? 'current-quarter' : ''}">
                    <div class="stored-quarter-title">${quarter} ${isCurrent ? '(Current)' : ''}</div>
                    <div class="stored-quarter-meta">
                        Updated: ${data.lastUpdated || 'Unknown'}<br>
                        ${Object.keys(data.jurisdictions || {}).length} jurisdictions
                    </div>
                    <div class="stored-quarter-actions">
                        <button class="btn btn-sm" onclick="AdminPanel.selectQuarter('${quarter}')">Edit</button>
                        <button class="btn btn-sm" onclick="AdminPanel.deleteQuarter('${quarter}')" style="color: #c62828;">Delete</button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    },
    
    // Delete a quarter's stored rates
    deleteQuarter(quarterLabel) {
        if (!confirm(`Are you sure you want to delete stored rates for ${quarterLabel}?`)) {
            return;
        }
        
        delete this.quarterRatesStore[quarterLabel];
        this.saveQuarterRatesToStorage();
        
        // Refresh displays
        this.renderQuarterSelector();
        this.renderStoredQuarters();
        
        // If we deleted the currently selected quarter, reload it (will use template)
        if (this.selectedQuarter === quarterLabel) {
            this.loadRatesForQuarter(quarterLabel);
        }
        
        this.logActivity('tax_rate_delete', `Deleted rates for ${quarterLabel}`);
    },
    
    // Open copy from quarter modal
    openCopyQuarterModal() {
        const select = document.getElementById('copyFromQuarterSelect');
        if (!select) return;
        
        // Populate with stored quarters (excluding current selection)
        const storedQuarters = Object.keys(this.quarterRatesStore);
        
        if (storedQuarters.length === 0) {
            alert('No stored quarters to copy from. Save a quarter first.');
            return;
        }
        
        let html = '';
        storedQuarters.forEach(quarter => {
            if (quarter !== this.selectedQuarter) {
                html += `<option value="${quarter}">${quarter}</option>`;
            }
        });
        
        if (!html) {
            alert('No other quarters available to copy from.');
            return;
        }
        
        select.innerHTML = html;
        document.getElementById('copyQuarterModal').classList.remove('hidden');
    },
    
    // Close copy quarter modal
    closeCopyQuarterModal() {
        document.getElementById('copyQuarterModal').classList.add('hidden');
    },
    
    // Confirm copy from quarter
    confirmCopyFromQuarter() {
        const select = document.getElementById('copyFromQuarterSelect');
        const sourceQuarter = select.value;
        
        if (!sourceQuarter || !this.quarterRatesStore[sourceQuarter]) {
            alert('Please select a valid quarter');
            return;
        }
        
        if (!confirm(`Copy rates from ${sourceQuarter} to ${this.selectedQuarter}? This will overwrite current changes.`)) {
            return;
        }
        
        // Copy rates from source quarter
        const sourceData = this.quarterRatesStore[sourceQuarter];
        this.currentQuarterRates = {
            quarter: this.selectedQuarter,
            lastUpdated: null,
            effectiveDate: this.getEffectiveDateForQuarter(this.selectedQuarter),
            exchangeRate: { ...sourceData.exchangeRate },
            jurisdictions: JSON.parse(JSON.stringify(sourceData.jurisdictions))
        };
        
        // Update original for comparison
        this.originalRates = JSON.parse(JSON.stringify(this.currentQuarterRates.jurisdictions));
        this.modifiedRates = {};
        
        // Refresh table
        this.renderTaxRatesTable();
        
        // Update UI
        document.getElementById('currentRatesUpdated').textContent = 'Copied (not saved)';
        
        // Close modal
        this.closeCopyQuarterModal();
        
        alert(`Rates copied from ${sourceQuarter}. Click "Save Quarter" to save changes.`);
        
        this.logActivity('tax_rate_copy', `Copied rates from ${sourceQuarter} to ${this.selectedQuarter}`);
    },
    
    // Load activity log
    async loadActivityLog() {
        try {
            const snapshot = await db.collection('activity_logs')
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get();
            
            const container = document.getElementById('activityLogList');
            
            if (snapshot.empty) {
                container.innerHTML = '<p class="empty-state">No activity recorded</p>';
                return;
            }
            
            let html = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                const time = data.timestamp ? this.formatTime(data.timestamp.toDate()) : 'Unknown';
                const icon = this.getActivityIcon(data.action);
                
                html += `
                    <div class="activity-item">
                        <div class="activity-icon">${icon}</div>
                        <div class="activity-content">
                            <div class="activity-text">
                                <strong>${data.action}</strong>: ${data.details || ''}
                            </div>
                            <div class="activity-time">${time} • User: ${data.userId || 'Unknown'}</div>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        } catch (error) {
            console.error('Error loading activity log:', error);
        }
    },
    
    // Load error log
    async loadErrorLog() {
        try {
            const snapshot = await db.collection('error_logs')
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get();
            
            const tbody = document.getElementById('errorLogTableBody');
            
            if (snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No errors recorded</td></tr>';
                return;
            }
            
            let html = '';
            snapshot.forEach(doc => {
                const error = doc.data();
                const time = error.timestamp ? this.formatTime(error.timestamp.toDate()) : 'Unknown';
                
                html += `
                    <tr>
                        <td>${time}</td>
                        <td><span class="status-badge rejected">${error.type || 'Error'}</span></td>
                        <td>${error.message || '-'}</td>
                        <td>${error.userId || 'Anonymous'}</td>
                        <td>${error.url || '-'}</td>
                    </tr>
                `;
            });
            
            tbody.innerHTML = html;
        } catch (error) {
            console.error('Error loading error log:', error);
        }
    },
    
    // Open IFTACH tax matrix for manual rate updates
    async fetchNewTaxRates() {
        // Open IFTACH tax matrix in new tab for manual copy/paste
        window.open('https://www.iftach.org/taxmatrix4/', '_blank');
        
        const statusEl = document.getElementById('fetchStatus');
        statusEl.classList.remove('hidden', 'loading', 'error');
        statusEl.classList.add('success');
        statusEl.innerHTML = `
            IFTACH Tax Matrix opened in new tab<br>
            <small>Copy rates from the matrix and update tax-rates.js manually</small>
        `;
        
        // Hide status after 10 seconds
        setTimeout(() => {
            statusEl.classList.add('hidden');
        }, 10000);
    },
    
    // Send tax rate reminder
    async sendTaxRateReminder() {
        const quarter = document.getElementById('reminderQuarter').value;
        alert(`Reminder for ${quarter} would be sent to admin email.\n\nNote: Email functionality requires backend setup.`);
    },
    
    // Role modal functions
    openRoleModal(userId, userName, currentRole) {
        this.selectedUserId = userId;
        document.getElementById('roleModalUserName').textContent = userName || 'User';
        document.getElementById('newRoleSelect').value = currentRole;
        document.getElementById('roleModal').classList.remove('hidden');
    },
    
    closeRoleModal() {
        document.getElementById('roleModal').classList.add('hidden');
        this.selectedUserId = null;
    },
    
    async saveRoleChange() {
        if (!this.selectedUserId) return;
        
        const newRole = document.getElementById('newRoleSelect').value;
        
        try {
            // Update in localStorage
            const users = JSON.parse(localStorage.getItem('ifta_users') || '[]');
            const userIndex = users.findIndex(u => u.id === this.selectedUserId);
            
            if (userIndex !== -1) {
                users[userIndex].role = newRole;
                users[userIndex].updatedAt = new Date().toISOString();
                localStorage.setItem('ifta_users', JSON.stringify(users));
                
                // Log activity
                this.logActivity('role_change', `Changed ${users[userIndex].name || users[userIndex].email} role to ${newRole}`);
                
                this.closeRoleModal();
                this.loadUsers();
                this.loadDashboardData();
            } else {
                throw new Error('User not found');
            }
        } catch (error) {
            console.error('Error updating role:', error);
            alert('Error updating role: ' + error.message);
        }
    },
    
    // Tax approval functions
    async reviewApproval(approvalId) {
        this.selectedApprovalId = approvalId;
        
        try {
            const doc = await db.collection('tax_rate_approvals').doc(approvalId).get();
            if (doc.exists) {
                const approval = doc.data();
                
                let ratesHtml = '<table class="admin-table"><thead><tr><th>State</th><th>Rate</th></tr></thead><tbody>';
                if (approval.rates && approval.rates.states) {
                    Object.entries(approval.rates.states).forEach(([state, data]) => {
                        ratesHtml += `<tr><td>${state}</td><td>$${(data.rate || 0).toFixed(4)}</td></tr>`;
                    });
                }
                ratesHtml += '</tbody></table>';
                
                document.getElementById('taxApprovalDetails').innerHTML = `
                    <p><strong>Quarter:</strong> ${approval.quarter} ${approval.year}</p>
                    <p><strong>Submitted:</strong> ${approval.submittedAt ? this.formatTime(approval.submittedAt.toDate()) : 'Unknown'}</p>
                    <p><strong>Submitted By:</strong> ${approval.submittedBy || 'System'}</p>
                    <h3>Proposed Rates:</h3>
                    ${ratesHtml}
                `;
                
                document.getElementById('taxApprovalModal').classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error loading approval:', error);
        }
    },
    
    closeTaxApprovalModal() {
        document.getElementById('taxApprovalModal').classList.add('hidden');
        this.selectedApprovalId = null;
    },
    
    async approveTaxRates() {
        if (!this.selectedApprovalId) return;
        
        try {
            const approvalRef = db.collection('tax_rate_approvals').doc(this.selectedApprovalId);
            const approvalDoc = await approvalRef.get();
            const approvalData = approvalDoc.data();
            
            // Update approval status
            await approvalRef.update({
                status: 'approved',
                approvedBy: this.currentUser.email,
                approvedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update current tax rates
            await db.collection('tax_rates').doc('current').set({
                ...approvalData.rates,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                approvedBy: this.currentUser.email
            });
            
            // Log activity
            await db.collection('activity_logs').add({
                action: 'tax_rate_approved',
                details: `Tax rates for ${approvalData.quarter} ${approvalData.year} approved`,
                userId: this.currentUser.uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            this.closeTaxApprovalModal();
            this.loadTaxRates();
            alert('Tax rates approved and applied!');
        } catch (error) {
            console.error('Error approving tax rates:', error);
            alert('Error: ' + error.message);
        }
    },
    
    async rejectTaxRates() {
        if (!this.selectedApprovalId) return;
        
        const reason = prompt('Reason for rejection (optional):');
        
        try {
            await db.collection('tax_rate_approvals').doc(this.selectedApprovalId).update({
                status: 'rejected',
                rejectedBy: this.currentUser.email,
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                rejectionReason: reason || ''
            });
            
            this.closeTaxApprovalModal();
            this.loadTaxRates();
            alert('Tax rates rejected.');
        } catch (error) {
            console.error('Error rejecting tax rates:', error);
        }
    },
    
    async quickApprove(approvalId) {
        if (confirm('Are you sure you want to approve these tax rates?')) {
            this.selectedApprovalId = approvalId;
            await this.approveTaxRates();
        }
    },
    
    // Filter table
    filterTable(tbodyId, query) {
        const tbody = document.getElementById(tbodyId);
        const rows = tbody.querySelectorAll('tr[data-search]');
        const q = query.toLowerCase();
        
        rows.forEach(row => {
            const searchText = row.dataset.search || '';
            row.style.display = searchText.includes(q) ? '' : 'none';
        });
    },
    
    // Utility functions
    formatDate(date) {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }).format(date);
    },
    
    formatTime(date) {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    },
    
    getActivityIcon(action) {
        const icons = {
            'login': '',
            'logout': '',
            'signup': '',
            'report': '',
            'role_change': '',
            'tax_rate_approved': '',
            'tax_rate_rejected': '',
            'error': ''
        };
        return icons[action] || '';
    },
    
    getCurrentQuarter() {
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        let quarter;
        
        if (month < 3) quarter = 'Q1';
        else if (month < 6) quarter = 'Q2';
        else if (month < 9) quarter = 'Q3';
        else quarter = 'Q4';
        
        return { quarter, year };
    },
    
    // View functions (placeholders)
    viewCompany(id) {
        alert('Company details view coming soon!');
    },
    
    viewReport(id) {
        alert('Report details view coming soon!');
    },
    
    // Invite User Modal
    showInviteUserModal() {
        document.getElementById('inviteUserModal').classList.remove('hidden');
        document.getElementById('inviteEmail').focus();
        this.clearInviteStatus();
    },
    
    closeInviteUserModal() {
        document.getElementById('inviteUserModal').classList.add('hidden');
        document.getElementById('inviteUserForm').reset();
        this.clearInviteStatus();
    },
    
    clearInviteStatus() {
        const status = document.getElementById('inviteStatus');
        status.textContent = '';
        status.className = 'invite-status';
    },
    
    showInviteStatus(message, isError = false) {
        const status = document.getElementById('inviteStatus');
        status.textContent = message;
        status.className = 'invite-status ' + (isError ? 'error' : 'success');
    },
    
    async sendUserInvite(event) {
        event.preventDefault();
        
        const email = document.getElementById('inviteEmail').value.trim();
        const name = document.getElementById('inviteName').value.trim();
        const company = document.getElementById('inviteCompany').value.trim();
        const role = document.getElementById('inviteRole').value;
        const message = document.getElementById('inviteMessage').value.trim();
        
        const sendBtn = document.getElementById('sendInviteBtn');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
        this.clearInviteStatus();
        
        try {
            // Generate invite token
            const inviteToken = this.generateInviteToken();
            const inviteLink = `${window.location.origin}/?invite=${inviteToken}`;
            
            // Store invite in localStorage (in production, use database)
            this.saveInvite({
                token: inviteToken,
                email: email,
                name: name,
                company: company,
                role: role,
                invitedBy: this.currentUser.email,
                createdAt: new Date().toISOString(),
                status: 'pending'
            });
            
            // Send email via EmailJS
            await this.sendInviteEmail(email, name, inviteLink, message);
            
            this.showInviteStatus('Invite sent to ' + email);
            
            // Log activity
            this.logActivity('invite_sent', `Invited ${email} as ${role}`);
            
            // Clear form after success
            setTimeout(() => {
                this.closeInviteUserModal();
            }, 2000);
            
        } catch (error) {
            console.error('Error sending invite:', error);
            this.showInviteStatus('Failed to send invite: ' + error.message, true);
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Invite';
        }
    },
    
    generateInviteToken() {
        return 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    },
    
    saveInvite(invite) {
        const invites = JSON.parse(localStorage.getItem('ifta_invites') || '[]');
        invites.push(invite);
        localStorage.setItem('ifta_invites', JSON.stringify(invites));
    },
    
    async sendInviteEmail(toEmail, toName, inviteLink, personalMessage) {
        // Check if EmailJS is available
        if (typeof emailjs === 'undefined') {
            // Fallback: copy link to clipboard
            await navigator.clipboard.writeText(inviteLink);
            throw new Error('Email service not loaded. Invite link copied to clipboard.');
        }
        
        // Initialize EmailJS if needed
        emailjs.init('A9hDtCZZwXPLh-jny');
        
        const templateParams = {
            to_email: toEmail,
            to_name: toName || 'there',
            from_name: this.currentUser.name || 'IFTA Wizard Admin',
            invite_link: inviteLink,
            message: personalMessage ? `\n\nPersonal message: ${personalMessage}` : '',
            reply_to: this.currentUser.email
        };
        
        try {
            // Try to send using invite template
            const response = await emailjs.send(
                'service_qkuqkgx',
                'template_invite',
                templateParams
            );
            return response;
        } catch (error) {
            // If template doesn't exist, use the verification template as fallback
            console.log('Invite template not found, using fallback...');
            
            const fallbackParams = {
                to_email: toEmail,
                to_name: toName || 'there',
                from_name: 'IFTA Wizard',
                verification_code: 'INVITE',
                message: `You've been invited to join IFTA Wizard!\n\nClick here to create your account:\n${inviteLink}${personalMessage ? '\n\nMessage from admin: ' + personalMessage : ''}`
            };
            
            try {
                await emailjs.send('service_qkuqkgx', 'template_5x32df8', fallbackParams);
                return { status: 200 };
            } catch (fallbackError) {
                // Last resort: copy to clipboard
                await navigator.clipboard.writeText(inviteLink);
                throw new Error('Could not send email. Invite link copied to clipboard.');
            }
        }
    },
    
    logActivity(type, description) {
        const activities = JSON.parse(localStorage.getItem('ifta_admin_activity') || '[]');
        activities.unshift({
            type: type,
            description: description,
            user: this.currentUser.email,
            timestamp: new Date().toISOString()
        });
        // Keep only last 100 activities
        if (activities.length > 100) activities.pop();
        localStorage.setItem('ifta_admin_activity', JSON.stringify(activities));
    },
    
    // ============ ABOUT PAGE EDITOR ============
    
    // Load About page content from Firestore
    async loadAboutContent() {
        try {
            // First try Firestore
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                const doc = await firebase.firestore().collection('settings').doc('aboutPage').get();
                if (doc.exists) {
                    const data = doc.data();
                    this.populateAboutForm(data);
                    return;
                }
            }
            
            // Fallback: load default content
            this.populateAboutForm(this.getDefaultAboutContent());
        } catch (error) {
            console.error('Error loading about content:', error);
            this.populateAboutForm(this.getDefaultAboutContent());
        }
    },
    
    // Get default About page content
    getDefaultAboutContent() {
        return {
            intro: "I'm Mike — a fleet manager who spent years buried in the same headaches every trucking operation deals with: confusing IFTA paperwork, inconsistent mileage logs, missing fuel receipts, and software that promised \"automation\" but delivered clunky interfaces and half-finished features.",
            experience: "I've managed trucks, drivers, inspections, dispatch, maintenance schedules, DVIR compliance, and all the daily chaos that comes with running a fleet.",
            quote: "This is my big suck it to overcomplicated and overpriced software made by money hungry tech bros.",
            why: "So I built something different. I created IFTA Wizard because I needed a tool that actually makes sense in the real world — fast, simple, and made for people who don't have time to learn another complicated system.",
            highlight: "No training videos. No manuals. No nonsense. Completely free. Just clear results.",
            background: "Fleet manager with real-world day-to-day experience\nHands-on with safety, compliance, maintenance, inspections, and dispatch\nUnderstand the exact workflow drivers and owners deal with\nBuilt multiple internal tools to simplify fleet operations\nSpecialize in turning messy processes into clean digital workflows",
            features: "Clean, fast entry of miles and fuel data\nAccurate quarterly IFTA calculations using official tax rates\nAutomatic summaries for each jurisdiction\nExportable PDF reports you can file immediately\nWorks on desktop, tablet, or phone",
            builtFor: "Owner-Operators, Small Carriers, Fleet Managers, Anyone Who Hates Spreadsheets",
            vision1: "My goal is to build the most practical IFTA solution in the industry — created by someone who actually understands trucking, not a developer guessing what fleets need.",
            vision2: "IFTA Wizard is just the start. The long-term plan is to expand into a complete suite of lightweight tools for dispatch, safety, inspections, maintenance, and compliance.",
            visionHighlight: "Real tools for real fleets.",
            cta: "Ready to simplify your IFTA?"
        };
    },
    
    // Populate the About form fields
    populateAboutForm(data) {
        document.getElementById('aboutIntro').value = data.intro || '';
        document.getElementById('aboutExperience').value = data.experience || '';
        document.getElementById('aboutQuote').value = data.quote || '';
        document.getElementById('aboutWhy').value = data.why || '';
        document.getElementById('aboutHighlight').value = data.highlight || '';
        document.getElementById('aboutBackground').value = data.background || '';
        document.getElementById('aboutFeatures').value = data.features || '';
        document.getElementById('aboutBuiltFor').value = data.builtFor || '';
        document.getElementById('aboutVision1').value = data.vision1 || '';
        document.getElementById('aboutVision2').value = data.vision2 || '';
        document.getElementById('aboutVisionHighlight').value = data.visionHighlight || '';
        document.getElementById('aboutCta').value = data.cta || '';
    },
    
    // Save About page content to Firestore
    async saveAboutPage() {
        const saveBtn = document.getElementById('saveAboutBtn');
        const originalText = saveBtn.textContent;
        
        try {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
            const data = {
                intro: document.getElementById('aboutIntro').value.trim(),
                experience: document.getElementById('aboutExperience').value.trim(),
                quote: document.getElementById('aboutQuote').value.trim(),
                why: document.getElementById('aboutWhy').value.trim(),
                highlight: document.getElementById('aboutHighlight').value.trim(),
                background: document.getElementById('aboutBackground').value.trim(),
                features: document.getElementById('aboutFeatures').value.trim(),
                builtFor: document.getElementById('aboutBuiltFor').value.trim(),
                vision1: document.getElementById('aboutVision1').value.trim(),
                vision2: document.getElementById('aboutVision2').value.trim(),
                visionHighlight: document.getElementById('aboutVisionHighlight').value.trim(),
                cta: document.getElementById('aboutCta').value.trim(),
                updatedAt: new Date().toISOString(),
                updatedBy: this.currentUser?.email || 'admin'
            };
            
            // Save to Firestore
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                await firebase.firestore().collection('settings').doc('aboutPage').set(data);
                this.showToast('About page saved successfully!', 'success');
                this.logActivity('about_update', 'Updated About page content');
            } else {
                // Fallback to localStorage
                localStorage.setItem('ifta_about_content', JSON.stringify(data));
                this.showToast('About page saved locally', 'success');
            }
        } catch (error) {
            console.error('Error saving about page:', error);
            this.showToast('Error saving about page', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    },
    
    // Show toast notification
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `admin-toast ${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 10px 16px;
            background: ${type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#4f46e5'};
            color: white;
            border-radius: 4px;
            font-size: 12px;
            z-index: 9999;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    AdminPanel.init();
});
