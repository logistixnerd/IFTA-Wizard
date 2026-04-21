(function () {
    'use strict';

    const state = {
        user: null,
        trailerId: '',
        trailer: null,
        history: [],
        photos: [],
        documents: []
    };

    function $(id) { return document.getElementById(id); }

    function col(name) {
        return db.collection('users').doc(state.user.uid).collection(name);
    }

    function trailerRef() { return col('trailers').doc(state.trailerId); }
    function historyRef() { return trailerRef().collection('history'); }
    function photoRef() { return trailerRef().collection('photos'); }
    function docRef() { return trailerRef().collection('documents'); }

    function escapeHtml(value) {
        if (value == null) return '';
        const div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
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
    function renderTrailer() {
        const t = state.trailer;
        if (!t) return;
        const unitLabel = t.unit || ('Trailer ' + state.trailerId);
        $('unitTitle').textContent = unitLabel;
        $('unitSubtitle').textContent = [t.year, t.make, t.type].filter(Boolean).join(' ') || 'No make/type details saved yet.';
        $('unitStatusChip').textContent = statusLabel(t.status);
        $('unitTypeChip').textContent = t.type || 'Unknown type';
        $('unitPlateChip').textContent = t.plate ? (t.plateState ? t.plate + ' (' + t.plateState + ')' : t.plate) : 'No plate';

        $('detailUnit').textContent = unitLabel;
        $('detailYear').textContent = t.year || '-';
        $('detailMake').textContent = t.make || '-';
        $('detailType').textContent = t.type || '-';
        $('detailVin').textContent = t.vin || '-';
        $('detailPlate').textContent = t.plate ? (t.plateState ? t.plate + ' (' + t.plateState + ')' : t.plate) : '-';
        $('detailInspExp').textContent = formatShortDate(t.inspExp || t.inspectionExp);
        $('detailRegExp').textContent = formatShortDate(t.regExp || t.registrationExp);
        $('detailInsExp').textContent = formatShortDate(t.insExp || t.insuranceExp);

        // Photo circle
        if (t.photoUrl) {
            const hero = $('heroPhoto');
            hero.innerHTML = '';
            hero.classList.add('has-photo');
            const img = document.createElement('img');
            img.src = t.photoUrl;
            img.alt = unitLabel;
            img.addEventListener('click', () => openLightbox(t.photoUrl));
            hero.appendChild(img);
        }

        document.title = unitLabel + ' - Trailer Profile - IFTA Wizard';
    }

    function renderHistory() {
        $('historyCount').textContent = String(state.history.length);
        const badge = $('noteCountBadge');
        if (badge) badge.textContent = state.history.length ? String(state.history.length) : '';

        const list = $('historyList');
        if (!state.history.length) {
            list.innerHTML = '<p class="up-empty">No history yet. Add the first note or service event for this trailer.</p>';
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
                <img src="${escapeHtml(photo.imageUrl || '')}" alt="${escapeHtml(photo.caption || 'Trailer photo')}" class="up-photo-img" data-lightbox>
                <div class="up-photo-info">
                    <span class="up-photo-caption">${escapeHtml(photo.caption || 'Trailer photo')}</span>
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
            const result = await FirebaseDB.getTasks(state.user.uid, 'trailers', state.trailerId);
            if (result.success) renderTasks(result.data || []);
        } catch (error) {
            console.error('Error loading tasks:', error);
            const container = $('profileTasksList');
            if (container) container.innerHTML = '<p class="up-empty" style="color:#dc2626">Error loading tasks</p>';
        }
    }

    async function loadTrailer() {
        const doc = await trailerRef().get();
        if (!doc.exists) {
            setAlert('This trailer could not be found. It may have been deleted.');
            $('unitTitle').textContent = 'Trailer not found';
            $('unitSubtitle').textContent = 'Return to the dashboard and select another trailer.';
            return false;
        }
        state.trailer = { id: doc.id, ...doc.data() };
        renderTrailer();
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
                const storagePath = 'users/' + uid + '/trailers/' + state.trailerId + '/docs/' + ts + '_' + safeName;
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
        const ok = await loadTrailer();
        if (!ok) return;
        await Promise.all([loadHistory(), loadPhotos(), loadDocuments(), loadTasks()]);
    }

    function initAuth() {
        firebase.auth().onAuthStateChanged(async user => {
            if (!user) { window.location.href = 'index.html'; return; }
            state.user = user;
            $('unitUserEmail').textContent = user.email || '';
            state.trailerId = new URLSearchParams(window.location.search).get('trailer') || '';
            if (!state.trailerId) {
                setAlert('No trailer was selected. Return to the dashboard and open a trailer profile.');
                $('unitTitle').textContent = 'No trailer selected';
                $('unitSubtitle').textContent = 'A trailer id is required in the page URL.';
                return;
            }
            bindForms();
            await loadPage();
        });
    }

    function init() {
        initLightbox();
        initCollapse();
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
        trailerId: '',
        trailer: null,
        history: [],
        photos: []
    };

    function $(id) {
        return document.getElementById(id);
    }

    function col(name) {
        return db.collection('users').doc(state.user.uid).collection(name);
    }

    function trailerRef() {
        return col('trailers').doc(state.trailerId);
    }

    function historyRef() {
        return trailerRef().collection('history');
    }

    function photoRef() {
        return trailerRef().collection('photos');
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

    function renderTrailer() {
        const t = state.trailer;
        if (!t) return;
        const unitLabel = t.unit || ('Trailer ' + state.trailerId);
        $('unitTitle').textContent = unitLabel;
        $('unitSubtitle').textContent = [t.year, t.make, t.type].filter(Boolean).join(' ') || 'No make/type details saved yet.';
        $('unitStatusChip').textContent = statusLabel(t.status);
        $('unitTypeChip').textContent = t.type || 'Unknown type';
        $('unitPlateChip').textContent = t.plate ? (t.plateState ? t.plate + ' (' + t.plateState + ')' : t.plate) : 'No plate';

        $('detailUnit').textContent = unitLabel;
        $('detailYear').textContent = t.year || '-';
        $('detailMake').textContent = t.make || '-';
        $('detailType').textContent = t.type || '-';
        $('detailVin').textContent = t.vin || '-';
        $('detailPlate').textContent = t.plate ? (t.plateState ? t.plate + ' (' + t.plateState + ')' : t.plate) : '-';

        document.title = unitLabel + ' - Trailer Profile - IFTA Wizard';
    }

    function renderHistory() {
        $('historyCount').textContent = String(state.history.length);
        const list = $('historyList');
        if (!state.history.length) {
            list.innerHTML = '<div class="empty-state">No history yet. Add the first note, service update, or inspection record for this trailer.</div>';
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
            grid.innerHTML = '<div class="empty-state">No photos uploaded yet. Add inspection shots, damage photos, registration images, or invoice scans.</div>';
            return;
        }
        grid.innerHTML = state.photos.map(photo => `
            <article class="photo-card">
                <img src="${escapeHtml(photo.imageUrl || '')}" alt="${escapeHtml(photo.caption || 'Trailer photo')}">
                <div class="photo-card-body">
                    <div class="photo-card-head">
                        <strong>${escapeHtml(photo.caption || 'Trailer photo')}</strong>
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
            const result = await FirebaseDB.getTasks(state.user.uid, 'trailers', state.trailerId);
            if (result.success) {
                renderTasks(result.data || []);
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            const container = $('profileTasksList');
            if (container) container.innerHTML = '<p class="empty-state" style="padding: 1rem; margin: 0; color: #dc2626;">Error loading tasks</p>';
        }
    }

    async function loadTrailer() {
        const doc = await trailerRef().get();
        if (!doc.exists) {
            setAlert('This trailer could not be found. It may have been deleted.');
            $('unitTitle').textContent = 'Trailer not found';
            $('unitSubtitle').textContent = 'Return to the dashboard and select another trailer.';
            return false;
        }
        state.trailer = { id: doc.id, ...doc.data() };
        renderTrailer();
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
                const storagePath = 'users/' + uid + '/trailers/' + state.trailerId + '/docs/' + ts + '_' + safeName;
                const ref = storage.ref(storagePath);
                await ref.put(file);
                const url = await ref.getDownloadURL();

                const imageUrl = file.type.startsWith('image/') ? await resizeImage(file, 1600) : null;
                await photoRef().add({
                    caption,
                    imageUrl: imageUrl || url,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAtIso: new Date().toISOString()
                });
                const isImage = file.type.startsWith('image/');
                await docRef().add({
                    name: file.name,
                    type: isImage ? 'photo' : 'other',
                    storagePath,
                    url,
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
        const ok = await loadTrailer();
        if (!ok) return;
        await Promise.all([loadHistory(), loadPhotos(), loadTasks()]);
    }

    function initAuth() {
        firebase.auth().onAuthStateChanged(async user => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }
            state.user = user;
            $('unitUserEmail').textContent = user.email || '';
            state.trailerId = new URLSearchParams(window.location.search).get('trailer') || '';

            if (!state.trailerId) {
                setAlert('No trailer was selected. Return to the dashboard and open a trailer profile from the Unit button.');
                $('unitTitle').textContent = 'No trailer selected';
                $('unitSubtitle').textContent = 'A trailer id is required in the page URL.';
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
