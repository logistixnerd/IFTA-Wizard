(function () {
    'use strict';

    const REQUIRED_DQ_DOCS = ['cdl', 'medical', 'mvr', 'psp', 'contract'];

    const state = {
        user: null,
        windowDays: 30,
        actionOnly: false,
        data: {
            drivers: [],
            driverDocuments: [],
            samsaraDocuments: [],
            hosLogs: [],
            iftaItems: []
        },
        signals: {
            expirations: [],
            missingDocs: [],
            eldFlags: [],
            iftaFlags: [],
            actionQueue: []
        }
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

    function toDate(v) {
        if (!v) return null;
        if (typeof v.toDate === 'function') return v.toDate();
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatDate(v) {
        const d = toDate(v);
        if (!d) return '-';
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }).format(d);
    }

    function daysUntil(v) {
        const d = toDate(v);
        if (!d) return null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        d.setHours(0, 0, 0, 0);
        const ms = d.getTime() - now.getTime();
        return Math.ceil(ms / (24 * 60 * 60 * 1000));
    }

    function urgencyFromDays(days) {
        if (days == null) return 'medium';
        if (days <= 0) return 'high';
        if (days <= 7) return 'high';
        if (days <= 30) return 'medium';
        return 'low';
    }

    function isActionStatus(value) {
        const text = String(value || '').toLowerCase();
        return text.includes('open') || text.includes('pending') || text.includes('missing') || text.includes('rejected') || text.includes('violation') || text.includes('noncompliant') || text.includes('incomplete');
    }

    function normalizeDocType(v) {
        return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function getDriverName(driver) {
        const first = driver.firstName || '';
        const last = driver.lastName || '';
        const full = (first + ' ' + last).trim();
        return full || driver.name || driver.email || driver.cdl || 'Unknown Driver';
    }

    async function loadCollection(name) {
        try {
            const snap = await userCol(name).get();
            return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (err) {
            return [];
        }
    }

    async function loadDriversWithDocuments() {
        const drivers = await loadCollection('drivers');
        const perDriverDocs = await Promise.all(drivers.map(async (d) => {
            try {
                const snap = await userCol('drivers').doc(d.id).collection('documents').get();
                return snap.docs.map((doc) => ({ id: doc.id, driverId: d.id, driverName: getDriverName(d), ...doc.data() }));
            } catch (err) {
                return [];
            }
        }));

        state.data.drivers = drivers;
        state.data.driverDocuments = perDriverDocs.flat();
    }

    async function loadComplianceSources() {
        await loadDriversWithDocuments();

        const [samsaraDocuments, hosLogs, iftaRecords, iftaReports, iftaFilings] = await Promise.all([
            loadCollection('samsara_documents'),
            loadCollection('samsara_hos_logs'),
            loadCollection('ifta_records'),
            loadCollection('ifta_reports'),
            loadCollection('ifta_filings')
        ]);

        state.data.samsaraDocuments = samsaraDocuments;
        state.data.hosLogs = hosLogs;
        state.data.iftaItems = [...iftaRecords, ...iftaReports, ...iftaFilings];
    }

    function buildExpirationSignals() {
        const windowDays = state.windowDays;
        const records = [];

        state.data.drivers.forEach((d) => {
            const checks = [
                { field: 'cdlExp', label: 'CDL', value: d.cdlExp },
                { field: 'medExp', label: 'Medical Card', value: d.medExp },
                { field: 'mvrExp', label: 'MVR', value: d.mvrExp },
                { field: 'twicExp', label: 'TWIC', value: d.twicExp }
            ];

            checks.forEach((check) => {
                const days = daysUntil(check.value);
                if (days == null || days > windowDays) return;
                records.push({
                    id: (d.id || 'driver') + '-' + check.field,
                    type: 'Expiration',
                    scope: check.label,
                    driverId: d.id || null,
                    driverName: getDriverName(d),
                    dueDate: check.value,
                    days,
                    severity: urgencyFromDays(days),
                    status: days <= 0 ? 'Overdue' : 'Expiring'
                });
            });
        });

        state.signals.expirations = records.sort((a, b) => (a.days || 9999) - (b.days || 9999));
    }

    function buildMissingDocSignals() {
        const docsByDriver = new Map();

        state.data.driverDocuments.forEach((doc) => {
            const key = doc.driverId || 'unknown';
            const set = docsByDriver.get(key) || new Set();
            set.add(normalizeDocType(doc.type || doc.docType || doc.category));
            docsByDriver.set(key, set);
        });

        const records = state.data.drivers.map((d) => {
            const key = d.id || 'unknown';
            const found = docsByDriver.get(key) || new Set();
            const missing = REQUIRED_DQ_DOCS.filter((type) => !found.has(type));
            return {
                id: d.id || key,
                type: 'Missing Documents',
                driverId: d.id || null,
                driverName: getDriverName(d),
                missing,
                severity: missing.length >= 3 ? 'high' : missing.length >= 1 ? 'medium' : 'low',
                status: missing.length ? 'Missing' : 'Complete'
            };
        }).filter((item) => item.missing.length > 0);

        state.signals.missingDocs = records.sort((a, b) => b.missing.length - a.missing.length);
    }

    function buildEldSignals() {
        const windowStart = new Date(Date.now() - state.windowDays * 24 * 60 * 60 * 1000);
        const rows = state.data.hosLogs.filter((item) => {
            const date = toDate(item.logDate || item.updatedAt || item.syncedAt || item.createdAt);
            if (!date) return true;
            return date >= windowStart;
        }).map((item) => {
            const uncertified = item.certified === false || String(item.certificationStatus || '').toLowerCase().includes('uncertified');
            const violations = Number(item.violationCount || item.violations || 0);
            const formManner = String(item.formManner || item.status || '').toLowerCase().includes('violation');
            const severity = violations > 0 || formManner ? 'high' : uncertified ? 'medium' : 'low';
            return {
                id: item.id || item.internalId || item.samsaraId || Math.random().toString(36).slice(2),
                type: 'ELD Compliance',
                severity,
                status: violations > 0 ? 'Violation' : uncertified ? 'Uncertified' : (item.status || 'Flag'),
                driverName: item.driverName || item.driverSamsaraId || 'Unknown Driver',
                logDate: item.logDate || item.updatedAt || item.syncedAt,
                violationCount: violations,
                raw: item
            };
        }).filter((row) => row.severity !== 'low' || isActionStatus(row.status));

        state.signals.eldFlags = rows;
    }

    function buildIftaSignals() {
        const windowStart = new Date(Date.now() - state.windowDays * 24 * 60 * 60 * 1000);
        const rows = state.data.iftaItems.map((item) => {
            const due = item.dueDate || item.filingDueDate || item.deadline;
            const dueDays = daysUntil(due);
            const status = String(item.status || item.filingStatus || item.state || 'Open');
            const date = toDate(item.updatedAt || item.createdAt || item.syncedAt || due);
            const isRecent = !date || date >= windowStart;
            const severity = dueDays != null ? urgencyFromDays(dueDays) : (isActionStatus(status) ? 'medium' : 'low');
            return {
                id: item.id || item.internalId || item.samsaraId || Math.random().toString(36).slice(2),
                type: 'IFTA',
                severity,
                status,
                period: item.quarter || item.period || item.label || 'Unknown Period',
                dueDate: due || null,
                amount: item.taxDue || item.balance || item.amount || null,
                isRecent,
                raw: item
            };
        }).filter((row) => row.isRecent && (row.severity !== 'low' || isActionStatus(row.status)));

        state.signals.iftaFlags = rows;
    }

    function buildActionQueue() {
        const items = [];

        state.signals.expirations.forEach((x) => {
            if (x.severity === 'high' || x.days <= 14) {
                items.push({
                    id: 'aq-exp-' + x.id,
                    category: 'Expiration',
                    severity: x.severity,
                    title: x.scope + ' for ' + x.driverName,
                    subtitle: (x.days <= 0 ? 'Overdue by ' + Math.abs(x.days) + ' day(s)' : 'Due in ' + x.days + ' day(s)') + ' - ' + formatDate(x.dueDate),
                    payload: x
                });
            }
        });

        state.signals.missingDocs.forEach((x) => {
            items.push({
                id: 'aq-doc-' + x.id,
                category: 'Missing Docs',
                severity: x.severity,
                title: x.driverName + ' missing ' + x.missing.length + ' required doc(s)',
                subtitle: x.missing.map((m) => m.toUpperCase()).join(', '),
                payload: x
            });
        });

        state.signals.eldFlags.forEach((x) => {
            items.push({
                id: 'aq-eld-' + x.id,
                category: 'ELD',
                severity: x.severity,
                title: x.driverName + ' has ELD compliance flag',
                subtitle: x.status + (x.violationCount ? ' (' + x.violationCount + ' violations)' : ''),
                payload: x
            });
        });

        state.signals.iftaFlags.forEach((x) => {
            items.push({
                id: 'aq-ifta-' + x.id,
                category: 'IFTA',
                severity: x.severity,
                title: 'IFTA item: ' + x.period,
                subtitle: (x.status || 'Open') + (x.dueDate ? ' - due ' + formatDate(x.dueDate) : ''),
                payload: x
            });
        });

        const severityRank = { high: 0, medium: 1, low: 2 };
        state.signals.actionQueue = items.sort((a, b) => {
            const bySeverity = (severityRank[a.severity] || 9) - (severityRank[b.severity] || 9);
            if (bySeverity !== 0) return bySeverity;
            return a.title.localeCompare(b.title);
        });
    }

    function applyFilters(rows) {
        if (!state.actionOnly) return rows;
        return rows.filter((r) => r.severity === 'high' || r.severity === 'medium');
    }

    function itemHtml(item, source, subtitleText) {
        return '<article class="signal-item" data-source="' + escapeHtml(source) + '" data-id="' + escapeHtml(item.id) + '">' +
            '<div class="signal-item-head">' +
                '<span class="signal-title">' + escapeHtml(item.title || item.driverName || item.period || item.scope || item.type || 'Item') + '</span>' +
                '<span class="signal-pill ' + escapeHtml(item.severity || 'medium') + '">' + escapeHtml(item.severity || 'medium') + '</span>' +
            '</div>' +
            '<div class="signal-sub">' + escapeHtml(subtitleText || item.subtitle || item.status || '') + '</div>' +
        '</article>';
    }

    function wireListClicks(containerId, source, rows) {
        const el = $(containerId);
        el.querySelectorAll('.signal-item').forEach((itemEl) => {
            itemEl.addEventListener('click', () => {
                const id = itemEl.dataset.id;
                const row = rows.find((r) => String(r.id) === id);
                if (row) showDetail(source, row);
            });
        });
    }

    function renderList(containerId, rows, source, subtitleBuilder, emptyText) {
        const target = $(containerId);
        const filtered = applyFilters(rows);
        if (!filtered.length) {
            target.innerHTML = '<p class="signal-list-empty">' + escapeHtml(emptyText) + '</p>';
            return;
        }

        target.innerHTML = filtered.slice(0, 12).map((row) => itemHtml(row, source, subtitleBuilder(row))).join('');
        wireListClicks(containerId, source, filtered);
    }

    function renderSamsaraDocs() {
        const query = $('docSearchInput').value.trim().toLowerCase();
        const mapped = state.data.samsaraDocuments.map((d) => ({
            id: d.id || d.internalId || d.samsaraId || Math.random().toString(36).slice(2),
            title: d.title || d.documentName || d.fileName || 'Samsara Document',
            severity: isActionStatus(d.status) ? 'medium' : 'low',
            subtitle: (d.driverName || d.entityType || 'Unknown owner') + ' - ' + (d.status || 'Available'),
            uploadedAt: d.createdAt || d.updatedAt || d.syncedAt,
            raw: d
        })).filter((d) => {
            if (!query) return true;
            return (d.title + ' ' + d.subtitle).toLowerCase().includes(query);
        });

        renderList('samsaraDocsList', mapped, 'Samsara Document', (row) => row.subtitle + ' - ' + formatDate(row.uploadedAt), 'No Samsara documents found.');
    }

    function renderKpis() {
        const expiringSoon = state.signals.expirations.length;
        const missingDocs = state.signals.missingDocs.reduce((sum, row) => sum + row.missing.length, 0);
        const eldFlags = state.signals.eldFlags.length;
        const iftaFlags = state.signals.iftaFlags.length;
        const actionRequired = state.signals.actionQueue.length;

        $('actionRequiredValue').textContent = String(actionRequired);
        $('expiringSoonValue').textContent = String(expiringSoon);
        $('missingDocsValue').textContent = String(missingDocs);
        $('eldFlagsValue').textContent = String(eldFlags);
        $('iftaFlagsValue').textContent = String(iftaFlags);

        $('actionQueueMeta').textContent = actionRequired + ' items';
        $('expirationMeta').textContent = expiringSoon + ' records';
        $('missingMeta').textContent = state.signals.missingDocs.length + ' drivers';
        $('eldMeta').textContent = eldFlags + ' flags';
        $('iftaMeta').textContent = iftaFlags + ' records';
    }

    function renderAll() {
        renderKpis();

        renderList('actionQueueList', state.signals.actionQueue, 'Action Queue', (row) => row.subtitle || row.category || '', 'No action-required items in this window.');
        renderList('expirationList', state.signals.expirations.map((x) => ({
            id: x.id,
            title: x.scope + ' - ' + x.driverName,
            severity: x.severity,
            subtitle: x.days <= 0 ? 'Overdue by ' + Math.abs(x.days) + ' day(s)' : 'Due in ' + x.days + ' day(s)',
            payload: x
        })), 'Expiration', (row) => row.subtitle, 'No expirations in this window.');

        renderList('missingList', state.signals.missingDocs.map((x) => ({
            id: x.id,
            title: x.driverName,
            severity: x.severity,
            subtitle: 'Missing: ' + x.missing.map((m) => m.toUpperCase()).join(', '),
            payload: x
        })), 'Missing Docs', (row) => row.subtitle, 'No missing qualification docs.');

        renderList('eldList', state.signals.eldFlags.map((x) => ({
            id: x.id,
            title: x.driverName,
            severity: x.severity,
            subtitle: x.status + (x.violationCount ? ' - ' + x.violationCount + ' violations' : ''),
            payload: x
        })), 'ELD Compliance', (row) => row.subtitle, 'No ELD compliance flags in this window.');

        renderList('iftaList', state.signals.iftaFlags.map((x) => ({
            id: x.id,
            title: x.period,
            severity: x.severity,
            subtitle: (x.status || 'Open') + (x.dueDate ? ' - due ' + formatDate(x.dueDate) : ''),
            payload: x
        })), 'IFTA', (row) => row.subtitle, 'No IFTA flags in this window.');

        renderSamsaraDocs();
    }

    function showDetail(source, row) {
        $('detailTitle').textContent = source;

        const payload = row.payload || row.raw || row;
        const identity = [];
        const fields = [];
        const fieldsSecondary = [];
        const workflow = [];
        const highValue = new Set([
            'status', 'severity', 'dueDate', 'days', 'scope', 'period', 'logDate', 'violationCount', 'amount', 'driverName'
        ]);

        Object.entries(payload).forEach(([key, value]) => {
            if (value == null || typeof value === 'object') return;
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
            const val = /(At|Date|Exp|Due)$/i.test(key) ? formatDate(value) : String(value);

            if (['id', 'internalId', 'samsaraId', 'driverId', 'driverName', 'sourceSystem', 'entityType'].includes(key)) {
                identity.push({ label, val });
            } else if (['severity', 'status', 'missing', 'dueDate', 'days'].includes(key) || key.toLowerCase().includes('missing')) {
                workflow.push({ label, val });
            } else if (highValue.has(key)) {
                fields.push({ label, val });
            } else {
                fieldsSecondary.push({ label, val });
            }
        });

        if (source === 'Missing Docs' && payload.missing && payload.missing.length) {
            workflow.push({ label: 'Missing Checklist', val: payload.missing.map((m) => m.toUpperCase()).join(', ') });
            workflow.push({ label: 'Recommended Action', val: 'Request uploads and assign completion task.' });
        }
        if (source === 'Expiration' && payload.days != null) {
            workflow.push({ label: 'Recommended Action', val: payload.days <= 0 ? 'Remove from dispatch until updated document is uploaded.' : 'Notify driver and schedule renewal before due date.' });
        }
        if (source === 'ELD Compliance') {
            workflow.push({ label: 'Recommended Action', val: 'Review log edits and require certification for affected dates.' });
        }
        if (source === 'IFTA') {
            workflow.push({ label: 'Recommended Action', val: 'Validate filing status, reconcile miles/fuel, and clear tax balance.' });
        }

        function block(title, rows) {
            if (!rows.length) return '';
            return '<section class="detail-block"><h4>' + escapeHtml(title) + '</h4><div class="detail-grid">' + rows.map((r) => (
                '<div class="detail-item"><span>' + escapeHtml(r.label) + '</span><strong>' + escapeHtml(r.val) + '</strong></div>'
            )).join('') + '</div></section>';
        }

        const additional = fieldsSecondary.length
            ? '<details class="detail-collapse"><summary>Additional Details (' + fieldsSecondary.length + ')</summary>' + block('Secondary Fields', fieldsSecondary) + '</details>'
            : '';

        $('detailBody').innerHTML = block('Identity', identity) + block('Workflow', workflow) + block('Core Fields', fields) + additional;
    }

    function computeSignals() {
        buildExpirationSignals();
        buildMissingDocSignals();
        buildEldSignals();
        buildIftaSignals();
        buildActionQueue();
    }

    async function refresh() {
        await loadComplianceSources();
        computeSignals();
        renderAll();
    }

    function bindEvents() {
        $('windowSelect').addEventListener('change', async (e) => {
            state.windowDays = Number(e.target.value || 30);
            computeSignals();
            renderAll();
        });

        $('actionOnlyToggle').addEventListener('change', (e) => {
            state.actionOnly = !!e.target.checked;
            renderAll();
        });

        $('docSearchInput').addEventListener('input', () => {
            renderSamsaraDocs();
        });

        $('refreshComplianceBtn').addEventListener('click', async () => {
            await refresh();
        });

        $('closeDetailBtn').addEventListener('click', () => {
            $('detailTitle').textContent = 'Record Detail';
            $('detailBody').innerHTML = '<p class="detail-empty">Select any card to inspect deadlines, missing fields, and recommended next steps.</p>';
        });
    }

    function init() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'dashboard.html';
                return;
            }
            state.user = user;
            bindEvents();
            await refresh();
        });
    }

    if (typeof db === 'undefined' || !db) {
        if (typeof initializeFirebase === 'function') {
            initializeFirebase();
        }
    }

    init();
})();