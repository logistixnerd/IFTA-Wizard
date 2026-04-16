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
        profile: {},
        dropdownOptions: {},
        companyDashboard: null
    };

    const COMPANY_TOOL_LABELS = {
        ifta: 'IFTA Wizard',
        safety: 'Safety Workspace',
        driver: 'Driver Management',
        reports: 'Reports',
        billing: 'Billing',
        integrations: 'Integrations'
    };

    const COMPANY_ROLE_OPTIONS = ['Owner', 'Admin', 'Safety Manager', 'Dispatcher', 'Driver', 'Viewer'];

    function getDefaultCompanyDashboard() {
        return {
            tools: {
                ifta: true,
                safety: true,
                driver: true,
                reports: true,
                billing: false,
                integrations: false
            },
            options: {
                selfServe: false,
                roleApproval: true,
                templateEnforce: false
            },
            users: [],
            templates: []
        };
    }

    function normalizeCompanyDashboard(raw) {
        const base = getDefaultCompanyDashboard();
        const data = raw && typeof raw === 'object' ? raw : {};
        return {
            tools: { ...base.tools, ...(data.tools || {}) },
            options: { ...base.options, ...(data.options || {}) },
            users: Array.isArray(data.users) ? data.users.map(u => ({ ...u })) : [],
            templates: Array.isArray(data.templates) ? data.templates.map(t => ({ ...t })) : []
        };
    }

    function makeEntityId(prefix) {
        return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function ensureCompanyOwnerMember() {
        if (!state.user) return;
        if (!state.companyDashboard) state.companyDashboard = getDefaultCompanyDashboard();
        const users = state.companyDashboard.users;
        const email = (state.user.email || '').toLowerCase();
        const existing = users.find(u => u.id === uid() || ((u.email || '').toLowerCase() === email));

        if (existing) {
            existing.id = existing.id || uid();
            existing.name = existing.name || state.user.displayName || 'Owner';
            existing.email = existing.email || state.user.email || '';
            existing.role = existing.role || 'Owner';
            existing.status = 'Active';
            return;
        }

        users.unshift({
            id: uid(),
            name: state.user.displayName || 'Owner',
            email: state.user.email || '',
            role: 'Owner',
            status: 'Active',
            invitedAt: new Date().toISOString()
        });
    }

    async function saveCompanyDashboard(successMessage) {
        if (!uid() || !state.companyDashboard) return;
        await db.collection('users').doc(uid()).set({
            companyDashboard: state.companyDashboard,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        if (successMessage) showMsg(successMessage);
    }

    function renderCompanyDashboard() {
        const data = state.companyDashboard || getDefaultCompanyDashboard();

        const toolMap = {
            toolIfta: !!data.tools.ifta,
            toolSafety: !!data.tools.safety,
            toolDriver: !!data.tools.driver,
            toolReports: !!data.tools.reports,
            toolBilling: !!data.tools.billing,
            toolIntegrations: !!data.tools.integrations,
            optionSelfServe: !!data.options.selfServe,
            optionRoleApproval: !!data.options.roleApproval,
            optionTemplateEnforce: !!data.options.templateEnforce
        };

        Object.entries(toolMap).forEach(([id, value]) => {
            const el = $(id);
            if (el) el.checked = value;
        });

        const tbody = $('companyUsersTableBody');
        if (tbody) {
            if (!data.users.length) {
                tbody.innerHTML = '<tr><td colspan="5">No users added yet.</td></tr>';
            } else {
                tbody.innerHTML = data.users.map(user => {
                    const roleOptions = COMPANY_ROLE_OPTIONS.map(role =>
                        '<option value="' + escapeHtml(role) + '"' + (user.role === role ? ' selected' : '') + '>' + escapeHtml(role) + '</option>'
                    ).join('');
                    const statusRaw = (user.status || 'Pending').toString();
                    const statusClass = statusRaw.toLowerCase() === 'active' ? 'active' : 'pending';
                    const locked = user.id === uid();
                    return `
                        <tr>
                            <td>${escapeHtml(user.name || 'User')}</td>
                            <td>${escapeHtml(user.email || '')}</td>
                            <td>
                                <select class="company-user-row-role" data-id="${escapeHtml(user.id || '')}" ${locked ? 'disabled' : ''}>
                                    ${roleOptions}
                                </select>
                            </td>
                            <td><span class="company-user-status ${statusClass}">${escapeHtml(statusRaw)}</span></td>
                            <td>
                                <button type="button" class="btn btn-sm ${locked ? 'btn-secondary' : 'btn-danger'} company-user-remove" data-id="${escapeHtml(user.id || '')}" ${locked ? 'disabled' : ''}>${locked ? 'Owner' : 'Remove'}</button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        const templateList = $('companyTemplateList');
        if (templateList) {
            if (!data.templates.length) {
                templateList.innerHTML = '<div class="company-template-item">No templates created yet.</div>';
            } else {
                templateList.innerHTML = data.templates.map(template => {
                    const pills = (Array.isArray(template.tools) ? template.tools : [])
                        .map(tool => '<span class="company-template-pill">' + escapeHtml(COMPANY_TOOL_LABELS[tool] || tool) + '</span>')
                        .join('');
                    return `
                        <div class="company-template-item">
                            <div class="company-template-head">
                                <div>
                                    <div class="company-template-name">${escapeHtml(template.name || 'Template')}</div>
                                    <div class="company-template-dept">${escapeHtml(template.department || 'Operations')}</div>
                                </div>
                                <div class="company-template-actions">
                                    <label class="company-template-toggle"><input type="checkbox" class="company-template-active" data-id="${escapeHtml(template.id || '')}" ${template.active ? 'checked' : ''}> Active</label>
                                    <button type="button" class="btn btn-danger btn-sm company-template-delete" data-id="${escapeHtml(template.id || '')}">Delete</button>
                                </div>
                            </div>
                            <div class="company-template-tools">${pills || '<span class="company-template-pill">No tools</span>'}</div>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    // ── Editable Dropdown Definitions ──
    const DROPDOWN_DEFS = {
        truckFuel: {
            label: 'Truck Fuel Types',
            defaults: [
                { value: 'diesel', label: 'Diesel' },
                { value: 'gasoline', label: 'Gasoline' },
                { value: 'cng', label: 'CNG' },
                { value: 'lng', label: 'LNG' }
            ],
            formIds: ['truckFuel'],
            filterIds: ['truckFuelFilter'],
            sheetPath: { type: 'truck', colKey: 'fuel' }
        },
        truckStatus: {
            label: 'Truck Status',
            defaults: [
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Out of Service' },
                { value: 'maintenance', label: 'In Maintenance' }
            ],
            formIds: ['truckStatus'],
            filterIds: ['truckStatusFilter'],
            sheetPath: { type: 'truck', colKey: 'status' }
        },
        trailerType: {
            label: 'Trailer Types',
            defaults: [
                { value: 'dry-van', label: 'Dry Van' },
                { value: 'reefer', label: 'Reefer' },
                { value: 'flatbed', label: 'Flatbed' },
                { value: 'step-deck', label: 'Step Deck' },
                { value: 'tanker', label: 'Tanker' },
                { value: 'lowboy', label: 'Lowboy' },
                { value: 'other', label: 'Other' }
            ],
            formIds: ['trailerType'],
            filterIds: [],
            sheetPath: { type: 'trailer', colKey: 'type' }
        },
        trailerStatus: {
            label: 'Trailer Status',
            defaults: [
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Out of Service' },
                { value: 'maintenance', label: 'In Maintenance' }
            ],
            formIds: ['trailerStatus'],
            filterIds: ['trailerStatusFilter'],
            sheetPath: { type: 'trailer', colKey: 'status' }
        },
        driverStatus: {
            label: 'Driver Status',
            defaults: [
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'on-leave', label: 'On Leave' }
            ],
            formIds: ['driverStatus'],
            filterIds: ['driverStatusFilter'],
            sheetPath: { type: 'driver', colKey: 'status' }
        },
        fleetSize: {
            label: 'Fleet Size Ranges',
            defaults: [
                { value: '1-5', label: '1-5 trucks' },
                { value: '6-20', label: '6-20 trucks' },
                { value: '21-50', label: '21-50 trucks' },
                { value: '51-100', label: '51-100 trucks' },
                { value: '100+', label: '100+ trucks' }
            ],
            formIds: ['dashFleetSize'],
            filterIds: [],
            sheetPath: null
        }
    };

    function getDropdownOptions(key) {
        return state.dropdownOptions[key] || DROPDOWN_DEFS[key].defaults;
    }

    function syncDropdownOptions(key) {
        const def = DROPDOWN_DEFS[key];
        const options = getDropdownOptions(key);
        // Update form selects
        def.formIds.forEach(id => {
            const sel = $(id);
            if (!sel) return;
            const current = sel.value;
            const hasBlank = sel.options.length && sel.options[0].value === '';
            sel.innerHTML = '';
            if (hasBlank) {
                const blank = document.createElement('option');
                blank.value = '';
                blank.textContent = 'Select...';
                sel.appendChild(blank);
            }
            options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.value;
                opt.textContent = o.label;
                sel.appendChild(opt);
            });
            sel.value = current;
        });
        // Update filter selects (preserve "All ..." first option)
        def.filterIds.forEach(id => {
            const sel = $(id);
            if (!sel) return;
            const current = sel.value;
            const first = sel.options[0];
            sel.innerHTML = '';
            if (first) sel.appendChild(first);
            options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.value;
                opt.textContent = o.label;
                sel.appendChild(opt);
            });
            sel.value = current;
        });
        // Update SHEET_CONFIGS
        if (def.sheetPath) {
            const cfg = SHEET_CONFIGS[def.sheetPath.type];
            if (cfg) {
                const c = cfg.cols.find(col => col.key === def.sheetPath.colKey);
                if (c) {
                    c.options = options.map(o => ({ ...o }));
                    c.defaultLabel = options[0] ? options[0].label : '';
                }
            }
        }
    }

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

    // ── Make / Model Suggestions for Autocomplete ──
    const TRUCK_MAKES = [
        'Freightliner', 'Kenworth', 'Peterbilt', 'Volvo', 'International',
        'Mack', 'Western Star', 'Hino', 'Isuzu', 'Ford', 'Chevrolet',
        'RAM', 'GMC', 'Navistar', 'Autocar', 'Crane Carrier', 'Capacity'
    ];
    const TRUCK_MODELS = [
        'Cascadia', 'T680', '579', 'VNL', 'LT', 'Anthem', '4900',
        'W990', 'T880', '389', '567', 'VNR', 'ProStar', 'LoneStar',
        'Coronado', 'Granite', 'Pinnacle', 'TerraStar', 'MV', 'HV',
        'HX', '4700', '5900', '122SD', '49X', 'FE', 'L9', 'NRR'
    ];
    const TRAILER_MAKES = [
        'Great Dane', 'Utility', 'Wabash', 'Hyundai Translead', 'Stoughton',
        'Vanguard', 'Fontaine', 'MAC Trailer', 'Wilson', 'East Manufacturing',
        'Trail King', 'Manac', 'Reitnouer', 'Benson', 'Travis Body', 'Heil',
        'Polar', 'Brenner', 'Kentucky', 'Lufkin'
    ];

    function getSuggestionsFor(colKey, entityType) {
        if (colKey === 'make') return entityType === 'trailer' ? TRAILER_MAKES : TRUCK_MAKES;
        if (colKey === 'model') return entityType === 'trailer' ? [] : TRUCK_MODELS;
        return [];
    }

    // ── Autocomplete Utility ──────────────
    let activeAutocomplete = null;

    function attachAutocomplete(inputEl, suggestions) {
        detachAutocomplete();
        if (!suggestions || !suggestions.length) return;
        const wrap = inputEl.parentElement;
        if (!wrap) return;

        const list = document.createElement('ul');
        list.className = 'autocomplete-list';
        list.style.cssText = 'display:none;position:absolute;top:100%;left:0;right:0;';

        wrap.style.position = 'relative';
        wrap.appendChild(list);

        let items = [];
        let activeIdx = -1;

        function render(filtered) {
            items = filtered;
            activeIdx = -1;
            if (!filtered.length) { list.style.display = 'none'; return; }
            list.innerHTML = filtered.map((s, i) =>
                '<li class="autocomplete-item" data-idx="' + i + '">' + escapeHtml(s) + '</li>'
            ).join('');
            list.style.display = '';
        }

        function highlight(idx) {
            list.querySelectorAll('.autocomplete-item').forEach((el, i) => {
                el.classList.toggle('active', i === idx);
            });
            activeIdx = idx;
            const active = list.children[idx];
            if (active) active.scrollIntoView({ block: 'nearest' });
        }

        function pick(value) {
            inputEl.value = value;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            list.style.display = 'none';
            inputEl.focus();
        }

        function onInput() {
            const q = inputEl.value.trim().toLowerCase();
            if (!q) { list.style.display = 'none'; return; }
            const filtered = suggestions.filter(s => s.toLowerCase().includes(q));
            render(filtered);
        }

        function onKeydown(e) {
            if (list.style.display === 'none' || !items.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                highlight(activeIdx < items.length - 1 ? activeIdx + 1 : 0);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                highlight(activeIdx > 0 ? activeIdx - 1 : items.length - 1);
            } else if (e.key === 'Enter' && activeIdx >= 0) {
                e.preventDefault();
                e.stopPropagation();
                pick(items[activeIdx]);
            } else if (e.key === 'Escape') {
                list.style.display = 'none';
            }
        }

        function onClickList(e) {
            const li = e.target.closest('.autocomplete-item');
            if (li) {
                e.preventDefault();
                e.stopPropagation();
                pick(items[+li.dataset.idx]);
            }
        }

        // Prevent mousedown on list from blurring input
        function onMousedownList(e) { e.preventDefault(); }

        inputEl.addEventListener('input', onInput);
        inputEl.addEventListener('keydown', onKeydown);
        list.addEventListener('click', onClickList);
        list.addEventListener('mousedown', onMousedownList);

        activeAutocomplete = {
            input: inputEl,
            list: list,
            onInput: onInput,
            onKeydown: onKeydown,
            onClickList: onClickList,
            onMousedownList: onMousedownList
        };

        // Show matches immediately if input already has value
        onInput();
    }

    function detachAutocomplete() {
        if (!activeAutocomplete) return;
        const ac = activeAutocomplete;
        ac.input.removeEventListener('input', ac.onInput);
        ac.input.removeEventListener('keydown', ac.onKeydown);
        ac.list.removeEventListener('click', ac.onClickList);
        ac.list.removeEventListener('mousedown', ac.onMousedownList);
        ac.list.remove();
        activeAutocomplete = null;
    }

    // ── VIN Decode (NHTSA vPIC API) ───────
    const vinDecodeCache = {};
    async function decodeVIN(vin) {
        vin = (vin || '').trim().toUpperCase();
        if (vin.length !== 17) return null;
        if (vinDecodeCache[vin]) return vinDecodeCache[vin];
        try {
            const resp = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/' + encodeURIComponent(vin) + '?format=json');
            if (!resp.ok) return null;
            const json = await resp.json();
            const r = (json.Results && json.Results[0]) || {};
            const errorCode = (r.ErrorCode || '').toString();
            const codes = errorCode.split(',').map(c => c.trim());
            // "0" = clean decode, "1" = decoded with gaps, "5" = bad check digit
            const hasData = !!(r.Make || r.Model);
            const valid = codes.includes('0') || (codes.includes('1') && hasData) || hasData;
            const result = {
                valid: valid,
                year: r.ModelYear || '',
                make: r.Make || '',
                model: r.Model || '',
                fuelType: (r.FuelTypePrimary || '').toLowerCase()
            };
            vinDecodeCache[vin] = result;
            return result;
        } catch (e) {
            console.error('VIN decode error:', e);
            return null;
        }
    }

    function setVinStatus(wrapperId, status, msg) {
        const wrapper = $(wrapperId);
        if (!wrapper) return;
        wrapper.classList.remove('vin-loading', 'vin-valid', 'vin-invalid');
        const indicator = wrapper.querySelector('.vin-status');
        if (!indicator) return;
        if (status === 'loading') {
            wrapper.classList.add('vin-loading');
            indicator.innerHTML = '<span class="vin-spinner"></span>';
            indicator.title = 'Decoding VIN…';
        } else if (status === 'valid') {
            wrapper.classList.add('vin-valid');
            indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" width="16" height="16"><path d="M20 6L9 17l-5-5"/></svg>';
            indicator.title = msg || 'VIN verified';
        } else if (status === 'invalid') {
            wrapper.classList.add('vin-invalid');
            indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#dc3545" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
            indicator.title = msg || 'Could not verify VIN';
        } else {
            indicator.innerHTML = '';
            indicator.title = '';
        }
    }

    let vinDecodeTimer = null;
    function attachVinAutofill(vinInputId, wrapperId, fieldMap) {
        const vinInput = $(vinInputId);
        if (!vinInput) return;
        vinInput.addEventListener('input', () => {
            clearTimeout(vinDecodeTimer);
            const val = vinInput.value.trim();
            if (val.length < 17) {
                setVinStatus(wrapperId, '');
                return;
            }
            if (val.length === 17) {
                setVinStatus(wrapperId, 'loading');
                vinDecodeTimer = setTimeout(async () => {
                    const result = await decodeVIN(val);
                    if (!result) {
                        setVinStatus(wrapperId, 'invalid', 'Decode failed');
                        return;
                    }
                    if (result.valid) {
                        setVinStatus(wrapperId, 'valid', result.year + ' ' + result.make + ' ' + result.model);
                    } else {
                        setVinStatus(wrapperId, 'invalid', 'VIN not recognized');
                    }
                    // Autofill only empty fields
                    Object.entries(fieldMap).forEach(([key, elId]) => {
                        const el = $(elId);
                        if (!el || el.value.trim()) return;
                        if (key === 'year' && result.year) el.value = result.year;
                        if (key === 'make' && result.make) el.value = result.make;
                        if (key === 'model' && result.model) el.value = result.model;
                    });
                }, 350);
            }
        });
    }

    // ── Auth Guard ─────────────────────────
    function initAuth() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }
            state.user = user;
            setTopbarAccount(user.displayName || 'User', user.photoURL || localStorage.getItem('ifta_avatar') || null);
            await loadAll();
        });
    }

    function setTopbarAccount(name, photoUrl) {
        const firstName = String(name || 'User').trim().split(/\s+/)[0] || 'User';
        $('dashUserEmail').textContent = 'Welcome, ' + firstName + '!';
        const avatar = $('dashTopbarAvatar');
        if (!avatar) return;
        if (photoUrl) {
            avatar.innerHTML = '';
            const img = document.createElement('img');
            img.src = photoUrl;
            img.alt = 'Profile';
            avatar.appendChild(img);
        } else {
            avatar.textContent = firstName.charAt(0).toUpperCase();
        }
    }

    function navigateToSection(section) {
        if (!section) return;
        document.querySelectorAll('.dash-nav-item').forEach(b => {
            b.classList.toggle('active', b.dataset.section === section);
        });
        document.querySelectorAll('.dash-section').forEach(s => {
            s.classList.toggle('active', s.id === 'section-' + section);
        });
        const group = document.querySelector('.dash-nav-group');
        if (group) group.classList.toggle('open', ['trucks', 'trailers', 'drivers'].includes(section));
        const btn = document.querySelector('.dash-nav-item[data-section="' + section + '"]');
        if (btn) $('pageTitle').textContent = btn.querySelector('span').textContent;
        else if (section === 'profile') $('pageTitle').textContent = 'Account';
    }

    // ── Navigation ────────────────────────
    function initNav() {
        document.querySelectorAll('.dash-nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                navigateToSection(btn.dataset.section);
            });
        });

        const logo = $('dashLogo');
        if (logo) {
            logo.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToSection('overview');
            });
        }

        const accountBtn = $('dashAccountBtn');
        if (accountBtn) {
            accountBtn.addEventListener('click', () => navigateToSection('profile'));
        }
    }

    // ── Load All Data ─────────────────────
    async function loadAll() {
        await Promise.all([loadProfile(), loadTrucks(), loadTrailers(), loadDrivers()]);
        renderTrucks();
        renderTrailers();
        renderDrivers();
        updateOverview();
    }

    // ── PROFILE ───────────────────────────
    async function loadProfile() {
        try {
            const doc = await db.collection('users').doc(uid()).get();
            const data = doc.exists ? doc.data() : {};
            state.profile = data;

            // Load custom dropdown options
            state.dropdownOptions = data.dropdownOptions || {};
            Object.keys(DROPDOWN_DEFS).forEach(key => syncDropdownOptions(key));

            // Hero area
            $('dashProfileName').textContent = data.name || state.user.displayName || 'User';
            $('dashProfileEmail').textContent = state.user.email || '';
            setTopbarAccount(data.name || state.user.displayName || 'User', data.avatarBase64 || state.user.photoURL || localStorage.getItem('ifta_avatar') || null);

            // Avatar
            const photoUrl = data.avatarBase64 || state.user.photoURL || localStorage.getItem('ifta_avatar') || null;
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
            const officeAddress = data.officeAddress || data.address || '';
            const shopAddress = data.shopAddress || '';
            const legacySameAll = typeof data.sameAddressForFacilities === 'boolean' ? data.sameAddressForFacilities : null;
            const sameShopAsOffice = typeof data.sameShopAsOffice === 'boolean'
                ? data.sameShopAsOffice
                : (legacySameAll !== null ? legacySameAll : (!shopAddress || shopAddress === officeAddress));

            const yardAddress = data.yardAddress || '';
            const sameYardAsOffice = typeof data.sameYardAsOffice === 'boolean'
                ? data.sameYardAsOffice
                : (!yardAddress || yardAddress === officeAddress);

            $('dashAddress').value = officeAddress;
            $('dashSameShopAddressToggle').checked = !sameShopAsOffice;
            $('dashShopAddress').value = shopAddress;
            $('dashSameYardAddressToggle').checked = !sameYardAsOffice;
            $('dashYardAddress').value = yardAddress;
            setCompanyAddressMode();
            $('dashFleetSize').value = data.fleetSize || '';
            $('dashBaseState').value = data.baseState || '';

            state.companyDashboard = normalizeCompanyDashboard(data.companyDashboard);
            ensureCompanyOwnerMember();
            renderCompanyDashboard();
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

        initAddressLookup('dashAddress');
        initAddressLookup('dashShopAddress');
        initAddressLookup('dashYardAddress');
        initCompanyAddressFields();

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
                setTopbarAccount($('dashFullName').value.trim() || state.profile.name || state.user.displayName || 'User', dataUrl);
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
                setTopbarAccount(payload.name || 'User', localStorage.getItem('ifta_avatar') || state.profile.avatarBase64 || state.user.photoURL || null);
                showMsg('Profile saved');
            } catch (err) {
                console.error('Save profile error:', err);
                showMsg('Error saving profile', true);
            }
        });

        // Save company info
        $('dashCompanyForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const separateShopAddress = !!$('dashSameShopAddressToggle').checked;
            const separateYardAddress = !!$('dashSameYardAddressToggle').checked;
            const officeAddress = $('dashAddress').value.trim();
            const shopAddress = separateShopAddress ? $('dashShopAddress').value.trim() : officeAddress;
            const yardAddress = separateYardAddress ? $('dashYardAddress').value.trim() : officeAddress;
            const payload = {
                company: $('dashCompany').value.trim(),
                dotNumber: $('dashDotNumber').value.trim(),
                mcNumber: $('dashMcNumber').value.trim(),
                ein: $('dashEin').value.trim(),
                address: officeAddress,
                officeAddress: officeAddress,
                sameAddressForFacilities: !separateShopAddress,
                sameShopAsOffice: !separateShopAddress,
                shopAddress: shopAddress,
                sameYardAsOffice: !separateYardAddress,
                yardAddress: yardAddress,
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

    function setCompanyAddressMode() {
        const separateShopAddress = !!($('dashSameShopAddressToggle') && $('dashSameShopAddressToggle').checked);
        const shopGroup = $('dashShopAddressGroup');
        const shopInput = $('dashShopAddress');
        if (shopGroup && shopInput) {
            shopGroup.hidden = !separateShopAddress;
            shopInput.disabled = !separateShopAddress;
        }

        const separateYardAddress = !!($('dashSameYardAddressToggle') && $('dashSameYardAddressToggle').checked);
        const yardGroup = $('dashYardAddressGroup');
        const yardInput = $('dashYardAddress');
        if (yardGroup && yardInput) {
            yardGroup.hidden = !separateYardAddress;
            yardInput.disabled = !separateYardAddress;
        }
    }

    function initCompanyAddressFields() {
        const sameShopToggle = $('dashSameShopAddressToggle');
        const sameYardToggle = $('dashSameYardAddressToggle');

        setCompanyAddressMode();
        if (sameShopToggle) sameShopToggle.addEventListener('change', setCompanyAddressMode);
        if (sameYardToggle) sameYardToggle.addEventListener('change', setCompanyAddressMode);
    }

    function initAddressLookup(inputId) {
        const addressInput = $(inputId);
        if (!addressInput) return;

        let timer = null;
        let lastQuery = '';
        let activeController = null;
        let items = [];
        let activeIdx = -1;
        let officeGeoCache = { address: '', point: null };

        const wrap = addressInput.parentElement;
        if (!wrap) return;
        const list = document.createElement('ul');
        list.className = 'autocomplete-list';
        list.style.cssText = 'display:none;position:fixed;margin:0;right:auto;z-index:9999;';
        document.body.appendChild(list);

        function positionList() {
            const rect = addressInput.getBoundingClientRect();
            list.style.top = (rect.bottom + 2) + 'px';
            list.style.left = rect.left + 'px';
            list.style.width = rect.width + 'px';
        }

        function isGooglePlacesReady() {
            return !!(
                window.google
                && google.maps
                && google.maps.places
                && typeof google.maps.places.AutocompleteService === 'function'
                && typeof google.maps.places.AutocompleteSessionToken === 'function'
            );
        }

        function distanceKm(aLat, aLon, bLat, bLon) {
            const toRad = (deg) => (deg * Math.PI) / 180;
            const earthKm = 6371;
            const dLat = toRad(bLat - aLat);
            const dLon = toRad(bLon - aLon);
            const lat1 = toRad(aLat);
            const lat2 = toRad(bLat);
            const h = Math.sin(dLat / 2) ** 2
                + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
            return 2 * earthKm * Math.asin(Math.sqrt(h));
        }

        async function geocodeOfficeWithNominatim(address) {
            const key = String(address || '').trim();
            if (!key) return null;
            if (officeGeoCache.address === key) return officeGeoCache.point;

            try {
                const endpoint =
                    'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us,ca&limit=1&q='
                    + encodeURIComponent(key);
                const response = await fetch(endpoint, {
                    headers: {
                        Accept: 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9'
                    }
                });
                if (!response.ok) return null;
                const rows = await response.json();
                if (!Array.isArray(rows) || !rows.length) return null;
                const lat = Number(rows[0].lat);
                const lon = Number(rows[0].lon);
                const point = Number.isFinite(lat) && Number.isFinite(lon)
                    ? { lat: lat, lon: lon }
                    : null;
                officeGeoCache = { address: key, point: point };
                return point;
            } catch (_) {
                return null;
            }
        }

        async function fetchNominatimSuggestions(query) {
            try {
                if (activeController) activeController.abort();
                activeController = new AbortController();

                const endpoint =
                    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=us,ca&limit=12&q='
                    + encodeURIComponent(query);
                const response = await fetch(endpoint, {
                    signal: activeController.signal,
                    headers: {
                        Accept: 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9'
                    }
                });
                if (!response.ok) return [];
                const rows = await response.json();
                if (!Array.isArray(rows)) return [];

                const mapped = rows
                    .map((r) => {
                        if (!r || !r.display_name) return null;
                        const lat = Number(r.lat);
                        const lon = Number(r.lon);
                        return {
                            label: String(r.display_name),
                            lat: Number.isFinite(lat) ? lat : null,
                            lon: Number.isFinite(lon) ? lon : null,
                            source: 'nominatim'
                        };
                    })
                    .filter(Boolean);

                const seen = new Set();
                const results = mapped.filter((item) => {
                    const key = item.label.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                }).slice(0, 8);
                return results;
            } catch (err) {
                if (err && err.name === 'AbortError') throw err;
                return [];
            }
        }

        async function fetchPhotonSuggestions(query) {
            try {
                const endpoint = 'https://photon.komoot.io/api/?limit=12&q=' + encodeURIComponent(query);
                const response = await fetch(endpoint, {
                    headers: {
                        Accept: 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9'
                    }
                });
                if (!response.ok) return [];
                const body = await response.json();
                const features = Array.isArray(body && body.features) ? body.features : [];
                const mapped = features
                    .map((f) => {
                        const p = (f && f.properties) ? f.properties : {};
                        const coords = (f && f.geometry && Array.isArray(f.geometry.coordinates))
                            ? f.geometry.coordinates
                            : [];
                        const lon = Number(coords[0]);
                        const lat = Number(coords[1]);
                        const parts = [
                            p.housenumber,
                            p.street,
                            p.city || p.town || p.county,
                            p.state,
                            p.postcode,
                            p.country
                        ].filter(Boolean);
                        const label = parts.join(', ') || String(p.name || '').trim();
                        if (!label) return null;
                        return {
                            label: label,
                            lat: Number.isFinite(lat) ? lat : null,
                            lon: Number.isFinite(lon) ? lon : null,
                            source: 'photon'
                        };
                    })
                    .filter(Boolean);

                const seen = new Set();
                return mapped.filter((item) => {
                    const key = item.label.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                }).slice(0, 8);
            } catch (_) {
                return [];
            }
        }

        async function fetchGoogleSuggestions(query) {
            if (!isGooglePlacesReady()) return null;

            const autocompleteService = new google.maps.places.AutocompleteService();
            const sessionToken = new google.maps.places.AutocompleteSessionToken();
            const geocoder = new google.maps.Geocoder();

            let bounds = null;
            if (inputId === 'dashShopAddress') {
                const officeInput = $('dashAddress');
                if (officeInput && officeInput.value.trim()) {
                    await new Promise((resolve) => {
                        geocoder.geocode({ address: officeInput.value.trim() }, (results, status) => {
                            if (status === google.maps.GeocoderStatus.OK && results && results.length) {
                                const location = results[0].geometry.location;
                                const radius = 0.225;
                                bounds = {
                                    north: location.lat() + radius,
                                    south: location.lat() - radius,
                                    east: location.lng() + radius,
                                    west: location.lng() - radius
                                };
                            }
                            resolve();
                        });
                    });
                }
            }

            return new Promise((resolve) => {
                autocompleteService.getPlacePredictions(
                    {
                        input: query,
                        bounds: bounds,
                        componentRestrictions: { country: ['us', 'ca'] },
                        sessionToken: sessionToken,
                        types: ['address']
                    },
                    (predictions, status) => {
                        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                            resolve(predictions.map((pred) => ({
                                label: pred.description,
                                source: 'google'
                            })));
                            return;
                        }
                        if (status && status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                            console.warn('Google Places unavailable, switching to fallback provider:', status);
                        }
                        resolve([]);
                    }
                );
            });
        }

        async function fetchSuggestions(query) {
            const googleResults = await fetchGoogleSuggestions(query);
            if (Array.isArray(googleResults) && googleResults.length) {
                return googleResults.slice(0, 8);
            }

            const nominatimResults = await fetchNominatimSuggestions(query);
            const fallbackResults = nominatimResults.length
                ? nominatimResults
                : await fetchPhotonSuggestions(query);

            if (inputId === 'dashShopAddress' && fallbackResults.length) {
                const officeInput = $('dashAddress');
                const officeAddr = officeInput ? officeInput.value.trim() : '';
                const officePoint = officeAddr ? await geocodeOfficeWithNominatim(officeAddr) : null;
                if (officePoint) {
                    return fallbackResults
                        .slice()
                        .sort((a, b) => {
                            const aHasCoords = Number.isFinite(a.lat) && Number.isFinite(a.lon);
                            const bHasCoords = Number.isFinite(b.lat) && Number.isFinite(b.lon);
                            if (!aHasCoords && !bHasCoords) return 0;
                            if (!aHasCoords) return 1;
                            if (!bHasCoords) return -1;
                            const dA = distanceKm(officePoint.lat, officePoint.lon, a.lat, a.lon);
                            const dB = distanceKm(officePoint.lat, officePoint.lon, b.lat, b.lon);
                            return dA - dB;
                        })
                        .slice(0, 8);
                }
            }

            return fallbackResults.slice(0, 8);
        }

        function renderOptions(suggestions) {
            items = suggestions || [];
            activeIdx = -1;
            list.innerHTML = (suggestions || [])
                .map((item, i) => '<li class="autocomplete-item" data-idx="' + i + '">' + escapeHtml(item.label) + '</li>')
                .join('');
            if (items.length) {
                positionList();
                list.style.display = '';
            } else {
                list.style.display = 'none';
            }
        }

        function highlight(idx) {
            list.querySelectorAll('.autocomplete-item').forEach((el, i) => {
                el.classList.toggle('active', i === idx);
            });
            activeIdx = idx;
            const active = list.children[idx];
            if (active) active.scrollIntoView({ block: 'nearest' });
        }

        function pick(item) {
            if (!item || !item.label) return;
            addressInput.value = item.label;
            list.style.display = 'none';
        }

        addressInput.addEventListener('input', () => {
            const query = addressInput.value.trim();
            if (timer) clearTimeout(timer);

            if (query.length < 2) {
                lastQuery = '';
                renderOptions([]);
                return;
            }

            timer = setTimeout(async () => {
                if (query === lastQuery) return;
                lastQuery = query;
                try {
                    const predictions = await fetchSuggestions(query);
                    if (addressInput.value.trim() !== query) return;
                    renderOptions(predictions);
                } catch (err) {
                    if (err && err.name === 'AbortError') return;
                    renderOptions([]);
                }
            }, 300);
        });

        addressInput.addEventListener('keydown', (e) => {
            if (list.style.display === 'none' || !items.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlight(activeIdx < items.length - 1 ? activeIdx + 1 : 0);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlight(activeIdx > 0 ? activeIdx - 1 : items.length - 1);
            } else if (e.key === 'Enter' && activeIdx >= 0) {
                e.preventDefault();
                pick(items[activeIdx]);
            } else if (e.key === 'Escape') {
                list.style.display = 'none';
            }
        });

        list.addEventListener('mousedown', (e) => e.preventDefault());
        list.addEventListener('click', (e) => {
            const li = e.target.closest('.autocomplete-item');
            if (!li) return;
            const idx = Number(li.dataset.idx);
            if (Number.isNaN(idx) || !items[idx]) return;
            pick(items[idx]);
        });

        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target) && !list.contains(e.target)) list.style.display = 'none';
        });
    }

    function initCompanyDashboard() {
        const toolsSaveBtn = $('companyToolsSaveBtn');
        const inviteBtn = $('companyInviteUserBtn');
        const usersBody = $('companyUsersTableBody');
        const templateCreateBtn = $('companyTemplateCreateBtn');
        const templateList = $('companyTemplateList');

        if (!toolsSaveBtn || !inviteBtn || !usersBody || !templateCreateBtn || !templateList) return;

        function ensureState() {
            if (!state.companyDashboard) state.companyDashboard = getDefaultCompanyDashboard();
        }

        toolsSaveBtn.addEventListener('click', async () => {
            ensureState();
            state.companyDashboard.tools = {
                ifta: !!($('toolIfta') && $('toolIfta').checked),
                safety: !!($('toolSafety') && $('toolSafety').checked),
                driver: !!($('toolDriver') && $('toolDriver').checked),
                reports: !!($('toolReports') && $('toolReports').checked),
                billing: !!($('toolBilling') && $('toolBilling').checked),
                integrations: !!($('toolIntegrations') && $('toolIntegrations').checked)
            };
            state.companyDashboard.options = {
                selfServe: !!($('optionSelfServe') && $('optionSelfServe').checked),
                roleApproval: !!($('optionRoleApproval') && $('optionRoleApproval').checked),
                templateEnforce: !!($('optionTemplateEnforce') && $('optionTemplateEnforce').checked)
            };
            try {
                await saveCompanyDashboard('Company dashboard tools saved');
            } catch (err) {
                console.error('Error saving company tools:', err);
                showMsg('Error saving company tools', true);
            }
        });

        inviteBtn.addEventListener('click', async () => {
            ensureState();
            const name = ($('companyUserName').value || '').trim();
            const email = ($('companyUserEmail').value || '').trim().toLowerCase();
            const role = ($('companyUserRole').value || 'Viewer').trim();

            if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
                showMsg('Enter a valid user email', true);
                return;
            }

            const existing = state.companyDashboard.users.find(u => (u.email || '').toLowerCase() === email);
            if (existing) {
                existing.name = name || existing.name;
                existing.role = role;
                existing.status = existing.status || 'Pending';
            } else {
                state.companyDashboard.users.push({
                    id: makeEntityId('member'),
                    name: name || email.split('@')[0],
                    email: email,
                    role: role,
                    status: 'Pending',
                    invitedAt: new Date().toISOString()
                });
            }

            try {
                await saveCompanyDashboard(existing ? 'User access updated' : 'User invitation added');
                $('companyUserName').value = '';
                $('companyUserEmail').value = '';
                $('companyUserRole').value = 'Viewer';
                renderCompanyDashboard();
            } catch (err) {
                console.error('Error inviting user:', err);
                showMsg('Error saving user invitation', true);
            }
        });

        usersBody.addEventListener('change', async (e) => {
            const select = e.target.closest('.company-user-row-role');
            if (!select) return;
            ensureState();
            const member = state.companyDashboard.users.find(u => (u.id || '') === (select.dataset.id || ''));
            if (!member) return;
            member.role = select.value;
            try {
                await saveCompanyDashboard('User role updated');
                renderCompanyDashboard();
            } catch (err) {
                console.error('Error updating role:', err);
                showMsg('Error updating role', true);
            }
        });

        usersBody.addEventListener('click', async (e) => {
            const btn = e.target.closest('.company-user-remove');
            if (!btn) return;
            ensureState();
            const memberId = btn.dataset.id || '';
            const member = state.companyDashboard.users.find(u => (u.id || '') === memberId);
            if (!member) return;
            if (member.id === uid() || member.role === 'Owner') {
                showMsg('Owner cannot be removed here', true);
                return;
            }
            if (!confirm('Remove this user from company access?')) return;
            state.companyDashboard.users = state.companyDashboard.users.filter(u => (u.id || '') !== memberId);
            try {
                await saveCompanyDashboard('User removed');
                renderCompanyDashboard();
            } catch (err) {
                console.error('Error removing user:', err);
                showMsg('Error removing user', true);
            }
        });

        templateCreateBtn.addEventListener('click', async () => {
            ensureState();
            const name = ($('companyTemplateName').value || '').trim();
            const department = ($('companyTemplateDepartment').value || 'Operations').trim();
            const checkedTools = Array.from(document.querySelectorAll('.company-template-tool-grid input[type="checkbox"]:checked'))
                .map(cb => cb.value);

            if (!name) {
                showMsg('Template name is required', true);
                return;
            }
            if (!checkedTools.length) {
                showMsg('Select at least one tool for template', true);
                return;
            }

            state.companyDashboard.templates.push({
                id: makeEntityId('template'),
                name: name,
                department: department,
                tools: checkedTools,
                active: true,
                createdAt: new Date().toISOString()
            });

            try {
                await saveCompanyDashboard('Template created');
                $('companyTemplateName').value = '';
                document.querySelectorAll('.company-template-tool-grid input[type="checkbox"]').forEach(cb => {
                    cb.checked = false;
                });
                renderCompanyDashboard();
            } catch (err) {
                console.error('Error creating template:', err);
                showMsg('Error creating template', true);
            }
        });

        templateList.addEventListener('change', async (e) => {
            const toggle = e.target.closest('.company-template-active');
            if (!toggle) return;
            ensureState();
            const template = state.companyDashboard.templates.find(t => (t.id || '') === (toggle.dataset.id || ''));
            if (!template) return;
            template.active = !!toggle.checked;
            try {
                await saveCompanyDashboard('Template updated');
                renderCompanyDashboard();
            } catch (err) {
                console.error('Error toggling template:', err);
                showMsg('Error updating template', true);
            }
        });

        templateList.addEventListener('click', async (e) => {
            const btn = e.target.closest('.company-template-delete');
            if (!btn) return;
            ensureState();
            const id = btn.dataset.id || '';
            if (!confirm('Delete this department template?')) return;
            state.companyDashboard.templates = state.companyDashboard.templates.filter(t => (t.id || '') !== id);
            try {
                await saveCompanyDashboard('Template deleted');
                renderCompanyDashboard();
            } catch (err) {
                console.error('Error deleting template:', err);
                showMsg('Error deleting template', true);
            }
        });
    }

    function initCompanyTabs() {
        const tabs = Array.from(document.querySelectorAll('.company-tab'));
        const panels = Array.from(document.querySelectorAll('.company-tab-panel'));
        if (!tabs.length || !panels.length) return;

        function activateTab(name) {
            tabs.forEach(tab => {
                const active = tab.dataset.companyTab === name;
                tab.classList.toggle('active', active);
                tab.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            panels.forEach(panel => {
                panel.classList.toggle('active', panel.dataset.companyPanel === name);
            });
        }

        tabs.forEach(tab => {
            tab.addEventListener('click', () => activateTab(tab.dataset.companyTab));
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
        tbody.innerHTML = filtered.map(t => `<tr data-id="${t.id}" class="${t.validationStatus === 'error' ? 'row-validation-error' : t.validationStatus === 'warning' ? 'row-validation-warning' : ''}">
            ${validationIndicator(t)}
            <td class="col-unit"><div class="cell cell-primary" title="Open unit profile for ${escapeHtml(t.unit || ('Unit ' + t.id))}"><strong>${escapeHtml(t.unit || ('Unit ' + t.id))}</strong></div></td>
            <td class="col-year"><div class="cell">${escapeHtml(t.year)}</div></td>
            <td class="col-make"><div class="cell">${escapeHtml(t.make)}</div></td>
            <td class="col-model"><div class="cell">${escapeHtml(t.model)}</div></td>
            <td class="col-vin" data-col="vin"><div class="cell vin-cell" title="${escapeHtml(t.vin)}">${escapeHtml(t.vin)}</div></td>
            <td class="col-plate"><div class="cell">${escapeHtml(t.plate)}${t.plateState ? ' <span class="text-muted">(' + escapeHtml(t.plateState) + ')</span>' : ''}</div></td>
            <td class="col-fuel"><div class="cell">${fuelLabel(t.fuel)}</div></td>
            <td class="col-status"><div class="cell">${statusSelect(t.status, t.id, 'trucks', 'truck')}</div></td>
            <td class="col-actions row-actions"><div class="cell">
                <button title="Edit" onclick="Dashboard.editTruck('${t.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button title="Delete" class="btn-delete" onclick="Dashboard.deleteTruck('${t.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div></td>
        </tr>`).join('');
    }

    function openTruckProfile(id) {
        if (!id) return;
        window.location.href = 'unit-profile.html?truck=' + encodeURIComponent(id);
    }

    function openTrailerProfile(id) {
        if (!id) return;
        window.location.href = 'trailer-profile.html?trailer=' + encodeURIComponent(id);
    }

    function openDriverProfile(id) {
        if (!id) return;
        window.location.href = 'driver-profile.html?driver=' + encodeURIComponent(id);
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
        setVinStatus('truckVinWrap', '');
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
                input.addEventListener('change', (e) => importCSVToSheet(e.target.files[0], 'truck'));
                input.click();
            });
        }

        // VIN autofill for single truck form
        attachVinAutofill('truckVin', 'truckVinWrap', {
            year: 'truckYear', make: 'truckMake', model: 'truckModel'
        });

        // Make / Model autocomplete for single truck form
        function initFormAutocomplete(inputId, suggestions) {
            const el = $(inputId);
            if (!el) return;
            el.addEventListener('focus', () => attachAutocomplete(el, suggestions));
            el.addEventListener('blur', () => setTimeout(detachAutocomplete, 150));
        }
        initFormAutocomplete('truckMake', TRUCK_MAKES);
        initFormAutocomplete('truckModel', TRUCK_MODELS);

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
                updateOverview();
                showMsg(editId ? 'Truck updated' : 'Truck added');
            } catch (err) {
                console.error('Save truck error:', err);
                showMsg('Error saving truck', true);
            }
        });
    }

    async function importCSVToSheet(file, type) {
        if (!file) return;
        const config = SHEET_CONFIGS[type];
        if (!config) return;
        try {
            const text = await file.text();
            const sep = text.includes('\t') ? '\t' : ',';
            const lines = text.trim().split('\n').map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
            if (lines.length < 2) { showMsg('File must have a header row and data', true); return; }
            const header = lines[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
            const colMap = {};
            const aliases = config.csvAliases || {};
            for (const [field, names] of Object.entries(aliases)) {
                const idx = header.findIndex(h => names.includes(h));
                if (idx !== -1) colMap[field] = idx;
            }
            if (!(config.requiredKey in colMap)) {
                const label = config.cols.find(c => c.key === config.requiredKey);
                showMsg('CSV must have a "' + (label ? label.placeholder.replace(/e\.g\.,?\s*/i, '') : config.requiredKey) + '" column', true);
                return;
            }

            // Parse rows into data objects
            const parsed = [];
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                const data = {};
                let hasValue = false;
                config.cols.forEach(col => {
                    if (colMap[col.key] !== undefined) {
                        let val = row[colMap[col.key]] || '';
                        if (col.key === 'plateState' || col.key === 'cdlState') val = val.toUpperCase();
                        // Match select values case-insensitively
                        if (col.type === 'select' && val) {
                            const match = col.options.find(o =>
                                o.value.toLowerCase() === val.toLowerCase() ||
                                o.label.toLowerCase() === val.toLowerCase()
                            );
                            val = match ? match.value : val;
                        }
                        data[col.key] = val;
                        if (val) hasValue = true;
                    }
                });
                if (hasValue) parsed.push(data);
            }

            if (parsed.length === 0) { showMsg('No valid rows found in file', true); return; }

            // Open the sheet modal and fill with parsed data
            const tbody = $(config.tbodyId);
            tbody.innerHTML = '';
            parsed.forEach((rowData, i) => {
                tbody.appendChild(buildSheetRow(i, rowData, config.cols));
            });
            // Add one trailing empty row
            tbody.appendChild(buildSheetRow(parsed.length, null, config.cols));
            updateSheetRowCount(config);
            $(config.modalId).classList.remove('hidden');

            // Run validation after a tick so the DOM is ready
            setTimeout(() => {
                validateAllSheetCells(config);
                const first = tbody.querySelector('.sheet-cell');
                if (first) startEditingCell(first);
            }, 80);

            showMsg(parsed.length + ' row' + (parsed.length > 1 ? 's' : '') + ' imported for review');
        } catch (err) {
            console.error('CSV import error:', err);
            showMsg('Error reading file', true);
        }
    }

    // ── SHEET MODAL SYSTEM (Trucks, Trailers, Drivers) ──
    const SHEET_CONFIGS = {
        truck: {
            cols: [
                { key: 'unit', placeholder: 'e.g., 101', type: 'text', required: true },
                { key: 'year', placeholder: 'e.g., 2022', type: 'number', min: 1900, max: 2099 },
                { key: 'make', placeholder: 'e.g., Freightliner', type: 'text' },
                { key: 'model', placeholder: 'e.g., Cascadia', type: 'text' },
                { key: 'vin', placeholder: '17-character VIN', type: 'text', maxlength: 17, exactLength: 17, warnMsg: 'VIN must be 17 characters' },
                { key: 'plate', placeholder: 'e.g., ABC 1234', type: 'text' },
                { key: 'plateState', placeholder: 'TX', type: 'text', maxlength: 2, pattern: /^[A-Z]{2}$/, warnMsg: 'Invalid state code' },
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
            afterSave: async () => { await loadTrucks(); populateTruckDropdown(); },
            csvAliases: {
                unit: ['unit', 'unitnumber', 'unitno', 'truckno', 'trucknumber'],
                year: ['year', 'yr', 'modelyear'],
                make: ['make', 'manufacturer', 'brand'],
                model: ['model'],
                vin: ['vin', 'vehicleid'],
                plate: ['plate', 'licenseplate', 'licenseplatenumber', 'tag'],
                plateState: ['platestate', 'state', 'tagstate'],
                fuel: ['fuel', 'fueltype'],
                status: ['status']
            }
        },
        trailer: {
            cols: [
                { key: 'unit', placeholder: 'e.g., T-201', type: 'text', required: true },
                { key: 'year', placeholder: 'e.g., 2020', type: 'number', min: 1900, max: 2099 },
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
                { key: 'vin', placeholder: '17-character VIN', type: 'text', maxlength: 17, exactLength: 17, warnMsg: 'VIN must be 17 characters' },
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
            afterSave: async () => { await loadTrailers(); },
            csvAliases: {
                unit: ['unit', 'unitnumber', 'unitno', 'trailerno', 'trailernumber'],
                year: ['year', 'yr', 'modelyear'],
                make: ['make', 'manufacturer', 'brand'],
                type: ['type', 'trailertype', 'equipmenttype'],
                vin: ['vin', 'vehicleid'],
                plate: ['plate', 'licenseplate', 'licenseplatenumber', 'tag'],
                status: ['status']
            }
        },
        driver: {
            cols: [
                { key: 'firstName', placeholder: 'e.g., John', type: 'text', required: true },
                { key: 'lastName', placeholder: 'e.g., Smith', type: 'text' },
                { key: 'phone', placeholder: '(555) 123-4567', type: 'text' },
                { key: 'cdl', placeholder: 'CDL number', type: 'text' },
                { key: 'cdlState', placeholder: 'TX', type: 'text', maxlength: 2, pattern: /^[A-Z]{2}$/, warnMsg: 'Invalid state code' },
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
            afterSave: async () => { await loadDrivers(); },
            csvAliases: {
                firstName: ['firstname', 'first', 'fname', 'givenname'],
                lastName: ['lastname', 'last', 'lname', 'surname', 'familyname'],
                phone: ['phone', 'phonenumber', 'mobile', 'cell', 'telephone'],
                cdl: ['cdl', 'cdlnumber', 'cdlno', 'licensenumber', 'license', 'dl'],
                cdlState: ['cdlstate', 'licensestate', 'dlstate', 'state'],
                email: ['email', 'emailaddress', 'mail'],
                status: ['status']
            }
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
                cells += `<input type="${col.type || 'text'}" data-key="${col.key}" value="${escapeHtml(val)}" placeholder="${col.placeholder || ''}"${col.maxlength ? ' maxlength="' + col.maxlength + '"' : ''}${col.min != null ? ' min="' + col.min + '"' : ''}${col.max != null ? ' max="' + col.max + '"' : ''} tabindex="-1">`;
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
        detachAutocomplete();
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

        // VIN auto-decode for sheet grid on commit (skip if already decoded this value)
        if (colKey === 'vin' && input) {
            const vin = input.value.trim();
            if (vin.length === 17 && config && (config.collection === 'trucks' || config.collection === 'trailers')
                && cell.getAttribute('data-vin-decoded') !== vin) {
                triggerSheetVinDecode(cell, tr, vin, config);
            }
        }
    }

    function triggerSheetVinDecode(cell, tr, vin, config) {
        cell.setAttribute('data-vin-decoded', vin);
        cell.classList.remove('vin-sheet-valid');
        cell.classList.add('vin-sheet-loading');
        decodeVIN(vin).then(result => {
            cell.classList.remove('vin-sheet-loading');
            if (!result) return;
            if (result.valid) {
                cell.classList.add('vin-sheet-valid');
                cell.title = [result.year, result.make, result.model].filter(Boolean).join(' ');
                setTimeout(() => cell.classList.remove('vin-sheet-valid'), 4000);
            }
            // Autofill sibling cells — only if user hasn't manually edited them
            const fillMap = { year: result.year, make: result.make, model: result.model };
            Object.entries(fillMap).forEach(([key, val]) => {
                if (!val) return;
                const sibling = tr.querySelector('.sheet-cell[data-col-key="' + key + '"]');
                if (!sibling) return;
                // Skip if user has manually edited this cell
                if (sibling.hasAttribute('data-user-edited')) return;
                const sInput = sibling.querySelector('input');
                const sText = sibling.querySelector('.sheet-cell-text');
                if (sInput && !sInput.value.trim()) {
                    sInput.value = val;
                    if (sText) { sText.textContent = val; sText.classList.remove('placeholder'); }
                    sibling.setAttribute('data-vin-filled', 'true');
                    validateSheetCell(sibling);
                }
            });
        });
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

        // Attach autocomplete for make/model columns in sheet grid
        const colKey = cell.dataset.colKey;
        if (input && (colKey === 'make' || colKey === 'model')) {
            const config = getSheetConfig(cell);
            const entityType = config ? config.label : 'truck';
            const suggestions = getSuggestionsFor(colKey, entityType);
            if (suggestions.length) attachAutocomplete(input, suggestions);
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
        cell.classList.remove('cell-invalid', 'cell-duplicate', 'cell-warning');
        cell.removeAttribute('title');
        const config = getSheetConfig(cell);
        if (!config) return;
        const colKey = cell.dataset.colKey;
        const colDef = config.cols.find(c => c.key === colKey);
        const input = cell.querySelector('input');
        if (!input) return;
        const val = input.value.trim();

        // Required field check (only flag if row has other data)
        if (colKey === config.requiredKey && !val) {
            const tr = cell.closest('tr');
            const hasOtherData = Array.from(tr.querySelectorAll('input[data-key]'))
                .some(i => i.dataset.key !== config.requiredKey && i.value.trim());
            if (hasOtherData) {
                cell.classList.add('cell-invalid');
                cell.title = colDef ? (colDef.placeholder ? colKey + ' is required' : 'Required') : 'Required';
                return;
            }
        }

        // Duplicate check
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
                        c.title = 'Duplicate ' + colKey;
                    }
                });
            }
        }

        // Column-specific validation (only if cell has a value)
        if (!val || !colDef) return;

        // Exact length (e.g. VIN = 17)
        if (colDef.exactLength && val.length !== colDef.exactLength) {
            cell.classList.add('cell-warning');
            cell.title = colDef.warnMsg || (colKey + ' must be ' + colDef.exactLength + ' characters');
            return;
        }

        // Regex pattern (e.g. state code = /^[A-Z]{2}$/)
        if (colDef.pattern && !colDef.pattern.test(val.toUpperCase())) {
            cell.classList.add('cell-warning');
            cell.title = colDef.warnMsg || ('Invalid ' + colKey);
            return;
        }

        // Number range (e.g. year 1900-2099)
        if (colDef.type === 'number' && (colDef.min != null || colDef.max != null)) {
            const num = parseInt(val, 10);
            if (isNaN(num) || (colDef.min != null && num < colDef.min) || (colDef.max != null && num > colDef.max)) {
                cell.classList.add('cell-warning');
                cell.title = colKey + ' must be between ' + (colDef.min || '') + ' and ' + (colDef.max || '');
                return;
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
                    // Let autocomplete handle Enter if dropdown is visible
                    if (activeAutocomplete && activeAutocomplete.list.style.display !== 'none') return;
                    e.preventDefault();
                    commitSheetCell(cell);
                    navigateSheet(cell, 'down');
                } else if (e.key === 'Escape') {
                    if (activeAutocomplete && activeAutocomplete.list.style.display !== 'none') {
                        activeAutocomplete.list.style.display = 'none';
                        return;
                    }
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

            // Auto-add empty row when typing in last row + track user edits
            tbody.addEventListener('input', (e) => {
                const tr = e.target.closest('tr');
                if (!tr) return;
                checkRowData(tr);
                if (tr === tbody.lastElementChild && tr.classList.contains('row-has-data')) {
                    ensureEmptyRow(config);
                }

                // Mark cell as user-edited (so VIN autofill won't overwrite)
                const editedCell = e.target.closest('.sheet-cell');
                if (editedCell && e.target.tagName === 'INPUT' && editedCell.dataset.colKey !== 'vin') {
                    const val = e.target.value.trim();
                    if (val && !editedCell.hasAttribute('data-vin-filled')) {
                        editedCell.setAttribute('data-user-edited', 'true');
                    } else if (!val) {
                        editedCell.removeAttribute('data-user-edited');
                        editedCell.removeAttribute('data-vin-filled');
                    }
                }

                // Live VIN decode as user types
                if (type === 'truck' || type === 'trailer') {
                    const cell = e.target.closest('.sheet-cell');
                    if (cell && cell.dataset.colKey === 'vin' && e.target.tagName === 'INPUT') {
                        const val = e.target.value.trim();
                        if (val.length < 17) {
                            cell.classList.remove('vin-sheet-loading', 'vin-sheet-valid');
                            cell.removeAttribute('data-vin-decoded');
                            return;
                        }
                        if (val.length === 17 && cell.getAttribute('data-vin-decoded') !== val) {
                            triggerSheetVinDecode(cell, tr, val, config);
                        }
                    }
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

            // Paste from Excel / spreadsheet
            tbody.addEventListener('paste', (e) => {
                const clipText = (e.clipboardData || window.clipboardData).getData('text');
                if (!clipText) return;
                const pasteRows = clipText.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
                if (pasteRows.length <= 1 && pasteRows[0].indexOf('\t') === -1) return; // single value, let default handle it

                e.preventDefault();
                commitActiveCell(config);

                // Determine starting row + col from active cell
                const activeCell = e.target.closest('.sheet-cell');
                let startRow = 0, startCol = 0;
                if (activeCell) {
                    const tr = activeCell.closest('tr');
                    startRow = Array.from(tbody.children).indexOf(tr);
                    startCol = Array.from(tr.querySelectorAll('.sheet-cell')).indexOf(activeCell);
                }

                pasteRows.forEach((line, ri) => {
                    const vals = line.split('\t');
                    const rowIdx = startRow + ri;

                    // Add rows if needed
                    while (tbody.children.length <= rowIdx) {
                        tbody.appendChild(buildSheetRow(tbody.children.length, null, config.cols));
                    }

                    const tr = tbody.children[rowIdx];
                    const cells = tr.querySelectorAll('.sheet-cell');

                    vals.forEach((raw, ci) => {
                        const colIdx = startCol + ci;
                        if (colIdx >= cells.length) return;
                        const cell = cells[colIdx];
                        const colDef = config.cols[colIdx];
                        let val = raw.trim();

                        const input = cell.querySelector('input');
                        const select = cell.querySelector('select');
                        const textEl = cell.querySelector('.sheet-cell-text');

                        if (select && colDef && colDef.type === 'select') {
                            const match = colDef.options.find(o =>
                                o.value.toLowerCase() === val.toLowerCase() ||
                                o.label.toLowerCase() === val.toLowerCase()
                            );
                            if (match) {
                                select.value = match.value;
                                textEl.textContent = match.label;
                            } else if (val) {
                                select.value = colDef.options[0].value;
                                textEl.textContent = colDef.options[0].label;
                            }
                            textEl.classList.remove('placeholder');
                        } else if (input) {
                            if (colDef && (colDef.key === 'plateState' || colDef.key === 'cdlState')) val = val.toUpperCase();
                            input.value = val;
                            if (val) {
                                textEl.textContent = val;
                                textEl.classList.remove('placeholder');
                            } else {
                                textEl.textContent = colDef ? colDef.placeholder || '' : '';
                                textEl.classList.add('placeholder');
                            }
                        }
                    });
                    checkRowData(tr);
                });

                updateSheetRowCount(config);
                ensureEmptyRow(config);
                validateAllSheetCells(config);
                showMsg(pasteRows.length + ' row' + (pasteRows.length > 1 ? 's' : '') + ' pasted');
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
        const rows = Array.from(tbody.children);

        try {
            const batch = firebase.firestore().batch();
            let count = 0;

            for (const tr of rows) {
                const data = {};
                tr.querySelectorAll('[data-key]').forEach(el => {
                    data[el.dataset.key] = el.value.trim();
                });
                if (!data[config.requiredKey]) continue;

                // Collect validation issues — store as warnings, never block
                const issues = [];
                tr.querySelectorAll('.cell-invalid, .cell-duplicate, .cell-warning').forEach(c => {
                    if (c.title) issues.push(c.title);
                });
                if (issues.length) {
                    data.validationStatus = 'warning';
                    data.validationIssues = issues;
                } else {
                    data.validationStatus = 'valid';
                }

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
                showMsg('Enter at least one ' + config.label + ' with a ' + config.requiredKey, true);
                return;
            }

            await batch.commit();
            $(config.modalId).classList.add('hidden');
            showMsg(count + ' ' + config.label + (count > 1 ? 's' : '') + ' added');
            await config.afterSave();
            updateOverview();
        } catch (err) {
            console.error('Sheet save error:', err);
            showMsg('Error saving ' + config.label + 's: ' + (err.message || err), true);
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
        tbody.innerHTML = filtered.map(t => `<tr data-id="${t.id}" class="${t.validationStatus === 'error' ? 'row-validation-error' : t.validationStatus === 'warning' ? 'row-validation-warning' : ''}">
            ${validationIndicator(t)}
            <td><div class="cell cell-primary" title="Open trailer profile for ${escapeHtml(t.unit || ('Trailer ' + t.id))}"><strong>${escapeHtml(t.unit || ('Trailer ' + t.id))}</strong></div></td>
            <td><div class="cell">${escapeHtml(t.year)}</div></td>
            <td><div class="cell">${escapeHtml(t.make)}</div></td>
            <td><div class="cell">${trailerTypeLabel(t.type)}</div></td>
            <td><div class="cell vin-cell">${escapeHtml(t.vin)}</div></td>
            <td><div class="cell">${escapeHtml(t.plate)}</div></td>
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

        const importTrailerBtn = $('importTrailersBtn');
        if (importTrailerBtn) {
            importTrailerBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv,.tsv,.txt';
                input.addEventListener('change', (e) => importCSVToSheet(e.target.files[0], 'trailer'));
                input.click();
            });
        }

        // Make autocomplete for single trailer form
        (function () {
            const el = $('trailerMake');
            if (!el) return;
            el.addEventListener('focus', () => attachAutocomplete(el, TRAILER_MAKES));
            el.addEventListener('blur', () => setTimeout(detachAutocomplete, 150));
        })();

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
                updateOverview();
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
        tbody.innerHTML = filtered.map(d => `<tr data-id="${d.id}" class="${d.validationStatus === 'error' ? 'row-validation-error' : d.validationStatus === 'warning' ? 'row-validation-warning' : ''}">
            ${validationIndicator(d)}
            <td><div class="cell cell-primary" title="Open driver profile for ${escapeHtml(d.firstName)} ${escapeHtml(d.lastName)}"><strong>${escapeHtml(d.firstName)} ${escapeHtml(d.lastName)}</strong></div></td>
            <td><div class="cell">${escapeHtml(d.cdl)}</div></td>
            <td><div class="cell">${escapeHtml(d.cdlState)}</div></td>
            <td><div class="cell">${escapeHtml(d.cdlExp)}</div></td>
            <td><div class="cell">${escapeHtml(d.phone)}</div></td>
            <td><div class="cell">${escapeHtml(d.email)}</div></td>
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

        const importDriverBtn = $('importDriversBtn');
        if (importDriverBtn) {
            importDriverBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv,.tsv,.txt';
                input.addEventListener('change', (e) => importCSVToSheet(e.target.files[0], 'driver'));
                input.click();
            });
        }

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
                updateOverview();
                showMsg(editId ? 'Driver updated' : 'Driver added');
            } catch (err) {
                console.error('Save driver error:', err);
                showMsg('Error saving driver', true);
            }
        });
    }

    // ── Shared Helpers ────────────────────
    function statusLabel(val) {
        for (const key of ['truckStatus', 'trailerStatus', 'driverStatus']) {
            const opts = getDropdownOptions(key);
            const match = opts.find(o => o.value === val);
            if (match) return match.label;
        }
        return escapeHtml(val || 'Active');
    }

    function statusBadge(val) {
        const s = val || 'active';
        return `<span class="status-badge ${escapeHtml(s)}"><span class="status-dot"></span>${statusLabel(s)}</span>`;
    }

    function statusSelect(val, id, collection, type) {
        const s = val || 'active';
        const key = type === 'driver' ? 'driverStatus' : (collection === 'trailers' ? 'trailerStatus' : 'truckStatus');
        const options = getDropdownOptions(key);
        const opts = options.map(o => `<option value="${escapeHtml(o.value)}"${o.value === s ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
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
        const opts = getDropdownOptions('truckFuel');
        const match = opts.find(o => o.value === val);
        return match ? match.label : escapeHtml(val || '—');
    }

    function trailerTypeLabel(val) {
        const opts = getDropdownOptions('trailerType');
        const match = opts.find(o => o.value === val);
        return match ? match.label : escapeHtml(val || '—');
    }

    function truckLabel(truckId) {
        if (!truckId) return '—';
        const t = state.trucks.find(tr => tr.id === truckId);
        return t ? ('Unit ' + t.unit) : '—';
    }

    // ── Validation Indicator Helpers ───────
    function validationIndicator(item) {
        if (!item.validationStatus || item.validationStatus === 'valid') return '<td class="col-validation"></td>';
        const isError = item.validationStatus === 'error';
        const issues = item.validationIssues || [];
        const cls = isError ? 'error' : 'warning';
        const label = isError ? 'Error' : 'Warning';
        return `<td class="col-validation">
            <span class="validation-indicator vi-${cls}" aria-label="${label}" role="img">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span class="vi-tooltip"><strong>${label}</strong>${issues.map(i => '<br>• ' + escapeHtml(i)).join('')}</span>
            </span>
        </td>`;
    }

    function issueDetailRow(item, colSpan) {
        if (!item.validationIssues || !item.validationIssues.length) return '';
        const isError = item.validationStatus === 'error';
        const cls = isError ? 'error' : 'warning';
        return `<tr class="validation-detail-row vd-${cls}" data-detail-for="${item.id}" style="display:none">
            <td colspan="${colSpan}">
                <div class="validation-detail">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                    </svg>
                    <ul>${item.validationIssues.map(i => '<li>' + escapeHtml(i) + '</li>').join('')}</ul>
                </div>
            </td>
        </tr>`;
    }

    // ── Inline Editing Engine ──────────────
    function initInlineEditing() {
        document.addEventListener('click', (e) => {
            // Row → profile navigation (skip buttons, selects, inputs)
            if (!e.target.closest('button, select, input')) {
                const row = e.target.closest('tr[data-id]');
                if (row) {
                    const id = row.dataset.id;
                    const table = row.closest('table');
                    if (table && id) {
                        if (table.id === 'trucksTable') openTruckProfile(id);
                        else if (table.id === 'trailersTable') openTrailerProfile(id);
                        else if (table.id === 'driversTable') openDriverProfile(id);
                    }
                }
            }
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
        if (field === 'name') currentVal = (item.firstName || '') + ' ' + (item.lastName || '');
        else if (field === 'plate' && collection === 'trucks') currentVal = (item.plate || '') + (item.plateState ? ' ' + item.plateState : '');
        else currentVal = item[field] || '';

        // Mark row as editing
        const row = cell.closest('tr');
        if (row) row.classList.add('row-editing');

        // Determine field type: select dropdown, text+autocomplete, or plain text
        const selectFields = {
            fuel:  { key: 'truckFuel',    collection: 'trucks' },
            type:  { key: 'trailerType',  collection: 'trailers' }
        };
        const autocompleteFields = {
            make:  function () { return collection === 'trailers' ? TRAILER_MAKES : TRUCK_MAKES; },
            model: function () { return TRUCK_MODELS; }
        };

        const isSelect = selectFields[field] && selectFields[field].collection === collection;
        const hasAutocomplete = !!autocompleteFields[field];

        // Re-render helper
        function rerender() {
            if (collection === 'trucks') { renderTrucks(); populateTruckDropdown(); }
            else if (collection === 'trailers') renderTrailers();
            else renderDrivers();
        }

        // Tab navigation helper
        function tabToNext(shiftKey) {
            setTimeout(() => {
                const allCells = Array.from(document.querySelectorAll(
                    `[data-collection="${collection}"].cell-editable`
                ));
                const idx = allCells.findIndex(c => c.dataset.id === id && c.dataset.field === field);
                const next = shiftKey ? allCells[idx - 1] : allCells[idx + 1];
                if (next) next.click();
            }, 50);
        }

        // ── SELECT dropdown for controlled fields ──
        if (isSelect) {
            const options = getDropdownOptions(selectFields[field].key);
            const select = document.createElement('select');
            select.className = 'cell-input cell-inline-select';
            options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.value;
                opt.textContent = o.label;
                if (o.value === currentVal) opt.selected = true;
                select.appendChild(opt);
            });

            cell.innerHTML = '';
            cell.appendChild(select);
            select.focus();

            let committed = false;
            const commit = async () => {
                if (committed) return;
                committed = true;
                const newVal = select.value;
                if (row) row.classList.remove('row-editing');
                const payload = { [field]: newVal, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                try {
                    await col(collection).doc(id).update(payload);
                    Object.assign(item, payload);
                    delete item.updatedAt;
                    rerender();
                } catch (err) {
                    console.error('Inline edit error:', err);
                    showMsg('Error saving change', true);
                    rerender();
                }
            };

            select.addEventListener('change', () => { commit(); });
            select.addEventListener('blur', () => { if (!committed) commit(); });
            select.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { committed = true; if (row) row.classList.remove('row-editing'); rerender(); }
                if (e.key === 'Tab') { e.preventDefault(); commit().then(() => tabToNext(e.shiftKey)); }
            });
            return;
        }

        // ── TEXT input (optionally with autocomplete) ──
        const inputType = field === 'cdlExp' ? 'date' : 'text';
        const input = document.createElement('input');
        input.type = inputType;
        input.className = 'cell-input';
        input.value = String(currentVal);

        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        if (inputType === 'text') input.select();

        // Attach autocomplete for make/model
        if (hasAutocomplete) {
            const suggestions = autocompleteFields[field]();
            if (suggestions.length) attachAutocomplete(input, suggestions);
        }

        const commit = async () => {
            detachAutocomplete();
            const newVal = input.value.trim();
            if (row) row.classList.remove('row-editing');

            // Build update payload
            const payload = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            if (field === 'name') {
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
                Object.assign(item, payload);
                delete item.updatedAt;
                rerender();
            } catch (err) {
                console.error('Inline edit error:', err);
                showMsg('Error saving change', true);
                rerender();
            }
        };

        let committed = false;
        input.addEventListener('blur', () => { if (!committed) { committed = true; commit(); } });
        input.addEventListener('keydown', (e) => {
            // Let autocomplete handle its keys
            if (hasAutocomplete && activeAutocomplete && activeAutocomplete.list.style.display !== 'none') {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') return;
                if (e.key === 'Enter') return;
                if (e.key === 'Escape') { activeAutocomplete.list.style.display = 'none'; return; }
            }
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') {
                if (row) row.classList.remove('row-editing');
                committed = true;
                detachAutocomplete();
                rerender();
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                input.blur();
                tabToNext(e.shiftKey);
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
            alerts.push({
                type: 'info',
                icon: 'user',
                kind: 'unassigned-drivers',
                text: unassigned.length + ' active driver' + (unassigned.length > 1 ? 's' : '') + ' unassigned to a truck',
                drivers: unassigned.map((d) => ({
                    name: (d.name || '').trim() || 'Unnamed driver',
                    phone: (d.phone || '').trim(),
                    cdl: (d.cdl || '').trim()
                }))
            });
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

        container.innerHTML = alerts.map((a, idx) => {
            if (a.kind === 'unassigned-drivers') {
                const detailId = `unassigned-driver-alert-${idx}`;
                const rows = (a.drivers || []).map((driver) => {
                    const subtitle = [driver.phone, driver.cdl ? ('CDL: ' + driver.cdl) : '']
                        .filter(Boolean)
                        .join(' | ');
                    return `<li class="alert-dropdown-item"><span class="alert-dropdown-name">${escapeHtml(driver.name)}</span>${subtitle ? `<span class="alert-dropdown-meta">${escapeHtml(subtitle)}</span>` : ''}</li>`;
                }).join('');
                return `<div class="alert-item alert-${escapeHtml(a.type)} alert-unassigned" data-alert-kind="unassigned-drivers">`
                    + `<button type="button" class="alert-dropdown-trigger" aria-expanded="false" aria-controls="${detailId}">`
                    + `${iconMap[a.icon] || ''}`
                    + `<span>${escapeHtml(a.text)}</span>`
                    + `<svg class="alert-dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`
                    + `</button>`
                    + `<div class="alert-dropdown-panel" id="${detailId}" hidden><ul class="alert-dropdown-list">${rows}</ul></div>`
                    + `</div>`;
            }
            return `<div class="alert-item alert-${escapeHtml(a.type)}">${iconMap[a.icon] || ''}<span>${escapeHtml(a.text)}</span></div>`;
        }).join('');

        container.querySelectorAll('.alert-dropdown-trigger').forEach((btn) => {
            btn.addEventListener('click', () => {
                const alertEl = btn.closest('.alert-unassigned');
                if (!alertEl) return;
                const panel = alertEl.querySelector('.alert-dropdown-panel');
                if (!panel) return;
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                panel.hidden = expanded;
                alertEl.classList.toggle('expanded', !expanded);
            });
        });
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
            updateOverview();
            showMsg('Truck deleted');
        } catch (err) { console.error(err); showMsg('Error deleting truck', true); }
    }

    async function deleteTrailer(id) {
        if (!confirm('Delete this trailer?')) return;
        try {
            await col('trailers').doc(id).delete();
            await loadTrailers();
            updateOverview();
            showMsg('Trailer deleted');
        } catch (err) { console.error(err); showMsg('Error deleting trailer', true); }
    }

    async function deleteDriver(id) {
        if (!confirm('Delete this driver?')) return;
        try {
            await col('drivers').doc(id).delete();
            await loadDrivers();
            updateOverview();
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
                navigateToSection(card.dataset.nav);
            });
        });
    }

    function buildOverviewLookupItems() {
        const truckItems = state.trucks.map(t => ({
            type: 'Truck',
            id: t.id,
            label: t.unit || ('Unit ' + t.id),
            meta: [t.year, t.make, t.model].filter(Boolean).join(' '),
            details: [t.vin].filter(Boolean).join(' '),
            open: () => openTruckProfile(t.id)
        }));

        const trailerItems = state.trailers.map(t => ({
            type: 'Trailer',
            id: t.id,
            label: t.unit || ('Trailer ' + t.id),
            meta: [t.year, t.make, trailerTypeLabel(t.type)].filter(Boolean).join(' '),
            details: [t.vin].filter(Boolean).join(' '),
            open: () => openTrailerProfile(t.id)
        }));

        const driverItems = state.drivers.map(d => ({
            type: 'Driver',
            id: d.id,
            label: [d.firstName, d.lastName].filter(Boolean).join(' ') || ('Driver ' + d.id),
            meta: [d.cdl, d.cdlState].filter(Boolean).join(' '),
            details: [truckLabel(d.truck)].filter(Boolean).join(' '),
            open: () => openDriverProfile(d.id)
        }));

        return [...truckItems, ...trailerItems, ...driverItems];
    }

    function rankOverviewLookupItem(item, query) {
        const text = [item.label, item.meta, item.details, item.type].join(' ').toLowerCase();
        const label = item.label.toLowerCase();
        if (label === query) return 0;
        if (label.startsWith(query)) return 1;
        if (text.startsWith(query)) return 2;
        if (label.includes(query)) return 3;
        if (text.includes(query)) return 4;
        return 99;
    }

    function renderOverviewLookupResults(matches) {
        const results = $('overviewLookupResults');
        if (!results) return;
        if (!matches.length) {
            results.innerHTML = '';
            results.classList.remove('open');
            return;
        }

        results.innerHTML = matches.map((item, index) => `
            <button type="button" class="overview-lookup-result${index === 0 ? ' active' : ''}" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">
                <span class="overview-lookup-result-copy">
                    <span class="overview-lookup-result-top">
                        <strong>${escapeHtml(item.label)}</strong>
                        <span class="overview-lookup-result-type ${item.type.toLowerCase()}">${escapeHtml(item.type)}</span>
                    </span>
                    ${item.meta ? `<span class="overview-lookup-result-meta">${escapeHtml(item.meta)}</span>` : ''}
                    ${item.details ? `<span class="overview-lookup-result-detail">${escapeHtml(item.details)}</span>` : ''}
                </span>
            </button>
        `).join('');
        results.classList.add('open');
    }

    function openOverviewLookupResult(type, id) {
        if (type === 'Truck') return openTruckProfile(id);
        if (type === 'Trailer') return openTrailerProfile(id);
        if (type === 'Driver') return openDriverProfile(id);
    }

    function initOverviewLookup() {
        const input = $('overviewLookup');
        const results = $('overviewLookupResults');
        if (!input || !results) return;

        function updateResults() {
            const query = input.value.trim().toLowerCase();
            if (!query) {
                renderOverviewLookupResults([]);
                return;
            }

            const matches = buildOverviewLookupItems()
                .map(item => ({ item, rank: rankOverviewLookupItem(item, query) }))
                .filter(entry => entry.rank < 99)
                .sort((a, b) => a.rank - b.rank || a.item.label.localeCompare(b.item.label))
                .slice(0, 8)
                .map(entry => entry.item);

            renderOverviewLookupResults(matches);
        }

        input.addEventListener('input', updateResults);
        input.addEventListener('focus', updateResults);
        input.addEventListener('keydown', (e) => {
            const items = Array.from(results.querySelectorAll('.overview-lookup-result'));
            if (!items.length) return;
            const currentIndex = items.findIndex(item => item.classList.contains('active'));

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const nextIndex = e.key === 'ArrowDown'
                    ? Math.min(currentIndex + 1, items.length - 1)
                    : Math.max(currentIndex - 1, 0);
                items.forEach((item, index) => item.classList.toggle('active', index === nextIndex));
                items[nextIndex].scrollIntoView({ block: 'nearest' });
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const active = items.find(item => item.classList.contains('active')) || items[0];
                if (active) openOverviewLookupResult(active.dataset.type, active.dataset.id);
            }

            if (e.key === 'Escape') {
                results.classList.remove('open');
            }
        });

        results.addEventListener('click', (e) => {
            const button = e.target.closest('.overview-lookup-result');
            if (!button) return;
            openOverviewLookupResult(button.dataset.type, button.dataset.id);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.overview-lookup')) {
                results.classList.remove('open');
            }
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

    // ── Dropdown Options Editor ───────────
    let currentDropdownKey = null;
    let currentDropdownEdits = [];

    function openDropdownEditor(key) {
        currentDropdownKey = key;
        const def = DROPDOWN_DEFS[key];
        currentDropdownEdits = getDropdownOptions(key).map(o => ({ ...o }));
        $('dropdownEditorTitle').textContent = 'Edit ' + def.label;
        renderDropdownEditorList();
        $('dropdownNewValue').value = '';
        $('dropdownNewLabel').value = '';
        $('dropdownEditorModal').classList.remove('hidden');
    }

    function renderDropdownEditorList() {
        const list = $('dropdownEditorList');
        list.innerHTML = currentDropdownEdits.map((o, i) =>
            `<div class="dropdown-editor-item" data-index="${i}">
                <span class="dropdown-editor-value">${escapeHtml(o.value)}</span>
                <span class="dropdown-editor-label">${escapeHtml(o.label)}</span>
                <button class="dropdown-editor-remove" title="Remove option" data-index="${i}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                </button>
            </div>`
        ).join('');
    }

    function closeDropdownEditor() {
        $('dropdownEditorModal').classList.add('hidden');
        currentDropdownKey = null;
        currentDropdownEdits = [];
    }

    async function saveDropdownEdits() {
        if (!currentDropdownKey || !currentDropdownEdits.length) return;
        const key = currentDropdownKey;
        state.dropdownOptions[key] = currentDropdownEdits.map(o => ({ value: o.value, label: o.label }));
        try {
            const payload = {};
            payload['dropdownOptions.' + key] = state.dropdownOptions[key];
            await db.collection('users').doc(uid()).set(payload, { merge: true });
            syncDropdownOptions(key);
            closeDropdownEditor();
            showMsg('Options updated');
        } catch (err) {
            console.error('Error saving dropdown options:', err);
            showMsg('Error saving options', true);
        }
    }

    function initDropdownEditors() {
        // Inject edit buttons next to editable form selects
        const selectMap = {};
        Object.entries(DROPDOWN_DEFS).forEach(([key, def]) => {
            def.formIds.forEach(id => { selectMap[id] = key; });
        });
        Object.entries(selectMap).forEach(([selectId, dropdownKey]) => {
            const sel = $(selectId);
            if (!sel) return;
            const btn = document.createElement('button');
            btn.className = 'dropdown-edit-btn';
            btn.type = 'button';
            btn.title = 'Edit options';
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openDropdownEditor(dropdownKey);
            });
            sel.parentNode.style.position = 'relative';
            sel.parentNode.appendChild(btn);
        });

        // Editor modal events
        $('closeDropdownEditor').addEventListener('click', closeDropdownEditor);
        $('dropdownEditorCancel').addEventListener('click', closeDropdownEditor);
        $('dropdownEditorSave').addEventListener('click', saveDropdownEdits);
        $('dropdownEditorModal').addEventListener('click', (e) => {
            if (e.target === $('dropdownEditorModal')) closeDropdownEditor();
        });

        $('dropdownAddBtn').addEventListener('click', () => {
            const value = $('dropdownNewValue').value.trim().toLowerCase().replace(/\s+/g, '-');
            const label = $('dropdownNewLabel').value.trim();
            if (!value || !label) return;
            if (currentDropdownEdits.some(o => o.value === value)) {
                showMsg('Option already exists', true);
                return;
            }
            currentDropdownEdits.push({ value, label });
            renderDropdownEditorList();
            $('dropdownNewValue').value = '';
            $('dropdownNewLabel').value = '';
            $('dropdownNewValue').focus();
        });

        $('dropdownNewLabel').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); $('dropdownAddBtn').click(); }
        });

        $('dropdownEditorList').addEventListener('click', (e) => {
            const btn = e.target.closest('.dropdown-editor-remove');
            if (!btn) return;
            const idx = parseInt(btn.dataset.index, 10);
            if (currentDropdownEdits.length <= 1) {
                showMsg('Must have at least one option', true);
                return;
            }
            currentDropdownEdits.splice(idx, 1);
            renderDropdownEditorList();
        });
    }

    // ── Init ──────────────────────────────
    function init() {
        initNav();
        initOverviewCards();
        initOverviewLookup();
        initExpandToggles();
        initProfileForm();
        initCompanyTabs();
        initCompanyDashboard();
        initTruckForm();
        initSheetModals();
        initTrailerForm();
        initDriverForm();
        initDropdownEditors();
        initModalBackdrops();
        initSearchFilters();
        initInlineEditing();
        initAuth();
    }

    // Expose edit/delete/inline methods for inline onclick
    window.Dashboard = {
        editTruck, editTrailer, editDriver,
        deleteTruck, deleteTrailer, deleteDriver,
        inlineStatus,
        openTruckProfile, openTrailerProfile, openDriverProfile
    };

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
