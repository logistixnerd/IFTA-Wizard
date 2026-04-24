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
            const imageUrl = await resizeImage(file, 1600);
            await photoRef().add({
                caption,
                imageUrl,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdAtIso: new Date().toISOString()
            });
            $('photoForm').reset();
            await loadPhotos();
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
                window.location.href = 'dashboard.html';
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
