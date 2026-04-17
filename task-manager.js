(function () {
    'use strict';

    // ── State ──────────────────────────────
    const state = {
        user: null,
        allTasks: [],
        customStatuses: [],
        filteredTasks: [],
        currentView: localStorage.getItem('taskManagerView') || 'kanban',
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
    async function loadTasks() {
        try {
            const result = await FirebaseDB.getAllTasks(state.user.uid, {
                status: state.filters.status.length > 0 ? state.filters.status : undefined
            });
            
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

        tbody.innerHTML = state.filteredTasks.map(task => {
            const overdue = task.dueDate && isOverdue(task.dueDate);
            const rowClass = overdue ? ' row-overdue' : '';
            const typeClass = task.type ? ` task-type-${task.type}` : '';
            const assigneesText = (task.assignedTo || []).join(', ') || 'Unassigned';

            return `
                <tr class="task-row${rowClass}" data-task-id="${escapeHtml(task.id)}" data-entity-type="${escapeHtml(task.entityType)}" data-entity-id="${escapeHtml(task.entityId)}">
                    <td class="td-due-date">${task.dueDate ? escapeHtml(formatDate(task.dueDate)) : '—'}</td>
                    <td class="td-task">
                        <strong>${escapeHtml(task.text.substring(0, 60))}</strong>
                    </td>
                    <td class="td-entity">${escapeHtml(task.entityName)}</td>
                    <td class="td-type">${task.type ? `<span class="task-type-badge task-type-${escapeHtml(task.type)}">${escapeHtml(task.type)}</span>` : '—'}</td>
                    <td class="td-assigned">${escapeHtml(assigneesText)}</td>
                    <td class="td-status">
                        <span class="status-badge" style="background-color: ${getStatusColor(task.status)}40; color: ${getStatusColor(task.status)}">
                            ${escapeHtml(task.status)}
                        </span>
                    </td>
                    <td class="td-created">${escapeHtml(formatDate(task.createdAt))}</td>
                    <td class="td-actions">
                        <button class="btn-task-view" title="View details">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
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

        $('taskFormModal').classList.add('open');
    }

    function closeTaskForm() {
        $('taskFormModal').classList.remove('open');
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

            // Task row click (table)
            const row = e.target.closest('.task-row');
            if (row && !e.target.closest('button')) {
                const taskId = row.dataset.taskId;
                const task = state.allTasks.find(t => t.id === taskId);
                if (task) showTaskDetail(task);
                return;
            }

            // View details button
            const viewBtn = e.target.closest('.btn-task-view');
            if (viewBtn) {
                const row = viewBtn.closest('.task-row');
                if (row) {
                    const taskId = row.dataset.taskId;
                    const task = state.allTasks.find(t => t.id === taskId);
                    if (task) showTaskDetail(task);
                }
                return;
            }
        });

        // Task detail drawer actions
        document.addEventListener('click', async (e) => {
            // Status change in detail
            const statusSelect = e.target.closest('.task-detail-status-select');
            if (statusSelect) {
                const taskId = statusSelect.dataset.taskId;
                const newStatus = statusSelect.value;
                await changeTaskStatus(taskId, newStatus);
                const task = state.allTasks.find(t => t.id === taskId);
                if (task) showTaskDetail(task);
                return;
            }

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
            await loadCustomStatuses();
            await loadTasks();
            initEventListeners();
        });
    }

    // ── Init ───────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        initAuth();
    });

})();
