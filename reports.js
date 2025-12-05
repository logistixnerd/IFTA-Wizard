// IFTA Wizard - Reports Management & Sharing Module
'use strict';

const IFTAReports = {
    // Storage keys
    STORAGE_KEYS: {
        reports: 'ifta_saved_reports',
        preferences: 'ifta_preferences',
        driveToken: 'ifta_drive_token'
    },
    
    // Google API config
    GOOGLE_CONFIG: {
        clientId: '1005752295612-5ib4pggv00hgrnoiho50fvguln8a75sn.apps.googleusercontent.com',
        apiKey: 'AIzaSyAmMfBcWSGN9w3rLC4vRobWqAG6ahyfEQM',
        scopes: 'https://www.googleapis.com/auth/drive.file'
    },
    
    driveConnected: false,
    driveUser: null,
    driveEnabled: false,  // Will be true only if credentials are configured
    
    // Initialize
    init() {
        // Check if Google Drive is properly configured
        this.driveEnabled = this.GOOGLE_CONFIG.clientId !== 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com' &&
                           this.GOOGLE_CONFIG.apiKey !== 'YOUR_GOOGLE_API_KEY';
        
        // Hide Google Drive button if not configured
        const driveBtn = document.getElementById('saveToDrive');
        if (driveBtn && !this.driveEnabled) {
            driveBtn.style.display = 'none';
        }
        
        this.setupEventListeners();
        this.loadPreferences();
        this.updateReportsCount();
        
        if (this.driveEnabled) {
            this.initGoogleDrive();
            this.checkDriveConnection();
        }
    },
    
    // Setup event listeners
    setupEventListeners() {
        // Profile dropdown - use event delegation for reliability
        const profileBtn = document.getElementById('profileBtn');
        const dropdown = document.getElementById('profileDropdown');
        
        if (profileBtn && dropdown) {
            // Remove any existing handlers
            profileBtn.onclick = null;
            
            // Add click handler
            profileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const isOpen = dropdown.classList.contains('open');
                dropdown.classList.toggle('open');
                profileBtn.setAttribute('aria-expanded', !isOpen);
                
                if (!isOpen) {
                    this.updateProfileMenuInfo();
                }
            });
            
            // Close profile menu on outside click - but not when clicking inside
            document.addEventListener('click', (e) => {
                const profileBtn = document.getElementById('profileBtn');
                if (dropdown.classList.contains('open') && 
                    !dropdown.contains(e.target) && 
                    e.target !== profileBtn) {
                    dropdown.classList.remove('open');
                    profileBtn?.setAttribute('aria-expanded', 'false');
                }
            });
        }
        
        // Profile menu items
        document.getElementById('menuSavedReports')?.addEventListener('click', () => this.openSavedReportsModal());
        document.getElementById('menuProfile')?.addEventListener('click', () => this.openProfileModal());
        document.getElementById('menuPreferences')?.addEventListener('click', () => this.openPreferencesModal());
        document.getElementById('menuLogout')?.addEventListener('click', () => this.logout());
        
        // Export buttons
        document.getElementById('sendEmail')?.addEventListener('click', () => this.openEmailModal());
        document.getElementById('saveToDrive')?.addEventListener('click', () => this.openDriveModal());
        document.getElementById('saveReport')?.addEventListener('click', () => this.openSaveReportModal());
        
        // Modal close buttons
        document.getElementById('closeReportsModal')?.addEventListener('click', () => this.closeModal('savedReportsModal'));
        document.getElementById('closeEmailModal')?.addEventListener('click', () => this.closeModal('emailModal'));
        document.getElementById('closeDriveModal')?.addEventListener('click', () => this.closeModal('driveModal'));
        document.getElementById('closeProfileModal')?.addEventListener('click', () => this.closeModal('profileModal'));
        document.getElementById('closePreferencesModal')?.addEventListener('click', () => this.closeModal('preferencesModal'));
        document.getElementById('closeSaveReportModal')?.addEventListener('click', () => this.closeModal('saveReportModal'));
        
        // Cancel buttons
        document.getElementById('cancelEmail')?.addEventListener('click', () => this.closeModal('emailModal'));
        document.getElementById('cancelProfile')?.addEventListener('click', () => this.closeModal('profileModal'));
        document.getElementById('cancelPreferences')?.addEventListener('click', () => this.closeModal('preferencesModal'));
        document.getElementById('cancelSaveReport')?.addEventListener('click', () => this.closeModal('saveReportModal'));
        
        // Form submissions
        document.getElementById('emailForm')?.addEventListener('submit', (e) => this.handleEmailSubmit(e));
        document.getElementById('profileForm')?.addEventListener('submit', (e) => this.handleProfileSubmit(e));
        document.getElementById('saveReportForm')?.addEventListener('submit', (e) => this.handleSaveReport(e));
        document.getElementById('savePreferences')?.addEventListener('click', () => this.savePreferences());
        
        // Drive buttons
        document.getElementById('connectDrive')?.addEventListener('click', () => this.connectGoogleDrive());
        document.getElementById('disconnectDrive')?.addEventListener('click', () => this.disconnectGoogleDrive());
        document.getElementById('saveToDriveBtn')?.addEventListener('click', () => this.saveToDrive());
        
        // Report management buttons
        document.getElementById('exportSelectedReports')?.addEventListener('click', () => this.exportSelectedReports());
        document.getElementById('deleteSelectedReports')?.addEventListener('click', () => this.deleteSelectedReports());
        document.getElementById('reportsSearch')?.addEventListener('input', (e) => this.filterReports(e.target.value));
        
        // Close modals on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
        
        // Close modals on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
    },
    
    // Toggle profile menu
    toggleProfileMenu() {
        const dropdown = document.getElementById('profileDropdown');
        console.log('toggleProfileMenu called, dropdown:', dropdown);
        if (dropdown) {
            dropdown.classList.toggle('open');
            console.log('Dropdown classes:', dropdown.className);
            this.updateProfileMenuInfo();
        }
    },
    
    // Update profile menu info
    updateProfileMenuInfo() {
        if (!IFTAAuth.user) return;
        
        const userName = document.getElementById('menuUserName');
        const userEmail = document.getElementById('menuUserEmail');
        const profileAvatar = document.getElementById('profileAvatar');
        const profileName = document.getElementById('profileName');
        
        if (userName) userName.textContent = IFTAAuth.user.name || 'User';
        if (userEmail) userEmail.textContent = IFTAAuth.user.email || '';
        if (profileAvatar) profileAvatar.textContent = (IFTAAuth.user.name || 'U').charAt(0).toUpperCase();
        if (profileName) profileName.textContent = (IFTAAuth.user.name || 'Account').split(' ')[0];
    },
    
    // Open modal helper
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
        }
    },
    
    // Close modal helper
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
        // Also close profile menu
        document.getElementById('profileDropdown')?.classList.remove('open');
    },
    
    // Close all modals
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    },
    
    // ============ SAVED REPORTS ============
    
    // Get saved reports (from localStorage, with Firebase sync)
    getSavedReports() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEYS.reports) || '[]');
        } catch (e) {
            return [];
        }
    },
    
    // Sync reports from Firebase (call on init/login)
    async syncReportsFromFirebase() {
        if (typeof db === 'undefined' || !IFTAAuth?.user?.uid) return;
        
        // Show syncing indicator
        const reportsCount = document.getElementById('reportsCount');
        if (reportsCount) {
            reportsCount.innerHTML = '<span class="sync-spinner">↻</span>';
            reportsCount.title = 'Syncing reports...';
        }
        
        try {
            // Try to get reports without ordering first (in case index doesn't exist)
            let snapshot;
            try {
                snapshot = await db.collection('users')
                    .doc(IFTAAuth.user.uid)
                    .collection('reports')
                    .orderBy('createdAt', 'desc')
                    .get();
            } catch (indexError) {
                // Fallback: get without ordering if index is missing
                console.warn('Reports index missing, fetching without order:', indexError.message);
                snapshot = await db.collection('users')
                    .doc(IFTAAuth.user.uid)
                    .collection('reports')
                    .get();
            }
            
            if (snapshot.empty) {
                this.updateReportsCount();
                return;
            }
            
            const firebaseReports = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Merge with local reports (Firebase takes precedence)
            const localReports = this.getSavedReports();
            const mergedReports = [...firebaseReports];
            
            // Add local reports that aren't in Firebase
            localReports.forEach(local => {
                if (!mergedReports.find(r => r.id === local.id)) {
                    mergedReports.push(local);
                    // Also save this local report to Firebase
                    this.saveReportToFirebase(local);
                }
            });
            
            // Sort by date
            mergedReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            // Update local storage
            localStorage.setItem(this.STORAGE_KEYS.reports, JSON.stringify(mergedReports));
            this.updateReportsCount();
        } catch (error) {
            console.error('Error syncing reports from Firebase:', error);
        }
    },
    
    // Save report to Firebase
    async saveReportToFirebase(reportData) {
        if (typeof db === 'undefined' || !IFTAAuth?.user?.uid) return null;
        
        try {
            const reportRef = db.collection('users')
                .doc(IFTAAuth.user.uid)
                .collection('reports')
                .doc(reportData.id);
            
            await reportRef.set({
                name: reportData.name,
                notes: reportData.notes || '',
                quarter: reportData.quarter,
                createdAt: reportData.createdAt || new Date().toISOString(),
                data: reportData.data,
                summary: reportData.summary,
                options: reportData.options || {},
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            return reportData.id;
        } catch (error) {
            console.error('Error saving report to Firebase:', error);
            return null;
        }
    },
    
    // Delete report from Firebase
    async deleteReportFromFirebase(reportId) {
        if (typeof db === 'undefined' || !IFTAAuth?.user?.uid) return;
        
        try {
            await db.collection('users')
                .doc(IFTAAuth.user.uid)
                .collection('reports')
                .doc(reportId)
                .delete();
        } catch (error) {
            console.error('Error deleting report from Firebase:', error);
        }
    },
    
    // Save report (to both localStorage and Firebase)
    async saveReport(reportData) {
        const reports = this.getSavedReports();
        const newReport = {
            id: 'report_' + Date.now(),
            name: reportData.name,
            notes: reportData.notes || '',
            quarter: reportData.quarter,
            options: reportData.options || {},
            createdAt: new Date().toISOString(),
            data: reportData.data,
            summary: reportData.summary
        };
        
        reports.unshift(newReport);
        localStorage.setItem(this.STORAGE_KEYS.reports, JSON.stringify(reports));
        this.updateReportsCount();
        
        // Also save to Firebase
        await this.saveReportToFirebase(newReport);
        
        return newReport;
    },
    
    // Delete report (from both localStorage and Firebase)
    async deleteReport(reportId) {
        let reports = this.getSavedReports();
        reports = reports.filter(r => r.id !== reportId);
        localStorage.setItem(this.STORAGE_KEYS.reports, JSON.stringify(reports));
        this.updateReportsCount();
        
        // Also delete from Firebase
        await this.deleteReportFromFirebase(reportId);
    },
    
    // Update reports count badge
    updateReportsCount() {
        const count = this.getSavedReports().length;
        const badge = document.getElementById('reportsCount');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
    },
    
    // Open saved reports modal
    openSavedReportsModal() {
        this.closeModal('profileDropdown');
        this.renderReportsList();
        this.openModal('savedReportsModal');
    },
    
    // Render reports list
    renderReportsList(filter = '') {
        const container = document.getElementById('reportsList');
        if (!container) return;
        
        let reports = this.getSavedReports();
        
        // Apply filter
        if (filter) {
            const lowerFilter = filter.toLowerCase();
            reports = reports.filter(r => 
                r.name.toLowerCase().includes(lowerFilter) ||
                r.quarter.toLowerCase().includes(lowerFilter)
            );
        }
        
        if (reports.length === 0) {
            container.innerHTML = `
                <div class="reports-empty">
                    <p>${filter ? 'No matching reports' : 'No saved reports yet'}</p>
                    <small>${filter ? 'Try a different search' : 'Save your first report to see it here'}</small>
                </div>
            `;
            return;
        }
        
        container.innerHTML = reports.map(report => `
            <div class="report-item" data-report-id="${report.id}">
                <input type="checkbox" class="report-checkbox">
                <div class="report-item-info">
                    <div class="report-item-name">${this.escapeHtml(report.name)}</div>
                    <div class="report-item-meta">
                        <span>${report.quarter}</span>
                        <span>${this.formatDate(report.createdAt)}</span>
                        <span>${report.summary?.jurisdictions || 0} jurisdictions</span>
                        <span>${report.summary?.totalTax || '$0.00'}</span>
                    </div>
                </div>
                <div class="report-item-actions">
                    <button class="btn btn-secondary" onclick="IFTAReports.loadReport('${report.id}')">Load</button>
                    <button class="btn btn-primary" onclick="IFTAReports.downloadReportPdf('${report.id}')">PDF</button>
                    <button class="btn btn-danger" onclick="IFTAReports.confirmDeleteReport('${report.id}')">×</button>
                </div>
            </div>
        `).join('');
    },
    
    // Filter reports
    filterReports(query) {
        this.renderReportsList(query);
    },
    
    // Load report into calculator
    loadReport(reportId) {
        const reports = this.getSavedReports();
        const report = reports.find(r => r.id === reportId);
        
        if (!report) {
            showToast('Report not found', 'error');
            return;
        }
        
        // Load the data into appState
        if (report.data && typeof loadReportData === 'function') {
            loadReportData(report.data);
            showToast(`Loaded: ${report.name}`, 'success');
            this.closeModal('savedReportsModal');
        } else if (report.data) {
            // Fallback: manually set app state
            if (typeof appState !== 'undefined') {
                appState.rows = report.data.rows || [];
                appState.selectedQuarter = report.data.quarter || 'Q4 2025';
                appState.selectedFuelType = report.data.fuelType || 'diesel';
                appState.fleetMpg = report.data.mpg || 6.5;
                
                // Refresh UI
                if (typeof recalculateAll === 'function') {
                    recalculateAll();
                }
                showToast(`Loaded: ${report.name}`, 'success');
                this.closeModal('savedReportsModal');
            }
        }
    },
    
    // Download report as PDF
    downloadReportPdf(reportId) {
        const reports = this.getSavedReports();
        const report = reports.find(r => r.id === reportId);
        
        if (!report) {
            showToast('Report not found', 'error');
            return;
        }
        
        // Generate PDF from saved data
        this.generatePdfFromReport(report);
    },
    
    // Generate PDF from saved report data
    generatePdfFromReport(report) {
        if (typeof window.jspdf === 'undefined') {
            showToast('PDF library not loaded', 'error');
            return;
        }
        
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            const primaryColor = [91, 155, 213];
            
            // Title
            doc.setFontSize(22);
            doc.setTextColor(...primaryColor);
            doc.text('IFTA Fuel Tax Report', 14, 22);
            
            doc.setDrawColor(...primaryColor);
            doc.setLineWidth(0.5);
            doc.line(14, 26, 196, 26);
            
            // Report Info
            doc.setFontSize(10);
            doc.setTextColor(80, 80, 80);
            
            doc.setFont(undefined, 'bold');
            doc.text('Report:', 14, 35);
            doc.text('Quarter:', 14, 41);
            doc.text('Created:', 14, 47);
            
            doc.setFont(undefined, 'normal');
            doc.text(report.name, 50, 35);
            doc.text(report.quarter, 50, 41);
            doc.text(this.formatDate(report.createdAt), 50, 47);
            
            if (report.notes) {
                doc.text('Notes: ' + report.notes, 14, 55);
            }
            
            // Table data
            const tableData = (report.data?.rows || []).filter(r => r.jurisdiction).map(row => [
                row.jurisdiction,
                this.formatNumber(row.totalMiles),
                this.formatNumber(row.taxableMiles),
                this.formatGallons(row.taxPaidGallons),
                this.formatRate(row.taxRate),
                this.formatGallons(row.taxableGallons),
                this.formatGallons(row.netTaxableGallons),
                this.formatCurrency(this.getDisplayTaxDue(row.taxDue, row.jurisdiction))
            ]);
            
            // Add totals
            if (report.summary) {
                tableData.push([
                    'TOTALS',
                    this.formatNumber(report.summary.totalMiles || 0),
                    this.formatNumber(report.summary.taxableMiles || 0),
                    this.formatGallons(report.summary.gallons || 0),
                    '—',
                    this.formatGallons(report.summary.taxableGallons || 0),
                    this.formatGallons(report.summary.netGallons || 0),
                    report.summary.totalTax || '$0.00'
                ]);
            }
            
            doc.autoTable({
                startY: report.notes ? 62 : 55,
                head: [['Jurisdiction', 'Total Miles', 'Taxable Miles', 'Tax Paid Gal', 'Rate', 'Taxable Gal', 'Net Taxable', 'Tax Due']],
                body: tableData,
                theme: 'striped',
                headStyles: {
                    fillColor: primaryColor,
                    textColor: 255,
                    fontStyle: 'bold',
                    fontSize: 8
                },
                bodyStyles: { fontSize: 7 },
                didParseCell: function(data) {
                    if (data.row.index === tableData.length - 1) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [232, 245, 233];
                    }
                }
            });
            
            // Footer
            const finalY = doc.lastAutoTable.finalY + 15;
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);
            doc.text('Generated by IFTA Wizard', 14, finalY);
            
            const filename = `${report.name.replace(/[^a-z0-9]/gi, '-')}.pdf`;
            doc.save(filename);
            
            showToast('PDF downloaded!', 'success');
        } catch (error) {
            console.error('PDF generation error:', error);
            showToast('Error generating PDF', 'error');
        }
    },
    
    // Confirm delete report
    confirmDeleteReport(reportId) {
        if (confirm('Are you sure you want to delete this report?')) {
            this.deleteReport(reportId);
            this.renderReportsList();
            showToast('Report deleted', 'success');
        }
    },
    
    // Delete selected reports
    deleteSelectedReports() {
        const checkboxes = document.querySelectorAll('#reportsList .report-checkbox:checked');
        if (checkboxes.length === 0) {
            showToast('No reports selected', 'warning');
            return;
        }
        
        if (!confirm(`Delete ${checkboxes.length} selected report(s)?`)) return;
        
        checkboxes.forEach(cb => {
            const reportItem = cb.closest('.report-item');
            if (reportItem) {
                const reportId = reportItem.dataset.reportId;
                this.deleteReport(reportId);
            }
        });
        
        this.renderReportsList();
        showToast(`${checkboxes.length} reports deleted`, 'success');
    },
    
    // Export selected reports
    exportSelectedReports() {
        const checkboxes = document.querySelectorAll('#reportsList .report-checkbox:checked');
        if (checkboxes.length === 0) {
            showToast('No reports selected', 'warning');
            return;
        }
        
        const reports = this.getSavedReports();
        checkboxes.forEach(cb => {
            const reportItem = cb.closest('.report-item');
            if (reportItem) {
                const reportId = reportItem.dataset.reportId;
                const report = reports.find(r => r.id === reportId);
                if (report) {
                    this.generatePdfFromReport(report);
                }
            }
        });
        
        showToast(`Exporting ${checkboxes.length} report(s)...`, 'info');
    },
    
    // Open save report modal
    openSaveReportModal() {
        // Pre-fill with current data
        const quarterDisplay = typeof formatQuarterDisplay === 'function' 
            ? formatQuarterDisplay(appState?.selectedQuarter || 'Q4 2025')
            : (appState?.selectedQuarter || 'Q4 2025');
        
        const dataRows = (appState?.rows || []).filter(r => r.jurisdiction);
        const totalTax = dataRows.reduce((sum, r) => sum + this.getDisplayTaxDue(r.taxDue || 0, r.jurisdiction), 0);
        
        document.getElementById('reportName').value = `${quarterDisplay} Report`;
        document.getElementById('reportNotes').value = '';
        document.getElementById('previewQuarter').textContent = quarterDisplay;
        document.getElementById('previewJurisdictions').textContent = dataRows.length;
        document.getElementById('previewTax').textContent = this.formatCurrency(totalTax);
        
        // Reset checkboxes to defaults
        document.getElementById('includeFleetMpg').checked = true;
        document.getElementById('includeCurrentMpg').checked = true;
        document.getElementById('includeUnitNumber').checked = true;
        document.getElementById('includeTaxRates').checked = false;
        document.getElementById('includeSummary').checked = true;
        
        this.openModal('saveReportModal');
    },
    
    // Handle save report form
    async handleSaveReport(e) {
        e.preventDefault();
        
        const name = document.getElementById('reportName')?.value?.trim();
        const notes = document.getElementById('reportNotes')?.value?.trim();
        
        if (!name) {
            showToast('Please enter a report name', 'error');
            return;
        }
        
        // Show loading state
        const saveBtn = document.querySelector('#saveReportForm button[type="submit"]');
        const originalText = saveBtn?.textContent;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner"></span> Saving...';
        }
        
        try {
            // Get report options
            const options = {
                includeFleetMpg: document.getElementById('includeFleetMpg')?.checked ?? true,
                includeCurrentMpg: document.getElementById('includeCurrentMpg')?.checked ?? true,
                includeUnitNumber: document.getElementById('includeUnitNumber')?.checked ?? true,
                includeTaxRates: document.getElementById('includeTaxRates')?.checked ?? false,
                includeSummary: document.getElementById('includeSummary')?.checked ?? true
            };
            
            const dataRows = (appState?.rows || []).filter(r => r.jurisdiction);
            const totalTax = dataRows.reduce((sum, r) => sum + this.getDisplayTaxDue(r.taxDue || 0, r.jurisdiction), 0);
            const totalMiles = dataRows.reduce((sum, r) => sum + (r.totalMiles || 0), 0);
            const taxableMiles = dataRows.reduce((sum, r) => sum + (r.taxableMiles || 0), 0);
            const gallons = dataRows.reduce((sum, r) => sum + (r.taxPaidGallons || 0), 0);
            const taxableGallons = dataRows.reduce((sum, r) => sum + (r.taxableGallons || 0), 0);
            const netGallons = dataRows.reduce((sum, r) => sum + (r.netTaxableGallons || 0), 0);
            
            const reportData = {
                name: name,
                notes: notes,
                quarter: appState?.selectedQuarter || 'Q4 2025',
                options: options,
                data: {
                    rows: dataRows,
                    quarter: appState?.selectedQuarter,
                    fuelType: appState?.selectedFuelType,
                    fleetMpg: appState?.fleetMpg,
                    currentMpg: appState?.currentMpg,
                    unitNumber: appState?.unitNumber || '',
                    baseJurisdiction: appState?.baseJurisdiction
                },
                summary: {
                    jurisdictions: dataRows.length,
                    totalMiles: totalMiles,
                    taxableMiles: taxableMiles,
                    gallons: gallons,
                    taxableGallons: taxableGallons,
                    netGallons: netGallons,
                    totalTax: this.formatCurrency(totalTax)
                }
            };
            
            await this.saveReport(reportData);
            this.closeModal('saveReportModal');
            showToast(`Report "${name}" saved!`, 'success');
        } catch (error) {
            console.error('Error saving report:', error);
            showToast('Error saving report', 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = originalText || 'Save Report';
            }
        }
    },
    
    // ============ EMAIL ============
    
    // Open email modal
    openEmailModal() {
        // Pre-fill subject
        const quarter = appState?.selectedQuarter || 'Q4 2025';
        document.getElementById('emailSubject').value = `IFTA Report - ${quarter}`;
        
        // Pre-fill user email if available
        if (IFTAAuth.user?.email) {
            document.getElementById('emailTo').value = '';
        }
        
        // Populate saved reports for attachment
        this.populateSavedReportsForAttach();
        
        this.openModal('emailModal');
    },
    
    // Populate saved reports for email attachment
    populateSavedReportsForAttach() {
        const container = document.getElementById('savedReportsAttach');
        if (!container) return;
        
        const reports = this.getSavedReports();
        
        if (reports.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = reports.slice(0, 5).map(report => `
            <label class="checkbox-label">
                <input type="checkbox" class="attach-report" data-report-id="${report.id}">
                <span>${this.escapeHtml(report.name)} (${report.quarter})</span>
            </label>
        `).join('');
    },
    
    // Handle email submit
    async handleEmailSubmit(e) {
        e.preventDefault();
        
        const to = document.getElementById('emailTo')?.value?.trim();
        const cc = document.getElementById('emailCc')?.value?.trim();
        const subject = document.getElementById('emailSubject')?.value?.trim();
        const message = document.getElementById('emailMessage')?.value?.trim();
        const attachCurrent = document.getElementById('attachCurrent')?.checked;
        
        if (!to) {
            showToast('Please enter recipient email', 'error');
            return;
        }
        
        // Get selected saved reports
        const selectedReports = [];
        document.querySelectorAll('.attach-report:checked').forEach(cb => {
            selectedReports.push(cb.dataset.reportId);
        });
        
        await this.sendEmailWithAttachments({
            to, cc, subject, message,
            attachCurrent,
            savedReportIds: selectedReports
        });
    },
    
    // EmailJS configuration
    EMAILJS_CONFIG: {
        serviceId: 'service_qkuqkgx',
        templateId: 'template_5x32df8',
        publicKey: 'A9hDtCZZwXPLh-jny'
    },
    
    // Send email via EmailJS
    async sendEmailWithAttachments(emailData) {
        // Show loading state
        const sendBtn = document.querySelector('#emailModal .btn-primary');
        const originalText = sendBtn?.textContent;
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span class="spinner"></span> Sending...';
        }
        
        try {
            // Generate attachment list
            const attachments = [];
            if (emailData.attachCurrent) {
                attachments.push('Current Report');
            }
            const reports = this.getSavedReports();
            emailData.savedReportIds.forEach(id => {
                const report = reports.find(r => r.id === id);
                if (report) attachments.push(report.name);
            });
            
            // Check if EmailJS is available
            if (typeof emailjs !== 'undefined') {
                console.log('EmailJS available, initializing...');
                // Initialize EmailJS
                emailjs.init(this.EMAILJS_CONFIG.publicKey);
                
                // Build the email content
                let emailContent = emailData.message || '';
                if (attachments.length > 0) {
                    emailContent += '\n\n📎 Reports Included:\n• ' + attachments.join('\n• ');
                    emailContent += '\n\n(PDFs will be downloaded for you to attach)';
                }
                
                // Use the template format that matches the existing verification template
                const templateParams = {
                    to_email: emailData.to,
                    to_name: emailData.to.split('@')[0], // Use email prefix as name
                    from_name: IFTAAuth?.user?.name || 'IFTA Wizard User',
                    verification_code: 'IFTA REPORT', // This shows in subject/header area
                    message: `Subject: ${emailData.subject}\n\n${emailContent}`,
                    reply_to: IFTAAuth?.user?.email || emailData.to
                };
                
                console.log('Sending email with params:', templateParams);
                console.log('Using service:', this.EMAILJS_CONFIG.serviceId);
                console.log('Using template:', this.EMAILJS_CONFIG.templateId);
                
                const result = await emailjs.send(
                    this.EMAILJS_CONFIG.serviceId,
                    this.EMAILJS_CONFIG.templateId,
                    templateParams
                );
                
                console.log('EmailJS result:', result);
                
                this.closeModal('emailModal');
                showToast('Email sent successfully!', 'success');
                
                // Download PDFs for the user to attach if needed
                if (emailData.attachCurrent && typeof exportToPdf === 'function') {
                    setTimeout(() => exportToPdf(), 500);
                }
                emailData.savedReportIds.forEach((id, index) => {
                    const report = reports.find(r => r.id === id);
                    if (report) {
                        setTimeout(() => this.generatePdfFromReport(report), 1000 + (index * 500));
                    }
                });
                
            } else {
                // Fallback to mailto
                let body = emailData.message || '';
                if (attachments.length > 0) {
                    body += '\n\n---\nAttachments: ' + attachments.join(', ');
                }
                const mailtoLink = `mailto:${emailData.to}?subject=${encodeURIComponent(emailData.subject)}&body=${encodeURIComponent(body)}`;
                window.open(mailtoLink, '_blank');
                
                this.closeModal('emailModal');
                showToast('Opening email client...', 'info');
            }
        } catch (error) {
            console.error('Email error:', error);
            showToast('Failed to send email. Please try again.', 'error');
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.textContent = originalText || 'Send Email';
            }
        }
    },
    
    // ============ GOOGLE DRIVE ============
    
    // Check if Drive is connected
    checkDriveConnection() {
        const token = localStorage.getItem(this.STORAGE_KEYS.driveToken);
        if (token) {
            try {
                const data = JSON.parse(token);
                // Check for new format (expires_at) or old format (expiry)
                const expiresAt = data.expires_at || (data.expiry ? new Date(data.expiry).getTime() : 0);
                if (expiresAt > Date.now()) {
                    this.driveConnected = true;
                    this.driveUser = data.email || 'Connected';
                    return;
                }
            } catch (e) {}
        }
        this.driveConnected = false;
        this.driveUser = null;
    },
    
    // Open Drive modal
    openDriveModal() {
        this.checkDriveConnection();
        
        const notConnected = document.getElementById('driveNotConnected');
        const connected = document.getElementById('driveConnected');
        
        if (this.driveConnected) {
            notConnected?.classList.add('hidden');
            connected?.classList.remove('hidden');
            document.getElementById('driveUserEmail').textContent = this.driveUser || 'Connected';
            this.populateDriveSavedReports();
        } else {
            notConnected?.classList.remove('hidden');
            connected?.classList.add('hidden');
        }
        
        this.openModal('driveModal');
    },
    
    // Google token client for OAuth
    tokenClient: null,
    
    // Initialize Google Drive API
    initGoogleDrive() {
        if (!this.driveEnabled) return;
        
        // Wait for Google Identity Services to load - non-blocking
        this.waitForGoogleLibraries().then(() => {
            this.loadGapiClient().catch(err => {
                console.warn('Google Drive client initialization failed (non-critical):', err);
            });
        }).catch(err => {
            console.warn('Google libraries not available (non-critical):', err);
            // This is non-critical - the rest of the app should still work
        });
    },
    
    // Wait for Google libraries to load
    waitForGoogleLibraries() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max
            
            const check = () => {
                attempts++;
                if (typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts) {
                    resolve();
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Google libraries failed to load'));
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    },
    
    // Load GAPI client
    async loadGapiClient() {
        try {
            // Load the gapi client
            await new Promise((resolve, reject) => {
                gapi.load('client', { callback: resolve, onerror: reject });
            });
            
            // Initialize with API key
            await gapi.client.init({
                apiKey: this.GOOGLE_CONFIG.apiKey,
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
            });
            
            console.log('Google Drive API client initialized');
            
            // Initialize token client for OAuth - wrap in try-catch for origin errors
            try {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.GOOGLE_CONFIG.clientId,
                    scope: this.GOOGLE_CONFIG.scopes,
                    callback: (response) => this.handleDriveAuthCallback(response)
                });
                console.log('Google OAuth token client ready');
            } catch (oauthError) {
                console.warn('OAuth token client failed (origin may not be authorized):', oauthError);
                this.driveEnabled = false;
                const driveBtn = document.getElementById('saveToDrive');
                if (driveBtn) driveBtn.style.display = 'none';
            }
            
        } catch (error) {
            console.warn('Error initializing Google Drive (non-critical):', error);
            this.driveEnabled = false;
        }
    },
    
    // Handle Drive auth callback
    handleDriveAuthCallback(response) {
        if (response.error) {
            console.error('Drive auth error:', response.error, response);
            let errorMsg = 'Failed to connect Google Drive';
            if (response.error === 'popup_blocked_by_browser') {
                errorMsg = 'Please allow popups for this site to connect Google Drive';
            } else if (response.error === 'access_denied') {
                errorMsg = 'Access denied. Please grant permission to use Google Drive';
            } else if (response.error === 'invalid_client') {
                errorMsg = 'Google Drive configuration error. Please contact support.';
            }
            showToast(errorMsg, 'error');
            return;
        }
        
        // Store the access token temporarily
        const tokenData = {
            access_token: response.access_token,
            expires_at: Date.now() + (response.expires_in * 1000)
        };
        localStorage.setItem(this.STORAGE_KEYS.driveToken, JSON.stringify(tokenData));
        
        this.driveConnected = true;
        
        // Get user info and update token with email
        this.getDriveUserInfo().then(() => {
            // Update token with user email for persistence
            tokenData.email = this.driveUser;
            localStorage.setItem(this.STORAGE_KEYS.driveToken, JSON.stringify(tokenData));
            
            document.getElementById('driveNotConnected')?.classList.add('hidden');
            document.getElementById('driveConnected')?.classList.remove('hidden');
            document.getElementById('driveUserEmail').textContent = this.driveUser || 'Connected';
            this.populateDriveSavedReports();
            showToast('Google Drive connected!', 'success');
        });
    },
    
    // Get Drive user info
    async getDriveUserInfo() {
        try {
            const response = await gapi.client.drive.about.get({
                fields: 'user'
            });
            this.driveUser = response.result.user.emailAddress;
            console.log('Drive user:', this.driveUser);
        } catch (error) {
            console.error('Error getting Drive user info:', error);
            this.driveUser = 'Connected';
        }
    },
    
    // Connect Google Drive
    async connectGoogleDrive() {
        if (!this.driveEnabled) {
            showToast('Google Drive is not configured', 'error');
            return;
        }
        
        // Show loading
        const connectBtn = document.getElementById('connectDrive');
        const originalText = connectBtn?.textContent;
        if (connectBtn) {
            connectBtn.disabled = true;
            connectBtn.innerHTML = '<span class="spinner"></span> Connecting...';
        }
        
        try {
            console.log('Starting Google Drive connection...');
            console.log('gapi available:', typeof gapi !== 'undefined');
            console.log('google.accounts available:', typeof google !== 'undefined' && google.accounts);
            
            if (!this.tokenClient) {
                console.log('Token client not ready, initializing...');
                // Wait for initialization
                await this.waitForGoogleLibraries();
                await this.loadGapiClient();
            }
            
            if (this.tokenClient) {
                console.log('Requesting access token...');
                // Request access token - this will trigger the OAuth popup
                this.tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                console.error('Token client still null after init');
                showToast('Google Drive failed to initialize. Please refresh the page.', 'error');
            }
        } catch (error) {
            console.error('Google Drive connection error:', error);
            showToast(`Failed to connect to Google Drive: ${error.message || 'Unknown error'}`, 'error');
        } finally {
            if (connectBtn) {
                connectBtn.disabled = false;
                connectBtn.textContent = originalText || 'Connect Google Drive';
            }
        }
    },
    
    // Disconnect Google Drive
    disconnectGoogleDrive() {
        // Revoke the token if possible
        const tokenData = localStorage.getItem(this.STORAGE_KEYS.driveToken);
        if (tokenData) {
            try {
                const token = JSON.parse(tokenData);
                if (token.access_token && google?.accounts?.oauth2) {
                    google.accounts.oauth2.revoke(token.access_token);
                }
            } catch (e) {
                console.log('Token revoke skipped');
            }
        }
        
        localStorage.removeItem(this.STORAGE_KEYS.driveToken);
        this.driveConnected = false;
        this.driveUser = null;
        
        document.getElementById('driveNotConnected')?.classList.remove('hidden');
        document.getElementById('driveConnected')?.classList.add('hidden');
        
        showToast('Google Drive disconnected', 'info');
    },
    
    // Check if Drive token is valid
    isDriveTokenValid() {
        try {
            const tokenData = localStorage.getItem(this.STORAGE_KEYS.driveToken);
            if (!tokenData) return false;
            
            const token = JSON.parse(tokenData);
            return token.access_token && token.expires_at > Date.now();
        } catch (e) {
            return false;
        }
    },
    
    // Get or create folder in Drive
    async getOrCreateDriveFolder(folderName) {
        try {
            // Search for existing folder
            const searchResponse = await gapi.client.drive.files.list({
                q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });
            
            if (searchResponse.result.files && searchResponse.result.files.length > 0) {
                return searchResponse.result.files[0].id;
            }
            
            // Create new folder
            const createResponse = await gapi.client.drive.files.create({
                resource: {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder'
                },
                fields: 'id'
            });
            
            return createResponse.result.id;
        } catch (error) {
            console.error('Error creating Drive folder:', error);
            throw error;
        }
    },
    
    // Upload file to Drive
    async uploadToDrive(fileName, fileContent, folderId, mimeType = 'application/pdf') {
        try {
            const boundary = '-------314159265358979323846';
            const metadata = {
                name: fileName,
                mimeType: mimeType,
                parents: [folderId]
            };
            
            // Convert Blob/ArrayBuffer to base64
            let base64Data;
            if (fileContent instanceof Blob) {
                base64Data = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64 = reader.result.split(',')[1];
                        resolve(base64);
                    };
                    reader.readAsDataURL(fileContent);
                });
            } else {
                base64Data = btoa(fileContent);
            }
            
            const multipartRequestBody =
                `--${boundary}\r\n` +
                `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
                JSON.stringify(metadata) + `\r\n` +
                `--${boundary}\r\n` +
                `Content-Type: ${mimeType}\r\n` +
                `Content-Transfer-Encoding: base64\r\n\r\n` +
                base64Data + `\r\n` +
                `--${boundary}--`;
            
            const response = await gapi.client.request({
                path: '/upload/drive/v3/files',
                method: 'POST',
                params: { uploadType: 'multipart' },
                headers: {
                    'Content-Type': `multipart/related; boundary="${boundary}"`
                },
                body: multipartRequestBody
            });
            
            return response.result;
        } catch (error) {
            console.error('Error uploading to Drive:', error);
            throw error;
        }
    },
    
    // Generate PDF as Blob
    generatePdfBlob(report) {
        if (typeof window.jspdf === 'undefined') {
            return null;
        }
        
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            const primaryColor = [91, 155, 213];
            
            // Title
            doc.setFontSize(22);
            doc.setTextColor(...primaryColor);
            doc.text('IFTA Fuel Tax Report', 14, 22);
            
            doc.setDrawColor(...primaryColor);
            doc.setLineWidth(0.5);
            doc.line(14, 26, 196, 26);
            
            // Report Info
            doc.setFontSize(10);
            doc.setTextColor(80, 80, 80);
            
            doc.setFont(undefined, 'bold');
            doc.text('Report:', 14, 35);
            doc.text('Quarter:', 14, 41);
            doc.text('Created:', 14, 47);
            
            doc.setFont(undefined, 'normal');
            doc.text(report.name, 50, 35);
            doc.text(report.quarter, 50, 41);
            doc.text(this.formatDate(report.createdAt), 50, 47);
            
            // Table data
            const tableData = (report.data?.rows || []).filter(r => r.jurisdiction).map(row => [
                row.jurisdiction,
                this.formatNumber(row.totalMiles),
                this.formatNumber(row.taxableMiles),
                this.formatGallons(row.taxPaidGallons),
                this.formatRate(row.taxRate),
                this.formatGallons(row.taxableGallons),
                this.formatGallons(row.netTaxableGallons),
                this.formatCurrency(this.getDisplayTaxDue(row.taxDue, row.jurisdiction))
            ]);
            
            // Add totals
            if (report.summary) {
                tableData.push([
                    'TOTALS',
                    this.formatNumber(report.summary.totalMiles || 0),
                    this.formatNumber(report.summary.taxableMiles || 0),
                    this.formatGallons(report.summary.gallons || 0),
                    '—',
                    this.formatGallons(report.summary.taxableGallons || 0),
                    this.formatGallons(report.summary.netGallons || 0),
                    report.summary.totalTax || '$0.00'
                ]);
            }
            
            doc.autoTable({
                startY: report.notes ? 62 : 55,
                head: [['Jurisdiction', 'Total Miles', 'Taxable Miles', 'Tax Paid Gal', 'Rate', 'Taxable Gal', 'Net Taxable', 'Tax Due']],
                body: tableData,
                theme: 'striped',
                headStyles: {
                    fillColor: primaryColor,
                    textColor: 255,
                    fontStyle: 'bold',
                    fontSize: 8
                },
                bodyStyles: { fontSize: 7 },
                didParseCell: function(data) {
                    if (data.row.index === tableData.length - 1) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [232, 245, 233];
                    }
                }
            });
            
            return doc.output('blob');
        } catch (error) {
            console.error('PDF generation error:', error);
            return null;
        }
    },
    
    // Populate saved reports for Drive
    populateDriveSavedReports() {
        const container = document.getElementById('driveSavedReports');
        if (!container) return;
        
        const reports = this.getSavedReports();
        
        if (reports.length === 0) {
            container.innerHTML = '<p style="font-size: 0.6875rem; color: var(--gray-400);">No saved reports</p>';
            return;
        }
        
        container.innerHTML = reports.map(report => `
            <label class="checkbox-label">
                <input type="checkbox" class="drive-report" data-report-id="${report.id}">
                <span>${this.escapeHtml(report.name)} (${report.quarter})</span>
            </label>
        `).join('');
    },
    
    // Save to Google Drive
    async saveToDrive() {
        if (!this.driveEnabled) {
            showToast('Google Drive integration is not configured', 'error');
            this.closeModal('driveModal');
            return;
        }
        
        // Check if connected
        if (!this.isDriveTokenValid()) {
            showToast('Please connect Google Drive first', 'warning');
            return;
        }
        
        const folderName = document.getElementById('driveFolderName')?.value?.trim() || 'IFTA Reports';
        const saveCurrentReport = document.getElementById('driveCurrentReport')?.checked;
        
        // Get selected saved reports
        const selectedReports = [];
        document.querySelectorAll('.drive-report:checked').forEach(cb => {
            selectedReports.push(cb.dataset.reportId);
        });
        
        if (!saveCurrentReport && selectedReports.length === 0) {
            showToast('Please select at least one report', 'warning');
            return;
        }
        
        // Show loading state on button
        const saveBtn = document.getElementById('saveToDriveBtn');
        const originalText = saveBtn?.textContent;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner"></span> Uploading...';
        }
        
        try {
            // Get or create folder
            const folderId = await this.getOrCreateDriveFolder(folderName);
            
            let uploadCount = 0;
            
            // Upload current report
            if (saveCurrentReport) {
                const currentReport = this.getCurrentReportData();
                if (currentReport) {
                    const pdfBlob = this.generatePdfBlob(currentReport);
                    if (pdfBlob) {
                        const fileName = `${currentReport.name.replace(/[^a-z0-9]/gi, '-')}.pdf`;
                        await this.uploadToDrive(fileName, pdfBlob, folderId);
                        uploadCount++;
                    }
                }
            }
            
            // Upload selected saved reports
            const reports = this.getSavedReports();
            for (const reportId of selectedReports) {
                const report = reports.find(r => r.id === reportId);
                if (report) {
                    const pdfBlob = this.generatePdfBlob(report);
                    if (pdfBlob) {
                        const fileName = `${report.name.replace(/[^a-z0-9]/gi, '-')}.pdf`;
                        await this.uploadToDrive(fileName, pdfBlob, folderId);
                        uploadCount++;
                    }
                }
            }
            
            this.closeModal('driveModal');
            showToast(`${uploadCount} report(s) saved to Google Drive!`, 'success');
        } catch (error) {
            console.error('Drive upload error:', error);
            showToast('Failed to upload to Google Drive. Please try again.', 'error');
        } finally {
            // Restore button
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = originalText || 'Save to Drive';
            }
        }
    },
    
    // Get current report data for Drive upload
    getCurrentReportData() {
        const dataRows = (appState?.rows || []).filter(r => r.jurisdiction);
        if (dataRows.length === 0) return null;
        
        const totalTax = dataRows.reduce((sum, r) => sum + this.getDisplayTaxDue(r.taxDue || 0, r.jurisdiction), 0);
        const totalMiles = dataRows.reduce((sum, r) => sum + (r.totalMiles || 0), 0);
        const taxableMiles = dataRows.reduce((sum, r) => sum + (r.taxableMiles || 0), 0);
        const gallons = dataRows.reduce((sum, r) => sum + (r.taxPaidGallons || 0), 0);
        const taxableGallons = dataRows.reduce((sum, r) => sum + (r.taxableGallons || 0), 0);
        const netGallons = dataRows.reduce((sum, r) => sum + (r.netTaxableGallons || 0), 0);
        
        const quarter = appState?.selectedQuarter || 'Q4 2025';
        
        return {
            name: `IFTA Report - ${quarter}`,
            quarter: quarter,
            createdAt: new Date().toISOString(),
            data: { rows: dataRows },
            summary: {
                jurisdictions: dataRows.length,
                totalMiles: totalMiles,
                taxableMiles: taxableMiles,
                gallons: gallons,
                taxableGallons: taxableGallons,
                netGallons: netGallons,
                totalTax: this.formatCurrency(totalTax)
            }
        };
    },

    // ============ PROFILE ============
    
    // Open profile modal
    openProfileModal() {
        if (!IFTAAuth.user) return;
        
        document.getElementById('profileEmail').value = IFTAAuth.user.email || '';
        document.getElementById('profileFullName').value = IFTAAuth.user.name || '';
        document.getElementById('profileCompany').value = IFTAAuth.user.company || '';
        document.getElementById('profilePhone').value = IFTAAuth.user.phone || '';
        document.getElementById('profileFleetSize').value = IFTAAuth.user.fleetSize || '';
        document.getElementById('profileDriverCount').value = IFTAAuth.user.driverCount || '';
        
        this.openModal('profileModal');
    },
    
    // Handle profile submit
    async handleProfileSubmit(e) {
        e.preventDefault();
        
        if (!IFTAAuth.user) return;
        
        IFTAAuth.user.name = document.getElementById('profileFullName')?.value?.trim() || IFTAAuth.user.name;
        IFTAAuth.user.company = document.getElementById('profileCompany')?.value?.trim() || '';
        IFTAAuth.user.phone = document.getElementById('profilePhone')?.value?.trim() || '';
        IFTAAuth.user.fleetSize = document.getElementById('profileFleetSize')?.value || '';
        IFTAAuth.user.driverCount = document.getElementById('profileDriverCount')?.value || '';
        
        // Save to localStorage
        localStorage.setItem('ifta_user', JSON.stringify(IFTAAuth.user));
        
        // Also save to Firebase if available
        if (typeof db !== 'undefined' && IFTAAuth.user?.uid) {
            try {
                await db.collection('users').doc(IFTAAuth.user.uid).update({
                    name: IFTAAuth.user.name,
                    company: IFTAAuth.user.company,
                    phone: IFTAAuth.user.phone,
                    fleetSize: IFTAAuth.user.fleetSize,
                    driverCount: IFTAAuth.user.driverCount,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (error) {
                console.error('Error saving profile to Firebase:', error);
            }
        }
        
        this.updateProfileMenuInfo();
        this.closeModal('profileModal');
        showToast('Profile updated!', 'success');
    },
    
    // ============ PREFERENCES ============
    
    // Open preferences modal
    openPreferencesModal() {
        const prefs = this.getPreferences();
        
        document.getElementById('prefFuelType').value = prefs.defaultFuelType || 'diesel';
        document.getElementById('prefMpg').value = prefs.defaultMpg || 6.5;
        document.getElementById('prefAutoSave').checked = prefs.autoSave !== false;
        document.getElementById('prefAutoBackup').checked = prefs.autoBackup === true;
        document.getElementById('prefEmailReminders').checked = prefs.emailReminders !== false;
        document.getElementById('prefRateAlerts').checked = prefs.rateAlerts !== false;
        
        // Populate jurisdiction dropdown
        const jurisdictionSelect = document.getElementById('prefBaseJurisdiction');
        if (jurisdictionSelect && typeof getJurisdictionList === 'function') {
            const jurisdictions = getJurisdictionList();
            jurisdictionSelect.innerHTML = jurisdictions.map(j => 
                `<option value="${j.code}" ${j.code === (prefs.defaultBaseJurisdiction || 'TX') ? 'selected' : ''}>${j.name} (${j.code})</option>`
            ).join('');
        }
        
        this.openModal('preferencesModal');
    },
    
    // Get preferences
    getPreferences() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEYS.preferences) || '{}');
        } catch (e) {
            return {};
        }
    },
    
    // Save preferences
    savePreferences() {
        const prefs = {
            defaultFuelType: document.getElementById('prefFuelType')?.value || 'diesel',
            defaultBaseJurisdiction: document.getElementById('prefBaseJurisdiction')?.value || 'TX',
            defaultMpg: parseFloat(document.getElementById('prefMpg')?.value) || 6.5,
            autoSave: document.getElementById('prefAutoSave')?.checked !== false,
            autoBackup: document.getElementById('prefAutoBackup')?.checked === true,
            emailReminders: document.getElementById('prefEmailReminders')?.checked !== false,
            rateAlerts: document.getElementById('prefRateAlerts')?.checked !== false
        };
        
        localStorage.setItem(this.STORAGE_KEYS.preferences, JSON.stringify(prefs));
        this.closeModal('preferencesModal');
        showToast('Preferences saved!', 'success');
    },
    
    // Load preferences on init
    loadPreferences() {
        const prefs = this.getPreferences();
        
        // Apply saved defaults
        if (typeof appState !== 'undefined') {
            // Apply default fuel type
            if (prefs.defaultFuelType) {
                const fuelSelect = document.getElementById('fuelTypeSelect');
                if (fuelSelect && fuelSelect.querySelector(`option[value="${prefs.defaultFuelType}"]`)) {
                    fuelSelect.value = prefs.defaultFuelType;
                }
            }
            
            // Apply default MPG
            if (prefs.defaultMpg && prefs.defaultMpg > 0) {
                const mpgInput = document.getElementById('fleetMpg');
                if (mpgInput) {
                    mpgInput.value = prefs.defaultMpg;
                    appState.fleetMpg = prefs.defaultMpg;
                }
            }
            
            // Apply default base jurisdiction
            if (prefs.defaultBaseJurisdiction) {
                const baseSelect = document.getElementById('baseJurisdictionSelect');
                if (baseSelect && baseSelect.querySelector(`option[value="${prefs.defaultBaseJurisdiction}"]`)) {
                    baseSelect.value = prefs.defaultBaseJurisdiction;
                    appState.baseJurisdiction = prefs.defaultBaseJurisdiction;
                }
            }
        }
        
        // Setup auto-save if enabled
        if (prefs.autoSave) {
            this.setupAutoSave();
        }
    },
    
    // Setup auto-save functionality
    setupAutoSave() {
        // Auto-save every 2 minutes if there are changes
        setInterval(() => {
            if (typeof appState !== 'undefined' && appState.rows && appState.rows.length > 0) {
                const hasData = appState.rows.some(r => r.jurisdiction || r.totalMiles > 0);
                if (hasData) {
                    this.autoSaveReport();
                }
            }
        }, 2 * 60 * 1000); // 2 minutes
    },
    
    // Auto-save current report
    autoSaveReport() {
        try {
            const reports = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.reports) || '[]');
            const autoSaveIndex = reports.findIndex(r => r.isAutoSave);
            
            const autoSaveData = {
                id: 'autosave_' + Date.now(),
                isAutoSave: true,
                name: 'Auto-saved Report',
                quarter: typeof appState !== 'undefined' ? appState.selectedQuarter : '',
                rows: typeof appState !== 'undefined' ? appState.rows : [],
                timestamp: new Date().toISOString()
            };
            
            if (autoSaveIndex >= 0) {
                reports[autoSaveIndex] = autoSaveData;
            } else {
                reports.unshift(autoSaveData);
            }
            
            localStorage.setItem(this.STORAGE_KEYS.reports, JSON.stringify(reports));
        } catch (error) {
            console.warn('Auto-save failed:', error);
        }
    },
    
    // Logout
    logout() {
        if (typeof IFTAAuth !== 'undefined') {
            IFTAAuth.logout();
        }
        document.getElementById('profileDropdown')?.classList.remove('open');
    },
    
    // ============ UTILITIES ============
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    formatDate(dateStr) {
        try {
            return new Date(dateStr).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        } catch (e) {
            return dateStr;
        }
    },
    
    formatNumber(num) {
        if (typeof num !== 'number' || isNaN(num)) return '0';
        return Math.round(num).toLocaleString('en-US', { maximumFractionDigits: 0 });
    },
    
    // Format gallons as whole numbers (IFTA requirement)
    formatGallons(num) {
        if (typeof num !== 'number' || isNaN(num)) return '0';
        return Math.round(num).toLocaleString('en-US', { maximumFractionDigits: 0 });
    },
    
    formatRate(num) {
        if (typeof num !== 'number' || isNaN(num)) return '$0.0000';
        return '$' + num.toFixed(4);
    },
    
    formatCurrency(num) {
        if (typeof num !== 'number' || isNaN(num)) return '$0.00';
        const rounded = Math.round(num * 100) / 100; // Round to 2 decimal places
        return '$' + rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    
    // Get display value for tax due based on refund policy
    // If jurisdiction has credit-only policy (no cash refund), show $0 for credits
    getDisplayTaxDue(taxDue, jurisdiction) {
        if (taxDue >= 0) {
            return taxDue; // Tax owed - always show actual amount
        }
        // Tax credit (negative) - check refund policy
        const jurisdictionData = IFTA_TAX_RATES?.jurisdictions?.[jurisdiction];
        if (jurisdictionData?.refundPolicy === 'credit') {
            return 0; // No cash refund - display $0
        }
        return taxDue; // Refund available - show actual credit amount
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM ready, initializing IFTAReports...');
    
    // Initialize IFTAReports after a brief delay to let auth load
    setTimeout(() => {
        try {
            IFTAReports.init();
            console.log('IFTAReports initialized');
        } catch (err) {
            console.error('Error initializing IFTAReports:', err);
        }
    }, 100);
});

// Expose globally
window.IFTAReports = IFTAReports;
