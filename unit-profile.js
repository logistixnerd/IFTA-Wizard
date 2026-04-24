(function () {
    'use strict';

    const state = {
        user: null,
        truckId: '',
        truck: null,
        history: [],
        photos: [],
        reports: [],
        documents: []
    };

    function $(id) { return document.getElementById(id); }

    function col(name) {
        return db.collection('users').doc(state.user.uid).collection(name);
    }

    function truckRef() { return col('trucks').doc(state.truckId); }
    function historyRef() { return truckRef().collection('history'); }
    function photoRef() { return truckRef().collection('photos'); }
    function docRef() { return truckRef().collection('documents'); }

    function escapeHtml(value) {
        if (value == null) return '';
        const div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
    }

    function normalizeUnit(value) {
        return String(value || '').trim().toUpperCase();
    }

    function fuelLabel(value) {
        switch ((value || '').toLowerCase()) {
        case 'diesel': return 'Diesel';
        case 'gasoline': return 'Gasoline';
        case 'cng': return 'CNG';
        case 'lng': return 'LNG';
        default: return value || 'Unknown';
        }
    }

    function statusLabel(value) {
        switch ((value || '').toLowerCase()) {
        case 'active': return 'Active';
        case 'inactive': return 'Out of Service';
        case 'maintenance': return 'In Maintenance';
        default: return value || 'Unknown';
        }
    }

    function toDate(value) {
        if (!value) return null;
        if (typeof value.toDate === 'function') return value.toDate();
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatDate(value) {
        const date = toDate(value);
        if (!date) return 'Unknown date';
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit'
        }).format(date);
    }

    function formatShortDate(value) {
        const date = toDate(value);
        if (!date) return '-';
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        }).format(date);
    }

    function setAlert(message) {
        const alert = $('unitAlert');
        if (!message) { alert.classList.add('hidden'); alert.textContent = ''; return; }
        alert.textContent = message;
        alert.classList.remove('hidden');
    }

    /* ---------- Doc type helpers ---------- */
    const DOC_TYPE_LABELS = {
        registration: 'Registration',
        insurance: 'Insurance',
        inspection: 'Inspection',
        title: 'Title',
        lease: 'Lease',
        photo: 'Photo',
        other: 'Other'
    };

    function docTypeLabel(type) {
        return DOC_TYPE_LABELS[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Other');
    }

    function isImage(doc) {
        if (doc.contentType && doc.contentType.startsWith('image/')) return true;
        if (doc.url) {
            const lower = doc.url.split('?')[0].toLowerCase();
            return /\.(jpg|jpeg|png|gif|webp|svg)$/.test(lower);
        }
        return false;
    }

    /* ---------- Render ---------- */
    function formatOdometer(miles) {
        if (miles == null) return '—';
        return new Intl.NumberFormat('en-US').format(Math.round(miles)) + ' mi';
    }

    function getFuelColor(pct) {
        if (pct <= 10) return '#ef4444';
        if (pct <= 25) return '#f59e0b';
        return '#10b981';
    }

    function renderTruck() {
        const truck = state.truck;
        if (!truck) return;
        const unitLabel = truck.unit || state.truckId;

        $('unitTitle').textContent = unitLabel;
        $('unitSubtitle').textContent = [truck.year, truck.make, truck.model].filter(Boolean).join(' ') || 'No make/model details saved yet.';
        $('unitStatusChip').textContent = statusLabel(truck.status);
        $('unitFuelChip').textContent = fuelLabel(truck.fuel);
        $('unitPlateChip').textContent = truck.plate ? (truck.plateState ? truck.plate + ' (' + truck.plateState + ')' : truck.plate) : 'No plate';

        // VIN chip
        const vinChip = $('unitVinChip');
        if (vinChip && truck.vin) {
            vinChip.textContent = truck.vin;
            vinChip.classList.remove('up-chip--hidden');
        }

        // Samsara chip
        const samChip = $('unitSamsaraChip');
        if (samChip && truck.samsaraId) samChip.classList.remove('up-chip--hidden');

        // Equipment detail grid
        $('detailUnit').textContent = unitLabel;
        $('detailYear').textContent = truck.year || '—';
        $('detailMake').textContent = truck.make || '—';
        $('detailModel').textContent = truck.model || '—';
        $('detailVin').textContent = truck.vin || '—';
        $('detailPlate').textContent = truck.plate ? (truck.plateState ? truck.plate + ' (' + truck.plateState + ')' : truck.plate) : '—';
        $('detailFuel').textContent = fuelLabel(truck.fuel);
        $('detailColor').textContent = truck.color || '—';
        $('detailInspExp').textContent = formatShortDate(truck.inspExp || truck.inspectionExp);
        $('detailRegExp').textContent = formatShortDate(truck.regExp || truck.registrationExp);
        $('detailInsExp').textContent = formatShortDate(truck.insExp || truck.insuranceExp);

        // Telematics
        renderTelematics(truck);

        // Photo circle
        if (truck.photoUrl) {
            const hero = $('heroPhoto');
            hero.innerHTML = '';
            hero.classList.add('has-photo');
            const img = document.createElement('img');
            img.src = truck.photoUrl;
            img.alt = unitLabel;
            img.addEventListener('click', () => openLightbox(truck.photoUrl));
            hero.appendChild(img);
        }

        document.title = unitLabel + ' - Unit Profile - IFTA Wizard';
    }

    function renderTelematics(truck) {
        // Pick best odometer: Samsara > manual
        const odo = truck.samsaraOdometer != null ? truck.samsaraOdometer : (truck.odometerReading != null ? truck.odometerReading : null);
        const odoSource = truck.samsaraOdometer != null ? 'samsara' : 'manual';

        // Hero KPIs
        $('heroOdometer').textContent = odo != null ? new Intl.NumberFormat('en-US').format(Math.round(odo)) : '—';
        $('heroEngHours').textContent = truck.samsaraEngineHours != null ? truck.samsaraEngineHours + 'h' : '—';
        $('heroFuel').textContent = truck.samsaraFuelLevel != null ? truck.samsaraFuelLevel + '%' : '—';
        const faultCount = (truck.samsaraFaults || []).length;
        $('heroFaults').textContent = faultCount > 0 ? String(faultCount) : '0';
        $('heroFaults').style.color = faultCount > 0 ? '#ef4444' : '';

        // Odometer row
        const telemOdo = $('telemOdometer');
        const telemOdoUnit = $('telemOdometerUnit');
        if (odo != null) {
            telemOdo.textContent = new Intl.NumberFormat('en-US').format(Math.round(odo));
            telemOdoUnit.textContent = odoSource === 'samsara' ? 'mi · Samsara' : 'mi · Manual';
        } else {
            telemOdo.textContent = '—';
            telemOdoUnit.textContent = '';
        }

        // Fuel bar + consumption
        const fuel = truck.samsaraFuelLevel;
        const fuelBar = $('telemFuelBar');
        const fuelVal = $('telemFuel');
        const fuelSub = $('telemFuelSub');
        if (fuel != null) {
            fuelVal.textContent = fuel + '%';
            fuelBar.style.width = Math.min(100, Math.max(0, fuel)) + '%';
            fuelBar.style.background = getFuelColor(fuel);
            if (fuelSub) {
                const cap = truck.tankCapacity;
                const mpg = truck.avgMpg;
                if (cap) {
                    const gal = Math.round(fuel / 100 * cap);
                    const range = mpg ? ' · ~' + Math.round(gal * mpg).toLocaleString() + ' mi range' : '';
                    fuelSub.textContent = gal + ' gal remaining' + range;
                    fuelSub.style.display = '';
                } else {
                    fuelSub.style.display = 'none';
                }
            }
        } else {
            fuelVal.textContent = '—';
            if (fuelSub) fuelSub.style.display = 'none';
        }

        // Engine hours
        $('telemEngHours').textContent = truck.samsaraEngineHours != null ? truck.samsaraEngineHours + ' hrs' : '—';

        // Location
        const gps = truck.samsaraLocation;
        const locEl = $('telemLocation');
        const locTime = $('telemLocationTime');
        if (gps && gps.location) {
            locEl.textContent = gps.location;
            if (gps.time) {
                try {
                    const d = new Date(gps.time);
                    locTime.textContent = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
                } catch { locTime.textContent = ''; }
            }
        } else {
            locEl.textContent = '—';
        }

        // Sync time
        const syncEl = $('telemSyncTime');
        if (syncEl && gps && gps.time) {
            try {
                const d = new Date(gps.time);
                syncEl.textContent = 'Updated ' + new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
                    Math.round((d.getTime() - Date.now()) / 60000), 'minute');
            } catch { syncEl.textContent = ''; }
        }

        // Fault codes
        const faults = truck.samsaraFaults || [];
        const faultsHead = $('telemFaultsHeadText');
        const faultsList = $('telemFaultsList');
        if (faultsHead) faultsHead.textContent = 'Fault Codes' + (faults.length ? ' (' + faults.length + ')' : '');
        if (faultsList) {
            if (!faults.length) {
                faultsList.innerHTML = '<span class="up-telem-no-faults">No active faults</span>';
            } else {
                faultsList.innerHTML = faults.slice(0, 6).map(f => {
                    const sev = (f.severity || '').toLowerCase();
                    const sevClass = sev === 'critical' ? 'up-fault--critical' : sev === 'major' ? 'up-fault--major' : 'up-fault--minor';
                    return `<div class="up-fault-row ${sevClass}">
                        <span class="up-fault-code">${escapeHtml(f.code || 'DTC')}</span>
                        <span class="up-fault-desc">${escapeHtml(f.description || 'Fault code')}</span>
                        ${f.severity ? `<span class="up-fault-sev">${escapeHtml(f.severity)}</span>` : ''}
                    </div>`;
                }).join('');
                if (faults.length > 6) faultsList.innerHTML += `<span class="up-telem-no-faults">+${faults.length - 6} more</span>`;
            }
        }
    }

    /* ---------- Odometer edit ---------- */
    function initOdometerEdit() {
        const editBtn = $('odoEditBtn');
        const cancelBtn = $('odoCancelBtn');
        const saveBtn = $('odoSaveBtn');
        const editRow = $('odoEditRow');
        const input = $('odoInput');
        if (!editBtn) return;

        editBtn.addEventListener('click', () => {
            const current = state.truck?.samsaraOdometer ?? state.truck?.odometerReading ?? '';
            input.value = current !== '' ? Math.round(current) : '';
            editRow.classList.remove('hidden');
            editBtn.classList.add('hidden');
            input.focus();
        });

        cancelBtn.addEventListener('click', () => {
            editRow.classList.add('hidden');
            editBtn.classList.remove('hidden');
        });

        saveBtn.addEventListener('click', async () => {
            const val = parseFloat(input.value);
            if (!Number.isFinite(val) || val < 0) { alert('Enter a valid odometer reading.'); return; }
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
            try {
                await truckRef().update({ odometerReading: Math.round(val) });
                state.truck.odometerReading = Math.round(val);
                renderTelematics(state.truck);
                editRow.classList.add('hidden');
                editBtn.classList.remove('hidden');
            } catch (err) {
                console.error('Odometer save error:', err);
                alert('Failed to save odometer: ' + (err.message || err));
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        });
    }

    function renderHistory() {
        $('historyCount').textContent = String(state.history.length);
        const badge = $('noteCountBadge');
        if (badge) badge.textContent = state.history.length ? String(state.history.length) : '';

        const list = $('historyList');
        if (!state.history.length) {
            list.innerHTML = '<p class="up-empty">No history yet. Add the first note or service event for this unit.</p>';
            return;
        }

        list.innerHTML = state.history.map(item => `
            <article class="up-feed-item">
                <div class="up-feed-row">
                    <div class="up-feed-body">
                        <span class="up-feed-type">${escapeHtml(item.type || 'note')}</span>
                        <p class="up-feed-text">${escapeHtml(item.text || '')}</p>
                    </div>
                    <div class="up-feed-meta">
                        <time class="up-feed-date">${escapeHtml(formatDate(item.createdAt || item.createdAtIso))}</time>
                        <button type="button" class="up-del-btn" data-delete-history="${escapeHtml(item.id)}" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
            </article>
        `).join('');

        list.querySelectorAll('[data-delete-history]').forEach(button => {
            button.addEventListener('click', async () => {
                const entryId = button.getAttribute('data-delete-history');
                if (!entryId || !confirm('Delete this history entry?')) return;
                await historyRef().doc(entryId).delete();
                await loadHistory();
            });
        });
    }

    function renderPhotos() {
        const grid = $('photoGrid');
        if (!state.photos.length) {
            grid.innerHTML = '<p class="up-empty">No photos uploaded yet.</p>';
            return;
        }

        grid.innerHTML = state.photos.map(photo => `
            <div class="up-photo-card">
                <img src="${escapeHtml(photo.imageUrl || '')}" alt="${escapeHtml(photo.caption || 'Unit photo')}" class="up-photo-img" data-lightbox>
                <div class="up-photo-info">
                    <span class="up-photo-caption">${escapeHtml(photo.caption || 'Unit photo')}</span>
                    <div class="up-photo-actions">
                        <time>${escapeHtml(formatDate(photo.createdAt || photo.createdAtIso))}</time>
                        <button type="button" class="up-del-btn" data-delete-photo="${escapeHtml(photo.id)}" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        grid.querySelectorAll('[data-delete-photo]').forEach(button => {
            button.addEventListener('click', async () => {
                const photoId = button.getAttribute('data-delete-photo');
                if (!photoId || !confirm('Delete this photo?')) return;
                await photoRef().doc(photoId).delete();
                await loadPhotos();
            });
        });

        grid.querySelectorAll('[data-lightbox]').forEach(img => {
            img.addEventListener('click', () => openLightbox(img.src));
        });
    }

    function renderDocuments() {
        const count = state.documents.length;
        $('docCount').textContent = String(count);
        const grid = $('docGrid');

        if (!count) {
            grid.innerHTML = '<p class="up-empty">No documents uploaded yet. Upload from the dashboard to see them here.</p>';
            return;
        }

        // Group by type
        const grouped = {};
        state.documents.forEach(doc => {
            const key = doc.type || 'other';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(doc);
        });

        let html = '';
        for (const [type, docs] of Object.entries(grouped)) {
            html += `<div class="up-doc-group">
                <h4 class="up-doc-group-title">${escapeHtml(docTypeLabel(type))}</h4>
                <div class="up-doc-group-items">`;

            docs.forEach(doc => {
                const imgDoc = isImage(doc);
                if (imgDoc) {
                    html += `
                        <div class="up-doc-thumb" title="${escapeHtml(doc.name || '')}">
                            <img src="${escapeHtml(doc.url)}" alt="${escapeHtml(doc.name || '')}" data-lightbox>
                            <span class="up-doc-thumb-label">${escapeHtml(doc.name || docTypeLabel(type))}</span>
                        </div>`;
                } else {
                    html += `
                        <a class="up-doc-file" href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(doc.name || '')}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            <span>${escapeHtml(doc.name || docTypeLabel(type))}</span>
                        </a>`;
                }
            });

            html += `</div></div>`;
        }
        grid.innerHTML = html;

        grid.querySelectorAll('[data-lightbox]').forEach(img => {
            img.addEventListener('click', () => openLightbox(img.src));
        });
    }

    function renderReports() {
        $('reportCount').textContent = String(state.reports.length);
        const list = $('reportList');
        if (!state.reports.length) {
            list.innerHTML = '<p class="up-empty">No saved reports linked to this unit yet.</p>';
            return;
        }

        list.innerHTML = state.reports.map(report => {
            const summary = report.summary || {};
            return `
                <article class="up-feed-item">
                    <div class="up-feed-row">
                        <div class="up-feed-body">
                            <strong>${escapeHtml(report.name || 'Saved report')}</strong>
                            <p class="up-feed-text">${escapeHtml(report.quarter || '')}${report.data?.fuelType ? ' · ' + escapeHtml(fuelLabel(report.data.fuelType)) : ''}${summary.totalMiles != null ? ' · ' + escapeHtml(String(summary.totalMiles)) + ' miles' : ''}</p>
                        </div>
                        <time class="up-feed-date">${escapeHtml(formatDate(report.createdAt))}</time>
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderTasks(tasks) {
        const container = $('profileTasksList');
        if (!container) return;

        const openTasks = tasks.filter(t => t.status !== 'Resolved');
        const badge = $('taskCountBadge');
        if (badge) badge.textContent = openTasks.length ? String(openTasks.length) : '';

        if (!openTasks.length) {
            container.innerHTML = '<p class="up-empty">No open tasks</p>';
            return;
        }

        container.innerHTML = openTasks.slice(0, 3).map(task => {
            const overdue = task.dueDate ? toDate(task.dueDate)?.getTime?.() < Date.now() : false;
            const dueDate = task.dueDate ? formatDate(task.dueDate) : 'No due date';
            const statusColor = getStatusColor(task.status);
            return `
                <div class="up-task-item">
                    <div class="up-task-body">
                        <p class="up-task-text">${escapeHtml(task.text.substring(0, 60))}</p>
                        <p class="up-task-due">${escapeHtml(dueDate)}${overdue ? ' <span class="up-overdue">OVERDUE</span>' : ''}</p>
                    </div>
                    <span class="up-task-status" style="background:${statusColor}18;color:${statusColor}">${escapeHtml(task.status)}</span>
                </div>
            `;
        }).join('');

        if (openTasks.length > 3) {
            container.innerHTML += `<p class="up-task-more">+${openTasks.length - 3} more tasks</p>`;
        }
    }

    function getStatusColor(status) {
        return { 'Open': '#ef4444', 'In Progress': '#f59e0b', 'Resolved': '#10b981' }[status] || '#6b7280';
    }

    /* ---------- Lightbox ---------- */
    function openLightbox(src) {
        const lb = $('photoLightbox');
        $('lightboxImg').src = src;
        lb.classList.add('active');
    }

    function initLightbox() {
        const lb = $('photoLightbox');
        if (!lb) return;
        lb.querySelector('.up-lightbox-backdrop').addEventListener('click', () => lb.classList.remove('active'));
        lb.querySelector('.up-lightbox-close').addEventListener('click', () => lb.classList.remove('active'));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('active'); });
    }

    /* ---------- Collapse ---------- */
    function initCollapse() {
        const toggle = $('unitDetailsToggle');
        if (!toggle) return;
        toggle.addEventListener('click', () => {
            const card = $('unitDetailsCard');
            const expanded = !card.classList.contains('collapsed');
            card.classList.toggle('collapsed');
            toggle.setAttribute('aria-expanded', String(!expanded));
            $('collapseHint').textContent = expanded ? 'Show' : 'Hide';
        });
    }

    /* ---------- Loaders ---------- */
    async function loadTasks() {
        try {
            const result = await FirebaseDB.getTasks(state.user.uid, 'trucks', state.truckId);
            if (result.success) renderTasks(result.data || []);
        } catch (error) {
            console.error('Error loading tasks:', error);
            const container = $('profileTasksList');
            if (container) container.innerHTML = '<p class="up-empty" style="color:#dc2626">Error loading tasks</p>';
        }
    }

    async function loadTruck() {
        const doc = await truckRef().get();
        if (!doc.exists) {
            setAlert('This unit could not be found. It may have been deleted.');
            $('unitTitle').textContent = 'Unit not found';
            $('unitSubtitle').textContent = 'Return to the dashboard and select another truck.';
            return false;
        }
        state.truck = { id: doc.id, ...doc.data() };
        renderTruck();

        // Live-update telematics (odometer, fuel, engine hours) whenever Samsara syncs
        if (!state._truckUnsub) {
            state._truckUnsub = truckRef().onSnapshot(snap => {
                if (!snap.exists) return;
                state.truck = { id: snap.id, ...snap.data() };
                renderTelematics(state.truck);
            });
        }
        return true;
    }

    async function loadHistory() {
        let snapshot;
        try { snapshot = await historyRef().orderBy('createdAt', 'desc').get(); }
        catch { snapshot = await historyRef().get(); }
        state.history = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const at = toDate(a.createdAt || a.createdAtIso)?.getTime() || 0;
                const bt = toDate(b.createdAt || b.createdAtIso)?.getTime() || 0;
                return bt - at;
            });
        renderHistory();
    }

    async function loadPhotos() {
        let snapshot;
        try { snapshot = await photoRef().orderBy('createdAt', 'desc').get(); }
        catch { snapshot = await photoRef().get(); }
        state.photos = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const at = toDate(a.createdAt || a.createdAtIso)?.getTime() || 0;
                const bt = toDate(b.createdAt || b.createdAtIso)?.getTime() || 0;
                return bt - at;
            });
        renderPhotos();
    }

    async function loadDocuments() {
        let snapshot;
        try { snapshot = await docRef().orderBy('uploadedAt', 'desc').get(); }
        catch { snapshot = await docRef().get(); }
        state.documents = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const at = toDate(a.uploadedAt)?.getTime() || 0;
                const bt = toDate(b.uploadedAt)?.getTime() || 0;
                return bt - at;
            });
        renderDocuments();
    }

    async function loadReports() {
        const unitValue = normalizeUnit(state.truck?.unit);
        if (!unitValue) { state.reports = []; renderReports(); return; }

        let snapshot;
        try { snapshot = await db.collection('users').doc(state.user.uid).collection('reports').orderBy('createdAt', 'desc').get(); }
        catch { snapshot = await db.collection('users').doc(state.user.uid).collection('reports').get(); }

        state.reports = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(report => normalizeUnit(report.data?.unitNumber) === unitValue)
            .sort((a, b) => {
                const at = toDate(a.createdAt)?.getTime() || 0;
                const bt = toDate(b.createdAt)?.getTime() || 0;
                return bt - at;
            });
        renderReports();
    }

    /* ---------- Resize + upload ---------- */
    async function resizeImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.onload = () => {
                const image = new Image();
                image.onerror = () => reject(new Error('Invalid image file.'));
                image.onload = () => {
                    const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(image.width * ratio));
                    canvas.height = Math.max(1, Math.round(image.height * ratio));
                    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.82));
                };
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function bindForms() {
        $('historyForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const type = $('historyType').value;
            const text = $('historyText').value.trim();
            if (!text) { setAlert('History text is required.'); return; }
            setAlert('');
            await historyRef().add({
                type, text,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdAtIso: new Date().toISOString()
            });
            $('historyForm').reset();
            $('historyType').value = 'note';
            await loadHistory();
        });

        $('photoForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const file = $('photoUpload').files[0];
            const caption = $('photoCaption').value.trim();
            if (!file) { setAlert('Select a photo to upload.'); return; }
            if (file.size > 5 * 1024 * 1024) { setAlert('Photo must be smaller than 5 MB.'); return; }
            setAlert('');
            const btn = event.target.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }

            try {
                const uid = state.user.uid;
                const ts = Date.now();
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = 'users/' + uid + '/trucks/' + state.truckId + '/docs/' + ts + '_' + safeName;
                const ref = storage.ref(storagePath);
                await ref.put(file);
                const url = await ref.getDownloadURL();

                const imageUrl = file.type.startsWith('image/') ? await resizeImage(file, 1600) : null;
                await photoRef().add({
                    caption, imageUrl: imageUrl || url,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAtIso: new Date().toISOString()
                });
                const isImage = file.type.startsWith('image/');
                await docRef().add({
                    name: file.name, type: isImage ? 'photo' : 'other',
                    storagePath, url, size: file.size, contentType: file.type,
                    uploadedAt: new Date().toISOString()
                });
                $('photoForm').reset();
                await Promise.all([loadPhotos(), loadDocuments()]);
            } catch (err) {
                console.error('Upload error:', err);
                setAlert('Upload failed: ' + (err.message || err));
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
            }
        });
    }

    async function loadPage() {
        const ok = await loadTruck();
        if (!ok) return;
        await Promise.all([loadHistory(), loadPhotos(), loadDocuments(), loadReports(), loadTasks()]);
    }

    function initAuth() {
        firebase.auth().onAuthStateChanged(async user => {
            if (!user) { window.location.href = 'dashboard.html'; return; }
            state.user = user;
            $('unitUserEmail').textContent = user.email || '';
            state.truckId = new URLSearchParams(window.location.search).get('truck') || '';
            if (!state.truckId) {
                setAlert('No unit was selected. Return to the dashboard and open a truck profile from the Unit button.');
                $('unitTitle').textContent = 'No unit selected';
                $('unitSubtitle').textContent = 'A truck id is required in the page URL.';
                return;
            }
            bindForms();
            await loadPage();
        });
    }

    function init() {
        initLightbox();
        initOdometerEdit();
        initAuth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
(function () {
    'use strict';

    const state = {
        user: null,
        truckId: '',
        truck: null,
        history: [],
        photos: [],
        reports: []
    };

    function $(id) {
        return document.getElementById(id);
    }

    function col(name) {
        return db.collection('users').doc(state.user.uid).collection(name);
    }

    function truckRef() {
        return col('trucks').doc(state.truckId);
    }

    function historyRef() {
        return truckRef().collection('history');
    }

    function photoRef() {
        return truckRef().collection('photos');
    }

    function escapeHtml(value) {
        if (value == null) return '';
        const div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
    }

    function normalizeUnit(value) {
        return String(value || '').trim().toUpperCase();
    }

    function fuelLabel(value) {
        switch ((value || '').toLowerCase()) {
        case 'diesel': return 'Diesel';
        case 'gasoline': return 'Gasoline';
        case 'cng': return 'CNG';
        case 'lng': return 'LNG';
        default: return value || 'Unknown';
        }
    }

    function statusLabel(value) {
        switch ((value || '').toLowerCase()) {
        case 'active': return 'Active';
        case 'inactive': return 'Out of Service';
        case 'maintenance': return 'In Maintenance';
        default: return value || 'Unknown';
        }
    }

    function toDate(value) {
        if (!value) return null;
        if (typeof value.toDate === 'function') return value.toDate();
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatDate(value) {
        const date = toDate(value);
        if (!date) return 'Unknown date';
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }).format(date);
    }

    function setAlert(message) {
        const alert = $('unitAlert');
        if (!message) {
            alert.classList.add('hidden');
            alert.textContent = '';
            return;
        }
        alert.textContent = message;
        alert.classList.remove('hidden');
    }

    function renderTruck() {
        const truck = state.truck;
        if (!truck) return;
        const unitLabel = truck.unit || state.truckId;
        $('unitTitle').textContent = unitLabel;
        $('unitSubtitle').textContent = [truck.year, truck.make, truck.model].filter(Boolean).join(' ') || 'No make/model details saved yet.';
        $('unitStatusChip').textContent = statusLabel(truck.status);
        $('unitFuelChip').textContent = fuelLabel(truck.fuel);
        $('unitPlateChip').textContent = truck.plate ? (truck.plateState ? truck.plate + ' (' + truck.plateState + ')' : truck.plate) : 'No plate';

        $('detailUnit').textContent = unitLabel;
        $('detailYear').textContent = truck.year || '-';
        $('detailMake').textContent = truck.make || '-';
        $('detailModel').textContent = truck.model || '-';
        $('detailVin').textContent = truck.vin || '-';
        $('detailPlate').textContent = truck.plate ? (truck.plateState ? truck.plate + ' (' + truck.plateState + ')' : truck.plate) : '-';

        document.title = unitLabel + ' - Unit Profile - IFTA Wizard';
    }

    function renderHistory() {
        $('historyCount').textContent = String(state.history.length);
        const list = $('historyList');
        if (!state.history.length) {
            list.innerHTML = '<div class="empty-state">No history yet. Add the first note, service update, or invoice reference for this unit.</div>';
            return;
        }

        list.innerHTML = state.history.map(item => `
            <article class="timeline-item">
                <div class="timeline-head">
                    <div>
                        <span class="timeline-type">${escapeHtml(item.type || 'note')}</span>
                        <div class="timeline-text">${escapeHtml(item.text || '')}</div>
                    </div>
                    <div class="item-actions">
                        <span class="timeline-date">${escapeHtml(formatDate(item.createdAt || item.createdAtIso))}</span>
                        <button type="button" data-delete-history="${escapeHtml(item.id)}">Delete</button>
                    </div>
                </div>
            </article>
        `).join('');

        list.querySelectorAll('[data-delete-history]').forEach(button => {
            button.addEventListener('click', async () => {
                const entryId = button.getAttribute('data-delete-history');
                if (!entryId || !confirm('Delete this history entry?')) return;
                await historyRef().doc(entryId).delete();
                await loadHistory();
            });
        });
    }

    function renderPhotos() {
        $('photoCount').textContent = String(state.photos.length);
        const grid = $('photoGrid');
        if (!state.photos.length) {
            grid.innerHTML = '<div class="empty-state">No photos uploaded yet. Add inspection shots, damage photos, invoices, or registration images.</div>';
            return;
        }

        grid.innerHTML = state.photos.map(photo => `
            <article class="photo-card">
                <img src="${escapeHtml(photo.imageUrl || '')}" alt="${escapeHtml(photo.caption || 'Unit photo')}">
                <div class="photo-card-body">
                    <div class="photo-card-head">
                        <strong>${escapeHtml(photo.caption || 'Unit photo')}</strong>
                        <div class="item-actions">
                            <span class="photo-date">${escapeHtml(formatDate(photo.createdAt || photo.createdAtIso))}</span>
                            <button type="button" data-delete-photo="${escapeHtml(photo.id)}">Delete</button>
                        </div>
                    </div>
                </div>
            </article>
        `).join('');

        grid.querySelectorAll('[data-delete-photo]').forEach(button => {
            button.addEventListener('click', async () => {
                const photoId = button.getAttribute('data-delete-photo');
                if (!photoId || !confirm('Delete this photo?')) return;
                await photoRef().doc(photoId).delete();
                await loadPhotos();
            });
        });
    }

    function renderReports() {
        $('reportCount').textContent = String(state.reports.length);
        const list = $('reportList');
        if (!state.reports.length) {
            list.innerHTML = '<div class="empty-state">No saved reports are linked to this unit yet. Reports saved from the calculator with this unit selected will appear here.</div>';
            return;
        }

        list.innerHTML = state.reports.map(report => {
            const summary = report.summary || {};
            return `
                <article class="report-item">
                    <div class="report-head">
                        <div>
                            <strong>${escapeHtml(report.name || 'Saved report')}</strong>
                            <div class="report-meta">${escapeHtml(report.quarter || '')}${report.data?.fuelType ? ' • ' + escapeHtml(fuelLabel(report.data.fuelType)) : ''}${summary.totalMiles != null ? ' • ' + escapeHtml(String(summary.totalMiles)) + ' miles' : ''}</div>
                        </div>
                        <span class="report-date">${escapeHtml(formatDate(report.createdAt))}</span>
                    </div>
                    <div class="report-notes">${escapeHtml(report.notes || 'No notes added to this report.')}</div>
                </article>
            `;
        }).join('');
    }

    function renderTasks(tasks) {
        const container = $('profileTasksList');
        if (!container) return;

        const openTasks = tasks.filter(t => t.status !== 'Resolved');
        
        if (!openTasks.length) {
            container.innerHTML = '<p class="empty-state" style="padding: 1rem; margin: 0;">No open tasks</p>';
            return;
        }

        container.innerHTML = openTasks.slice(0, 3).map(task => {
            const overdue = task.dueDate ? toDate(task.dueDate)?.getTime?.() < Date.now() : false;
            const dueDate = task.dueDate ? formatDate(task.dueDate) : 'No due date';
            const statusColor = getStatusColor(task.status);
            
            return `
                <div class="profile-task-item" style="padding: 0.75rem; border-bottom: 1px solid var(--gray-100); display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <p style="margin: 0 0 0.25rem; font-weight: 500; color: var(--gray-900); font-size: 0.875rem;">${escapeHtml(task.text.substring(0, 60))}</p>
                        <p style="margin: 0; font-size: 0.75rem; color: var(--gray-500);">${escapeHtml(dueDate)}${overdue ? ' <span style="color: #dc2626; font-weight: 600;">OVERDUE</span>' : ''}</p>
                    </div>
                    <span style="display: inline-block; padding: 0.25rem 0.625rem; background-color: ${statusColor}40; color: ${statusColor}; font-size: 0.75rem; font-weight: 600; border-radius: 3px; margin-left: 1rem; white-space: nowrap;">${escapeHtml(task.status)}</span>
                </div>
            `;
        }).join('');

        if (openTasks.length > 3) {
            container.innerHTML += `<p style="padding: 0.75rem; margin: 0; text-align: center; color: var(--gray-500); font-size: 0.8rem;">+${openTasks.length - 3} more tasks</p>`;
        }
    }

    function getStatusColor(status) {
        const statusMap = {
            'Open': '#ef4444',
            'In Progress': '#f59e0b',
            'Resolved': '#10b981'
        };
        return statusMap[status] || '#6b7280';
    }

    async function loadTasks() {
        try {
            const result = await FirebaseDB.getTasks(state.user.uid, 'trucks', state.truckId);
            if (result.success) {
                renderTasks(result.data || []);
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            const container = $('profileTasksList');
            if (container) container.innerHTML = '<p class="empty-state" style="padding: 1rem; margin: 0; color: #dc2626;">Error loading tasks</p>';
        }
    }

    async function loadTruck() {
        const doc = await truckRef().get();
        if (!doc.exists) {
            setAlert('This unit could not be found. It may have been deleted.');
            $('unitTitle').textContent = 'Unit not found';
            $('unitSubtitle').textContent = 'Return to the dashboard and select another truck.';
            return false;
        }
        state.truck = { id: doc.id, ...doc.data() };
        renderTruck();
        return true;
    }

    async function loadHistory() {
        let snapshot;
        try {
            snapshot = await historyRef().orderBy('createdAt', 'desc').get();
        } catch (error) {
            snapshot = await historyRef().get();
        }

        state.history = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((left, right) => {
                const leftTime = toDate(left.createdAt || left.createdAtIso)?.getTime() || 0;
                const rightTime = toDate(right.createdAt || right.createdAtIso)?.getTime() || 0;
                return rightTime - leftTime;
            });
        renderHistory();
    }

    async function loadPhotos() {
        let snapshot;
        try {
            snapshot = await photoRef().orderBy('createdAt', 'desc').get();
        } catch (error) {
            snapshot = await photoRef().get();
        }

        state.photos = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((left, right) => {
                const leftTime = toDate(left.createdAt || left.createdAtIso)?.getTime() || 0;
                const rightTime = toDate(right.createdAt || right.createdAtIso)?.getTime() || 0;
                return rightTime - leftTime;
            });
        renderPhotos();
    }

    async function loadReports() {
        const unitValue = normalizeUnit(state.truck?.unit);
        if (!unitValue) {
            state.reports = [];
            renderReports();
            return;
        }

        let snapshot;
        try {
            snapshot = await db.collection('users').doc(state.user.uid).collection('reports').orderBy('createdAt', 'desc').get();
        } catch (error) {
            snapshot = await db.collection('users').doc(state.user.uid).collection('reports').get();
        }

        state.reports = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(report => normalizeUnit(report.data?.unitNumber) === unitValue)
            .sort((left, right) => {
                const leftTime = toDate(left.createdAt)?.getTime() || 0;
                const rightTime = toDate(right.createdAt)?.getTime() || 0;
                return rightTime - leftTime;
            });
        renderReports();
    }

    async function resizeImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.onload = () => {
                const image = new Image();
                image.onerror = () => reject(new Error('Invalid image file.'));
                image.onload = () => {
                    const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(image.width * ratio));
                    canvas.height = Math.max(1, Math.round(image.height * ratio));
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.82));
                };
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function bindForms() {
        $('historyForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const type = $('historyType').value;
            const text = $('historyText').value.trim();
            if (!text) {
                setAlert('History text is required.');
                return;
            }

            setAlert('');
            await historyRef().add({
                type,
                text,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdAtIso: new Date().toISOString()
            });
            $('historyForm').reset();
            $('historyType').value = 'note';
            await loadHistory();
        });

        $('photoForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const file = $('photoUpload').files[0];
            const caption = $('photoCaption').value.trim();
            if (!file) {
                setAlert('Select a photo to upload.');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                setAlert('Photo must be smaller than 5 MB.');
                return;
            }

            setAlert('');
            const btn = event.target.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }

            try {
                const uid = state.user.uid;
                const ts = Date.now();
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = 'users/' + uid + '/trucks/' + state.truckId + '/docs/' + ts + '_' + safeName;
                const ref = storage.ref(storagePath);
                await ref.put(file);
                const url = await ref.getDownloadURL();

                // Save base64 to photos subcollection for backward compat
                const imageUrl = file.type.startsWith('image/') ? await resizeImage(file, 1600) : null;
                await photoRef().add({
                    caption,
                    imageUrl: imageUrl || url,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAtIso: new Date().toISOString()
                });

                // Write to documents subcollection
                const isImage = file.type.startsWith('image/');
                await docRef().add({
                    name: file.name,
                    type: isImage ? 'photo' : 'other',
                    storagePath: storagePath,
                    url: url,
                    size: file.size,
                    contentType: file.type,
                    uploadedAt: new Date().toISOString()
                });

                $('photoForm').reset();
                await Promise.all([loadPhotos(), loadDocuments()]);
            } catch (err) {
                console.error('Upload error:', err);
                setAlert('Upload failed: ' + (err.message || err));
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
            }
        });
    }

    async function loadPage() {
        const ok = await loadTruck();
        if (!ok) return;
        await Promise.all([loadHistory(), loadPhotos(), loadReports(), loadTasks()]);
    }

    function initAuth() {
        firebase.auth().onAuthStateChanged(async user => {
            if (!user) {
                window.location.href = 'dashboard.html';
                return;
            }

            state.user = user;
            $('unitUserEmail').textContent = user.email || '';
            state.truckId = new URLSearchParams(window.location.search).get('truck') || '';

            if (!state.truckId) {
                setAlert('No unit was selected. Return to the dashboard and open a truck profile from the Unit button.');
                $('unitTitle').textContent = 'No unit selected';
                $('unitSubtitle').textContent = 'A truck id is required in the page URL.';
                return;
            }

            bindForms();
            await loadPage();
        });
    }

    function init() {
        initAuth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();