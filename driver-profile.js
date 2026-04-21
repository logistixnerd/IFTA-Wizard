(function () {
    'use strict';

    const state = {
        user: null,
        driverId: '',
        driver: null,
        history: [],
        photos: [],
        documents: []
    };

    function $(id) {
        return document.getElementById(id);
    }

    function col(name) {
        return db.collection('users').doc(state.user.uid).collection(name);
    }

    function driverRef() {
        return col('drivers').doc(state.driverId);
    }

    function historyRef() {
        return driverRef().collection('history');
    }

    function photoRef() {
        return driverRef().collection('photos');
    }

    function docRef() {
        return driverRef().collection('documents');
    }

    /* ---------- Doc type helpers ---------- */
    const DOC_TYPE_LABELS = {
        cdl: 'CDL',
        medical: 'Medical',
        contract: 'Contract',
        mvr: 'MVR',
        psp: 'PSP',
        photo: 'Photo',
        other: 'Other'
    };

    function docTypeLabel(type) {
        return DOC_TYPE_LABELS[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Other');
    }

    function isImageDoc(doc) {
        if (doc.contentType && doc.contentType.startsWith('image/')) return true;
        if (doc.url) {
            const lower = doc.url.split('?')[0].toLowerCase();
            return /\.(jpg|jpeg|png|gif|webp|svg)$/.test(lower);
        }
        return false;
    }

    function escapeHtml(value) {
        if (value == null) return '';
        const div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
    }

    function statusLabel(value) {
        switch ((value || '').toLowerCase()) {
        case 'active': return 'Active';
        case 'inactive': return 'Inactive';
        case 'home-time': case 'home time': return 'Home Time';
        case 'training': return 'Training';
        case 'pending': return 'Pending';
        case 'suspended': return 'Suspended';
        case 'terminated': return 'Terminated';
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

    function formatDateShort(value) {
        if (!value) return '-';
        const parts = String(value).split('-');
        if (parts.length === 3) {
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const month = months[parseInt(parts[1], 10) - 1] || parts[1];
            return month + ' ' + parts[2] + ', ' + parts[0];
        }
        return value;
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

    function renderDriver() {
        const d = state.driver;
        if (!d) return;
        const fullName = [d.firstName, d.lastName].filter(Boolean).join(' ') || ('Driver ' + state.driverId);
        $('unitTitle').textContent = fullName;
        $('unitSubtitle').textContent = d.cdl ? ('CDL ' + (d.cdlState ? d.cdlState + ' · ' : '') + d.cdl) : 'No CDL on file.';
        $('unitStatusChip').textContent = statusLabel(d.status);
        $('unitCdlChip').textContent = d.cdlState ? ('CDL · ' + d.cdlState) : 'No CDL state';
        $('unitTruckChip').textContent = d.truck ? ('Truck · ' + d.truck) : 'No truck assigned';

        // Photo circle
        if (d.photoUrl) {
            const hero = $('heroPhoto');
            hero.innerHTML = '';
            hero.classList.add('has-photo');
            const img = document.createElement('img');
            img.src = d.photoUrl;
            img.alt = fullName;
            img.addEventListener('click', () => openLightbox(d.photoUrl));
            hero.appendChild(img);
        }

        $('detailName').textContent = fullName;
        $('detailPhone').textContent = d.phone || '-';
        $('detailEmail').textContent = d.email || '-';
        $('detailCdl').textContent = d.cdl || '-';
        $('detailCdlClass').textContent = d.cdlClass ? ('Class ' + d.cdlClass) : '-';
        $('detailCdlState').textContent = d.cdlState || '-';
        $('detailCdlExp').textContent = formatDateShort(d.cdlExp) || '-';
        $('detailMedExp').textContent = formatDateShort(d.medExp) || '-';
        $('detailMvrExp').textContent = formatDateShort(d.mvrExp) || '-';
        $('detailDrugTestDate').textContent = formatDateShort(d.drugTestDate) || '-';
        $('detailTwicExp').textContent = formatDateShort(d.twicExp) || '-';
        $('detailRestrictions').textContent = d.restrictions || '-';
        $('detailTruck').textContent = d.truck || '-';

        document.title = fullName + ' - Driver Profile - IFTA Wizard';
    }

    function renderHistory() {
        $('historyCount').textContent = String(state.history.length);
        renderNotesFeed();
    }

    function renderNotesFeed() {
        const feed = $('dpNotesFeed');
        const badge = $('noteCountBadge');
        if (!feed) return;

        if (badge) {
            badge.textContent = state.history.length ? state.history.length : '';
            badge.style.display = state.history.length ? '' : 'none';
        }

        if (!state.history.length) {
            feed.innerHTML = '<p class="up-empty">No activity yet. Use the compose card above to log notes, incidents, or tasks.</p>';
            return;
        }

        feed.innerHTML = state.history.map(item => {
            const typeLabel = (item.type || 'note').charAt(0).toUpperCase() + (item.type || 'note').slice(1);
            const priorityColor = getPriorityColor(item.priority);
            const dateStr = formatDate(item.createdAt || item.createdAtIso);
            const author = item.createdBy ? item.createdBy.split('@')[0] : '';
            const initial = author ? author.charAt(0).toUpperCase() : 'U';

            return `
                <div class="up-note">
                    <div class="up-note-avi">${initial}</div>
                    <div class="up-note-body">
                        <div class="up-note-meta">
                            <span class="up-note-tag">${escapeHtml(typeLabel)}</span>
                            ${item.priority && item.priority !== 'normal' ? `<span class="up-note-pri" style="color:${priorityColor}">${escapeHtml(item.priority.toUpperCase())}</span>` : ''}
                            <span class="up-note-time">${escapeHtml(dateStr)}</span>
                        </div>
                        <p class="up-note-text">${escapeHtml(item.text || '')}</p>
                        ${author ? `<span class="up-note-author">${escapeHtml(author)}</span>` : ''}
                    </div>
                    <button type="button" class="up-note-del" data-delete-note="${escapeHtml(item.id)}" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>`;
        }).join('');

        feed.querySelectorAll('[data-delete-note]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const entryId = btn.getAttribute('data-delete-note');
                if (!entryId || !confirm('Delete this note?')) return;
                await historyRef().doc(entryId).delete();
                await loadHistory();
            });
        });
    }

    function renderPhotos() {
        $('photoCount').textContent = String(state.photos.length);
        const grid = $('photoGrid');
        if (!state.photos.length) {
            grid.innerHTML = '<p class="up-empty">No photos uploaded yet.</p>';
            return;
        }
        grid.innerHTML = state.photos.map(photo => `
            <div class="up-photo-card">
                <img src="${escapeHtml(photo.imageUrl || '')}" alt="${escapeHtml(photo.caption || 'Driver photo')}" class="up-photo-img" data-lightbox>
                <div class="up-photo-info">
                    <span class="up-photo-caption">${escapeHtml(photo.caption || 'Driver photo')}</span>
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
                if (!photoId || !confirm('Delete this document?')) return;
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
        const grid = $('docGrid');

        if (!count) {
            grid.innerHTML = '<p class="up-empty">No documents uploaded yet. Upload from the dashboard to see them here.</p>';
            return;
        }

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
                if (isImageDoc(doc)) {
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

    function renderDocWarnings() {
        const el = $('docWarnings');
        if (!el) return;
        const d = state.driver;
        if (!d) { el.classList.add('hidden'); return; }

        const warnings = [];
        const today = new Date().toISOString().split('T')[0];
        const soon30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
        const docTypes = (d.docTypes || []);

        // Missing documents
        if (!docTypes.includes('cdl'))      warnings.push({ type: 'missing', text: 'CDL document not uploaded' });
        if (!docTypes.includes('medical'))  warnings.push({ type: 'missing', text: 'Medical card not uploaded' });
        if (!docTypes.includes('mvr'))      warnings.push({ type: 'missing', text: 'MVR report not uploaded' });

        // Expired dates
        if (d.cdlExp && d.cdlExp < today)       warnings.push({ type: 'expired', text: 'CDL expired (' + formatDateShort(d.cdlExp) + ')' });
        else if (d.cdlExp && d.cdlExp <= soon30) warnings.push({ type: 'expiring', text: 'CDL expiring soon (' + formatDateShort(d.cdlExp) + ')' });
        else if (!d.cdlExp)                      warnings.push({ type: 'missing', text: 'CDL expiration date not set' });

        if (d.medExp && d.medExp < today)        warnings.push({ type: 'expired', text: 'Medical card expired (' + formatDateShort(d.medExp) + ')' });
        else if (d.medExp && d.medExp <= soon30)  warnings.push({ type: 'expiring', text: 'Medical card expiring soon (' + formatDateShort(d.medExp) + ')' });
        else if (!d.medExp)                       warnings.push({ type: 'missing', text: 'Medical card expiration not set' });

        if (d.mvrExp && d.mvrExp < today)        warnings.push({ type: 'expired', text: 'MVR expired (' + formatDateShort(d.mvrExp) + ')' });
        else if (d.mvrExp && d.mvrExp <= soon30)  warnings.push({ type: 'expiring', text: 'MVR expiring soon (' + formatDateShort(d.mvrExp) + ')' });

        if (!warnings.length) { el.classList.add('hidden'); return; }

        const iconSvg = {
            expired: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            expiring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
            missing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        };

        el.innerHTML = warnings.map(w =>
            '<div class="doc-warn doc-warn--' + w.type + '">' + (iconSvg[w.type] || '') + ' <span>' + escapeHtml(w.text) + '</span></div>'
        ).join('');
        el.classList.remove('hidden');
    }

    function renderTasks(tasks) {
        const container = $('profileTasksList');
        const badge = $('taskCountBadge');
        if (!container) return;

        const openTasks = tasks.filter(t => t.status !== 'Resolved');

        // Update count badge
        if (badge) {
            badge.textContent = openTasks.length ? openTasks.length : '';
            badge.style.display = openTasks.length ? '' : 'none';
        }

        if (!openTasks.length) {
            container.innerHTML = '<p class="up-empty">No open tasks or issues. Use the compose card above to create one.</p>';
            return;
        }

        container.innerHTML = openTasks.slice(0, 8).map(task => {
            const overdue = task.dueDate ? toDate(task.dueDate)?.getTime?.() < Date.now() : false;
            const created = task.createdAt ? formatDate(task.createdAt) : '';
            const statusColor = getStatusColor(task.status);
            const priorityColor = getPriorityColor(task.priority);
            const typeLabel = task.type ? task.type.charAt(0).toUpperCase() + task.type.slice(1) : 'General';

            return `
                <div class="up-task">
                    <div class="up-task-top">
                        <span class="up-task-type">${escapeHtml(typeLabel)}</span>
                        ${task.priority && task.priority !== 'normal' ? `<span class="up-task-pri" style="color:${priorityColor}">${escapeHtml(task.priority.toUpperCase())}</span>` : ''}
                        ${overdue ? '<span class="up-task-overdue">OVERDUE</span>' : ''}
                    </div>
                    <p class="up-task-text">${escapeHtml(task.text.substring(0, 120))}</p>
                    <div class="up-task-bot">
                        <span class="up-task-date">${escapeHtml(created)}${task.createdBy ? ' &middot; ' + escapeHtml(task.createdBy.split('@')[0]) : ''}</span>
                        <span class="up-task-status" style="background:${statusColor}18;color:${statusColor}">${escapeHtml(task.status)}</span>
                    </div>
                </div>`;
        }).join('');

        if (openTasks.length > 8) {
            container.innerHTML += `<p class="up-task-more">+${openTasks.length - 8} more &mdash; <a href="task-manager.html">view all</a></p>`;
        }
    }

    function getStatusColor(status) {
        return { 'Open': '#ef4444', 'In Progress': '#f59e0b', 'Resolved': '#10b981' }[status] || '#6b7280';
    }

    function getPriorityColor(priority) {
        return { 'urgent': '#dc2626', 'high': '#f59e0b', 'normal': '#6b7280' }[priority] || '#6b7280';
    }

    async function loadTasks() {
        try {
            const result = await FirebaseDB.getTasks(state.user.uid, 'drivers', state.driverId);
            if (result.success) {
                renderTasks(result.data || []);
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            const container = $('profileTasksList');
            if (container) container.innerHTML = '<p class="up-empty" style="color: #dc2626;">Error loading tasks</p>';
        }
    }

    // ── Compose → Task Manager ────────────────
    function bindCompose() {
        // ── Collapsible driver details ──
        const detailsCard = document.getElementById('driverDetailsCard');
        const detailsToggle = document.getElementById('driverDetailsToggle');
        const collapseHint = document.getElementById('collapseHint');
        if (detailsToggle && detailsCard) {
            detailsToggle.addEventListener('click', () => {
                const collapsed = detailsCard.classList.toggle('collapsed');
                detailsToggle.setAttribute('aria-expanded', String(!collapsed));
                if (collapseHint) collapseHint.textContent = collapsed ? 'Show' : 'Hide';
            });
        }

        const textarea = $('dpComposeText');
        const postBtn = $('dpComposePost');
        if (!textarea || !postBtn) return;

        // Auto-resize + enable/disable post button
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
            postBtn.disabled = !textarea.value.trim();
        });

        postBtn.addEventListener('click', postCompose);

        // Set avatar initial
        const avatar = $('dpComposeAvatar');
        if (avatar && state.user) {
            const email = state.user.email || '';
            avatar.textContent = email.charAt(0).toUpperCase() || 'U';
        }
    }

    async function postCompose() {
        const textarea = $('dpComposeText');
        const postBtn = $('dpComposePost');
        const card = textarea.closest('.up-compose');
        const text = textarea.value.trim();
        if (!text) return;

        const type = $('dpComposeType').value || 'general';
        const priority = $('dpComposePriority').value || 'normal';
        const assignTo = $('dpComposeAssign').value || '';

        postBtn.disabled = true;
        postBtn.classList.add('posting');

        try {
            const driverName = state.driver
                ? [state.driver.firstName, state.driver.lastName].filter(Boolean).join(' ')
                : state.driverId;

            // Write a single document to history (serves as both note + task)
            const taskData = {
                text,
                type,
                status: 'Open',
                priority,
                assignedTo: assignTo ? [assignTo] : [],
                dueDate: null,
                createdBy: state.user.email || state.user.uid,
                source: 'driver-profile',
                driverName: driverName,
                createdAtIso: new Date().toISOString()
            };

            const result = await FirebaseDB.createTask(
                state.user.uid, 'drivers', state.driverId, taskData
            );
            if (!result.success) throw new Error(result.error);

            // Clear form
            textarea.value = '';
            textarea.style.height = 'auto';
            $('dpComposeType').value = 'general';
            $('dpComposePriority').value = 'normal';
            $('dpComposeAssign').value = '';
            postBtn.disabled = true;

            // Success flash
            if (card) {
                card.classList.add('posted');
                setTimeout(() => card.classList.remove('posted'), 600);
            }

            // Refresh both feeds
            await Promise.all([loadHistory(), loadTasks()]);
        } catch (err) {
            console.error('postCompose error:', err);
            setAlert('Could not post task. ' + (err.message || ''));
        } finally {
            postBtn.classList.remove('posting');
            postBtn.disabled = !textarea.value.trim();
        }
    }

    async function loadDriver() {
        const doc = await driverRef().get();
        if (!doc.exists) {
            setAlert('This driver could not be found. They may have been removed from the system.');
            $('unitTitle').textContent = 'Driver not found';
            $('unitSubtitle').textContent = 'Return to the dashboard and select another driver.';
            return false;
        }
        state.driver = { id: doc.id, ...doc.data() };
        renderDriver();
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
            .sort((l, r) => {
                const lt = toDate(l.createdAt || l.createdAtIso)?.getTime() || 0;
                const rt = toDate(r.createdAt || r.createdAtIso)?.getTime() || 0;
                return rt - lt;
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
            .sort((l, r) => {
                const lt = toDate(l.createdAt || l.createdAtIso)?.getTime() || 0;
                const rt = toDate(r.createdAt || r.createdAtIso)?.getTime() || 0;
                return rt - lt;
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

    /* ---------- Lightbox ---------- */
    function openLightbox(src) {
        const lb = $('photoLightbox');
        if (!lb) return;
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
        $('photoForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const file = $('photoUpload').files[0];
            const caption = $('photoCaption').value.trim();
            if (!file) {
                setAlert('Select a document or photo to upload.');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                setAlert('File must be smaller than 5 MB.');
                return;
            }
            setAlert('');

            const btn = event.target.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }

            try {
                // Upload to Firebase Storage
                const uid = state.user.uid;
                const ts = Date.now();
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = 'users/' + uid + '/drivers/' + state.driverId + '/docs/' + ts + '_' + safeName;
                const ref = storage.ref(storagePath);
                await ref.put(file);
                const url = await ref.getDownloadURL();

                // Also save base64 to photos subcollection for backward compat
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

    function formatCurrency(v) {
        const n = parseFloat(v) || 0;
        return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    async function loadDriverStats() {
        try {
            const d = state.driver;
            if (!d) return;
            const driverName = [d.firstName, d.lastName].filter(Boolean).join(' ');
            if (!driverName) return;

            // Query loads assigned to this driver
            const snapshot = await col('loads').where('driver', '==', driverName).get();
            const loads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (!loads.length) return;

            // Gross earnings & mileage
            let grossEarnings = 0;
            let totalMiles = 0;
            let totalRate = 0;
            let ratedLoads = 0;

            loads.forEach(l => {
                const rate = parseFloat(l.rate) || 0;
                const det = parseFloat(l.detention) || 0;
                const miles = parseFloat(l.mileage) || 0;
                grossEarnings += rate + det;
                totalMiles += miles;
                if (rate > 0) { totalRate += rate; ratedLoads++; }
            });

            const avgRpm = totalMiles > 0 && grossEarnings > 0 ? (grossEarnings / totalMiles) : 0;
            const avgRate = ratedLoads > 0 ? totalRate / ratedLoads : 0;
            const avgMilesPerLoad = loads.length > 0 ? Math.round(totalMiles / loads.length) : 0;

            // Days on road vs home per month
            // Use loadDate → deliveryDate spans to estimate days on road
            const monthRoad = {}; // { 'YYYY-MM': daysOnRoad }
            const monthTotal = {}; // { 'YYYY-MM': true } tracks which months have data

            loads.forEach(l => {
                const start = l.loadDate ? new Date(l.loadDate) : null;
                const end = l.deliveryDate ? new Date(l.deliveryDate) : null;
                if (!start || isNaN(start.getTime())) return;
                const finish = (end && !isNaN(end.getTime()) && end >= start) ? end : start;
                const days = Math.max(1, Math.round((finish - start) / 86400000) + 1);
                const key = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0');
                monthRoad[key] = (monthRoad[key] || 0) + days;
                monthTotal[key] = true;
            });

            const months = Object.keys(monthTotal);
            let avgDaysRoad = 0;
            let avgDaysHome = 0;
            if (months.length > 0) {
                const totalRoadDays = months.reduce((s, k) => s + (monthRoad[k] || 0), 0);
                avgDaysRoad = Math.round(totalRoadDays / months.length);
                avgDaysHome = Math.max(0, 30 - avgDaysRoad);
            }

            // Render
            const container = $('driverStats');
            if (container) container.style.display = '';
            $('statGrossEarnings').textContent = formatCurrency(grossEarnings);
            $('statLoadCount').textContent = loads.length + ' load' + (loads.length !== 1 ? 's' : '');
            $('statTotalMiles').textContent = totalMiles.toLocaleString() + ' mi';
            $('statAvgMilesLoad').textContent = 'avg ' + avgMilesPerLoad.toLocaleString() + ' mi/load';
            $('statAvgRpm').textContent = avgRpm > 0 ? '$' + avgRpm.toFixed(2) + '/mi' : '-';
            $('statAvgRate').textContent = 'avg rate ' + formatCurrency(avgRate);
            $('statDaysRoad').textContent = avgDaysRoad > 0 ? avgDaysRoad + ' days/mo' : '-';
            $('statDaysHome').textContent = avgDaysHome > 0 ? avgDaysHome + ' days home/mo' : '-';
        } catch (err) {
            console.error('loadDriverStats error:', err);
        }
    }

    async function loadPage() {
        const ok = await loadDriver();
        if (!ok) return;
        await Promise.all([loadHistory(), loadPhotos(), loadDocuments(), loadTasks(), loadDriverStats()]);
        renderDocWarnings();
    }

    function initAuth() {
        firebase.auth().onAuthStateChanged(async user => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }
            state.user = user;
            $('unitUserEmail').textContent = user.email || '';
            state.driverId = new URLSearchParams(window.location.search).get('driver') || '';

            if (!state.driverId) {
                setAlert('No driver was selected. Return to the dashboard and open a driver profile from the Name button.');
                $('unitTitle').textContent = 'No driver selected';
                $('unitSubtitle').textContent = 'A driver id is required in the page URL.';
                return;
            }

            bindForms();
            bindCompose();
            await loadPage();
        });
    }

    function init() {
        initLightbox();
        initAuth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
