(function () {
    'use strict';

    const state = {
        user: null,
        activeTab: 'vehicles',
        filters: {
            search: '',
            status: '',
            source: ''
        },
        data: {
            vehicles: [],
            trailers: [],
            assignments: [],
            trips: [],
            equipment: []
        },
        filteredRows: []
    };

    const tableConfigs = {
        vehicles: {
            columns: ['Unit', 'VIN', 'Status', 'Source', 'Updated'],
            mapRow: (row) => [
                row.unit || row.name || '—',
                row.vin || '—',
                chip(row.status || 'unknown', 'status'),
                chip(row.sourceSystem || row.source || 'manual', 'source'),
                fmtDate(row.updatedAt || row.syncedAt || row.lastSyncedAt)
            ],
            title: 'Vehicle Detail'
        },
        trailers: {
            columns: ['Trailer', 'VIN', 'Status', 'Source', 'Updated'],
            mapRow: (row) => [
                row.unit || row.name || '—',
                row.vin || '—',
                chip(row.status || 'unknown', 'status'),
                chip(row.sourceSystem || row.source || 'manual', 'source'),
                fmtDate(row.updatedAt || row.syncedAt || row.lastSyncedAt)
            ],
            title: 'Trailer Detail'
        },
        assignments: {
            columns: ['Driver', 'Vehicle', 'Trailer', 'Status', 'Source'],
            mapRow: (row) => [
                row.driverName || row.driverSamsaraId || '—',
                row.vehicleLabel || row.vehicleSamsaraId || '—',
                row.trailerLabel || row.trailerSamsaraId || '—',
                chip(row.status || 'active', 'status'),
                chip(row.sourceSystem || 'samsara', 'source')
            ],
            title: 'Assignment Detail'
        },
        trips: {
            columns: ['Trip', 'Vehicle', 'Driver', 'Status', 'Start Time'],
            mapRow: (row) => [
                row.tripName || row.internalId || row.samsaraId || '—',
                row.vehicleLabel || row.vehicleSamsaraId || '—',
                row.driverName || row.driverSamsaraId || '—',
                chip(row.status || 'open', 'status'),
                fmtDate(row.startTime)
            ],
            title: 'Trip Detail'
        },
        equipment: {
            columns: ['Item', 'Related Unit', 'Type', 'Status', 'Updated'],
            mapRow: (row) => [
                row.title || row.name || row.internalId || '—',
                row.vehicleLabel || row.vehicleSamsaraId || row.trailerSamsaraId || '—',
                row.entityType || row.defectType || 'equipment',
                chip(row.status || 'open', 'status'),
                fmtDate(row.updatedAt || row.syncedAt || row.lastSyncedAt)
            ],
            title: 'Equipment Detail'
        }
    };

    function $(id) {
        return document.getElementById(id);
    }

    function userCol(path) {
        return db.collection('users').doc(state.user.uid).collection(path);
    }

    function escapeHtml(value) {
        if (value == null) return '';
        const div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
    }

    function fmtDate(v) {
        if (!v) return '—';
        const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v);
        if (Number.isNaN(d.getTime())) return '—';
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }).format(d);
    }

    function chip(text, kind) {
        const val = String(text || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const cls = kind === 'source' ? 'source-' + val : 'status-' + val;
        return '<span class="fleet-chip ' + cls + '">' + escapeHtml(text) + '</span>';
    }

    function announce(text, error) {
        const el = document.createElement('div');
        el.textContent = text;
        Object.assign(el.style, {
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            zIndex: '9999',
            padding: '0.5rem 0.85rem',
            borderRadius: '10px',
            fontSize: '0.75rem',
            fontWeight: '600',
            color: error ? '#b91c1c' : '#166534',
            background: error ? 'rgba(254, 226, 226, 0.95)' : 'rgba(220, 252, 231, 0.95)',
            border: '1px solid ' + (error ? '#fca5a5' : '#86efac')
        });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2200);
    }

    function normalizeDoc(doc) {
        const data = doc.data() || {};
        return { id: doc.id, ...data };
    }

    async function loadCollection(name) {
        try {
            const snap = await userCol(name).get();
            return snap.docs.map(normalizeDoc);
        } catch (err) {
            if ((err && err.code) || String(err).includes('permission')) {
                return [];
            }
            throw err;
        }
    }

    function mergeVehicles(manual, samsara) {
        const mappedManual = manual.map((v) => ({
            internalId: v.id,
            unit: v.unit || v.name || '',
            name: v.name || v.unit || '',
            vin: v.vin || null,
            status: v.status || 'active',
            sourceSystem: 'manual',
            updatedAt: v.updatedAt || v.createdAt || null,
            ...v
        }));

        const mappedSamsara = samsara.map((v) => ({
            internalId: v.internalId || v.id,
            samsaraId: v.samsaraId || v.id,
            unit: v.name || '',
            name: v.name || '',
            vin: v.vin || null,
            status: v.status || 'active',
            sourceSystem: v.sourceSystem || 'samsara',
            updatedAt: v.updatedAt || v.syncedAt || v.lastSyncedAt || null,
            ...v
        }));

        const byKey = new Map();
        mappedManual.forEach((row) => {
            const key = (row.vin || row.internalId || row.id || Math.random()).toString();
            byKey.set(key, row);
        });

        mappedSamsara.forEach((row) => {
            const key = (row.vin || row.samsaraId || row.internalId || row.id || Math.random()).toString();
            const existing = byKey.get(key);
            byKey.set(key, existing ? { ...existing, ...row, sourceSystem: 'samsara' } : row);
        });

        return Array.from(byKey.values());
    }

    function mergeTrailers(manual, samsara) {
        const mappedManual = manual.map((t) => ({
            internalId: t.id,
            unit: t.unit || t.name || '',
            name: t.name || t.unit || '',
            vin: t.vin || null,
            status: t.status || 'active',
            sourceSystem: 'manual',
            updatedAt: t.updatedAt || t.createdAt || null,
            ...t
        }));

        const mappedSamsara = samsara.map((t) => ({
            internalId: t.internalId || t.id,
            samsaraId: t.samsaraId || t.id,
            unit: t.name || '',
            name: t.name || '',
            vin: t.vin || null,
            status: t.status || 'active',
            sourceSystem: t.sourceSystem || 'samsara',
            updatedAt: t.updatedAt || t.syncedAt || t.lastSyncedAt || null,
            ...t
        }));

        const byKey = new Map();
        mappedManual.forEach((row) => {
            const key = (row.vin || row.internalId || row.id || Math.random()).toString();
            byKey.set(key, row);
        });

        mappedSamsara.forEach((row) => {
            const key = (row.vin || row.samsaraId || row.internalId || row.id || Math.random()).toString();
            const existing = byKey.get(key);
            byKey.set(key, existing ? { ...existing, ...row, sourceSystem: 'samsara' } : row);
        });

        return Array.from(byKey.values());
    }

    function toEquipmentRows(workOrders, defects) {
        const orders = workOrders.map((w) => ({
            ...w,
            entityType: w.entityType || 'work_order',
            title: w.title || 'Work Order',
            status: w.status || 'open',
            sourceSystem: w.sourceSystem || 'samsara'
        }));

        const defectRows = defects.map((d) => ({
            ...d,
            entityType: d.entityType || 'defect',
            title: d.title || d.defectType || 'Defect',
            status: d.status || 'defect',
            sourceSystem: d.sourceSystem || 'samsara'
        }));

        return [...orders, ...defectRows];
    }

    function computeSummary() {
        $('sumVehicles').textContent = String(state.data.vehicles.length);
        $('sumTrailers').textContent = String(state.data.trailers.length);

        const activeAssignments = state.data.assignments.filter((a) => String(a.status || '').toLowerCase() !== 'inactive').length;
        $('sumAssignments').textContent = String(activeAssignments);

        const openTrips = state.data.trips.filter((t) => {
            const s = String(t.status || '').toLowerCase();
            return s === 'open' || s === 'active' || s === 'in-progress' || s === 'in_progress';
        }).length;
        $('sumTrips').textContent = String(openTrips);

        const openEquip = state.data.equipment.filter((e) => {
            const s = String(e.status || '').toLowerCase();
            return !(s === 'resolved' || s === 'closed' || s === 'complete');
        }).length;
        $('sumEquipment').textContent = String(openEquip);
    }

    function getCurrentRows() {
        return state.data[state.activeTab] || [];
    }

    function applyTableFilters() {
        const rows = getCurrentRows();
        const q = state.filters.search.trim().toLowerCase();
        const status = state.filters.status.trim().toLowerCase();
        const source = state.filters.source.trim().toLowerCase();

        state.filteredRows = rows.filter((row) => {
            if (status) {
                const rowStatus = String(row.status || '').toLowerCase();
                if (rowStatus !== status) return false;
            }
            if (source) {
                const rowSource = String(row.sourceSystem || row.source || 'manual').toLowerCase();
                if (rowSource !== source) return false;
            }
            if (q) {
                const searchable = Object.values(row)
                    .filter((v) => ['string', 'number'].includes(typeof v))
                    .join(' ')
                    .toLowerCase();
                if (!searchable.includes(q)) return false;
            }
            return true;
        });
    }

    function repopulateStatusFilter() {
        const sel = $('fleetStatusFilter');
        if (!sel) return;
        const prev = sel.value;

        const statuses = new Set();
        getCurrentRows().forEach((r) => {
            if (r.status) statuses.add(String(r.status));
        });

        sel.innerHTML = '<option value="">All Statuses</option>';
        Array.from(statuses).sort((a, b) => a.localeCompare(b)).forEach((s) => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            sel.appendChild(opt);
        });

        sel.value = Array.from(statuses).includes(prev) ? prev : '';
        state.filters.status = sel.value;
    }

    function renderTable() {
        const cfg = tableConfigs[state.activeTab];
        if (!cfg) return;

        const thead = $('fleetTableHead');
        const tbody = $('fleetTableBody');
        const empty = $('fleetEmptyState');

        thead.innerHTML = '<tr>' + cfg.columns.map((c) => '<th>' + escapeHtml(c) + '</th>').join('') + '</tr>';

        if (!state.filteredRows.length) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');

        tbody.innerHTML = state.filteredRows.map((row, index) => {
            const cells = cfg.mapRow(row).map((val) => '<td>' + val + '</td>').join('');
            return '<tr class="fleet-row" data-row-index="' + index + '">' + cells + '</tr>';
        }).join('');

        tbody.querySelectorAll('.fleet-row').forEach((tr) => {
            tr.addEventListener('click', () => {
                const idx = Number(tr.dataset.rowIndex);
                const row = state.filteredRows[idx];
                if (row) renderDetail(row, cfg.title);
            });
        });
    }

    function renderDetail(row, title) {
        const entityType = {
            vehicles: 'Vehicle',
            trailers: 'Trailer',
            assignments: 'Assignment',
            trips: 'Trip',
            equipment: 'Equipment'
        }[state.activeTab] || 'Record';

        const primaryKeys  = ['internalId', 'samsaraId', 'sourceSystem', 'source', 'entityType'];
        const syncKeyWords = ['synced', 'updated', 'lastSync'];

        const identityFields     = [];
        const operationalFields  = [];
        const operationalSecondary = [];
        const syncFields         = [];
        const primaryOperationalKeysByTab = {
            vehicles: new Set(['unit', 'name', 'vin', 'status', 'make', 'model', 'year']),
            trailers: new Set(['unit', 'name', 'vin', 'status', 'make', 'model', 'year']),
            assignments: new Set(['driverName', 'vehicleLabel', 'trailerLabel', 'status']),
            trips: new Set(['tripName', 'status', 'driverName', 'vehicleLabel', 'startTime', 'endTime']),
            equipment: new Set(['title', 'status', 'entityType', 'vehicleLabel', 'trailerSamsaraId'])
        };
        const preferredOperational = primaryOperationalKeysByTab[state.activeTab] || new Set();

        Object.entries(row).forEach(([k, v]) => {
            if (v == null || typeof v === 'object') return;
            const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
            const value = syncKeyWords.some((w) => k.includes(w)) ? fmtDate(v) : String(v);

            if (primaryKeys.includes(k)) {
                identityFields.push({ label, value });
            } else if (syncKeyWords.some((w) => k.includes(w))) {
                syncFields.push({ label, value });
            } else if (preferredOperational.has(k)) {
                operationalFields.push({ label, value });
            } else {
                operationalSecondary.push({ label, value });
            }
        });

        const sections = [];

        if (identityFields.length) {
            sections.push({ heading: 'Identity', fields: identityFields });
        }
        if (operationalFields.length) {
            sections.push({ heading: 'Operational', fields: operationalFields });
        }
        if (operationalSecondary.length) {
            sections.push({ heading: 'Additional Details (' + operationalSecondary.length + ')', fields: operationalSecondary, collapsible: true });
        }
        if (syncFields.length) {
            sections.push({ heading: 'Sync Metadata', fields: syncFields, collapsible: true });
        }

        const primaryLabel = row.unit || row.name || row.tripName || row.title || row.internalId || row.samsaraId || title;
        const subtitleParts = [
            row.vin ? 'VIN ' + row.vin : null,
            row.sourceSystem || row.source || null
        ].filter(Boolean);

        Drawer.open({
            entityType: entityType,
            title: primaryLabel,
            subtitle: subtitleParts.join(' · ') || null,
            sections: sections,
            actions: [
                { label: 'Close', onClick: function() { Drawer.close(); } }
            ]
        });
    }

    function switchTab(tab) {
        state.activeTab = tab;
        document.querySelectorAll('.fleet-tab').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        repopulateStatusFilter();
        applyTableFilters();
        renderTable();
    }

    async function loadFleetData() {
        const [
            trucks,
            samsaraVehicles,
            trailers,
            samsaraTrailers,
            assignments,
            trips,
            workOrders,
            defects
        ] = await Promise.all([
            loadCollection('trucks'),
            loadCollection('samsara_vehicles'),
            loadCollection('trailers'),
            loadCollection('samsara_trailers'),
            loadCollection('samsara_assignments'),
            loadCollection('samsara_trips'),
            loadCollection('samsara_work_orders'),
            loadCollection('samsara_defects')
        ]);

        state.data.vehicles = mergeVehicles(trucks, samsaraVehicles);
        state.data.trailers = mergeTrailers(trailers, samsaraTrailers);
        state.data.assignments = assignments.map((a) => ({
            sourceSystem: a.sourceSystem || 'samsara',
            ...a
        }));
        state.data.trips = trips.map((t) => ({
            sourceSystem: t.sourceSystem || 'samsara',
            ...t
        }));
        state.data.equipment = toEquipmentRows(workOrders, defects);

        computeSummary();
        switchTab(state.activeTab);
    }

    function bindEvents() {
        $('fleetTabs').addEventListener('click', (e) => {
            const btn = e.target.closest('.fleet-tab');
            if (!btn) return;
            switchTab(btn.dataset.tab);
        });

        $('fleetSearch').addEventListener('input', (e) => {
            state.filters.search = e.target.value || '';
            applyTableFilters();
            renderTable();
        });

        $('fleetStatusFilter').addEventListener('change', (e) => {
            state.filters.status = e.target.value || '';
            applyTableFilters();
            renderTable();
        });

        $('fleetSourceFilter').addEventListener('change', (e) => {
            state.filters.source = e.target.value || '';
            applyTableFilters();
            renderTable();
        });

        $('refreshFleetBtn').addEventListener('click', async () => {
            try {
                await loadFleetData();
                announce('Fleet data refreshed');
            } catch (err) {
                console.error('Refresh failed:', err);
                announce('Refresh failed', true);
            }
        });
    }

    function initAuth() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'dashboard.html';
                return;
            }

            state.user = user;

            try {
                bindEvents();
                await loadFleetData();
            } catch (err) {
                console.error('Failed to initialize Fleet workspace:', err);
                announce('Could not load Fleet workspace', true);
            }
        });
    }

    if (typeof db === 'undefined' || !db) {
        if (typeof initializeFirebase === 'function') {
            initializeFirebase();
        }
    }

    initAuth();
})();