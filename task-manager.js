(function () {
    'use strict';

    // ── State ──────────────────────────────
    const state = {
        user: null,
        allTasks: [],
        customStatuses: [],
        companyUsers: [],
        filteredTasks: [],
        currentView: localStorage.getItem('taskManagerView') || 'table',
        filters: {
            status: [],
            assignedTo: null,
            entityType: '',
            searchQuery: ''
        },
        editingTaskId: null,
        editingTaskEntityType: null,
        editingTaskEntityId: null
    };

    // ── Utilities ──────────────────────────
    function $(id) {
        return document.getElementById(id);
    }

    function col(name) {
        return db.collection('users').doc(state.user.uid).collection(name);
    }

    function escapeHtml(value) {
        if (value == null) return '';
        const div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
    }

    function formatDate(value) {
        if (!value) return 'Unknown';
        const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
        if (Number.isNaN(date.getTime())) return 'Unknown';
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }).format(date);
    }

    function formatDateTime(value) {
        if (!value) return 'Unknown';
        const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
        if (Number.isNaN(date.getTime())) return 'Unknown';
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }).format(date);
    }

    function formatTime(value) {
        if (!value) return '';
        const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
    }

    function getDayCount(dueDate) {
        if (!dueDate) return null;
        const date = typeof dueDate.toDate === 'function' ? dueDate.toDate() : new Date(dueDate);
        if (Number.isNaN(date.getTime())) return null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const due = new Date(date);
        due.setHours(0, 0, 0, 0);
        return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    }

    function isOverdue(dueDate) {
        if (!dueDate) return false;
        const date = typeof dueDate.toDate === 'function' ? dueDate.toDate() : new Date(dueDate);
        return date < new Date() && !Number.isNaN(date.getTime());
    }

    function showMsg(text, isError) {
        const div = document.createElement('div');
        div.textContent = text;
        Object.assign(div.style, {
            position: 'fixed', top: '1rem', right: '1rem', padding: '0.625rem 1.125rem',
            background: isError ? 'rgba(254,226,226,0.95)' : 'rgba(220,252,231,0.95)',
            color: isError ? '#dc2626' : '#16a34a',
            fontSize: '0.8125rem', fontWeight: '600', zIndex: '9999',
            border: '1px solid ' + (isError ? '#fca5a5' : '#86efac'),
            borderRadius: '12px', backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            transform: 'translateY(-8px)', opacity: '0',
            transition: 'all 0.2s ease'
        });
        document.body.appendChild(div);
        requestAnimationFrame(() => { div.style.transform = 'translateY(0)'; div.style.opacity = '1'; });
        setTimeout(() => {
            div.style.transform = 'translateY(-8px)';
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 200);
        }, 2200);
    }

    // ── Load Data ──────────────────────────
    async function loadCompanyUsers() {
        try {
            const doc = await db.collection('users').doc(state.user.uid).get();
            const data = doc.data();
            const users = (data && data.companyDashboard && data.companyDashboard.users) || [];
            state.companyUsers = users.map(u => ({
                name: u.name || '',
                email: (u.email || '').toLowerCase(),
                role: u.role || ''
            })).filter(u => u.email);
            // Ensure current user is in the list
            const myEmail = (state.user.email || '').toLowerCase();
            if (myEmail && !state.companyUsers.some(u => u.email === myEmail)) {
                state.companyUsers.unshift({ name: state.user.displayName || myEmail.split('@')[0], email: myEmail, role: 'Owner' });
            }
        } catch (err) {
            console.error('Error loading company users:', err);
            state.companyUsers = [];
        }
    }

    async function loadTasks() {
        try {
            const result = await FirebaseDB.getAllTasks(state.user.uid);
            
            if (!result.success) throw new Error(result.error);
            
            state.allTasks = result.data || [];
            applyFilters();
            renderView();
        } catch (error) {
            console.error('Error loading tasks:', error);
            showMsg('Error loading tasks', true);
        }
    }

    async function loadCustomStatuses() {
        try {
            const result = await FirebaseDB.getCustomStatuses(state.user.uid);
            if (result.success && result.data) {
                state.customStatuses = result.data;
                populateStatusFilters();
                // Set default filter to show only Open + In Progress
                state.filters.status = state.customStatuses
                    .filter(s => s.name !== 'Resolved')
                    .map(s => s.name);
            } else {
                // Use defaults if not found
                state.customStatuses = [
                    { name: 'Open', color: '#ef4444' },
                    { name: 'In Progress', color: '#f59e0b' },
                    { name: 'Resolved', color: '#10b981' }
                ];
                // Set default filter
                state.filters.status = ['Open', 'In Progress'];
            }
        } catch (error) {
            console.error('Error loading statuses:', error);
        }
    }

    // ── Filter & Sort ──────────────────────
    function applyFilters() {
        state.filteredTasks = state.allTasks.filter(task => {
            // Status filter
            if (state.filters.status.length > 0 && !state.filters.status.includes(task.status)) {
                return false;
            }

            // Assigned to filter
            if (state.filters.assignedTo === 'me') {
                const userEmail = (state.user.email || '').toLowerCase();
                if (!task.assignedTo || !task.assignedTo.some(email => email.toLowerCase() === userEmail)) {
                    return false;
                }
            }

            // Entity type filter
            if (state.filters.entityType && task.entityType !== state.filters.entityType) {
                return false;
            }

            // Search filter
            if (state.filters.searchQuery) {
                const query = state.filters.searchQuery.toLowerCase();
                const searchText = [
                    task.text,
                    task.entityName,
                    (task.createdBy || ''),
                    task.type
                ].join(' ').toLowerCase();

                if (!searchText.includes(query)) {
                    return false;
                }
            }

            return true;
        });

        // Sort by creation date (newest first) by default
        state.filteredTasks.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(a.createdAtIso || 0);
            const bTime = b.createdAt?.toDate?.() || new Date(b.createdAtIso || 0);
            return bTime - aTime;
        });
    }

    function populateStatusFilters() {
        const statusFilter = $('statusFilter');
        if (!statusFilter) return;

        const currentValue = statusFilter.value;
        statusFilter.innerHTML = '<option value="">All</option>';

        state.customStatuses.forEach(status => {
            const option = document.createElement('option');
            option.value = status.name;
            option.textContent = status.name;
            statusFilter.appendChild(option);
        });

        statusFilter.value = currentValue;
    }

    // ── View Rendering ────────────────────
    function renderView() {
        if (state.currentView === 'kanban') {
            renderKanbanView();
        } else {
            renderTableView();
        }
    }

    function renderKanbanView() {
        const board = $('kanbanBoard');
        if (!board) return;

        const columns = {};
        state.customStatuses.forEach(status => {
            columns[status.name] = [];
        });

        state.filteredTasks.forEach(task => {
            if (!columns[task.status]) {
                columns[task.status] = [];
            }
            columns[task.status].push(task);
        });

        board.innerHTML = state.customStatuses.map(status => {
            const tasks = columns[status.name] || [];
            const columnsHtml = tasks.map(task => renderKanbanCard(task)).join('');
            
            return `
                <div class="kanban-column" data-status="${escapeHtml(status.name)}">
                    <div class="kanban-column-header" style="border-left-color: ${escapeHtml(status.color)}">
                        <h3>${escapeHtml(status.name)}</h3>
                        <span class="kanban-column-count">${tasks.length}</span>
                    </div>
                    <div class="kanban-column-cards" data-column-status="${escapeHtml(status.name)}">
                        ${columnsHtml}
                    </div>
                </div>
            `;
        }).join('');

        attachKanbanDragListeners();
    }

    function renderKanbanCard(task) {
        const overdue = task.dueDate && isOverdue(task.dueDate) ? ' task-card-overdue' : '';
        const typeClass = task.type ? ` task-type-${task.type}` : '';
        const dueDate = task.dueDate ? formatDate(task.dueDate) : '';
        
        const assigneesHtml = (task.assignedTo || []).slice(0, 3).map(email => {
            const initials = email.split('@')[0].substring(0, 2).toUpperCase();
            return `<span class="assignee-avatar" title="${escapeHtml(email)}">${escapeHtml(initials)}</span>`;
        }).join('');

        return `
            <div class="task-card${overdue}${typeClass}" data-task-id="${escapeHtml(task.id)}" data-entity-type="${escapeHtml(task.entityType)}" data-entity-id="${escapeHtml(task.entityId)}">
                <div class="task-card-header">
                    <span class="task-entity-badge">${escapeHtml(task.entityType === 'drivers' ? 'Driver' : task.entityType === 'trucks' ? 'Truck' : 'Trailer')}</span>
                    ${task.type ? `<span class="task-type-badge task-type-${escapeHtml(task.type)}">${escapeHtml(task.type)}</span>` : ''}
                </div>
                <div class="task-card-body">
                    <p class="task-card-text">${escapeHtml(task.text.substring(0, 80))}</p>
                    <p class="task-card-entity"><strong>${escapeHtml(task.entityName)}</strong></p>
                </div>
                <div class="task-card-footer">
                    <div class="task-card-assignees">${assigneesHtml}</div>
                    ${dueDate ? `<span class="task-card-due${overdue ? ' overdue' : ''}">${escapeHtml(dueDate)}</span>` : ''}
                </div>
            </div>
        `;
    }

    function renderTableView() {
        const tbody = $('taskTableBody');
        const empty = $('taskTableEmpty');
        if (!tbody) return;

        if (state.filteredTasks.length === 0) {
            tbody.innerHTML = '';
            if (empty) empty.style.display = '';
            return;
        }

        if (empty) empty.style.display = 'none';

        let html = '';
        state.filteredTasks.forEach(task => {
            const overdue = task.dueDate && isOverdue(task.dueDate);
            const rowClass = overdue ? ' row-overdue' : '';
            const days = getDayCount(task.dueDate);
            const commentCount = (task.comments || []).length;

            // Status select options
            const statusOpts = state.customStatuses.map(s =>
                `<option value="${escapeHtml(s.name)}"${s.name === task.status ? ' selected' : ''}>${escapeHtml(s.name)}</option>`
            ).join('');

            // Days badge
            let daysBadge = '<span class="days-na">\u2014</span>';
            if (days !== null) {
                const cls = days < 0 ? 'days-overdue' : days <= 3 ? 'days-warn' : 'days-ok';
                const label = days < 0 ? Math.abs(days) + 'd late' : days === 0 ? 'Today' : days + 'd';
                daysBadge = `<span class="days-badge ${cls}">${label}</span>`;
            }

            // Created
            const createdDate = task.createdAt ? formatDate(task.createdAt) : 'Unknown';
            const createdTime = task.createdAt ? formatTime(task.createdAt) : '';

            // Note truncated
            const noteText = task.text || '';
            const noteTruncated = noteText.length > 50 ? noteText.substring(0, 50) + '\u2026' : noteText;

            // Status color for inline select
            const sColor = getStatusColor(task.status);

            const assignees = task.assignedTo || [];
            const assigneeDisplay = assignees.length > 0
                ? assignees.map(e => { const u = state.companyUsers.find(cu => cu.email === e); return u ? escapeHtml(u.name || u.email) : escapeHtml(e); }).join(', ')
                : '<span class="unassigned-label">Unassigned</span>';

            html += `<tr class="task-row${rowClass}" data-task-id="${escapeHtml(task.id)}" data-entity-type="${escapeHtml(task.entityType)}" data-entity-id="${escapeHtml(task.entityId)}">
                <td class="td-created"><span class="created-date">${escapeHtml(createdDate)}</span><span class="created-time">${escapeHtml(createdTime)}</span></td>
                <td class="td-due-date">${task.dueDate ? escapeHtml(formatDate(task.dueDate)) : '\u2014'}</td>
                <td class="td-days">${daysBadge}</td>
                <td class="td-note"><div class="note-cell" data-task-id="${escapeHtml(task.id)}"><span class="note-preview" title="${escapeHtml(noteText)}">${escapeHtml(noteTruncated)}</span><button class="btn-note-toggle" title="Expand note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></div></td>
                <td class="td-owner">${escapeHtml(task.entityName)}</td>
                <td class="td-assigned"><button class="assignee-trigger" data-task-id="${escapeHtml(task.id)}">${assigneeDisplay}</button></td>
                <td class="td-type">${task.type ? `<span class="task-type-badge task-type-${escapeHtml(task.type)}">${escapeHtml(task.type)}</span>` : '\u2014'}</td>
                <td class="td-status"><select class="inline-status" data-task-id="${escapeHtml(task.id)}" style="background-color:${sColor}18;color:${sColor};border-color:${sColor}40">${statusOpts}</select></td>
                <td class="td-comments"><button class="btn-comments-toggle" data-task-id="${escapeHtml(task.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${commentCount}</span></button></td>
            </tr>`;

            // ── Note expand row ──
            const noteHistory = (task.noteHistory || []).slice().reverse();
            const historyHtml = noteHistory.length > 0
                ? noteHistory.map(h => `<div class="note-history-entry"><div class="note-history-meta">${escapeHtml(h.editedBy || 'Unknown')} \u00b7 ${escapeHtml(formatDateTime(h.editedAt))}</div><div class="note-history-text">${escapeHtml(h.text)}</div></div>`).join('')
                : '<p class="note-history-empty">No previous edits</p>';

            html += `<tr class="task-expand-row" id="noteExpand_${task.id}" style="display:none"><td colspan="9"><div class="expand-note-panel">
                <label class="expand-label">Edit Note</label>
                <textarea class="note-edit-area" data-task-id="${escapeHtml(task.id)}">${escapeHtml(noteText)}</textarea>
                <div class="expand-actions"><button class="btn btn-sm btn-primary btn-save-note" data-task-id="${escapeHtml(task.id)}">Save</button><button class="btn btn-sm btn-secondary btn-cancel-note" data-task-id="${escapeHtml(task.id)}">Cancel</button></div>
                <div class="note-history"><div class="note-history-title">Edit History</div>${historyHtml}</div>
            </div></td></tr>`;

            // ── Comments expand row ──
            const comments = task.comments || [];
            const commentsHtml = comments.length > 0
                ? comments.map(c => `<div class="comment-entry"><div class="comment-meta">${escapeHtml(c.author || 'Unknown')} \u00b7 ${escapeHtml(formatDateTime(c.timestamp))}</div><div class="comment-text">${escapeHtml(c.text)}</div></div>`).join('')
                : '<p class="comments-empty">No comments yet</p>';

            html += `<tr class="task-expand-row" id="commentsExpand_${task.id}" style="display:none"><td colspan="9"><div class="expand-comments-panel">
                <div class="comment-thread">${commentsHtml}</div>
                <div class="comment-add"><input type="text" class="comment-input" data-task-id="${escapeHtml(task.id)}" placeholder="Write a comment\u2026"><button class="btn btn-sm btn-primary btn-post-comment" data-task-id="${escapeHtml(task.id)}">Post</button></div>
            </div></td></tr>`;
        });

        tbody.innerHTML = html;
    }

    function getStatusColor(status) {
        const statusObj = state.customStatuses.find(s => s.name === status);
        return statusObj ? statusObj.color : '#6b7280';
    }

    // ── Task Detail Drawer ─────────────────
    function showTaskDetail(task) {
        const content = $('taskDetailContent');
        if (!content) return;

        const isResolved = task.status === 'Resolved';
        const resolvedSection = isResolved ? `
            <div class="detail-section resolution-info">
                <h4>Resolution</h4>
                <p><strong>Resolved by:</strong> ${escapeHtml(task.resolvedBy || 'Unknown')}</p>
                <p><strong>Resolved at:</strong> ${escapeHtml(formatDateTime(task.resolvedAt))}</p>
                ${task.resolutionNotes ? `<p><strong>Notes:</strong> ${escapeHtml(task.resolutionNotes)}</p>` : ''}
            </div>
        ` : '';

        const statusOptions = state.customStatuses.map(s => 
            `<option value="${escapeHtml(s.name)}"${s.name === task.status ? ' selected' : ''}>${escapeHtml(s.name)}</option>`
        ).join('');

        content.innerHTML = `
            <div class="detail-content">
                <div class="detail-section detail-entity">
                    <h3>${escapeHtml(task.entityName)}</h3>
                    <p class="detail-entity-type">${escapeHtml(task.entityType === 'drivers' ? 'Driver' : task.entityType === 'trucks' ? 'Truck' : 'Trailer')}</p>
                </div>

                <div class="detail-section">
                    <h4>Task Description</h4>
                    <p>${escapeHtml(task.text)}</p>
                </div>

                ${task.type ? `
                    <div class="detail-section">
                        <h4>Type</h4>
                        <span class="task-type-badge task-type-${escapeHtml(task.type)}">${escapeHtml(task.type)}</span>
                    </div>
                ` : ''}

                ${task.assignedTo && task.assignedTo.length > 0 ? `
                    <div class="detail-section">
                        <h4>Assigned To</h4>
                        <ul class="assignee-list">
                            ${(task.assignedTo || []).map(email => `<li>${escapeHtml(email)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                ${task.dueDate ? `
                    <div class="detail-section">
                        <h4>Due Date</h4>
                        <p>${escapeHtml(formatDate(task.dueDate))}</p>
                    </div>
                ` : ''}

                <div class="detail-section">
                    <h4>Status</h4>
                    <select class="form-select task-detail-status-select" data-task-id="${escapeHtml(task.id)}">
                        ${statusOptions}
                    </select>
                </div>

                <div class="detail-section">
                    <h4>Created</h4>
                    <p><strong>By:</strong> ${escapeHtml(task.createdBy || 'Unknown')}</p>
                    <p><strong>At:</strong> ${escapeHtml(formatDateTime(task.createdAt))}</p>
                </div>

                ${resolvedSection}

                <div class="detail-actions">
                    ${!isResolved ? `
                        <button class="btn btn-primary btn-resolve-task" data-task-id="${escapeHtml(task.id)}">Mark Resolved</button>
                    ` : `
                        <button class="btn btn-secondary btn-reopen-task" data-task-id="${escapeHtml(task.id)}">Reopen</button>
                    `}
                    <button class="btn btn-secondary btn-jump-to-entity" data-entity-type="${escapeHtml(task.entityType)}" data-entity-id="${escapeHtml(task.entityId)}">Jump to Profile</button>
                </div>
            </div>
        `;

        $('taskDetailDrawer').classList.add('open');
    }

    function closeTaskDetail() {
        const drawer = $('taskDetailDrawer');
        if (drawer) drawer.classList.remove('open');
    }

    // ── Task Management ───────────────────
    function openTaskForm(prefilledEntity = null) {
        $('taskFormTitle').textContent = 'Add Task';
        $('taskForm').reset();
        state.editingTaskId = null;

        if (prefilledEntity) {
            $('taskEntityType').value = prefilledEntity.type;
            populateEntityDropdown(prefilledEntity.type);
            $('taskEntityId').value = prefilledEntity.id;
        }

        // Reset assignee picker
        $('taskAssignees').value = '';
        renderFormAssigneeTags([]);

        $('taskFormModal').classList.add('open');
    }

    function closeTaskForm() {
        $('taskFormModal').classList.remove('open');
        closeAssigneeDropdown();
    }

    function populateEntityDropdown(entityType) {
        const select = $('taskEntityId');
        if (!select) return;

        select.innerHTML = '<option value="">Loading...</option>';

        if (!entityType) { select.innerHTML = '<option value="">Select...</option>'; return; }

        // Load all entities from Firestore
        db.collection('users').doc(state.user.uid).collection(entityType).get().then(snap => {
            select.innerHTML = '<option value="">Select...</option>';
            snap.forEach(doc => {
                const d = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                if (entityType === 'drivers') {
                    option.textContent = [d.firstName, d.lastName].filter(Boolean).join(' ') || doc.id;
                } else {
                    option.textContent = d.unit || doc.id;
                }
                select.appendChild(option);
            });
        }).catch(err => {
            console.error('Error loading entities:', err);
            select.innerHTML = '<option value="">Error loading</option>';
        });
    }

    async function saveTask() {
        const entityType = $('taskEntityType').value;
        const entityId = $('taskEntityId').value;
        const text = $('taskText').value.trim();
        const type = $('taskType').value || null;
        const assigneesText = $('taskAssignees').value.trim();
        const dueDate = $('taskDueDate').value;
        const status = $('taskStatus').value || 'Open';

        if (!entityType || !entityId || !text) {
            showMsg('Please fill in required fields', true);
            return;
        }

        const assignedTo = assigneesText
            ? assigneesText.split(',').map(e => e.trim().toLowerCase()).filter(e => e)
            : [];

        try {
            const taskData = {
                text,
                type,
                assignedTo,
                dueDate: dueDate || null,
                status,
                createdBy: state.user.email || state.user.uid
            };

            const result = await FirebaseDB.createTask(state.user.uid, entityType, entityId, taskData);
            if (!result.success) throw new Error(result.error);

            closeTaskForm();
            await loadTasks();
            showMsg('Task created successfully');
        } catch (error) {
            console.error('Error creating task:', error);
            showMsg('Error creating task', true);
        }
    }

    async function changeTaskStatus(taskId, newStatus) {
        const task = state.allTasks.find(t => t.id === taskId);
        if (!task) return;

        try {
            const result = await FirebaseDB.updateTaskStatus(state.user.uid, task.entityType, task.entityId, taskId, newStatus);
            if (!result.success) throw new Error(result.error);

            task.status = newStatus;
            applyFilters();
            renderView();
            showMsg('Status updated');
        } catch (error) {
            console.error('Error updating status:', error);
            showMsg('Error updating status', true);
        }
    }

    async function resolveTask(taskId, resolutionNotes) {
        const task = state.allTasks.find(t => t.id === taskId);
        if (!task) return;

        try {
            const result = await FirebaseDB.resolveTask(
                state.user.uid,
                task.entityType,
                task.entityId,
                taskId,
                resolutionNotes,
                state.user.uid
            );
            
            if (!result.success) throw new Error(result.error);

            await loadTasks();
            closeTaskDetail();
            showMsg('Task marked as resolved');
        } catch (error) {
            console.error('Error resolving task:', error);
            showMsg('Error resolving task', true);
        }
    }

    async function reopenTask(taskId) {
        const task = state.allTasks.find(t => t.id === taskId);
        if (!task) return;

        try {
            const result = await FirebaseDB.reopenTask(state.user.uid, task.entityType, task.entityId, taskId);
            if (!result.success) throw new Error(result.error);

            await loadTasks();
            closeTaskDetail();
            showMsg('Task reopened');
        } catch (error) {
            console.error('Error reopening task:', error);
            showMsg('Error reopening task', true);
        }
    }

    // ── Inline Editing ─────────────────────
    async function saveInlineNote(taskId) {
        const task = state.allTasks.find(t => t.id === taskId);
        if (!task) return;
        const textarea = document.querySelector('.note-edit-area[data-task-id="' + taskId + '"]');
        if (!textarea) return;
        const newText = textarea.value.trim();
        if (!newText) { showMsg('Note cannot be empty', true); return; }
        if (newText === task.text) {
            document.getElementById('noteExpand_' + taskId).style.display = 'none';
            return;
        }
        try {
            const result = await FirebaseDB.updateTaskNote(
                state.user.uid, task.entityType, task.entityId, taskId,
                newText, task.text, state.user.email || state.user.uid
            );
            if (!result.success) throw new Error(result.error);
            if (!task.noteHistory) task.noteHistory = [];
            task.noteHistory.push({ text: task.text, editedBy: state.user.email || state.user.uid, editedAt: new Date().toISOString() });
            task.text = newText;
            renderView();
            showMsg('Note updated');
        } catch (err) {
            console.error('Error updating note:', err);
            showMsg('Error updating note', true);
        }
    }

    async function saveInlineAssigned(taskId, newAssignees) {
        const task = state.allTasks.find(t => t.id === taskId);
        if (!task) return;
        const oldStr = (task.assignedTo || []).join(',');
        if (newAssignees.join(',') === oldStr) return;
        try {
            const result = await FirebaseDB.updateTask(
                state.user.uid, task.entityType, task.entityId, taskId,
                { assignedTo: newAssignees }
            );
            if (!result.success) throw new Error(result.error);
            task.assignedTo = newAssignees;
            // Update the trigger button text
            const btn = document.querySelector('.assignee-trigger[data-task-id="' + taskId + '"]');
            if (btn) {
                if (newAssignees.length > 0) {
                    btn.innerHTML = newAssignees.map(e => {
                        const u = state.companyUsers.find(cu => cu.email === e);
                        return escapeHtml(u ? (u.name || u.email) : e);
                    }).join(', ');
                } else {
                    btn.innerHTML = '<span class="unassigned-label">Unassigned</span>';
                }
            }
            showMsg('Assignee updated');
        } catch (err) {
            console.error('Error updating assignee:', err);
            showMsg('Error updating assignee', true);
        }
    }

    // ── Assignee Dropdown ──────────────────
    let activeAssigneeDropdown = null;

    function openAssigneeDropdown(taskId, triggerEl) {
        closeAssigneeDropdown();
        const task = state.allTasks.find(t => t.id === taskId);
        if (!task) return;
        const selected = new Set((task.assignedTo || []).map(e => e.toLowerCase()));

        const dropdown = document.createElement('div');
        dropdown.className = 'assignee-dropdown';
        dropdown.innerHTML = `
            <div class="assignee-dd-search"><input type="text" class="assignee-dd-input" placeholder="Search users\u2026" autocomplete="off"></div>
            <div class="assignee-dd-list"></div>
        `;
        document.body.appendChild(dropdown);
        activeAssigneeDropdown = { el: dropdown, taskId: taskId, selected: selected };

        // Position
        const rect = triggerEl.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.minWidth = Math.max(rect.width, 220) + 'px';

        // Clamp to viewport
        requestAnimationFrame(() => {
            const dRect = dropdown.getBoundingClientRect();
            if (dRect.right > window.innerWidth - 8) dropdown.style.left = Math.max(8, window.innerWidth - dRect.width - 8) + 'px';
            if (dRect.bottom > window.innerHeight - 8) dropdown.style.top = Math.max(8, rect.top - dRect.height - 4) + 'px';
        });

        renderAssigneeOptions('');
        const input = dropdown.querySelector('.assignee-dd-input');
        input.focus();
        input.addEventListener('input', () => renderAssigneeOptions(input.value));
    }

    function renderAssigneeOptions(query) {
        if (!activeAssigneeDropdown) return;
        const { el, selected } = activeAssigneeDropdown;
        const listEl = el.querySelector('.assignee-dd-list');
        const q = query.toLowerCase().trim();
        const filtered = state.companyUsers.filter(u =>
            !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        );
        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="assignee-dd-empty">No users found</div>';
            return;
        }
        listEl.innerHTML = filtered.map(u => {
            const checked = selected.has(u.email) ? ' checked' : '';
            const initials = (u.name || u.email).substring(0, 2).toUpperCase();
            return `<label class="assignee-dd-item${checked ? ' is-selected' : ''}">
                <input type="checkbox" value="${escapeHtml(u.email)}"${checked}>
                <span class="assignee-dd-avatar">${escapeHtml(initials)}</span>
                <span class="assignee-dd-info"><span class="assignee-dd-name">${escapeHtml(u.name || u.email)}</span><span class="assignee-dd-email">${escapeHtml(u.email)}</span></span>
            </label>`;
        }).join('');
    }

    function closeAssigneeDropdown() {
        if (!activeAssigneeDropdown) return;
        const { el, taskId, selected } = activeAssigneeDropdown;
        el.remove();
        if (taskId === '__form__') {
            // Update form hidden input + tags
            const emails = Array.from(selected);
            $('taskAssignees').value = emails.join(',');
            renderFormAssigneeTags(emails);
        } else {
            saveInlineAssigned(taskId, Array.from(selected));
        }
        activeAssigneeDropdown = null;
    }

    function openFormAssigneeDropdown() {
        const trigger = $('formAssigneeTrigger');
        if (!trigger) return;
        const currentVal = ($('taskAssignees').value || '').trim();
        const emails = currentVal ? currentVal.split(',').map(e => e.trim().toLowerCase()).filter(Boolean) : [];
        // Reuse the inline dropdown infrastructure with a pseudo taskId
        closeAssigneeDropdown();
        const selected = new Set(emails);
        const dropdown = document.createElement('div');
        dropdown.className = 'assignee-dropdown';
        dropdown.innerHTML = `
            <div class="assignee-dd-search"><input type="text" class="assignee-dd-input" placeholder="Search users\u2026" autocomplete="off"></div>
            <div class="assignee-dd-list"></div>
        `;
        document.body.appendChild(dropdown);
        activeAssigneeDropdown = { el: dropdown, taskId: '__form__', selected: selected };
        const rect = trigger.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.minWidth = Math.max(rect.width, 220) + 'px';
        requestAnimationFrame(() => {
            const dRect = dropdown.getBoundingClientRect();
            if (dRect.right > window.innerWidth - 8) dropdown.style.left = Math.max(8, window.innerWidth - dRect.width - 8) + 'px';
            if (dRect.bottom > window.innerHeight - 8) dropdown.style.top = Math.max(8, rect.top - dRect.height - 4) + 'px';
        });
        renderAssigneeOptions('');
        const input = dropdown.querySelector('.assignee-dd-input');
        input.focus();
        input.addEventListener('input', () => renderAssigneeOptions(input.value));
    }

    function renderFormAssigneeTags(emails) {
        const container = $('formAssigneeTags');
        if (!container) return;
        if (emails.length === 0) {
            container.innerHTML = '';
            $('formAssigneeTrigger').textContent = 'Select users\u2026';
            return;
        }
        $('formAssigneeTrigger').textContent = emails.length + ' user' + (emails.length > 1 ? 's' : '') + ' selected';
        container.innerHTML = emails.map(e => {
            const u = state.companyUsers.find(cu => cu.email === e);
            return '<span class="assignee-tag">' + escapeHtml(u ? (u.name || u.email) : e) + '</span>';
        }).join('');
    }

    async function postInlineComment(taskId) {
        const task = state.allTasks.find(t => t.id === taskId);
        if (!task) return;
        const input = document.querySelector('.comment-input[data-task-id="' + taskId + '"]');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        const comment = { text: text, author: state.user.email || state.user.uid, timestamp: new Date().toISOString() };
        try {
            const result = await FirebaseDB.addTaskComment(
                state.user.uid, task.entityType, task.entityId, taskId, comment
            );
            if (!result.success) throw new Error(result.error);
            if (!task.comments) task.comments = [];
            task.comments.push(comment);
            renderView();
            // Re-open comments panel after render
            const row = document.getElementById('commentsExpand_' + taskId);
            if (row) row.style.display = '';
            showMsg('Comment added');
        } catch (err) {
            console.error('Error adding comment:', err);
            showMsg('Error adding comment', true);
        }
    }

    // ── Kanban Drag & Drop ─────────────────
    function attachKanbanDragListeners() {
        const cards = document.querySelectorAll('.task-card');
        cards.forEach(card => {
            card.draggable = true;
            card.addEventListener('dragstart', onDragStart);
            card.addEventListener('dragend', onDragEnd);
        });

        const columns = document.querySelectorAll('.kanban-column-cards');
        columns.forEach(column => {
            column.addEventListener('dragover', onDragOver);
            column.addEventListener('drop', onDrop);
            column.addEventListener('dragleave', onDragLeave);
        });
    }

    let draggedCard = null;
    let draggedFrom = null;

    function onDragStart(e) {
        draggedCard = this;
        draggedFrom = this.closest('.kanban-column-cards');
        this.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
    }

    function onDragEnd(e) {
        this.style.opacity = '1';
        document.querySelectorAll('.kanban-column-cards').forEach(col => {
            col.classList.remove('drag-over');
        });
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
    }

    function onDragLeave(e) {
        if (e.target === this) {
            this.classList.remove('drag-over');
        }
    }

    async function onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');

        if (!draggedCard || draggedCard.closest('.kanban-column-cards') === this) return;

        const newStatus = this.dataset.columnStatus;
        const taskId = draggedCard.dataset.taskId;

        await changeTaskStatus(taskId, newStatus);
    }

    // ── Event Listeners ────────────────────
    function initEventListeners() {
        // View toggle
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const view = btn.dataset.view;
                state.currentView = view;
                localStorage.setItem('taskManagerView', view);

                document.querySelectorAll('.task-view-container').forEach(container => {
                    container.classList.remove('active');
                });
                if (view === 'kanban') {
                    document.querySelector('.task-view-kanban').classList.add('active');
                } else {
                    document.querySelector('.task-view-table').classList.add('active');
                }

                renderView();
            });
        });

        // Add task button
        $('addTaskBtn').addEventListener('click', () => openTaskForm());

        // Task form
        $('closeTaskFormModal').addEventListener('click', closeTaskForm);
        $('cancelTaskForm').addEventListener('click', closeTaskForm);
        $('taskForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveTask();
        });

        $('taskEntityType').addEventListener('change', () => {
            const entityType = $('taskEntityType').value;
            if (entityType) populateEntityDropdown(entityType);
        });

        // Form assignee picker
        $('formAssigneeTrigger').addEventListener('click', () => openFormAssigneeDropdown());

        // Task detail drawer
        $('closeTaskDetail').addEventListener('click', closeTaskDetail);

        // Resolution modal
        $('closeResolutionModal').addEventListener('click', () => {
            $('resolutionModal').classList.remove('open');
        });
        $('cancelResolution').addEventListener('click', () => {
            $('resolutionModal').classList.remove('open');
        });

        // Filters
        $('statusFilter').addEventListener('change', () => {
            const val = $('statusFilter').value;
            state.filters.status = val ? [val] : [];
            applyFilters();
            renderView();
        });

        $('assigneeFilter').addEventListener('change', () => {
            state.filters.assignedTo = $('assigneeFilter').value || null;
            applyFilters();
            renderView();
        });

        $('entityTypeFilter').addEventListener('change', () => {
            state.filters.entityType = $('entityTypeFilter').value;
            applyFilters();
            renderView();
        });

        $('taskSearch').addEventListener('input', () => {
            state.filters.searchQuery = $('taskSearch').value;
            applyFilters();
            renderView();
        });

        $('filterToggleButton').addEventListener('click', () => {
            const button = $('filterToggleButton');
            const isShowingResolved = button.classList.toggle('active');
            
            if (isShowingResolved) {
                state.filters.status = [];
                button.textContent = 'All Statuses';
            } else {
                state.filters.status = state.customStatuses
                    .filter(s => s.name !== 'Resolved')
                    .map(s => s.name);
                button.textContent = 'Active Only';
            }
            
            applyFilters();
            renderView();
        });

        // Kanban and table click handlers
        document.addEventListener('click', (e) => {
            // Task card click (kanban)
            const card = e.target.closest('.task-card');
            if (card) {
                const taskId = card.dataset.taskId;
                const task = state.allTasks.find(t => t.id === taskId);
                if (task) showTaskDetail(task);
                return;
            }

            // Note expand toggle
            const noteBtn = e.target.closest('.btn-note-toggle');
            if (noteBtn) {
                const taskId = noteBtn.closest('.note-cell').dataset.taskId;
                const noteRow = document.getElementById('noteExpand_' + taskId);
                const commRow = document.getElementById('commentsExpand_' + taskId);
                if (commRow) commRow.style.display = 'none';
                if (noteRow) noteRow.style.display = noteRow.style.display === 'none' ? '' : 'none';
                return;
            }

            // Save note
            const saveNoteBtn = e.target.closest('.btn-save-note');
            if (saveNoteBtn) { saveInlineNote(saveNoteBtn.dataset.taskId); return; }

            // Cancel note
            const cancelNoteBtn = e.target.closest('.btn-cancel-note');
            if (cancelNoteBtn) {
                const id = cancelNoteBtn.dataset.taskId;
                const task = state.allTasks.find(t => t.id === id);
                const ta = document.querySelector('.note-edit-area[data-task-id="' + id + '"]');
                if (ta && task) ta.value = task.text;
                document.getElementById('noteExpand_' + id).style.display = 'none';
                return;
            }

            // Comments expand toggle
            const commBtn = e.target.closest('.btn-comments-toggle');
            if (commBtn) {
                const taskId = commBtn.dataset.taskId;
                const commRow = document.getElementById('commentsExpand_' + taskId);
                const noteRow = document.getElementById('noteExpand_' + taskId);
                if (noteRow) noteRow.style.display = 'none';
                if (commRow) commRow.style.display = commRow.style.display === 'none' ? '' : 'none';
                return;
            }

            // Post comment
            const postBtn = e.target.closest('.btn-post-comment');
            if (postBtn) { postInlineComment(postBtn.dataset.taskId); return; }

            // Assignee trigger
            const assignBtn = e.target.closest('.assignee-trigger');
            if (assignBtn) { openAssigneeDropdown(assignBtn.dataset.taskId, assignBtn); return; }

            // Close assignee dropdown on outside click
            if (activeAssigneeDropdown && !e.target.closest('.assignee-dropdown') && !e.target.closest('.assignee-trigger')) {
                closeAssigneeDropdown();
            }
        });

        // Assignee dropdown checkbox toggle
        document.addEventListener('change', async (e) => {
            if (activeAssigneeDropdown && e.target.closest('.assignee-dd-item input[type="checkbox"]')) {
                const cb = e.target;
                const email = cb.value.toLowerCase();
                if (cb.checked) {
                    activeAssigneeDropdown.selected.add(email);
                } else {
                    activeAssigneeDropdown.selected.delete(email);
                }
                const item = cb.closest('.assignee-dd-item');
                if (item) item.classList.toggle('is-selected', cb.checked);
                return;
            }

            const sel = e.target.closest('.inline-status');
            if (sel) {
                await changeTaskStatus(sel.dataset.taskId, sel.value);
                const sColor = getStatusColor(sel.value);
                sel.style.backgroundColor = sColor + '18';
                sel.style.color = sColor;
                sel.style.borderColor = sColor + '40';
            }

            // Detail drawer status
            const detailSel = e.target.closest('.task-detail-status-select');
            if (detailSel) {
                await changeTaskStatus(detailSel.dataset.taskId, detailSel.value);
                const task = state.allTasks.find(t => t.id === detailSel.dataset.taskId);
                if (task) showTaskDetail(task);
            }
        });

        // Comment input Enter key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('comment-input')) {
                e.preventDefault();
                postInlineComment(e.target.dataset.taskId);
            }
        });

        // Task detail drawer actions
        document.addEventListener('click', async (e) => {
            // Resolve button
            const resolveBtn = e.target.closest('.btn-resolve-task');
            if (resolveBtn) {
                const taskId = resolveBtn.dataset.taskId;
                $('resolutionForm').dataset.taskId = taskId;
                $('resolutionModal').classList.add('open');
                return;
            }

            // Reopen button
            const reopenBtn = e.target.closest('.btn-reopen-task');
            if (reopenBtn) {
                const taskId = reopenBtn.dataset.taskId;
                if (confirm('Reopen this task?')) {
                    await reopenTask(taskId);
                }
                return;
            }

            // Jump to entity — open dashboard detail panel
            const jumpBtn = e.target.closest('.btn-jump-to-entity');
            if (jumpBtn) {
                const entityType = jumpBtn.dataset.entityType;
                const entityId = jumpBtn.dataset.entityId;
                if (entityType && entityId) {
                    window.open(`dashboard.html?openPanel=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`, '_blank');
                }
                return;
            }
        });

        $('resolutionForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const taskId = $('resolutionForm').dataset.taskId;
            const notes = $('resolutionNotes').value;
            await resolveTask(taskId, notes);
            $('resolutionModal').classList.remove('open');
            $('resolutionForm').reset();
        });
    }

    // ── Auth ───────────────────────────────
    function initAuth() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }
            state.user = user;

            // Sync view toggle buttons with state
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            const activeBtn = document.querySelector(`.toggle-btn[data-view="${state.currentView}"]`);
            if (activeBtn) activeBtn.classList.add('active');
            document.querySelectorAll('.task-view-container').forEach(c => c.classList.remove('active'));
            const activeContainer = document.querySelector(state.currentView === 'kanban' ? '.task-view-kanban' : '.task-view-table');
            if (activeContainer) activeContainer.classList.add('active');

            await loadCustomStatuses();
            await loadCompanyUsers();
            await loadTasks();
            initEventListeners();
        });
    }

    // ── Init ───────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        initAuth();
    });

})();
