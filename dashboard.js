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
        const modal = $('truckModal');
        const shouldExpand = data && hasAdvancedData([data.vin, data.plate, data.plateState, data.fuel !== 'diesel' ? data.fuel : '']);
        setExpandState(modal, shouldExpand);
        modal.classList.remove('hidden');
    }

    function initTruckForm() {
        $('addTruckBtn').addEventListener('click', () => openSheetModal('truck'));
        $('addFirstTruck').addEventListener('click', () => openSheetModal('truck'));
        $('closeTruckModal').addEventListener('click', () => $('truckModal').classList.add('hidden'));
        $('cancelTruck').addEventListener('click', () => $('truckModal').classList.add('hidden'));

        // Import – trigger CSV file picker
        const importBtn = $('importTrucksBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv,.tsv,.txt';
                input.addEventListener('change', (e) => importTrucksFromFile(e.target.files[0]));
                input.click();
            });
        }

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

    async function importTrucksFromFile(file) {
        if (!file) return;
        try {
            const text = await file.text();
            const sep = text.includes('\t') ? '\t' : ',';
            const lines = text.trim().split('\n').map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
            if (lines.length < 2) { showMsg('File must have a header row and data', true); return; }
            const header = lines[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
            const colMap = {};
            const aliases = {
                unit: ['unit', 'unitnumber', 'unitno', 'truckno', 'trucknumber'],
                year: ['year', 'yr', 'modelyear'],
                make: ['make', 'manufacturer', 'brand'],
                model: ['model'],
                vin: ['vin', 'vehicleid'],
                plate: ['plate', 'licenseplate', 'licenseplatenumber', 'tag'],
                plateState: ['platestate', 'state', 'tagstate'],
                fuel: ['fuel', 'fueltype'],
                status: ['status']
            };
            for (const [field, names] of Object.entries(aliases)) {
                const idx = header.findIndex(h => names.includes(h));
                if (idx !== -1) colMap[field] = idx;
            }
            if (!('unit' in colMap)) { showMsg('CSV must have a "Unit" column', true); return; }
            let count = 0;
            const batch = firebase.firestore().batch();
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                if (!row[colMap.unit]) continue;
                const doc = col('trucks').doc();
                const payload = {
                    unit: row[colMap.unit] || '',
                    year: colMap.year !== undefined ? row[colMap.year] || '' : '',
                    make: colMap.make !== undefined ? row[colMap.make] || '' : '',
                    model: colMap.model !== undefined ? row[colMap.model] || '' : '',
                    vin: colMap.vin !== undefined ? row[colMap.vin] || '' : '',
                    plate: colMap.plate !== undefined ? row[colMap.plate] || '' : '',
                    plateState: colMap.plateState !== undefined ? (row[colMap.plateState] || '').toUpperCase() : '',
                    fuel: colMap.fuel !== undefined ? row[colMap.fuel] || 'diesel' : 'diesel',
                    status: colMap.status !== undefined ? row[colMap.status] || 'active' : 'active',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                batch.set(doc, payload);
                count++;
            }
            if (count === 0) { showMsg('No valid rows found', true); return; }
            await batch.commit();
            await loadTrucks();
            populateTruckDropdown();
            showMsg(count + ' truck' + (count > 1 ? 's' : '') + ' imported');
        } catch (err) {
            console.error('Import trucks error:', err);
            showMsg('Error importing file', true);
        }
    }

    // ── SHEET MODAL SYSTEM (Trucks, Trailers, Drivers) ──
    const SHEET_CONFIGS = {
        truck: {
            cols: [
                { key: 'unit', placeholder: 'e.g., 101', type: 'text', required: true },
                { key: 'year', placeholder: 'e.g., 2022', type: 'number' },
                { key: 'make', placeholder: 'e.g., Freightliner', type: 'text' },
                { key: 'model', placeholder: 'e.g., Cascadia', type: 'text' },
                { key: 'vin', placeholder: '17-character VIN', type: 'text', maxlength: 17 },
                { key: 'plate', placeholder: 'e.g., ABC 1234', type: 'text' },
                { key: 'plateState', placeholder: 'TX', type: 'text', maxlength: 2 },
                { key: 'fuel', type: 'select', defaultLabel: 'Diesel', options: [
                    { value: 'diesel', label: 'Diesel' },
                    { value: 'gasoline', label: 'Gasoline' },
                    { value: 'cng', label: 'CNG' },
                    { value: 'lng', label: 'LNG' }
                ]},
                { key: 'status', type: 'select', defaultLabel: 'Active', options: [
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Out of Service' },
                    { value: 'maintenance', label: 'In Maintenance' }
                ]}
            ],
            collection: 'trucks',
            label: 'truck',
            requiredKey: 'unit',
            duplicateKey: 'unit',
            modalId: 'multiTruckModal',
            tbodyId: 'multiTruckBody',
            countId: 'multiTruckRowCount',
            addRowId: 'multiTruckAddRow',
            closeId: 'closeMultiTruckModal',
            cancelId: 'cancelMultiTruck',
            saveId: 'saveMultiTruck',
            defaults: { fuel: 'diesel', status: 'active' },
            afterSave: () => { loadTrucks(); populateTruckDropdown(); }
        },
        trailer: {
            cols: [
                { key: 'unit', placeholder: 'e.g., T-201', type: 'text', required: true },
                { key: 'year', placeholder: 'e.g., 2020', type: 'number' },
                { key: 'make', placeholder: 'e.g., Utility', type: 'text' },
                { key: 'type', type: 'select', defaultLabel: 'Dry Van', options: [
                    { value: 'dry-van', label: 'Dry Van' },
                    { value: 'reefer', label: 'Reefer' },
                    { value: 'flatbed', label: 'Flatbed' },
                    { value: 'step-deck', label: 'Step Deck' },
                    { value: 'tanker', label: 'Tanker' },
                    { value: 'lowboy', label: 'Lowboy' },
                    { value: 'other', label: 'Other' }
                ]},
                { key: 'vin', placeholder: '17-character VIN', type: 'text', maxlength: 17 },
                { key: 'plate', placeholder: 'e.g., ABC 1234', type: 'text' },
                { key: 'status', type: 'select', defaultLabel: 'Active', options: [
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Out of Service' },
                    { value: 'maintenance', label: 'In Maintenance' }
                ]}
            ],
            collection: 'trailers',
            label: 'trailer',
            requiredKey: 'unit',
            duplicateKey: 'unit',
            modalId: 'multiTrailerModal',
            tbodyId: 'multiTrailerBody',
            countId: 'multiTrailerRowCount',
            addRowId: 'multiTrailerAddRow',
            closeId: 'closeMultiTrailerModal',
            cancelId: 'cancelMultiTrailer',
            saveId: 'saveMultiTrailer',
            defaults: { type: 'dry-van', status: 'active' },
            afterSave: () => { loadTrailers(); }
        },
        driver: {
            cols: [
                { key: 'firstName', placeholder: 'e.g., John', type: 'text', required: true },
                { key: 'lastName', placeholder: 'e.g., Smith', type: 'text' },
                { key: 'phone', placeholder: '(555) 123-4567', type: 'text' },
                { key: 'cdl', placeholder: 'CDL number', type: 'text' },
                { key: 'cdlState', placeholder: 'TX', type: 'text', maxlength: 2 },
                { key: 'email', placeholder: 'john@example.com', type: 'text' },
                { key: 'status', type: 'select', defaultLabel: 'Active', options: [
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'on-leave', label: 'On Leave' }
                ]}
            ],
            collection: 'drivers',
            label: 'driver',
            requiredKey: 'firstName',
            duplicateKey: null,
            modalId: 'multiDriverModal',
            tbodyId: 'multiDriverBody',
            countId: 'multiDriverRowCount',
            addRowId: 'multiDriverAddRow',
            closeId: 'closeMultiDriverModal',
            cancelId: 'cancelMultiDriver',
            saveId: 'saveMultiDriver',
            defaults: { status: 'active' },
            afterSave: () => { loadDrivers(); }
        }
    };

    function getSheetConfig(el) {
        const modal = el.closest('[data-sheet-type]');
        return modal ? SHEET_CONFIGS[modal.dataset.sheetType] : null;
    }

    function sheetSelectLabel(col, value) {
        if (!value && col.defaultLabel) return col.defaultLabel;
        const opt = col.options.find(o => o.value === value);
        return opt ? opt.label : (col.defaultLabel || '');
    }

    function buildSheetRow(index, rowData, cols) {
        const data = rowData || {};
        let cells = `<td class="sheet-row-num">${index + 1}</td>`;
        cols.forEach(col => {
            const val = data[col.key] || '';
            const displayText = col.type === 'select'
                ? sheetSelectLabel(col, val)
                : escapeHtml(val);
            const isPlaceholder = !val && col.type !== 'select';
            const textClass = 'sheet-cell-text' + (isPlaceholder ? ' placeholder' : '');
            const placeholderText = isPlaceholder ? (col.placeholder || '') : displayText;

            cells += `<td><div class="sheet-cell" data-col-key="${col.key}">`;
            cells += `<span class="${textClass}">${isPlaceholder ? escapeHtml(placeholderText) : displayText}</span>`;
            if (col.type === 'select') {
                cells += `<select data-key="${col.key}" tabindex="-1">` +
                    col.options.map(o => `<option value="${escapeHtml(o.value)}"${o.value === (val || col.options[0].value) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('') +
                    '</select>';
            } else {
                cells += `<input type="${col.type === 'number' ? 'text' : col.type}" data-key="${col.key}" value="${escapeHtml(val)}" placeholder="${col.placeholder || ''}"${col.maxlength ? ' maxlength="' + col.maxlength + '"' : ''} tabindex="-1">`;
            }
            cells += '</div></td>';
        });
        cells += `<td class="sheet-row-action"><button class="sheet-row-delete" title="Remove row" tabindex="-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button></td>`;
        const tr = document.createElement('tr');
        tr.innerHTML = cells;
        if (rowData && Object.values(rowData).some(v => v)) tr.classList.add('row-has-data');
        return tr;
    }

    function commitSheetCell(cell) {
        if (!cell || !cell.classList.contains('cell-editing')) return;
        cell.classList.remove('cell-editing');
        const input = cell.querySelector('input');
        const select = cell.querySelector('select');
        const textEl = cell.querySelector('.sheet-cell-text');
        const config = getSheetConfig(cell);
        const colKey = cell.dataset.colKey;
        const colDef = config ? config.cols.find(c => c.key === colKey) : null;

        if (select) {
            textEl.textContent = select.options[select.selectedIndex].text;
            textEl.classList.remove('placeholder');
        } else if (input) {
            const val = input.value.trim();
            if (val) {
                textEl.textContent = val;
                textEl.classList.remove('placeholder');
            } else {
                textEl.textContent = colDef ? colDef.placeholder || '' : '';
                textEl.classList.add('placeholder');
            }
        }

        const tr = cell.closest('tr');
        if (tr) checkRowData(tr);
        validateSheetCell(cell);
    }

    function startEditingCell(cell) {
        if (!cell || cell.classList.contains('cell-editing')) return;
        const tbody = cell.closest('tbody');
        const prev = tbody.querySelector('.cell-editing');
        if (prev && prev !== cell) commitSheetCell(prev);

        cell.classList.add('cell-editing');
        const input = cell.querySelector('input');
        const select = cell.querySelector('select');
        const el = input || select;
        if (el) {
            el.tabIndex = 0;
            el.focus();
            if (input) input.select();
        }
    }

    function navigateSheet(fromCell, direction) {
        const tbody = fromCell.closest('tbody');
        const config = getSheetConfig(fromCell);
        const allCells = Array.from(tbody.querySelectorAll('.sheet-cell'));
        const idx = allCells.indexOf(fromCell);
        if (idx === -1) return;

        if (direction === 'next') {
            if (idx < allCells.length - 1) {
                startEditingCell(allCells[idx + 1]);
            } else if (config) {
                const row = buildSheetRow(tbody.children.length, null, config.cols);
                tbody.appendChild(row);
                updateSheetRowCount(config);
                const first = row.querySelector('.sheet-cell');
                if (first) startEditingCell(first);
            }
        } else if (direction === 'prev') {
            if (idx > 0) startEditingCell(allCells[idx - 1]);
        } else if (direction === 'down') {
            const row = fromCell.closest('tr');
            const cellIdx = Array.from(row.querySelectorAll('.sheet-cell')).indexOf(fromCell);
            const nextRow = row.nextElementSibling;
            if (nextRow) {
                const targetCell = nextRow.querySelectorAll('.sheet-cell')[cellIdx];
                if (targetCell) startEditingCell(targetCell);
            }
        } else if (direction === 'up') {
            const row = fromCell.closest('tr');
            const cellIdx = Array.from(row.querySelectorAll('.sheet-cell')).indexOf(fromCell);
            const prevRow = row.previousElementSibling;
            if (prevRow) {
                const targetCell = prevRow.querySelectorAll('.sheet-cell')[cellIdx];
                if (targetCell) startEditingCell(targetCell);
            }
        }
    }

    function validateSheetCell(cell) {
        cell.classList.remove('cell-invalid', 'cell-duplicate');
        const config = getSheetConfig(cell);
        if (!config) return;
        const colKey = cell.dataset.colKey;
        const input = cell.querySelector('input');
        if (!input) return;
        const val = input.value.trim();

        if (colKey === config.requiredKey && !val) {
            const tr = cell.closest('tr');
            const hasOtherData = Array.from(tr.querySelectorAll('input[data-key]'))
                .some(i => i.dataset.key !== config.requiredKey && i.value.trim());
            if (hasOtherData) cell.classList.add('cell-invalid');
        }

        if (config.duplicateKey && colKey === config.duplicateKey && val) {
            const tbody = cell.closest('tbody');
            const allKeyCells = tbody.querySelectorAll('.sheet-cell[data-col-key="' + config.duplicateKey + '"]');
            let dupeCount = 0;
            allKeyCells.forEach(c => {
                const inp = c.querySelector('input');
                if (inp && inp.value.trim().toLowerCase() === val.toLowerCase()) dupeCount++;
            });
            if (dupeCount > 1) {
                allKeyCells.forEach(c => {
                    const inp = c.querySelector('input');
                    if (inp && inp.value.trim().toLowerCase() === val.toLowerCase()) {
                        c.classList.add('cell-duplicate');
                    }
                });
            }
        }
    }

    function validateAllSheetCells(config) {
        const tbody = $(config.tbodyId);
        tbody.querySelectorAll('.sheet-cell').forEach(c => validateSheetCell(c));
    }

    function updateSheetRowCount(config) {
        const tbody = $(config.tbodyId);
        const count = tbody ? tbody.children.length : 0;
        const el = $(config.countId);
        if (el) el.textContent = count + ' row' + (count !== 1 ? 's' : '');
        if (tbody) {
            Array.from(tbody.children).forEach((tr, i) => {
                const numCell = tr.querySelector('.sheet-row-num');
                if (numCell) numCell.textContent = i + 1;
            });
        }
    }

    function ensureEmptyRow(config) {
        const tbody = $(config.tbodyId);
        if (!tbody) return;
        const rows = Array.from(tbody.children);
        if (rows.length === 0 || rows[rows.length - 1].classList.contains('row-has-data')) {
            tbody.appendChild(buildSheetRow(rows.length, null, config.cols));
            updateSheetRowCount(config);
        }
    }

    function openSheetModal(type) {
        const config = SHEET_CONFIGS[type];
        if (!config) return;
        const tbody = $(config.tbodyId);
        tbody.innerHTML = '';
        tbody.appendChild(buildSheetRow(0, null, config.cols));
        updateSheetRowCount(config);
        $(config.modalId).classList.remove('hidden');
        const first = tbody.querySelector('.sheet-cell');
        if (first) setTimeout(() => startEditingCell(first), 80);
    }

    function commitActiveCell(config) {
        if (config) {
            const active = $(config.tbodyId).querySelector('.cell-editing');
            if (active) commitSheetCell(active);
        } else {
            document.querySelectorAll('[data-sheet-type] .cell-editing').forEach(c => commitSheetCell(c));
        }
    }

    function checkRowData(tr) {
        const hasData = Array.from(tr.querySelectorAll('input[data-key]')).some(i => i.value.trim() !== '');
        tr.classList.toggle('row-has-data', hasData);
    }

    function initSheetModals() {
        Object.keys(SHEET_CONFIGS).forEach(type => {
            const config = SHEET_CONFIGS[type];
            const modal = $(config.modalId);
            if (!modal) return;
            const tbody = $(config.tbodyId);

            $(config.closeId).addEventListener('click', () => { commitActiveCell(config); modal.classList.add('hidden'); });
            $(config.cancelId).addEventListener('click', () => { commitActiveCell(config); modal.classList.add('hidden'); });

            $(config.addRowId).addEventListener('click', () => {
                commitActiveCell(config);
                const row = buildSheetRow(tbody.children.length, null, config.cols);
                tbody.appendChild(row);
                updateSheetRowCount(config);
                const first = row.querySelector('.sheet-cell');
                if (first) startEditingCell(first);
            });

            // Click to edit / delete row
            tbody.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.sheet-row-delete');
                if (deleteBtn) {
                    const tr = deleteBtn.closest('tr');
                    if (tbody.children.length <= 1) {
                        tr.querySelectorAll('input').forEach(i => { i.value = ''; });
                        tr.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; });
                        tr.classList.remove('row-has-data');
                        tr.querySelectorAll('.sheet-cell').forEach(c => {
                            const colKey = c.dataset.colKey;
                            const colDef = config.cols.find(cc => cc.key === colKey);
                            const textEl = c.querySelector('.sheet-cell-text');
                            if (colDef && colDef.type === 'select') {
                                textEl.textContent = colDef.defaultLabel || colDef.options[0].label;
                                textEl.classList.remove('placeholder');
                            } else if (textEl) {
                                textEl.textContent = colDef ? colDef.placeholder || '' : '';
                                textEl.classList.add('placeholder');
                            }
                            c.classList.remove('cell-editing', 'cell-invalid', 'cell-duplicate');
                        });
                        return;
                    }
                    tr.remove();
                    updateSheetRowCount(config);
                    validateAllSheetCells(config);
                    ensureEmptyRow(config);
                    return;
                }

                const cell = e.target.closest('.sheet-cell');
                if (cell) startEditingCell(cell);
            });

            // Keyboard navigation
            tbody.addEventListener('keydown', (e) => {
                const cell = e.target.closest('.sheet-cell');
                if (!cell) return;

                if (e.key === 'Tab') {
                    e.preventDefault();
                    commitSheetCell(cell);
                    navigateSheet(cell, e.shiftKey ? 'prev' : 'next');
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    commitSheetCell(cell);
                    navigateSheet(cell, 'down');
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    commitSheetCell(cell);
                }
            });

            // Commit on select change
            tbody.addEventListener('change', (e) => {
                if (e.target.tagName === 'SELECT') {
                    const cell = e.target.closest('.sheet-cell');
                    if (cell) {
                        commitSheetCell(cell);
                        navigateSheet(cell, 'next');
                    }
                }
            });

            // Auto-add empty row when typing in last row
            tbody.addEventListener('input', (e) => {
                const tr = e.target.closest('tr');
                if (!tr) return;
                checkRowData(tr);
                if (tr === tbody.lastElementChild && tr.classList.contains('row-has-data')) {
                    ensureEmptyRow(config);
                }
            });

            // Clicking outside table commits
            modal.addEventListener('mousedown', (e) => {
                if (e.target === modal) {
                    commitActiveCell(config);
                    modal.classList.add('hidden');
                    return;
                }
                if (!e.target.closest('.sheet-table tbody')) {
                    commitActiveCell(config);
                }
            });

            // Save
            $(config.saveId).addEventListener('click', () => saveSheetData(type));
        });
    }

    async function saveSheetData(type) {
        const config = SHEET_CONFIGS[type];
        commitActiveCell(config);
        validateAllSheetCells(config);

        const tbody = $(config.tbodyId);
        const hasInvalid = tbody.querySelector('.cell-invalid');
        const hasDuplicate = tbody.querySelector('.cell-duplicate');
        if (hasInvalid) {
            showMsg('Some rows have data but are missing a required field', true);
            return;
        }
        if (hasDuplicate) {
            if (!confirm('Duplicate values found. Save anyway?')) return;
        }

        const rows = Array.from(tbody.children);
        const batch = firebase.firestore().batch();
        let count = 0;

        for (const tr of rows) {
            const data = {};
            tr.querySelectorAll('[data-key]').forEach(el => {
                data[el.dataset.key] = el.value.trim();
            });
            if (!data[config.requiredKey]) continue;
            // Apply defaults for empty fields
            if (config.defaults) {
                Object.entries(config.defaults).forEach(([k, v]) => {
                    if (!data[k]) data[k] = v;
                });
            }
            // Uppercase state fields
            if (data.plateState) data.plateState = data.plateState.toUpperCase();
            if (data.cdlState) data.cdlState = data.cdlState.toUpperCase();
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            const doc = col(config.collection).doc();
            batch.set(doc, data);
            count++;
        }

        if (count === 0) {
            showMsg('Enter at least one ' + config.label + ' with required fields', true);
            return;
        }

        try {
            await batch.commit();
            await config.afterSave();
            $(config.modalId).classList.add('hidden');
            showMsg(count + ' ' + config.label + (count > 1 ? 's' : '') + ' added');
        } catch (err) {
            console.error('Sheet save error:', err);
            showMsg('Error saving ' + config.label + 's', true);
        }
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
        const modal = $('trailerModal');
        const shouldExpand = data && hasAdvancedData([data.vin, data.plate]);
        setExpandState(modal, shouldExpand);
        modal.classList.remove('hidden');
    }

    function initTrailerForm() {
        $('addTrailerBtn').addEventListener('click', () => openSheetModal('trailer'));
        $('addFirstTrailer').addEventListener('click', () => openSheetModal('trailer'));
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
        const modal = $('driverModal');
        const shouldExpand = data && hasAdvancedData([data.cdlState, data.cdlExp, data.medExp, data.email, data.truck]);
        setExpandState(modal, shouldExpand);
        modal.classList.remove('hidden');
    }

    function initDriverForm() {
        $('addDriverBtn').addEventListener('click', () => openSheetModal('driver'));
        $('addFirstDriver').addEventListener('click', () => openSheetModal('driver'));
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

        // Truck-specific fuel filter
        if (type === 'truck') {
            const fuelEl = $('truckFuelFilter');
            const fuelVal = fuelEl ? fuelEl.value : '';
            if (fuelVal && item.fuel !== fuelVal) return false;
        }

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
        ['truckSearch', 'truckStatusFilter', 'truckFuelFilter'].forEach(id => {
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

    // ── Expandable form sections ──────────
    function initExpandToggles() {
        document.querySelectorAll('.form-expand-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = btn.nextElementSibling;
                if (!section || !section.classList.contains('form-expand-section')) return;
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', !expanded);
                section.classList.toggle('open', !expanded);
                btn.childNodes.forEach(n => {
                    if (n.nodeType === 3 && n.textContent.trim()) {
                        n.textContent = !expanded ? ' Less Details' : ' More Details';
                    }
                });
            });
        });
    }

    function setExpandState(container, shouldOpen) {
        const toggle = container.querySelector('.form-expand-toggle');
        const section = container.querySelector('.form-expand-section');
        if (!toggle || !section) return;
        toggle.setAttribute('aria-expanded', shouldOpen);
        section.classList.toggle('open', shouldOpen);
        toggle.childNodes.forEach(n => {
            if (n.nodeType === 3 && n.textContent.trim()) {
                n.textContent = shouldOpen ? ' Less Details' : ' More Details';
            }
        });
    }

    function hasAdvancedData(fields) {
        return fields.some(v => v && v.toString().trim() !== '' && v !== 'diesel' && v !== 'dry-van');
    }

    // ── Init ──────────────────────────────
    function init() {
        initNav();
        initOverviewCards();
        initExpandToggles();
        initProfileForm();
        initTruckForm();
        initSheetModals();
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
