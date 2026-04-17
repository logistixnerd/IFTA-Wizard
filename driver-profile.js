(function () {
    'use strict';

    const state = {
        user: null,
        driverId: '',
        driver: null,
        history: [],
        photos: [],
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
        case 'on leave': return 'Home Time';
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
            feed.innerHTML = '<p class="empty-state" style="padding:1.25rem;margin:0;">No activity yet. Use the compose card above to log notes, incidents, or tasks.</p>';
            return;
        }

        feed.innerHTML = state.history.map(item => {
            const typeLabel = (item.type || 'note').charAt(0).toUpperCase() + (item.type || 'note').slice(1);
            const priorityColor = getPriorityColor(item.priority);
            const dateStr = formatDate(item.createdAt || item.createdAtIso);
            const author = item.createdBy ? item.createdBy.split('@')[0] : '';
            const initial = author ? author.charAt(0).toUpperCase() : 'U';

            return `
                <div class="dp-note-item">
                    <div class="dp-note-avatar">${initial}</div>
                    <div class="dp-note-body">
                        <div class="dp-note-header">
                            <span class="dp-note-type">${escapeHtml(typeLabel)}</span>
                            ${item.priority && item.priority !== 'normal' ? `<span class="dp-note-priority" style="color:${priorityColor}">${escapeHtml(item.priority.toUpperCase())}</span>` : ''}
                            <span class="dp-note-date">${escapeHtml(dateStr)}</span>
                        </div>
                        <p class="dp-note-text">${escapeHtml(item.text || '')}</p>
                        ${author ? `<span class="dp-note-author">${escapeHtml(author)}</span>` : ''}
                    </div>
                    <button type="button" class="dp-note-delete" data-delete-note="${escapeHtml(item.id)}" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
            grid.innerHTML = '<div class="empty-state">No documents uploaded yet. Add CDL scans, medical card photos, training certificates, or other driver documents.</div>';
            return;
        }
        grid.innerHTML = state.photos.map(photo => `
            <article class="photo-card">
                <img src="${escapeHtml(photo.imageUrl || '')}" alt="${escapeHtml(photo.caption || 'Driver document')}">
                <div class="photo-card-body">
                    <div class="photo-card-head">
                        <strong>${escapeHtml(photo.caption || 'Driver document')}</strong>
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
                if (!photoId || !confirm('Delete this document?')) return;
                await photoRef().doc(photoId).delete();
                await loadPhotos();
            });
        });
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
            container.innerHTML = '<p class="empty-state" style="padding:1.25rem;margin:0;">No open tasks or issues. Use the compose card above to create one.</p>';
            return;
        }

        container.innerHTML = openTasks.slice(0, 8).map(task => {
            const overdue = task.dueDate ? toDate(task.dueDate)?.getTime?.() < Date.now() : false;
            const created = task.createdAt ? formatDate(task.createdAt) : '';
            const statusColor = getStatusColor(task.status);
            const priorityColor = getPriorityColor(task.priority);
            const typeLabel = task.type ? task.type.charAt(0).toUpperCase() + task.type.slice(1) : 'General';

            return `
                <div class="dp-task-item">
                    <div class="dp-task-item-top">
                        <span class="dp-task-type">${escapeHtml(typeLabel)}</span>
                        ${task.priority && task.priority !== 'normal' ? `<span class="dp-task-priority" style="color:${priorityColor}">${escapeHtml(task.priority.toUpperCase())}</span>` : ''}
                        ${overdue ? '<span class="dp-task-overdue">OVERDUE</span>' : ''}
                    </div>
                    <p class="dp-task-text">${escapeHtml(task.text.substring(0, 120))}</p>
                    <div class="dp-task-item-bottom">
                        <span class="dp-task-meta">${escapeHtml(created)}${task.createdBy ? ' &middot; ' + escapeHtml(task.createdBy.split('@')[0]) : ''}</span>
                        <span class="dp-task-status" style="background:${statusColor}18;color:${statusColor}">${escapeHtml(task.status)}</span>
                    </div>
                </div>`;
        }).join('');

        if (openTasks.length > 8) {
            container.innerHTML += `<p class="dp-task-more">+${openTasks.length - 8} more &mdash; <a href="task-manager.html">view all</a></p>`;
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
            if (container) container.innerHTML = '<p class="empty-state" style="padding: 1rem; margin: 0; color: #dc2626;">Error loading tasks</p>';
        }
    }

    // ── Compose → Task Manager ────────────────
    function bindCompose() {
        // ── Collapsible driver details ──
        const detailsCard = document.getElementById('driverDetailsCard');
        const detailsToggle = document.getElementById('driverDetailsToggle');
        if (detailsToggle && detailsCard) {
            detailsToggle.addEventListener('click', () => {
                const collapsed = detailsCard.classList.toggle('collapsed');
                detailsToggle.setAttribute('aria-expanded', String(!collapsed));
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
        const card = textarea.closest('.dp-compose-card');
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

            // 1. Save to history (note engine feed)
            await historyRef().add({
                type,
                text,
                priority,
                assignedTo: assignTo || '',
                createdBy: state.user.email || state.user.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdAtIso: new Date().toISOString()
            });

            // 2. Also create a task for trackable items
            const taskData = {
                text,
                type,
                status: 'Open',
                priority,
                assignedTo: assignTo ? [assignTo] : [],
                dueDate: null,
                createdBy: state.user.email || state.user.uid,
                source: 'driver-profile',
                driverName: driverName
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
        const ok = await loadDriver();
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
        initAuth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
