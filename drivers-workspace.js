(function () {
    'use strict';

    const SECTIONS = ['overview', 'assignments', 'hiring', 'hiring-pipeline', 'onboarding'];
    const DOC_TYPES = [
        { key: 'cdl', label: 'CDL', required: true, hasExpiry: true },
        { key: 'medical-card', label: 'Medical Card', required: true, hasExpiry: true },
        { key: 'contract', label: 'Contract', required: true, hasExpiry: false },
        { key: 'mvr', label: 'MVR', required: true, hasExpiry: true },
        { key: 'psp', label: 'PSP', required: true, hasExpiry: true },
        { key: 'photos', label: 'Photos', required: true, hasExpiry: false },
        { key: 'other', label: 'Other', required: false, hasExpiry: false }
    ];

    const state = {
        user: null,
        section: 'overview',
        drivers: [],
        trucks: [],
        driverDocuments: {},
        activeDriverId: null,
        pendingUpload: null
    };

    function $(id) {
        return document.getElementById(id);
    }

    function userCol(name) {
        return db.collection('users').doc(state.user.uid).collection(name);
    }

    function escapeHtml(value) {
        if (value == null) return '';
        const el = document.createElement('div');
        el.textContent = String(value);
        return el.innerHTML;
    }

    function fmtDate(v) {
        if (!v) return '—';
        const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v);
        if (Number.isNaN(d.getTime())) return '—';
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
    }

    function badge(status) {
        if (!status) return '';
        const cls = status.toLowerCase().replace(/\s+/g, '-');
        return '<span class="dw-badge ' + escapeHtml(cls) + '">' + escapeHtml(status) + '</span>';
    }

    function docTypeLabel(typeKey) {
        const match = DOC_TYPES.find(function (item) { return item.key === String(typeKey || '').toLowerCase(); });
        return match ? match.label : (typeKey || 'Other');
    }

    function toDate(value) {
        if (!value) return null;
        if (typeof value.toDate === 'function') return value.toDate();
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function isExpired(value) {
        const d = toDate(value);
        if (!d) return false;
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        return end.getTime() < Date.now();
    }

    function storageRef(path) {
        return firebase.storage().ref(path);
    }

    function isAuthDenied(error) {
        const code = String((error && error.code) || '').toLowerCase();
        return code.includes('permission-denied') || code.includes('unauthorized') || code.includes('unauthenticated');
    }

    function fileNameSafe(name) {
        return String(name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    function docsCol(driverId) {
        return userCol('drivers').doc(driverId).collection('documents');
    }

    function truckLabel(truckId) {
        if (!truckId) return '—';
        const t = state.trucks.find(function (tk) { return tk.id === truckId; });
        return t ? (t.name || t.unitNumber || t.truckNumber || truckId) : truckId;
    }

    /* ── Data loading ──────────────────────────────────────── */

    async function loadDrivers() {
        try {
            const snap = await userCol('drivers').orderBy('lastName').get();
            state.drivers = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        } catch (e) {
            state.drivers = [];
        }
    }

    async function loadTrucks() {
        try {
            const snap = await userCol('trucks').get();
            state.trucks = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        } catch (e) {
            state.trucks = [];
        }
    }

    async function loadDriverDocuments(driverId) {
        try {
            const snap = await docsCol(driverId).orderBy('uploadedAt', 'desc').get();
            state.driverDocuments[driverId] = snap.docs.map(function (doc) {
                return Object.assign({ id: doc.id }, doc.data());
            });
        } catch (e) {
            state.driverDocuments[driverId] = [];
            if (isAuthDenied(e)) {
                showPanelMessage('Access denied while loading driver documents.', 'error');
            }
        }
    }

    async function loadAllDriverDocuments() {
        const tasks = state.drivers.map(function (driver) {
            return loadDriverDocuments(driver.id);
        });
        await Promise.all(tasks);
    }

    async function refreshData() {
        await Promise.all([loadDrivers(), loadTrucks()]);
        await loadAllDriverDocuments();
        renderSummaryCards();
        renderCurrentSection();

        if (state.activeDriverId) {
            renderDriverDocsPanel(state.activeDriverId);
        }
    }

    /* ── Summary cards ─────────────────────────────────────── */

    function renderSummaryCards() {
        const drivers = state.drivers;
        const total = drivers.length;
        const active = drivers.filter(function (d) { return String(d.status || '').toLowerCase() === 'active'; }).length;
        const dnd = drivers.filter(function (d) { return d.doNotDispatch; }).length;
        const hiring = drivers.filter(function (d) { return String(d.hiringStatus || '').toLowerCase() !== ''; }).length;
        const expiringSoon = drivers.filter(function (d) {
            if (!d.cdlExp) return false;
            const exp = new Date(d.cdlExp);
            const days = (exp - Date.now()) / 86400000;
            return days > 0 && days < 60;
        }).length;

        $('dsTotal').textContent = String(total);
        $('dsActive').textContent = String(active);
        $('dsDnd').textContent = String(dnd);
        $('dsHiring').textContent = String(hiring);
        $('dsExpiring').textContent = String(expiringSoon);
    }

    /* ── Section switching ─────────────────────────────────── */

    function showSection(sectionId) {
        if (!SECTIONS.includes(sectionId)) sectionId = 'overview';
        state.section = sectionId;

        SECTIONS.forEach(function (s) {
            const el = $('section-' + s);
            if (el) el.classList.toggle('active', s === sectionId);
        });

        document.querySelectorAll('.drivers-nav-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.section === sectionId);
        });

        const url = new URL(window.location.href);
        url.searchParams.set('section', sectionId);
        window.history.replaceState(null, '', url.toString());

        renderCurrentSection();
    }

    function renderCurrentSection() {
        switch (state.section) {
            case 'overview':       renderOverview();      break;
            case 'assignments':    renderAssignments();   break;
            case 'hiring':         renderHiring();        break;
            case 'hiring-pipeline': renderPipeline();     break;
            case 'onboarding':     renderOnboarding();    break;
        }
    }

    /* ── Overview ──────────────────────────────────────────── */

    function renderOverview() {
        const tbody = $('overviewTableBody');
        if (!tbody) return;
        const query = ($('overviewSearch').value || '').trim().toLowerCase();
        const drivers = query
            ? state.drivers.filter(function (d) {
                return [d.firstName, d.lastName, d.cdl, d.phone, d.email, d.status]
                    .filter(Boolean).join(' ').toLowerCase().includes(query);
            })
            : state.drivers;

        if (!drivers.length) {
            $('overviewTableWrap').style.display = 'none';
            $('overviewEmpty').style.display = '';
            return;
        }
        $('overviewEmpty').style.display = 'none';
        $('overviewTableWrap').style.display = '';

        tbody.innerHTML = drivers.map(function (d) {
            const docStatus = getDriverDocStatus(d.id);
            return '<tr' + (d.doNotDispatch ? ' class="row-dnd"' : '') + '>' +
                '<td><strong>' + escapeHtml(d.firstName || '') + ' ' + escapeHtml(d.lastName || '') + '</strong>' +
                    (d.doNotDispatch ? ' <span class="dw-badge dnd" style="font-size:0.58rem;padding:0.08rem 0.35rem">DND</span>' : '') + '</td>' +
                '<td>' + escapeHtml(d.cdl || '—') + '</td>' +
                '<td>' + escapeHtml(d.cdlState || '—') + '</td>' +
                '<td>' + escapeHtml(fmtDate(d.cdlExp)) + '</td>' +
                '<td>' + escapeHtml(d.phone || '—') + '</td>' +
                '<td>' + escapeHtml(d.email || '—') + '</td>' +
                '<td>' + escapeHtml(truckLabel(d.truck)) + '</td>' +
                '<td>' + badge(d.status || 'active') + '</td>' +
                '<td>' + renderDocIndicator(d.id, docStatus) + '</td>' +
            '</tr>';
        }).join('');

        tbody.querySelectorAll('[data-doc-driver-id]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openDriverDocsPanel(btn.getAttribute('data-doc-driver-id'));
            });
        });
    }

    function renderDocIndicator(driverId, docStatus) {
        const cls = docStatus.expiredCount > 0 ? 'expired' : (docStatus.missingCount > 0 ? 'warning' : '');
        const warningText = [];
        if (docStatus.missingCount > 0) warningText.push(docStatus.missingCount + ' missing');
        if (docStatus.expiredCount > 0) warningText.push(docStatus.expiredCount + ' expired');
        const hint = warningText.length ? (' · ' + warningText.join(', ')) : '';
        return '<button type="button" class="dw-doc-indicator ' + cls + '" data-doc-driver-id="' + escapeHtml(driverId) + '" title="Manage documents">' +
            '<span>📄</span><span>' + docStatus.count + hint + '</span>' +
            '</button>';
    }

    function getDriverDocStatus(driverId) {
        const docs = state.driverDocuments[driverId] || [];
        const byType = {};
        docs.forEach(function (doc) {
            const t = String(doc.type || 'other').toLowerCase();
            byType[t] = byType[t] || [];
            byType[t].push(doc);
        });

        const missingTypes = DOC_TYPES
            .filter(function (t) { return t.required; })
            .filter(function (t) { return !byType[t.key] || byType[t.key].length === 0; })
            .map(function (t) { return t.label; });

        const expiredDocs = docs.filter(function (doc) { return isExpired(doc.expiresAt); });

        return {
            count: docs.length,
            missingCount: missingTypes.length,
            missingTypes: missingTypes,
            expiredCount: expiredDocs.length,
            expiredDocs: expiredDocs
        };
    }

    /* ── Assignments ───────────────────────────────────────── */

    function renderAssignments() {
        const tbody = $('assignmentsTableBody');
        if (!tbody) return;
        const assigned = state.drivers.filter(function (d) { return d.truck; });

        if (!assigned.length) {
            $('assignmentsTableWrap').style.display = 'none';
            $('assignmentsEmpty').style.display = '';
            return;
        }
        $('assignmentsEmpty').style.display = 'none';
        $('assignmentsTableWrap').style.display = '';

        tbody.innerHTML = assigned.map(function (d) {
            return '<tr>' +
                '<td><strong>' + escapeHtml(d.firstName || '') + ' ' + escapeHtml(d.lastName || '') + '</strong></td>' +
                '<td>' + escapeHtml(truckLabel(d.truck)) + '</td>' +
                '<td>' + badge(d.status || 'active') + '</td>' +
                '<td>' + escapeHtml(d.phone || '—') + '</td>' +
            '</tr>';
        }).join('');
    }

    /* ── Hiring ────────────────────────────────────────────── */

    function renderHiring() {
        const list = $('hiringList');
        if (!list) return;
        const candidates = state.drivers.filter(function (d) {
            return d.hiringStatus || String(d.status || '').toLowerCase() === 'applicant';
        });

        if (!candidates.length) {
            list.innerHTML = '<div class="dw-empty">No active hiring candidates.</div>';
            return;
        }

        list.innerHTML = candidates.map(function (d) {
            return '<div class="dw-item">' +
                '<div class="dw-item-main">' +
                    '<div class="dw-item-title">' + escapeHtml(d.firstName || '') + ' ' + escapeHtml(d.lastName || '') + '</div>' +
                    '<div class="dw-item-sub">' + escapeHtml(d.email || '—') + ' · CDL: ' + escapeHtml(d.cdl || '—') + '</div>' +
                '</div>' +
                badge(d.hiringStatus || d.status || 'applicant') +
            '</div>';
        }).join('');
    }

    /* ── Pipeline ──────────────────────────────────────────── */

    function renderPipeline() {
        const container = $('pipelineKanban');
        if (!container) return;

        const stages = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
        const buckets = {};
        stages.forEach(function (s) { buckets[s] = []; });

        state.drivers.forEach(function (d) {
            const stage = d.pipelineStage || (d.hiringStatus ? capitalize(d.hiringStatus) : null);
            if (stage && buckets[stage] !== undefined) {
                buckets[stage].push(d);
            } else if (d.hiringStatus || String(d.status || '').toLowerCase() === 'applicant') {
                buckets['Applied'].push(d);
            }
        });

        container.innerHTML = stages.map(function (stage) {
            const cards = buckets[stage];
            return '<div class="dw-kanban-col">' +
                '<div class="dw-kanban-col-header">' + escapeHtml(stage) + ' <span style="font-weight:400;font-size:0.65rem;color:var(--gray-400)">(' + cards.length + ')</span></div>' +
                (cards.length
                    ? cards.map(function (d) {
                        return '<div class="dw-kanban-card">' + escapeHtml(d.firstName || '') + ' ' + escapeHtml(d.lastName || '') + '</div>';
                    }).join('')
                    : '<div style="font-size:0.65rem;color:var(--gray-400);padding:0.35rem 0">Empty</div>'
                ) +
            '</div>';
        }).join('');
    }

    /* ── Onboarding ────────────────────────────────────────── */

    function renderOnboarding() {
        const list = $('onboardingList');
        if (!list) return;
        const onboarding = state.drivers.filter(function (d) {
            return String(d.onboardingStatus || d.status || '').toLowerCase().includes('onboard');
        });

        if (!onboarding.length) {
            list.innerHTML = '<div class="dw-empty">No drivers currently in onboarding.</div>';
            return;
        }

        list.innerHTML = onboarding.map(function (d) {
            const steps = Array.isArray(d.onboardingSteps) ? d.onboardingSteps : [];
            const done = steps.filter(function (s) { return s && s.complete; }).length;
            const total = steps.length || '—';
            return '<div class="dw-item">' +
                '<div class="dw-item-main">' +
                    '<div class="dw-item-title">' + escapeHtml(d.firstName || '') + ' ' + escapeHtml(d.lastName || '') + '</div>' +
                    '<div class="dw-item-sub">Steps: ' + escapeHtml(String(done)) + '/' + escapeHtml(String(total)) + ' · Started: ' + fmtDate(d.onboardingStart || d.createdAt) + '</div>' +
                '</div>' +
                badge(d.onboardingStatus || 'in-progress') +
            '</div>';
        }).join('');
    }

    /* ── Helpers ───────────────────────────────────────────── */

    function capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    function getDriverById(id) {
        return state.drivers.find(function (d) { return d.id === id; }) || null;
    }

    function formatFileMeta(doc) {
        const bits = [];
        if (doc.uploadedAt) bits.push('Uploaded ' + fmtDate(doc.uploadedAt));
        if (doc.expiresAt) bits.push('Expires ' + fmtDate(doc.expiresAt));
        if (doc.uploadedBy) bits.push('By ' + doc.uploadedBy);
        return bits.length ? bits.join(' · ') : 'No metadata';
    }

    function renderDriverDocsPanel(driverId) {
        const panel = $('driverDocsPanel');
        const typesEl = $('driverDocsTypes');
        if (!panel || !typesEl) return;

        const driver = getDriverById(driverId);
        if (!driver) return;

        state.activeDriverId = driverId;
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');

        $('driverDocsTitle').textContent = (driver.firstName || '') + ' ' + (driver.lastName || '') + ' - Documents';
        $('driverDocsSubtitle').textContent = 'Upload, replace, download, and delete files by type.';

        renderDriverWarnings(driverId);

        const docs = state.driverDocuments[driverId] || [];
        typesEl.innerHTML = DOC_TYPES.map(function (type) {
            const docsForType = docs.filter(function (doc) {
                return String(doc.type || '').toLowerCase() === type.key;
            });

            return '<article class="dw-doc-type-card">' +
                '<div class="dw-doc-type-head">' +
                    '<h4>' + escapeHtml(type.label) + (type.required ? ' <span style="font-size:0.6rem;color:#b45309">required</span>' : '') + '</h4>' +
                    '<div class="dw-doc-type-actions">' +
                        (type.hasExpiry
                            ? '<input type="date" class="dw-doc-type-expires" id="doc-expiry-' + escapeHtml(type.key) + '" title="Expiration date">'
                            : ''
                        ) +
                        '<button type="button" class="dw-mini-btn dw-doc-upload" data-doc-type="' + escapeHtml(type.key) + '">Upload</button>' +
                    '</div>' +
                '</div>' +
                '<div class="dw-doc-file-list">' +
                    renderDocsForTypeRows(type, docsForType) +
                '</div>' +
            '</article>';
        }).join('');

        typesEl.querySelectorAll('.dw-doc-upload').forEach(function (btn) {
            btn.addEventListener('click', function () {
                beginFilePicker(btn.getAttribute('data-doc-type'), null);
            });
        });

        typesEl.querySelectorAll('.dw-doc-replace').forEach(function (btn) {
            btn.addEventListener('click', function () {
                beginFilePicker(btn.getAttribute('data-doc-type'), btn.getAttribute('data-doc-id'));
            });
        });

        typesEl.querySelectorAll('.dw-doc-delete').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                const id = btn.getAttribute('data-doc-id');
                await deleteDocument(driverId, id);
            });
        });

        typesEl.querySelectorAll('.dw-doc-view').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const url = btn.getAttribute('data-doc-url');
                if (url) window.open(url, '_blank', 'noopener');
            });
        });
    }

    function renderDocsForTypeRows(type, docsForType) {
        if (!docsForType.length) {
            return '<p class="dw-doc-type-empty">No files uploaded.</p>';
        }

        return docsForType.map(function (doc) {
            const expired = isExpired(doc.expiresAt);
            return '<div class="dw-doc-file-row"' + (expired ? ' style="border-color:rgba(220,38,38,0.35);"' : '') + '>' +
                '<div class="dw-doc-file-name">' + escapeHtml(doc.filename || 'Unnamed file') + (expired ? ' <span style="color:#b91c1c">(expired)</span>' : '') + '</div>' +
                '<div class="dw-doc-file-meta">' + escapeHtml(formatFileMeta(doc)) + '</div>' +
                '<div class="dw-doc-file-actions">' +
                    '<button type="button" class="dw-mini-btn dw-doc-view" data-doc-url="' + escapeHtml(doc.downloadURL || '') + '">View</button>' +
                    '<button type="button" class="dw-mini-btn dw-doc-replace" data-doc-id="' + escapeHtml(doc.id) + '" data-doc-type="' + escapeHtml(type.key) + '">Replace</button>' +
                    '<button type="button" class="dw-mini-btn danger dw-doc-delete" data-doc-id="' + escapeHtml(doc.id) + '">Delete</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function renderDriverWarnings(driverId) {
        const warningsEl = $('driverDocsWarnings');
        if (!warningsEl) return;
        const status = getDriverDocStatus(driverId);
        const blocks = [];

        if (status.missingTypes.length) {
            blocks.push('<div class="dw-doc-warning missing">Missing required documents: ' + escapeHtml(status.missingTypes.join(', ')) + '.</div>');
        }
        if (status.expiredDocs.length) {
            const names = status.expiredDocs.slice(0, 4).map(function (d) {
                return docTypeLabel(d.type) + ' (' + (d.filename || 'file') + ')';
            });
            blocks.push('<div class="dw-doc-warning expired">Expired documents: ' + escapeHtml(names.join(', ')) + (status.expiredDocs.length > 4 ? ' and more.' : '.') + '</div>');
        }

        warningsEl.innerHTML = blocks.join('');
    }

    function closeDriverDocsPanel() {
        const panel = $('driverDocsPanel');
        if (!panel) return;
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        state.activeDriverId = null;
        showPanelMessage('', 'info');
    }

    function showPanelMessage(message, type) {
        const el = $('driverDocsMessage');
        if (!el) return;
        if (!message) {
            el.className = 'dw-docs-message';
            el.textContent = '';
            return;
        }
        el.className = 'dw-docs-message ' + (type || 'info');
        el.textContent = message;
    }

    function beginFilePicker(typeKey, replaceDocId) {
        const input = $('driverDocFileInput');
        if (!input || !state.activeDriverId) return;
        state.pendingUpload = {
            type: typeKey,
            replaceDocId: replaceDocId || null
        };
        input.value = '';
        input.click();
    }

    function normalizeExpiresAt(typeKey) {
        const el = $('doc-expiry-' + typeKey);
        if (!el || !el.value) return null;
        return firebase.firestore.Timestamp.fromDate(new Date(el.value + 'T23:59:59'));
    }

    async function uploadDocument(driverId, typeKey, file, replaceDocId) {
        if (!file) return;
        if (!firebase.storage) {
            showPanelMessage('Storage SDK is not available in this page.', 'error');
            return;
        }

        showPanelMessage('Uploading file...', 'info');
        const docs = state.driverDocuments[driverId] || [];
        const existing = replaceDocId
            ? docs.find(function (d) { return d.id === replaceDocId; })
            : null;

        const now = Date.now();
        const path = 'users/' + state.user.uid + '/drivers/' + driverId + '/documents/' + typeKey + '/' + now + '_' + fileNameSafe(file.name);
        const uploadTask = await storageRef(path).put(file);
        const downloadURL = await uploadTask.ref.getDownloadURL();

        const metadata = {
            type: typeKey,
            filename: file.name,
            storagePath: path,
            downloadURL: downloadURL,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            uploadedBy: state.user.uid,
            expiresAt: normalizeExpiresAt(typeKey)
        };

        if (replaceDocId) {
            await docsCol(driverId).doc(replaceDocId).set(metadata, { merge: true });
            if (existing && existing.storagePath) {
                try {
                    await storageRef(existing.storagePath).delete();
                } catch (cleanupError) {
                    console.warn('Old document cleanup failed:', cleanupError);
                }
            }
            showPanelMessage('Document replaced successfully.', 'info');
        } else {
            await docsCol(driverId).add(metadata);
            showPanelMessage('Document uploaded successfully.', 'info');
        }

        await loadDriverDocuments(driverId);
        renderOverview();
        renderDriverDocsPanel(driverId);
    }

    async function deleteDocument(driverId, docId) {
        const docs = state.driverDocuments[driverId] || [];
        const target = docs.find(function (d) { return d.id === docId; });
        if (!target) return;

        if (!window.confirm('Delete this document? This action cannot be undone.')) return;

        try {
            if (target.storagePath) {
                await storageRef(target.storagePath).delete();
            }
        } catch (storageErr) {
            if (!isAuthDenied(storageErr)) {
                console.warn('Storage delete warning:', storageErr);
            }
        }

        await docsCol(driverId).doc(docId).delete();
        showPanelMessage('Document deleted.', 'info');
        await loadDriverDocuments(driverId);
        renderOverview();
        renderDriverDocsPanel(driverId);
    }

    /* ── Event bindings ────────────────────────────────────── */

    function bindEvents() {
        document.querySelectorAll('.drivers-nav-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                showSection(tab.dataset.section);
            });
        });

        const overviewSearch = $('overviewSearch');
        if (overviewSearch) {
            overviewSearch.addEventListener('input', function () { renderOverview(); });
        }

        const refreshBtn = $('refreshDriversBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () { refreshData(); });
        }

        const closePanelBtn = $('closeDriverDocsPanel');
        if (closePanelBtn) {
            closePanelBtn.addEventListener('click', function () {
                closeDriverDocsPanel();
            });
        }

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'driverDocFileInput';
        fileInput.className = 'hidden';
        fileInput.addEventListener('change', async function (event) {
            const file = event.target.files && event.target.files[0];
            if (!file || !state.pendingUpload || !state.activeDriverId) return;

            try {
                await uploadDocument(state.activeDriverId, state.pendingUpload.type, file, state.pendingUpload.replaceDocId);
            } catch (err) {
                console.error('Document upload error:', err);
                if (isAuthDenied(err)) {
                    showPanelMessage('Access denied for document operation. Check your authentication and rules.', 'error');
                } else {
                    showPanelMessage('Document operation failed. Please retry.', 'error');
                }
            } finally {
                state.pendingUpload = null;
                fileInput.value = '';
            }
        });
        document.body.appendChild(fileInput);
    }

    async function openDriverDocsPanel(driverId) {
        try {
            await loadDriverDocuments(driverId);
            renderOverview();
            renderDriverDocsPanel(driverId);
        } catch (err) {
            console.error('Open docs panel failed:', err);
            if (isAuthDenied(err)) {
                showPanelMessage('Access denied for this driver documents panel.', 'error');
            } else {
                showPanelMessage('Unable to load documents for this driver.', 'error');
            }
        }
    }

    /* ── Init ──────────────────────────────────────────────── */

    function init() {
        firebase.auth().onAuthStateChanged(async function (user) {
            if (!user) {
                window.location.href = 'dashboard.html';
                return;
            }
            state.user = user;
            bindEvents();
            const params = new URLSearchParams(window.location.search);
            const requested = (params.get('section') || 'overview').toLowerCase();
            showSection(SECTIONS.includes(requested) ? requested : 'overview');
            await refreshData();
        });
    }

    if (typeof db === 'undefined' || !db) {
        if (typeof initializeFirebase === 'function') {
            initializeFirebase();
        }
    }

    init();
})();
