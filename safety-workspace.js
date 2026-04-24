(function () {
    'use strict';

    const state = {
        user: null,
        window: '7d',
        datasets: {
            safetyEvents: [],
            coaching: [],
            cameraMedia: [],
            alerts: [],
            defects: [],
            dvirs: [],
            speeding: []
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

    function fmtDate(v) {
        if (!v) return '—';
        const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v);
        if (Number.isNaN(d.getTime())) return '—';
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }).format(d);
    }

    function toDate(value) {
        if (!value) return null;
        if (typeof value.toDate === 'function') return value.toDate();
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function windowStartDate() {
        const now = new Date();
        if (state.window === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (state.window === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    function withinWindow(rec) {
        const start = windowStartDate();
        const fields = [
            rec.time,
            rec.eventTime,
            rec.triggeredAt,
            rec.submittedAt,
            rec.createdAt,
            rec.updatedAt,
            rec.syncedAt,
            rec.lastSyncedAt
        ];
        for (const f of fields) {
            const d = toDate(f);
            if (d && d >= start) return true;
        }
        return false;
    }

    function sortDescByTime(items) {
        return items.slice().sort((a, b) => {
            const da = pickDate(a);
            const db = pickDate(b);
            const ta = da ? da.getTime() : 0;
            const tb = db ? db.getTime() : 0;
            return tb - ta;
        });
    }

    function pickDate(rec) {
        return toDate(rec.time) || toDate(rec.eventTime) || toDate(rec.triggeredAt) || toDate(rec.submittedAt) || toDate(rec.updatedAt) || toDate(rec.syncedAt) || toDate(rec.lastSyncedAt) || toDate(rec.createdAt);
    }

    function severityBand(value) {
        const txt = String(value || '').toLowerCase();
        if (txt.includes('critical') || txt.includes('high') || txt.includes('severe')) return 'high';
        if (txt.includes('medium') || txt.includes('warn')) return 'medium';
        if (txt.includes('low') || txt.includes('minor')) return 'low';
        return 'medium';
    }

    function evaluateRisk() {
        const events = state.datasets.safetyEvents.length;
        const alerts = state.datasets.alerts.filter((a) => !isClosed(a.status)).length;
        const defects = state.datasets.defects.filter((d) => !isClosed(d.status)).length;
        const dvirs = state.datasets.dvirs.filter((d) => !isClosed(d.status)).length;
        const speeding = state.datasets.speeding.length;

        const raw = (events * 1.2) + (alerts * 1.8) + (defects * 2.2) + (dvirs * 1.4) + (speeding * 1.1);
        const score = Math.max(0, Math.min(100, Math.round(raw)));

        let band = 'Low';
        if (score >= 66) band = 'High';
        else if (score >= 34) band = 'Medium';

        $('riskScoreValue').textContent = String(score);
        $('riskScoreBand').textContent = band;

        const chip = $('eventPressureChip');
        chip.textContent = band === 'High' ? 'Elevated' : band === 'Medium' ? 'Watch' : 'Stable';
        chip.classList.remove('medium', 'high');
        if (band === 'Medium') chip.classList.add('medium');
        if (band === 'High') chip.classList.add('high');

        return { score, band, events, alerts, defects, dvirs, speeding };
    }

    function isClosed(status) {
        const s = String(status || '').toLowerCase();
        return s === 'resolved' || s === 'closed' || s === 'complete' || s === 'completed';
    }

    async function loadCollection(name) {
        try {
            const snap = await userCol(name).get();
            return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (err) {
            return [];
        }
    }

    async function loadAll() {
        const [events, coaching, camera, alerts, defects, dvirs, speeding] = await Promise.all([
            loadCollection('samsara_safety_events'),
            loadCollection('samsara_coaching_sessions'),
            loadCollection('samsara_camera_media'),
            loadCollection('samsara_alerts'),
            loadCollection('samsara_defects'),
            loadCollection('samsara_dvirs'),
            loadCollection('samsara_speeding_intervals')
        ]);

        state.datasets.safetyEvents = sortDescByTime(events).filter(withinWindow);
        state.datasets.coaching = sortDescByTime(coaching).filter(withinWindow);
        state.datasets.cameraMedia = sortDescByTime(camera).filter(withinWindow);
        state.datasets.alerts = sortDescByTime(alerts).filter(withinWindow);
        state.datasets.defects = sortDescByTime(defects).filter(withinWindow);
        state.datasets.dvirs = sortDescByTime(dvirs).filter(withinWindow);
        state.datasets.speeding = sortDescByTime(speeding).filter(withinWindow);
    }

    function renderIndicators(risk) {
        const indicators = [
            { label: 'Safety Events', value: risk.events },
            { label: 'Open Alerts', value: risk.alerts },
            { label: 'Open Defects', value: risk.defects },
            { label: 'Pending DVIRs', value: risk.dvirs },
            { label: 'Speeding Intervals', value: risk.speeding },
            { label: 'Coaching Sessions', value: state.datasets.coaching.length },
            { label: 'Camera Clips', value: state.datasets.cameraMedia.length },
            { label: 'Risk Band', value: risk.band }
        ];

        $('riskIndicators').innerHTML = indicators.map((item) => (
            '<article class="risk-indicator"><p>' + escapeHtml(item.label) + '</p><strong>' + escapeHtml(String(item.value)) + '</strong></article>'
        )).join('');
    }

    function renderSignalList(targetId, rows, mapper, emptyText) {
        const target = $(targetId);
        if (!rows.length) {
            target.innerHTML = '<p class="signal-list-empty">' + escapeHtml(emptyText) + '</p>';
            return;
        }

        target.innerHTML = rows.slice(0, 8).map((row) => {
            const m = mapper(row);
            return '<article class="signal-item" data-source="' + escapeHtml(m.source) + '" data-id="' + escapeHtml(m.id) + '">' +
                '<div class="signal-item-head">' +
                    '<span class="signal-title">' + escapeHtml(m.title) + '</span>' +
                    '<span class="signal-pill ' + escapeHtml(m.severity) + '">' + escapeHtml(m.severity) + '</span>' +
                '</div>' +
                '<div class="signal-sub">' + escapeHtml(m.subtitle) + '</div>' +
            '</article>';
        }).join('');

        target.querySelectorAll('.signal-item').forEach((el) => {
            el.addEventListener('click', () => {
                const source = el.dataset.source;
                const id = el.dataset.id;
                const row = rows.find((r) => String(r.id || r.internalId || r.samsaraId) === id);
                if (row) showDrilldown(source, row);
            });
        });
    }

    function detailLabel(key) {
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    }

    function parseRowFields(row) {
        const fields = [];
        Object.entries(row).forEach(([k, v]) => {
            if (v == null || typeof v === 'object') return;
            const val = /(At|Time|Date)$/i.test(k) ? fmtDate(v) : String(v);
            fields.push({ key: k, label: detailLabel(k), val });
        });
        return fields;
    }

    function highValueKeysForSource(source) {
        const s = String(source || '').toLowerCase();
        if (s.includes('alert')) {
            return ['message', 'title', 'alertType', 'status', 'severity', 'driverName', 'vehicleSamsaraId', 'triggeredAt'];
        }
        if (s.includes('safety event')) {
            return ['eventType', 'type', 'severity', 'driverName', 'vehicleSamsaraId', 'eventTime'];
        }
        if (s.includes('defect') || s.includes('dvir')) {
            return ['defectType', 'status', 'severity', 'vehicleSamsaraId', 'trailerSamsaraId', 'submittedAt'];
        }
        if (s.includes('coaching')) {
            return ['title', 'topic', 'status', 'priority', 'driverName', 'scheduledAt'];
        }
        if (s.includes('camera')) {
            return ['title', 'mediaType', 'severity', 'driverName', 'vehicleSamsaraId', 'eventTime'];
        }
        return ['status', 'severity', 'driverName', 'vehicleSamsaraId'];
    }

    function renderLists() {
        const alertQuery = $('alertSearch').value.trim().toLowerCase();
        const alerts = alertQuery
            ? state.datasets.alerts.filter((a) => {
                const haystack = [
                    a.message,
                    a.title,
                    a.alertType,
                    a.status,
                    a.severity,
                    a.driverName,
                    a.vehicleSamsaraId,
                    a.trailerSamsaraId
                ].filter(Boolean).join(' ').toLowerCase();
                return haystack.includes(alertQuery);
            })
            : state.datasets.alerts;

        renderSignalList('alertsList', alerts, (a) => ({
            id: String(a.id || a.internalId || a.samsaraId || ''),
            source: 'Alert',
            title: a.message || a.title || a.alertType || 'Alert',
            severity: severityBand(a.severity || a.status),
            subtitle: (a.status || 'Open') + ' · ' + fmtDate(pickDate(a))
        }), 'No alerts in selected window.');

        renderSignalList('eventsList', state.datasets.safetyEvents, (e) => ({
            id: String(e.id || e.internalId || e.samsaraId || ''),
            source: 'Safety Event',
            title: e.eventType || e.type || 'Safety event',
            severity: severityBand(e.severity || e.eventType),
            subtitle: (e.driverName || e.driverSamsaraId || 'No driver') + ' · ' + fmtDate(pickDate(e))
        }), 'No safety events in selected window.');

        const defectsDvir = [...state.datasets.defects, ...state.datasets.dvirs];
        renderSignalList('defectsDvirList', defectsDvir, (d) => ({
            id: String(d.id || d.internalId || d.samsaraId || ''),
            source: d.entityType || (d.defectType ? 'Defect' : 'DVIR'),
            title: d.title || d.defectType || d.status || 'Inspection issue',
            severity: severityBand(d.severity || d.status),
            subtitle: (d.vehicleSamsaraId || d.trailerSamsaraId || 'No unit') + ' · ' + fmtDate(pickDate(d))
        }), 'No defects or DVIR issues in selected window.');

        renderSignalList('coachingList', state.datasets.coaching, (c) => ({
            id: String(c.id || c.internalId || c.samsaraId || ''),
            source: 'Coaching',
            title: c.title || c.topic || c.driverName || 'Coaching Session',
            severity: severityBand(c.status || c.priority),
            subtitle: (c.status || 'Pending') + ' · ' + fmtDate(pickDate(c))
        }), 'No coaching items in selected window.');

        renderSignalList('cameraMediaList', state.datasets.cameraMedia, (m) => ({
            id: String(m.id || m.internalId || m.samsaraId || ''),
            source: 'Camera Media',
            title: m.title || m.mediaType || 'Safety Clip',
            severity: severityBand(m.severity || m.priority || 'medium'),
            subtitle: (m.driverName || m.vehicleSamsaraId || 'Unknown unit') + ' · ' + fmtDate(pickDate(m))
        }), 'No camera media in selected window.');

        $('eventsMeta').textContent = state.datasets.safetyEvents.length + ' in window';
        $('defectsMeta').textContent = state.datasets.defects.filter((d) => !isClosed(d.status)).length + ' open';
        $('coachingMeta').textContent = state.datasets.coaching.length + ' sessions';
        $('cameraMeta').textContent = state.datasets.cameraMedia.length + ' clips';
    }

    function renderTopCards(risk) {
        $('openAlertsValue').textContent = String(risk.alerts);
        $('criticalDefectsValue').textContent = String(state.datasets.defects.filter((d) => severityBand(d.severity || d.status) === 'high' && !isClosed(d.status)).length);
        $('openDvirValue').textContent = String(state.datasets.dvirs.filter((d) => !isClosed(d.status)).length);
        $('speedingIntervalsValue').textContent = String(state.datasets.speeding.length);
    }

    function showDrilldown(source, row) {
        $('drilldownTitle').textContent = source;
        const primary = [];
        const detail = [];
        const detailSecondary = [];
        const sync = [];

        const fields = parseRowFields(row);
        const highValue = new Set(highValueKeysForSource(source));

        fields.forEach((field) => {
            if (['id', 'internalId', 'samsaraId', 'sourceSystem', 'entityType'].includes(field.key)) {
                primary.push({ key: field.label, val: field.val });
                return;
            }

            const lower = field.key.toLowerCase();
            if (lower.includes('sync') || lower.includes('updated')) {
                sync.push({ key: field.label, val: field.val });
                return;
            }

            if (highValue.has(field.key)) {
                detail.push({ key: field.label, val: field.val });
            } else {
                detailSecondary.push({ key: field.label, val: field.val });
            }
        });

        function block(title, rows) {
            if (!rows.length) return '';
            return '<section class="drilldown-block"><h4>' + escapeHtml(title) + '</h4><div class="drilldown-grid">' +
                rows.map((r) => '<div class="drilldown-item"><span>' + escapeHtml(r.key) + '</span><strong>' + escapeHtml(r.val) + '</strong></div>').join('') +
                '</div></section>';
        }

        const additional = detailSecondary.length
            ? '<details class="detail-collapse"><summary>Additional Details (' + detailSecondary.length + ')</summary>' + block('Secondary Fields', detailSecondary) + '</details>'
            : '';

        $('drilldownBody').innerHTML = block('Identity', primary) + block('Operational Fields', detail) + additional + block('Sync Metadata', sync);
    }

    function bindEvents() {
        $('safetyWindow').addEventListener('change', async (e) => {
            state.window = e.target.value;
            await refreshView();
        });

        $('refreshSafetyBtn').addEventListener('click', async () => {
            await refreshView();
        });

        $('alertSearch').addEventListener('input', () => {
            renderLists();
        });

        $('closeDrilldown').addEventListener('click', () => {
            $('drilldownTitle').textContent = 'Drill-down';
            $('drilldownBody').innerHTML = '<p class="drilldown-empty">Click any signal card to inspect full context and sync metadata.</p>';
        });
    }

    async function refreshView() {
        await loadAll();
        const risk = evaluateRisk();
        renderTopCards(risk);
        renderIndicators(risk);
        renderLists();
    }

    function init() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'dashboard.html';
                return;
            }
            state.user = user;
            bindEvents();
            await refreshView();
        });
    }

    if (typeof db === 'undefined' || !db) {
        if (typeof initializeFirebase === 'function') {
            initializeFirebase();
        }
    }

    init();
})();