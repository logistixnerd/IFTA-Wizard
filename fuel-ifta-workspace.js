(function () {
    'use strict';

    const state = {
        user: null,
        windowDays: 90,
        data: {
            vehicles: [],
            trips: [],
            fuelTx: [],
            iftaRecords: [],
            iftaReports: [],
            iftaFilings: []
        },
        vehicleMetrics: [],
        stateMetrics: []
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

    function asNumber(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    function fmt0(v) {
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(asNumber(v));
    }

    function fmt1(v) {
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(asNumber(v));
    }

    function dateInWindow(rec) {
        const start = new Date(Date.now() - state.windowDays * 24 * 60 * 60 * 1000);
        const d = toDate(rec.time) || toDate(rec.startTime) || toDate(rec.transactionTime) || toDate(rec.updatedAt) || toDate(rec.createdAt) || toDate(rec.syncedAt);
        if (!d) return true;
        return d >= start;
    }

    function weekKey(d) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday.toISOString().slice(0, 10);
    }

    function shortWeekLabel(isoDate) {
        const d = new Date(isoDate);
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
    }

    function pickState(item) {
        return String(
            item.state || item.jurisdiction || item.region || item.locationState ||
            (item.location && item.location.state) || item.stateCode || 'Unknown'
        ).toUpperCase().slice(0, 12);
    }

    function pickUnit(item) {
        return item.vehicleLabel || item.unit || item.vehicleName || item.vehicleSamsaraId || item.truck || 'Unknown Unit';
    }

    function pickVin(item) {
        return item.vin || item.vehicleVin || item.vehicleVIN || '';
    }

    function pickTripMiles(t) {
        return asNumber(t.distanceMiles || t.miles || t.distance || t.odometerMiles);
    }

    function pickIdleHours(t) {
        const mins = asNumber(t.idleMinutes || t.idlingMinutes || t.engineIdleMinutes || t.idleDurationMinutes);
        if (mins) return mins / 60;
        const seconds = asNumber(t.idleSeconds || t.idlingDurationSeconds || t.engineIdleSeconds);
        if (seconds) return seconds / 3600;
        const ms = asNumber(t.idleDurationMs || t.idlingDurationMs || t.engineIdleDurationMs);
        if (ms) return ms / 3600000;
        return asNumber(t.idleHours || t.idlingHours || 0);
    }

    function parseFuelTx(tx) {
        const fuelType = String(tx.fuelType || tx.energyType || tx.product || '').toLowerCase();
        const gallons = asNumber(tx.gallons || tx.fuelGallons || tx.volumeGallons || tx.quantityGallons || tx.volume);
        const kwh = asNumber(tx.kwh || tx.energyKwh || tx.kilowattHours || tx.energy);
        return {
            gallons: fuelType.includes('electric') ? 0 : gallons,
            kwh: fuelType.includes('electric') || kwh ? kwh : 0,
            cost: asNumber(tx.amount || tx.totalCost || tx.cost || tx.price),
            state: pickState(tx),
            unit: pickUnit(tx),
            date: toDate(tx.transactionTime || tx.time || tx.updatedAt || tx.createdAt || tx.syncedAt)
        };
    }

    async function loadCollection(name) {
        try {
            const snap = await userCol(name).get();
            return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (err) {
            return [];
        }
    }

    async function loadData() {
        const [vehicles, trips, fuelTx, iftaRecords, iftaReports, iftaFilings] = await Promise.all([
            loadCollection('samsara_vehicles'),
            loadCollection('samsara_trips'),
            loadCollection('samsara_fuel_transactions'),
            loadCollection('ifta_records'),
            loadCollection('ifta_reports'),
            loadCollection('ifta_filings')
        ]);

        state.data.vehicles = vehicles;
        state.data.trips = trips.filter(dateInWindow);
        state.data.fuelTx = fuelTx.filter(dateInWindow);
        state.data.iftaRecords = iftaRecords.filter(dateInWindow);
        state.data.iftaReports = iftaReports.filter(dateInWindow);
        state.data.iftaFilings = iftaFilings.filter(dateInWindow);
    }

    function computeVehicleMetrics() {
        const byUnit = new Map();

        state.data.trips.forEach((trip) => {
            const unit = pickUnit(trip);
            if (!byUnit.has(unit)) {
                byUnit.set(unit, {
                    unit,
                    vin: pickVin(trip),
                    tripCount: 0,
                    miles: 0,
                    idlingHours: 0,
                    fuelGallons: 0,
                    energyKwh: 0,
                    iftaStates: new Set()
                });
            }
            const row = byUnit.get(unit);
            row.tripCount += 1;
            row.miles += pickTripMiles(trip);
            row.idlingHours += pickIdleHours(trip);
            row.iftaStates.add(pickState(trip));
            if (!row.vin) row.vin = pickVin(trip);
        });

        state.data.fuelTx.forEach((tx) => {
            const p = parseFuelTx(tx);
            const unit = p.unit;
            if (!byUnit.has(unit)) {
                byUnit.set(unit, {
                    unit,
                    vin: pickVin(tx),
                    tripCount: 0,
                    miles: 0,
                    idlingHours: 0,
                    fuelGallons: 0,
                    energyKwh: 0,
                    iftaStates: new Set()
                });
            }
            const row = byUnit.get(unit);
            row.fuelGallons += p.gallons;
            row.energyKwh += p.kwh;
            row.iftaStates.add(p.state);
            if (!row.vin) row.vin = pickVin(tx);
        });

        const rows = Array.from(byUnit.values()).map((row) => {
            const mpg = row.fuelGallons > 0 ? row.miles / row.fuelGallons : 0;
            return {
                ...row,
                iftaStateCount: row.iftaStates.size,
                mpg
            };
        }).sort((a, b) => b.miles - a.miles);

        state.vehicleMetrics = rows;
    }

    function computeStateMetrics() {
        const byState = new Map();

        function ensure(stateCode) {
            const code = stateCode || 'UNKNOWN';
            if (!byState.has(code)) {
                byState.set(code, {
                    state: code,
                    miles: 0,
                    fuelGallons: 0,
                    energyKwh: 0,
                    tripCount: 0,
                    iftaRecordCount: 0,
                    actionCount: 0
                });
            }
            return byState.get(code);
        }

        state.data.trips.forEach((trip) => {
            const row = ensure(pickState(trip));
            row.miles += pickTripMiles(trip);
            row.tripCount += 1;
        });

        state.data.fuelTx.forEach((tx) => {
            const p = parseFuelTx(tx);
            const row = ensure(p.state);
            row.fuelGallons += p.gallons;
            row.energyKwh += p.kwh;
        });

        const allIfta = [...state.data.iftaRecords, ...state.data.iftaReports, ...state.data.iftaFilings];
        allIfta.forEach((item) => {
            const row = ensure(pickState(item));
            row.iftaRecordCount += 1;
            const status = String(item.status || item.filingStatus || item.state || '').toLowerCase();
            if (status.includes('open') || status.includes('pending') || status.includes('reject') || status.includes('due')) {
                row.actionCount += 1;
            }
            row.miles += asNumber(item.miles || item.taxableMiles || item.totalMiles);
            row.fuelGallons += asNumber(item.fuelGallons || item.gallons || item.taxableGallons);
            row.energyKwh += asNumber(item.energyKwh || item.kwh || item.electricKwh);
        });

        state.stateMetrics = Array.from(byState.values()).map((row) => ({
            ...row,
            mpg: row.fuelGallons > 0 ? row.miles / row.fuelGallons : 0
        })).sort((a, b) => b.miles - a.miles);
    }

    function renderKpis() {
        const fuel = state.vehicleMetrics.reduce((sum, r) => sum + r.fuelGallons, 0);
        const energy = state.vehicleMetrics.reduce((sum, r) => sum + r.energyKwh, 0);
        const miles = state.vehicleMetrics.reduce((sum, r) => sum + r.miles, 0);
        const idling = state.vehicleMetrics.reduce((sum, r) => sum + r.idlingHours, 0);
        const iftaActions = state.stateMetrics.reduce((sum, r) => sum + r.actionCount, 0);
        const mpg = fuel > 0 ? miles / fuel : 0;

        $('fiFuelUsed').textContent = fmt1(fuel) + ' gal';
        $('fiEnergyUsed').textContent = fmt1(energy) + ' kWh';
        $('fiEfficiency').textContent = fmt1(mpg) + ' MPG';
        $('fiIdlingHours').textContent = fmt1(idling) + ' h';
        $('fiIftaActions').textContent = fmt0(iftaActions);

        $('fiFuelSub').textContent = fmt0(state.data.fuelTx.length) + ' transactions';
        $('fiEnergySub').textContent = energy > 0 ? 'electric + hybrid units' : 'no electric energy recorded';
        $('fiEfficiencySub').textContent = fmt0(miles) + ' fleet miles';
        $('fiIdlingSub').textContent = fmt0(state.data.trips.length) + ' trips analyzed';
        $('fiIftaSub').textContent = fmt0(state.stateMetrics.filter((r) => r.actionCount > 0).length) + ' states with action items';
    }

    function renderTrends() {
        const buckets = new Map();
        const end = new Date();
        for (let i = 7; i >= 0; i -= 1) {
            const d = new Date(end.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            buckets.set(weekKey(d), { fuel: 0, miles: 0, label: shortWeekLabel(weekKey(d)) });
        }

        state.data.trips.forEach((trip) => {
            const d = toDate(trip.startTime || trip.time || trip.updatedAt || trip.createdAt);
            if (!d) return;
            const key = weekKey(d);
            if (!buckets.has(key)) return;
            buckets.get(key).miles += pickTripMiles(trip);
        });

        state.data.fuelTx.forEach((tx) => {
            const p = parseFuelTx(tx);
            if (!p.date) return;
            const key = weekKey(p.date);
            if (!buckets.has(key)) return;
            buckets.get(key).fuel += p.gallons;
        });

        const rows = Array.from(buckets.values());
        const maxFuel = Math.max(1, ...rows.map((r) => r.fuel));
        const maxMiles = Math.max(1, ...rows.map((r) => r.miles));

        $('fiTrendBars').innerHTML = rows.map((r) => {
            const fuelPct = Math.max(6, (r.fuel / maxFuel) * 100);
            const milesPct = Math.max(6, (r.miles / maxMiles) * 100);
            return '<div class="fi-trend-col">' +
                '<div class="fi-trend-bars">' +
                    '<div class="fi-trend-bar fuel" style="height:' + fuelPct + '%" title="Fuel: ' + escapeHtml(fmt1(r.fuel)) + ' gal"></div>' +
                    '<div class="fi-trend-bar miles" style="height:' + milesPct + '%" title="Miles: ' + escapeHtml(fmt0(r.miles)) + '"></div>' +
                '</div>' +
                '<span class="fi-trend-week">' + escapeHtml(r.label) + '</span>' +
            '</div>';
        }).join('');
    }

    function renderSnapshot() {
        const txCount = state.data.fuelTx.length;
        const tripCount = state.data.trips.length;
        const vehicleCount = state.vehicleMetrics.length;
        const states = state.stateMetrics.length;
        const openIfta = state.stateMetrics.filter((r) => r.actionCount > 0).length;
        const topState = state.stateMetrics[0] ? state.stateMetrics[0].state : 'N/A';

        const cards = [
            { label: 'Fuel Transactions', value: fmt0(txCount) },
            { label: 'Trips', value: fmt0(tripCount) },
            { label: 'Units With Activity', value: fmt0(vehicleCount) },
            { label: 'States Covered', value: fmt0(states) },
            { label: 'States With IFTA Actions', value: fmt0(openIfta) },
            { label: 'Highest Mileage State', value: topState }
        ];

        $('fiSnapshotGrid').innerHTML = cards.map((c) => (
            '<article class="fi-snapshot"><p>' + escapeHtml(c.label) + '</p><strong>' + escapeHtml(c.value) + '</strong></article>'
        )).join('');
    }

    function renderVehicleTable() {
        const query = $('fiVehicleSearch').value.trim().toLowerCase();
        const rows = state.vehicleMetrics.filter((r) => {
            if (!query) return true;
            return [r.unit, r.vin].join(' ').toLowerCase().includes(query);
        });

        const tbody = $('fiVehicleTableBody');
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8">No vehicle metrics found for this filter window.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((r, idx) => (
            '<tr>' +
                '<td><button class="fi-row-button" data-kind="vehicle" data-index="' + idx + '">' + escapeHtml(r.unit) + '</button></td>' +
                '<td>' + escapeHtml(fmt0(r.tripCount)) + '</td>' +
                '<td>' + escapeHtml(fmt0(r.miles)) + '</td>' +
                '<td>' + escapeHtml(fmt1(r.fuelGallons)) + '</td>' +
                '<td>' + escapeHtml(fmt1(r.energyKwh)) + '</td>' +
                '<td>' + escapeHtml(fmt1(r.mpg)) + ' MPG</td>' +
                '<td>' + escapeHtml(fmt1(r.idlingHours)) + '</td>' +
                '<td>' + escapeHtml(fmt0(r.iftaStateCount)) + '</td>' +
            '</tr>'
        )).join('');

        tbody.querySelectorAll('button.fi-row-button').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = rows[Number(btn.dataset.index)];
                if (row) showDetail('Vehicle Detail', row);
            });
        });
    }

    function actionTag(count) {
        if (count <= 0) return '<span class="fi-tag ok">Clear</span>';
        if (count <= 2) return '<span class="fi-tag warn">Watch</span>';
        return '<span class="fi-tag alert">Action</span>';
    }

    function renderStateTable() {
        const tbody = $('fiStateTableBody');
        const rows = state.stateMetrics;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8">No state-level records found for this filter window.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((r, idx) => (
            '<tr>' +
                '<td><button class="fi-row-button" data-kind="state" data-index="' + idx + '">' + escapeHtml(r.state) + '</button></td>' +
                '<td>' + escapeHtml(fmt0(r.miles)) + '</td>' +
                '<td>' + escapeHtml(fmt1(r.fuelGallons)) + '</td>' +
                '<td>' + escapeHtml(fmt1(r.energyKwh)) + '</td>' +
                '<td>' + escapeHtml(fmt1(r.mpg)) + '</td>' +
                '<td>' + escapeHtml(fmt0(r.tripCount)) + '</td>' +
                '<td>' + escapeHtml(fmt0(r.iftaRecordCount)) + '</td>' +
                '<td>' + actionTag(r.actionCount) + '</td>' +
            '</tr>'
        )).join('');

        tbody.querySelectorAll('button.fi-row-button').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = rows[Number(btn.dataset.index)];
                if (row) showDetail('State Insight', row);
            });
        });
    }

    function showDetail(title, obj) {
        $('fiDetailTitle').textContent = title;

        const identity = [];
        const metrics = [];
        const metricsSecondary = [];
        const actions = [];
        const highValue = new Set([
            'miles', 'fuelGallons', 'energyKwh', 'mpg', 'idleHours', 'tripCount', 'iftaRecordCount', 'actionCount'
        ]);

        Object.entries(obj).forEach(([k, v]) => {
            if (v == null || typeof v === 'object') return;
            const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
            const val = String(v);
            if (['unit', 'vin', 'state'].includes(k)) {
                identity.push({ label, val });
            } else if (['actionCount', 'iftaRecordCount', 'iftaStateCount'].includes(k)) {
                actions.push({ label, val });
            } else if (highValue.has(k)) {
                metrics.push({ label, val });
            } else {
                metricsSecondary.push({ label, val });
            }
        });

        if (title === 'Vehicle Detail') {
            actions.push({ label: 'Recommended Action', val: 'Compare idling hours against MPG and assign coaching if idling is high.' });
        }
        if (title === 'State Insight') {
            actions.push({ label: 'Recommended Action', val: 'Reconcile mileage/fuel values against IFTA filings for this jurisdiction.' });
        }

        function block(name, rows) {
            if (!rows.length) return '';
            return '<section class="fi-detail-block"><h4>' + escapeHtml(name) + '</h4><div class="fi-detail-grid">' +
                rows.map((r) => '<div class="fi-detail-item"><span>' + escapeHtml(r.label) + '</span><strong>' + escapeHtml(r.val) + '</strong></div>').join('') +
            '</div></section>';
        }

        const additional = metricsSecondary.length
            ? '<details class="fi-detail-collapse"><summary>Additional Metrics (' + metricsSecondary.length + ')</summary>' + block('Secondary Metrics', metricsSecondary) + '</details>'
            : '';

        $('fiDetailBody').innerHTML = block('Identity', identity) + block('Metrics', metrics) + additional + block('Workflow', actions);
    }

    function compute() {
        computeVehicleMetrics();
        computeStateMetrics();
    }

    function render() {
        renderKpis();
        renderTrends();
        renderSnapshot();
        renderVehicleTable();
        renderStateTable();
    }

    async function refresh() {
        await loadData();
        compute();
        render();
    }

    function bind() {
        $('fiWindowSelect').addEventListener('change', async (e) => {
            state.windowDays = Number(e.target.value || 90);
            await refresh();
        });

        $('fiRefreshBtn').addEventListener('click', async () => {
            await refresh();
        });

        $('fiVehicleSearch').addEventListener('input', () => {
            renderVehicleTable();
        });

        $('fiCloseDetail').addEventListener('click', () => {
            $('fiDetailTitle').textContent = 'Detail';
            $('fiDetailBody').innerHTML = '<p class="fi-detail-empty">Click any vehicle or state row to inspect fuel, trip, and IFTA context.</p>';
        });
    }

    function init() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'dashboard.html';
                return;
            }
            state.user = user;
            bind();
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