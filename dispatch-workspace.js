(function () {
    'use strict';

    const SECTIONS = ['overview', 'board', 'active-loads'];

    const state = {
        user: null,
        section: 'overview',
        drivers: [],
        trucks: [],
        trailers: [],
        loads: []
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

    function badge(status, prefix) {
        if (!status) return '';
        prefix = prefix || 'dsp';
        const cls = String(status).toLowerCase().replace(/\s+/g, '-');
        return '<span class="' + escapeHtml(prefix) + '-badge ' + escapeHtml(cls) + '">' + escapeHtml(status) + '</span>';
    }

    function driverName(driverId) {
        if (!driverId) return '—';
        const d = state.drivers.find(function (dr) { return dr.id === driverId; });
        return d ? ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || driverId : driverId;
    }

    function truckLabel(truckId) {
        if (!truckId) return '—';
        const t = state.trucks.find(function (tk) { return tk.id === truckId; });
        return t ? (t.name || t.unitNumber || t.truckNumber || truckId) : truckId;
    }

    function trailerLabel(trailerId) {
        if (!trailerId) return '—';
        const t = state.trailers.find(function (tl) { return tl.id === trailerId; });
        return t ? (t.name || t.unitNumber || t.trailerNumber || trailerId) : trailerId;
    }

    /* ── Data loading ──────────────────────────────────────── */

    async function loadDrivers() {
        try {
            const snap = await userCol('drivers').get();
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

    async function loadTrailers() {
        try {
            const snap = await userCol('trailers').get();
            state.trailers = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        } catch (e) {
            state.trailers = [];
        }
    }

    async function loadLoads() {
        try {
            const snap = await userCol('loads').orderBy('createdAt', 'desc').get();
            state.loads = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        } catch (e) {
            // loads collection may not exist yet
            state.loads = [];
        }
    }

    async function refreshData() {
        await Promise.all([loadDrivers(), loadTrucks(), loadTrailers(), loadLoads()]);
        renderSummaryCards();
        renderCurrentSection();
    }

    /* ── Summary cards ─────────────────────────────────────── */

    function renderSummaryCards() {
        const loads = state.loads;
        const total = loads.length;
        const active = loads.filter(function (l) {
            const s = String(l.status || '').toLowerCase();
            return s === 'in-transit' || s === 'active' || s === 'assigned';
        }).length;
        const pending = loads.filter(function (l) {
            return String(l.status || '').toLowerCase() === 'pending';
        }).length;
        const availableDrivers = state.drivers.filter(function (d) {
            return String(d.status || '').toLowerCase() === 'active' && !d.doNotDispatch;
        }).length;

        $('dcTotal').textContent = String(total);
        $('dcActive').textContent = String(active);
        $('dcPending').textContent = String(pending);
        $('dcAvailDrivers').textContent = String(availableDrivers);
    }

    /* ── Section switching ─────────────────────────────────── */

    function showSection(sectionId) {
        if (!SECTIONS.includes(sectionId)) sectionId = 'overview';
        state.section = sectionId;

        SECTIONS.forEach(function (s) {
            const el = $('section-' + s);
            if (el) el.classList.toggle('active', s === sectionId);
        });

        document.querySelectorAll('.dispatch-nav-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.section === sectionId);
        });

        const url = new URL(window.location.href);
        url.searchParams.set('section', sectionId);
        window.history.replaceState(null, '', url.toString());

        renderCurrentSection();
    }

    function renderCurrentSection() {
        switch (state.section) {
            case 'overview':    renderOverview();    break;
            case 'board':       renderBoard();       break;
            case 'active-loads': renderActiveLoads(); break;
        }
    }

    /* ── Overview ──────────────────────────────────────────── */

    function renderOverview() {
        // Loads summary
        const loadList = $('overviewLoadList');
        if (loadList) {
            const recent = state.loads.slice(0, 8);
            if (!recent.length) {
                loadList.innerHTML = '<div class="dsp-empty">No loads found. Create your first load to start dispatching.</div>';
            } else {
                loadList.innerHTML = recent.map(function (l) {
                    return '<div class="dsp-item">' +
                        '<div class="dsp-item-main">' +
                            '<div class="dsp-item-title">' + escapeHtml(l.loadNumber || l.id) + '</div>' +
                            '<div class="dsp-item-sub">' +
                                escapeHtml(l.origin || '?') + ' → ' + escapeHtml(l.destination || '?') +
                                ' · Driver: ' + escapeHtml(driverName(l.driverId || l.driver)) +
                            '</div>' +
                        '</div>' +
                        badge(l.status || 'pending') +
                    '</div>';
                }).join('');
            }
        }

        // Driver availability
        const driverList = $('overviewDriverList');
        if (driverList) {
            const available = state.drivers.filter(function (d) {
                return String(d.status || '').toLowerCase() === 'active' && !d.doNotDispatch;
            });
            if (!available.length) {
                driverList.innerHTML = '<div class="dsp-empty">No available drivers.</div>';
            } else {
                driverList.innerHTML = available.map(function (d) {
                    return '<div class="dsp-driver-row">' +
                        '<span><strong>' + escapeHtml(d.firstName || '') + ' ' + escapeHtml(d.lastName || '') + '</strong></span>' +
                        '<span>' + escapeHtml(truckLabel(d.truck)) + '</span>' +
                    '</div>';
                }).join('');
            }
        }
    }

    /* ── Board ─────────────────────────────────────────────── */

    function renderBoard() {
        const tbody = $('boardTableBody');
        if (!tbody) return;
        const query = ($('boardSearch').value || '').trim().toLowerCase();
        const loads = query
            ? state.loads.filter(function (l) {
                return [l.loadNumber, l.origin, l.destination, l.status, driverName(l.driverId || l.driver)]
                    .filter(Boolean).join(' ').toLowerCase().includes(query);
            })
            : state.loads;

        if (!loads.length) {
            $('boardTableWrap').style.display = 'none';
            $('boardEmpty').style.display = '';
            return;
        }
        $('boardEmpty').style.display = 'none';
        $('boardTableWrap').style.display = '';

        tbody.innerHTML = loads.map(function (l) {
            return '<tr>' +
                '<td><strong>' + escapeHtml(l.loadNumber || l.id) + '</strong></td>' +
                '<td>' + escapeHtml(l.origin || '—') + '</td>' +
                '<td>' + escapeHtml(l.destination || '—') + '</td>' +
                '<td>' + escapeHtml(driverName(l.driverId || l.driver)) + '</td>' +
                '<td>' + escapeHtml(truckLabel(l.truckId || l.truck)) + '</td>' +
                '<td>' + escapeHtml(trailerLabel(l.trailerId || l.trailer)) + '</td>' +
                '<td>' + escapeHtml(fmtDate(l.pickupDate || l.scheduledPickup)) + '</td>' +
                '<td>' + badge(l.status || 'pending') + '</td>' +
            '</tr>';
        }).join('');
    }

    /* ── Active loads ──────────────────────────────────────── */

    function renderActiveLoads() {
        const list = $('activeLoadsList');
        if (!list) return;
        const active = state.loads.filter(function (l) {
            const s = String(l.status || '').toLowerCase();
            return s === 'in-transit' || s === 'active' || s === 'assigned';
        });

        if (!active.length) {
            list.innerHTML = '<div class="dsp-empty">No active loads in transit.</div>';
            return;
        }

        list.innerHTML = active.map(function (l) {
            return '<div class="dsp-item">' +
                '<div class="dsp-item-main">' +
                    '<div class="dsp-item-title">' +
                        escapeHtml(l.loadNumber || l.id) + ' · ' +
                        escapeHtml(l.origin || '?') + ' → ' + escapeHtml(l.destination || '?') +
                    '</div>' +
                    '<div class="dsp-item-sub">' +
                        'Driver: ' + escapeHtml(driverName(l.driverId || l.driver)) +
                        ' · Truck: ' + escapeHtml(truckLabel(l.truckId || l.truck)) +
                        ' · Pickup: ' + escapeHtml(fmtDate(l.pickupDate || l.scheduledPickup)) +
                    '</div>' +
                '</div>' +
                badge(l.status || 'in-transit') +
            '</div>';
        }).join('');
    }

    /* ── Event bindings ────────────────────────────────────── */

    function bindEvents() {
        document.querySelectorAll('.dispatch-nav-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                showSection(tab.dataset.section);
            });
        });

        const boardSearch = $('boardSearch');
        if (boardSearch) {
            boardSearch.addEventListener('input', function () { renderBoard(); });
        }

        const refreshBtn = $('refreshDispatchBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () { refreshData(); });
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
