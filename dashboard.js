/* ==========================================
   CARRIER DASHBOARD – JavaScript
   ========================================== */

(function () {
    'use strict';

    // ── State ──────────────────────────────
    const state = {
        user: null,
        trucks: [],
        trailers: [],
        drivers: [],
        profile: {}
    };

    // ── US / CA jurisdictions for Base State dropdown ──
    const JURISDICTIONS = [
        { code: 'AL', name: 'Alabama' }, { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
        { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' }, { code: 'CT', name: 'Connecticut' },
        { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
        { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
        { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
        { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
        { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
        { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
        { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
        { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
        { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
        { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
        { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
        { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
        { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
        { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
        { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' }, { code: 'MB', name: 'Manitoba' },
        { code: 'NB', name: 'New Brunswick' }, { code: 'NL', name: 'Newfoundland' }, { code: 'NS', name: 'Nova Scotia' },
        { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' }, { code: 'QC', name: 'Quebec' },
        { code: 'SK', name: 'Saskatchewan' }
    ];

    // ── Helpers ────────────────────────────
    function $(id) { return document.getElementById(id); }
    function uid() { return state.user ? state.user.uid : null; }
    function col(name) { return db.collection('users').doc(uid()).collection(name); }
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Auth Guard ─────────────────────────
    function initAuth() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }
            state.user = user;
            $('dashUserEmail').textContent = user.email || '';
            await loadAll();
        });
    }

    // ── Navigation ────────────────────────
    function initNav() {
        document.querySelectorAll('.dash-nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = btn.dataset.section;
                document.querySelectorAll('.dash-nav-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
                $('section-' + section).classList.add('active');
                $('pageTitle').textContent = btn.querySelector('span').textContent;
            });
        });
    }

    // ── Load All Data ─────────────────────
    async function loadAll() {
        await Promise.all([loadProfile(), loadTrucks(), loadTrailers(), loadDrivers()]);
        updateOverview();
    }

    // ── PROFILE ───────────────────────────
    async function loadProfile() {
        try {
            const doc = await db.collection('users').doc(uid()).get();
            const data = doc.exists ? doc.data() : {};
            state.profile = data;

            // Hero area
            $('dashProfileName').textContent = data.name || state.user.displayName || 'User';
            $('dashProfileEmail').textContent = state.user.email || '';

            // Avatar
            const photoUrl = state.user.photoURL || localStorage.getItem('ifta_avatar') || null;
            const photoEl = $('dashProfilePhoto');
            if (photoUrl) {
                photoEl.innerHTML = '';
                const img = document.createElement('img');
                img.src = photoUrl;
                img.alt = 'Profile';
                photoEl.appendChild(img);
            } else {
                photoEl.textContent = (data.name || state.user.displayName || 'U').charAt(0).toUpperCase();
            }

            // User profile fields
            $('dashFullName').value = data.name || state.user.displayName || '';
            $('dashEmail').value = state.user.email || '';
            $('dashPhone').value = data.phone || '';

            // Company fields
            $('dashCompany').value = data.company || '';
            $('dashDotNumber').value = data.dotNumber || '';
            $('dashMcNumber').value = data.mcNumber || '';
            $('dashEin').value = data.ein || '';
            $('dashAddress').value = data.address || '';
            $('dashFleetSize').value = data.fleetSize || '';
            $('dashBaseState').value = data.baseState || '';
        } catch (e) {
            console.error('Error loading profile:', e);
        }
    }

    function initProfileForm() {
        // Populate base state dropdown
        const sel = $('dashBaseState');
        JURISDICTIONS.forEach(j => {
            const opt = document.createElement('option');
            opt.value = j.code;
            opt.textContent = j.name + ' (' + j.code + ')';
            sel.appendChild(opt);
        });

        // Avatar upload
        $('dashAvatarUpload').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2 MB'); return; }
            try {
                const dataUrl = await resizeImage(file, 150);
                const photoEl = $('dashProfilePhoto');
                photoEl.innerHTML = '';
                const img = document.createElement('img');
                img.src = dataUrl;
                img.alt = 'Profile';
                photoEl.appendChild(img);
                localStorage.setItem('ifta_avatar', dataUrl);
                await db.collection('users').doc(uid()).set({ avatarBase64: dataUrl }, { merge: true });
            } catch (err) {
                console.error('Avatar upload error:', err);
            }
        });

        // Save user profile
        $('dashProfileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                name: $('dashFullName').value.trim(),
                phone: $('dashPhone').value.trim(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                await db.collection('users').doc(uid()).set(payload, { merge: true });
                $('dashProfileName').textContent = payload.name || 'User';
                showMsg('Profile saved');
            } catch (err) {
                console.error('Save profile error:', err);
                showMsg('Error saving profile', true);
            }
        });

        // Save company info
        $('dashCompanyForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                company: $('dashCompany').value.trim(),
                dotNumber: $('dashDotNumber').value.trim(),
                mcNumber: $('dashMcNumber').value.trim(),
                ein: $('dashEin').value.trim(),
                address: $('dashAddress').value.trim(),
                fleetSize: $('dashFleetSize').value,
                baseState: $('dashBaseState').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                await db.collection('users').doc(uid()).set(payload, { merge: true });
                showMsg('Company info saved');
            } catch (err) {
                console.error('Save company error:', err);
                showMsg('Error saving company info', true);
            }
        });
    }

    function resizeImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = maxSize;
                    canvas.height = maxSize;
                    const ctx = canvas.getContext('2d');
                    const min = Math.min(img.width, img.height);
                    const sx = (img.width - min) / 2;
                    const sy = (img.height - min) / 2;
                    ctx.drawImage(img, sx, sy, min, min, 0, 0, maxSize, maxSize);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ── TRUCKS ────────────────────────────
    async function loadTrucks() {
        try {
            const snap = await col('trucks').orderBy('unit').get();
            state.trucks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderTrucks();
            updateCount('truckCount', state.trucks.length);
        } catch (e) { console.error('Load trucks error:', e); }
    }

    function renderTrucks() {
        const tbody = $('trucksTableBody');
        const table = $('trucksTable');
        const empty = $('trucksEmpty');
        if (state.trucks.length === 0) {
            table.style.display = 'none';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        table.style.display = '';
        const filtered = state.trucks.filter(t => matchesFilter(t, 'truck'));
        tbody.innerHTML = filtered.map(t => `<tr data-id="${t.id}">
            <td><div class="cell cell-editable" data-field="unit" data-id="${t.id}" data-collection="trucks"><strong>${escapeHtml(t.unit)}</strong></div></td>
            <td><div class="cell cell-editable" data-field="vehicle" data-id="${t.id}" data-collection="trucks">${vehicleLabel(t.year, t.make, t.model)}</div></td>
            <td><div class="cell cell-editable" data-field="vin" data-id="${t.id}" data-collection="trucks" title="${escapeHtml(t.vin)}">${shortenVin(t.vin)}</div></td>
            <td><div class="cell cell-editable" data-field="plate" data-id="${t.id}" data-collection="trucks">${escapeHtml(t.plate)}${t.plateState ? ' <span class="text-muted">(' + escapeHtml(t.plateState) + ')</span>' : ''}</div></td>
            <td><div class="cell cell-editable" data-field="fuel" data-id="${t.id}" data-collection="trucks">${fuelLabel(t.fuel)}</div></td>
            <td><div class="cell">${statusSelect(t.status, t.id, 'trucks', 'truck')}</div></td>
            <td class="row-actions"><div class="cell">
                <button title="Edit" onclick="Dashboard.editTruck('${t.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button title="Delete" class="btn-delete" onclick="Dashboard.deleteTruck('${t.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div></td>
        </tr>`).join('');
    }

    function openTruckModal(data) {
        $('truckModalTitle').textContent = data ? 'Edit Truck' : 'Add Truck';
        $('truckEditId').value = data ? data.id : '';
        $('truckUnit').value = data ? data.unit || '' : '';
        $('truckYear').value = data ? data.year || '' : '';
        $('truckMake').value = data ? data.make || '' : '';
        $('truckModel').value = data ? data.model || '' : '';
        $('truckVin').value = data ? data.vin || '' : '';
        $('truckPlate').value = data ? data.plate || '' : '';
        $('truckPlateState').value = data ? data.plateState || '' : '';
        $('truckFuel').value = data ? data.fuel || 'diesel' : 'diesel';
        $('truckStatus').value = data ? data.status || 'active' : 'active';
        $('truckModal').classList.remove('hidden');
    }

    function initTruckForm() {
        $('addTruckBtn').addEventListener('click', () => openTruckModal(null));
        $('addFirstTruck').addEventListener('click', () => openTruckModal(null));
        $('closeTruckModal').addEventListener('click', () => $('truckModal').classList.add('hidden'));
        $('cancelTruck').addEventListener('click', () => $('truckModal').classList.add('hidden'));

        $('truckForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                unit: $('truckUnit').value.trim(),
                year: $('truckYear').value.trim(),
                make: $('truckMake').value.trim(),
                model: $('truckModel').value.trim(),
                vin: $('truckVin').value.trim(),
                plate: $('truckPlate').value.trim(),
                plateState: $('truckPlateState').value.trim().toUpperCase(),
                fuel: $('truckFuel').value,
                status: $('truckStatus').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                const editId = $('truckEditId').value;
                if (editId) {
                    await col('trucks').doc(editId).update(payload);
                } else {
                    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await col('trucks').add(payload);
                }
                $('truckModal').classList.add('hidden');
                await loadTrucks();
                populateTruckDropdown();
                showMsg(editId ? 'Truck updated' : 'Truck added');
            } catch (err) {
                console.error('Save truck error:', err);
                showMsg('Error saving truck', true);
            }
        });
    }

    // ── TRAILERS ──────────────────────────
    async function loadTrailers() {
        try {
            const snap = await col('trailers').orderBy('unit').get();
            state.trailers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderTrailers();
            updateCount('trailerCount', state.trailers.length);
        } catch (e) { console.error('Load trailers error:', e); }
    }

    function renderTrailers() {
        const tbody = $('trailersTableBody');
        const table = $('trailersTable');
        const empty = $('trailersEmpty');
        if (state.trailers.length === 0) {
            table.style.display = 'none';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        table.style.display = '';
        const filtered = state.trailers.filter(t => matchesFilter(t, 'trailer'));
        tbody.innerHTML = filtered.map(t => `<tr data-id="${t.id}">
            <td><div class="cell cell-editable" data-field="unit" data-id="${t.id}" data-collection="trailers"><strong>${escapeHtml(t.unit)}</strong></div></td>
            <td><div class="cell cell-editable" data-field="year" data-id="${t.id}" data-collection="trailers">${escapeHtml(t.year)}</div></td>
            <td><div class="cell cell-editable" data-field="make" data-id="${t.id}" data-collection="trailers">${escapeHtml(t.make)}</div></td>
            <td><div class="cell cell-editable" data-field="type" data-id="${t.id}" data-collection="trailers">${escapeHtml(t.type)}</div></td>
            <td><div class="cell cell-editable" data-field="vin" data-id="${t.id}" data-collection="trailers">${escapeHtml(t.vin)}</div></td>
            <td><div class="cell cell-editable" data-field="plate" data-id="${t.id}" data-collection="trailers">${escapeHtml(t.plate)}</div></td>
            <td><div class="cell">${statusSelect(t.status, t.id, 'trailers', 'trailer')}</div></td>
            <td class="row-actions"><div class="cell">
                <button title="Edit" onclick="Dashboard.editTrailer('${t.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button title="Delete" class="btn-delete" onclick="Dashboard.deleteTrailer('${t.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div></td>
        </tr>`).join('');
    }

    function openTrailerModal(data) {
        $('trailerModalTitle').textContent = data ? 'Edit Trailer' : 'Add Trailer';
        $('trailerEditId').value = data ? data.id : '';
        $('trailerUnit').value = data ? data.unit || '' : '';
        $('trailerYear').value = data ? data.year || '' : '';
        $('trailerMake').value = data ? data.make || '' : '';
        $('trailerType').value = data ? data.type || 'dry-van' : 'dry-van';
        $('trailerVin').value = data ? data.vin || '' : '';
        $('trailerPlate').value = data ? data.plate || '' : '';
        $('trailerStatus').value = data ? data.status || 'active' : 'active';
        $('trailerModal').classList.remove('hidden');
    }

    function initTrailerForm() {
        $('addTrailerBtn').addEventListener('click', () => openTrailerModal(null));
        $('addFirstTrailer').addEventListener('click', () => openTrailerModal(null));
        $('closeTrailerModal').addEventListener('click', () => $('trailerModal').classList.add('hidden'));
        $('cancelTrailer').addEventListener('click', () => $('trailerModal').classList.add('hidden'));

        $('trailerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                unit: $('trailerUnit').value.trim(),
                year: $('trailerYear').value.trim(),
                make: $('trailerMake').value.trim(),
                type: $('trailerType').value,
                vin: $('trailerVin').value.trim(),
                plate: $('trailerPlate').value.trim(),
                status: $('trailerStatus').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                const editId = $('trailerEditId').value;
                if (editId) {
                    await col('trailers').doc(editId).update(payload);
                } else {
                    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await col('trailers').add(payload);
                }
                $('trailerModal').classList.add('hidden');
                await loadTrailers();
                showMsg(editId ? 'Trailer updated' : 'Trailer added');
            } catch (err) {
                console.error('Save trailer error:', err);
                showMsg('Error saving trailer', true);
            }
        });
    }

    // ── DRIVERS ───────────────────────────
    async function loadDrivers() {
        try {
            const snap = await col('drivers').orderBy('lastName').get();
            state.drivers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderDrivers();
            updateCount('driverCount', state.drivers.length);
        } catch (e) { console.error('Load drivers error:', e); }
    }

    function renderDrivers() {
        const tbody = $('driversTableBody');
        const table = $('driversTable');
        const empty = $('driversEmpty');
        if (state.drivers.length === 0) {
            table.style.display = 'none';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        table.style.display = '';
        const filtered = state.drivers.filter(d => matchesFilter(d, 'driver'));
        tbody.innerHTML = filtered.map(d => `<tr data-id="${d.id}">
            <td><div class="cell cell-editable" data-field="name" data-id="${d.id}" data-collection="drivers"><strong>${escapeHtml(d.firstName)} ${escapeHtml(d.lastName)}</strong></div></td>
            <td><div class="cell cell-editable" data-field="cdl" data-id="${d.id}" data-collection="drivers">${escapeHtml(d.cdl)}</div></td>
            <td><div class="cell cell-editable" data-field="cdlState" data-id="${d.id}" data-collection="drivers">${escapeHtml(d.cdlState)}</div></td>
            <td><div class="cell cell-editable" data-field="cdlExp" data-id="${d.id}" data-collection="drivers">${escapeHtml(d.cdlExp)}</div></td>
            <td><div class="cell cell-editable" data-field="phone" data-id="${d.id}" data-collection="drivers">${escapeHtml(d.phone)}</div></td>
            <td><div class="cell cell-editable" data-field="email" data-id="${d.id}" data-collection="drivers">${escapeHtml(d.email)}</div></td>
            <td><div class="cell">${escapeHtml(truckLabel(d.truck))}</div></td>
            <td><div class="cell">${statusSelect(d.status, d.id, 'drivers', 'driver')}</div></td>
            <td class="row-actions"><div class="cell">
                <button title="Edit" onclick="Dashboard.editDriver('${d.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button title="Delete" class="btn-delete" onclick="Dashboard.deleteDriver('${d.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div></td>
        </tr>`).join('');
    }

    function openDriverModal(data) {
        $('driverModalTitle').textContent = data ? 'Edit Driver' : 'Add Driver';
        $('driverEditId').value = data ? data.id : '';
        $('driverFirstName').value = data ? data.firstName || '' : '';
        $('driverLastName').value = data ? data.lastName || '' : '';
        $('driverCdl').value = data ? data.cdl || '' : '';
        $('driverCdlState').value = data ? data.cdlState || '' : '';
        $('driverCdlExp').value = data ? data.cdlExp || '' : '';
        $('driverMedExp').value = data ? data.medExp || '' : '';
        $('driverPhone').value = data ? data.phone || '' : '';
        $('driverEmail').value = data ? data.email || '' : '';
        $('driverTruck').value = data ? data.truck || '' : '';
        $('driverStatus').value = data ? data.status || 'active' : 'active';
        populateTruckDropdown();
        $('driverModal').classList.remove('hidden');
    }

    function initDriverForm() {
        $('addDriverBtn').addEventListener('click', () => openDriverModal(null));
        $('addFirstDriver').addEventListener('click', () => openDriverModal(null));
        $('closeDriverModal').addEventListener('click', () => $('driverModal').classList.add('hidden'));
        $('cancelDriver').addEventListener('click', () => $('driverModal').classList.add('hidden'));

        $('driverForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                firstName: $('driverFirstName').value.trim(),
                lastName: $('driverLastName').value.trim(),
                cdl: $('driverCdl').value.trim(),
                cdlState: $('driverCdlState').value.trim().toUpperCase(),
                cdlExp: $('driverCdlExp').value,
                medExp: $('driverMedExp').value,
                phone: $('driverPhone').value.trim(),
                email: $('driverEmail').value.trim(),
                truck: $('driverTruck').value,
                status: $('driverStatus').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                const editId = $('driverEditId').value;
                if (editId) {
                    await col('drivers').doc(editId).update(payload);
                } else {
                    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await col('drivers').add(payload);
                }
                $('driverModal').classList.add('hidden');
                await loadDrivers();
                showMsg(editId ? 'Driver updated' : 'Driver added');
            } catch (err) {
                console.error('Save driver error:', err);
                showMsg('Error saving driver', true);
            }
        });
    }

    // ── Shared Helpers ────────────────────
    function statusLabel(val) {
        const map = {
            active: 'Active', inactive: 'Inactive',
            maintenance: 'Maintenance', 'on-leave': 'On Leave'
        };
        return map[val] || 'Active';
    }

    function statusBadge(val) {
        const s = val || 'active';
        return `<span class="status-badge ${escapeHtml(s)}"><span class="status-dot"></span>${statusLabel(s)}</span>`;
    }

    function statusSelect(val, id, collection, type) {
        const s = val || 'active';
        const options = type === 'driver'
            ? [['active', 'Active'], ['inactive', 'Inactive'], ['on-leave', 'On Leave']]
            : [['active', 'Active'], ['inactive', 'Out of Service'], ['maintenance', 'In Maintenance']];
        const opts = options.map(([v, l]) => `<option value="${v}"${v === s ? ' selected' : ''}>${l}</option>`).join('');
        return `<select class="cell-status-select status-badge ${escapeHtml(s)}" data-id="${id}" data-collection="${collection}" onchange="Dashboard.inlineStatus(this)">${opts}</select>`;
    }

    function vehicleLabel(year, make, model) {
        const parts = [year, make, model].filter(Boolean).map(v => escapeHtml(String(v)));
        return parts.length ? parts.join(' ') : '—';
    }

    function shortenVin(vin) {
        if (!vin) return '—';
        const v = String(vin);
        return v.length > 10 ? '…' + escapeHtml(v.slice(-8)) : escapeHtml(v);
    }

    function fuelLabel(val) {
        const map = { diesel: 'Diesel', gasoline: 'Gas', cng: 'CNG', lng: 'LNG' };
        return map[val] || escapeHtml(val || '—');
    }

    function truckLabel(truckId) {
        if (!truckId) return '—';
        const t = state.trucks.find(tr => tr.id === truckId);
        return t ? ('Unit ' + t.unit) : '—';
    }

    // ── Inline Editing Engine ──────────────
    function initInlineEditing() {
        document.addEventListener('click', (e) => {
            const cell = e.target.closest('.cell-editable');
            if (!cell || cell.querySelector('.cell-input')) return;
            startInlineEdit(cell);
        });
    }

    function startInlineEdit(cell) {
        const field = cell.dataset.field;
        const id = cell.dataset.id;
        const collection = cell.dataset.collection;

        // Resolve current value from state
        const stateArr = collection === 'trucks' ? state.trucks : collection === 'trailers' ? state.trailers : state.drivers;
        const item = stateArr.find(x => x.id === id);
        if (!item) return;

        let currentVal = '';
        if (field === 'vehicle') currentVal = [item.year || '', item.make || '', item.model || ''].join(' ').trim();
        else if (field === 'name') currentVal = (item.firstName || '') + ' ' + (item.lastName || '');
        else if (field === 'plate' && collection === 'trucks') currentVal = (item.plate || '') + (item.plateState ? ' ' + item.plateState : '');
        else currentVal = item[field] || '';

        const inputType = field === 'cdlExp' ? 'date' : 'text';
        const input = document.createElement('input');
        input.type = inputType;
        input.className = 'cell-input';
        input.value = String(currentVal);

        // Mark row as editing
        const row = cell.closest('tr');
        if (row) row.classList.add('row-editing');

        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        if (inputType === 'text') input.select();

        const commit = async () => {
            const newVal = input.value.trim();
            if (row) row.classList.remove('row-editing');

            // Build update payload
            const payload = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            if (field === 'vehicle') {
                const parts = newVal.split(/\s+/);
                payload.year = parts[0] || '';
                payload.make = parts[1] || '';
                payload.model = parts.slice(2).join(' ') || '';
            } else if (field === 'name') {
                const parts = newVal.split(/\s+/);
                payload.firstName = parts[0] || '';
                payload.lastName = parts.slice(1).join(' ') || '';
            } else if (field === 'plate' && collection === 'trucks') {
                const parts = newVal.split(/\s+/);
                if (parts.length > 1) {
                    const last = parts[parts.length - 1];
                    if (last.length === 2 && /^[A-Za-z]{2}$/.test(last)) {
                        payload.plateState = last.toUpperCase();
                        payload.plate = parts.slice(0, -1).join(' ');
                    } else {
                        payload.plate = newVal;
                    }
                } else {
                    payload.plate = newVal;
                }
            } else {
                payload[field] = field === 'cdlState' || field === 'plateState' ? newVal.toUpperCase() : newVal;
            }

            try {
                await col(collection).doc(id).update(payload);
                // Update local state
                Object.assign(item, payload);
                delete item.updatedAt;
                // Re-render the table
                if (collection === 'trucks') { renderTrucks(); populateTruckDropdown(); }
                else if (collection === 'trailers') renderTrailers();
                else renderDrivers();
            } catch (err) {
                console.error('Inline edit error:', err);
                showMsg('Error saving change', true);
                // Re-render to restore original
                if (collection === 'trucks') renderTrucks();
                else if (collection === 'trailers') renderTrailers();
                else renderDrivers();
            }
        };

        let committed = false;
        input.addEventListener('blur', () => { if (!committed) { committed = true; commit(); } });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') {
                if (row) row.classList.remove('row-editing');
                committed = true;
                // Re-render without saving
                if (collection === 'trucks') renderTrucks();
                else if (collection === 'trailers') renderTrailers();
                else renderDrivers();
            }
            // Tab to next editable cell
            if (e.key === 'Tab') {
                e.preventDefault();
                input.blur();
                setTimeout(() => {
                    const allCells = Array.from(document.querySelectorAll(
                        `[data-collection="${collection}"].cell-editable`
                    ));
                    const idx = allCells.findIndex(c => c.dataset.id === id && c.dataset.field === field);
                    const next = e.shiftKey ? allCells[idx - 1] : allCells[idx + 1];
                    if (next) next.click();
                }, 50);
            }
        });
    }

    async function inlineStatus(select) {
        const id = select.dataset.id;
        const collection = select.dataset.collection;
        const newStatus = select.value;

        try {
            await col(collection).doc(id).update({
                status: newStatus,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            const stateArr = collection === 'trucks' ? state.trucks : collection === 'trailers' ? state.trailers : state.drivers;
            const item = stateArr.find(x => x.id === id);
            if (item) item.status = newStatus;

            // Re-render
            if (collection === 'trucks') { renderTrucks(); populateTruckDropdown(); }
            else if (collection === 'trailers') renderTrailers();
            else renderDrivers();
            updateOverview();
            showMsg('Status updated');
        } catch (err) {
            console.error('Status update error:', err);
            showMsg('Error updating status', true);
        }
    }

    // ── Search / Filter ──────────────────
    function matchesFilter(item, type) {
        const searchEl = $(type + 'Search');
        const filterEl = $(type + 'StatusFilter');
        const q = searchEl ? searchEl.value.toLowerCase().trim() : '';
        const f = filterEl ? filterEl.value : '';

        if (f && item.status !== f) return false;
        if (!q) return true;

        if (type === 'truck') {
            return [item.unit, item.make, item.model, item.year, item.vin, item.plate].some(v => v && String(v).toLowerCase().includes(q));
        }
        if (type === 'trailer') {
            return [item.unit, item.make, item.year, item.type, item.vin, item.plate].some(v => v && String(v).toLowerCase().includes(q));
        }
        if (type === 'driver') {
            return [item.firstName, item.lastName, item.cdl, item.cdlState, item.phone, item.email].some(v => v && String(v).toLowerCase().includes(q));
        }
        return true;
    }

    function initSearchFilters() {
        ['truckSearch', 'truckStatusFilter'].forEach(id => {
            const el = $(id);
            if (el) el.addEventListener('input', renderTrucks);
        });
        ['trailerSearch', 'trailerStatusFilter'].forEach(id => {
            const el = $(id);
            if (el) el.addEventListener('input', renderTrailers);
        });
        ['driverSearch', 'driverStatusFilter'].forEach(id => {
            const el = $(id);
            if (el) el.addEventListener('input', renderDrivers);
        });
    }

    // ── Operational Alerts ────────────────
    function updateAlerts() {
        const alerts = [];
        const today = new Date().toISOString().split('T')[0];
        const soon = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

        // Drivers with expiring CDL (within 30 days)
        const expiringCdl = state.drivers.filter(d => d.cdlExp && d.cdlExp >= today && d.cdlExp <= soon);
        if (expiringCdl.length) {
            alerts.push({ type: 'warning', icon: 'clock', text: expiringCdl.length + ' driver' + (expiringCdl.length > 1 ? 's' : '') + ' with CDL expiring within 30 days' });
        }

        // Expired CDLs
        const expiredCdl = state.drivers.filter(d => d.cdlExp && d.cdlExp < today);
        if (expiredCdl.length) {
            alerts.push({ type: 'danger', icon: 'alert', text: expiredCdl.length + ' driver' + (expiredCdl.length > 1 ? 's' : '') + ' with expired CDL' });
        }

        // Trucks in maintenance
        const maint = state.trucks.filter(t => t.status === 'maintenance');
        if (maint.length) {
            alerts.push({ type: 'warning', icon: 'wrench', text: maint.length + ' truck' + (maint.length > 1 ? 's' : '') + ' in maintenance' });
        }

        // Unassigned active drivers
        const unassigned = state.drivers.filter(d => d.status === 'active' && !d.truck);
        if (unassigned.length) {
            alerts.push({ type: 'info', icon: 'user', text: unassigned.length + ' active driver' + (unassigned.length > 1 ? 's' : '') + ' unassigned to a truck' });
        }

        const container = $('overviewAlerts');
        if (!container) return;

        if (alerts.length === 0) {
            container.innerHTML = '';
            return;
        }

        const iconMap = {
            clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
            alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
            user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
        };

        container.innerHTML = alerts.map(a =>
            `<div class="alert-item alert-${escapeHtml(a.type)}">${iconMap[a.icon] || ''}<span>${escapeHtml(a.text)}</span></div>`
        ).join('');
    }

    function populateTruckDropdown() {
        const sel = $('driverTruck');
        const current = sel.value;
        sel.innerHTML = '<option value="">Unassigned</option>';
        state.trucks.filter(t => t.status === 'active').forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = 'Unit ' + t.unit + (t.make ? ' – ' + t.make + ' ' + (t.model || '') : '');
            sel.appendChild(opt);
        });
        sel.value = current;
    }

    function updateCount(elId, n) {
        const el = $(elId);
        if (el) el.textContent = n;
    }

    function updateOverview() {
        const activeTrucks = state.trucks.filter(t => t.status === 'active').length;
        const activeTrailers = state.trailers.filter(t => t.status === 'active').length;
        const activeDrivers = state.drivers.filter(d => d.status === 'active').length;
        const maintenance = state.trucks.filter(t => t.status === 'maintenance').length
            + state.trailers.filter(t => t.status === 'maintenance').length;
        const oos = state.trucks.filter(t => t.status === 'inactive').length
            + state.trailers.filter(t => t.status === 'inactive').length;

        $('overviewTrucks').textContent = state.trucks.length;
        $('overviewTrailers').textContent = state.trailers.length;
        $('overviewDrivers').textContent = state.drivers.length;
        $('overviewActive').textContent = activeTrucks + activeTrailers;
        $('overviewActiveTrucks').textContent = activeTrucks;
        $('overviewActiveTrailers').textContent = activeTrailers;
        $('overviewActiveDrivers').textContent = activeDrivers;
        $('overviewMaintenance').textContent = maintenance;
        $('overviewOutOfService').textContent = oos;
        updateAlerts();
    }

    function showMsg(text, isError) {
        if (typeof showToast === 'function') {
            showToast(text, isError ? 'error' : 'success');
            return;
        }
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

    // ── Delete confirms ───────────────────
    async function deleteTruck(id) {
        if (!confirm('Delete this truck?')) return;
        try {
            await col('trucks').doc(id).delete();
            await loadTrucks();
            populateTruckDropdown();
            showMsg('Truck deleted');
        } catch (err) { console.error(err); showMsg('Error deleting truck', true); }
    }

    async function deleteTrailer(id) {
        if (!confirm('Delete this trailer?')) return;
        try {
            await col('trailers').doc(id).delete();
            await loadTrailers();
            showMsg('Trailer deleted');
        } catch (err) { console.error(err); showMsg('Error deleting trailer', true); }
    }

    async function deleteDriver(id) {
        if (!confirm('Delete this driver?')) return;
        try {
            await col('drivers').doc(id).delete();
            await loadDrivers();
            showMsg('Driver deleted');
        } catch (err) { console.error(err); showMsg('Error deleting driver', true); }
    }

    // ── Edit helpers (called from inline onclick) ──
    function editTruck(id) {
        const t = state.trucks.find(x => x.id === id);
        if (t) openTruckModal(t);
    }
    function editTrailer(id) {
        const t = state.trailers.find(x => x.id === id);
        if (t) openTrailerModal(t);
    }
    function editDriver(id) {
        const d = state.drivers.find(x => x.id === id);
        if (d) openDriverModal(d);
    }

    // ── Close modals on backdrop click ────
    function initModalBackdrops() {
        ['truckModal', 'trailerModal', 'driverModal'].forEach(id => {
            $(id).addEventListener('click', (e) => {
                if (e.target === $(id)) $(id).classList.add('hidden');
            });
        });
    }

    // ── Overview card click → navigate ─────
    function initOverviewCards() {
        document.querySelectorAll('.overview-card[data-nav]').forEach(card => {
            card.addEventListener('click', () => {
                const target = card.dataset.nav;
                const btn = document.querySelector('.dash-nav-item[data-section="' + target + '"]');
                if (btn) btn.click();
            });
        });
    }

    // ── Init ──────────────────────────────
    function init() {
        initNav();
        initOverviewCards();
        initProfileForm();
        initTruckForm();
        initTrailerForm();
        initDriverForm();
        initModalBackdrops();
        initSearchFilters();
        initInlineEditing();
        initAuth();
    }

    // Expose edit/delete/inline methods for inline onclick
    window.Dashboard = {
        editTruck, editTrailer, editDriver,
        deleteTruck, deleteTrailer, deleteDriver,
        inlineStatus
    };

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
