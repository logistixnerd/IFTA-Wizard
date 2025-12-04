// IFTA Wizard - Reports Management & Sharing Module
'use strict';

const IFTAReports = {
    // Storage keys
    STORAGE_KEYS: {
        reports: 'ifta_saved_reports',
        preferences: 'ifta_preferences',
        driveToken: 'ifta_drive_token'
    },
    
    // Google API config (replace with your own in production)
    GOOGLE_CONFIG: {
        clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        apiKey: 'YOUR_GOOGLE_API_KEY',
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
            this.checkDriveConnection();
        }
    },
    
    // Setup event listeners
    setupEventListeners() {
        // Profile dropdown
        const profileBtn = document.getElementById('profileBtn');
        if (profileBtn) {
            profileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleProfileMenu();
            });
        }
        
        // Close profile menu on outside click
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('profileDropdown');
            if (dropdown && !dropdown.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });
        
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
        if (dropdown) {
            dropdown.classList.toggle('open');
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
    
    // Get saved reports
    getSavedReports() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEYS.reports) || '[]');
        } catch (e) {
            return [];
        }
    },
    
    // Save report
    saveReport(reportData) {
        const reports = this.getSavedReports();
        const newReport = {
            id: 'report_' + Date.now(),
            name: reportData.name,
            notes: reportData.notes || '',
            quarter: reportData.quarter,
            createdAt: new Date().toISOString(),
            data: reportData.data,
            summary: reportData.summary
        };
        
        reports.unshift(newReport);
        localStorage.setItem(this.STORAGE_KEYS.reports, JSON.stringify(reports));
        this.updateReportsCount();
        
        return newReport;
    },
    
    // Delete report
    deleteReport(reportId) {
        let reports = this.getSavedReports();
        reports = reports.filter(r => r.id !== reportId);
        localStorage.setItem(this.STORAGE_KEYS.reports, JSON.stringify(reports));
        this.updateReportsCount();
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
                this.formatCurrency(row.taxDue)
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
        const totalTax = dataRows.reduce((sum, r) => sum + (r.taxDue || 0), 0);
        
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
    handleSaveReport(e) {
        e.preventDefault();
        
        const name = document.getElementById('reportName')?.value?.trim();
        const notes = document.getElementById('reportNotes')?.value?.trim();
        
        if (!name) {
            showToast('Please enter a report name', 'error');
            return;
        }
        
        // Get report options
        const options = {
            includeFleetMpg: document.getElementById('includeFleetMpg')?.checked ?? true,
            includeCurrentMpg: document.getElementById('includeCurrentMpg')?.checked ?? true,
            includeUnitNumber: document.getElementById('includeUnitNumber')?.checked ?? true,
            includeTaxRates: document.getElementById('includeTaxRates')?.checked ?? false,
            includeSummary: document.getElementById('includeSummary')?.checked ?? true
        };
        
        const dataRows = (appState?.rows || []).filter(r => r.jurisdiction);
        const totalTax = dataRows.reduce((sum, r) => sum + (r.taxDue || 0), 0);
        const totalMiles = dataRows.reduce((sum, r) => sum + (r.totalMiles || 0), 0);
        const taxableMiles = dataRows.reduce((sum, r) => sum + (r.taxableMiles || 0), 0);
        const gallons = dataRows.reduce((sum, r) => sum + (r.taxPaidGallons || 0), 0);
        const taxableGallons = dataRows.reduce((sum, r) => sum + (r.taxableGallons || 0), 0);
        const netGallons = dataRows.reduce((sum, r) => sum + (r.netTaxableGallons || 0), 0);
        
        const reportData = {
            name: name,
            notes: notes,
            quarter: appState?.selectedQuarter || 'Q4 2025',
            options: options,  // Store the report options
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
        
        this.saveReport(reportData);
        this.closeModal('saveReportModal');
        showToast(`Report "${name}" saved!`, 'success');
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
    handleEmailSubmit(e) {
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
        
        // In production, this would send to a backend API
        // For now, we'll use mailto: as a fallback and show instructions
        
        this.sendEmailWithAttachments({
            to, cc, subject, message,
            attachCurrent,
            savedReportIds: selectedReports
        });
    },
    
    // Send email (simulated - in production use EmailJS, SendGrid, etc.)
    sendEmailWithAttachments(emailData) {
        // Generate PDFs for attachments
        const attachments = [];
        
        if (emailData.attachCurrent) {
            // Current report
            attachments.push('Current Report');
        }
        
        const reports = this.getSavedReports();
        emailData.savedReportIds.forEach(id => {
            const report = reports.find(r => r.id === id);
            if (report) {
                attachments.push(report.name);
            }
        });
        
        // Create mailto link as fallback
        let body = emailData.message || '';
        if (attachments.length > 0) {
            body += '\n\n---\nAttachments: ' + attachments.join(', ');
            body += '\n\n(Note: Please download the PDF files and attach them manually, or use the Google Drive integration to share.)';
        }
        
        const mailtoLink = `mailto:${emailData.to}${emailData.cc ? '?cc=' + emailData.cc : ''}${emailData.cc ? '&' : '?'}subject=${encodeURIComponent(emailData.subject)}&body=${encodeURIComponent(body)}`;
        
        // For demo: open mailto and download PDFs
        window.open(mailtoLink, '_blank');
        
        // Download current report if selected
        if (emailData.attachCurrent && typeof exportToPdf === 'function') {
            setTimeout(() => exportToPdf(), 500);
        }
        
        // Download selected saved reports
        emailData.savedReportIds.forEach((id, index) => {
            const report = reports.find(r => r.id === id);
            if (report) {
                setTimeout(() => this.generatePdfFromReport(report), 1000 + (index * 500));
            }
        });
        
        this.closeModal('emailModal');
        showToast('Opening email client... PDFs will download for attachment.', 'info');
    },
    
    // ============ GOOGLE DRIVE ============
    
    // Check if Drive is connected
    checkDriveConnection() {
        const token = localStorage.getItem(this.STORAGE_KEYS.driveToken);
        if (token) {
            try {
                const data = JSON.parse(token);
                if (data.expiry && new Date(data.expiry) > new Date()) {
                    this.driveConnected = true;
                    this.driveUser = data.email;
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
            document.getElementById('driveUserEmail').textContent = this.driveUser || 'user@gmail.com';
            this.populateDriveSavedReports();
        } else {
            notConnected?.classList.remove('hidden');
            connected?.classList.add('hidden');
        }
        
        this.openModal('driveModal');
    },
    
    // Connect Google Drive
    connectGoogleDrive() {
        // In production, this would use Google OAuth
        // For demo, simulate connection
        
        showToast('Connecting to Google Drive...', 'info');
        
        // Simulate OAuth flow
        setTimeout(() => {
            const mockToken = {
                email: IFTAAuth.user?.email || 'user@gmail.com',
                accessToken: 'mock_token_' + Date.now(),
                expiry: new Date(Date.now() + 3600000).toISOString() // 1 hour
            };
            
            localStorage.setItem(this.STORAGE_KEYS.driveToken, JSON.stringify(mockToken));
            this.driveConnected = true;
            this.driveUser = mockToken.email;
            
            // Update UI
            document.getElementById('driveNotConnected')?.classList.add('hidden');
            document.getElementById('driveConnected')?.classList.remove('hidden');
            document.getElementById('driveUserEmail').textContent = mockToken.email;
            
            this.populateDriveSavedReports();
            showToast('Google Drive connected!', 'success');
        }, 1500);
    },
    
    // Disconnect Google Drive
    disconnectGoogleDrive() {
        localStorage.removeItem(this.STORAGE_KEYS.driveToken);
        this.driveConnected = false;
        this.driveUser = null;
        
        document.getElementById('driveNotConnected')?.classList.remove('hidden');
        document.getElementById('driveConnected')?.classList.add('hidden');
        
        showToast('Google Drive disconnected', 'info');
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
    saveToDrive() {
        if (!this.driveEnabled) {
            showToast('Google Drive integration is not configured', 'error');
            this.closeModal('driveModal');
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
        
        showToast('Saving to Google Drive...', 'info');
        
        // In production, this would upload to Google Drive API
        // For demo, simulate the upload
        
        setTimeout(() => {
            let count = (saveCurrentReport ? 1 : 0) + selectedReports.length;
            
            // Download PDFs locally as a fallback
            if (saveCurrentReport && typeof exportToPdf === 'function') {
                exportToPdf();
            }
            
            const reports = this.getSavedReports();
            selectedReports.forEach((id, index) => {
                const report = reports.find(r => r.id === id);
                if (report) {
                    setTimeout(() => this.generatePdfFromReport(report), 500 + (index * 500));
                }
            });
            
            this.closeModal('driveModal');
            showToast(`${count} report(s) saved to "${folderName}" folder! (PDFs downloaded locally)`, 'success');
        }, 1500);
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
    handleProfileSubmit(e) {
        e.preventDefault();
        
        if (!IFTAAuth.user) return;
        
        IFTAAuth.user.name = document.getElementById('profileFullName')?.value?.trim() || IFTAAuth.user.name;
        IFTAAuth.user.company = document.getElementById('profileCompany')?.value?.trim() || '';
        IFTAAuth.user.phone = document.getElementById('profilePhone')?.value?.trim() || '';
        IFTAAuth.user.fleetSize = document.getElementById('profileFleetSize')?.value || '';
        IFTAAuth.user.driverCount = document.getElementById('profileDriverCount')?.value || '';
        
        localStorage.setItem('ifta_user', JSON.stringify(IFTAAuth.user));
        
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
        
        // Apply defaults if available
        if (typeof appState !== 'undefined') {
            if (prefs.defaultFuelType) {
                // Could set default fuel type
            }
            if (prefs.defaultMpg) {
                // Could set default MPG
            }
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
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for auth to initialize first
    setTimeout(() => {
        IFTAReports.init();
    }, 100);
});

// Expose globally
window.IFTAReports = IFTAReports;
