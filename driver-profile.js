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
        const list = $('historyList');
        if (!state.history.length) {
            list.innerHTML = '<div class="empty-state">No history yet. Add training completions, inspection results, CDL renewal notes, or any driver activity.</div>';
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

            // Refresh tasks list
            await loadTasks();
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
