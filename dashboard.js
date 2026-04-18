/* ==========================================
   CARRIER DASHBOARD “ JavaScript
   ========================================== */

(function () {
    'use strict';

    // ── State ──────────────────────────────
    const state = {
        user: null,
        trucks: [],
        trailers: [],
        drivers: [],
        loads: [],
        inspections: [],
        profile: {},
        fmcsaSnapshot: null,
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

    function getCurrentUserRole() {
        if (!state.user || !state.companyDashboard?.users) return 'Owner';
        const email = (state.user.email || '').toLowerCase();
        const me = state.companyDashboard.users.find(u => u.id === uid() || ((u.email || '').toLowerCase() === email));
        return me?.role || 'Owner';
    }

    function canToggleDND() {
        const role = getCurrentUserRole();
        return ['Owner', 'Admin', 'Safety Manager'].includes(role);
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
                { value: 'maintenance', label: 'In Maintenance' },
                { value: 'inshop', label: 'In Shop' },
                { value: 'reserved', label: 'Reserved' },
                { value: 'sold', label: 'Sold' }
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
                { value: 'maintenance', label: 'In Maintenance' },
                { value: 'inshop', label: 'In Shop' },
                { value: 'reserved', label: 'Reserved' },
                { value: 'sold', label: 'Sold' }
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
                { value: 'home-time', label: 'Home Time' },
                { value: 'training', label: 'Training' },
                { value: 'pending', label: 'Pending' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'terminated', label: 'Terminated' }
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
        },
        loadStatus: {
            label: 'Load Status',
            defaults: [
                { value: 'booked', label: 'Booked' },
                { value: 'dispatched', label: 'Dispatched' },
                { value: 'loaded', label: 'Loaded' },
                { value: 'in-transit', label: 'In Transit' },
                { value: 'delivered', label: 'Delivered' },
                { value: 'invoiced', label: 'Invoiced' },
                { value: 'paid', label: 'Paid' },
                { value: 'canceled', label: 'Canceled' },
                { value: 'issue', label: 'Issue' }
            ],
            formIds: ['loadStatus'],
            filterIds: ['loadStatusFilter'],
            sheetPath: { type: 'load', colKey: 'status' }
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
    function titleCase(s) { return s ? s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) : s; }
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
            // Navigate to hash section if present, else stay on overview
            const hash = window.location.hash.replace('#', '');
            if (hash) navigateToSection(hash, true);
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

    function navigateToSection(section, skipHash) {
        if (!section) return;
        
        // Handle external pages
        if (section === 'task-manager') {
            window.location.href = 'task-manager.html';
            return;
        }

        // Update URL hash (skip during popstate handling)
        if (!skipHash) {
            history.pushState(null, '', '#' + section);
        }
        
        // Map sections to their parent department groups
        const sectionGroups = {
            // Safety
            'safety': 'safety', 'trucks': 'safety', 'trailers': 'safety', 'drivers': 'safety', 'compliance': 'safety', 'ifta-wizard': 'safety',
            // Fleet Maintenance
            'maintenance': 'maintenance', 'work-orders': 'maintenance', 'pm-schedules': 'maintenance', 'parts-inventory': 'maintenance',
            // Dispatch
            'dispatch': 'dispatch', 'dispatch-board': 'dispatch', 'active-loads': 'dispatch', 'driver-assignments': 'dispatch',
            // Track & Trace
            'tracking': 'tracking', 'live-map': 'tracking', 'load-status': 'tracking', 'eta-tracking': 'tracking',
            // Accounting
            'accounting': 'accounting', 'invoices': 'accounting', 'settlements': 'accounting', 'expenses': 'accounting', 'payroll': 'accounting',
            // Hiring
            'hiring': 'hiring', 'applications': 'hiring', 'hiring-pipeline': 'hiring', 'onboarding': 'hiring',
            // Claims
            'claims': 'claims', 'accidents': 'claims', 'cargo-claims': 'claims', 'insurance': 'claims',
            // Afterhours
            'afterhours': 'afterhours', 'on-call': 'afterhours', 'emergency-contacts': 'afterhours', 'driver-support': 'afterhours',
            // Operations
            'operations': 'operations', 'command-center': 'operations', 'cross-dept-alerts': 'operations', 'reports': 'operations',
            // Reports
            'task-manager': 'reports'
        };
        
        const activeGroup = sectionGroups[section] || null;
        
        // Update nav items active state
        document.querySelectorAll('.dash-nav-item').forEach(b => {
            b.classList.toggle('active', b.dataset.section === section);
        });
        
        // Update sections visibility
        document.querySelectorAll('.dash-section').forEach(s => {
            s.classList.toggle('active', s.id === 'section-' + section);
        });
        
        // Update nav groups - open the correct one, close others
        document.querySelectorAll('.dash-nav-group').forEach(group => {
            const trigger = group.querySelector('.dash-nav-group-trigger');
            const triggerSection = trigger ? trigger.dataset.section : null;
            const isActiveGroup = triggerSection === activeGroup;
            group.classList.toggle('open', isActiveGroup);
            if (trigger) trigger.classList.toggle('active', isActiveGroup);
        });
        
        // Update page title
        const btn = document.querySelector('.dash-nav-item[data-section="' + section + '"]');
        if (btn) {
            const span = btn.querySelector('span');
            $('pageTitle').textContent = span ? span.textContent : section;
        } else if (section === 'profile') {
            $('pageTitle').textContent = 'Account';
        } else if (section === 'overview') {
            $('pageTitle').textContent = 'Dashboard Overview';
        }
    }

    // ── Navigation ────────────────────────
    function initNav() {
        const HOVER_OPEN_DELAY_MS = 280;
        const HOVER_CLOSE_DELAY_MS = 180;

        // Handle nav item clicks
        document.querySelectorAll('.dash-nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                navigateToSection(btn.dataset.section);
            });
        });
        
        // Handle nav group trigger clicks (navigate to dept page + toggle expand/collapse)
        document.querySelectorAll('.dash-nav-group-trigger').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const group = trigger.closest('.dash-nav-group');
                if (!group) return;
                const isAlreadyOpen = group.classList.contains('open');
                if (isAlreadyOpen) {
                    // Second click collapses the group (stays on current section)
                    group.classList.remove('open');
                    trigger.classList.remove('active');
                } else {
                    // First click: navigate to dept landing page (which opens this group)
                    const deptSection = trigger.dataset.section;
                    if (deptSection) navigateToSection(deptSection);
                }
            });
        });

        // Open dropdowns only after a short hover pause to prevent accidental popups.
        if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
            document.querySelectorAll('.dash-nav-group').forEach(group => {
                let openTimer = null;
                let closeTimer = null;
                const trigger = group.querySelector('.dash-nav-group-trigger');

                const isPinnedOpen = () => Boolean(group.querySelector('.dash-nav-item.active'));

                const openGroup = () => {
                    document.querySelectorAll('.dash-nav-group').forEach(g => {
                        if (g !== group) g.classList.remove('open');
                    });
                    document.querySelectorAll('.dash-nav-group-trigger').forEach(t => {
                        if (t !== trigger) t.classList.remove('active');
                    });
                    group.classList.add('open');
                    if (trigger) trigger.classList.add('active');
                };

                const closeGroup = () => {
                    if (isPinnedOpen()) return;
                    group.classList.remove('open');
                    if (trigger) trigger.classList.remove('active');
                };

                group.addEventListener('mouseenter', () => {
                    if (closeTimer) {
                        clearTimeout(closeTimer);
                        closeTimer = null;
                    }
                    if (openTimer) clearTimeout(openTimer);
                    openTimer = setTimeout(openGroup, HOVER_OPEN_DELAY_MS);
                });

                group.addEventListener('mouseleave', () => {
                    if (openTimer) {
                        clearTimeout(openTimer);
                        openTimer = null;
                    }
                    if (closeTimer) clearTimeout(closeTimer);
                    closeTimer = setTimeout(closeGroup, HOVER_CLOSE_DELAY_MS);
                });
            });
        }

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

        // Back/forward browser navigation
        window.addEventListener('popstate', () => {
            const hash = window.location.hash.replace('#', '');
            if (hash) navigateToSection(hash, true);
            else navigateToSection('overview', true);
        });
    }

    // ── Load All Data ─────────────────────
    async function loadAll() {
        await Promise.all([loadProfile(), loadTrucks(), loadTrailers(), loadDrivers(), loadLoads(), loadInspections()]);
        renderTrucks();
        renderTrailers();
        renderDrivers();
        renderLoads();
        updateOverview();
        renderComplianceReminders(state.fmcsaSnapshot);
        initComplianceSection();
        lockCompanyIfSet();

        // ── TEMPORARY: Seed sample inspections (remove after testing) ──
        try {
            const seedFlag = localStorage.getItem('inspections_seeded');
            if (!seedFlag) {
                const seedFn = firebase.functions().httpsCallable('seedInspections');
                const r = await seedFn();
                if (r.data && r.data.success) {
                    localStorage.setItem('inspections_seeded', '1');
                    console.log('Seeded', r.data.count, 'sample inspections');
                    await loadInspections();
                }
            }
        } catch(e) { console.warn('Seed skipped:', e.message); }
        // ── END TEMPORARY ──
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
            if (data.company) $('navCompanyLabel').textContent = titleCase(data.company);
            $('dashDotNumber').value = data.dotNumber || '';
            $('dashMcNumber').value = (data.mcNumber || '').replace(/\D/g, '');
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
            state.fmcsaSnapshot = data.fmcsaSnapshot || null;
            updateSamsaraUI(data.samsara || null);
            ensureCompanyOwnerMember();
            renderCompanyDashboard();
        } catch (e) {
            console.error('Error loading profile:', e);
        }
    }

    function lockCompanyIfSet() {
        const company = ($('dashCompany')?.value || '').trim();
        const dot = ($('dashDotNumber')?.value || '').trim();
        const isSet = company && dot;

        const notice = $('companyLockedNotice');
        const lookupBar = $('fmcsaLookupBar');
        const verifyCard = $('fmcsaVerifyCard');
        const changeBtn = $('companyChangeBtn');

        if (isSet) {
            if (notice) notice.classList.remove('hidden');
            if (lookupBar) lookupBar.style.display = 'none';
            if (verifyCard) verifyCard.classList.add('hidden');

            ['dashCompany', 'dashDotNumber', 'dashMcNumber', 'dashEin'].forEach(id => {
                const el = $(id);
                if (el) { el.readOnly = true; el.classList.add('field-locked'); }
            });

            if (changeBtn) changeBtn.onclick = unlockCompany;
        } else {
            if (notice) notice.classList.add('hidden');
            if (lookupBar) lookupBar.style.display = '';
            ['dashCompany', 'dashDotNumber', 'dashMcNumber', 'dashEin'].forEach(id => {
                const el = $(id);
                if (el) { el.readOnly = false; el.classList.remove('field-locked'); }
            });
        }
    }

    async function unlockCompany() {
        const ok = confirm('Are you sure you want to remove this company? This will clear your company name, DOT, MC, and EIN. Your trucks, trailers, and drivers will remain but may need to be re-associated.');
        if (!ok) return;

        try {
            await db.collection('users').doc(uid()).set({
                company: firebase.firestore.FieldValue.delete(),
                dotNumber: firebase.firestore.FieldValue.delete(),
                mcNumber: firebase.firestore.FieldValue.delete(),
                ein: firebase.firestore.FieldValue.delete(),
                fmcsaSnapshot: firebase.firestore.FieldValue.delete(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            $('dashCompany').value = '';
            $('dashDotNumber').value = '';
            $('dashMcNumber').value = '';
            $('dashEin').value = '';
            state.fmcsaSnapshot = null;
            renderComplianceSection(null);
            renderComplianceReminders(null);
            lockCompanyIfSet();
            showMsg('Company removed. You can now set up a new company.');
        } catch (err) {
            console.error('Unlock company error:', err);
            showMsg('Failed to remove company', true);
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
                $('navCompanyLabel').textContent = titleCase(payload.company) || 'Company';
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

    // ── FMCSA Company Lookup (MC or DOT) ” direct browser calls ──────
    async function fmcsaFetchMc(mc) {
        const url = `${FMCSA_CONFIG.baseUrl}/carriers/docket-number/${encodeURIComponent(mc)}?webKey=${encodeURIComponent(FMCSA_CONFIG.webKey)}`;
        const resp = await fetch(url, { headers: { Accept: 'application/json' } });
        if (resp.status === 404) throw new Error(`No carrier found for MC number ${mc}`);
        if (!resp.ok) throw new Error('FMCSA API error. Try again later.');
        const body = await resp.json();
        const c = body?.content?.[0]?.carrier || body?.content?.carrier;
        if (!c) throw new Error(`No carrier data returned for MC number ${mc}`);
        const address = [c.phyStreet, c.phyCityName, c.phyStateAbbr, c.phyZipcode].filter(Boolean).join(', ');
        const censusType = typeof c.censusTypeId === 'object' ? c.censusTypeId?.censusType : c.censusTypeId;
        const prefix = censusType === 'MX' ? 'MX' : 'MC';
        return {
            companyName: c.legalName || null,
            dbaName: c.dbaName || null,
            dotNumber: c.dotNumber ? String(c.dotNumber) : null,
            mcNumber: c.censusNum ? `${prefix}-${c.censusNum}` : `MC-${mc}`,
            status: c.allowedToOperate === 'Y' ? 'Authorized' : 'Not Authorized',
            safetyRating: c.safetyRating || null,
            address: address || null,
            phone: c.telephone ? c.telephone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3') : null,
            operationType: c.carrierOperation?.carrierOperationDesc || c.carrierOperationDesc || null,
            entityType: c.entityTypeDesc || (typeof c.censusTypeId === 'object' ? c.censusTypeId?.censusTypeDesc : null),
            insuranceOnFile: c.bipdInsuranceOnFile && c.bipdInsuranceOnFile !== '0',
        };
    }

    async function fmcsaFetchDot(dot) {
        const base = FMCSA_CONFIG.baseUrl;
        const key = FMCSA_CONFIG.webKey;
        const mainUrl = `${base}/carriers/${encodeURIComponent(dot)}?webKey=${encodeURIComponent(key)}`;
        const resp = await fetch(mainUrl, { headers: { Accept: 'application/json' } });
        if (resp.status === 404) throw new Error(`No carrier found for DOT number ${dot}`);
        if (!resp.ok) throw new Error('FMCSA API error. Try again later.');
        const body = await resp.json();
        const c = body?.content?.carrier;
        if (!c) throw new Error(`No carrier data returned for DOT number ${dot}`);

        // Fetch docket numbers & operation classification in parallel (non-blocking)
        let docketNumbers = [], operationClasses = [];
        try {
            const [docketResp, opsResp] = await Promise.all([
                fetch(`${base}/carriers/${encodeURIComponent(dot)}/docket-numbers?webKey=${encodeURIComponent(key)}`, { headers: { Accept: 'application/json' } }),
                fetch(`${base}/carriers/${encodeURIComponent(dot)}/operation-classification?webKey=${encodeURIComponent(key)}`, { headers: { Accept: 'application/json' } }),
            ]);
            if (docketResp.ok) { const d = await docketResp.json(); docketNumbers = d?.content || []; }
            if (opsResp.ok) { const d = await opsResp.json(); operationClasses = d?.content || []; }
        } catch (_) { /* non-critical */ }

        const fmt = (v) => (v != null && v !== '' ? String(v) : null);
        const fmtP = (v) => { if (!v) return null; const d = String(v).replace(/\D/g, ''); return d.length === 10 ? d.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3') : String(v); };
        const yn = (v) => (v === 'Y' || v === '1' || v === true);
        const num = (v) => (v != null ? Number(v) : null);

        // Build MC number from docket numbers if not in main record
        let mcNumber = c.censusNum ? `MC-${c.censusNum}` : null;
        if (!mcNumber && docketNumbers.length) {
            const mc = docketNumbers.find(d => d.prefix === 'MC');
            if (mc) mcNumber = `MC-${mc.docketNumber}`;
        }

        // Build operation descriptions from sub-endpoint
        const opDescriptions = operationClasses.map(o => o.operationClassDesc).filter(Boolean);

        return {
            // Identity
            legalName: fmt(c.legalName), dbaName: fmt(c.dbaName), dotNumber: fmt(c.dotNumber),
            mcNumber,
            einNumber: fmt(c.ein || c.einNumber),
            dunsNumber: fmt(c.dunsNumber), statusCode: fmt(c.statusCode),
            allowedToOperate: yn(c.allowedToOperate) ? 'Authorized' : 'Not Authorized',
            operationType: opDescriptions.length ? opDescriptions.join(', ') : fmt(c.carrierOperationDesc),
            entityType: fmt(c.entityTypeDesc),
            isPassengerCarrier: yn(c.isPassengerCarrier),

            // Authority
            commonAuthorityStatus: fmt(c.commonAuthorityStatus),
            contractAuthorityStatus: fmt(c.contractAuthorityStatus),
            brokerAuthorityStatus: fmt(c.brokerAuthorityStatus),
            docketNumbers,

            // Physical address
            phyStreet: fmt(c.phyStreet), phyCity: fmt(c.phyCityName || c.phyCity),
            phyState: fmt(c.phyStateAbbr || c.phyState), phyZip: fmt(c.phyZipcode), phyCountry: fmt(c.phyCountry),
            // Mailing address
            maiStreet: fmt(c.maiStreet), maiCity: fmt(c.maiCityName || c.maiCity),
            maiState: fmt(c.maiStateAbbr || c.maiState), maiZip: fmt(c.maiZipcode), maiCountry: fmt(c.maiCountry),

            telephone: fmtP(c.telephone), fax: fmtP(c.fax), email: fmt(c.emailAddress),

            // Fleet size
            totalDrivers: num(c.totalDrivers),
            totalPowerUnits: num(c.totalPowerUnits),

            // Mileage
            mcs150Mileage: num(c.mcs150Mileage),
            mcs150MileageYear: fmt(c.mcs150MileageYear), mcs150FormDate: fmt(c.mcs150FormDate),
            mcs150Outdated: fmt(c.mcs150Outdated),

            // Safety
            safetyRating: fmt(c.safetyRating), safetyRatingDate: fmt(c.safetyRatingDate),
            reviewDate: fmt(c.reviewDate || c.safetyReviewDate), reviewType: fmt(c.reviewType || c.safetyReviewType),
            oosDate: fmt(c.oosDate),

            // Crashes
            crashTotal: num(c.crashTotal), fatalCrash: num(c.fatalCrash),
            injCrash: num(c.injCrash), towCrash: num(c.towawayCrash ?? c.towCrash),

            // Inspections
            driverInsp: num(c.driverInsp), vehicleInsp: num(c.vehicleInsp), hazmatInsp: num(c.hazmatInsp),

            // Out of service
            driverOosInsp: num(c.driverOosInsp), vehicleOosInsp: num(c.vehicleOosInsp), hazmatOosInsp: num(c.hazmatOosInsp),
            driverOosRate: num(c.driverOosRate), vehicleOosRate: num(c.vehicleOosRate), hazmatOosRate: num(c.hazmatOosRate),
            driverOosRateNatAvg: fmt(c.driverOosRateNationalAverage),
            vehicleOosRateNatAvg: fmt(c.vehicleOosRateNationalAverage),
            hazmatOosRateNatAvg: fmt(c.hazmatOosRateNationalAverage),

            // Insurance
            bipdInsuranceRequired: fmt(c.bipdInsuranceRequired), bipdInsuranceOnFile: fmt(c.bipdInsuranceOnFile),
            bipdRequiredAmount: fmt(c.bipdRequiredAmount),
            cargoInsuranceRequired: fmt(c.cargoInsuranceRequired), cargoInsuranceOnFile: fmt(c.cargoInsuranceOnFile),
            bondInsuranceRequired: fmt(c.bondInsuranceRequired), bondInsuranceOnFile: fmt(c.bondInsuranceOnFile),
            oicState: fmt(c.oicState),

            fetchedAt: new Date().toISOString(),
        };
    }

    let pendingFmcsaData = null;

    function initFmcsaLookup() {
        const typeSelect = $('fmcsaLookupType');
        const input = $('fmcsaLookupInput');
        const lookupBtn = $('fmcsaLookupBtn');
        const verifyCard = $('fmcsaVerifyCard');
        const confirmBtn = $('fmcsaVerifyConfirmBtn');
        const cancelBtn = $('fmcsaVerifyCancelBtn');

        if (!typeSelect || !input || !lookupBtn) return;

        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '');
        });

        const mcField = $('dashMcNumber');
        if (mcField) mcField.addEventListener('input', () => {
            mcField.value = mcField.value.replace(/\D/g, '');
        });

        typeSelect.addEventListener('change', () => {
            input.placeholder = typeSelect.value === 'mc' ? 'e.g. 123456' : 'e.g. 1234567';
            input.value = '';
            verifyCard.classList.add('hidden');
            pendingFmcsaData = null;
        });

        lookupBtn.addEventListener('click', () => performFmcsaLookup());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); performFmcsaLookup(); }
        });

        confirmBtn.addEventListener('click', () => confirmFmcsaLookup());

        cancelBtn.addEventListener('click', () => {
            verifyCard.classList.add('hidden');
            pendingFmcsaData = null;
        });
    }

    async function performFmcsaLookup() {
        const type = $('fmcsaLookupType').value;
        const raw = $('fmcsaLookupInput').value.replace(/\D/g, '').trim();
        if (!raw) { showMsg('Enter a ' + (type === 'mc' ? 'MC' : 'DOT') + ' number', true); return; }

        const btn = $('fmcsaLookupBtn');
        btn.disabled = true;
        btn.classList.add('searching');

        try {
            if (type === 'mc') {
                const mcData = await fmcsaFetchMc(raw);
                if (mcData.dotNumber) {
                    try {
                        pendingFmcsaData = await fmcsaFetchDot(mcData.dotNumber);
                    } catch (_) {
                        pendingFmcsaData = mcData;
                    }
                } else {
                    pendingFmcsaData = mcData;
                }
            } else {
                pendingFmcsaData = await fmcsaFetchDot(raw);
            }

            renderVerifyCard(pendingFmcsaData);
        } catch (err) {
            console.error('FMCSA lookup error:', err);
            // Firebase HttpsError has the message in err.message directly
            showMsg(err.message || 'Lookup failed', true);
            pendingFmcsaData = null;
        } finally {
            btn.disabled = false;
            btn.classList.remove('searching');
        }
    }

    function renderVerifyCard(d) {
        const card = $('fmcsaVerifyCard');
        const statusEl = $('fmcsaVerifyStatus');
        const bodyEl = $('fmcsaVerifyBody');

        const authorized = d.allowedToOperate === 'Authorized' || d.status === 'Authorized';
        statusEl.className = 'fmcsa-verify-status ' + (authorized ? 'fmcsa-status-ok' : 'fmcsa-status-bad');
        statusEl.textContent = authorized ? 'Authorized' : (d.allowedToOperate || d.status || 'Unknown');

        const address = d.address || [d.phyStreet, d.phyCity, d.phyState, d.phyZip].filter(Boolean).join(', ') || '\u2014';

        const row = (label, val) => `<div class="fmcsa-verify-row"><span class="fmcsa-verify-label">${escapeHtml(label)}</span><span class="fmcsa-verify-value">${escapeHtml(val || '\u2014')}</span></div>`;

        bodyEl.innerHTML =
            row('Legal Name', d.legalName || d.companyName)
            + (d.dbaName ? row('DBA', d.dbaName) : '')
            + row('USDOT', d.dotNumber)
            + row('MC Number', d.mcNumber)
            + (d.einNumber ? row('EIN', d.einNumber) : '')
            + row('Address', address)
            + row('Phone', d.telephone || d.phone)
            + row('Entity Type', d.entityType)
            + row('Operation', d.operationType)
            + (d.totalPowerUnits != null ? row('Power Units (Trucks)', String(d.totalPowerUnits)) : '')
            + (d.totalDrivers != null ? row('Drivers', String(d.totalDrivers)) : '')
            + (d.safetyRating ? row('Safety Rating', d.safetyRating) : '')
            + (d.crashTotal != null ? row('Total Crashes', String(d.crashTotal)) : '');

        card.classList.remove('hidden');
    }

    async function confirmFmcsaLookup() {
        const d = pendingFmcsaData;
        if (!d) return;

        $('dashCompany').value = d.legalName || d.companyName || '';
        $('dashDotNumber').value = d.dotNumber || '';
        $('dashMcNumber').value = (d.mcNumber || '').replace(/\D/g, '');
        $('dashEin').value = d.einNumber || '';

        const address = d.address || [d.phyStreet, d.phyCity, d.phyState, d.phyZip].filter(Boolean).join(', ') || '';
        $('dashAddress').value = address;

        const baseState = d.phyState || '';
        if (baseState) $('dashBaseState').value = baseState;

        const units = d.totalPowerUnits;
        if (units != null) {
            if (units <= 5) $('dashFleetSize').value = '1-5';
            else if (units <= 20) $('dashFleetSize').value = '6-20';
            else if (units <= 50) $('dashFleetSize').value = '21-50';
            else if (units <= 100) $('dashFleetSize').value = '51-100';
            else $('dashFleetSize').value = '100+';
        }

        $('fmcsaVerifyCard').classList.add('hidden');
        $('fmcsaLookupBar').classList.add('fmcsa-lookup-done');
        pendingFmcsaData = null;

        const officeAddress = $('dashAddress').value.trim();
        const payload = {
            company: $('dashCompany').value.trim(),
            dotNumber: $('dashDotNumber').value.trim(),
            mcNumber: $('dashMcNumber').value.trim(),
            ein: $('dashEin').value.trim(),
            address: officeAddress,
            officeAddress: officeAddress,
            fleetSize: $('dashFleetSize').value,
            baseState: $('dashBaseState').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (d.fetchedAt) {
            state.fmcsaSnapshot = d;
            payload.fmcsaSnapshot = d;
        }

        try {
            await db.collection('users').doc(uid()).set(payload, { merge: true });
            showMsg('Company profile created from FMCSA');
            $('navCompanyLabel').textContent = titleCase(payload.company) || 'Company';
            if (state.fmcsaSnapshot) {
                renderComplianceSection(state.fmcsaSnapshot);
                renderComplianceReminders(state.fmcsaSnapshot);
            }
            lockCompanyIfSet();
        } catch (err) {
            console.error('Save company from FMCSA error:', err);
            showMsg('Fields auto-filled \u2014 click Save to store', false);
        }
    }

    function fmcsaRow(label, value) {
        const v = value != null && value !== '' ? String(value) : '\u2014';
        return `<div class="fmcsa-row"><span class="fmcsa-row-label">${escapeHtml(label)}</span><span class="fmcsa-row-value">${escapeHtml(v)}</span></div>`;
    }

    // ── Compliance Section (Safety > Compliance) ──────────
    function renderComplianceSection(d) {
        const hint = $('complianceHint');
        const snap = $('complianceSnapshot');
        if (!hint || !snap) return;

        if (!d) {
            hint.style.display = 'flex';
            snap.style.display = 'none';
            return;
        }
        hint.style.display = 'none';
        snap.style.display = 'flex';

        // Company name heading
        const titleEl = $('complianceTitle');
        const authEl = $('complianceAuthority');
        if (titleEl && d.legalName) titleEl.textContent = d.legalName;
        if (authEl) authEl.textContent = d.operationType || '';

        // Summary stat cards
        const totalInsp = (d.driverInsp || 0) + (d.vehicleInsp || 0) + (d.hazmatInsp || 0);
        const totalOos = (d.driverOosInsp || 0) + (d.vehicleOosInsp || 0) + (d.hazmatOosInsp || 0);
        const oosRate = totalInsp > 0 ? ((totalOos / totalInsp) * 100).toFixed(1) : '0.0';
        const statCard = (label, value, sub) => {
            let cls = '';
            return `<div class="compliance-stat-card${cls}"><span class="compliance-stat-value">${escapeHtml(String(value ?? '\u2014'))}</span><span class="compliance-stat-label">${escapeHtml(label)}</span>${sub ? `<span class="compliance-stat-sub">${escapeHtml(sub)}</span>` : ''}</div>`;
        };
        $('complianceStats').innerHTML =
            statCard('Total Inspections', totalInsp)
            + statCard('Out-of-Service', totalOos, oosRate + '% OOS rate')
            + statCard('Total Crashes', d.crashTotal ?? '\u2014')
            + statCard('Safety Rating', d.safetyRating || 'None')
            + statCard('Power Units', d.totalPowerUnits ?? '\u2014')
            + statCard('Drivers', d.totalDrivers ?? '\u2014');

        // Inspections breakdown
        const oosRateWithAvg = (rate, natAvg) => {
            let s = rate != null ? rate + '%' : '\u2014';
            if (natAvg) s += ` (Nat. Avg: ${natAvg}%)`;
            return s;
        };
        $('compDriverInsp').innerHTML =
            fmcsaRow('Inspections', d.driverInsp)
            + fmcsaRow('Out-of-Service', d.driverOosInsp)
            + fmcsaRow('OOS Rate', oosRateWithAvg(d.driverOosRate, d.driverOosRateNatAvg));

        $('compVehicleInsp').innerHTML =
            fmcsaRow('Inspections', d.vehicleInsp)
            + fmcsaRow('Out-of-Service', d.vehicleOosInsp)
            + fmcsaRow('OOS Rate', oosRateWithAvg(d.vehicleOosRate, d.vehicleOosRateNatAvg));

        $('compHazmatInsp').innerHTML =
            fmcsaRow('Inspections', d.hazmatInsp)
            + fmcsaRow('Out-of-Service', d.hazmatOosInsp)
            + fmcsaRow('OOS Rate', oosRateWithAvg(d.hazmatOosRate, d.hazmatOosRateNatAvg));

        // Crashes
        $('compCrashes').innerHTML =
            fmcsaRow('Total Crashes', d.crashTotal)
            + fmcsaRow('Fatal', d.fatalCrash)
            + fmcsaRow('Injury', d.injCrash)
            + fmcsaRow('Tow-Away', d.towCrash);

        // Safety
        $('compSafety').innerHTML =
            fmcsaRow('Safety Rating', d.safetyRating)
            + fmcsaRow('Rating Date', d.safetyRatingDate)
            + fmcsaRow('Last Review', d.reviewDate)
            + fmcsaRow('Review Type', d.reviewType)
            + (d.oosDate ? fmcsaRow('OOS Date', d.oosDate) : '');

        // Authority
        const authLabel = (code) => ({ A: 'Active', I: 'Inactive', N: 'None' }[code] || code || '\u2014');
        let authorityHtml = fmcsaRow('Common (Property)', authLabel(d.commonAuthorityStatus))
            + fmcsaRow('Contract', authLabel(d.contractAuthorityStatus))
            + fmcsaRow('Broker', authLabel(d.brokerAuthorityStatus));
        if (d.docketNumbers && d.docketNumbers.length) {
            authorityHtml += fmcsaRow('Docket Numbers', d.docketNumbers.map(dn => dn.prefix + '-' + dn.docketNumber).join(', '));
        }
        $('compAuthority').innerHTML = authorityHtml;

        // Insurance
        const ins = (req, onFile) => {
            if (!req && !onFile) return '\u2014';
            const r = req && req !== 'u' && req !== '0' ? '$' + Number(req).toLocaleString() : '\u2014';
            const f = onFile && onFile !== '0' ? '$' + Number(onFile).toLocaleString() : '\u2014';
            return `Req: ${r} / On file: ${f}`;
        };
        $('compInsurance').innerHTML =
            fmcsaRow('BIPD Liability', ins(d.bipdInsuranceRequired, d.bipdInsuranceOnFile))
            + (d.bipdRequiredAmount && d.bipdRequiredAmount !== '0' ? fmcsaRow('BIPD Required Amt', '$' + Number(d.bipdRequiredAmount).toLocaleString()) : '')
            + fmcsaRow('Cargo', ins(d.cargoInsuranceRequired, d.cargoInsuranceOnFile))
            + fmcsaRow('Bond/Surety', ins(d.bondInsuranceRequired, d.bondInsuranceOnFile))
            + fmcsaRow('Insurance State', d.oicState);

        // Identity
        $('compIdentity').innerHTML =
            fmcsaRow('Legal Name', d.legalName)
            + fmcsaRow('DBA', d.dbaName)
            + fmcsaRow('USDOT', d.dotNumber)
            + fmcsaRow('MC Number', d.mcNumber)
            + fmcsaRow('EIN', d.einNumber)
            + fmcsaRow('Entity Type', d.entityType)
            + fmcsaRow('Phone', d.telephone)
            + fmcsaRow('Address', [d.phyStreet, d.phyCity, d.phyState, d.phyZip].filter(Boolean).join(', '));

        // Fleet
        const mileageLabel = d.mcs150MileageYear ? `Miles (${d.mcs150MileageYear})` : 'Miles';
        $('compFleet').innerHTML =
            fmcsaRow('Power Units', d.totalPowerUnits)
            + fmcsaRow('Drivers', d.totalDrivers)
            + fmcsaRow(mileageLabel, d.mcs150Mileage != null ? Number(d.mcs150Mileage).toLocaleString() : null)
            + fmcsaRow('MCS-150 Date', d.mcs150FormDate)
            + fmcsaRow('MCS-150 Outdated', d.mcs150Outdated === 'Y' ? 'Yes' : d.mcs150Outdated === 'N' ? 'No' : d.mcs150Outdated);

        if (d.fetchedAt) {
            $('complianceFetchedAt').textContent = 'Last fetched: ' + new Date(d.fetchedAt).toLocaleString();
        }
    }

    async function initComplianceSection() {
        renderComplianceSection(state.fmcsaSnapshot || null);
        // Collapsible block toggles
        document.querySelectorAll('.compliance-collapsible .compliance-block-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => toggle.closest('.compliance-collapsible').classList.toggle('open'));
        });
        const dot = ($('dashDotNumber')?.value || '').replace(/\D/g, '').trim();
        if (!dot) return;
        try {
            const data = await fmcsaFetchDot(dot);
            if (!data) return;
            state.fmcsaSnapshot = data;
            await db.collection('users').doc(uid()).set({
                fmcsaSnapshot: data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            renderComplianceSection(data);
            renderComplianceReminders(data);
        } catch (err) {
            console.error('Compliance auto-refresh error:', err);
        }
    }

    function renderComplianceReminders(fmcsaData) {
        const container = $('fmcsaReminders');
        const block = $('complianceRemindersBlock');
        if (!container) return;
        const reminders = [];
        const today = new Date();

        const iftaDeadlines = [
            { q: 'Q1', month: 3, day: 30, label: 'Q1 (Jan\u2013Mar)' },
            { q: 'Q2', month: 6, day: 31, label: 'Q2 (Apr\u2013Jun)' },
            { q: 'Q3', month: 9, day: 31, label: 'Q3 (Jul\u2013Sep)' },
            { q: 'Q4', month: 0, day: 31, label: 'Q4 (Oct\u2013Dec)', nextYear: true }
        ];

        iftaDeadlines.forEach(dl => {
            const yr = dl.nextYear && today.getMonth() >= 10 ? today.getFullYear() + 1 : today.getFullYear();
            const deadline = new Date(yr, dl.month, dl.day);
            const daysUntil = Math.ceil((deadline - today) / 86400000);

            if (daysUntil >= 0 && daysUntil <= 60) {
                const type = daysUntil <= 7 ? 'danger' : daysUntil <= 30 ? 'warning' : 'info';
                reminders.push({
                    type, icon: 'calendar', link: '/',
                    text: `IFTA ${dl.label} filing due ${deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} \u2014 ${daysUntil} day${daysUntil !== 1 ? 's' : ''} left`
                });
            }
        });

        if (fmcsaData && fmcsaData.mcs150FormDate) {
            const lastFiled = new Date(fmcsaData.mcs150FormDate);
            if (!isNaN(lastFiled.getTime())) {
                const nextDue = new Date(lastFiled);
                nextDue.setFullYear(nextDue.getFullYear() + 2);
                const daysUntilMcs = Math.ceil((nextDue - today) / 86400000);

                if (daysUntilMcs < 0) {
                    reminders.push({
                        type: 'danger', icon: 'alert',
                        text: `MCS-150 biennial update is OVERDUE \u2014 last filed ${lastFiled.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. File immediately at FMCSA.`
                    });
                } else if (daysUntilMcs <= 90) {
                    reminders.push({
                        type: daysUntilMcs <= 30 ? 'danger' : 'warning', icon: 'calendar',
                        text: `MCS-150 biennial update due ${nextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} \u2014 ${daysUntilMcs} day${daysUntilMcs !== 1 ? 's' : ''} left`
                    });
                } else {
                    reminders.push({
                        type: 'info', icon: 'check',
                        text: `MCS-150 up to date \u2014 next due ${nextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    });
                }
            }
        } else {
            reminders.push({
                type: 'warning', icon: 'alert',
                text: 'MCS-150 filing date unknown \u2014 fetch FMCSA data or verify your biennial update is filed'
            });
        }

        if (reminders.length === 0) {
            container.innerHTML = '<p class="fmcsa-no-reminders">No upcoming deadlines.</p>';
            return;
        }

        const iconMap = {
            calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
            alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        };

        container.innerHTML = reminders.map(r => {
            if (r.link) {
                return `<a href="${escapeHtml(r.link)}" onclick="sessionStorage.setItem('fromDashboard','true')" class="fmcsa-reminder fmcsa-reminder-${escapeHtml(r.type)} fmcsa-reminder-link" title="Go to IFTA Wizard">`
                    + `${iconMap[r.icon] || ''}  <span>${escapeHtml(r.text)}</span>`
                    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="fmcsa-reminder-arrow"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>`
                    + `</a>`;
            }
            return `<div class="fmcsa-reminder fmcsa-reminder-${escapeHtml(r.type)}">`
                + `${iconMap[r.icon] || ''}  <span>${escapeHtml(r.text)}</span></div>`;
        }).join('');
        if (block) block.style.display = '';
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
        const thead = table?.querySelector('thead tr');
        if (state.trucks.length === 0) {
            table.style.display = 'none';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        table.style.display = '';
        const filtered = state.trucks.filter(t => matchesFilter(t, 'truck'));
        const sorted = sortItems(filtered, sortState.trucks, 'truck');
        bulkSelection.trucks = new Set([...bulkSelection.trucks].filter(id => sorted.some(t => t.id === id)));
        updateBulkBar('trucks');
        const visCols = getVisibleTableCols('trucks');
        const widths = computeTableColWidths('trucks');
        if (thead) {
            let h = '<th class="col-checkbox"><input type="checkbox" id="truckSelectAll" title="Select all"></th><th class="col-validation"></th>';
            visCols.forEach(c => { h += '<th style="width:' + widths[c.key] + '%">' + c.label + '</th>'; });
            h += '<th style="width:8%"></th>';
            thead.innerHTML = h;
        }
        const selAll = thead?.querySelector('#truckSelectAll');
        if (selAll) selAll.onchange = () => toggleSelectAll('trucks', selAll);
        tbody.innerHTML = sorted.map(t => {
            let cells = '<td class="col-checkbox"><input type="checkbox" class="bulk-cb" data-id="' + t.id + '" ' + (bulkSelection.trucks.has(t.id) ? 'checked' : '') + ' onchange="Dashboard.toggleBulkSelect(\'trucks\',\'' + t.id + '\',this)"></td>';
            cells += validationIndicator(t);
            visCols.forEach(c => { cells += truckCell(t, c.key); });
            cells += '<td class="col-actions row-actions"><div class="cell"><button title="Edit" onclick="Dashboard.editTruck(\'' + t.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button title="Delete" class="btn-delete" onclick="Dashboard.deleteTruck(\'' + t.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></td>';
            return '<tr data-id="' + t.id + '" class="' + (bulkSelection.trucks.has(t.id) ? 'row-selected' : '') + ' ' + (t.doNotDispatch ? 'row-dnd' : '') + ' ' + (t.validationStatus === 'error' ? 'row-validation-error' : t.validationStatus === 'warning' ? 'row-validation-warning' : '') + '">' + cells + '</tr>';
        }).join('');
    }

    function openTruckProfile(id) {
        if (!id) return;
        openTruckDetailPanel(id);
    }

    function openTrailerProfile(id) {
        if (!id) return;
        openTrailerDetailPanel(id);
    }

    function openDriverProfile(id) {
        if (!id) return;
        openDriverDetailPanel(id);
    }

    // ── Phone formatting helpers ──────────────
    function formatPhone(raw) {
        if (!raw) return '';
        const digits = raw.replace(/\D/g, '');
        if (digits.length === 10) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
        if (digits.length === 11 && digits[0] === '1') return '+1 (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7);
        return raw;
    }

    function formatPhoneLive(input) {
        const raw = input.value.replace(/\D/g, '');
        let formatted = '';
        if (raw.length === 0) { formatted = ''; }
        else if (raw.length <= 3) { formatted = '(' + raw; }
        else if (raw.length <= 6) { formatted = '(' + raw.slice(0, 3) + ') ' + raw.slice(3); }
        else { formatted = '(' + raw.slice(0, 3) + ') ' + raw.slice(3, 6) + '-' + raw.slice(6, 10); }
        input.value = formatted;
    }

    function stripPhone(val) {
        return val.replace(/\D/g, '');
    }

    // ── Data Normalization (consistent format across all save paths) ──
    const DATE_FIELDS = ['cdlExp', 'medExp', 'mvrExp', 'drugTestDate', 'twicExp', 'hireDate', 'terminationDate', 'dob', 'annualInspDate', 'registrationExp', 'insuranceExp', 'dotInspDate', 'loadDate', 'deliveryDate'];
    function normalizePayload(data, type) {
        if (data.vin) data.vin = data.vin.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (data.cdl) data.cdl = data.cdl.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
        if (data.plateState) data.plateState = data.plateState.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
        if (data.cdlState) data.cdlState = data.cdlState.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
        if (data.plate) data.plate = data.plate.toUpperCase().trim();
        if (data.phone) data.phone = stripPhone(data.phone);
        if (data.emergencyPhone) data.emergencyPhone = stripPhone(data.emergencyPhone);
        if (data.email) data.email = data.email.toLowerCase().trim();
        DATE_FIELDS.forEach(f => { if (data[f]) data[f] = normalizeDate(data[f]); });
        return data;
    }

    async function checkDuplicate(collection, field, value, excludeId) {
        if (!value) return null;
        try {
            const snap = await col(collection).where(field, '==', value).get();
            const matches = snap.docs.filter(d => d.id !== excludeId);
            return matches.length ? matches[0] : null;
        } catch (e) { console.warn('Duplicate check failed:', e); return null; }
    }

    // ── Bulk Selection State ──
    const bulkSelection = { trucks: new Set(), trailers: new Set(), drivers: new Set(), loads: new Set(), inspections: new Set() };

    function toggleBulkSelect(collection, id, checkbox) {
        if (checkbox.checked) bulkSelection[collection].add(id);
        else bulkSelection[collection].delete(id);
        updateBulkBar(collection);
        const row = checkbox.closest('tr');
        if (row) row.classList.toggle('row-selected', checkbox.checked);
    }

    function toggleSelectAll(collection, masterCheckbox) {
        const tbodyId = { trucks: 'trucksTableBody', trailers: 'trailersTableBody', drivers: 'driversTableBody', inspections: 'inspectionsTableBody', loads: 'loadsTableBody' }[collection] || 'driversTableBody';
        const tbody = $(tbodyId);
        const checkboxes = tbody.querySelectorAll('.bulk-cb');
        checkboxes.forEach(cb => {
            cb.checked = masterCheckbox.checked;
            const id = cb.dataset.id;
            if (masterCheckbox.checked) bulkSelection[collection].add(id);
            else bulkSelection[collection].delete(id);
            const row = cb.closest('tr');
            if (row) row.classList.toggle('row-selected', masterCheckbox.checked);
        });
        updateBulkBar(collection);
    }

    function updateBulkBar(collection) {
        const count = bulkSelection[collection].size;
        const barId = { trucks: 'truckBulkBar', trailers: 'trailerBulkBar', drivers: 'driverBulkBar', inspections: 'inspectionBulkBar', loads: 'loadsBulkBar' }[collection];
        const bar = $(barId);
        if (!bar) return;
        if (count > 0) {
            bar.classList.add('visible');
            bar.querySelector('.bulk-count').textContent = count + ' selected';
        } else {
            bar.classList.remove('visible');
        }
    }

    async function bulkDelete(collection) {
        const ids = [...bulkSelection[collection]];
        if (!ids.length) return;
        const label = collection === 'trucks' ? 'truck' : collection === 'trailers' ? 'trailer' : collection === 'loads' ? 'load' : 'driver';
        if (!confirm('Delete ' + ids.length + ' ' + label + (ids.length > 1 ? 's' : '') + '? This cannot be undone.')) return;
        try {
            const batch = firebase.firestore().batch();
            ids.forEach(id => batch.delete(col(collection).doc(id)));
            await batch.commit();
            bulkSelection[collection].clear();
            if (collection === 'trucks') { await loadTrucks(); populateTruckDropdown(); }
            else if (collection === 'trailers') await loadTrailers();
            else if (collection === 'loads') await loadLoads();
            else if (collection === 'inspections') await loadInspections();
            else await loadDrivers();
            updateOverview();
            showMsg(ids.length + ' ' + label + (ids.length > 1 ? 's' : '') + ' deleted');
        } catch (err) { console.error(err); showMsg('Error deleting', true); }
    }

    async function bulkChangeStatus(collection) {
        const ids = [...bulkSelection[collection]];
        if (!ids.length) return;
        const key = collection === 'trucks' ? 'truckStatus' : collection === 'trailers' ? 'trailerStatus' : collection === 'loads' ? 'loadStatus' : 'driverStatus';
        const options = getDropdownOptions(key);
        const statusStr = options.map((o, i) => (i + 1) + '. ' + o.label).join('\n');
        const choice = prompt('Choose new status:\n' + statusStr + '\n\nEnter number:');
        if (!choice) return;
        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || idx < 0 || idx >= options.length) { showMsg('Invalid choice', true); return; }
        const newStatus = options[idx].value;
        try {
            const batch = firebase.firestore().batch();
            ids.forEach(id => batch.update(col(collection).doc(id), { status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
            await batch.commit();
            const stateArr = state[collection] || [];
            ids.forEach(id => { const item = stateArr.find(x => x.id === id); if (item) item.status = newStatus; });
            bulkSelection[collection].clear();
            if (collection === 'trucks') renderTrucks();
            else if (collection === 'trailers') renderTrailers();
            else if (collection === 'loads') renderLoads();
            else renderDrivers();
            updateOverview();
            showMsg(ids.length + ' status' + (ids.length > 1 ? 'es' : '') + ' updated to ' + options[idx].label);
        } catch (err) { console.error(err); showMsg('Error updating status', true); }
    }

    function bulkExport(collection) {
        const ids = [...bulkSelection[collection]];
        if (!ids.length) return;
        const stateArr = state[collection] || [];
        const selected = stateArr.filter(x => ids.includes(x.id));
        if (!selected.length) return;
        const exclude = ['id', 'createdAt', 'updatedAt', 'validationStatus', 'validationIssues'];
        const allKeys = [...new Set(selected.flatMap(r => Object.keys(r)))].filter(k => !exclude.includes(k));
        const header = allKeys.join(',');
        const rows = selected.map(r => allKeys.map(k => {
            let v = r[k] || '';
            if (typeof v === 'object') v = JSON.stringify(v);
            v = String(v);
            return v.includes(',') || v.includes('"') || v.includes('\n') ? '"' + v.replace(/"/g, '""') + '"' : v;
        }).join(','));
        const csv = header + '\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = collection + '_export.csv';
        a.click();
        URL.revokeObjectURL(url);
        showMsg(selected.length + ' ' + collection.slice(0, -1) + (selected.length > 1 ? 's' : '') + ' exported');
    }

    // ── Sort State ──
    const sortState = { trucks: 'unit-az', trailers: 'unit-az', drivers: 'name-az', loads: 'date-desc', inspections: 'date-new' };

    function sortItems(arr, sortKey, type) {
        const cmp = (a, b, field, dir) => {
            const va = (a[field] || '').toString().toLowerCase();
            const vb = (b[field] || '').toString().toLowerCase();
            return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        };
        const dateCmp = (a, b, field, soonestFirst) => {
            const da = a[field] || '';
            const db = b[field] || '';
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return soonestFirst ? da.localeCompare(db) : db.localeCompare(da);
        };
        const sorted = [...arr];
        switch (sortKey) {
            // Shared
            case 'unit-az': sorted.sort((a, b) => cmp(a, b, 'unit', 'asc')); break;
            case 'unit-za': sorted.sort((a, b) => cmp(a, b, 'unit', 'desc')); break;
            case 'year-new': sorted.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0)); break;
            case 'year-old': sorted.sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0)); break;
            case 'make-az': sorted.sort((a, b) => cmp(a, b, 'make', 'asc')); break;
            case 'status': sorted.sort((a, b) => cmp(a, b, 'status', 'asc')); break;
            case 'insp-exp': sorted.sort((a, b) => dateCmp(a, b, 'annualInspDate', true)); break;
            case 'reg-exp': sorted.sort((a, b) => dateCmp(a, b, 'registrationExp', true)); break;
            // Trailer
            case 'type-az': sorted.sort((a, b) => cmp(a, b, 'type', 'asc')); break;
            // Driver
            case 'name-az': sorted.sort((a, b) => { const r = cmp(a, b, 'lastName', 'asc'); return r !== 0 ? r : cmp(a, b, 'firstName', 'asc'); }); break;
            case 'name-za': sorted.sort((a, b) => { const r = cmp(a, b, 'lastName', 'desc'); return r !== 0 ? r : cmp(a, b, 'firstName', 'desc'); }); break;
            case 'hired-new': sorted.sort((a, b) => dateCmp(a, b, 'hireDate', false)); break;
            case 'cdl-exp': sorted.sort((a, b) => dateCmp(a, b, 'cdlExp', true)); break;
            case 'med-exp': sorted.sort((a, b) => dateCmp(a, b, 'medExp', true)); break;
            case 'mvr-exp': sorted.sort((a, b) => dateCmp(a, b, 'mvrExp', true)); break;
            case 'drug-test': sorted.sort((a, b) => dateCmp(a, b, 'drugTestDate', true)); break;
            case 'twic-exp': sorted.sort((a, b) => dateCmp(a, b, 'twicExp', true)); break;
            case 'truck-assigned': sorted.sort((a, b) => (a.truck ? 0 : 1) - (b.truck ? 0 : 1)); break;
            case 'unassigned': sorted.sort((a, b) => (b.truck ? 0 : 1) - (a.truck ? 0 : 1)); break;
            case 'dob-oldest': sorted.sort((a, b) => dateCmp(a, b, 'dob', true)); break;
            // Loads
            case 'date-desc': sorted.sort((a, b) => dateCmp(a, b, 'loadDate', false)); break;
            case 'date-asc': sorted.sort((a, b) => dateCmp(a, b, 'loadDate', true)); break;
            case 'load-az': sorted.sort((a, b) => cmp(a, b, 'loadNumber', 'asc')); break;
            case 'load-za': sorted.sort((a, b) => cmp(a, b, 'loadNumber', 'desc')); break;
            case 'rate-high': sorted.sort((a, b) => (parseFloat(b.rate) || 0) - (parseFloat(a.rate) || 0)); break;
            case 'rate-low': sorted.sort((a, b) => (parseFloat(a.rate) || 0) - (parseFloat(b.rate) || 0)); break;
            case 'rpm-high': sorted.sort((a, b) => { const ra = (parseFloat(a.rate)||0)/(parseFloat(a.mileage)||1); const rb = (parseFloat(b.rate)||0)/(parseFloat(b.mileage)||1); return rb - ra; }); break;
            case 'broker-az': sorted.sort((a, b) => cmp(a, b, 'broker', 'asc')); break;
            case 'del-date': sorted.sort((a, b) => dateCmp(a, b, 'deliveryDate', true)); break;
            // Inspections
            case 'date-new': sorted.sort((a, b) => dateCmp(a, b, 'date', false)); break;
            case 'date-old': sorted.sort((a, b) => dateCmp(a, b, 'date', true)); break;
            case 'driver-az': sorted.sort((a, b) => cmp(a, b, 'driverName', 'asc')); break;
            case 'truck-az': sorted.sort((a, b) => cmp(a, b, 'truckUnit', 'asc')); break;
            case 'type': sorted.sort((a, b) => cmp(a, b, 'type', 'asc')); break;
            case 'result': sorted.sort((a, b) => cmp(a, b, 'result', 'asc')); break;
        }
        return sorted;
    }

    // ── Inline Truck Assignment ──
    function truckSelectHtml(driverId, currentTruckId, isDnd) {
        const activeTrucks = state.trucks.filter(t => t.status === 'active');
        const opts = '<option value="">”</option>' + activeTrucks.map(t =>
            '<option value="' + escapeHtml(t.id) + '"' + (t.id === currentTruckId ? ' selected' : '') + '>' + escapeHtml(t.unit) + '</option>'
        ).join('');
        return '<select class="inline-truck-select" data-id="' + driverId + '" onchange="Dashboard.inlineTruckAssign(this)"' + (isDnd ? ' disabled title="DND ” cannot assign"' : '') + '>' + opts + '</select>';
    }

    async function inlineTruckAssign(select) {
        const id = select.dataset.id;
        const newTruck = select.value;
        const d = state.drivers.find(x => x.id === id);
        if (d && d.doNotDispatch) {
            showMsg('Cannot assign truck ” driver is on Do Not Dispatch', true);
            select.value = d.truck || '';
            return;
        }
        try {
            await col('drivers').doc(id).update({ truck: newTruck, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            if (d) d.truck = newTruck;
            showMsg('Truck ' + (newTruck ? 'assigned' : 'unassigned'));
        } catch (err) { console.error(err); showMsg('Error assigning truck', true); }
    }

    // ══════════════════════════════════════════════
    // ── Unified Spreadsheet Popup ────────────────
    // ══════════════════════════════════════════════

    const UNIFIED_COLS = {
        truck: [
            { key: 'unit', label: 'Unit #', type: 'text', width: '72px', placeholder: 'e.g., 101', required: true, default: true },
            { key: 'year', label: 'Year', type: 'number', width: '58px', placeholder: '2024', min: 1900, max: 2099, default: true },
            { key: 'make', label: 'Make', type: 'text', width: '96px', placeholder: 'Freightliner', default: true },
            { key: 'model', label: 'Model', type: 'text', width: '90px', placeholder: 'Cascadia', default: true },
            { key: 'vin', label: 'VIN', type: 'text', width: '160px', placeholder: '17-char VIN', maxlength: 17, default: true },
            { key: 'plate', label: 'Plate', type: 'text', width: '82px', placeholder: 'ABC 1234', default: true },
            { key: 'plateState', label: 'St', type: 'text', width: '46px', placeholder: 'TX', maxlength: 2, default: true },
            { key: 'fuel', label: 'Fuel', type: 'select', width: '80px', default: true, options: [
                { value: 'diesel', label: 'Diesel' }, { value: 'gasoline', label: 'Gasoline' },
                { value: 'cng', label: 'CNG' }, { value: 'lng', label: 'LNG' }
            ]},
            { key: 'status', label: 'Status', type: 'select', width: '92px', default: true, options: [
                { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Out of Service' },
                { value: 'maintenance', label: 'Maintenance' }, { value: 'inshop', label: 'In Shop' },
                { value: 'reserved', label: 'Reserved' }, { value: 'sold', label: 'Sold' }
            ]},
            { key: 'color', label: 'Color', type: 'text', width: '72px', placeholder: 'White', default: false },
            { key: 'annualInspDate', label: 'Insp Exp', type: 'date', width: '100px', expiry: true, default: false },
            { key: 'registrationExp', label: 'Reg Exp', type: 'date', width: '100px', expiry: true, default: false },
            { key: 'insuranceExp', label: 'Ins Exp', type: 'date', width: '100px', expiry: true, default: false }
        ],
        trailer: [
            { key: 'unit', label: 'Unit #', type: 'text', width: '80px', placeholder: 'T-201', required: true, default: true },
            { key: 'year', label: 'Year', type: 'number', width: '58px', placeholder: '2020', min: 1900, max: 2099, default: true },
            { key: 'make', label: 'Make', type: 'text', width: '96px', placeholder: 'Utility', default: true },
            { key: 'type', label: 'Type', type: 'select', width: '96px', default: true, options: [
                { value: 'dry-van', label: 'Dry Van' }, { value: 'reefer', label: 'Reefer' },
                { value: 'flatbed', label: 'Flatbed' }, { value: 'step-deck', label: 'Step Deck' },
                { value: 'tanker', label: 'Tanker' }, { value: 'lowboy', label: 'Lowboy' },
                { value: 'other', label: 'Other' }
            ]},
            { key: 'vin', label: 'VIN', type: 'text', width: '160px', placeholder: '17-char VIN', maxlength: 17, default: true },
            { key: 'plate', label: 'Plate', type: 'text', width: '86px', placeholder: 'ABC 1234', default: true },
            { key: 'status', label: 'Status', type: 'select', width: '92px', default: true, options: [
                { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Out of Service' },
                { value: 'maintenance', label: 'Maintenance' }, { value: 'inshop', label: 'In Shop' },
                { value: 'reserved', label: 'Reserved' }, { value: 'sold', label: 'Sold' }
            ]},
            { key: 'model', label: 'Model', type: 'text', width: '90px', placeholder: 'Model', default: false },
            { key: 'annualInspDate', label: 'Insp Exp', type: 'date', width: '100px', expiry: true, default: false },
            { key: 'registrationExp', label: 'Reg Exp', type: 'date', width: '100px', expiry: true, default: false },
            { key: 'insuranceExp', label: 'Ins Exp', type: 'date', width: '100px', expiry: true, default: false }
        ],
        driver: [
            { key: 'name', label: 'Name', type: 'text', width: '150px', placeholder: 'John Smith', required: true, default: true },
            { key: 'phone', label: 'Phone', type: 'text', width: '110px', placeholder: '(555) 123-4567', default: true },
            { key: 'cdl', label: 'CDL #', type: 'text', width: '110px', placeholder: 'CDL number', default: true },
            { key: 'cdlState', label: 'CDL St', type: 'text', width: '56px', placeholder: 'TX', maxlength: 2, default: true },
            { key: 'email', label: 'Email', type: 'text', width: '148px', placeholder: 'john@example.com', default: true },
            { key: 'status', label: 'Status', type: 'select', width: '96px', default: true, options: [
                { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' },
                { value: 'home-time', label: 'Home Time' }, { value: 'training', label: 'Training' },
                { value: 'pending', label: 'Pending' }, { value: 'suspended', label: 'Suspended' },
                { value: 'terminated', label: 'Terminated' }
            ]},
            { key: 'dob', label: 'DOB', type: 'date', width: '100px', default: false },
            { key: 'cdlExp', label: 'CDL Exp', type: 'date', width: '100px', expiry: true, default: false },
            { key: 'medExp', label: 'Med Exp', type: 'date', width: '100px', expiry: true, default: false },
            { key: 'mvrExp', label: 'MVR Exp', type: 'date', width: '100px', expiry: true, default: false },
            { key: 'hireDate', label: 'Hire Date', type: 'date', width: '100px', default: false },
            { key: 'truck', label: 'Truck', type: 'truck-select', width: '90px', default: false }
        ],
        inspection: [
            { key: 'date', label: 'Date', type: 'date', width: '100px', required: true, default: true },
            { key: 'type', label: 'Level', type: 'select', width: '110px', default: true, options: [
                { value: 'level-1', label: 'Level I – Full' },
                { value: 'level-2', label: 'Level II – Walk-Around' },
                { value: 'level-3', label: 'Level III – Driver' },
                { value: 'level-4', label: 'Level IV – Special' },
                { value: 'level-5', label: 'Level V – Vehicle' },
                { value: 'citation', label: 'Citation' }
            ]},
            { key: 'reportNum', label: 'Report #', type: 'text', width: '130px', placeholder: 'Report number', default: true },
            { key: 'driverName', label: 'Driver', type: 'driver-select', width: '130px', default: true },
            { key: 'truckUnit', label: 'Truck', type: 'truck-select', width: '90px', default: true },
            { key: 'result', label: 'Result', type: 'select', width: '90px', default: true, options: [
                { value: 'pass', label: 'Pass' },
                { value: 'fail', label: 'Fail' },
                { value: 'warning', label: 'Warning' },
                { value: 'oos', label: 'Out of Service' }
            ]},
            { key: 'violations', label: 'Violations', type: 'number', width: '72px', placeholder: '0', default: true },
            { key: 'location', label: 'Location', type: 'text', width: '120px', placeholder: 'City, ST', default: true },
            { key: 'fineAmount', label: 'Fine $', type: 'number', width: '72px', placeholder: '0.00', default: false },
            { key: 'notes', label: 'Notes', type: 'text', width: '160px', placeholder: 'Details...', default: false },
            { key: 'inspStatus', label: 'Status', type: 'select', width: '100px', default: false, options: [
                { value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }
            ]},
            { key: 'paidStatus', label: 'Paid', type: 'select', width: '80px', default: false, options: [
                { value: 'unpaid', label: 'Unpaid' }, { value: 'paid', label: 'Paid' }
            ]}
        ],
        load: [
            { key: 'loadNumber', label: 'Load #', type: 'text', width: '100px', placeholder: 'e.g., 176-1', required: true, default: true },
            { key: 'unit', label: 'Unit', type: 'truck-select', width: '90px', default: true },
            { key: 'origin', label: 'Origin', type: 'text', width: '130px', placeholder: 'City, ST', default: true },
            { key: 'destination', label: 'Destination', type: 'text', width: '130px', placeholder: 'City, ST', default: true },
            { key: 'broker', label: 'Broker', type: 'text', width: '120px', placeholder: 'Broker name', default: true },
            { key: 'rate', label: 'Rate', type: 'number', width: '90px', placeholder: '0.00', default: true },
            { key: 'mileage', label: 'Mileage', type: 'number', width: '80px', placeholder: '0', default: true },
            { key: 'detention', label: 'Det/Bonus', type: 'number', width: '90px', placeholder: '0.00', default: true },
            { key: 'status', label: 'Status', type: 'select', width: '100px', default: true, options: [
                { value: 'booked', label: 'Booked' }, { value: 'dispatched', label: 'Dispatched' },
                { value: 'loaded', label: 'Loaded' }, { value: 'in-transit', label: 'In Transit' },
                { value: 'delivered', label: 'Delivered' }, { value: 'invoiced', label: 'Invoiced' },
                { value: 'paid', label: 'Paid' }, { value: 'canceled', label: 'Canceled' },
                { value: 'issue', label: 'Issue' }
            ]},
            { key: 'deliveryDate', label: 'DEL Date', type: 'date', width: '110px', default: true },
            { key: 'driver', label: 'Driver', type: 'driver-select', width: '120px', default: true },
            { key: 'dispatcher', label: 'Dispatcher', type: 'dispatcher-select', width: '130px', default: true },
            { key: 'loadDate', label: 'Load Date', type: 'date', width: '110px', default: false },
            { key: 'comments', label: 'Comments', type: 'text', width: '160px', placeholder: 'Notes...', default: false }
        ]
    };

    const uSheetState = {
        open: false,
        type: null,        // 'truck' | 'trailer' | 'driver' | 'load'
        mode: null,         // 'add' | 'edit' | 'import'
        items: [],          // original items (for edit mode)
        visibleCols: {},    // { truck: Set(['unit','year',...]), trailer: Set([...]), driver: Set([...]) }
        dirty: new Set()    // row indices with unsaved changes
    };

    // Initialize visible cols with defaults or from localStorage
    Object.keys(UNIFIED_COLS).forEach(type => {
        const saved = localStorage.getItem('dash_sheet_cols_' + type);
        if (saved) {
            try { uSheetState.visibleCols[type] = new Set(JSON.parse(saved)); }
            catch { uSheetState.visibleCols[type] = new Set(UNIFIED_COLS[type].filter(c => c.default).map(c => c.key)); }
        } else {
            uSheetState.visibleCols[type] = new Set(UNIFIED_COLS[type].filter(c => c.default).map(c => c.key));
        }
    });

    // ── Table Column Configuration (display tables) ──
    const TABLE_COLS = {
        trucks: [
            { key: 'unit', label: 'Unit #', w: 9, req: true, def: true },
            { key: 'year', label: 'Year', w: 7, def: true },
            { key: 'make', label: 'Make', w: 11, def: true },
            { key: 'model', label: 'Model', w: 11, def: true },
            { key: 'vin', label: 'VIN', w: 17, def: true },
            { key: 'plate', label: 'Plate', w: 12, def: true },
            { key: 'fuel', label: 'Fuel', w: 8, def: true },
            { key: 'color', label: 'Color', w: 8, def: false },
            { key: 'annualInspDate', label: 'Insp Exp', w: 9, def: false },
            { key: 'registrationExp', label: 'Reg Exp', w: 9, def: false },
            { key: 'insuranceExp', label: 'Ins Exp', w: 9, def: false },
            { key: 'status', label: 'Status', w: 10, def: true }
        ],
        trailers: [
            { key: 'unit', label: 'Unit #', w: 11, req: true, def: true },
            { key: 'year', label: 'Year', w: 9, def: true },
            { key: 'make', label: 'Make', w: 12, def: true },
            { key: 'type', label: 'Type', w: 12, def: true },
            { key: 'model', label: 'Model', w: 10, def: false },
            { key: 'vin', label: 'VIN', w: 18, def: true },
            { key: 'plate', label: 'Plate', w: 12, def: true },
            { key: 'annualInspDate', label: 'Insp Exp', w: 9, def: false },
            { key: 'registrationExp', label: 'Reg Exp', w: 9, def: false },
            { key: 'insuranceExp', label: 'Ins Exp', w: 9, def: false },
            { key: 'status', label: 'Status', w: 10, def: true }
        ],
        drivers: [
            { key: 'name', label: 'Name', w: 14, req: true, def: true },
            { key: 'cdl', label: 'CDL #', w: 9, def: true },
            { key: 'cdlState', label: 'State', w: 5, def: true },
            { key: 'cdlExp', label: 'CDL Exp', w: 9, def: true },
            { key: 'phone', label: 'Phone', w: 10, def: true },
            { key: 'email', label: 'Email', w: 11, def: true },
            { key: 'truck', label: 'Truck', w: 12, def: true },
            { key: 'dob', label: 'DOB', w: 9, def: false },
            { key: 'medExp', label: 'Med Exp', w: 9, def: false },
            { key: 'mvrExp', label: 'MVR Exp', w: 9, def: false },
            { key: 'hireDate', label: 'Hire Date', w: 9, def: false },
            { key: 'status', label: 'Status', w: 10, def: true }
        ],
        inspections: [
            { key: 'date', label: 'Date', w: 9, req: true, def: true },
            { key: 'type', label: 'Level', w: 9, def: true },
            { key: 'reportNum', label: 'Report #', w: 10, def: true },
            { key: 'driverName', label: 'Driver', w: 11, def: true },
            { key: 'truckUnit', label: 'Truck', w: 7, def: true },
            { key: 'location', label: 'Location', w: 10, def: true },
            { key: 'result', label: 'Result', w: 7, def: true },
            { key: 'violations', label: 'Viol.', w: 6, def: true },
            { key: 'fineAmount', label: 'Fine $', w: 7, def: false },
            { key: 'notes', label: 'Notes', w: 12, def: false },
            { key: 'status', label: 'Status', w: 13, def: true }
        ]
    };

    // ── Table Column State (persisted in localStorage) ──
    const tableColState = {};
    Object.keys(TABLE_COLS).forEach(type => {
        const saved = localStorage.getItem('dash_cols_' + type);
        if (saved) {
            try { tableColState[type] = new Set(JSON.parse(saved)); }
            catch { tableColState[type] = new Set(TABLE_COLS[type].filter(c => c.def).map(c => c.key)); }
        } else {
            tableColState[type] = new Set(TABLE_COLS[type].filter(c => c.def).map(c => c.key));
        }
    });

    function saveTableCols(type) {
        localStorage.setItem('dash_cols_' + type, JSON.stringify([...tableColState[type]]));
    }

    function getVisibleTableCols(type) {
        return TABLE_COLS[type].filter(c => tableColState[type].has(c.key) || c.req);
    }

    function computeTableColWidths(type) {
        const vis = getVisibleTableCols(type);
        const totalW = vis.reduce((s, c) => s + c.w, 0);
        const fixedW = type === 'inspections' ? 21 : 13;
        const avail = 100 - fixedW;
        const widths = {};
        vis.forEach(c => { widths[c.key] = ((c.w / totalW) * avail).toFixed(1); });
        return widths;
    }

    function buildTableColPicker(type, dropdown) {
        const vis = tableColState[type];
        dropdown.innerHTML = TABLE_COLS[type].map(c => {
            const active = vis.has(c.key);
            const locked = c.req;
            return '<button type="button" class="usheet-card' + (active ? ' active' : '') + (locked ? ' locked' : '') + '" data-col="' + c.key + '" data-table-type="' + type + '"' + (locked ? ' disabled' : '') + '>' + escapeHtml(c.label) + '</button>';
        }).join('');
        dropdown.querySelectorAll('.usheet-card:not(.locked)').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTableCol(card.dataset.tableType, card.dataset.col, card);
            });
        });
    }

    function toggleTableCol(type, key, card) {
        if (tableColState[type].has(key)) {
            tableColState[type].delete(key);
            card.classList.remove('active');
        } else {
            tableColState[type].add(key);
            card.classList.add('active');
        }
        card.classList.add('usheet-card-vanish');
        setTimeout(() => card.classList.remove('usheet-card-vanish'), 250);
        saveTableCols(type);
        const tableId = { trucks: 'trucksTable', trailers: 'trailersTable', drivers: 'driversTable', inspections: 'inspectionsTable' }[type];
        const tableWrap = $(tableId)?.closest('.dash-table-wrap');
        if (tableWrap) {
            tableWrap.classList.add('col-transitioning');
            setTimeout(() => {
                const renderFn = { trucks: renderTrucks, trailers: renderTrailers, drivers: renderDrivers, inspections: renderInspections }[type];
                if (renderFn) renderFn();
                requestAnimationFrame(() => tableWrap.classList.remove('col-transitioning'));
            }, 150);
        }
    }

    function initTableColPickers() {
        document.querySelectorAll('.table-col-picker-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.dataset.tableType;
                const wrap = btn.closest('.table-col-picker-wrap');
                const dropdown = wrap.querySelector('.table-col-dropdown');
                const isOpen = !dropdown.classList.contains('hidden');
                document.querySelectorAll('.table-col-dropdown').forEach(d => d.classList.add('hidden'));
                if (!isOpen) {
                    buildTableColPicker(type, dropdown);
                    dropdown.classList.remove('hidden');
                }
            });
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.table-col-picker-wrap')) {
                document.querySelectorAll('.table-col-dropdown').forEach(d => d.classList.add('hidden'));
            }
        });
    }

    // ── Table Cell Renderers ──
    function truckCell(t, key) {
        switch(key) {
            case 'unit': return '<td class="col-unit"><div class="cell cell-primary" title="Open truck profile for ' + escapeHtml(t.unit || t.id) + '"><strong>' + escapeHtml(t.unit || t.id) + '</strong>' + (t.doNotDispatch ? '<span class="dnd-tag">DND</span>' : '') + '</div></td>';
            case 'year': return '<td class="col-year"><div class="cell">' + escapeHtml(t.year) + '</div></td>';
            case 'make': return '<td class="col-make"><div class="cell">' + escapeHtml(t.make) + '</div></td>';
            case 'model': return '<td class="col-model"><div class="cell">' + escapeHtml(t.model) + '</div></td>';
            case 'vin': return '<td class="col-vin"><div class="cell vin-cell" title="' + escapeHtml(t.vin) + '">' + escapeHtml(t.vin) + '</div></td>';
            case 'plate': return '<td class="col-plate"><div class="cell">' + escapeHtml(t.plate) + (t.plateState ? ' <span class="text-muted">(' + escapeHtml(t.plateState) + ')</span>' : '') + '</div></td>';
            case 'fuel': return '<td class="col-fuel"><div class="cell">' + fuelLabel(t.fuel) + '</div></td>';
            case 'color': return '<td class="col-color"><div class="cell">' + escapeHtml(t.color || '') + '</div></td>';
            case 'annualInspDate': return '<td><div class="cell">' + escapeHtml(t.annualInspDate || '\u2014') + '</div></td>';
            case 'registrationExp': return '<td><div class="cell">' + escapeHtml(t.registrationExp || '\u2014') + '</div></td>';
            case 'insuranceExp': return '<td><div class="cell">' + escapeHtml(t.insuranceExp || '\u2014') + '</div></td>';
            case 'status': return '<td class="col-status"><div class="cell">' + statusSelect(t.status, t.id, 'trucks', 'truck') + '</div></td>';
            default: return '<td><div class="cell">' + escapeHtml(t[key] || '') + '</div></td>';
        }
    }

    function trailerCell(t, key) {
        switch(key) {
            case 'unit': return '<td><div class="cell cell-primary" title="Open trailer profile for ' + escapeHtml(t.unit || t.id) + '"><strong>' + escapeHtml(t.unit || t.id) + '</strong>' + (t.doNotDispatch ? '<span class="dnd-tag">DND</span>' : '') + '</div></td>';
            case 'year': return '<td><div class="cell">' + escapeHtml(t.year) + '</div></td>';
            case 'make': return '<td><div class="cell">' + escapeHtml(t.make) + '</div></td>';
            case 'type': return '<td><div class="cell">' + trailerTypeLabel(t.type) + '</div></td>';
            case 'model': return '<td><div class="cell">' + escapeHtml(t.model || '') + '</div></td>';
            case 'vin': return '<td><div class="cell vin-cell">' + escapeHtml(t.vin) + '</div></td>';
            case 'plate': return '<td><div class="cell">' + escapeHtml(t.plate) + '</div></td>';
            case 'annualInspDate': return '<td><div class="cell">' + escapeHtml(t.annualInspDate || '\u2014') + '</div></td>';
            case 'registrationExp': return '<td><div class="cell">' + escapeHtml(t.registrationExp || '\u2014') + '</div></td>';
            case 'insuranceExp': return '<td><div class="cell">' + escapeHtml(t.insuranceExp || '\u2014') + '</div></td>';
            case 'status': return '<td><div class="cell">' + statusSelect(t.status, t.id, 'trailers', 'trailer') + '</div></td>';
            default: return '<td><div class="cell">' + escapeHtml(t[key] || '') + '</div></td>';
        }
    }

    function driverCell(d, key) {
        switch(key) {
            case 'name': return '<td><div class="cell cell-primary" title="Open driver profile for ' + escapeHtml(d.firstName) + ' ' + escapeHtml(d.lastName) + '"><strong>' + escapeHtml(d.firstName) + ' ' + escapeHtml(d.lastName) + '</strong>' + (d.doNotDispatch ? '<span class="dnd-tag">DND</span>' : '') + '</div></td>';
            case 'cdl': return '<td><div class="cell">' + escapeHtml(d.cdl) + '</div></td>';
            case 'cdlState': return '<td><div class="cell">' + escapeHtml(d.cdlState) + '</div></td>';
            case 'cdlExp': return '<td><div class="cell">' + escapeHtml(d.cdlExp) + '</div></td>';
            case 'phone': return '<td><div class="cell">' + escapeHtml(d.phone ? formatPhone(d.phone) : '') + '</div></td>';
            case 'email': return '<td><div class="cell">' + escapeHtml(d.email) + '</div></td>';
            case 'truck': return '<td><div class="cell">' + truckSelectHtml(d.id, d.truck, d.doNotDispatch) + '</div></td>';
            case 'dob': return '<td><div class="cell">' + escapeHtml(d.dob || '\u2014') + '</div></td>';
            case 'medExp': return '<td><div class="cell">' + escapeHtml(d.medExp || '\u2014') + '</div></td>';
            case 'mvrExp': return '<td><div class="cell">' + escapeHtml(d.mvrExp || '\u2014') + '</div></td>';
            case 'hireDate': return '<td><div class="cell">' + escapeHtml(d.hireDate || '\u2014') + '</div></td>';
            case 'status': return '<td><div class="cell">' + statusSelect(d.status, d.id, 'drivers', 'driver') + '</div></td>';
            default: return '<td><div class="cell">' + escapeHtml(d[key] || '') + '</div></td>';
        }
    }

    function inspResultBadge(r) {
        const cls = r === 'pass' ? 'badge-green' : r === 'fail' || r === 'oos' ? 'badge-red' : r === 'warning' ? 'badge-yellow' : 'badge-gray';
        const label = r === 'oos' ? 'OOS' : r ? r.charAt(0).toUpperCase() + r.slice(1) : '\u2014';
        return '<span class="insp-badge ' + cls + '">' + escapeHtml(label) + '</span>';
    }

    function inspTypeFmt(t) {
        const map = {'level-1':'Level I','level-2':'Level II','level-3':'Level III','level-4':'Level IV','level-5':'Level V','citation':'Citation'};
        return map[t] || t || '\u2014';
    }

    function inspectionCell(d, key) {
        switch(key) {
            case 'date': return '<td><div class="cell">' + escapeHtml(d.date || '\u2014') + '</div></td>';
            case 'type': return '<td><div class="cell">' + escapeHtml(inspTypeFmt(d.type)) + '</div></td>';
            case 'reportNum': return '<td><div class="cell">' + escapeHtml(d.reportNum || '\u2014') + '</div></td>';
            case 'driverName': return '<td><div class="cell">' + escapeHtml(d.driverName || '\u2014') + '</div></td>';
            case 'truckUnit': return '<td><div class="cell">' + escapeHtml(d.truckUnit || '\u2014') + '</div></td>';
            case 'location': return '<td><div class="cell">' + escapeHtml(d.location || '\u2014') + '</div></td>';
            case 'result': return '<td><div class="cell">' + inspResultBadge(d.result) + '</div></td>';
            case 'violations': return '<td><div class="cell">' + (d.violations != null ? escapeHtml(String(d.violations)) : '0') + '</div></td>';
            case 'fineAmount': return '<td><div class="cell">' + (d.fineAmount ? '$' + parseFloat(d.fineAmount).toFixed(2) : '\u2014') + '</div></td>';
            case 'notes': return '<td><div class="cell">' + escapeHtml(d.notes || '\u2014') + '</div></td>';
            case 'status': {
                const resolved = d.inspStatus === 'resolved';
                const paid = d.paidStatus === 'paid';
                const statusBadge = resolved ? '<span class="insp-badge badge-green">Resolved</span>' : '<span class="insp-badge badge-red">Open</span>';
                const paidBadge = (d.fineAmount && parseFloat(d.fineAmount) > 0) ? (paid ? '<span class="insp-badge badge-green">Paid</span>' : '<span class="insp-badge badge-yellow">Unpaid</span>') : '';
                return '<td><div class="cell">' + statusBadge + ' ' + paidBadge + '</div></td>';
            }
            default: return '<td><div class="cell">' + escapeHtml(d[key] || '') + '</div></td>';
        }
    }

    function uGetVisibleCols(type) {
        return UNIFIED_COLS[type].filter(c => uSheetState.visibleCols[type].has(c.key));
    }

    function openUnifiedSheet(type, items, options) {
        const mode = options?.mode || 'add';
        uSheetState.open = true;
        uSheetState.type = type;
        uSheetState.mode = mode;
        uSheetState.items = items || [];
        uSheetState.dirty = new Set();

        // Title
        const titleMap = { truck: 'Trucks', trailer: 'Trailers', driver: 'Drivers', inspection: 'Inspections', load: 'Loads' };
        const titleEl = $('usheetTitle');
        if (mode === 'add') titleEl.textContent = 'Add ' + titleMap[type];
        else if (mode === 'import') titleEl.textContent = 'Import ' + titleMap[type];
        else titleEl.textContent = 'Edit ' + titleMap[type] + (items.length > 1 ? ' (' + items.length + ')' : '');

        uBuildColPicker(type);
        uBuildTable(type, items, mode);
        uUpdateFooter();

        // Show import button only in add mode
        const importBtn = $('usheetImportFile');
        if (importBtn) importBtn.style.display = mode === 'add' ? '' : 'none';

        $('unifiedSheetModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        // Focus first input after render
        setTimeout(() => {
            const first = $('usheetTbody').querySelector('input, select');
            if (first) first.focus();
        }, 60);
    }

    function uBuildColPicker(type) {
        const dropdown = $('usheetColDropdown');
        const cols = UNIFIED_COLS[type];
        const vis = uSheetState.visibleCols[type];
        dropdown.innerHTML = cols.map(c => {
            const active = vis.has(c.key);
            const locked = c.required;
            return `<button type="button" class="usheet-card${active ? ' active' : ''}${locked ? ' locked' : ''}" data-col="${c.key}"${locked ? ' disabled' : ''}>${escapeHtml(c.label)}</button>`;
        }).join('');
    }

    function uToggleCol(type, key, show) {
        if (show) uSheetState.visibleCols[type].add(key);
        else uSheetState.visibleCols[type].delete(key);
        localStorage.setItem('dash_sheet_cols_' + type, JSON.stringify([...uSheetState.visibleCols[type]]));
        uBuildTable(type, null, uSheetState.mode);
    }

    function uBuildTable(type, items, mode) {
        const visCols = uGetVisibleCols(type);
        const thead = $('usheetThead');
        const tbody = $('usheetTbody');

        // Build header
        thead.innerHTML = '<th class="usheet-num-col">#</th>' +
            visCols.map(c => `<th style="min-width:${c.width}">${escapeHtml(c.label)}</th>`).join('') +
            '<th class="usheet-action-col"></th>';

        // Build rows ” reuse existing tbody data if no new items
        if (items !== null || mode === 'add') {
            tbody.innerHTML = '';
            const rows = (items && items.length) ? items : [{}];
            rows.forEach((item, i) => {
                tbody.appendChild(uBuildRow(i, item, visCols, mode));
            });
            // Always add one empty row at the end for add/import modes
            if (mode !== 'edit') {
                tbody.appendChild(uBuildRow(rows.length === 1 && !Object.keys(rows[0]).length ? 0 : rows.length, {}, visCols, mode));
                if (rows.length === 1 && !Object.keys(rows[0]).length) tbody.removeChild(tbody.firstChild);
            }
        } else {
            // Rebuild from existing row data
            const existingData = uCollectAllRowData();
            tbody.innerHTML = '';
            existingData.forEach((item, i) => {
                tbody.appendChild(uBuildRow(i, item, visCols, mode));
            });
            if (mode !== 'edit' && existingData.length === 0) {
                tbody.appendChild(uBuildRow(0, {}, visCols, mode));
            }
        }
        uUpdateRowCount();
    }

    function uBuildRow(index, data, visCols, mode) {
        const tr = document.createElement('tr');
        tr.className = 'usheet-row';
        if (data && data.id) tr.dataset.id = data.id;
        // For drivers in edit mode, combine firstName + lastName into name
        if (uSheetState.type === 'driver' && data && data.firstName) {
            data.name = ((data.firstName || '') + ' ' + (data.lastName || '')).trim();
        }

        let html = `<td class="usheet-num">${index + 1}</td>`;
        visCols.forEach(c => {
            let val = data ? (data[c.key] || '') : '';
            if (c.type === 'select') {
                const opts = c.options.map(o =>
                    `<option value="${escapeHtml(o.value)}"${o.value === val ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
                ).join('');
                const placeholder = c.placeholder || 'Select';
                html += `<td class="usheet-cell" data-key="${c.key}"><select data-key="${c.key}"${!val ? ' class="usheet-empty"' : ''}><option value="" disabled${!val ? ' selected' : ''}>${placeholder}</option>${opts}</select></td>`;
            } else if (c.type === 'truck-select') {
                const opts = state.trucks.map(t =>
                    `<option value="${escapeHtml(t.unit)}"${t.unit === val ? ' selected' : ''}>${escapeHtml(t.unit)}</option>`
                ).join('');
                html += `<td class="usheet-cell" data-key="${c.key}"><select data-key="${c.key}"${!val ? ' class="usheet-empty"' : ''}><option value="" disabled${!val ? ' selected' : ''}>Truck</option>${opts}</select></td>`;
            } else if (c.type === 'driver-select') {
                const opts = state.drivers.map(d =>
                    `<option value="${escapeHtml(d.firstName + ' ' + d.lastName)}"${(d.firstName + ' ' + d.lastName) === val ? ' selected' : ''}>${escapeHtml(d.firstName + ' ' + d.lastName)}</option>`
                ).join('');
                html += `<td class="usheet-cell" data-key="${c.key}"><select data-key="${c.key}"${!val ? ' class="usheet-empty"' : ''}><option value="" disabled${!val ? ' selected' : ''}>Driver</option>${opts}</select></td>`;
            } else if (c.type === 'dispatcher-select') {
                const dispatchers = (state.companyDashboard && state.companyDashboard.users || []).filter(u => u.role === 'Dispatcher');
                const opts = dispatchers.map(u =>
                    `<option value="${escapeHtml(u.name)}"${u.name === val ? ' selected' : ''}>${escapeHtml(u.name)}</option>`
                ).join('');
                html += `<td class="usheet-cell" data-key="${c.key}"><select data-key="${c.key}"${!val ? ' class="usheet-empty"' : ''}><option value="" disabled${!val ? ' selected' : ''}>Dispatcher</option>${opts}</select></td>`;
            } else if (c.type === 'date') {
                html += `<td class="usheet-cell" data-key="${c.key}"><input type="date" data-key="${c.key}" value="${escapeHtml(val)}"${!val ? ' class="usheet-empty"' : ''}></td>`;
            } else {
                html += `<td class="usheet-cell" data-key="${c.key}"><input type="${c.type === 'number' ? 'number' : 'text'}" data-key="${c.key}" value="${escapeHtml(val)}" placeholder="${c.placeholder || ''}"${c.maxlength ? ' maxlength="' + c.maxlength + '"' : ''}></td>`;
            }
        });
        // Actions: per-row save + delete
        html += `<td class="usheet-actions">
            <button class="usheet-row-save" title="Save this row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></button>
            <button class="usheet-row-delete" title="Remove row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></button>
        </td>`;
        tr.innerHTML = html;

        // Store extra fields from import as data attributes
        if (data && uSheetState.type) {
            const cfg = SHEET_CONFIGS[uSheetState.type];
            if (cfg && cfg.extraFields) {
                cfg.extraFields.forEach(key => {
                    if (data[key]) tr.dataset['extra_' + key] = data[key];
                });
            }
        }
        return tr;
    }

    function uCollectAllRowData() {
        const rows = [];
        const tbody = $('usheetTbody');
        if (!tbody) return rows;
        Array.from(tbody.children).forEach(tr => {
            const data = {};
            if (tr.dataset.id) data.id = tr.dataset.id;
            tr.querySelectorAll('input[data-key], select[data-key]').forEach(el => {
                data[el.dataset.key] = el.value;
            });
            // Carry over extra fields
            Object.keys(tr.dataset).forEach(k => {
                if (k.startsWith('extra_')) data[k.replace('extra_', '')] = tr.dataset[k];
            });
            rows.push(data);
        });
        return rows;
    }

    function uCollectRowData(tr) {
        const data = {};
        if (tr.dataset.id) data.id = tr.dataset.id;
        tr.querySelectorAll('input[data-key], select[data-key]').forEach(el => {
            data[el.dataset.key] = el.value.trim();
        });
        // Carry over extra fields stored as data attributes
        Object.keys(tr.dataset).forEach(k => {
            if (k.startsWith('extra_') && !data[k.replace('extra_', '')]) {
                data[k.replace('extra_', '')] = tr.dataset[k];
            }
        });
        return data;
    }

    async function uSaveRow(tr) {
        const type = uSheetState.type;
        const mode = uSheetState.mode;
        const data = uCollectRowData(tr);
        const cfg = SHEET_CONFIGS[type];
        const reqKey = cfg.requiredKey;

        // For drivers, name is the required key
        if (type === 'driver' && !data.name) { showMsg('Name is required', true); return; }
        if (type !== 'driver' && !data[reqKey]) { showMsg(cfg.cols[0].placeholder ? reqKey + ' is required' : 'Required field missing', true); return; }

        // Prepare payload
        const payload = { ...data };
        delete payload.id;

        // Driver name splitting
        if (type === 'driver' && payload.name) {
            const parts = payload.name.trim().split(/\s+/);
            payload.firstName = parts[0] || '';
            payload.lastName = parts.slice(1).join(' ') || '';
            delete payload.name;
        }
        // Normalization
        if (payload.plateState) payload.plateState = payload.plateState.toUpperCase();
        if (payload.cdlState) payload.cdlState = payload.cdlState.toUpperCase();
        // Load-specific normalization
        if (type === 'load') {
            if (payload.rate) payload.rate = parseFloat(payload.rate) || 0;
            if (payload.mileage) payload.mileage = parseFloat(payload.mileage) || 0;
            if (payload.detention) payload.detention = parseFloat(payload.detention) || 0;
            if (!payload.loadDate) payload.loadDate = new Date().toISOString().split('T')[0];
        }
        normalizePayload(payload, type);
        payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

        try {
            const existingId = tr.dataset.id;
            if (mode === 'edit' && existingId) {
                await col(cfg.collection).doc(existingId).update(payload);
            } else {
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                if (cfg.defaults) {
                    Object.entries(cfg.defaults).forEach(([k, v]) => { if (!payload[k]) payload[k] = v; });
                }
                const docRef = await col(cfg.collection).add(payload);
                tr.dataset.id = docRef.id; // Track new ID
            }
            // Flash green
            tr.classList.add('usheet-saved');
            setTimeout(() => tr.classList.remove('usheet-saved'), 1200);
            uSheetState.dirty.delete(Array.from($('usheetTbody').children).indexOf(tr));
            uUpdateFooter();
        } catch (err) {
            console.error('Row save error:', err);
            showMsg('Error saving row', true);
        }
    }

    async function uSaveAll() {
        const type = uSheetState.type;
        const mode = uSheetState.mode;
        const cfg = SHEET_CONFIGS[type];
        const tbody = $('usheetTbody');
        const rows = Array.from(tbody.children);
        const btn = $('usheetSaveAll');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

        try {
            const batch = firebase.firestore().batch();
            let count = 0;
            const savedRows = [];

            for (const tr of rows) {
                const data = uCollectRowData(tr);
                const reqKey = type === 'driver' ? 'name' : cfg.requiredKey;
                if (!data[reqKey]) continue;

                const payload = { ...data };
                delete payload.id;

                if (type === 'driver' && payload.name) {
                    const parts = payload.name.trim().split(/\s+/);
                    payload.firstName = parts[0] || '';
                    payload.lastName = parts.slice(1).join(' ') || '';
                    delete payload.name;
                }
                if (payload.plateState) payload.plateState = payload.plateState.toUpperCase();
                if (payload.cdlState) payload.cdlState = payload.cdlState.toUpperCase();
                normalizePayload(payload, type);
                payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

                const existingId = tr.dataset.id;
                if (mode === 'edit' && existingId) {
                    batch.update(col(cfg.collection).doc(existingId), payload);
                } else {
                    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    if (cfg.defaults) {
                        Object.entries(cfg.defaults).forEach(([k, v]) => { if (!payload[k]) payload[k] = v; });
                    }
                    batch.set(col(cfg.collection).doc(), payload);
                }
                savedRows.push(tr);
                count++;
            }

            if (count === 0) {
                showMsg('No rows to save', true);
                return;
            }

            await batch.commit();
            savedRows.forEach(tr => {
                tr.classList.add('usheet-saved');
                setTimeout(() => tr.classList.remove('usheet-saved'), 1200);
            });
            uSheetState.dirty.clear();
            uUpdateFooter();
            showMsg(count + ' ' + cfg.label + (count > 1 ? 's' : '') + ' saved');

            // Reload the collection
            if (cfg.afterSave) await cfg.afterSave();
            updateOverview();

            // Close modal after save-all
            uCloseAfterSave();
        } catch (err) {
            console.error('Save all error:', err);
            showMsg('Error saving: ' + (err.message || ''), true);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save All'; }
        }
    }

    function uAddRow() {
        const tbody = $('usheetTbody');
        const visCols = uGetVisibleCols(uSheetState.type);
        const idx = tbody.children.length;
        const tr = uBuildRow(idx, {}, visCols, uSheetState.mode);
        tbody.appendChild(tr);
        uUpdateRowCount();
        const firstInput = tr.querySelector('input, select');
        if (firstInput) firstInput.focus();
    }

    function uDeleteRow(tr) {
        const tbody = $('usheetTbody');
        if (tbody.children.length <= 1) {
            // Clear the row instead of deleting
            tr.querySelectorAll('input').forEach(i => { i.value = ''; });
            tr.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; });
            return;
        }
        tr.remove();
        // Re-number rows
        Array.from(tbody.children).forEach((r, i) => {
            const num = r.querySelector('.usheet-num');
            if (num) num.textContent = i + 1;
        });
        uUpdateRowCount();
    }

    function uUpdateRowCount() {
        const tbody = $('usheetTbody');
        const count = tbody ? tbody.children.length : 0;
        const el = $('usheetRowCount');
        if (el) el.textContent = count + ' row' + (count !== 1 ? 's' : '');
    }

    function uUpdateFooter() {
        const dirtyCount = uSheetState.dirty.size;
        const el = $('usheetDirtyCount');
        if (el) el.textContent = dirtyCount > 0 ? dirtyCount + ' unsaved' : '';
    }

    function uMarkDirty(tr) {
        const tbody = $('usheetTbody');
        const idx = Array.from(tbody.children).indexOf(tr);
        if (idx >= 0) {
            uSheetState.dirty.add(idx);
            tr.classList.add('usheet-dirty');
            uUpdateFooter();
        }
    }

    function uCloseSheet() {
        const modal = $('unifiedSheetModal');
        if (uSheetState.dirty.size > 0) {
            if (!confirm('You have unsaved changes. Discard?')) return;
        }
        modal.classList.add('hidden');
        $('usheetColDropdown').classList.add('hidden');
        document.body.style.overflow = '';
        uSheetState.open = false;
        uSheetState.dirty.clear();
    }

    function uCloseAfterSave() {
        $('unifiedSheetModal').classList.add('hidden');
        $('usheetColDropdown').classList.add('hidden');
        document.body.style.overflow = '';
        uSheetState.open = false;
        uSheetState.dirty.clear();
    }

    function initUnifiedSheet() {
        const modal = $('unifiedSheetModal');
        if (!modal) return;
        const tbody = $('usheetTbody');

        // Close / Cancel
        $('usheetClose').addEventListener('click', uCloseSheet);
        $('usheetCancel').addEventListener('click', uCloseSheet);

        // Backdrop click
        modal.addEventListener('mousedown', (e) => {
            if (e.target === modal) uCloseSheet();
        });

        // Add Row
        $('usheetAddRow').addEventListener('click', uAddRow);

        // Save All
        $('usheetSaveAll').addEventListener('click', uSaveAll);

        // Import from file (inside unified sheet)
        const usheetImport = $('usheetImportFile');
        if (usheetImport) {
            usheetImport.addEventListener('click', () => {
                const type = uSheetState.type;
                const smartFn = { truck: smartImportTrucks, trailer: smartImportTrailers, driver: smartImportDrivers, inspection: smartImportInspections }[type];
                if (!smartFn) return;
                showImportDropdown(usheetImport, smartFn);
            });
        }

        // Column picker toggle
        const colPickerBtn = $('usheetColPicker');
        const colDropdown = $('usheetColDropdown');
        // Move dropdown to body so it's not clipped by modal overflow
        document.body.appendChild(colDropdown);

        colPickerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasHidden = colDropdown.classList.contains('hidden');
            colDropdown.classList.toggle('hidden');
            if (wasHidden) {
                const rect = colPickerBtn.getBoundingClientRect();
                colDropdown.style.top = (rect.bottom + 4) + 'px';
                // Right-align: position so right edge aligns with button right edge
                colDropdown.style.left = '';
                colDropdown.style.right = '';
                // First place it, then adjust after measuring
                colDropdown.style.top = (rect.bottom + 4) + 'px';
                colDropdown.style.left = rect.left + 'px';
                // After reflow, right-align
                requestAnimationFrame(() => {
                    const ddW = colDropdown.offsetWidth;
                    const left = Math.max(8, rect.right - ddW);
                    colDropdown.style.left = left + 'px';
                });
            }
        });

        // Column picker change — card click
        colDropdown.addEventListener('click', (e) => {
            const card = e.target.closest('.usheet-card');
            if (!card || card.disabled) return;
            const key = card.dataset.col;
            const isActive = card.classList.contains('active');

            // Vanish animation
            card.classList.add('usheet-card-vanish');
            card.addEventListener('animationend', function handler() {
                card.removeEventListener('animationend', handler);
                card.classList.remove('usheet-card-vanish');
                card.classList.toggle('active');
                uToggleCol(uSheetState.type, key, !isActive);
            }, { once: true });
        });

        // Close column picker on outside click
        document.addEventListener('click', (e) => {
            if (!colDropdown.classList.contains('hidden') && !colDropdown.contains(e.target) && !colPickerBtn.contains(e.target)) {
                colDropdown.classList.add('hidden');
            }
        });

        // Tbody click delegation: row save + row delete
        tbody.addEventListener('click', (e) => {
            const saveBtn = e.target.closest('.usheet-row-save');
            if (saveBtn) {
                const tr = saveBtn.closest('tr');
                if (tr) uSaveRow(tr);
                return;
            }
            const deleteBtn = e.target.closest('.usheet-row-delete');
            if (deleteBtn) {
                const tr = deleteBtn.closest('tr');
                if (tr) uDeleteRow(tr);
                return;
            }
        });

        // Mark dirty on input
        tbody.addEventListener('input', (e) => {
            const tr = e.target.closest('tr');
            if (tr) uMarkDirty(tr);

            // Auto-add row when typing in last row (add/import mode)
            if (uSheetState.mode !== 'edit' && tr === tbody.lastElementChild) {
                const cfg = SHEET_CONFIGS[uSheetState.type];
                const reqKey = cfg && cfg.requiredKey;
                const reqInput = reqKey ? tr.querySelector('[data-key="' + reqKey + '"]') : null;
                const hasRequired = reqInput ? reqInput.value.trim() : Array.from(tr.querySelectorAll('input')).some(i => i.value.trim());
                if (hasRequired) uAddRow();
            }

            // Live VIN decode
            if ((uSheetState.type === 'truck' || uSheetState.type === 'trailer') && e.target.dataset.key === 'vin') {
                const val = e.target.value.trim();
                if (val.length === 17 && !tr.dataset.vinDecoded) {
                    tr.dataset.vinDecoded = val;
                    uTriggerVinDecode(tr, val);
                } else if (val.length < 17) {
                    delete tr.dataset.vinDecoded;
                }
            }
        });

        // Change on selects
        tbody.addEventListener('change', (e) => {
            const tr = e.target.closest('tr');
            if (tr) uMarkDirty(tr);
            // Remove empty placeholder styling when value selected
            if (e.target.tagName === 'SELECT' || e.target.type === 'date') {
                e.target.classList.toggle('usheet-empty', !e.target.value);
            }
        });

        // Zip → City resolve + auto-mileage for load rows
        tbody.addEventListener('focusout', async (e) => {
            if (uSheetState.type !== 'load') return;
            const key = e.target.dataset && e.target.dataset.key;
            if (key !== 'origin' && key !== 'destination') return;
            const val = e.target.value.trim();
            if (/^\d{5}$/.test(val)) {
                const resolved = await resolveZipToCity(val);
                if (resolved) {
                    e.target.value = resolved;
                    const tr = e.target.closest('tr');
                    if (tr) uMarkDirty(tr);
                }
            }
            // Auto-calc mileage
            const tr = e.target.closest('tr');
            if (!tr || !isGMaps()) return;
            const originInput = tr.querySelector('[data-key="origin"]');
            const destInput = tr.querySelector('[data-key="destination"]');
            const mileInput = tr.querySelector('[data-key="mileage"]');
            if (!originInput || !destInput || !mileInput) return;
            const o = originInput.value.trim();
            const d = destInput.value.trim();
            if (!o || !d) return;
            new google.maps.DirectionsService().route({
                origin: o, destination: d, travelMode: google.maps.TravelMode.DRIVING
            }, (result, status) => {
                if (status === 'OK' && result.routes[0]) {
                    const miles = Math.round(result.routes[0].legs[0].distance.value * 0.000621371);
                    mileInput.value = miles;
                    uMarkDirty(tr);
                }
            });
        });

        // Keyboard: Tab/Enter/Escape navigation
        tbody.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const inputs = Array.from(tbody.querySelectorAll('input, select'));
                const idx = inputs.indexOf(e.target);
                const next = e.shiftKey ? idx - 1 : idx + 1;
                if (next >= 0 && next < inputs.length) inputs[next].focus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                // Move to same column next row
                const cell = e.target.closest('td');
                const tr = cell?.closest('tr');
                if (!tr) return;
                const cellIdx = Array.from(tr.children).indexOf(cell);
                const nextRow = tr.nextElementSibling;
                if (nextRow) {
                    const nextCell = nextRow.children[cellIdx];
                    const nextInput = nextCell?.querySelector('input, select');
                    if (nextInput) nextInput.focus();
                }
            } else if (e.key === 'Escape') {
                e.target.blur();
            }
        });

        // Paste from Excel
        tbody.addEventListener('paste', (e) => {
            const clipText = (e.clipboardData || window.clipboardData).getData('text');
            if (!clipText) return;
            const pasteRows = clipText.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
            if (pasteRows.length <= 1 && pasteRows[0].indexOf('\t') === -1) return;
            e.preventDefault();

            const visCols = uGetVisibleCols(uSheetState.type);
            const activeCell = e.target.closest('td.usheet-cell');
            const activeTr = activeCell?.closest('tr');
            let startRow = 0, startCol = 0;
            if (activeTr) {
                startRow = Array.from(tbody.children).indexOf(activeTr);
                startCol = Array.from(activeTr.querySelectorAll('.usheet-cell')).indexOf(activeCell);
            }

            pasteRows.forEach((line, ri) => {
                const vals = line.split('\t');
                const rowIdx = startRow + ri;
                while (tbody.children.length <= rowIdx) {
                    uAddRow();
                }
                const tr = tbody.children[rowIdx];
                const cells = tr.querySelectorAll('.usheet-cell');
                vals.forEach((raw, ci) => {
                    const colIdx = startCol + ci;
                    if (colIdx >= cells.length) return;
                    const cell = cells[colIdx];
                    const input = cell.querySelector('input');
                    const select = cell.querySelector('select');
                    const val = raw.trim();
                    if (select && visCols[colIdx]?.type === 'select') {
                        const match = visCols[colIdx].options.find(o =>
                            o.value.toLowerCase() === val.toLowerCase() || o.label.toLowerCase() === val.toLowerCase()
                        );
                        if (match) select.value = match.value;
                    } else if (input) {
                        input.value = val;
                    }
                });
                uMarkDirty(tr);
            });
            uUpdateRowCount();
            showMsg(pasteRows.length + ' row' + (pasteRows.length > 1 ? 's' : '') + ' pasted');
        });
    }

    async function uTriggerVinDecode(tr, vin) {
        try {
            const resp = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/' + vin + '?format=json');
            const json = await resp.json();
            const results = json.Results || [];
            const get = (id) => { const r = results.find(v => v.VariableId === id); return (r && r.Value && r.Value !== 'Not Applicable') ? r.Value.trim() : ''; };
            const year = get(29);
            const make = get(26);
            const model = get(28);
            const fillField = (key, val) => {
                if (!val) return;
                const input = tr.querySelector('[data-key="' + key + '"]');
                if (input && !input.value) input.value = val;
            };
            fillField('year', year);
            fillField('make', make);
            fillField('model', model);
            uMarkDirty(tr);
        } catch (e) { /* silently fail */ }
    }

    // Bulk edit entry point
    function bulkEdit(collection) {
        const ids = [...bulkSelection[collection]];
        if (!ids.length) return;
        const type = collection === 'trucks' ? 'truck' : collection === 'trailers' ? 'trailer' : collection === 'inspections' ? 'inspection' : collection === 'loads' ? 'load' : 'driver';
        const stateArr = state[collection];
        const items = stateArr.filter(x => ids.includes(x.id));
        openUnifiedSheet(type, items, { mode: 'edit' });
    }

    // ── Spreadsheet Edit Mode ──────────────────────
    const spreadsheetMode = { loads: false };
    const spreadsheetDirty = { loads: new Map() };

    const SPREADSHEET_COLS = {
        loads: [
            { key: 'loadDate', label: 'Date', type: 'date', width: '110px' },
            { key: 'loadNumber', label: 'Load #', type: 'text', width: '100px' },
            { key: 'unit', label: 'Unit', type: 'truck-select', width: '90px' },
            { key: 'origin', label: 'Origin', type: 'text', width: '150px' },
            { key: 'destination', label: 'Destination', type: 'text', width: '150px' },
            { key: 'broker', label: 'Broker', type: 'text', width: '130px' },
            { key: 'rate', label: 'Rate', type: 'number', width: '90px' },
            { key: 'mileage', label: 'Miles', type: 'number', width: '80px' },
            { key: 'detention', label: 'Det/Bonus', type: 'number', width: '90px' },
            { key: 'status', label: 'Status', type: 'select', optionsKey: 'loadStatus', width: '110px' },
            { key: 'deliveryDate', label: 'Del Date', type: 'date', width: '110px' },
            { key: 'driver', label: 'Driver', type: 'text', width: '120px' },
            { key: 'dispatcher', label: 'Dispatcher', type: 'text', width: '110px' },
            { key: 'comments', label: 'Comments', type: 'text', width: '160px' }
        ]
    };

    function toggleSpreadsheet(collection) {
        spreadsheetMode[collection] = !spreadsheetMode[collection];
        spreadsheetDirty[collection].clear();
        const section = $('section-' + collection);
        if (section) section.classList.toggle('spreadsheet-active', spreadsheetMode[collection]);
        const btn = $(collection + 'SpreadsheetBtn') || $(collection + 'SpreadsheetToggle');
        if (btn) {
            btn.classList.toggle('active', spreadsheetMode[collection]);
            btn.title = spreadsheetMode[collection] ? 'Exit spreadsheet mode' : 'Spreadsheet edit mode';
        }
        const saveBar = $(collection + 'SpreadsheetSave');
        if (saveBar) saveBar.style.display = 'none';
        if (collection === 'loads') renderLoads();
    }

    function ssExpiryClass(val) {
        if (!val) return '';
        const d = new Date(val + 'T00:00:00');
        if (isNaN(d)) return '';
        const diff = Math.ceil((d - new Date()) / 86400000);
        if (diff < 0) return ' ss-expired';
        if (diff <= 30) return ' ss-expiring';
        return '';
    }

    function ssInput(col, item, collection) {
        const val = item[col.key] || '';
        const cls = 'ss-input';
        const shared = `data-id="${item.id}" data-key="${col.key}" data-collection="${collection}"`;
        if (col.type === 'select') {
            const opts = getDropdownOptions(col.optionsKey);
            return `<select class="${cls} ss-select" ${shared} onchange="Dashboard.ssChanged(this)">${opts.map(o => `<option value="${o.value}"${o.value === val ? ' selected' : ''}>${o.label}</option>`).join('')}</select>`;
        }
        if (col.type === 'truck-select') {
            const opts = state.trucks.filter(t => t.status === 'active' || t.id === val);
            return `<select class="${cls} ss-select" ${shared} onchange="Dashboard.ssChanged(this)"><option value="">” None ”</option>${opts.map(t => `<option value="${t.id}"${t.id === val ? ' selected' : ''}>${escapeHtml(t.unit || t.id)}</option>`).join('')}</select>`;
        }
        if (col.type === 'date') {
            const expCls = col.expiry ? ssExpiryClass(val) : '';
            return `<input type="date" class="${cls}${expCls}" value="${escapeHtml(val)}" ${shared} onchange="Dashboard.ssChanged(this)">`;
        }
        return `<input type="text" class="${cls}" value="${escapeHtml(val)}" placeholder="${col.label}" ${shared} ${col.maxlength ? 'maxlength="'+col.maxlength+'"' : ''} oninput="Dashboard.ssChanged(this)">`;
    }

    function ssChanged(input) {
        const id = input.dataset.id;
        const key = input.dataset.key;
        const collection = input.dataset.collection;
        const item = state[collection].find(x => x.id === id);
        const orig = item ? (item[key] || '') : '';
        const newVal = input.value;
        if (!spreadsheetDirty[collection].has(id)) spreadsheetDirty[collection].set(id, {});
        const rec = spreadsheetDirty[collection].get(id);
        if (newVal !== orig) { rec[key] = newVal; input.classList.add('ss-dirty'); }
        else { delete rec[key]; input.classList.remove('ss-dirty'); if (!Object.keys(rec).length) spreadsheetDirty[collection].delete(id); }
        const saveBar = $(collection + 'SpreadsheetSave');
        if (saveBar) saveBar.style.display = spreadsheetDirty[collection].size > 0 ? 'flex' : 'none';
        const countEl = saveBar?.querySelector('.ss-save-count');
        if (countEl) countEl.textContent = spreadsheetDirty[collection].size + ' changed';
    }

    async function ssSaveAll(collection) {
        const dirty = spreadsheetDirty[collection];
        if (!dirty.size) return;
        const saveBar = $(collection + 'SpreadsheetSave');
        const btn = saveBar?.querySelector('.ss-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
        try {
            const batch = db.batch();
            const type = collection === 'trucks' ? 'truck' : collection === 'trailers' ? 'trailer' : collection === 'loads' ? 'load' : 'driver';
            for (const [id, changes] of dirty) {
                const payload = normalizePayload({ ...changes, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, type);
                batch.update(col(collection).doc(id), payload);
                const item = state[collection].find(x => x.id === id);
                if (item) Object.assign(item, changes);
            }
            const savedCount = dirty.size;
            await batch.commit();
            dirty.clear();
            if (saveBar) saveBar.style.display = 'none';
            document.querySelectorAll('#' + collection + 'TableBody .ss-dirty').forEach(el => el.classList.remove('ss-dirty'));
            showMsg(savedCount + ' item' + (savedCount === 1 ? '' : 's') + ' saved');
            if (collection === 'trucks') { renderTrucks(); populateTruckDropdown(); }
            else if (collection === 'trailers') renderTrailers();
            else if (collection === 'loads') renderLoads();
            else renderDrivers();
            updateOverview();
        } catch (err) {
            console.error('Spreadsheet save error:', err);
            showMsg('Error saving changes', true);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save All'; }
        }
    }

    function ssDiscardAll(collection) {
        spreadsheetDirty[collection].clear();
        const saveBar = $(collection + 'SpreadsheetSave');
        if (saveBar) saveBar.style.display = 'none';
        if (collection === 'trucks') renderTrucks();
        else if (collection === 'trailers') renderTrailers();
        else if (collection === 'loads') renderLoads();
        else renderDrivers();
    }

    // ── Driver Documents ──────────────────────
    const DOC_TYPE_LABELS = {
        cdl: 'CDL', medical: 'Medical Card', contract: 'Contract',
        mvr: 'MVR Report', psp: 'PSP Report', photo: 'Photo', other: 'Other'
    };
    const DETAIL_DOC_TYPES = ['cdl', 'medical', 'contract', 'mvr', 'psp', 'photo', 'other'];
    const MAX_DOC_SIZE = 10 * 1024 * 1024;

    function driverStoragePath(driverId, fileName) {
        return `users/${uid()}/drivers/${driverId}/docs/${Date.now()}_${fileName}`;
    }

    async function uploadDriverDoc(driverId, file, docType) {
        if (file.size > MAX_DOC_SIZE) { showMsg('File too large (max 10 MB)', true); return null; }
        const path = driverStoragePath(driverId, file.name);
        const ref = storage.ref(path);
        const task = ref.put(file);
        try {
            await task;
            const url = await ref.getDownloadURL();
            const docEntry = {
                name: file.name,
                type: docType,
                storagePath: path,
                url: url,
                size: file.size,
                contentType: file.type,
                uploadedAt: new Date().toISOString()
            };
            await col('drivers').doc(driverId).collection('documents').add(docEntry);
            await syncDriverDocSummary(driverId);
            showMsg('Document uploaded');
            return docEntry;
        } catch (err) {
            console.error('Upload error:', err);
            showMsg('Upload failed: ' + (err.message || err), true);
            return null;
        }
    }

    async function deleteDriverDoc(driverId, docId, storagePath) {
        try {
            await storage.ref(storagePath).delete();
        } catch (err) {
            if (err.code !== 'storage/object-not-found') console.warn('Storage delete warning:', err);
        }
        await col('drivers').doc(driverId).collection('documents').doc(docId).delete();
        await syncDriverDocSummary(driverId);
        showMsg('Document removed');
    }

    async function syncDriverDocSummary(driverId) {
        const docs = await loadDriverDocs(driverId);
        const types = [...new Set(docs.map(d => d.type).filter(Boolean))];
        await col('drivers').doc(driverId).update({
            docTypes: types,
            docCount: docs.length,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        const driver = state.drivers.find(d => d.id === driverId);
        if (driver) { driver.docTypes = types; driver.docCount = docs.length; }
    }

    async function loadDriverDocs(driverId) {
        const snap = await col('drivers').doc(driverId).collection('documents').orderBy('uploadedAt', 'desc').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // ── Driver Detail Panel (slide-out) ───────
    let detailPanelDriverId = null;
    let detailPanelOpen = false;

    function populateDetailDropdowns() {
        const stSel = $('dpCdlState');
        if (stSel && stSel.options.length <= 1) {
            JURISDICTIONS.forEach(j => {
                const o = document.createElement('option');
                o.value = j.code;
                o.textContent = j.code + ' \u2014 ' + j.name;
                stSel.appendChild(o);
            });
        }
        const trSel = $('dpTruck');
        if (trSel) {
            const cur = trSel.value;
            trSel.innerHTML = '<option value="">Unassigned</option>';
            state.trucks.filter(t => t.status === 'active').forEach(t => {
                const o = document.createElement('option');
                o.value = t.id;
                o.textContent = t.unit + (t.make ? ' \u2014 ' + t.make + ' ' + (t.model || '') : '');
                trSel.appendChild(o);
            });
            trSel.value = cur;
        }
        const stsSel = $('dpStatus');
        if (stsSel && stsSel.options.length === 0) {
            getDropdownOptions('driverStatus').forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.value;
                opt.textContent = o.label;
                stsSel.appendChild(opt);
            });
        }
    }

    function openDriverDetailPanel(id) {
        const isCreate = !id;
        const d = isCreate ? {} : state.drivers.find(x => x.id === id);
        if (!isCreate && !d) return;
        detailPanelDriverId = id || null;

        populateDetailDropdowns();

        const name = isCreate ? 'New Driver' : ([d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unnamed Driver');
        $('detailDriverName').textContent = name;
        const statusEl = $('detailDriverStatus');
        if (isCreate) {
            statusEl.style.display = 'none';
        } else {
            statusEl.style.display = '';
            statusEl.className = 'status-badge ' + (d.status || 'active');
            statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(d.status || 'active');
        }

        // DND badge + button visibility
        const dndBadge = $('detailDNDBadge');
        if (dndBadge) dndBadge.classList.toggle('hidden', isCreate || !d.doNotDispatch);
        const dndBtn = $('dpActionDND');
        if (dndBtn) {
            // Only show DND quick action button when driver IS on DND
            dndBtn.classList.toggle('hidden', isCreate || !d.doNotDispatch || !canToggleDND());
            if (!isCreate) updateDNDVisuals(d);
        }
        // DND toggle in driver info ” only visible when DND is active
        const dndField = $('dpDNDField');
        const dndToggle = $('dpDNDToggle');
        if (dndField && dndToggle) {
            dndField.classList.toggle('hidden', isCreate || !d.doNotDispatch || !canToggleDND());
            dndToggle.checked = !!d.doNotDispatch;
            $('dpDNDLabel').textContent = d.doNotDispatch ? 'Active' : 'Off';
        }

        $('dpFirstName').value = d.firstName || '';
        $('dpLastName').value = d.lastName || '';
        $('dpPhone').value = d.phone ? formatPhone(d.phone) : '';
        $('dpEmail').value = d.email || '';
        $('dpCdl').value = d.cdl ? d.cdl.toUpperCase() : '';
        $('dpCdlClass').value = d.cdlClass || '';
        $('dpCdlState').value = d.cdlState || '';
        $('dpCdlExp').value = d.cdlExp || '';
        $('dpMedExp').value = d.medExp || '';
        $('dpMvrExp').value = d.mvrExp || '';
        $('dpDrugTestDate').value = d.drugTestDate || '';
        $('dpTwicExp').value = d.twicExp || '';
        $('dpRestrictions').value = d.restrictions || '';
        $('dpTruck').value = d.truck || '';
        $('dpStatus').value = d.status || 'active';
        $('dpHireDate').value = d.hireDate || '';
        $('dpTerminationDate').value = d.terminationDate || '';
        $('dpDob').value = d.dob || '';
        $('dpEmergencyName').value = d.emergencyName || '';
        $('dpEmergencyPhone').value = d.emergencyPhone ? formatPhone(d.emergencyPhone) : '';
        $('dpAddress').value = d.address || '';
        $('dpNotes').value = d.notes || '';

        const endorsements = d.endorsements ? d.endorsements.split(',').map(e => e.trim()) : [];
        document.querySelectorAll('#detailDriverInfo .dp-endorse-chip input').forEach(cb => {
            cb.checked = endorsements.includes(cb.value);
        });

        document.querySelectorAll('#detailDriverInfo .detail-field-input').forEach(inp => {
            inp.closest('.detail-field')?.classList.toggle('has-value', !!inp.value);
        });

        const docGrid = $('detailDocGrid');
        if (docGrid) {
            if (!isCreate && id) {
                renderDetailDocGrid([], id);
                loadDriverDocs(id).then(docs => renderDetailDocGrid(docs, id));
            } else {
                renderDetailDocGrid([], '__new__');
            }
        }

        const panel = $('driverDetailPanel');
        panel.classList.toggle('is-create', isCreate);

        // Set section collapse states
        // New driver: info open, compose collapsed, rest collapsed
        // Existing driver: info collapsed, compose open, rest open
        const infoSec = $('detailInfoSection');
        const composeSec = $('detailComposeSection');
        const tasksSec = $('detailTasksSection');
        const feedSec = $('detailFeedSection');
        const docsSec = $('detailDocsSection');
        if (isCreate) {
            infoSec?.classList.remove('collapsed');
            composeSec?.classList.add('collapsed');
            tasksSec?.classList.add('collapsed');
            feedSec?.classList.add('collapsed');
            docsSec?.classList.add('collapsed');
        } else {
            infoSec?.classList.add('collapsed');
            composeSec?.classList.remove('collapsed');
            tasksSec?.classList.remove('collapsed');
            feedSec?.classList.remove('collapsed');
            docsSec?.classList.add('collapsed');
        }

        $('driverDetailBackdrop').classList.remove('hidden');
        panel.classList.remove('hidden');
        detailPanelOpen = true;

        document.querySelectorAll('#driversTableBody tr.detail-active').forEach(r => r.classList.remove('detail-active'));
        if (id) {
            const activeRow = document.querySelector(`#driversTableBody tr[data-id="${id}"]`);
            if (activeRow) activeRow.classList.add('detail-active');
        }

        if (isCreate) setTimeout(() => $('dpFirstName').focus(), 100);

        // Render summary chips
        renderPanelSummary();

        // Clear + load activity feed & tasks
        const notesFeed = $('detailNotesFeed');
        const tasksFeed = $('detailTasksFeed');
        if (notesFeed) notesFeed.innerHTML = '<p class="dp-empty">Loading\u2026</p>';
        if (tasksFeed) tasksFeed.innerHTML = '<p class="dp-empty">Loading\u2026</p>';
        const noteBadge = $('detailNoteCount');
        const taskBadge = $('detailTaskCount');
        if (noteBadge) noteBadge.textContent = '';
        if (taskBadge) taskBadge.textContent = '';

        // Reset compose
        const noteText = $('detailNoteText');
        if (noteText) { noteText.value = ''; noteText.style.height = 'auto'; }
        const notePost = $('detailNotePost');
        if (notePost) notePost.disabled = true;
        const noteType = $('detailNoteType');
        if (noteType) noteType.value = 'note';
        const notePri = $('detailNotePriority');
        if (notePri) notePri.value = 'normal';

        if (!isCreate && id) {
            loadPanelHistory();
            loadPanelTasks();
        }
    }

    function closeDriverDetailPanel() {
        $('driverDetailBackdrop').classList.add('hidden');
        $('driverDetailPanel').classList.add('hidden');
        detailPanelDriverId = null;
        detailPanelOpen = false;
        document.querySelectorAll('#driversTableBody tr.detail-active').forEach(r => r.classList.remove('detail-active'));
    }

    function getDetailPanelPayload() {
        const endorsements = [];
        document.querySelectorAll('#detailDriverInfo .dp-endorse-chip input:checked').forEach(cb => {
            endorsements.push(cb.value);
        });
        return normalizePayload({
            firstName: $('dpFirstName').value.trim(),
            lastName: $('dpLastName').value.trim(),
            phone: $('dpPhone').value,
            email: $('dpEmail').value.trim(),
            cdl: $('dpCdl').value.trim(),
            cdlClass: $('dpCdlClass').value,
            cdlState: $('dpCdlState').value,
            cdlExp: $('dpCdlExp').value,
            medExp: $('dpMedExp').value,
            mvrExp: $('dpMvrExp').value,
            drugTestDate: $('dpDrugTestDate').value,
            twicExp: $('dpTwicExp').value,
            restrictions: $('dpRestrictions').value.trim(),
            truck: $('dpTruck').value,
            status: $('dpStatus').value || 'active',
            hireDate: $('dpHireDate').value,
            terminationDate: $('dpTerminationDate').value,
            dob: $('dpDob').value,
            endorsements: endorsements.join(','),
            emergencyName: $('dpEmergencyName').value.trim(),
            emergencyPhone: $('dpEmergencyPhone').value,
            address: $('dpAddress').value.trim(),
            notes: $('dpNotes').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, 'driver');
    }

    async function saveDriverFromPanel() {
        const payload = getDetailPanelPayload();
        if (!payload.firstName) {
            showMsg('First name is required', true);
            $('dpFirstName').focus();
            return;
        }
        if (payload.cdl) {
            const dup = await checkDuplicate('drivers', 'cdl', payload.cdl, detailPanelDriverId);
            if (dup) { const dd = dup.data(); if (!confirm('A driver with CDL ' + payload.cdl + ' already exists (' + (dd.firstName || '') + ' ' + (dd.lastName || '') + '). Save anyway?')) return; }
        }
        // Block truck assignment for DND drivers
        if (detailPanelDriverId && payload.truck) {
            const d = state.drivers.find(x => x.id === detailPanelDriverId);
            if (d?.doNotDispatch) {
                showMsg('Cannot assign truck \u2014 driver is on Do Not Dispatch', true);
                payload.truck = '';
                $('dpTruck').value = '';
            }
        }
        try {
            if (detailPanelDriverId) {
                await col('drivers').doc(detailPanelDriverId).update(payload);
                showMsg('Driver updated');
            } else {
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                const ref = await col('drivers').add(payload);
                detailPanelDriverId = ref.id;
                showMsg('Driver added');
                $('detailDriverName').textContent = [payload.firstName, payload.lastName].filter(Boolean).join(' ');
                $('driverDetailPanel').classList.remove('is-create');
                const statusEl = $('detailDriverStatus');
                statusEl.style.display = '';
                statusEl.className = 'status-badge ' + payload.status;
                statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(payload.status);
                renderDetailDocGrid([], detailPanelDriverId);
            }
            await loadDrivers();
            updateOverview();
            renderDrivers();
        } catch (err) {
            console.error('Save driver panel error:', err);
            showMsg('Error saving driver', true);
        }
    }

    async function autoSaveDetailField(key) {
        if (!detailPanelDriverId) return;
        const payload = getDetailPanelPayload();
        try {
            await col('drivers').doc(detailPanelDriverId).update(payload);
            const d = state.drivers.find(x => x.id === detailPanelDriverId);
            if (d) Object.assign(d, payload, { id: detailPanelDriverId });
            if (key === 'firstName' || key === 'lastName') {
                const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || 'Unnamed Driver';
                $('detailDriverName').textContent = name;
            }
            if (key === 'status') {
                const statusEl = $('detailDriverStatus');
                statusEl.className = 'status-badge ' + payload.status;
                statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(payload.status);
            }
            renderDrivers();
        } catch (err) {
            console.error('Auto-save field error:', err);
        }
    }

    function renderDetailDocGrid(docs, driverId) {
        const grid = $('detailDocGrid');
        if (!grid) return;
        const docsByType = {};
        docs.forEach(doc => {
            if (!docsByType[doc.type]) docsByType[doc.type] = [];
            docsByType[doc.type].push(doc);
        });

        grid.innerHTML = DETAIL_DOC_TYPES.map(type => {
            const label = DOC_TYPE_LABELS[type] || type;
            const typeDocs = docsByType[type] || [];
            const hasDoc = typeDocs.length > 0;
            const statusBadgeHtml = hasDoc
                ? '<span class="detail-doc-slot-status uploaded">Uploaded</span>'
                : '<span class="detail-doc-slot-status missing">Missing</span>';

            let bodyHtml;
            if (hasDoc) {
                bodyHtml = typeDocs.map(doc => {
                    const isImage = doc.contentType && doc.contentType.startsWith('image/');
                    const sizeStr = doc.size ? (doc.size < 1024 ? doc.size + ' B' : (doc.size / 1024).toFixed(0) + ' KB') : '';
                    const thumb = isImage ? `<img src="${escapeHtml(doc.url)}" alt="" class="detail-doc-thumb" loading="lazy">` : '';
                    return `<div class="detail-doc-file">
                        ${thumb}
                        <div class="detail-doc-file-info">
                            <span class="detail-doc-file-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</span>
                            <span class="detail-doc-file-meta">${sizeStr}</span>
                        </div>
                        <div class="detail-doc-file-actions">
                            <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener" title="View / Download">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </a>
                            <label class="doc-slot-replace" title="Replace" tabindex="0">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" data-driver="${driverId}" data-type="${type}" data-replace-doc="${doc.id}" data-replace-path="${escapeHtml(doc.storagePath)}" hidden>
                            </label>
                            <button type="button" class="doc-slot-delete" title="Delete" data-driver="${driverId}" data-doc-id="${doc.id}" data-path="${escapeHtml(doc.storagePath)}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>`;
                }).join('');
            } else {
                bodyHtml = `<label class="detail-doc-upload-prompt" tabindex="0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload ${escapeHtml(label)}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" data-driver="${driverId}" data-type="${type}" hidden>
                </label>`;
            }

            return `<div class="detail-doc-slot" data-doc-type="${type}">
                <div class="detail-doc-slot-header">
                    <span class="detail-doc-slot-label">${escapeHtml(label)}</span>
                    ${statusBadgeHtml}
                </div>
                <div class="detail-doc-slot-body">${bodyHtml}</div>
            </div>`;
        }).join('');
    }

    function initDriverDetailPanel() {
        $('detailCloseBtn').addEventListener('click', closeDriverDetailPanel);
        $('driverDetailBackdrop').addEventListener('click', closeDriverDetailPanel);
        $('detailSaveBtn').addEventListener('click', saveDriverFromPanel);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && detailPanelOpen) closeDriverDetailPanel();
        });

        document.querySelectorAll('#detailDriverInfo .detail-field-input').forEach(inp => {
            inp.addEventListener('blur', () => {
                const key = inp.closest('.detail-field')?.dataset.key;
                if (key) {
                    inp.closest('.detail-field')?.classList.toggle('has-value', !!inp.value);
                    autoSaveDetailField(key);
                }
            });
            if (inp.id === 'dpPhone' || inp.id === 'dpEmergencyPhone') {
                inp.addEventListener('input', () => formatPhoneLive(inp));
            }
            if (inp.id === 'dpCdl') {
                inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase(); });
            }
        });

        document.querySelectorAll('#detailDriverInfo .dp-endorse-chip input').forEach(cb => {
            cb.addEventListener('change', () => autoSaveDetailField('endorsements'));
        });

        const grid = $('detailDocGrid');
        if (grid) {
            grid.addEventListener('change', async (e) => {
                const input = e.target.closest('input[type="file"]');
                if (!input || !input.files[0]) return;
                let driverId = input.dataset.driver;
                const docType = input.dataset.type;
                const file = input.files[0];

                if (!detailPanelDriverId || driverId === '__new__') {
                    const payload = getDetailPanelPayload();
                    if (!payload.firstName) {
                        showMsg('Enter at least a first name before uploading', true);
                        $('dpFirstName').focus();
                        input.value = '';
                        return;
                    }
                    try {
                        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        const ref = await col('drivers').add(payload);
                        detailPanelDriverId = ref.id;
                        driverId = ref.id;
                        $('detailDriverName').textContent = [payload.firstName, payload.lastName].filter(Boolean).join(' ');
                        $('driverDetailPanel').classList.remove('is-create');
                        const statusEl = $('detailDriverStatus');
                        statusEl.style.display = '';
                        statusEl.className = 'status-badge ' + payload.status;
                        statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(payload.status);
                        await loadDrivers();
                        updateOverview();
                        renderDrivers();
                        showMsg('Driver saved \u2014 uploading document\u2026');
                    } catch (err) {
                        console.error('Auto-save before upload error:', err);
                        showMsg('Error saving driver', true);
                        input.value = '';
                        return;
                    }
                }

                const replaceDocId = input.dataset.replaceDoc;
                const replacePath = input.dataset.replacePath;
                if (replaceDocId && replacePath) {
                    await deleteDriverDoc(driverId, replaceDocId, replacePath);
                }

                await uploadDriverDoc(driverId, file, docType);
                input.value = '';
                const docs = await loadDriverDocs(driverId);
                renderDetailDocGrid(docs, driverId);
                renderDrivers();
            });

            grid.addEventListener('click', async (e) => {
                const btn = e.target.closest('.doc-slot-delete');
                if (!btn) return;
                if (!confirm('Delete this document?')) return;
                const driverId = btn.dataset.driver;
                const docId = btn.dataset.docId;
                const path = btn.dataset.path;
                await deleteDriverDoc(driverId, docId, path);
                const docs = await loadDriverDocs(driverId);
                renderDetailDocGrid(docs, driverId);
                renderDrivers();
            });
        }

        // ── Compose wiring ──
        const noteText = $('detailNoteText');
        const notePost = $('detailNotePost');
        if (noteText && notePost) {
            noteText.addEventListener('input', () => {
                noteText.style.height = 'auto';
                noteText.style.height = noteText.scrollHeight + 'px';
                notePost.disabled = !noteText.value.trim();
            });
            notePost.addEventListener('click', panelPostCompose);
        }

        // ── Task interaction wiring ──
        const taskFeed = $('detailTasksFeed');
        if (taskFeed) {
            taskFeed.addEventListener('change', async (e) => {
                const sel = e.target.closest('.dp-task-status-select');
                if (!sel || !detailPanelDriverId) return;
                const taskId = sel.dataset.taskId;
                const newStatus = sel.value;
                try {
                    const result = await FirebaseDB.updateTaskStatus(state.user.uid, 'drivers', detailPanelDriverId, taskId, newStatus);
                    if (!result.success) throw new Error(result.error);
                    showMsg('Status updated');
                    await Promise.all([loadPanelTasks(), loadPanelHistory()]);
                } catch (err) { console.error(err); showMsg('Error updating status', true); }
            });
            taskFeed.addEventListener('click', async (e) => {
                const btn = e.target.closest('.dp-task-resolve');
                if (!btn || !detailPanelDriverId) return;
                const taskId = btn.dataset.taskId;
                try {
                    const result = await FirebaseDB.resolveTask(state.user.uid, 'drivers', detailPanelDriverId, taskId, '', state.user.email || state.user.uid);
                    if (!result.success) throw new Error(result.error);
                    showMsg('Task resolved');
                    await Promise.all([loadPanelTasks(), loadPanelHistory()]);
                } catch (err) { console.error(err); showMsg('Error resolving task', true); }
            });
        }

        // ── Collapsible toggles ──
        document.querySelectorAll('#driverDetailPanel .dp-section-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = document.getElementById(btn.dataset.target);
                if (!section) return;
                const collapsed = section.classList.toggle('collapsed');
                btn.setAttribute('aria-expanded', String(!collapsed));
            });
        });

        // ── Quick actions ──
        const callBtn = $('dpActionCall');
        if (callBtn) callBtn.addEventListener('click', () => {
            const phone = $('dpPhone')?.value?.replace(/\D/g, '');
            if (phone) window.open('tel:' + phone);
            else showMsg('No phone number on file', true);
        });
        const textBtn = $('dpActionText');
        if (textBtn) textBtn.addEventListener('click', () => {
            const phone = $('dpPhone')?.value?.replace(/\D/g, '');
            if (phone) window.open('sms:' + phone);
            else showMsg('No phone number on file', true);
        });
        const assignBtn = $('dpActionAssign');
        if (assignBtn) assignBtn.addEventListener('click', () => {
            if (detailPanelDriverId) {
                const d = state.drivers.find(x => x.id === detailPanelDriverId);
                if (d?.doNotDispatch) {
                    showMsg('Cannot assign truck \u2014 driver is on Do Not Dispatch', true);
                    return;
                }
            }
            const infoSection = $('detailInfoSection');
            if (infoSection?.classList.contains('collapsed')) {
                infoSection.classList.remove('collapsed');
            }
            setTimeout(() => $('dpTruck')?.focus(), 150);
        });
        // DND button (quick action ” only visible when DND is active, for removal)
        const dndBtn = $('dpActionDND');
        if (dndBtn) dndBtn.addEventListener('click', () => toggleDND());

        // DND toggle switch in driver info section
        const dndToggle = $('dpDNDToggle');
        if (dndToggle) dndToggle.addEventListener('change', () => toggleDND());

        const unavailBtn = $('dpActionUnavail');
        if (unavailBtn) unavailBtn.addEventListener('click', async () => {
            if (!detailPanelDriverId) return;
            const d = state.drivers.find(x => x.id === detailPanelDriverId);
            const newStatus = d?.status === 'inactive' ? 'active' : 'inactive';
            try {
                await col('drivers').doc(detailPanelDriverId).update({ status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                if (d) d.status = newStatus;
                $('dpStatus').value = newStatus;
                const statusEl = $('detailDriverStatus');
                statusEl.className = 'status-badge ' + newStatus;
                statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(newStatus);
                renderPanelSummary();
                renderDrivers();
                updateOverview();
                showMsg('Driver marked ' + statusLabel(newStatus));
            } catch (err) { console.error(err); showMsg('Error updating status', true); }
        });
    }

    // ── Panel Compose Post ──
    async function panelPostCompose() {
        const textarea = $('detailNoteText');
        const postBtn = $('detailNotePost');
        const compose = textarea?.closest('.dp-compose');
        const text = textarea?.value?.trim();
        if (!text || !detailPanelDriverId) return;

        const type = $('detailNoteType')?.value || 'note';
        const priority = $('detailNotePriority')?.value || 'normal';

        postBtn.disabled = true;
        postBtn.classList.add('posting');

        try {
            const d = state.drivers.find(x => x.id === detailPanelDriverId);
            const driverName = d ? [d.firstName, d.lastName].filter(Boolean).join(' ') : detailPanelDriverId;

            const taskData = {
                text,
                type,
                status: 'Open',
                priority,
                assignedTo: [],
                dueDate: null,
                createdBy: state.user.email || state.user.uid,
                source: 'driver-panel',
                driverName,
                createdAtIso: new Date().toISOString()
            };

            const result = await FirebaseDB.createTask(state.user.uid, 'drivers', detailPanelDriverId, taskData);
            if (!result.success) throw new Error(result.error);

            textarea.value = '';
            textarea.style.height = 'auto';
            $('detailNoteType').value = 'note';
            $('detailNotePriority').value = 'normal';
            postBtn.disabled = true;

            if (compose) {
                compose.classList.add('posted');
                setTimeout(() => compose.classList.remove('posted'), 600);
            }

            await Promise.all([loadPanelHistory(), loadPanelTasks()]);
        } catch (err) {
            console.error('panelPostCompose error:', err);
            showMsg('Could not post. ' + (err.message || ''), true);
        } finally {
            postBtn.classList.remove('posting');
            postBtn.disabled = !textarea.value.trim();
        }
    }

    // ── Load Panel History ──
    async function loadPanelHistory() {
        if (!detailPanelDriverId) return;
        try {
            const snap = await db.collection('users').doc(state.user.uid)
                .collection('drivers').doc(detailPanelDriverId)
                .collection('history').orderBy('createdAt', 'desc').limit(50).get();
            const items = [];
            snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
            renderPanelNotes(items);
        } catch (err) {
            console.error('loadPanelHistory error:', err);
        }
    }

    // ── Render Panel Notes ──
    function renderPanelNotes(items) {
        const container = $('detailNotesFeed');
        const badge = $('detailNoteCount');
        if (!container) return;
        if (badge) badge.textContent = items.length || '';

        if (!items.length) {
            container.innerHTML = '<p class="dp-empty">No activity yet. Post a note above.</p>';
            return;
        }

        container.innerHTML = items.map(n => {
            const ts = n.createdAt?.toDate?.() || (n.createdAtIso ? new Date(n.createdAtIso) : null);
            const timeStr = ts ? ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
            const author = n.createdBy || '';
            const initial = author.charAt(0).toUpperCase() || 'U';
            const priHtml = (n.priority && n.priority !== 'normal') ? `<span class="dp-note-pri" data-pri="${escapeHtml(n.priority)}">${escapeHtml(n.priority)}</span>` : '';

            return `<div class="dp-note" data-id="${n.id}">
                <div class="dp-note-avi">${initial}</div>
                <div class="dp-note-body">
                    <div class="dp-note-meta">
                        <span class="dp-note-tag" data-type="${escapeHtml(n.type || 'note')}">${escapeHtml(n.type || 'note')}</span>
                        ${priHtml}
                        <span class="dp-note-time">${timeStr}</span>
                    </div>
                    <div class="dp-note-text">${escapeHtml(n.text || '')}</div>
                    <div class="dp-note-author">${escapeHtml(author)}</div>
                </div>
                <button class="dp-note-del" data-id="${n.id}" title="Delete">\u2715</button>
            </div>`;
        }).join('');

        container.querySelectorAll('.dp-note-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this note?')) return;
                try {
                    await db.collection('users').doc(state.user.uid)
                        .collection('drivers').doc(detailPanelDriverId)
                        .collection('history').doc(btn.dataset.id).delete();
                    await Promise.all([loadPanelHistory(), loadPanelTasks()]);
                } catch (err) { console.error(err); showMsg('Error deleting note', true); }
            });
        });
    }

    // ── Load Panel Tasks ──
    async function loadPanelTasks() {
        if (!detailPanelDriverId) return;
        try {
            const result = await FirebaseDB.getTasks(state.user.uid, 'drivers', detailPanelDriverId, { limit: 20 });
            if (result.success) renderPanelTasks(result.data);
        } catch (err) {
            console.error('loadPanelTasks error:', err);
        }
    }

    // ── Render Panel Tasks ──
    function renderPanelTasks(tasks) {
        const container = $('detailTasksFeed');
        const badge = $('detailTaskCount');
        if (!container) return;

        const open = tasks.filter(t => t.status && t.status !== 'Resolved');
        if (badge) badge.textContent = open.length || '';

        if (!open.length) {
            container.innerHTML = '<p class="dp-empty">No open tasks.</p>';
            return;
        }

        const now = new Date();
        container.innerHTML = open.slice(0, 8).map(t => {
            const ts = t.createdAt?.toDate?.() || (t.createdAtIso ? new Date(t.createdAtIso) : null);
            const dateStr = ts ? ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const priHtml = (t.priority && t.priority !== 'normal') ? `<span class="dp-task-pri" data-pri="${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>` : '';
            const dueDate = t.dueDate ? new Date(t.dueDate) : null;
            const overdue = dueDate && dueDate < now && t.status !== 'Resolved';
            const overdueHtml = overdue ? '<span class="dp-task-overdue">OVERDUE</span>' : '';

            return `<div class="dp-task" data-id="${t.id}" data-entity-type="drivers" data-entity-id="${detailPanelDriverId}">
                <div class="dp-task-top">
                    <span class="dp-task-type">${escapeHtml(t.type || 'note')}</span>
                    ${priHtml}${overdueHtml}
                </div>
                <div class="dp-task-text">${escapeHtml(t.text || '')}</div>
                <div class="dp-task-bot">
                    <span class="dp-task-date">${dateStr}</span>
                    <select class="dp-task-status-select" data-task-id="${t.id}">
                        <option value="Open"${t.status === 'Open' ? ' selected' : ''}>Open</option>
                        <option value="In Progress"${t.status === 'In Progress' ? ' selected' : ''}>In Progress</option>
                        <option value="Resolved"${t.status === 'Resolved' ? ' selected' : ''}>Resolved</option>
                    </select>
                    <button class="dp-task-resolve" data-task-id="${t.id}" title="Mark resolved">âœ“</button>
                </div>
            </div>`;
        }).join('');
    }

    // ── Render Summary Chips ──
    async function toggleDND() {
        if (!detailPanelDriverId || !canToggleDND()) return;
        const d = state.drivers.find(x => x.id === detailPanelDriverId);
        if (!d) return;
        const newDnd = !d.doNotDispatch;
        const action = newDnd ? 'place on' : 'remove from';
        if (!confirm(`Are you sure you want to ${action} Do Not Dispatch for ${d.firstName} ${d.lastName}?`)) {
            // Reset toggle switch if cancelled
            const toggle = $('dpDNDToggle');
            if (toggle) toggle.checked = !!d.doNotDispatch;
            return;
        }
        try {
            await col('drivers').doc(detailPanelDriverId).update({
                doNotDispatch: newDnd,
                dndSetBy: state.user.email || '',
                dndSetAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            d.doNotDispatch = newDnd;
            d.dndSetBy = state.user.email || '';
            d.dndSetAt = new Date().toISOString();
            updateDNDVisuals(d);
            // Update toggle switch + field visibility
            const toggle = $('dpDNDToggle');
            if (toggle) toggle.checked = newDnd;
            const dndField = $('dpDNDField');
            if (dndField) dndField.classList.toggle('hidden', !newDnd);
            $('dpDNDLabel').textContent = newDnd ? 'Active' : 'Off';
            renderDrivers();
            renderPanelSummary();
            showMsg(newDnd ? 'Driver placed on Do Not Dispatch' : 'Do Not Dispatch removed');
            try {
                await col('drivers').doc(detailPanelDriverId).collection('history').add({
                    type: 'system',
                    text: newDnd ? 'Placed on Do Not Dispatch' : 'Removed from Do Not Dispatch',
                    by: state.user.email || 'Unknown',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                loadPanelFeed();
            } catch (e) { console.error('DND history log error:', e); }
        } catch (err) {
            console.error('DND toggle error:', err);
            const toggle = $('dpDNDToggle');
            if (toggle) toggle.checked = !!d.doNotDispatch;
            showMsg('Error updating Do Not Dispatch', true);
        }
    }

    function updateDNDVisuals(d) {
        const dndBtn = $('dpActionDND');
        if (dndBtn) {
            if (d.doNotDispatch) {
                dndBtn.classList.add('dp-qaction--active');
                dndBtn.querySelector('span:last-child').textContent = 'Remove DND';
                dndBtn.title = 'Remove Do Not Dispatch';
            } else {
                dndBtn.classList.remove('dp-qaction--active');
                dndBtn.querySelector('span:last-child').textContent = 'DND';
                dndBtn.title = 'Do Not Dispatch';
            }
        }
        // Update header badge
        const headerBadge = $('detailDNDBadge');
        if (headerBadge) {
            headerBadge.classList.toggle('hidden', !d.doNotDispatch);
        }
    }

    function renderPanelSummary() {
        const bar = $('detailSummaryBar');
        if (!bar || !detailPanelDriverId) { if (bar) bar.innerHTML = ''; return; }
        const d = state.drivers.find(x => x.id === detailPanelDriverId);
        if (!d) { bar.innerHTML = ''; return; }

        const chips = [];
        const now = new Date();
        const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        function dateChip(label, dateStr) {
            if (!dateStr) return { label, text: 'N/A', cls: 'dp-chip--gray' };
            const dt = new Date(dateStr);
            if (dt < now) return { label, text: 'Expired', cls: 'dp-chip--red' };
            if (dt < soon) return { label, text: 'Due soon', cls: 'dp-chip--yellow' };
            return { label, text: 'Current', cls: 'dp-chip--green' };
        }

        chips.push(dateChip('CDL', d.cdlExp));
        chips.push(dateChip('Medical', d.medExp));

        if (d.truck) {
            const truck = state.trucks.find(t => t.id === d.truck);
            chips.push({ label: 'Truck', text: truck ? truck.unit : 'Assigned', cls: 'dp-chip--blue' });
        } else {
            chips.push({ label: 'Truck', text: 'None', cls: 'dp-chip--gray' });
        }

        const statusCls = d.status === 'active' ? 'dp-chip--green' : d.status === 'inactive' ? 'dp-chip--red' : 'dp-chip--yellow';
        chips.push({ label: 'Status', text: statusLabel(d.status || 'active'), cls: statusCls });

        if (d.doNotDispatch) {
            chips.unshift({ label: 'DND', text: 'Do Not Dispatch', cls: 'dp-chip--red' });
        }

        bar.innerHTML = chips.map(c =>
            `<span class="${c.cls} dp-chip"><span class="dp-chip-dot"></span>${escapeHtml(c.label)}: ${escapeHtml(c.text)}</span>`
        ).join('');
    }

    // ── Render Compliance Grid ──
    function renderPanelCompliance() {
        const grid = $('detailComplianceGrid');
        if (!grid || !detailPanelDriverId) return;
        const d = state.drivers.find(x => x.id === detailPanelDriverId);
        if (!d) { grid.innerHTML = ''; return; }

        const now = new Date();
        const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        function compItem(label, dateStr, extraInfo) {
            if (!dateStr) return `<div class="dp-comp-item comp-na"><div class="dp-comp-label">${escapeHtml(label)}</div><div class="dp-comp-value">Not on file</div></div>`;
            const dt = new Date(dateStr);
            let cls = 'comp-ok', text = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            if (dt < now) { cls = 'comp-expired'; text += ' \u2014 Expired'; }
            else if (dt < soon) { cls = 'comp-warn'; text += ' \u2014 Due soon'; }
            const sub = extraInfo ? `<div class="dp-comp-sub">${escapeHtml(extraInfo)}</div>` : '';
            return `<div class="dp-comp-item ${cls}"><div class="dp-comp-label">${escapeHtml(label)}</div><div class="dp-comp-value">${text}</div>${sub}</div>`;
        }

        const endorsements = d.endorsements ? d.endorsements.split(',').map(e => e.trim()).filter(Boolean) : [];
        const endHtml = endorsements.length
            ? `<div class="dp-comp-item comp-ok" style="grid-column:1/-1"><div class="dp-comp-label">Endorsements</div><div class="dp-comp-value">${endorsements.join(', ')}</div></div>`
            : `<div class="dp-comp-item comp-na" style="grid-column:1/-1"><div class="dp-comp-label">Endorsements</div><div class="dp-comp-value">None</div></div>`;

        const restHtml = d.restrictions
            ? `<div class="dp-comp-item comp-warn" style="grid-column:1/-1"><div class="dp-comp-label">Restrictions</div><div class="dp-comp-value">${escapeHtml(d.restrictions)}</div></div>`
            : '';

        grid.innerHTML = [
            compItem('CDL Expiration', d.cdlExp, d.cdl ? ('CDL: ' + d.cdl + (d.cdlClass ? ' (Class ' + d.cdlClass + ')' : '')) : ''),
            compItem('Medical Card', d.medExp),
            compItem('MVR Expiry', d.mvrExp),
            compItem('Drug Test', d.drugTestDate),
            compItem('TWIC Card', d.twicExp),
            d.hireDate ? compItem('Hire Date', d.hireDate) : '',
            endHtml,
            restHtml
        ].join('');
    }

    // ── Truck Detail Panel (slide-out) ────────
    let truckPanelId = null;
    let truckPanelOpen = false;

    const TRUCK_DOC_TYPES = ['registration', 'insurance', 'inspection', 'title', 'lease', 'photo', 'other'];
    const TRUCK_DOC_LABELS = {
        registration: 'Registration', insurance: 'Insurance', inspection: 'Inspection',
        title: 'Title', lease: 'Lease', photo: 'Photo', other: 'Other'
    };

    function truckStoragePath(truckId, fileName) {
        return `users/${uid()}/trucks/${truckId}/docs/${Date.now()}_${fileName}`;
    }

    async function uploadTruckDoc(truckId, file, docType) {
        if (file.size > MAX_DOC_SIZE) { showMsg('File too large (max 10 MB)', true); return null; }
        const path = truckStoragePath(truckId, file.name);
        const ref = storage.ref(path);
        try {
            await ref.put(file);
            const url = await ref.getDownloadURL();
            const docEntry = { name: file.name, type: docType, storagePath: path, url, size: file.size, contentType: file.type, uploadedAt: new Date().toISOString() };
            await col('trucks').doc(truckId).collection('documents').add(docEntry);
            showMsg('Document uploaded');
            return docEntry;
        } catch (err) { console.error('Upload error:', err); showMsg('Upload failed', true); return null; }
    }

    async function deleteTruckDoc(truckId, docId, storagePath) {
        try { await storage.ref(storagePath).delete(); } catch (err) { if (err.code !== 'storage/object-not-found') console.warn(err); }
        await col('trucks').doc(truckId).collection('documents').doc(docId).delete();
        showMsg('Document removed');
    }

    async function loadTruckDocs(truckId) {
        const snap = await col('trucks').doc(truckId).collection('documents').orderBy('uploadedAt', 'desc').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    function renderTruckDocGrid(docs, truckId) {
        const grid = $('truckDocGrid');
        if (!grid) return;
        const docsByType = {};
        docs.forEach(d => {
            if (!docsByType[d.type]) docsByType[d.type] = [];
            docsByType[d.type].push(d);
        });
        grid.innerHTML = TRUCK_DOC_TYPES.map(type => {
            const label = TRUCK_DOC_LABELS[type] || type;
            const typeDocs = docsByType[type] || [];
            const hasDoc = typeDocs.length > 0;
            const statusBadgeHtml = hasDoc
                ? '<span class="detail-doc-slot-status uploaded">Uploaded</span>'
                : '<span class="detail-doc-slot-status missing">Missing</span>';
            let bodyHtml;
            if (hasDoc) {
                bodyHtml = typeDocs.map(doc => {
                    const isImage = doc.contentType && doc.contentType.startsWith('image/');
                    const sizeStr = doc.size ? (doc.size < 1024 ? doc.size + ' B' : (doc.size / 1024).toFixed(0) + ' KB') : '';
                    const thumb = isImage ? `<img src="${escapeHtml(doc.url)}" alt="" class="detail-doc-thumb" loading="lazy">` : '';
                    return `<div class="detail-doc-file">
                        ${thumb}
                        <div class="detail-doc-file-info">
                            <span class="detail-doc-file-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</span>
                            <span class="detail-doc-file-meta">${sizeStr}</span>
                        </div>
                        <div class="detail-doc-file-actions">
                            <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener" title="View / Download">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </a>
                            <label class="doc-slot-replace" title="Replace" tabindex="0">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" data-truck="${truckId}" data-type="${type}" data-replace-doc="${doc.id}" data-replace-path="${escapeHtml(doc.storagePath)}" hidden>
                            </label>
                            <button type="button" class="doc-slot-delete" title="Delete" data-truck="${truckId}" data-doc-id="${doc.id}" data-path="${escapeHtml(doc.storagePath)}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>`;
                }).join('');
            } else {
                bodyHtml = `<label class="detail-doc-upload-prompt" tabindex="0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload ${escapeHtml(label)}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" data-truck="${truckId}" data-type="${type}" hidden>
                </label>`;
            }
            return `<div class="detail-doc-slot" data-doc-type="${type}">
                <div class="detail-doc-slot-header">
                    <span class="detail-doc-slot-label">${escapeHtml(label)}</span>
                    ${statusBadgeHtml}
                </div>
                <div class="detail-doc-slot-body">${bodyHtml}</div>
            </div>`;
        }).join('');
    }

    function openTruckDetailPanel(id) {
        const isCreate = !id;
        const t = isCreate ? {} : state.trucks.find(x => x.id === id);
        if (!isCreate && !t) return;
        truckPanelId = id || null;

        const name = isCreate ? 'New Truck' : (t.unit || 'Unnamed Truck');
        $('detailTruckName').textContent = name;
        const statusEl = $('detailTruckStatus');
        if (isCreate) { statusEl.style.display = 'none'; }
        else {
            statusEl.style.display = '';
            statusEl.className = 'status-badge ' + (t.status || 'active');
            statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(t.status || 'active');
        }

        // DND badge + button
        const dndBadge = $('detailTruckDNDBadge');
        if (dndBadge) dndBadge.classList.toggle('hidden', isCreate || !t.doNotDispatch);
        const dndBtn = $('tpActionDND');
        if (dndBtn) {
            dndBtn.classList.toggle('hidden', isCreate || !t.doNotDispatch || !canToggleDND());
            if (!isCreate) updateTruckDNDVisuals(t);
        }
        const dndField = $('tpDNDField');
        const dndToggle = $('tpDNDToggle');
        if (dndField && dndToggle) {
            dndField.classList.toggle('hidden', isCreate || !t.doNotDispatch || !canToggleDND());
            dndToggle.checked = !!t.doNotDispatch;
            $('tpDNDLabel').textContent = t.doNotDispatch ? 'Active' : 'Off';
        }

        $('tpUnit').value = t.unit || '';
        $('tpStatus').value = t.status || 'active';
        $('tpYear').value = t.year || '';
        $('tpMake').value = t.make || '';
        $('tpModel').value = t.model || '';
        $('tpVin').value = t.vin || '';
        $('tpPlate').value = t.plate || '';
        $('tpPlateState').value = t.plateState || '';
        $('tpFuel').value = t.fuel || 'diesel';
        $('tpAnnualInspDate').value = t.annualInspDate || '';
        $('tpRegistrationExp').value = t.registrationExp || '';
        $('tpInsuranceExp').value = t.insuranceExp || '';
        $('tpNotes').value = t.notes || '';

        document.querySelectorAll('#detailTruckInfo .detail-field-input').forEach(inp => {
            inp.closest('.detail-field')?.classList.toggle('has-value', !!inp.value);
        });

        // Docs
        const docGrid = $('truckDocGrid');
        if (docGrid) {
            if (!isCreate && id) {
                renderTruckDocGrid([], id);
                loadTruckDocs(id).then(docs => renderTruckDocGrid(docs, id));
            } else { renderTruckDocGrid([], '__new__'); }
        }

        const panel = $('truckDetailPanel');
        panel.classList.toggle('is-create', isCreate);

        // Section collapse states
        const infoSec = $('truckInfoSection');
        const composeSec = $('truckComposeSection');
        const tasksSec = $('truckTasksSection');
        const feedSec = $('truckFeedSection');
        const docsSec = $('truckDocsSection');
        if (isCreate) {
            infoSec?.classList.remove('collapsed');
            composeSec?.classList.add('collapsed');
            tasksSec?.classList.add('collapsed');
            feedSec?.classList.add('collapsed');
            docsSec?.classList.add('collapsed');
        } else {
            infoSec?.classList.add('collapsed');
            composeSec?.classList.remove('collapsed');
            tasksSec?.classList.remove('collapsed');
            feedSec?.classList.remove('collapsed');
            docsSec?.classList.add('collapsed');
        }

        $('truckDetailBackdrop').classList.remove('hidden');
        panel.classList.remove('hidden');
        truckPanelOpen = true;

        document.querySelectorAll('#trucksTableBody tr.detail-active').forEach(r => r.classList.remove('detail-active'));
        if (id) {
            const activeRow = document.querySelector(`#trucksTableBody tr[data-id="${id}"]`);
            if (activeRow) activeRow.classList.add('detail-active');
        }

        if (isCreate) setTimeout(() => $('tpUnit').focus(), 100);

        renderTruckPanelSummary();

        // Load feeds
        const notesFeed = $('truckNotesFeed');
        const tasksFeed = $('truckTasksFeed');
        if (notesFeed) notesFeed.innerHTML = '<p class="dp-empty">Loading\u2026</p>';
        if (tasksFeed) tasksFeed.innerHTML = '<p class="dp-empty">Loading\u2026</p>';
        $('truckNoteCount').textContent = '';
        $('truckTaskCount').textContent = '';
        const noteText = $('truckNoteText');
        if (noteText) { noteText.value = ''; noteText.style.height = 'auto'; }
        const notePost = $('truckNotePost');
        if (notePost) notePost.disabled = true;
        $('truckNoteType').value = 'note';
        $('truckNotePriority').value = 'normal';

        if (!isCreate && id) { loadTruckPanelHistory(); loadTruckPanelTasks(); }
    }

    function closeTruckDetailPanel() {
        $('truckDetailBackdrop').classList.add('hidden');
        $('truckDetailPanel').classList.add('hidden');
        truckPanelId = null;
        truckPanelOpen = false;
        document.querySelectorAll('#trucksTableBody tr.detail-active').forEach(r => r.classList.remove('detail-active'));
    }

    function getTruckPanelPayload() {
        return {
            unit: $('tpUnit').value.trim(),
            year: $('tpYear').value.trim(),
            make: $('tpMake').value.trim(),
            model: $('tpModel').value.trim(),
            vin: $('tpVin').value.trim(),
            plate: $('tpPlate').value.trim(),
            plateState: $('tpPlateState').value.trim().toUpperCase(),
            fuel: $('tpFuel').value,
            status: $('tpStatus').value || 'active',
            annualInspDate: $('tpAnnualInspDate').value,
            registrationExp: $('tpRegistrationExp').value,
            insuranceExp: $('tpInsuranceExp').value,
            notes: $('tpNotes').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
    }

    async function saveTruckFromPanel() {
        const payload = getTruckPanelPayload();
        if (!payload.unit) { showMsg('Unit # is required', true); $('tpUnit').focus(); return; }
        try {
            if (truckPanelId) {
                await col('trucks').doc(truckPanelId).update(payload);
                showMsg('Truck updated');
            } else {
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                const ref = await col('trucks').add(payload);
                truckPanelId = ref.id;
                showMsg('Truck added');
                $('detailTruckName').textContent = payload.unit;
                $('truckDetailPanel').classList.remove('is-create');
                const statusEl = $('detailTruckStatus');
                statusEl.style.display = '';
                statusEl.className = 'status-badge ' + payload.status;
                statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(payload.status);
                renderTruckDocGrid([], truckPanelId);
            }
            await loadTrucks();
            populateTruckDropdown();
            updateOverview();
            renderTrucks();
        } catch (err) { console.error('Save truck panel error:', err); showMsg('Error saving truck', true); }
    }

    async function autoSaveTruckField() {
        if (!truckPanelId) return;
        try { await col('trucks').doc(truckPanelId).update(getTruckPanelPayload()); } catch (e) { console.error(e); }
    }

    async function toggleTruckDND() {
        if (!truckPanelId || !canToggleDND()) return;
        const t = state.trucks.find(x => x.id === truckPanelId);
        if (!t) return;
        const newDnd = !t.doNotDispatch;
        const action = newDnd ? 'place on' : 'remove from';
        if (!confirm(`Are you sure you want to ${action} Do Not Dispatch for truck ${t.unit}?`)) {
            const toggle = $('tpDNDToggle');
            if (toggle) toggle.checked = !!t.doNotDispatch;
            return;
        }
        try {
            await col('trucks').doc(truckPanelId).update({
                doNotDispatch: newDnd, dndSetBy: state.user.email || '', dndSetAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            t.doNotDispatch = newDnd;
            updateTruckDNDVisuals(t);
            const toggle = $('tpDNDToggle');
            if (toggle) toggle.checked = newDnd;
            const dndField = $('tpDNDField');
            if (dndField) dndField.classList.toggle('hidden', !newDnd);
            $('tpDNDLabel').textContent = newDnd ? 'Active' : 'Off';
            renderTrucks();
            renderTruckPanelSummary();
            showMsg(newDnd ? 'Truck placed on Do Not Dispatch' : 'Do Not Dispatch removed');
            try {
                await col('trucks').doc(truckPanelId).collection('history').add({
                    type: 'system', text: newDnd ? 'Placed on Do Not Dispatch' : 'Removed from Do Not Dispatch',
                    by: state.user.email || 'Unknown', createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                loadTruckPanelHistory();
            } catch (e) { console.error(e); }
        } catch (err) {
            console.error(err);
            const toggle = $('tpDNDToggle');
            if (toggle) toggle.checked = !!t.doNotDispatch;
            showMsg('Error updating Do Not Dispatch', true);
        }
    }

    function updateTruckDNDVisuals(t) {
        const dndBtn = $('tpActionDND');
        if (dndBtn) {
            if (t.doNotDispatch) { dndBtn.classList.add('dp-qaction--active'); dndBtn.querySelector('span:last-child').textContent = 'Remove DND'; dndBtn.title = 'Remove Do Not Dispatch'; }
            else { dndBtn.classList.remove('dp-qaction--active'); dndBtn.querySelector('span:last-child').textContent = 'DND'; dndBtn.title = 'Do Not Dispatch'; }
        }
        const badge = $('detailTruckDNDBadge');
        if (badge) badge.classList.toggle('hidden', !t.doNotDispatch);
    }

    function renderTruckPanelSummary() {
        const bar = $('truckSummaryBar');
        if (!bar || !truckPanelId) { if (bar) bar.innerHTML = ''; return; }
        const t = state.trucks.find(x => x.id === truckPanelId);
        if (!t) { bar.innerHTML = ''; return; }
        const chips = [];
        const now = new Date();
        const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        function dateChip(label, dateStr) {
            if (!dateStr) return { label, text: 'N/A', cls: 'dp-chip--gray' };
            const dt = new Date(dateStr);
            if (dt < now) return { label, text: 'Expired', cls: 'dp-chip--red' };
            if (dt < soon) return { label, text: 'Due soon', cls: 'dp-chip--yellow' };
            return { label, text: 'Current', cls: 'dp-chip--green' };
        }

        chips.push(dateChip('Inspection', t.annualInspDate));
        chips.push(dateChip('Registration', t.registrationExp));
        chips.push(dateChip('Insurance', t.insuranceExp));

        const statusCls = t.status === 'active' ? 'dp-chip--green' : t.status === 'maintenance' ? 'dp-chip--yellow' : 'dp-chip--red';
        chips.push({ label: 'Status', text: statusLabel(t.status || 'active'), cls: statusCls });

        if (t.doNotDispatch) chips.unshift({ label: 'DND', text: 'Do Not Dispatch', cls: 'dp-chip--red' });

        bar.innerHTML = chips.map(c =>
            `<span class="${c.cls} dp-chip"><span class="dp-chip-dot"></span>${escapeHtml(c.label)}: ${escapeHtml(c.text)}</span>`
        ).join('');
    }

    async function loadTruckPanelHistory() {
        if (!truckPanelId) return;
        try {
            const snap = await db.collection('users').doc(state.user.uid)
                .collection('trucks').doc(truckPanelId)
                .collection('history').orderBy('createdAt', 'desc').limit(50).get();
            const items = [];
            snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
            renderTruckPanelNotes(items);
        } catch (err) { console.error('loadTruckPanelHistory error:', err); }
    }

    function renderTruckPanelNotes(items) {
        const container = $('truckNotesFeed');
        const badge = $('truckNoteCount');
        if (!container) return;
        if (badge) badge.textContent = items.length || '';
        if (!items.length) { container.innerHTML = '<p class="dp-empty">No activity yet. Post a note above.</p>'; return; }
        container.innerHTML = items.map(n => {
            const ts = n.createdAt?.toDate?.() || (n.createdAtIso ? new Date(n.createdAtIso) : null);
            const timeStr = ts ? ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
            const author = n.createdBy || n.by || '';
            const initial = author.charAt(0).toUpperCase() || 'U';
            const priHtml = (n.priority && n.priority !== 'normal') ? `<span class="dp-note-pri" data-pri="${escapeHtml(n.priority)}">${escapeHtml(n.priority)}</span>` : '';
            return `<div class="dp-note" data-id="${n.id}">
                <div class="dp-note-avi">${initial}</div>
                <div class="dp-note-body">
                    <div class="dp-note-meta"><span class="dp-note-tag" data-type="${escapeHtml(n.type || 'note')}">${escapeHtml(n.type || 'note')}</span>${priHtml}<span class="dp-note-time">${timeStr}</span></div>
                    <div class="dp-note-text">${escapeHtml(n.text || '')}</div>
                    <div class="dp-note-author">${escapeHtml(author)}</div>
                </div>
                <button class="dp-note-del" data-id="${n.id}" title="Delete">\u2715</button>
            </div>`;
        }).join('');
        container.querySelectorAll('.dp-note-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this note?')) return;
                try {
                    await db.collection('users').doc(state.user.uid).collection('trucks').doc(truckPanelId).collection('history').doc(btn.dataset.id).delete();
                    await loadTruckPanelHistory();
                } catch (err) { console.error(err); showMsg('Error deleting note', true); }
            });
        });
    }

    async function loadTruckPanelTasks() {
        if (!truckPanelId) return;
        try {
            const result = await FirebaseDB.getTasks(state.user.uid, 'trucks', truckPanelId, { limit: 20 });
            if (result.success) renderTruckPanelTasks(result.data);
        } catch (err) { console.error('loadTruckPanelTasks error:', err); }
    }

    function renderTruckPanelTasks(tasks) {
        const container = $('truckTasksFeed');
        const badge = $('truckTaskCount');
        if (!container) return;
        const open = tasks.filter(t => t.status && t.status !== 'Resolved');
        if (badge) badge.textContent = open.length || '';
        if (!open.length) { container.innerHTML = '<p class="dp-empty">No open tasks.</p>'; return; }
        const now = new Date();
        container.innerHTML = open.slice(0, 8).map(t => {
            const ts = t.createdAt?.toDate?.() || (t.createdAtIso ? new Date(t.createdAtIso) : null);
            const dateStr = ts ? ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const priHtml = (t.priority && t.priority !== 'normal') ? `<span class="dp-task-pri" data-pri="${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>` : '';
            const dueDate = t.dueDate ? new Date(t.dueDate) : null;
            const overdue = dueDate && dueDate < now && t.status !== 'Resolved';
            return `<div class="dp-task" data-id="${t.id}" data-entity-type="trucks" data-entity-id="${truckPanelId}">
                <div class="dp-task-top"><span class="dp-task-type">${escapeHtml(t.type || 'note')}</span>${priHtml}${overdue ? '<span class="dp-task-overdue">OVERDUE</span>' : ''}</div>
                <div class="dp-task-text">${escapeHtml(t.text || '')}</div>
                <div class="dp-task-bot">
                    <span class="dp-task-date">${dateStr}</span>
                    <select class="dp-task-status-select" data-task-id="${t.id}"><option value="Open"${t.status === 'Open' ? ' selected' : ''}>Open</option><option value="In Progress"${t.status === 'In Progress' ? ' selected' : ''}>In Progress</option><option value="Resolved"${t.status === 'Resolved' ? ' selected' : ''}>Resolved</option></select>
                    <button class="dp-task-resolve" data-task-id="${t.id}" title="Mark resolved">âœ“</button>
                </div>
            </div>`;
        }).join('');
    }

    async function truckPanelPostCompose() {
        const textarea = $('truckNoteText');
        const postBtn = $('truckNotePost');
        const compose = textarea?.closest('.dp-compose');
        const text = textarea?.value?.trim();
        if (!text || !truckPanelId) return;
        const type = $('truckNoteType')?.value || 'note';
        const priority = $('truckNotePriority')?.value || 'normal';
        postBtn.disabled = true;
        postBtn.classList.add('posting');
        try {
            const t = state.trucks.find(x => x.id === truckPanelId);
            const taskData = {
                text, type, status: 'Open', priority, assignedTo: [], dueDate: null,
                createdBy: state.user.email || state.user.uid, source: 'truck-panel',
                truckName: t ? t.unit : truckPanelId, createdAtIso: new Date().toISOString()
            };
            const result = await FirebaseDB.createTask(state.user.uid, 'trucks', truckPanelId, taskData);
            if (!result.success) throw new Error(result.error);
            textarea.value = ''; textarea.style.height = 'auto';
            $('truckNoteType').value = 'note'; $('truckNotePriority').value = 'normal';
            postBtn.disabled = true;
            if (compose) { compose.classList.add('posted'); setTimeout(() => compose.classList.remove('posted'), 600); }
            await Promise.all([loadTruckPanelHistory(), loadTruckPanelTasks()]);
        } catch (err) { console.error(err); showMsg('Could not post. ' + (err.message || ''), true); }
        finally { postBtn.classList.remove('posting'); postBtn.disabled = !textarea.value.trim(); }
    }

    function initTruckDetailPanel() {
        $('truckDetailCloseBtn').addEventListener('click', closeTruckDetailPanel);
        $('truckDetailBackdrop').addEventListener('click', closeTruckDetailPanel);
        $('truckDetailSaveBtn').addEventListener('click', saveTruckFromPanel);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && truckPanelOpen) closeTruckDetailPanel();
        });

        document.querySelectorAll('#detailTruckInfo .detail-field-input').forEach(inp => {
            inp.addEventListener('blur', () => {
                inp.closest('.detail-field')?.classList.toggle('has-value', !!inp.value);
                autoSaveTruckField();
            });
        });

        // Doc grid events
        const grid = $('truckDocGrid');
        if (grid) {
            grid.addEventListener('change', async (e) => {
                const input = e.target.closest('input[type="file"]');
                if (!input || !input.files[0]) return;
                let entityId = input.dataset.truck;
                const docType = input.dataset.type;
                const file = input.files[0];
                if (!truckPanelId || entityId === '__new__') {
                    const payload = getTruckPanelPayload();
                    if (!payload.unit) { showMsg('Enter at least a unit # before uploading', true); $('tpUnit').focus(); input.value = ''; return; }
                    try {
                        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        const ref = await col('trucks').add(payload);
                        truckPanelId = ref.id; entityId = ref.id;
                        $('detailTruckName').textContent = payload.unit;
                        $('truckDetailPanel').classList.remove('is-create');
                        await loadTrucks(); populateTruckDropdown(); updateOverview(); renderTrucks();
                    } catch (err) { console.error(err); showMsg('Error saving truck', true); input.value = ''; return; }
                }
                const replaceDocId = input.dataset.replaceDoc;
                const replacePath = input.dataset.replacePath;
                if (replaceDocId && replacePath) await deleteTruckDoc(entityId, replaceDocId, replacePath);
                await uploadTruckDoc(entityId, file, docType);
                input.value = '';
                const docs = await loadTruckDocs(entityId);
                renderTruckDocGrid(docs, entityId);
            });
            grid.addEventListener('click', async (e) => {
                const btn = e.target.closest('.doc-slot-delete');
                if (!btn) return;
                if (!confirm('Delete this document?')) return;
                await deleteTruckDoc(btn.dataset.truck, btn.dataset.docId, btn.dataset.path);
                const docs = await loadTruckDocs(btn.dataset.truck);
                renderTruckDocGrid(docs, btn.dataset.truck);
            });
        }

        // Compose
        const noteText = $('truckNoteText');
        const notePost = $('truckNotePost');
        if (noteText && notePost) {
            noteText.addEventListener('input', () => {
                noteText.style.height = 'auto'; noteText.style.height = noteText.scrollHeight + 'px';
                notePost.disabled = !noteText.value.trim();
            });
            notePost.addEventListener('click', truckPanelPostCompose);
        }

        // Task interaction wiring
        const truckTaskFeed = $('truckTasksFeed');
        if (truckTaskFeed) {
            truckTaskFeed.addEventListener('change', async (e) => {
                const sel = e.target.closest('.dp-task-status-select');
                if (!sel || !truckPanelId) return;
                const taskId = sel.dataset.taskId;
                const newStatus = sel.value;
                try {
                    const result = await FirebaseDB.updateTaskStatus(state.user.uid, 'trucks', truckPanelId, taskId, newStatus);
                    if (!result.success) throw new Error(result.error);
                    showMsg('Status updated');
                    await Promise.all([loadTruckPanelTasks(), loadTruckPanelHistory()]);
                } catch (err) { console.error(err); showMsg('Error updating status', true); }
            });
            truckTaskFeed.addEventListener('click', async (e) => {
                const btn = e.target.closest('.dp-task-resolve');
                if (!btn || !truckPanelId) return;
                const taskId = btn.dataset.taskId;
                try {
                    const result = await FirebaseDB.resolveTask(state.user.uid, 'trucks', truckPanelId, taskId, '', state.user.email || state.user.uid);
                    if (!result.success) throw new Error(result.error);
                    showMsg('Task resolved');
                    await Promise.all([loadTruckPanelTasks(), loadTruckPanelHistory()]);
                } catch (err) { console.error(err); showMsg('Error resolving task', true); }
            });
        }

        // Collapsible toggles
        document.querySelectorAll('#truckDetailPanel .dp-section-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = document.getElementById(btn.dataset.target);
                if (!section) return;
                const collapsed = section.classList.toggle('collapsed');
                btn.setAttribute('aria-expanded', String(!collapsed));
            });
        });

        // Quick actions
        const oosBtn = $('tpActionOOS');
        if (oosBtn) oosBtn.addEventListener('click', async () => {
            if (!truckPanelId) return;
            const t = state.trucks.find(x => x.id === truckPanelId);
            const newStatus = t?.status === 'inactive' ? 'active' : 'inactive';
            try {
                await col('trucks').doc(truckPanelId).update({ status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                if (t) t.status = newStatus;
                $('tpStatus').value = newStatus;
                const statusEl = $('detailTruckStatus');
                statusEl.className = 'status-badge ' + newStatus;
                statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(newStatus);
                renderTruckPanelSummary(); renderTrucks(); updateOverview();
                showMsg('Truck marked ' + statusLabel(newStatus));
            } catch (err) { console.error(err); showMsg('Error updating status', true); }
        });

        const maintBtn = $('tpActionMaint');
        if (maintBtn) maintBtn.addEventListener('click', async () => {
            if (!truckPanelId) return;
            const t = state.trucks.find(x => x.id === truckPanelId);
            const newStatus = t?.status === 'maintenance' ? 'active' : 'maintenance';
            try {
                await col('trucks').doc(truckPanelId).update({ status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                if (t) t.status = newStatus;
                $('tpStatus').value = newStatus;
                const statusEl = $('detailTruckStatus');
                statusEl.className = 'status-badge ' + newStatus;
                statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(newStatus);
                renderTruckPanelSummary(); renderTrucks(); updateOverview();
                showMsg('Truck marked ' + statusLabel(newStatus));
            } catch (err) { console.error(err); showMsg('Error updating status', true); }
        });

        const dndBtn = $('tpActionDND');
        if (dndBtn) dndBtn.addEventListener('click', () => toggleTruckDND());
        const dndToggle = $('tpDNDToggle');
        if (dndToggle) dndToggle.addEventListener('change', () => toggleTruckDND());
    }

    // ── Trailer Detail Panel (slide-out) ────────
    let trailerPanelId = null;
    let trailerPanelOpen = false;

    const TRAILER_DOC_TYPES = ['registration', 'insurance', 'inspection', 'title', 'lease', 'photo', 'other'];
    const TRAILER_DOC_LABELS = {
        registration: 'Registration', insurance: 'Insurance', inspection: 'Inspection',
        title: 'Title', lease: 'Lease', photo: 'Photo', other: 'Other'
    };

    function trailerStoragePath(trailerId, fileName) {
        return `users/${uid()}/trailers/${trailerId}/docs/${Date.now()}_${fileName}`;
    }

    async function uploadTrailerDoc(trailerId, file, docType) {
        if (file.size > MAX_DOC_SIZE) { showMsg('File too large (max 10 MB)', true); return null; }
        const path = trailerStoragePath(trailerId, file.name);
        const ref = storage.ref(path);
        try {
            await ref.put(file);
            const url = await ref.getDownloadURL();
            const docEntry = { name: file.name, type: docType, storagePath: path, url, size: file.size, contentType: file.type, uploadedAt: new Date().toISOString() };
            await col('trailers').doc(trailerId).collection('documents').add(docEntry);
            showMsg('Document uploaded');
            return docEntry;
        } catch (err) { console.error('Upload error:', err); showMsg('Upload failed', true); return null; }
    }

    async function deleteTrailerDoc(trailerId, docId, storagePath) {
        try { await storage.ref(storagePath).delete(); } catch (err) { if (err.code !== 'storage/object-not-found') console.warn(err); }
        await col('trailers').doc(trailerId).collection('documents').doc(docId).delete();
        showMsg('Document removed');
    }

    async function loadTrailerDocs(trailerId) {
        const snap = await col('trailers').doc(trailerId).collection('documents').orderBy('uploadedAt', 'desc').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    function renderTrailerDocGrid(docs, trailerId) {
        const grid = $('trailerDocGrid');
        if (!grid) return;
        const docsByType = {};
        docs.forEach(d => {
            if (!docsByType[d.type]) docsByType[d.type] = [];
            docsByType[d.type].push(d);
        });
        grid.innerHTML = TRAILER_DOC_TYPES.map(type => {
            const label = TRAILER_DOC_LABELS[type] || type;
            const typeDocs = docsByType[type] || [];
            const hasDoc = typeDocs.length > 0;
            const statusBadgeHtml = hasDoc
                ? '<span class="detail-doc-slot-status uploaded">Uploaded</span>'
                : '<span class="detail-doc-slot-status missing">Missing</span>';
            let bodyHtml;
            if (hasDoc) {
                bodyHtml = typeDocs.map(doc => {
                    const isImage = doc.contentType && doc.contentType.startsWith('image/');
                    const sizeStr = doc.size ? (doc.size < 1024 ? doc.size + ' B' : (doc.size / 1024).toFixed(0) + ' KB') : '';
                    const thumb = isImage ? `<img src="${escapeHtml(doc.url)}" alt="" class="detail-doc-thumb" loading="lazy">` : '';
                    return `<div class="detail-doc-file">
                        ${thumb}
                        <div class="detail-doc-file-info">
                            <span class="detail-doc-file-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</span>
                            <span class="detail-doc-file-meta">${sizeStr}</span>
                        </div>
                        <div class="detail-doc-file-actions">
                            <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener" title="View / Download">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </a>
                            <label class="doc-slot-replace" title="Replace" tabindex="0">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" data-trailer="${trailerId}" data-type="${type}" data-replace-doc="${doc.id}" data-replace-path="${escapeHtml(doc.storagePath)}" hidden>
                            </label>
                            <button type="button" class="doc-slot-delete" title="Delete" data-trailer="${trailerId}" data-doc-id="${doc.id}" data-path="${escapeHtml(doc.storagePath)}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>`;
                }).join('');
            } else {
                bodyHtml = `<label class="detail-doc-upload-prompt" tabindex="0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload ${escapeHtml(label)}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" data-trailer="${trailerId}" data-type="${type}" hidden>
                </label>`;
            }
            return `<div class="detail-doc-slot" data-doc-type="${type}">
                <div class="detail-doc-slot-header">
                    <span class="detail-doc-slot-label">${escapeHtml(label)}</span>
                    ${statusBadgeHtml}
                </div>
                <div class="detail-doc-slot-body">${bodyHtml}</div>
            </div>`;
        }).join('');
    }

    function openTrailerDetailPanel(id) {
        const isCreate = !id;
        const t = isCreate ? {} : state.trailers.find(x => x.id === id);
        if (!isCreate && !t) return;
        trailerPanelId = id || null;

        const name = isCreate ? 'New Trailer' : (t.unit || 'Unnamed Trailer');
        $('detailTrailerName').textContent = name;
        const statusEl = $('detailTrailerStatus');
        if (isCreate) { statusEl.style.display = 'none'; }
        else {
            statusEl.style.display = '';
            statusEl.className = 'status-badge ' + (t.status || 'active');
            statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(t.status || 'active');
        }

        // DND badge + button
        const dndBadge = $('detailTrailerDNDBadge');
        if (dndBadge) dndBadge.classList.toggle('hidden', isCreate || !t.doNotDispatch);
        const dndBtn = $('ttpActionDND');
        if (dndBtn) {
            dndBtn.classList.toggle('hidden', isCreate || !t.doNotDispatch || !canToggleDND());
            if (!isCreate) updateTrailerDNDVisuals(t);
        }
        const dndField = $('ttpDNDField');
        const dndToggle = $('ttpDNDToggle');
        if (dndField && dndToggle) {
            dndField.classList.toggle('hidden', isCreate || !t.doNotDispatch || !canToggleDND());
            dndToggle.checked = !!t.doNotDispatch;
            $('ttpDNDLabel').textContent = t.doNotDispatch ? 'Active' : 'Off';
        }

        $('ttpUnit').value = t.unit || '';
        $('ttpStatus').value = t.status || 'active';
        $('ttpYear').value = t.year || '';
        $('ttpMake').value = t.make || '';
        $('ttpType').value = t.type || 'dry-van';
        $('ttpVin').value = t.vin || '';
        $('ttpPlate').value = t.plate || '';
        $('ttpPlateState').value = t.plateState || '';
        $('ttpAnnualInspDate').value = t.annualInspDate || '';
        $('ttpRegistrationExp').value = t.registrationExp || '';
        $('ttpInsuranceExp').value = t.insuranceExp || '';
        $('ttpNotes').value = t.notes || '';

        document.querySelectorAll('#detailTrailerInfo .detail-field-input').forEach(inp => {
            inp.closest('.detail-field')?.classList.toggle('has-value', !!inp.value);
        });

        // Docs
        const docGrid = $('trailerDocGrid');
        if (docGrid) {
            if (!isCreate && id) {
                renderTrailerDocGrid([], id);
                loadTrailerDocs(id).then(docs => renderTrailerDocGrid(docs, id));
            } else { renderTrailerDocGrid([], '__new__'); }
        }

        const panel = $('trailerDetailPanel');
        panel.classList.toggle('is-create', isCreate);

        // Section collapse states
        const infoSec = $('trailerInfoSection');
        const composeSec = $('trailerComposeSection');
        const tasksSec = $('trailerTasksSection');
        const feedSec = $('trailerFeedSection');
        const docsSec = $('trailerDocsSection');
        if (isCreate) {
            infoSec?.classList.remove('collapsed');
            composeSec?.classList.add('collapsed');
            tasksSec?.classList.add('collapsed');
            feedSec?.classList.add('collapsed');
            docsSec?.classList.add('collapsed');
        } else {
            infoSec?.classList.add('collapsed');
            composeSec?.classList.remove('collapsed');
            tasksSec?.classList.remove('collapsed');
            feedSec?.classList.remove('collapsed');
            docsSec?.classList.add('collapsed');
        }

        $('trailerDetailBackdrop').classList.remove('hidden');
        panel.classList.remove('hidden');
        trailerPanelOpen = true;

        document.querySelectorAll('#trailersTableBody tr.detail-active').forEach(r => r.classList.remove('detail-active'));
        if (id) {
            const activeRow = document.querySelector(`#trailersTableBody tr[data-id="${id}"]`);
            if (activeRow) activeRow.classList.add('detail-active');
        }

        if (isCreate) setTimeout(() => $('ttpUnit').focus(), 100);

        renderTrailerPanelSummary();

        // Load feeds
        const notesFeed = $('trailerNotesFeed');
        const tasksFeed = $('trailerTasksFeed');
        if (notesFeed) notesFeed.innerHTML = '<p class="dp-empty">Loading\u2026</p>';
        if (tasksFeed) tasksFeed.innerHTML = '<p class="dp-empty">Loading\u2026</p>';
        $('trailerNoteCount').textContent = '';
        $('trailerTaskCount').textContent = '';
        const noteText = $('trailerNoteText');
        if (noteText) { noteText.value = ''; noteText.style.height = 'auto'; }
        const notePost = $('trailerNotePost');
        if (notePost) notePost.disabled = true;
        $('trailerNoteType').value = 'note';
        $('trailerNotePriority').value = 'normal';

        if (!isCreate && id) { loadTrailerPanelHistory(); loadTrailerPanelTasks(); }
    }

    function closeTrailerDetailPanel() {
        $('trailerDetailBackdrop').classList.add('hidden');
        $('trailerDetailPanel').classList.add('hidden');
        trailerPanelId = null;
        trailerPanelOpen = false;
        document.querySelectorAll('#trailersTableBody tr.detail-active').forEach(r => r.classList.remove('detail-active'));
    }

    function getTrailerPanelPayload() {
        return {
            unit: $('ttpUnit').value.trim(),
            year: $('ttpYear').value.trim(),
            make: $('ttpMake').value.trim(),
            type: $('ttpType').value,
            vin: $('ttpVin').value.trim(),
            plate: $('ttpPlate').value.trim(),
            plateState: $('ttpPlateState').value.trim().toUpperCase(),
            status: $('ttpStatus').value || 'active',
            annualInspDate: $('ttpAnnualInspDate').value,
            registrationExp: $('ttpRegistrationExp').value,
            insuranceExp: $('ttpInsuranceExp').value,
            notes: $('ttpNotes').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
    }

    async function saveTrailerFromPanel() {
        const payload = getTrailerPanelPayload();
        if (!payload.unit) { showMsg('Unit # is required', true); $('ttpUnit').focus(); return; }
        try {
            if (trailerPanelId) {
                await col('trailers').doc(trailerPanelId).update(payload);
                showMsg('Trailer updated');
            } else {
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                const ref = await col('trailers').add(payload);
                trailerPanelId = ref.id;
                showMsg('Trailer added');
                $('detailTrailerName').textContent = payload.unit;
                $('trailerDetailPanel').classList.remove('is-create');
                const statusEl = $('detailTrailerStatus');
                statusEl.style.display = '';
                statusEl.className = 'status-badge ' + payload.status;
                statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(payload.status);
                renderTrailerDocGrid([], trailerPanelId);
            }
            await loadTrailers();
            updateOverview();
            renderTrailers();
        } catch (err) { console.error('Save trailer panel error:', err); showMsg('Error saving trailer', true); }
    }

    async function autoSaveTrailerField() {
        if (!trailerPanelId) return;
        try { await col('trailers').doc(trailerPanelId).update(getTrailerPanelPayload()); } catch (e) { console.error(e); }
    }

    async function toggleTrailerDND() {
        if (!trailerPanelId || !canToggleDND()) return;
        const t = state.trailers.find(x => x.id === trailerPanelId);
        if (!t) return;
        const newDnd = !t.doNotDispatch;
        const action = newDnd ? 'place on' : 'remove from';
        if (!confirm(`Are you sure you want to ${action} Do Not Dispatch for trailer ${t.unit}?`)) {
            const toggle = $('ttpDNDToggle');
            if (toggle) toggle.checked = !!t.doNotDispatch;
            return;
        }
        try {
            await col('trailers').doc(trailerPanelId).update({
                doNotDispatch: newDnd, dndSetBy: state.user.email || '', dndSetAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            t.doNotDispatch = newDnd;
            updateTrailerDNDVisuals(t);
            const toggle = $('ttpDNDToggle');
            if (toggle) toggle.checked = newDnd;
            const dndField = $('ttpDNDField');
            if (dndField) dndField.classList.toggle('hidden', !newDnd);
            $('ttpDNDLabel').textContent = newDnd ? 'Active' : 'Off';
            renderTrailers();
            renderTrailerPanelSummary();
            showMsg(newDnd ? 'Trailer placed on Do Not Dispatch' : 'Do Not Dispatch removed');
            try {
                await col('trailers').doc(trailerPanelId).collection('history').add({
                    type: 'system', text: newDnd ? 'Placed on Do Not Dispatch' : 'Removed from Do Not Dispatch',
                    by: state.user.email || 'Unknown', createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                loadTrailerPanelHistory();
            } catch (e) { console.error(e); }
        } catch (err) {
            console.error(err);
            const toggle = $('ttpDNDToggle');
            if (toggle) toggle.checked = !!t.doNotDispatch;
            showMsg('Error updating Do Not Dispatch', true);
        }
    }

    function updateTrailerDNDVisuals(t) {
        const dndBtn = $('ttpActionDND');
        if (dndBtn) {
            if (t.doNotDispatch) { dndBtn.classList.add('dp-qaction--active'); dndBtn.querySelector('span:last-child').textContent = 'Remove DND'; dndBtn.title = 'Remove Do Not Dispatch'; }
            else { dndBtn.classList.remove('dp-qaction--active'); dndBtn.querySelector('span:last-child').textContent = 'DND'; dndBtn.title = 'Do Not Dispatch'; }
        }
        const badge = $('detailTrailerDNDBadge');
        if (badge) badge.classList.toggle('hidden', !t.doNotDispatch);
    }

    function renderTrailerPanelSummary() {
        const bar = $('trailerSummaryBar');
        if (!bar || !trailerPanelId) { if (bar) bar.innerHTML = ''; return; }
        const t = state.trailers.find(x => x.id === trailerPanelId);
        if (!t) { bar.innerHTML = ''; return; }
        const chips = [];
        const now = new Date();
        const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        function dateChip(label, dateStr) {
            if (!dateStr) return { label, text: 'N/A', cls: 'dp-chip--gray' };
            const dt = new Date(dateStr);
            if (dt < now) return { label, text: 'Expired', cls: 'dp-chip--red' };
            if (dt < soon) return { label, text: 'Due soon', cls: 'dp-chip--yellow' };
            return { label, text: 'Current', cls: 'dp-chip--green' };
        }

        chips.push(dateChip('Inspection', t.annualInspDate));
        chips.push(dateChip('Registration', t.registrationExp));
        chips.push(dateChip('Insurance', t.insuranceExp));

        const statusCls = t.status === 'active' ? 'dp-chip--green' : t.status === 'maintenance' ? 'dp-chip--yellow' : 'dp-chip--red';
        chips.push({ label: 'Status', text: statusLabel(t.status || 'active'), cls: statusCls });

        if (t.doNotDispatch) chips.unshift({ label: 'DND', text: 'Do Not Dispatch', cls: 'dp-chip--red' });

        bar.innerHTML = chips.map(c =>
            `<span class="${c.cls} dp-chip"><span class="dp-chip-dot"></span>${escapeHtml(c.label)}: ${escapeHtml(c.text)}</span>`
        ).join('');
    }

    async function loadTrailerPanelHistory() {
        if (!trailerPanelId) return;
        try {
            const snap = await db.collection('users').doc(state.user.uid)
                .collection('trailers').doc(trailerPanelId)
                .collection('history').orderBy('createdAt', 'desc').limit(50).get();
            const items = [];
            snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
            renderTrailerPanelNotes(items);
        } catch (err) { console.error('loadTrailerPanelHistory error:', err); }
    }

    function renderTrailerPanelNotes(items) {
        const container = $('trailerNotesFeed');
        const badge = $('trailerNoteCount');
        if (!container) return;
        if (badge) badge.textContent = items.length || '';
        if (!items.length) { container.innerHTML = '<p class="dp-empty">No activity yet. Post a note above.</p>'; return; }
        container.innerHTML = items.map(n => {
            const ts = n.createdAt?.toDate?.() || (n.createdAtIso ? new Date(n.createdAtIso) : null);
            const timeStr = ts ? ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
            const author = n.createdBy || n.by || '';
            const initial = author.charAt(0).toUpperCase() || 'U';
            const priHtml = (n.priority && n.priority !== 'normal') ? `<span class="dp-note-pri" data-pri="${escapeHtml(n.priority)}">${escapeHtml(n.priority)}</span>` : '';
            return `<div class="dp-note" data-id="${n.id}">
                <div class="dp-note-avi">${initial}</div>
                <div class="dp-note-body">
                    <div class="dp-note-meta"><span class="dp-note-tag" data-type="${escapeHtml(n.type || 'note')}">${escapeHtml(n.type || 'note')}</span>${priHtml}<span class="dp-note-time">${timeStr}</span></div>
                    <div class="dp-note-text">${escapeHtml(n.text || '')}</div>
                    <div class="dp-note-author">${escapeHtml(author)}</div>
                </div>
                <button class="dp-note-del" data-id="${n.id}" title="Delete">\u2715</button>
            </div>`;
        }).join('');
        container.querySelectorAll('.dp-note-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this note?')) return;
                try {
                    await db.collection('users').doc(state.user.uid).collection('trailers').doc(trailerPanelId).collection('history').doc(btn.dataset.id).delete();
                    await loadTrailerPanelHistory();
                } catch (err) { console.error(err); showMsg('Error deleting note', true); }
            });
        });
    }

    async function loadTrailerPanelTasks() {
        if (!trailerPanelId) return;
        try {
            const result = await FirebaseDB.getTasks(state.user.uid, 'trailers', trailerPanelId, { limit: 20 });
            if (result.success) renderTrailerPanelTasks(result.data);
        } catch (err) { console.error('loadTrailerPanelTasks error:', err); }
    }

    function renderTrailerPanelTasks(tasks) {
        const container = $('trailerTasksFeed');
        const badge = $('trailerTaskCount');
        if (!container) return;
        const open = tasks.filter(t => t.status && t.status !== 'Resolved');
        if (badge) badge.textContent = open.length || '';
        if (!open.length) { container.innerHTML = '<p class="dp-empty">No open tasks.</p>'; return; }
        const now = new Date();
        container.innerHTML = open.slice(0, 8).map(t => {
            const ts = t.createdAt?.toDate?.() || (t.createdAtIso ? new Date(t.createdAtIso) : null);
            const dateStr = ts ? ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const priHtml = (t.priority && t.priority !== 'normal') ? `<span class="dp-task-pri" data-pri="${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>` : '';
            const dueDate = t.dueDate ? new Date(t.dueDate) : null;
            const overdue = dueDate && dueDate < now && t.status !== 'Resolved';
            return `<div class="dp-task" data-id="${t.id}" data-entity-type="trailers" data-entity-id="${trailerPanelId}">
                <div class="dp-task-top"><span class="dp-task-type">${escapeHtml(t.type || 'note')}</span>${priHtml}${overdue ? '<span class="dp-task-overdue">OVERDUE</span>' : ''}</div>
                <div class="dp-task-text">${escapeHtml(t.text || '')}</div>
                <div class="dp-task-bot">
                    <span class="dp-task-date">${dateStr}</span>
                    <select class="dp-task-status-select" data-task-id="${t.id}"><option value="Open"${t.status === 'Open' ? ' selected' : ''}>Open</option><option value="In Progress"${t.status === 'In Progress' ? ' selected' : ''}>In Progress</option><option value="Resolved"${t.status === 'Resolved' ? ' selected' : ''}>Resolved</option></select>
                    <button class="dp-task-resolve" data-task-id="${t.id}" title="Mark resolved">âœ“</button>
                </div>
            </div>`;
        }).join('');
    }

    async function trailerPanelPostCompose() {
        const textarea = $('trailerNoteText');
        const postBtn = $('trailerNotePost');
        const compose = textarea?.closest('.dp-compose');
        const text = textarea?.value?.trim();
        if (!text || !trailerPanelId) return;
        const type = $('trailerNoteType')?.value || 'note';
        const priority = $('trailerNotePriority')?.value || 'normal';
        postBtn.disabled = true;
        postBtn.classList.add('posting');
        try {
            const t = state.trailers.find(x => x.id === trailerPanelId);
            const taskData = {
                text, type, status: 'Open', priority, assignedTo: [], dueDate: null,
                createdBy: state.user.email || state.user.uid, source: 'trailer-panel',
                trailerName: t ? t.unit : trailerPanelId, createdAtIso: new Date().toISOString()
            };
            const result = await FirebaseDB.createTask(state.user.uid, 'trailers', trailerPanelId, taskData);
            if (!result.success) throw new Error(result.error);
            textarea.value = ''; textarea.style.height = 'auto';
            $('trailerNoteType').value = 'note'; $('trailerNotePriority').value = 'normal';
            postBtn.disabled = true;
            if (compose) { compose.classList.add('posted'); setTimeout(() => compose.classList.remove('posted'), 600); }
            await Promise.all([loadTrailerPanelHistory(), loadTrailerPanelTasks()]);
        } catch (err) { console.error(err); showMsg('Could not post. ' + (err.message || ''), true); }
        finally { postBtn.classList.remove('posting'); postBtn.disabled = !textarea.value.trim(); }
    }

    function initTrailerDetailPanel() {
        $('trailerDetailCloseBtn').addEventListener('click', closeTrailerDetailPanel);
        $('trailerDetailBackdrop').addEventListener('click', closeTrailerDetailPanel);
        $('trailerDetailSaveBtn').addEventListener('click', saveTrailerFromPanel);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && trailerPanelOpen) closeTrailerDetailPanel();
        });

        document.querySelectorAll('#detailTrailerInfo .detail-field-input').forEach(inp => {
            inp.addEventListener('blur', () => {
                inp.closest('.detail-field')?.classList.toggle('has-value', !!inp.value);
                autoSaveTrailerField();
            });
        });

        // Doc grid events
        const grid = $('trailerDocGrid');
        if (grid) {
            grid.addEventListener('change', async (e) => {
                const input = e.target.closest('input[type="file"]');
                if (!input || !input.files[0]) return;
                let entityId = input.dataset.trailer;
                const docType = input.dataset.type;
                const file = input.files[0];
                if (!trailerPanelId || entityId === '__new__') {
                    const payload = getTrailerPanelPayload();
                    if (!payload.unit) { showMsg('Enter at least a unit # before uploading', true); $('ttpUnit').focus(); input.value = ''; return; }
                    try {
                        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        const ref = await col('trailers').add(payload);
                        trailerPanelId = ref.id; entityId = ref.id;
                        $('detailTrailerName').textContent = payload.unit;
                        $('trailerDetailPanel').classList.remove('is-create');
                        await loadTrailers(); updateOverview(); renderTrailers();
                    } catch (err) { console.error(err); showMsg('Error saving trailer', true); input.value = ''; return; }
                }
                const replaceDocId = input.dataset.replaceDoc;
                const replacePath = input.dataset.replacePath;
                if (replaceDocId && replacePath) await deleteTrailerDoc(entityId, replaceDocId, replacePath);
                await uploadTrailerDoc(entityId, file, docType);
                input.value = '';
                const docs = await loadTrailerDocs(entityId);
                renderTrailerDocGrid(docs, entityId);
            });
            grid.addEventListener('click', async (e) => {
                const btn = e.target.closest('.doc-slot-delete');
                if (!btn) return;
                if (!confirm('Delete this document?')) return;
                await deleteTrailerDoc(btn.dataset.trailer, btn.dataset.docId, btn.dataset.path);
                const docs = await loadTrailerDocs(btn.dataset.trailer);
                renderTrailerDocGrid(docs, btn.dataset.trailer);
            });
        }

        // Compose
        const noteText = $('trailerNoteText');
        const notePost = $('trailerNotePost');
        if (noteText && notePost) {
            noteText.addEventListener('input', () => {
                noteText.style.height = 'auto'; noteText.style.height = noteText.scrollHeight + 'px';
                notePost.disabled = !noteText.value.trim();
            });
            notePost.addEventListener('click', trailerPanelPostCompose);
        }

        // Task interaction wiring
        const trailerTaskFeed = $('trailerTasksFeed');
        if (trailerTaskFeed) {
            trailerTaskFeed.addEventListener('change', async (e) => {
                const sel = e.target.closest('.dp-task-status-select');
                if (!sel || !trailerPanelId) return;
                const taskId = sel.dataset.taskId;
                const newStatus = sel.value;
                try {
                    const result = await FirebaseDB.updateTaskStatus(state.user.uid, 'trailers', trailerPanelId, taskId, newStatus);
                    if (!result.success) throw new Error(result.error);
                    showMsg('Status updated');
                    await Promise.all([loadTrailerPanelTasks(), loadTrailerPanelHistory()]);
                } catch (err) { console.error(err); showMsg('Error updating status', true); }
            });
            trailerTaskFeed.addEventListener('click', async (e) => {
                const btn = e.target.closest('.dp-task-resolve');
                if (!btn || !trailerPanelId) return;
                const taskId = btn.dataset.taskId;
                try {
                    const result = await FirebaseDB.resolveTask(state.user.uid, 'trailers', trailerPanelId, taskId, '', state.user.email || state.user.uid);
                    if (!result.success) throw new Error(result.error);
                    showMsg('Task resolved');
                    await Promise.all([loadTrailerPanelTasks(), loadTrailerPanelHistory()]);
                } catch (err) { console.error(err); showMsg('Error resolving task', true); }
            });
        }

        // Collapsible toggles
        document.querySelectorAll('#trailerDetailPanel .dp-section-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = document.getElementById(btn.dataset.target);
                if (!section) return;
                const collapsed = section.classList.toggle('collapsed');
                btn.setAttribute('aria-expanded', String(!collapsed));
            });
        });

        // Quick actions
        const oosBtn = $('ttpActionOOS');
        if (oosBtn) oosBtn.addEventListener('click', async () => {
            if (!trailerPanelId) return;
            const t = state.trailers.find(x => x.id === trailerPanelId);
            const newStatus = t?.status === 'inactive' ? 'active' : 'inactive';
            try {
                await col('trailers').doc(trailerPanelId).update({ status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                if (t) t.status = newStatus;
                $('ttpStatus').value = newStatus;
                const statusEl = $('detailTrailerStatus');
                statusEl.className = 'status-badge ' + newStatus;
                statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(newStatus);
                renderTrailerPanelSummary(); renderTrailers(); updateOverview();
                showMsg('Trailer marked ' + statusLabel(newStatus));
            } catch (err) { console.error(err); showMsg('Error updating status', true); }
        });

        const maintBtn = $('ttpActionMaint');
        if (maintBtn) maintBtn.addEventListener('click', async () => {
            if (!trailerPanelId) return;
            const t = state.trailers.find(x => x.id === trailerPanelId);
            const newStatus = t?.status === 'maintenance' ? 'active' : 'maintenance';
            try {
                await col('trailers').doc(trailerPanelId).update({ status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                if (t) t.status = newStatus;
                $('ttpStatus').value = newStatus;
                const statusEl = $('detailTrailerStatus');
                statusEl.className = 'status-badge ' + newStatus;
                statusEl.innerHTML = '<span class="status-dot"></span>' + statusLabel(newStatus);
                renderTrailerPanelSummary(); renderTrailers(); updateOverview();
                showMsg('Trailer marked ' + statusLabel(newStatus));
            } catch (err) { console.error(err); showMsg('Error updating status', true); }
        });

        const dndBtn = $('ttpActionDND');
        if (dndBtn) dndBtn.addEventListener('click', () => toggleTrailerDND());
        const dndToggle = $('ttpDNDToggle');
        if (dndToggle) dndToggle.addEventListener('change', () => toggleTrailerDND());
    }

    // ── Google Drive Import ─────────────────
    const GDRIVE_CONFIG = {
        clientId: '1019904853500-dgr51js0f2scs3om1l4jocbho85g0ona.apps.googleusercontent.com',
        apiKey: 'AIzaSyDrjI76QLlhLnmX80_XdFaD4QHP32I9QxY',
        scopes: 'https://www.googleapis.com/auth/drive.readonly',
        pickerMimeTypes: [
            'application/vnd.google-apps.spreadsheet',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'text/tab-separated-values'
        ]
    };

    let gdriveTokenClient = null;
    let gdriveAccessToken = null;
    let gdriveReady = false;
    let gdrivePickerCallback = null;

    function initGoogleDriveForImport() {
        if (typeof gapi === 'undefined' || typeof google === 'undefined') {
            // Libraries not loaded yet ” retry a few times
            let attempts = 0;
            const poll = setInterval(() => {
                attempts++;
                if (typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts) {
                    clearInterval(poll);
                    setupGdriveClient();
                } else if (attempts > 50) {
                    clearInterval(poll);
                    console.warn('Google libraries not available ” Drive import disabled');
                }
            }, 200);
        } else {
            setupGdriveClient();
        }
    }

    function setupGdriveClient() {
        gapi.load('client:picker', async () => {
            try {
                await gapi.client.init({ apiKey: GDRIVE_CONFIG.apiKey });
                gdriveTokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: GDRIVE_CONFIG.clientId,
                    scope: GDRIVE_CONFIG.scopes,
                    callback: onGdriveTokenResponse
                });
                gdriveReady = true;
            } catch (err) {
                console.warn('Google Drive init failed:', err);
            }
        });
    }

    function onGdriveTokenResponse(response) {
        if (response.error) {
            showMsg('Google Drive sign-in failed', true);
            return;
        }
        gdriveAccessToken = response.access_token;
        openGooglePicker();
    }

    function pickFileFromGoogleDrive(callback) {
        if (!gdriveReady) {
            showMsg('Google Drive is loading ” try again in a moment', true);
            return;
        }
        gdrivePickerCallback = callback;
        if (gdriveAccessToken) {
            openGooglePicker();
        } else {
            gdriveTokenClient.requestAccessToken({ prompt: '' });
        }
    }

    function openGooglePicker() {
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
            .setMimeTypes(GDRIVE_CONFIG.pickerMimeTypes.join(','))
            .setMode(google.picker.DocsViewMode.LIST);
        const picker = new google.picker.PickerBuilder()
            .setTitle('Select a file to import')
            .setOAuthToken(gdriveAccessToken)
            .setDeveloperKey(GDRIVE_CONFIG.apiKey)
            .addView(view)
            .addView(new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS))
            .setCallback(onPickerAction)
            .build();
        picker.setVisible(true);
    }

    async function onPickerAction(data) {
        console.log('[GDrive] Picker action:', data.action);
        if (data.action !== google.picker.Action.PICKED) return;
        const doc = data.docs[0];
        if (!doc) { console.warn('[GDrive] No doc selected'); return; }
        const fileId = doc.id;
        const fileName = doc.name;
        const mimeType = doc.mimeType;
        console.log('[GDrive] Picked:', fileName, 'MIME:', mimeType, 'ID:', fileId);

        showMsg('Downloading from Google Drive\u2026');

        try {
            let blob;
            if (mimeType === 'application/vnd.google-apps.spreadsheet') {
                // Google Sheets ” export as xlsx
                console.log('[GDrive] Exporting Google Sheet as xlsx');
                const resp = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
                    { headers: { Authorization: 'Bearer ' + gdriveAccessToken } }
                );
                console.log('[GDrive] Export response:', resp.status, resp.statusText);
                if (!resp.ok) {
                    const errText = await resp.text();
                    console.error('[GDrive] Export error body:', errText);
                    throw new Error('Export failed: ' + resp.status);
                }
                blob = await resp.blob();
                console.log('[GDrive] Blob size:', blob.size, 'type:', blob.type);
                const file = new File([blob], fileName + '.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                if (gdrivePickerCallback) gdrivePickerCallback(file);
                else console.warn('[GDrive] No callback set!');
            } else {
                // Regular file ” download directly
                console.log('[GDrive] Downloading file directly');
                const resp = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
                    { headers: { Authorization: 'Bearer ' + gdriveAccessToken } }
                );
                console.log('[GDrive] Download response:', resp.status, resp.statusText);
                if (!resp.ok) {
                    const errText = await resp.text();
                    console.error('[GDrive] Download error body:', errText);
                    throw new Error('Download failed: ' + resp.status);
                }
                blob = await resp.blob();
                console.log('[GDrive] Blob size:', blob.size, 'type:', blob.type);
                const file = new File([blob], fileName, { type: mimeType || 'application/octet-stream' });
                if (gdrivePickerCallback) gdrivePickerCallback(file);
                else console.warn('[GDrive] No callback set!');
            }
        } catch (err) {
            console.error('[GDrive] Download error:', err);
            showMsg('Failed to download file from Google Drive', true);
        }
    }

    // ── Import Dropdown Helper ──
    function showImportDropdown(anchorBtn, smartImportFn) {
        // Close any existing dropdown
        document.querySelectorAll('.import-dropdown').forEach(d => d.remove());

        const rect = anchorBtn.getBoundingClientRect();
        const dropdown = document.createElement('div');
        dropdown.className = 'import-dropdown';
        dropdown.innerHTML = `
            <button class="import-dropdown-item" data-source="file">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                From File
            </button>
            <button class="import-dropdown-item" data-source="gdrive">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2L2 19.5h20L12 2z"/><path d="M8 19.5L15.5 7"/><path d="M16 19.5L8.5 7"/></svg>
                From Google Drive
            </button>
        `;

        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        document.body.appendChild(dropdown);

        // "From File" ” trigger local file picker
        dropdown.querySelector('[data-source="file"]').addEventListener('click', () => {
            dropdown.remove();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,.tsv,.txt,.xlsx,.xls';
            input.addEventListener('change', (e) => smartImportFn(e.target.files[0]));
            input.click();
        });

        // "From Google Drive" ” open picker
        dropdown.querySelector('[data-source="gdrive"]').addEventListener('click', () => {
            dropdown.remove();
            pickFileFromGoogleDrive((file) => smartImportFn(file));
        });

        // Close on outside click
        const closeHandler = (e) => {
            if (!dropdown.contains(e.target) && e.target !== anchorBtn) {
                dropdown.remove();
                document.removeEventListener('click', closeHandler, true);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
    }

    // ── Smart Import for Trucks ──
    function detectFileType(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const mime = (file.type || '').toLowerCase();
        if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
        if (['xlsx', 'xls'].includes(ext) || mime.includes('spreadsheetml') || mime.includes('ms-excel')) return 'excel';
        if (['csv', 'tsv', 'txt'].includes(ext) || mime.includes('text/') || mime.includes('csv')) return 'csv';
        // Fallback: try to guess from content
        if (mime.includes('octet-stream')) {
            if (['xlsx', 'xls'].includes(ext)) return 'excel';
            if (ext === 'pdf') return 'pdf';
        }
        return ext === 'xlsx' || ext === 'xls' ? 'excel' : 'csv';
    }

    async function parseFileToRows(file, importType) {
        const type = detectFileType(file);
        console.log('[Import] File:', file.name, 'MIME:', file.type, 'Detected:', type, 'Size:', file.size);
        let rows;

        // Primary parser based on detected type
        try {
            if (type === 'pdf') rows = await parsePdfToRows(file);
            else if (type === 'excel') rows = await parseExcelToRows(file, importType);
            else rows = await parseCsvToRows(file);
        } catch (e) { console.warn('[Import] Primary parser failed:', e); }

        console.log('[Import] Primary result:', rows ? rows.length + ' rows' : 'null', rows && rows.length > 0 ? 'Header: ' + JSON.stringify(rows[0]) : '');
        if (rows && rows.length >= 2) return rows;

        // Fallback: try Excel parser (handles xlsx/xls/csv via SheetJS)
        if (type !== 'excel') {
            try {
                console.log('[Import] Falling back to Excel parser');
                rows = await parseExcelToRows(file, importType);
                if (rows && rows.length >= 2) return rows;
            } catch (e) { console.warn('[Import] Excel fallback failed:', e); }
        }

        // Fallback: try CSV parser
        if (type !== 'csv') {
            try {
                console.log('[Import] Falling back to CSV parser');
                rows = await parseCsvToRows(file);
                if (rows && rows.length >= 2) return rows;
            } catch (e) { console.warn('[Import] CSV fallback failed:', e); }
        }

        return rows;
    }

    async function smartImportTrucks(file) {
        if (!file) return;
        showMsg('Reading file…');
        try {
            let rows = await parseFileToRows(file, 'truck');
            if (!rows || rows.length < 2) { showMsg('No data found in file.', true); return; }
            const config = SHEET_CONFIGS.truck;
            const aliases = config.csvAliases || {};

            // Find actual header row (may not be row 0)
            let headerIdx = 0;
            const truckHeaderPat = /^(unit|unitnumber|vin|make|model|year|plate|truck|truckno|trucknumber|vehicle|equipment|fuel|status|no|number|fleet|asset|id)$/i;
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
                const cleaned = rows[i].map(c => (c || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''));
                if (cleaned.filter(h => truckHeaderPat.test(h)).length >= 2) { headerIdx = i; break; }
            }
            const header = rows[headerIdx];
            const dataRows = rows.slice(headerIdx + 1);
            console.log('[Import] Truck header row:', headerIdx, 'Headers:', JSON.stringify(header));

            const colMap = buildSmartColumnMap(header, aliases);
            console.log('[Import] Truck header-based map:', JSON.stringify(colMap));

            // Content-based detection for unmapped columns
            const truckFields = ['unit', 'year', 'make', 'model', 'vin', 'plate', 'plateState', 'fuel', 'status'];
            detectColumnsByContent(dataRows, header, colMap, truckFields);
            console.log('[Import] Truck final map:', JSON.stringify(colMap));

            if (colMap.unit === undefined) {
                console.error('[Import] No unit column found. Headers:', JSON.stringify(header));
                showMsg('Could not find a Unit # column. Make sure your file has a column with truck/unit numbers.', true);
                return;
            }

            const parsed = [];
            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                if (!row || row.every(c => !c || !c.toString().trim())) continue;
                const data = {};
                let hasValue = false;
                const allFields = [...config.cols.map(c => c.key), ...(config.extraFields || [])];
                allFields.forEach(key => {
                    if (colMap[key] !== undefined) {
                        let val = (row[colMap[key]] || '').toString().trim();
                        if (key === 'plateState') val = val.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
                        if (key === 'vin') val = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        if (key === 'year') { const yr = parseInt(val); val = (yr >= 1900 && yr <= 2099) ? yr.toString() : ''; }
                        if (['annualInspDate', 'registrationExp', 'insuranceExp'].includes(key) && val) val = normalizeDate(val);
                        if (key === 'status' && val) {
                            const col = config.cols.find(c => c.key === 'status');
                            if (col?.options) { const m = col.options.find(o => o.value.toLowerCase() === val.toLowerCase() || o.label.toLowerCase() === val.toLowerCase()); val = m ? m.value : 'active'; }
                        }
                        if (key === 'fuel' && val) {
                            const col = config.cols.find(c => c.key === 'fuel');
                            if (col?.options) { const m = col.options.find(o => o.value.toLowerCase() === val.toLowerCase() || o.label.toLowerCase() === val.toLowerCase()); val = m ? m.value : val; }
                        }
                        if (val) { data[key] = val; hasValue = true; }
                    }
                });
                if (hasValue && data.unit) parsed.push(data);
            }
            if (parsed.length === 0) { showMsg('No valid truck rows found', true); return; }

            // VIN verification ” fill/correct make, model, year from NHTSA
            const truckVins = parsed.map(d => d.vin).filter(Boolean);
            if (truckVins.length) {
                showMsg('Verifying ' + truckVins.length + ' VIN' + (truckVins.length > 1 ? 's' : '') + '…');
                try {
                    const vinData = await decodeVINBatch(truckVins);
                    const fixes = applyVINData(parsed, vinData, 'truck');
                    if (fixes) console.log('[VIN] Applied ' + fixes + ' corrections to truck data');
                } catch (e) { console.warn('[VIN] Decode failed, continuing with sheet data:', e); }
            }

            // Open unified sheet with parsed data
            openUnifiedSheet('truck', parsed, { mode: 'import' });
            const extraCount = Object.keys(colMap).filter(k => config.extraFields?.includes(k)).length;
            let msg = parsed.length + ' truck' + (parsed.length > 1 ? 's' : '') + ' imported for review';
            if (extraCount > 0) msg += ' (' + extraCount + ' extra field' + (extraCount > 1 ? 's' : '') + ' mapped)';
            showMsg(msg);
        } catch (err) { console.error('Smart truck import error:', err); showMsg('Error reading file: ' + (err.message || ''), true); }
    }

    // ── Smart Import for Trailers ──
    async function smartImportTrailers(file) {
        if (!file) return;
        showMsg('Reading file…');
        try {
            let rows = await parseFileToRows(file, 'trailer');
            if (!rows || rows.length < 2) { showMsg('No data found in file.', true); return; }
            const config = SHEET_CONFIGS.trailer;
            const aliases = config.csvAliases || {};

            // Find actual header row
            let headerIdx = 0;
            const trailerHeaderPat = /^(unit|unitnumber|vin|make|model|year|plate|trailer|trailerno|trailernumber|type|vehicle|equipment|status|no|number|fleet|asset|id)$/i;
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
                const cleaned = rows[i].map(c => (c || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''));
                if (cleaned.filter(h => trailerHeaderPat.test(h)).length >= 2) { headerIdx = i; break; }
            }
            const header = rows[headerIdx];
            const dataRows = rows.slice(headerIdx + 1);
            console.log('[Import] Trailer header row:', headerIdx, 'Headers:', JSON.stringify(header));

            const colMap = buildSmartColumnMap(header, aliases);
            console.log('[Import] Trailer header-based map:', JSON.stringify(colMap));

            // Content-based detection for unmapped columns
            const trailerFields = ['unit', 'year', 'make', 'vin', 'plate', 'plateState', 'type', 'status'];
            detectColumnsByContent(dataRows, header, colMap, trailerFields);
            console.log('[Import] Trailer final map:', JSON.stringify(colMap));

            if (colMap.unit === undefined) {
                console.error('[Import] No unit column found. Headers:', JSON.stringify(header));
                showMsg('Could not find a Unit # column. Make sure your file has a column with trailer/unit numbers.', true);
                return;
            }

            const parsed = [];
            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                if (!row || row.every(c => !c || !c.toString().trim())) continue;
                const data = {};
                let hasValue = false;
                const allFields = [...config.cols.map(c => c.key), ...(config.extraFields || [])];
                allFields.forEach(key => {
                    if (colMap[key] !== undefined) {
                        let val = (row[colMap[key]] || '').toString().trim();
                        if (key === 'plateState') val = val.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
                        if (key === 'vin') val = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        if (key === 'year') { const yr = parseInt(val); val = (yr >= 1900 && yr <= 2099) ? yr.toString() : ''; }
                        if (['annualInspDate', 'registrationExp', 'insuranceExp'].includes(key) && val) val = normalizeDate(val);
                        if (key === 'status' && val) {
                            const col = config.cols.find(c => c.key === 'status');
                            if (col?.options) { const m = col.options.find(o => o.value.toLowerCase() === val.toLowerCase() || o.label.toLowerCase() === val.toLowerCase()); val = m ? m.value : 'active'; }
                        }
                        if (key === 'type' && val) {
                            // Extract length from combined model/type field (e.g., "53ft Dry Van")
                            const lenMatch = val.match(/(\d+)\s*(?:ft|foot|feet|')/i);
                            if (lenMatch && !data.length) data.length = lenMatch[1] + 'ft';
                            const lv = val.toLowerCase();
                            if (lv.includes('reefer') || lv.includes('refrigerat')) val = 'reefer';
                            else if (lv.includes('dry') && lv.includes('van') || lv.includes('dryvan')) val = 'dry-van';
                            else if (lv.includes('flatbed')) val = 'flatbed';
                            else if (lv.includes('step') && lv.includes('deck')) val = 'step-deck';
                            else if (lv.includes('tanker')) val = 'tanker';
                            else if (lv.includes('lowboy')) val = 'lowboy';
                            else {
                                const col = config.cols.find(c => c.key === 'type');
                                if (col?.options) { const m = col.options.find(o => o.value.toLowerCase() === lv || o.label.toLowerCase() === lv); val = m ? m.value : 'other'; }
                            }
                        }
                        if (val) { data[key] = val; hasValue = true; }
                    }
                });
                if (hasValue && data.unit) parsed.push(data);
            }
            if (parsed.length === 0) { showMsg('No valid trailer rows found', true); return; }

            // VIN verification ” fill/correct make, year, type from NHTSA
            const trailerVins = parsed.map(d => d.vin).filter(Boolean);
            if (trailerVins.length) {
                showMsg('Verifying ' + trailerVins.length + ' VIN' + (trailerVins.length > 1 ? 's' : '') + '…');
                try {
                    const vinData = await decodeVINBatch(trailerVins);
                    const fixes = applyVINData(parsed, vinData, 'trailer');
                    if (fixes) console.log('[VIN] Applied ' + fixes + ' corrections to trailer data');
                } catch (e) { console.warn('[VIN] Decode failed, continuing with sheet data:', e); }
            }

            // Open unified sheet with parsed data
            openUnifiedSheet('trailer', parsed, { mode: 'import' });
            const extraCount = Object.keys(colMap).filter(k => config.extraFields?.includes(k)).length;
            let msg = parsed.length + ' trailer' + (parsed.length > 1 ? 's' : '') + ' imported for review';
            if (extraCount > 0) msg += ' (' + extraCount + ' extra field' + (extraCount > 1 ? 's' : '') + ' mapped)';
            showMsg(msg);
        } catch (err) { console.error('Smart trailer import error:', err); showMsg('Error reading file: ' + (err.message || ''), true); }
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
        $('addTruckBtn').addEventListener('click', () => openUnifiedSheet('truck', null, {mode:'add'}));
        $('addFirstTruck').addEventListener('click', () => openUnifiedSheet('truck', null, {mode:'add'}));
        $('closeTruckModal').addEventListener('click', () => $('truckModal').classList.add('hidden'));
        $('cancelTruck').addEventListener('click', () => $('truckModal').classList.add('hidden'));

        // Import “ show dropdown (File or Google Drive)
        const importBtn = $('importTrucksBtn');
        if (importBtn) {
            importBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showImportDropdown(importBtn, smartImportTrucks);
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
            const payload = normalizePayload({
                unit: $('truckUnit').value.trim(),
                year: $('truckYear').value.trim(),
                make: $('truckMake').value.trim(),
                model: $('truckModel').value.trim(),
                vin: $('truckVin').value.trim(),
                plate: $('truckPlate').value.trim(),
                plateState: $('truckPlateState').value.trim(),
                fuel: $('truckFuel').value,
                status: $('truckStatus').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, 'truck');
            try {
                const editId = $('truckEditId').value;
                if (payload.vin && payload.vin.length === 17) {
                    const dup = await checkDuplicate('trucks', 'vin', payload.vin, editId);
                    if (dup && !confirm('A truck with VIN ' + payload.vin + ' already exists (Unit: ' + (dup.data().unit || '?') + '). Save anyway?')) return;
                }
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

    // ── SMART MULTI-FORMAT DRIVER IMPORT ──
    async function smartImportDrivers(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        showMsg('Reading file…');

        try {
            let rows;
            if (ext === 'pdf') {
                rows = await parsePdfToRows(file);
            } else if (ext === 'xlsx' || ext === 'xls') {
                rows = await parseExcelToRows(file, 'driver');
            } else {
                rows = await parseCsvToRows(file);
            }

            if (!rows || rows.length < 2) {
                showMsg('No data found in file. Need a header row + data rows.', true);
                return;
            }

            const config = SHEET_CONFIGS.driver;
            const aliases = config.csvAliases || {};

            // Find the actual header row (may not be row 0 ” some sheets have title rows)
            let headerIdx = 0;
            const namePatterns = /^(firstname|first|fname|lastname|last|lname|name|fullname|drivername|driver|employee)$/i;
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
                const cleaned = rows[i].map(c => (c || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''));
                if (cleaned.some(h => namePatterns.test(h))) {
                    headerIdx = i;
                    break;
                }
            }
            const header = rows[headerIdx];
            const dataRows = rows.slice(headerIdx + 1);
            console.log('[Import] Header row index:', headerIdx, 'Headers:', JSON.stringify(header));

            // Build column mapping with fuzzy matching
            const colMap = buildSmartColumnMap(header, aliases);
            console.log('[Import] Header-based column map:', JSON.stringify(colMap));

            // Content-based detection: fill in any fields the header matching missed
            const allDriverFields = ['firstName', 'lastName', 'fullName', 'phone', 'email',
                'cdl', 'cdlState', 'cdlClass', 'status', 'dob', 'ssn'];
            detectColumnsByContent(dataRows, header, colMap, allDriverFields);
            console.log('[Import] Final column map:', JSON.stringify(colMap));

            // Resolve name columns
            const hasFullName = colMap.fullName !== undefined;
            const hasFirstName = colMap.firstName !== undefined;
            const hasLastName = colMap.lastName !== undefined;

            if (!hasFirstName && !hasFullName) {
                const nameIdx = header.findIndex(h => /^(name|driver|employee|person)$/i.test((h || '').toString().replace(/[^a-z]/gi, '')));
                if (nameIdx !== -1) colMap.fullName = nameIdx;
            }

            if (colMap.firstName === undefined && colMap.fullName === undefined) {
                console.error('[Import] No name column found. Headers:', JSON.stringify(header));
                showMsg('Could not find a name column. Make sure your file has a header with driver names.', true);
                return;
            }

            // Parse data rows
            const parsed = [];
            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                if (!row || row.every(c => !c || !c.toString().trim())) continue;

                const data = {};
                let hasValue = false;

                // Map all known fields
                const allFields = [...config.cols.map(c => c.key), ...(config.extraFields || [])];
                allFields.forEach(key => {
                    if (colMap[key] !== undefined) {
                        let val = (row[colMap[key]] || '').toString().trim();
                        if (key === 'cdlState') val = val.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
                        if (key === 'cdl') val = val.toUpperCase();
                        if (key === 'cdlClass') val = val.toUpperCase().replace(/CLASS\s*/i, '').trim().charAt(0) || '';
                        // Normalize dates
                        if (['cdlExp', 'medExp', 'mvrExp', 'drugTestDate', 'twicExp', 'hireDate', 'terminationDate', 'dob'].includes(key) && val) {
                            val = normalizeDate(val);
                        }
                        // Normalize status
                        if (key === 'status' && val) {
                            const col = config.cols.find(c => c.key === 'status');
                            if (col && col.options) {
                                const match = col.options.find(o =>
                                    o.value.toLowerCase() === val.toLowerCase() ||
                                    o.label.toLowerCase() === val.toLowerCase()
                                );
                                val = match ? match.value : 'active';
                            }
                        }
                        // Normalize phone
                        if ((key === 'phone' || key === 'emergencyPhone') && val) {
                            val = val.replace(/[^\d+()-\s]/g, '');
                        }
                        if (val) {
                            data[key] = val;
                            hasValue = true;
                        }
                    }
                });

                // Always resolve into single name field
                if (!data.name) {
                    let fullName = '';
                    if (hasFullName) {
                        fullName = (row[colMap.fullName] || '').toString().trim();
                    }
                    if (!fullName && (hasFirstName || hasLastName)) {
                        const first = hasFirstName ? (row[colMap.firstName] || '').toString().trim() : '';
                        const last = hasLastName ? (row[colMap.lastName] || '').toString().trim() : '';
                        fullName = [first, last].filter(Boolean).join(' ');
                    }
                    if (fullName) {
                        // Flip "Last, First" format
                        if (fullName.includes(',')) {
                            const parts = fullName.split(',').map(p => p.trim()).filter(Boolean);
                            fullName = (parts[1] || '') + ' ' + (parts[0] || '');
                        }
                        data.name = fullName.trim();
                        hasValue = true;
                    }
                }
                delete data.firstName;
                delete data.lastName;
                delete data.fullName;

                // Try to match truck by unit number
                if (data.truck && state.trucks.length) {
                    const truckVal = data.truck.toString().toLowerCase().replace(/^unit\s*/i, '').trim();
                    const match = state.trucks.find(t => t.unit && t.unit.toLowerCase() === truckVal);
                    data.truck = match ? match.id : '';
                }

                if (hasValue && data.name) {
                    parsed.push(data);
                }
            }

            if (parsed.length === 0) {
                showMsg('No valid driver rows found in file', true);
                return;
            }

            // Open unified sheet with parsed data
            openUnifiedSheet('driver', parsed, { mode: 'import' });
            const extraCount = Object.keys(colMap).filter(k => config.extraFields?.includes(k)).length;
            let msg = parsed.length + ' driver' + (parsed.length > 1 ? 's' : '') + ' imported for review';
            if (extraCount > 0) msg += ' (' + extraCount + ' extra field' + (extraCount > 1 ? 's' : '') + ' mapped)';
            showMsg(msg);
        } catch (err) {
            console.error('Smart import error:', err);
            showMsg('Error reading file: ' + (err.message || ''), true);
        }
    }

    async function smartImportInspections(file) {
        if (!file) return;
        showMsg('Reading file…');
        try {
            let rows = await parseFileToRows(file, 'inspection');
            if (!rows || rows.length < 2) { showMsg('No data found in file.', true); return; }
            const config = SHEET_CONFIGS.inspection;
            const aliases = config.csvAliases || {};

            let headerIdx = 0;
            const inspHeaderPat = /^(date|inspectiondate|type|level|report|reportnum|driver|truck|unit|result|violations|location|fine|notes|comment)$/i;
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
                const cleaned = rows[i].map(c => (c || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''));
                if (cleaned.filter(h => inspHeaderPat.test(h)).length >= 2) { headerIdx = i; break; }
            }
            const header = rows[headerIdx];
            const dataRows = rows.slice(headerIdx + 1);
            console.log('[Import] Inspection header row:', headerIdx, 'Headers:', JSON.stringify(header));

            const colMap = buildSmartColumnMap(header, aliases);
            const inspFields = ['date', 'type', 'reportNum', 'driverName', 'truckUnit', 'result', 'violations', 'location', 'fineAmount', 'notes'];
            detectColumnsByContent(dataRows, header, colMap, inspFields);
            console.log('[Import] Inspection final map:', JSON.stringify(colMap));

            if (colMap.date === undefined) {
                showMsg('Could not find a Date column. Make sure your file has a column with inspection dates.', true);
                return;
            }

            const parsed = [];
            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                if (!row || row.every(c => !c || !c.toString().trim())) continue;
                const data = {};
                let hasValue = false;
                const allFields = [...config.cols.map(c => c.key), ...(config.extraFields || [])];
                allFields.forEach(key => {
                    if (colMap[key] !== undefined) {
                        let val = (row[colMap[key]] || '').toString().trim();
                        if (key === 'date' && val) val = normalizeDate(val);
                        if (key === 'type' && val) {
                            const lv = val.toLowerCase();
                            if (/level\s*1|full|level\s*i(?!\w)/i.test(lv)) val = 'level-1';
                            else if (/level\s*2|walk/i.test(lv)) val = 'level-2';
                            else if (/level\s*3|driver/i.test(lv)) val = 'level-3';
                            else if (/level\s*4|special/i.test(lv)) val = 'level-4';
                            else if (/level\s*5|vehicle/i.test(lv)) val = 'level-5';
                            else if (/citation|ticket/i.test(lv)) val = 'citation';
                            else {
                                const col = config.cols.find(c => c.key === 'type');
                                if (col?.options) { const m = col.options.find(o => o.value === lv || o.label.toLowerCase() === lv); val = m ? m.value : 'level-1'; }
                            }
                        }
                        if (key === 'result' && val) {
                            const lv = val.toLowerCase();
                            if (lv.includes('pass') || lv === 'clean' || lv === 'satisfactory') val = 'pass';
                            else if (lv.includes('fail') || lv === 'unsatisfactory') val = 'fail';
                            else if (lv.includes('warning')) val = 'warning';
                            else if (lv.includes('oos') || lv.includes('out of service')) val = 'oos';
                        }
                        if (key === 'violations') { const n = parseInt(val); val = isNaN(n) ? '0' : String(n); }
                        if (key === 'fineAmount') { val = val.replace(/[^0-9.]/g, ''); }
                        if (val) { data[key] = val; hasValue = true; }
                    }
                });
                if (hasValue && data.date) parsed.push(data);
            }
            if (parsed.length === 0) { showMsg('No valid inspection rows found in file', true); return; }

            openUnifiedSheet('inspection', parsed, { mode: 'import' });
            showMsg(parsed.length + ' inspection' + (parsed.length > 1 ? 's' : '') + ' imported for review');
        } catch (err) {
            console.error('Smart import error:', err);
            showMsg('Error reading file: ' + (err.message || ''), true);
        }
    }

    // ── NHTSA VIN Decode (batch, up to 50 at a time) ──
    async function decodeVINBatch(vins) {
        const valid = [...new Set(vins.filter(v => v && v.length === 17))];
        if (!valid.length) return {};
        const results = {};
        for (let i = 0; i < valid.length; i += 50) {
            const batch = valid.slice(i, i + 50);
            try {
                const resp = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'vins=' + batch.join(';') + '&format=json'
                });
                const json = await resp.json();
                if (json.Results) {
                    json.Results.forEach(r => {
                        if (!r.VIN) return;
                        results[r.VIN.toUpperCase()] = {
                            make: (r.Make || '').trim(),
                            model: (r.Model || '').trim(),
                            year: (r.ModelYear || '').trim(),
                            bodyClass: (r.BodyClass || '').trim(),
                            trailerBodyType: (r.TrailerBodyType || '').trim(),
                            fuelType: (r.FuelTypePrimary || '').trim(),
                            gvwr: (r.GVWR || '').trim()
                        };
                    });
                }
            } catch (e) { console.warn('[VIN Decode] Batch failed:', e); }
        }
        return results;
    }

    function applyVINData(parsed, vinData, importType) {
        let fixes = 0;
        parsed.forEach(d => {
            if (!d.vin) return;
            const info = vinData[d.vin.toUpperCase()];
            if (!info || (!info.make && !info.year)) return;
            // Fill blanks and correct mismatches ” VIN is the source of truth
            if (info.year && info.year !== '0') {
                if (!d.year) { d.year = info.year; fixes++; }
                else if (d.year !== info.year) { console.warn('[VIN] Year mismatch ' + d.vin + ': sheet=' + d.year + ' VIN=' + info.year); d.year = info.year; fixes++; }
            }
            if (info.make) {
                if (!d.make) { d.make = info.make; fixes++; }
                else if (d.make.toUpperCase() !== info.make.toUpperCase()) { console.warn('[VIN] Make mismatch ' + d.vin + ': sheet=' + d.make + ' VIN=' + info.make); d.make = info.make; fixes++; }
            }
            if (importType === 'truck' && info.model && !d.model) { d.model = info.model; fixes++; }
            if (importType === 'truck' && info.fuelType) {
                const ft = info.fuelType.toLowerCase();
                if (ft.includes('diesel') && d.fuel !== 'diesel') { d.fuel = 'diesel'; fixes++; }
                else if (ft.includes('gas') && d.fuel !== 'gasoline') { d.fuel = 'gasoline'; fixes++; }
            }
            if (importType === 'trailer') {
                // Use VIN body class for type if not already confidently set
                const bt = (info.trailerBodyType || info.bodyClass || '').toLowerCase();
                if (bt) {
                    let vinType = '';
                    if (bt.includes('refrigerat') || bt.includes('reefer')) vinType = 'reefer';
                    else if (bt.includes('flatbed')) vinType = 'flatbed';
                    else if (bt.includes('tank')) vinType = 'tanker';
                    else if (bt.includes('lowboy')) vinType = 'lowboy';
                    else if (bt.includes('step') || bt.includes('deck')) vinType = 'step-deck';
                    else if (bt.includes('van') || bt.includes('enclosed') || bt.includes('box')) vinType = 'dry-van';
                    if (vinType && (!d.type || d.type === 'other')) { d.type = vinType; fixes++; }
                    // VIN says reefer but sheet said dry-van ” trust VIN
                    if (vinType === 'reefer' && d.type === 'dry-van') { d.type = 'reefer'; fixes++; }
                }
            }
        });
        return fixes;
    }

    function buildSmartColumnMap(headerRow, aliases) {
        const colMap = {};
        const cleaned = headerRow.map(h => (h || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''));

        for (const [field, names] of Object.entries(aliases)) {
            // Exact match first ” skip already-claimed columns
            let idx = cleaned.findIndex((h, i) => !Object.values(colMap).includes(i) && names.includes(h));
            if (idx !== -1) { colMap[field] = idx; continue; }

            // Substring match ” skip already-claimed columns
            idx = cleaned.findIndex((h, i) => h && !Object.values(colMap).includes(i) && names.some(n => h.includes(n) || n.includes(h)));
            if (idx !== -1) { colMap[field] = idx; continue; }

            // Partial word match for compound headers
            idx = cleaned.findIndex(h => {
                if (!h || h.length < 3) return false;
                return names.some(n => {
                    // Check if significant overlap
                    const shorter = h.length < n.length ? h : n;
                    const longer = h.length < n.length ? n : h;
                    return longer.includes(shorter) && shorter.length >= 3;
                });
            });
            if (idx !== -1 && !Object.values(colMap).includes(idx)) {
                colMap[field] = idx;
            }
        }

        return colMap;
    }

    // Detect column types by sampling actual data content (handles missing/wrong headers)
    function detectColumnsByContent(dataRows, headerRow, colMap, fieldList) {
        const usedCols = new Set(Object.values(colMap));
        const mappedFields = new Set(Object.keys(colMap));

        // Data pattern matchers ” each returns a confidence 0-1 for a set of sample values
        const patterns = {
            firstName: vals => {
                const hits = vals.filter(v => /^[A-Za-z' \-]{2,25}$/.test(v) && v.split(/\s+/).length <= 2 && !/\d/.test(v));
                return hits.length / vals.length;
            },
            lastName: vals => {
                const hits = vals.filter(v => /^[A-Za-z' \-]{2,30}$/.test(v) && v.split(/\s+/).length <= 3 && !/\d/.test(v));
                return hits.length / vals.length;
            },
            fullName: vals => {
                const hits = vals.filter(v => /^[A-Za-z' \-]{2,}$/.test(v) && v.split(/\s+/).length >= 2 && !/\d/.test(v));
                return hits.length / vals.length;
            },
            phone: vals => {
                const hits = vals.filter(v => {
                    const digits = v.replace(/\D/g, '');
                    return digits.length >= 7 && digits.length <= 11 && /[\d()\-\s.+]{7,}/.test(v);
                });
                return hits.length / vals.length;
            },
            email: vals => {
                const hits = vals.filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
                return hits.length / vals.length;
            },
            cdl: vals => {
                const hits = vals.filter(v => /^[A-Z0-9\-]{4,20}$/i.test(v) && /\d/.test(v) && /[A-Z]/i.test(v));
                return hits.length / vals.length;
            },
            cdlState: vals => {
                const states = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
                const hits = vals.filter(v => states.includes(v.toUpperCase().trim()));
                return hits.length / vals.length;
            },
            cdlClass: vals => {
                const hits = vals.filter(v => /^(A|B|C|CLASS\s*[ABC])$/i.test(v.trim()));
                return hits.length / vals.length;
            },
            status: vals => {
                const kw = ['active', 'inactive', 'home time', 'home-time', 'on leave', 'on-leave', 'terminated', 'y', 'n', 'yes', 'no'];
                const hits = vals.filter(v => kw.includes(v.toLowerCase().trim()));
                return hits.length / vals.length;
            },
            dob: vals => {
                const hits = vals.filter(v => {
                    if (!/\d/.test(v)) return false;
                    const d = new Date(v);
                    if (isNaN(d)) return false;
                    const yr = d.getFullYear();
                    return yr >= 1940 && yr <= 2010; // reasonable DOB range
                });
                return hits.length / vals.length;
            },
            ssn: vals => {
                const hits = vals.filter(v => /^\d{3}[\s\-]?\d{2}[\s\-]?\d{4}$/.test(v.trim()));
                return hits.length / vals.length;
            },
            // Truck/trailer fields
            unit: vals => {
                const hits = vals.filter(v => /^[A-Z0-9\-]{1,15}$/i.test(v.trim()) && v.trim().length <= 15);
                return hits.length / vals.length * 0.3; // low confidence ” too generic on its own
            },
            vin: vals => {
                const hits = vals.filter(v => /^[A-HJ-NPR-Z0-9]{17}$/i.test(v.replace(/[^A-Z0-9]/gi, '')));
                return hits.length / vals.length;
            },
            year: vals => {
                const hits = vals.filter(v => { const yr = parseInt(v); return yr >= 1980 && yr <= 2099 && /^\d{4}$/.test(v.trim()); });
                return hits.length / vals.length;
            },
            make: vals => {
                const makes = ['freightliner', 'peterbilt', 'kenworth', 'volvo', 'international', 'mack', 'western star',
                               'navistar', 'hino', 'isuzu', 'ford', 'chevrolet', 'gmc', 'ram', 'dodge', 'toyota',
                               'utility', 'great dane', 'wabash', 'hyundai', 'stoughton', 'vanguard', 'fontaine', 'wilson'];
                const hits = vals.filter(v => makes.some(m => v.toLowerCase().includes(m)));
                return hits.length / vals.length;
            },
            model: vals => {
                const models = ['cascadia', 'prostar', 'vnl', 'lonestar', '579', '389', 't680', 't880', 'w900', 'anthem',
                                'lt', 'granite', 'pinnacle', '4300', '4400', 'lf', 'fe', 'npr'];
                const hits = vals.filter(v => models.some(m => v.toLowerCase().includes(m)));
                return hits.length / vals.length;
            },
            plate: vals => {
                const hits = vals.filter(v => /^[A-Z0-9\-\s]{3,10}$/i.test(v.trim()) && /[A-Z]/i.test(v) && /\d/.test(v));
                return hits.length / vals.length;
            },
            plateState: vals => {
                const states = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
                const hits = vals.filter(v => states.includes(v.toUpperCase().trim()));
                return hits.length / vals.length;
            },
            fuel: vals => {
                const fuels = ['diesel', 'gasoline', 'gas', 'cng', 'lng', 'electric', 'hybrid', 'propane'];
                const hits = vals.filter(v => fuels.includes(v.toLowerCase().trim()));
                return hits.length / vals.length;
            },
            type: vals => {
                const types = ['dry van', 'dryvan', 'dry-van', 'reefer', 'flatbed', 'step deck', 'step-deck', 'tanker', 'lowboy', 'container', 'box', 'refrigerated'];
                const hits = vals.filter(v => types.some(t => v.toLowerCase().includes(t)));
                return hits.length / vals.length;
            },
            // Generic date detector for expiration/hire dates
            _date: vals => {
                const hits = vals.filter(v => {
                    if (!/\d/.test(v)) return false;
                    const d = new Date(v);
                    if (isNaN(d)) return false;
                    const yr = d.getFullYear();
                    return yr >= 2000 && yr <= 2040;
                });
                return hits.length / vals.length;
            }
        };

        // Sample data from each unmapped column
        const colSamples = {};
        for (let c = 0; c < headerRow.length; c++) {
            if (usedCols.has(c)) continue;
            const samples = [];
            for (let r = 0; r < Math.min(dataRows.length, 15); r++) {
                const val = (dataRows[r][c] || '').toString().trim();
                if (val) samples.push(val);
            }
            if (samples.length > 0) colSamples[c] = samples;
        }

        // Score each unmapped column against each unmapped field
        const fieldsToDetect = fieldList.filter(f => !mappedFields.has(f));
        const scores = []; // { field, col, score }

        for (const field of fieldsToDetect) {
            const patternKey = patterns[field] ? field : null;
            for (const [colStr, samples] of Object.entries(colSamples)) {
                const col = parseInt(colStr);
                let score = 0;
                if (patternKey) {
                    score = patterns[patternKey](samples);
                }
                // Also check header hint (even partial/misspelled)
                const hdr = (headerRow[col] || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
                if (hdr) {
                    // Driver fields
                    if (field === 'phone' && /ph|tel|cell|mob|contact/.test(hdr)) score += 0.3;
                    if (field === 'email' && /mail|email/.test(hdr)) score += 0.3;
                    if (field === 'cdl' && /cdl|lic|dl/.test(hdr)) score += 0.3;
                    if (field === 'cdlState' && /state/.test(hdr)) score += 0.3;
                    if (field === 'dob' && /dob|birth|bday/.test(hdr)) score += 0.3;
                    if (field === 'status' && /status|active/.test(hdr)) score += 0.3;
                    if ((field === 'firstName' || field === 'fullName') && /name|first|driver/.test(hdr)) score += 0.3;
                    if (field === 'lastName' && /last|sur|family/.test(hdr)) score += 0.3;
                    // Truck/trailer fields
                    if (field === 'unit' && /unit|truck|equip|no|number/.test(hdr)) score += 0.3;
                    if (field === 'vin' && /vin|vehicleid/.test(hdr)) score += 0.3;
                    if (field === 'year' && /year|yr|model/.test(hdr)) score += 0.3;
                    if (field === 'make' && /make|manuf|brand/.test(hdr)) score += 0.3;
                    if (field === 'model' && /model/.test(hdr)) score += 0.3;
                    if (field === 'plate' && /plate|tag|license/.test(hdr)) score += 0.3;
                    if (field === 'plateState' && /state|platestate|tagstate/.test(hdr)) score += 0.3;
                    if (field === 'fuel' && /fuel|gas|diesel/.test(hdr)) score += 0.3;
                    if (field === 'type' && /type|trailer/.test(hdr)) score += 0.3;
                }

                if (score >= 0.5) scores.push({ field, col, score });
            }
        }

        // Assign best matches greedily (highest score first, no column reuse)
        scores.sort((a, b) => b.score - a.score);
        const assignedCols = new Set(usedCols);
        const assignedFields = new Set(mappedFields);

        for (const { field, col, score } of scores) {
            if (assignedCols.has(col) || assignedFields.has(field)) continue;
            colMap[field] = col;
            assignedCols.add(col);
            assignedFields.add(field);
            console.log('[Import] Content-detected: column', col, '(' + (headerRow[col] || '<blank>') + ') → ' + field, '(score: ' + score.toFixed(2) + ')');
        }

        return colMap;
    }

    function normalizeDate(val) {
        if (!val) return '';
        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
        // Try common formats
        const d = new Date(val);
        if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
            return d.toISOString().slice(0, 10);
        }
        // MM/DD/YYYY or DD/MM/YYYY
        const parts = val.split(/[\/\-\.]/);
        if (parts.length === 3) {
            let [a, b, c] = parts.map(p => parseInt(p, 10));
            if (c > 100) { // MM/DD/YYYY
                const dt = new Date(c, a - 1, b);
                if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
            } else if (a > 100) { // YYYY/MM/DD
                const dt = new Date(a, b - 1, c);
                if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
            }
        }
        // Excel serial date number
        const num = Number(val);
        if (num > 30000 && num < 100000) {
            const dt = new Date((num - 25569) * 86400000);
            if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
        }
        return val;
    }

    async function parseCsvToRows(file) {
        const text = await file.text();
        const sep = text.includes('\t') ? '\t' : ',';
        return text.trim().split('\n').map(line => {
            const row = [];
            let inQuote = false, cell = '';
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (inQuote) {
                    if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
                    else if (ch === '"') inQuote = false;
                    else cell += ch;
                } else {
                    if (ch === '"') inQuote = true;
                    else if (ch === sep) { row.push(cell.trim()); cell = ''; }
                    else cell += ch;
                }
            }
            row.push(cell.trim());
            return row;
        });
    }

    async function parseExcelToRows(file, importType) {
        if (typeof XLSX === 'undefined') { showMsg('Excel library not loaded', true); return null; }
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });

        let ws;
        if (wb.SheetNames.length > 1 && importType) {
            ws = pickBestSheet(wb, importType);
            console.log('[Import] Multi-sheet workbook ” picked sheet:', ws.__sheetName || '(best match)');
        } else {
            ws = wb.Sheets[wb.SheetNames[0]];
        }

        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        // Filter out completely empty rows
        return json.filter(r => r.some(c => c !== null && c !== undefined && c.toString().trim() !== ''));
    }

    // Score each sheet in a workbook and return the best match for the given import type
    function pickBestSheet(wb, importType) {
        const sheetKeywords = {
            driver: {
                sheetNames: ['driver', 'drivers', 'employee', 'employees', 'personnel', 'staff', 'roster'],
                headers: ['name', 'firstname', 'lastname', 'drivername', 'cdl', 'licensenumber',
                           'phone', 'email', 'hiredate', 'dob', 'endorsements', 'medicalcard',
                           'emergencycontact', 'drugtest', 'cdlstate', 'cdlexp', 'cdlclass', 'driver']
            },
            truck: {
                sheetNames: ['truck', 'trucks', 'vehicle', 'vehicles', 'unit', 'units', 'fleet', 'equipment', 'tractor', 'tractors'],
                headers: ['vin', 'make', 'model', 'year', 'plate', 'platenumber', 'unit', 'unitnumber',
                           'mileage', 'odometer', 'fueltype', 'grossweight', 'dotinspection']
            },
            trailer: {
                sheetNames: ['trailer', 'trailers'],
                headers: ['vin', 'make', 'model', 'year', 'plate', 'platenumber', 'unit', 'unitnumber',
                           'trailertype', 'length', 'axles', 'dotinspection']
            }
        };

        const kw = sheetKeywords[importType] || sheetKeywords.driver;
        let bestSheet = wb.Sheets[wb.SheetNames[0]];
        let bestScore = -1;

        for (const sheetName of wb.SheetNames) {
            let score = 0;
            const cleanName = sheetName.toLowerCase().replace(/[^a-z0-9]/g, '');

            // Score sheet name match (high weight)
            if (kw.sheetNames.some(k => cleanName === k)) score += 10;
            else if (kw.sheetNames.some(k => cleanName.includes(k))) score += 5;

            // Score header matches
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
            if (rows.length > 0) {
                const headerRow = rows[0].map(h => (h || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''));
                const headerMatches = headerRow.filter(h => h && kw.headers.some(k => h.includes(k) || k.includes(h))).length;
                score += headerMatches * 2;

                // Small bonus for having data rows
                if (rows.length > 1) score += 1;
            }

            console.log('[Import] Sheet "' + sheetName + '" score for ' + importType + ':', score);
            if (score > bestScore) {
                bestScore = score;
                bestSheet = ws;
                bestSheet.__sheetName = sheetName;
            }
        }

        return bestSheet;
    }

    async function parsePdfToRows(file) {
        if (typeof pdfjsLib === 'undefined') { showMsg('PDF library not loaded', true); return null; }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const data = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data }).promise;

        // Extract text items with position + width info across all pages
        const allItems = [];
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const vp = page.getViewport({ scale: 1 });
            content.items.forEach(item => {
                if (!item.str || !item.str.trim()) return;
                const y = vp.height - item.transform[5];
                const x = item.transform[4];
                const w = item.width || (item.str.length * Math.abs(item.transform[0]) * 0.6);
                const fontSize = Math.abs(item.transform[0]) || 10;
                allItems.push({ text: item.str.trim(), x, y, w, fontSize, page: p });
            });
        }

        if (allItems.length === 0) {
            console.warn('[PDF] No text items extracted');
            return null;
        }

        // Group items into rows by Y-coordinate (within tolerance)
        allItems.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
        const yTolerance = 4;
        const rowGroups = [];
        let currentGroup = [allItems[0]];

        for (let i = 1; i < allItems.length; i++) {
            const item = allItems[i];
            const prev = currentGroup[currentGroup.length - 1];
            if (item.page === prev.page && Math.abs(item.y - prev.y) <= yTolerance) {
                currentGroup.push(item);
            } else {
                rowGroups.push(currentGroup);
                currentGroup = [item];
            }
        }
        rowGroups.push(currentGroup);

        // Measure actual whitespace gaps between consecutive items in each row
        const allGaps = [];
        rowGroups.forEach(group => {
            group.sort((a, b) => a.x - b.x);
            for (let i = 1; i < group.length; i++) {
                const prevEnd = group[i - 1].x + group[i - 1].w;
                const gap = group[i].x - prevEnd;
                if (gap > 0) allGaps.push(gap);
            }
        });
        allGaps.sort((a, b) => a - b);

        console.log('[PDF] All gaps (' + allGaps.length + '):', allGaps.map(g => Math.round(g * 10) / 10));

        // Find the natural break between "within-word" gaps and "between-column" gaps
        // Use Jenks/Otsu-like approach: find the gap value with the biggest jump
        let colGapThreshold;
        if (allGaps.length >= 2) {
            let maxJump = 0, jumpAt = 0;
            for (let i = 1; i < allGaps.length; i++) {
                const jump = allGaps[i] - allGaps[i - 1];
                if (jump > maxJump) { maxJump = jump; jumpAt = i; }
            }
            // Threshold is midpoint between the two gap clusters
            colGapThreshold = (allGaps[jumpAt - 1] + allGaps[jumpAt]) / 2;
        } else {
            colGapThreshold = 20;
        }
        // Ensure a reasonable minimum
        const avgFontSize = allItems.reduce((s, it) => s + it.fontSize, 0) / allItems.length;
        colGapThreshold = Math.max(colGapThreshold, avgFontSize * 1.5);

        console.log('[PDF] Column gap threshold:', Math.round(colGapThreshold * 10) / 10, 'avgFontSize:', Math.round(avgFontSize * 10) / 10);

        // Build rows by splitting on gaps > threshold
        const lines = rowGroups.map(group => {
            group.sort((a, b) => a.x - b.x);
            const cells = [group[0].text];
            for (let i = 1; i < group.length; i++) {
                const prevEnd = group[i - 1].x + group[i - 1].w;
                const gap = group[i].x - prevEnd;
                if (gap >= colGapThreshold) {
                    cells.push(group[i].text);
                } else {
                    cells[cells.length - 1] += ' ' + group[i].text;
                }
            }
            return cells.map(c => c.trim()).filter(Boolean);
        }).filter(row => row.length > 0);

        console.log('[PDF] Extracted', lines.length, 'lines. First 3:', JSON.stringify(lines.slice(0, 3)));

        if (lines.length < 2) return null;

        // Find header row
        const tableKeywords = ['name', 'first', 'last', 'cdl', 'license', 'phone', 'email', 'driver', 'dob', 'hire', 'status', 'unit', 'vin', 'plate', 'make', 'model', 'year', 'type', 'fuel', 'trailer', 'truck', 'vehicle', 'number', 'registration', 'insurance', 'inspection', 'expiration', 'date', 'termination'];
        let headerIdx = -1, bestScore = 0;
        lines.forEach((cells, i) => {
            const joined = cells.join(' ').toLowerCase();
            const score = tableKeywords.filter(kw => joined.includes(kw)).length;
            if (score > bestScore) { bestScore = score; headerIdx = i; }
        });

        console.log('[PDF] Best header at line', headerIdx, 'score', bestScore, headerIdx >= 0 ? JSON.stringify(lines[headerIdx]) : '');

        if (headerIdx === -1 || bestScore < 2) {
            headerIdx = lines.findIndex(cells => cells.length >= 2);
            if (headerIdx === -1) {
                showMsg('Could not detect table structure in PDF. Try Excel or CSV instead.', true);
                return null;
            }
        }

        // Normalize: pad shorter rows to match header length
        const header = lines[headerIdx];
        const numCols = header.length;
        const rows = [header];
        for (let i = headerIdx + 1; i < lines.length; i++) {
            const row = lines[i];
            if (row.length >= Math.max(2, numCols - 2)) {
                while (row.length < numCols) row.push('');
                rows.push(row.slice(0, numCols));
            }
        }

        console.log('[PDF] Final result:', rows.length, 'rows (incl header). Header:', JSON.stringify(rows[0]));
        return rows.length >= 2 ? rows : null;
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
                    { value: 'maintenance', label: 'In Maintenance' },
                    { value: 'inshop', label: 'In Shop' },
                    { value: 'reserved', label: 'Reserved' },
                    { value: 'sold', label: 'Sold' }
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
            extraFields: ['annualInspDate', 'registrationExp', 'insuranceExp',
                          'mileage', 'grossWeight', 'dotInspDate', 'tireSize', 'pdInsurance', 'notes'],
            csvAliases: {
                unit: ['unit', 'unitnumber', 'unitno', 'truckno', 'trucknumber', 'equipmentno', 'equipmentnumber', 'no', 'number', 'truck', 'vehicleno', 'vehiclenumber', 'fleetno', 'fleetnumber', 'id', 'truckid', 'assetno', 'assetnumber', 'asset'],
                year: ['year', 'yr', 'modelyear', 'vehicleyear'],
                make: ['make', 'manufacturer', 'brand', 'oem'],
                model: ['model', 'truckmodel', 'vehiclemodel'],
                vin: ['vin', 'vehicleid', 'vehicleidentification', 'vinno', 'vinnumber', 'serialnumber', 'serial'],
                plate: ['plate', 'licenseplate', 'licenseplatenumber', 'tag', 'platenumber', 'plateno', 'tagno', 'tagnumber', 'registration'],
                plateState: ['platestate', 'state', 'tagstate', 'registrationstate', 'regstate'],
                fuel: ['fuel', 'fueltype', 'gas', 'diesel'],
                status: ['status', 'active', 'condition'],
                annualInspDate: ['annualinspection', 'inspection', 'inspectiondate', 'annualinsp', 'inspdate', 'inspexp', 'annualinspdate', 'inspectionexp'],
                registrationExp: ['registration', 'registrationexp', 'registrationexpiration', 'regexp', 'regexpiration', 'regexp'],
                insuranceExp: ['insurance', 'insuranceexp', 'insuranceexpiration', 'insexp', 'insexpiration'],
                mileage: ['mileage', 'odometer', 'miles', 'km', 'odo', 'currentmileage'],
                grossWeight: ['grossweight', 'gvw', 'weight', 'gvwr', 'maxweight'],
                dotInspDate: ['dotinspection', 'dotinsp', 'dotinspdate'],
                tireSize: ['tiresize', 'tire', 'tires', 'wheelsize'],
                pdInsurance: ['pdinsurance', 'physicaldamage', 'pd', 'physicalinsurance', 'pdvalue', 'insurancevalue'],
                notes: ['notes', 'note', 'comments', 'comment', 'remarks']
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
                    { value: 'maintenance', label: 'In Maintenance' },
                    { value: 'inshop', label: 'In Shop' },
                    { value: 'reserved', label: 'Reserved' },
                    { value: 'sold', label: 'Sold' }
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
            extraFields: ['plateState', 'annualInspDate', 'registrationExp', 'insuranceExp',
                          'reeferModel', 'tireSize', 'length', 'spareTires', 'etracks',
                          'chuteType', 'airRide', 'ventedVan', 'tireRack', 'pdInsurance', 'notes'],
            csvAliases: {
                unit: ['unit', 'unitnumber', 'unitno', 'trailerno', 'trailernumber', 'equipmentno', 'equipmentnumber', 'no', 'number', 'trailer', 'vehicleno', 'vehiclenumber', 'fleetno', 'fleetnumber', 'id', 'trailerid', 'assetno', 'assetnumber', 'asset'],
                year: ['year', 'yr', 'modelyear', 'vehicleyear'],
                make: ['make', 'manufacturer', 'brand', 'oem'],
                type: ['type', 'trailertype', 'equipmenttype', 'bodytype', 'body', 'model'],
                vin: ['vin', 'vehicleid', 'vehicleidentification', 'vinno', 'vinnumber', 'serialnumber', 'serial'],
                plate: ['plate', 'licenseplate', 'licenseplatenumber', 'tag', 'platenumber', 'plateno', 'tagno', 'tagnumber', 'registration'],
                plateState: ['platestate', 'state', 'tagstate', 'registrationstate', 'regstate'],
                status: ['status', 'active', 'condition'],
                annualInspDate: ['annualinspection', 'inspection', 'inspectiondate', 'annualinsp', 'inspdate', 'inspexp', 'annualinspdate', 'inspectionexp'],
                registrationExp: ['registration', 'registrationexp', 'registrationexpiration', 'regexp', 'regexpiration', 'regexp'],
                insuranceExp: ['insurance', 'insuranceexp', 'insuranceexpiration', 'insexp', 'insexpiration'],
                reeferModel: ['reefermodel', 'reefer', 'reefermake', 'reeferunit', 'reeferbrand', 'tempcontrol'],
                tireSize: ['tiresize', 'tire', 'tires', 'wheelsize'],
                spareTires: ['sparetires', 'spare', 'sparetire', 'spares'],
                etracks: ['etracks', 'etrack', 'tracks'],
                chuteType: ['chute', 'chutetype', 'centerorsidechute', 'centerchute', 'sidechute'],
                airRide: ['airride', 'air', 'suspension'],
                ventedVan: ['ventedvan', 'vented', 'vent'],
                tireRack: ['tirerack', 'rack'],
                pdInsurance: ['pdinsurance', 'physicaldamage', 'pd', 'physicalinsurance', 'pdvalue', 'insurancevalue'],
                notes: ['notes', 'note', 'comments', 'comment', 'remarks']
            }
        },
        driver: {
            cols: [
                { key: 'name', placeholder: 'e.g., John Smith', type: 'text', required: true },
                { key: 'phone', placeholder: '(555) 123-4567', type: 'text' },
                { key: 'cdl', placeholder: 'CDL number', type: 'text' },
                { key: 'cdlState', placeholder: 'TX', type: 'text', maxlength: 2, pattern: /^[A-Z]{2}$/, warnMsg: 'Invalid state code' },
                { key: 'email', placeholder: 'john@example.com', type: 'text' },
                { key: 'status', type: 'select', defaultLabel: 'Active', options: [
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'home-time', label: 'Home Time' },
                    { value: 'training', label: 'Training' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'suspended', label: 'Suspended' },
                    { value: 'terminated', label: 'Terminated' }
                ]}
            ],
            collection: 'drivers',
            label: 'driver',
            requiredKey: 'name',
            duplicateKey: 'cdl',
            modalId: 'multiDriverModal',
            tbodyId: 'multiDriverBody',
            countId: 'multiDriverRowCount',
            addRowId: 'multiDriverAddRow',
            closeId: 'closeMultiDriverModal',
            cancelId: 'cancelMultiDriver',
            saveId: 'saveMultiDriver',
            defaults: { status: 'active' },
            afterSave: async () => { await loadDrivers(); },
            // Extra fields saved but not shown in sheet modal
            extraFields: ['cdlClass', 'cdlExp', 'medExp', 'mvrExp', 'drugTestDate', 'twicExp',
                          'hireDate', 'terminationDate', 'dob', 'endorsements', 'restrictions',
                          'emergencyName', 'emergencyPhone', 'address', 'notes', 'truck'],
            csvAliases: {
                firstName: ['firstname', 'first', 'fname', 'givenname', 'driverfirst', 'driverfirstname'],
                lastName: ['lastname', 'last', 'lname', 'surname', 'familyname', 'driverlast', 'driverlastname'],
                fullName: ['name', 'fullname', 'drivername', 'driver', 'employeename', 'employee'],
                phone: ['phone', 'phonenumber', 'mobile', 'cell', 'telephone', 'cellphone', 'mobilenumber', 'contact', 'contactphone', 'driverphone'],
                cdl: ['cdl', 'cdlnumber', 'cdlno', 'licensenumber', 'license', 'dl', 'dlnumber', 'driverslicense', 'licno', 'licensenum', 'cdlnum', 'driverlicense'],
                cdlClass: ['cdlclass', 'class', 'licenseclass', 'dlclass', 'licclass'],
                cdlState: ['cdlstate', 'licensestate', 'dlstate', 'state', 'issuingstate', 'licstate', 'stateofissue'],
                cdlExp: ['cdlexp', 'cdlexpiration', 'cdlexpirationdate', 'licenseexpiration', 'licenseexp', 'dlexp', 'dlexpiration', 'licexpiry', 'cdlexpirydate', 'cdlexpiry'],
                medExp: ['medexp', 'medicalexp', 'medicalexpiration', 'medicalcard', 'medcardexp', 'medicalcardexpiration', 'medcardexpiration', 'medicalcardexp', 'physicalexp', 'dotphysical', 'dotphysicalexp', 'medexpiry'],
                mvrExp: ['mvrexp', 'mvrexpiry', 'mvrexpirationdate', 'mvrdate', 'mvr', 'mvrduedate', 'motorvehiclereport'],
                drugTestDate: ['drugtest', 'drugtestdate', 'lastdrugtest', 'drugtesting', 'dotdrugtest', 'drugscreendate', 'drugscreen'],
                twicExp: ['twicexp', 'twic', 'twicexpiration', 'twiccard', 'twicexpiry', 'twiccardexp'],
                email: ['email', 'emailaddress', 'mail', 'driveremail', 'emailaddr'],
                status: ['status', 'driverstatus', 'employmentstatus', 'empstatus'],
                hireDate: ['hiredate', 'datehired', 'dateofhire', 'startdate', 'employmentdate', 'hired', 'start'],
                terminationDate: ['terminationdate', 'termdate', 'termination', 'separationdate', 'enddate', 'lastday'],
                dob: ['dob', 'dateofbirth', 'birthdate', 'birthday', 'birth', 'bday'],
                endorsements: ['endorsements', 'endorsement', 'cdlendorsements', 'endorse'],
                restrictions: ['restrictions', 'restriction', 'cdlrestrictions', 'restrict'],
                emergencyName: ['emergencycontact', 'emergencyname', 'emergency', 'econtact', 'emergcontact', 'icename', 'icecontact'],
                emergencyPhone: ['emergencyphone', 'emergencynumber', 'emergencycontactphone', 'icephone', 'emergphone'],
                address: ['address', 'homeaddress', 'driveraddress', 'streetaddress', 'street', 'addr'],
                notes: ['notes', 'note', 'comments', 'comment', 'memo', 'remarks'],
                truck: ['truck', 'truckno', 'trucknumber', 'assignedtruck', 'unit', 'unitnumber', 'vehicle', 'assignedunit', 'equipment']
            }
        },
        inspection: {
            cols: [
                { key: 'date', type: 'date', required: true },
                { key: 'type', type: 'select', options: [
                    { value: 'level-1', label: 'Level I' }, { value: 'level-2', label: 'Level II' },
                    { value: 'level-3', label: 'Level III' }, { value: 'level-4', label: 'Level IV' },
                    { value: 'level-5', label: 'Level V' }, { value: 'citation', label: 'Citation' }
                ]},
                { key: 'reportNum', placeholder: 'Report #', type: 'text' },
                { key: 'result', type: 'select', options: [
                    { value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' },
                    { value: 'warning', label: 'Warning' }, { value: 'oos', label: 'Out of Service' }
                ]}
            ],
            collection: 'inspections',
            label: 'inspection',
            requiredKey: 'date',
            defaults: { violations: 0 },
            afterSave: async () => { await loadInspections(); },
            extraFields: ['driverName', 'truckUnit', 'location', 'violations', 'fineAmount', 'notes', 'inspStatus', 'paidStatus'],
            csvAliases: {
                date: ['date', 'inspectiondate', 'inspdate', 'dateofinspe', 'dateofinspection'],
                type: ['type', 'level', 'inspectiontype', 'insplevel', 'insptype', 'category'],
                reportNum: ['reportnum', 'reportnumber', 'report', 'reportno', 'inspectionreport', 'casenumber', 'caseno', 'case'],
                driverName: ['driver', 'drivername', 'driverfullname', 'operator', 'employeename'],
                truckUnit: ['truck', 'truckunit', 'unit', 'unitnumber', 'unitno', 'vehicle', 'vehicleno', 'equipment'],
                result: ['result', 'outcome', 'inspectionresult', 'pass', 'passfail', 'verdict', 'status'],
                violations: ['violations', 'violationcount', 'numviolations', 'viols', 'defects'],
                location: ['location', 'city', 'state', 'place', 'inspectionlocation', 'site'],
                fineAmount: ['fine', 'fineamount', 'penalty', 'amount', 'fee', 'cost'],
                notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'description', 'details']
            }
        },
        load: {
            cols: [
                { key: 'loadNumber', placeholder: 'e.g., 176-1', type: 'text', required: true },
                { key: 'unit', type: 'truck-select' },
                { key: 'origin', placeholder: 'City, ST', type: 'text' },
                { key: 'destination', placeholder: 'City, ST', type: 'text' },
                { key: 'broker', placeholder: 'Broker name', type: 'text' },
                { key: 'rate', placeholder: '0.00', type: 'number' },
                { key: 'mileage', placeholder: '0', type: 'number' },
                { key: 'detention', placeholder: '0.00', type: 'number' },
                { key: 'status', type: 'select', defaultLabel: 'Booked', options: [
                    { value: 'booked', label: 'Booked' }, { value: 'dispatched', label: 'Dispatched' },
                    { value: 'loaded', label: 'Loaded' }, { value: 'in-transit', label: 'In Transit' },
                    { value: 'delivered', label: 'Delivered' }, { value: 'invoiced', label: 'Invoiced' },
                    { value: 'paid', label: 'Paid' }, { value: 'canceled', label: 'Canceled' },
                    { value: 'issue', label: 'Issue' }
                ]},
                { key: 'deliveryDate', type: 'date' },
                { key: 'driver', type: 'driver-select' },
                { key: 'dispatcher', type: 'dispatcher-select' }
            ],
            collection: 'loads',
            label: 'load',
            requiredKey: 'loadNumber',
            duplicateKey: 'loadNumber',
            defaults: { status: 'booked' },
            afterSave: async () => { await loadLoads(); updateOverview(); updateDispatchOverview(); },
            extraFields: ['loadDate', 'comments'],
            csvAliases: {
                loadNumber: ['loadnumber', 'load', 'loadnum', 'loadid', 'loadno', 'number', 'no', 'id', 'order', 'ordernumber', 'orderno', 'orderid', 'pro', 'pronumber', 'prono', 'ref', 'reference', 'refnumber', 'refno', 'bol', 'bolnumber'],
                unit: ['unit', 'unitnumber', 'unitno', 'truck', 'truckno', 'trucknumber', 'vehicle', 'equipmentno'],
                origin: ['origin', 'from', 'pickup', 'pickuplocation', 'shipper', 'shippercity', 'originlocation', 'pickupcity', 'fromlocation', 'fromcity', 'pu', 'pulocation'],
                destination: ['destination', 'to', 'delivery', 'deliverylocation', 'receiver', 'receivercity', 'destlocation', 'deliverycity', 'tolocation', 'tocity', 'del', 'dellocation', 'consignee'],
                broker: ['broker', 'brokername', 'brokercompany', 'customer', 'customername', 'shipper', 'client', 'clientname', 'company'],
                rate: ['rate', 'loadrate', 'amount', 'price', 'totalrate', 'linehaul', 'linehaulrate', 'revenue', 'pay', 'loadpay'],
                mileage: ['mileage', 'miles', 'distance', 'totalmiles', 'loadmiles', 'mi', 'km', 'deadhead'],
                detention: ['detention', 'bonus', 'detbonus', 'detentionpay', 'accessorial', 'extra', 'lumper', 'tonu'],
                status: ['status', 'loadstatus', 'state', 'condition'],
                deliveryDate: ['deliverydate', 'deldate', 'delivery', 'delivered', 'deliveryday', 'dropoff', 'dropoffdate', 'duedate', 'eta'],
                driver: ['driver', 'drivername', 'assigneddriver', 'operator'],
                dispatcher: ['dispatcher', 'dispatchername', 'dispatch', 'coordinator', 'rep'],
                loadDate: ['loaddate', 'date', 'pickupdate', 'pudate', 'bookdate', 'bookeddate', 'created', 'createddate'],
                comments: ['comments', 'comment', 'notes', 'note', 'remarks', 'memo', 'description']
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
            // Autofill sibling cells ” only if user hasn't manually edited them
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

                // Merge extra fields from smart import (stored as data-extra_* attributes)
                if (config.extraFields) {
                    config.extraFields.forEach(key => {
                        const val = tr.dataset['extra_' + key];
                        if (val && !data[key]) data[key] = val;
                    });
                }

                // Collect validation issues ” store as warnings, never block
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
                // For drivers: split name into firstName + lastName for Firestore
                if (type === 'driver' && data.name) {
                    const parts = data.name.trim().split(/\s+/);
                    data.firstName = parts[0] || '';
                    data.lastName = parts.slice(1).join(' ') || '';
                    delete data.name;
                }
                // Uppercase state fields
                if (data.plateState) data.plateState = data.plateState.toUpperCase();
                if (data.cdlState) data.cdlState = data.cdlState.toUpperCase();
                normalizePayload(data, type);
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
        const thead = table?.querySelector('thead tr');
        if (state.trailers.length === 0) {
            table.style.display = 'none';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        table.style.display = '';
        const filtered = state.trailers.filter(t => matchesFilter(t, 'trailer'));
        const sorted = sortItems(filtered, sortState.trailers, 'trailer');
        bulkSelection.trailers = new Set([...bulkSelection.trailers].filter(id => sorted.some(t => t.id === id)));
        updateBulkBar('trailers');
        const visCols = getVisibleTableCols('trailers');
        const widths = computeTableColWidths('trailers');
        if (thead) {
            let h = '<th class="col-checkbox"><input type="checkbox" id="trailerSelectAll" title="Select all"></th><th class="col-validation"></th>';
            visCols.forEach(c => { h += '<th style="width:' + widths[c.key] + '%">' + c.label + '</th>'; });
            h += '<th style="width:7%"></th>';
            thead.innerHTML = h;
        }
        const selAll = thead?.querySelector('#trailerSelectAll');
        if (selAll) selAll.onchange = () => toggleSelectAll('trailers', selAll);
        tbody.innerHTML = sorted.map(t => {
            let cells = '<td class="col-checkbox"><input type="checkbox" class="bulk-cb" data-id="' + t.id + '" ' + (bulkSelection.trailers.has(t.id) ? 'checked' : '') + ' onchange="Dashboard.toggleBulkSelect(\'trailers\',\'' + t.id + '\',this)"></td>';
            cells += validationIndicator(t);
            visCols.forEach(c => { cells += trailerCell(t, c.key); });
            cells += '<td class="row-actions"><div class="cell"><button title="Edit" onclick="Dashboard.editTrailer(\'' + t.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button title="Delete" class="btn-delete" onclick="Dashboard.deleteTrailer(\'' + t.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></td>';
            return '<tr data-id="' + t.id + '" class="' + (bulkSelection.trailers.has(t.id) ? 'row-selected' : '') + ' ' + (t.doNotDispatch ? 'row-dnd' : '') + ' ' + (t.validationStatus === 'error' ? 'row-validation-error' : t.validationStatus === 'warning' ? 'row-validation-warning' : '') + '">' + cells + '</tr>';
        }).join('');
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
        $('addTrailerBtn').addEventListener('click', () => openUnifiedSheet('trailer', null, {mode:'add'}));
        $('addFirstTrailer').addEventListener('click', () => openUnifiedSheet('trailer', null, {mode:'add'}));
        $('closeTrailerModal').addEventListener('click', () => $('trailerModal').classList.add('hidden'));
        $('cancelTrailer').addEventListener('click', () => $('trailerModal').classList.add('hidden'));

        const importTrailerBtn = $('importTrailersBtn');
        if (importTrailerBtn) {
            importTrailerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showImportDropdown(importTrailerBtn, smartImportTrailers);
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
            const payload = normalizePayload({
                unit: $('trailerUnit').value.trim(),
                year: $('trailerYear').value.trim(),
                make: $('trailerMake').value.trim(),
                type: $('trailerType').value,
                vin: $('trailerVin').value.trim(),
                plate: $('trailerPlate').value.trim(),
                status: $('trailerStatus').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, 'trailer');
            try {
                const editId = $('trailerEditId').value;
                if (payload.vin && payload.vin.length === 17) {
                    const dup = await checkDuplicate('trailers', 'vin', payload.vin, editId);
                    if (dup && !confirm('A trailer with VIN ' + payload.vin + ' already exists (Unit: ' + (dup.data().unit || '?') + '). Save anyway?')) return;
                }
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
        const thead = table?.querySelector('thead tr');
        if (state.drivers.length === 0) {
            table.style.display = 'none';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        table.style.display = '';
        const filtered = state.drivers.filter(d => matchesFilter(d, 'driver'));
        const sorted = sortItems(filtered, sortState.drivers, 'driver');
        bulkSelection.drivers = new Set([...bulkSelection.drivers].filter(id => sorted.some(d => d.id === id)));
        updateBulkBar('drivers');
        const visCols = getVisibleTableCols('drivers');
        const widths = computeTableColWidths('drivers');
        if (thead) {
            let h = '<th class="col-checkbox"><input type="checkbox" id="driverSelectAll" title="Select all"></th><th class="col-validation"></th>';
            visCols.forEach(c => { h += '<th style="width:' + widths[c.key] + '%">' + c.label + '</th>'; });
            h += '<th style="width:8%"></th>';
            thead.innerHTML = h;
        }
        const selAll = thead?.querySelector('#driverSelectAll');
        if (selAll) selAll.onchange = () => toggleSelectAll('drivers', selAll);
        tbody.innerHTML = sorted.map(d => {
            let cells = '<td class="col-checkbox"><input type="checkbox" class="bulk-cb" data-id="' + d.id + '" ' + (bulkSelection.drivers.has(d.id) ? 'checked' : '') + ' onchange="Dashboard.toggleBulkSelect(\'drivers\',\'' + d.id + '\',this)"></td>';
            cells += validationIndicator(d);
            visCols.forEach(c => { cells += driverCell(d, c.key); });
            cells += '<td class="row-actions"><div class="cell"><button title="Edit" onclick="Dashboard.editDriver(\'' + d.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button title="Delete" class="btn-delete" onclick="Dashboard.deleteDriver(\'' + d.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></td>';
            return '<tr data-id="' + d.id + '" class="' + (bulkSelection.drivers.has(d.id) ? 'row-selected' : '') + ' ' + (d.doNotDispatch ? 'row-dnd' : '') + ' ' + (d.validationStatus === 'error' ? 'row-validation-error' : d.validationStatus === 'warning' ? 'row-validation-warning' : '') + '">' + cells + '</tr>';
        }).join('');
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
        $('addDriverBtn').addEventListener('click', () => openUnifiedSheet('driver', null, {mode:'add'}));
        $('addFirstDriver').addEventListener('click', () => openUnifiedSheet('driver', null, {mode:'add'}));
        $('closeDriverModal').addEventListener('click', () => $('driverModal').classList.add('hidden'));
        $('cancelDriver').addEventListener('click', () => $('driverModal').classList.add('hidden'));

        const importDriverBtn = $('importDriversBtn');
        if (importDriverBtn) {
            importDriverBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showImportDropdown(importDriverBtn, smartImportDrivers);
            });
        }

        $('driverForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = normalizePayload({
                firstName: $('driverFirstName').value.trim(),
                lastName: $('driverLastName').value.trim(),
                cdl: $('driverCdl').value.trim(),
                cdlState: $('driverCdlState').value.trim(),
                cdlExp: $('driverCdlExp').value,
                medExp: $('driverMedExp').value,
                phone: $('driverPhone').value.trim(),
                email: $('driverEmail').value.trim(),
                truck: $('driverTruck').value,
                status: $('driverStatus').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, 'driver');
            try {
                const editId = $('driverEditId').value;
                if (payload.cdl) {
                    const dup = await checkDuplicate('drivers', 'cdl', payload.cdl, editId);
                    if (dup) { const dd = dup.data(); if (!confirm('A driver with CDL ' + payload.cdl + ' already exists (' + (dd.firstName || '') + ' ' + (dd.lastName || '') + '). Save anyway?')) return; }
                }
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
        return parts.length ? parts.join(' ') : '”';
    }

    function shortenVin(vin) {
        if (!vin) return '”';
        const v = String(vin);
        return v.length > 10 ? '…' + escapeHtml(v.slice(-8)) : escapeHtml(v);
    }

    function fuelLabel(val) {
        const opts = getDropdownOptions('truckFuel');
        const match = opts.find(o => o.value === val);
        return match ? match.label : escapeHtml(val || '”');
    }

    function trailerTypeLabel(val) {
        const opts = getDropdownOptions('trailerType');
        const match = opts.find(o => o.value === val);
        return match ? match.label : escapeHtml(val || '”');
    }

    function truckLabel(truckId) {
        if (!truckId) return '”';
        const t = state.trucks.find(tr => tr.id === truckId);
        return t ? t.unit : '”';
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
            const stateArr = state[collection] || [];
            const item = stateArr.find(x => x.id === id);
            if (item) item.status = newStatus;

            // Re-render
            if (collection === 'trucks') { renderTrucks(); populateTruckDropdown(); }
            else if (collection === 'trailers') renderTrailers();
            else if (collection === 'loads') renderLoads();
            else if (collection === 'inspections') renderInspections();
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
        if (type === 'load') {
            return [item.loadNumber, item.unit, item.origin, item.destination, item.broker, item.driver, item.dispatcher, item.comments].some(v => v && String(v).toLowerCase().includes(q));
        }
        if (type === 'inspection') {
            const typeF = $('inspectionTypeFilter');
            const resultF = $('inspectionResultFilter');
            const statusF = $('inspectionStatusFilter');
            const tf = typeF ? typeF.value : '';
            const rf = resultF ? resultF.value : '';
            const sf = statusF ? statusF.value : '';
            if (tf && item.type !== tf) return false;
            if (rf && item.result !== rf) return false;
            if (sf && (item.inspStatus || 'open') !== sf) return false;
            if (!q) return true;
            return [item.reportNum, item.driverName, item.truckUnit, item.location, item.type, item.result, item.notes].some(v => v && String(v).toLowerCase().includes(q));
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
        ['loadSearch', 'loadStatusFilter'].forEach(id => {
            const el = $(id);
            if (el) el.addEventListener('input', renderLoads);
        });
        ['inspectionSearch', 'inspectionTypeFilter', 'inspectionResultFilter', 'inspectionStatusFilter'].forEach(id => {
            const el = $(id);
            if (el) el.addEventListener('input', renderInspections);
        });
        // Sort dropdowns
        const truckSort = $('truckSort');
        if (truckSort) truckSort.addEventListener('change', () => { sortState.trucks = truckSort.value; renderTrucks(); });
        const trailerSort = $('trailerSort');
        if (trailerSort) trailerSort.addEventListener('change', () => { sortState.trailers = trailerSort.value; renderTrailers(); });
        const driverSort = $('driverSort');
        if (driverSort) driverSort.addEventListener('change', () => { sortState.drivers = driverSort.value; renderDrivers(); });
        const loadSort = $('loadSort');
        if (loadSort) loadSort.addEventListener('change', () => { sortState.loads = loadSort.value; renderLoads(); });
        const inspSort = $('inspectionSort');
        if (inspSort) inspSort.addEventListener('change', () => { sortState.inspections = inspSort.value; renderInspections(); });
        // Select-all checkboxes
        const truckSelAll = $('truckSelectAll');
        if (truckSelAll) truckSelAll.addEventListener('change', () => toggleSelectAll('trucks', truckSelAll));
        const trailerSelAll = $('trailerSelectAll');
        if (trailerSelAll) trailerSelAll.addEventListener('change', () => toggleSelectAll('trailers', trailerSelAll));
        const driverSelAll = $('driverSelectAll');
        if (driverSelAll) driverSelAll.addEventListener('change', () => toggleSelectAll('drivers', driverSelAll));
        const loadSelAll = $('loadSelectAll');
        if (loadSelAll) loadSelAll.addEventListener('change', () => toggleSelectAll('loads', loadSelAll));
    }

    // ── LOADS ─────────────────────────────
    async function loadLoads() {
        try {
            const snap = await col('loads').orderBy('loadDate', 'desc').get();
            state.loads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderLoads();
            updateCount('loadCount', state.loads.length);
        } catch (e) { console.error('Load loads error:', e); }
    }

    function formatCurrency(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '';
        return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function calcRPM(rate, mileage) {
        const r = parseFloat(rate);
        const m = parseFloat(mileage);
        if (!r || !m) return '';
        return '$' + (r / m).toFixed(2);
    }

    function calcTotal(rate, detention) {
        const r = parseFloat(rate) || 0;
        const d = parseFloat(detention) || 0;
        return r + d;
    }

    function loadStatusBadge(status) {
        const map = {
            booked: 'load-badge-booked',
            dispatched: 'load-badge-dispatched',
            loaded: 'load-badge-loaded',
            'in-transit': 'load-badge-transit',
            delivered: 'load-badge-delivered',
            invoiced: 'load-badge-invoiced',
            paid: 'load-badge-paid',
            canceled: 'load-badge-canceled',
            issue: 'load-badge-issue'
        };
        const cls = map[status] || '';
        const label = (DROPDOWN_DEFS.loadStatus.defaults.find(o => o.value === status) || {}).label || status || '';
        return `<span class="load-badge ${cls}">${escapeHtml(label)}</span>`;
    }

    function renderLoads() {
        const tbody = $('loadsTableBody');
        const table = $('loadsTable');
        const empty = $('loadsEmpty');
        const thead = table?.querySelector('thead tr');
        if (!tbody) return;
        if (state.loads.length === 0) {
            if (table) table.style.display = 'none';
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';
        if (table) table.style.display = '';
        const filtered = state.loads.filter(l => matchesFilter(l, 'load'));
        const sorted = sortItems(filtered, sortState.loads, 'load');
        bulkSelection.loads = new Set([...bulkSelection.loads].filter(id => sorted.some(l => l.id === id)));
        updateBulkBar('loads');
        // Show/hide bulk edit button
        const bulkEditBtn = $('bulkEditLoadsBtn');
        if (bulkEditBtn) bulkEditBtn.style.display = bulkSelection.loads.size > 0 ? '' : 'none';

        if (thead) thead.innerHTML = `<th class="col-checkbox"><input type="checkbox" id="loadSelectAll" title="Select all"></th><th style="width:3%">#</th><th style="width:5%">Unit</th><th style="width:11%">From</th><th style="width:11%">To</th><th style="width:7%">Broker</th><th style="width:6%">Rate</th><th style="width:5%">Mileage</th><th style="width:4%">RPM</th><th style="width:5%">Det/Bonus</th><th style="width:7%">Status</th><th style="width:7%">DEL Date</th><th style="width:6%">Total</th><th style="width:7%">Driver</th><th style="width:7%">Dispatcher</th><th style="width:6%">Comments</th><th style="width:4%"></th>`;
        const selAll = thead?.querySelector('#loadSelectAll');
        if (selAll) selAll.onchange = () => toggleSelectAll('loads', selAll);
        tbody.innerHTML = sorted.map((l, i) => {
            const rpm = calcRPM(l.rate, l.mileage);
            const total = calcTotal(l.rate, l.detention);
            const rcIcon = l.rcUrl
                ? '<button class="load-doc-btn uploaded" data-doc="rc" data-id="' + l.id + '" title="RC uploaded — click to replace"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></button>'
                : '<button class="load-doc-btn" data-doc="rc" data-id="' + l.id + '" title="Upload Rate Confirmation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>';
            const podIcon = l.podUrl
                ? '<button class="load-doc-btn uploaded" data-doc="pod" data-id="' + l.id + '" title="POD uploaded — click to replace"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></button>'
                : '<button class="load-doc-btn" data-doc="pod" data-id="' + l.id + '" title="Upload Proof of Delivery"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>';
            return `<tr data-id="${l.id}" class="${bulkSelection.loads.has(l.id) ? 'row-selected' : ''}">
            <td class="col-checkbox"><input type="checkbox" class="bulk-cb" data-id="${l.id}" ${bulkSelection.loads.has(l.id) ? 'checked' : ''} onchange="Dashboard.toggleBulkSelect('loads','${l.id}',this)"></td>
            <td><div class="cell cell-muted">${i + 1}</div></td>
            <td><div class="cell">${escapeHtml(l.unit || '')}</div></td>
            <td><div class="cell load-cell-with-doc"><span>${escapeHtml(l.origin || '')}</span>${rcIcon}</div></td>
            <td><div class="cell load-cell-with-doc"><span>${escapeHtml(l.destination || '')}</span>${podIcon}</div></td>
            <td><div class="cell">${escapeHtml(l.broker || '')}</div></td>
            <td><div class="cell">${l.rate ? formatCurrency(l.rate) : ''}</div></td>
            <td><div class="cell">${escapeHtml(l.mileage ? String(l.mileage) : '')}</div></td>
            <td><div class="cell load-rpm">${escapeHtml(rpm)}</div></td>
            <td><div class="cell">${l.detention ? formatCurrency(l.detention) : ''}</div></td>
            <td><div class="cell">${loadStatusBadge(l.status)}</div></td>
            <td><div class="cell">${escapeHtml(l.deliveryDate || '')}</div></td>
            <td><div class="cell"><strong>${total ? formatCurrency(total) : ''}</strong></div></td>
            <td><div class="cell">${escapeHtml(l.driver || '')}</div></td>
            <td><div class="cell">${escapeHtml(l.dispatcher || '')}</div></td>
            <td><div class="cell cell-muted" title="${escapeHtml(l.comments || '')}">${escapeHtml((l.comments || '').substring(0, 30))}${(l.comments || '').length > 30 ? '…' : ''}</div></td>
            <td class="row-actions"><div class="cell">
                <button title="Edit" onclick="Dashboard.editLoad('${l.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button title="Delete" class="btn-delete" onclick="Dashboard.deleteLoad('${l.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div></td>
        </tr>`;
        }).join('');
        updateDispatchOverview();
    }

    function openLoadModal(data) {
        $('loadModalTitle').textContent = data ? 'Edit Load' : 'New Load';
        $('loadEditId').value = data ? data.id : '';
        $('loadDate').value = data ? data.loadDate || '' : new Date().toISOString().split('T')[0];
        $('loadNumber').value = data ? data.loadNumber || '' : '';
        $('loadUnit').value = data ? data.unit || '' : '';
        $('loadOrigin').value = data ? data.origin || '' : '';
        $('loadDestination').value = data ? data.destination || '' : '';
        $('loadBroker').value = data ? data.broker || '' : '';
        $('loadRate').value = data ? data.rate || '' : '';
        $('loadMileage').value = data ? data.mileage || '' : '';
        $('loadDetention').value = data ? data.detention || '' : '';
        $('loadStatus').value = data ? data.status || 'booked' : 'booked';
        $('loadDeliveryDate').value = data ? data.deliveryDate || '' : '';
        $('loadDriver').value = data ? data.driver || '' : '';
        $('loadComments').value = data ? data.comments || '' : '';
        // Populate dispatcher dropdown with users who have Dispatcher role
        const dispatcherSel = $('loadDispatcher');
        if (dispatcherSel && dispatcherSel.tagName === 'SELECT') {
            const currentDisp = data ? data.dispatcher || '' : '';
            const dispatchers = (state.companyDashboard && state.companyDashboard.users || []).filter(u => u.role === 'Dispatcher');
            const dOpts = '<option value="">—</option>' + dispatchers.map(u => `<option value="${escapeHtml(u.name)}" ${u.name === currentDisp ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('');
            dispatcherSel.innerHTML = dOpts;
            if (currentDisp) dispatcherSel.value = currentDisp;
        }
        // Populate unit dropdown with active trucks
        const unitSel = $('loadUnit');
        if (unitSel) {
            const current = unitSel.value;
            const opts = '<option value="">”</option>' + state.trucks.map(t => `<option value="${escapeHtml(t.unit)}" ${t.unit === current ? 'selected' : ''}>${escapeHtml(t.unit)}</option>`).join('');
            unitSel.innerHTML = opts;
            if (current) unitSel.value = current;
        }
        // Populate driver dropdown with active drivers
        const driverSel = $('loadDriver');
        if (driverSel && driverSel.tagName === 'SELECT') {
            const current = driverSel.value;
            const opts = '<option value="">”</option>' + state.drivers.filter(d => !d.doNotDispatch).map(d => {
                const name = (d.firstName || '') + ' ' + (d.lastName || '');
                return `<option value="${escapeHtml(name.trim())}" ${name.trim() === current ? 'selected' : ''}>${escapeHtml(name.trim())}</option>`;
            }).join('');
            driverSel.innerHTML = opts;
            if (current) driverSel.value = current;
        }
        $('loadModal').classList.remove('hidden');
        // Show route if both origin & destination exist
        setTimeout(() => calcLoadRoute(), 200);
    }

    /* ── Load Route Map (Google Maps) ── */
    let _loadMap = null;
    let _loadDirService = null;
    let _loadDirRenderer = null;

    function isGMaps() { return !!(window.google && google.maps && google.maps.DirectionsService); }

    function resolveZipToCity(zip) {
        return new Promise(resolve => {
            if (!isGMaps()) return resolve(null);
            new google.maps.Geocoder().geocode(
                { address: zip, componentRestrictions: { country: 'US' } },
                (results, status) => {
                    if (status !== 'OK' || !results[0]) return resolve(null);
                    let city = '', st = '';
                    results[0].address_components.forEach(c => {
                        if (c.types.includes('locality')) city = c.long_name;
                        if (!city && c.types.includes('sublocality_level_1')) city = c.long_name;
                        if (!city && c.types.includes('administrative_area_level_2')) city = c.long_name;
                        if (c.types.includes('administrative_area_level_1')) st = c.short_name;
                    });
                    resolve(city && st ? city + ', ' + st : null);
                }
            );
        });
    }

    function ensureLoadMap() {
        const container = $('loadRouteMap');
        if (!container || !isGMaps()) return false;
        if (!_loadMap) {
            _loadMap = new google.maps.Map(container, {
                center: { lat: 39.8283, lng: -98.5795 },
                zoom: 4,
                disableDefaultUI: true,
                zoomControl: true,
                gestureHandling: 'cooperative',
                styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
            });
            _loadDirService = new google.maps.DirectionsService();
            _loadDirRenderer = new google.maps.DirectionsRenderer({
                map: _loadMap,
                suppressMarkers: false,
                polylineOptions: { strokeColor: '#6366f1', strokeWeight: 4, strokeOpacity: 0.8 }
            });
        }
        return true;
    }

    function calcLoadRoute() {
        const originVal = ($('loadOrigin') || {}).value || '';
        const destVal = ($('loadDestination') || {}).value || '';
        const mapEl = $('loadRouteMap');
        const infoEl = $('loadRouteInfo');
        if (!originVal.trim() || !destVal.trim() || !isGMaps()) {
            if (mapEl) mapEl.style.display = 'none';
            if (infoEl) infoEl.style.display = 'none';
            return;
        }
        if (!ensureLoadMap()) return;
        mapEl.style.display = 'block';
        google.maps.event.trigger(_loadMap, 'resize');
        _loadDirService.route({
            origin: originVal.trim(),
            destination: destVal.trim(),
            travelMode: google.maps.TravelMode.DRIVING
        }, (result, status) => {
            if (status === 'OK' && result.routes[0]) {
                _loadDirRenderer.setDirections(result);
                const leg = result.routes[0].legs[0];
                const miles = Math.round(leg.distance.value * 0.000621371);
                const mileageInput = $('loadMileage');
                if (mileageInput) mileageInput.value = miles;
                if (infoEl) {
                    infoEl.style.display = 'flex';
                    infoEl.innerHTML = '<span>' + escapeHtml(leg.distance.text) + '</span><span>' + escapeHtml(leg.duration.text) + '</span>';
                }
            } else {
                if (mapEl) mapEl.style.display = 'none';
                if (infoEl) infoEl.style.display = 'none';
            }
        });
    }

    async function handleLoadLocationBlur(input) {
        const val = input.value.trim();
        if (/^\d{5}$/.test(val)) {
            const resolved = await resolveZipToCity(val);
            if (resolved) input.value = resolved;
        }
        calcLoadRoute();
    }

    function wireLoadLocationEvents() {
        ['loadOrigin', 'loadDestination'].forEach(id => {
            const input = $(id);
            if (!input) return;
            input.addEventListener('blur', () => handleLoadLocationBlur(input));
        });
    }

    function initLoadForm() {
        // New Load → open modal (with route map)
        const addBtn = $('addLoadBtn');
        if (addBtn) addBtn.addEventListener('click', () => openLoadModal(null));
        const addFirst = $('addFirstLoad');
        if (addFirst) addFirst.addEventListener('click', () => openLoadModal(null));
        // Import → open unified sheet in add mode (import button triggers file picker inside usheet)
        const importBtn = $('importLoadsBtn');
        if (importBtn) importBtn.addEventListener('click', () => openUnifiedSheet('load', [], { mode: 'add' }));
        // Bulk edit selected
        const bulkEditBtn = $('bulkEditLoadsBtn');
        if (bulkEditBtn) bulkEditBtn.addEventListener('click', () => {
            const ids = [...bulkSelection.loads];
            if (!ids.length) return;
            const items = state.loads.filter(l => ids.includes(l.id));
            openUnifiedSheet('load', items, { mode: 'edit' });
        });
        // Keep modal for single-load edit from row actions
        const closeBtn = $('closeLoadModal');
        if (closeBtn) closeBtn.addEventListener('click', () => $('loadModal').classList.add('hidden'));
        const cancelBtn = $('cancelLoad');
        if (cancelBtn) cancelBtn.addEventListener('click', () => $('loadModal').classList.add('hidden'));

        const form = $('loadForm');
        if (form) form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                loadDate: $('loadDate').value.trim(),
                loadNumber: $('loadNumber').value.trim(),
                unit: $('loadUnit').value,
                origin: $('loadOrigin').value.trim(),
                destination: $('loadDestination').value.trim(),
                broker: $('loadBroker').value.trim(),
                rate: $('loadRate').value.trim(),
                mileage: $('loadMileage').value.trim(),
                detention: $('loadDetention').value.trim(),
                status: $('loadStatus').value,
                deliveryDate: $('loadDeliveryDate').value.trim(),
                driver: $('loadDriver').value,
                dispatcher: $('loadDispatcher').value,
                comments: $('loadComments').value.trim(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (!payload.loadNumber) { showMsg('Load # is required', true); return; }
            try {
                const editId = $('loadEditId').value;
                if (editId) {
                    await col('loads').doc(editId).update(payload);
                } else {
                    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await col('loads').add(payload);
                }
                $('loadModal').classList.add('hidden');
                await loadLoads();
                updateOverview();
                showMsg(editId ? 'Load updated' : 'Load added');
            } catch (err) {
                console.error('Save load error:', err);
                showMsg('Error saving load', true);
            }
        });
    }

    function editLoad(id) {
        const load = state.loads.find(l => l.id === id);
        if (load) openLoadModal(load);
    }

    async function deleteLoad(id) {
        if (!confirm('Delete this load?')) return;
        try {
            await col('loads').doc(id).delete();
            await loadLoads();
            updateOverview();
            showMsg('Load deleted');
        } catch (err) {
            console.error('Delete load error:', err);
            showMsg('Error deleting load', true);
        }
    }

    // ── Load Document Upload (RC / POD) ────────────────
    let loadDocTarget = { loadId: null, docType: null };
    const MAX_LOAD_DOC_SIZE = 10 * 1024 * 1024; // 10MB

    function initLoadDocUpload() {
        const fileInput = $('loadDocUpload');
        if (!fileInput) return;
        // Delegated click on table body for .load-doc-btn
        const tbody = $('loadsTableBody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('.load-doc-btn');
                if (!btn) return;
                e.stopPropagation();
                loadDocTarget.loadId = btn.dataset.id;
                loadDocTarget.docType = btn.dataset.doc;
                fileInput.value = '';
                fileInput.click();
            });
        }
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (!file) return;
            if (file.size > MAX_LOAD_DOC_SIZE) { showMsg('File too large (max 10MB)', true); return; }
            await uploadLoadDoc(loadDocTarget.loadId, loadDocTarget.docType, file);
        });
    }

    async function uploadLoadDoc(loadId, docType, file) {
        if (!loadId || !docType || !file) return;
        const uid = firebase.auth().currentUser?.uid;
        if (!uid) { showMsg('Not authenticated', true); return; }
        const ts = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `users/${uid}/loads/${loadId}/docs/${docType}_${ts}_${safeName}`;
        try {
            showMsg('Uploading ' + (docType === 'rc' ? 'Rate Confirmation' : 'Proof of Delivery') + '...');
            const ref = storage.ref(storagePath);
            await ref.put(file);
            const url = await ref.getDownloadURL();
            const update = {};
            update[docType + 'Url'] = url;
            update[docType + 'Name'] = file.name;
            update[docType + 'Path'] = storagePath;
            update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            await col('loads').doc(loadId).update(update);
            // Update local state
            const load = state.loads.find(l => l.id === loadId);
            if (load) {
                load[docType + 'Url'] = url;
                load[docType + 'Name'] = file.name;
                load[docType + 'Path'] = storagePath;
            }
            renderLoads();
            showMsg((docType === 'rc' ? 'Rate Confirmation' : 'Proof of Delivery') + ' uploaded');
        } catch (err) {
            console.error('Upload load doc error:', err);
            showMsg('Error uploading document', true);
        }
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
                    id: d.id,
                    name: [d.firstName, d.lastName].filter(Boolean).join(' ').trim() || 'Unnamed driver',
                    phone: (d.phone || '').trim(),
                    cdl: (d.cdl || '').trim()
                }))
            });
        }

        // IFTA quarterly filing deadlines
        const nowDate = new Date();
        const iftaAlertDeadlines = [
            { q: 'Q1', month: 3, day: 30, label: 'Q1 (Jan\u2013Mar)' },
            { q: 'Q2', month: 6, day: 31, label: 'Q2 (Apr\u2013Jun)' },
            { q: 'Q3', month: 9, day: 31, label: 'Q3 (Jul\u2013Sep)' },
            { q: 'Q4', month: 0, day: 31, label: 'Q4 (Oct\u2013Dec)', nextYear: true }
        ];
        iftaAlertDeadlines.forEach(dl => {
            const yr = dl.nextYear && nowDate.getMonth() >= 10 ? nowDate.getFullYear() + 1 : nowDate.getFullYear();
            const deadline = new Date(yr, dl.month, dl.day);
            const daysLeft = Math.ceil((deadline - nowDate) / 86400000);
            if (daysLeft >= 0 && daysLeft <= 30) {
                alerts.push({
                    type: daysLeft <= 7 ? 'danger' : 'warning',
                    icon: 'clock', link: '/',
                    text: 'IFTA ' + dl.label + ' filing due in ' + daysLeft + ' day' + (daysLeft !== 1 ? 's' : '')
                });
            }
        });

        // MCS-150 biennial update alert
        if (state.fmcsaSnapshot && state.fmcsaSnapshot.mcs150FormDate) {
            const lastFiled = new Date(state.fmcsaSnapshot.mcs150FormDate);
            if (!isNaN(lastFiled.getTime())) {
                const nextDue = new Date(lastFiled);
                nextDue.setFullYear(nextDue.getFullYear() + 2);
                const daysMcs = Math.ceil((nextDue - nowDate) / 86400000);
                if (daysMcs < 0) {
                    alerts.push({ type: 'danger', icon: 'alert', text: 'MCS-150 biennial update is OVERDUE \u2014 file immediately' });
                } else if (daysMcs <= 60) {
                    alerts.push({ type: daysMcs <= 30 ? 'danger' : 'warning', icon: 'clock', text: 'MCS-150 biennial update due in ' + daysMcs + ' day' + (daysMcs !== 1 ? 's' : '') });
                }
            }
        }

        const container = $('overviewAlerts');
        const safetyContainer = $('safetyAlerts');

        const iconMap = {
            clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
            alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
            user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
        };

        // Split: unassigned drivers + IFTA → safety, rest → overview
        const safetyAlerts = alerts.filter(a => a.kind === 'unassigned-drivers' || a.link);
        const overviewAlerts = alerts.filter(a => a.kind !== 'unassigned-drivers' && !a.link);

        function renderAlertsTo(target, list) {
            if (!target) return;
            if (list.length === 0) { target.innerHTML = ''; return; }
            target.innerHTML = list.map((a) => {
                if (a.kind === 'unassigned-drivers') {
                    const activeTrucks = state.trucks.filter(t => t.status === 'active');
                    const truckBtns = activeTrucks.map(t =>
                        '<button type="button" class="alert-assign-option" data-truck-id="' + escapeHtml(t.id) + '">' + escapeHtml(t.unit) + '</button>'
                    ).join('') || '<div style="padding:0.4rem 0.5rem;font-size:0.62rem;color:var(--gray-400)">No active trucks</div>';
                    const rows = (a.drivers || []).map((driver) => {
                        const meta = [driver.cdl ? ('CDL: ' + driver.cdl) : '', driver.phone].filter(Boolean).join(' \u00b7 ');
                        return `<li class="alert-unassigned-row">`
                            + `<span class="alert-unassigned-name" data-driver-id="${escapeHtml(driver.id)}">${escapeHtml(driver.name)}</span>`
                            + (meta ? `<span class="alert-unassigned-meta">${escapeHtml(meta)}</span>` : '')
                            + `<div class="alert-assign-wrap" data-driver-id="${escapeHtml(driver.id)}">`
                            + `<button type="button" class="alert-assign-btn" title="Assign truck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></button>`
                            + `<div class="alert-assign-popup">${truckBtns}</div>`
                            + `</div>`
                            + `</li>`;
                    }).join('');
                    return `<div class="alert-item alert-${escapeHtml(a.type)} alert-unassigned">`
                        + `<div class="alert-unassigned-header">${iconMap[a.icon] || ''}<span>${escapeHtml(a.text)}</span>`
                        + `<svg class="alert-unassigned-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`
                        + `</div>`
                        + `<ul class="alert-unassigned-list">${rows}</ul>`
                        + `</div>`;
                }
                if (a.link) {
                    return `<a href="${escapeHtml(a.link)}" onclick="sessionStorage.setItem('fromDashboard','true')" class="alert-item alert-${escapeHtml(a.type)} alert-link" title="Go to IFTA Wizard">${iconMap[a.icon] || ''}<span>${escapeHtml(a.text)}</span>`
                        + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="alert-link-arrow"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></a>`;
                }
                return `<div class="alert-item alert-${escapeHtml(a.type)}">${iconMap[a.icon] || ''}<span>${escapeHtml(a.text)}</span></div>`;
            }).join('');
            wireAlertHandlers(target);
        }

        function wireAlertHandlers(target) {
            target.querySelectorAll('.alert-unassigned').forEach((card) => {
                let openTimer = null, closeTimer = null;
                const hdr = card.querySelector('.alert-unassigned-header');
                if (hdr) { hdr.style.cursor = 'pointer'; hdr.addEventListener('click', () => card.classList.toggle('open')); }
                card.addEventListener('mouseenter', () => { clearTimeout(closeTimer); openTimer = setTimeout(() => card.classList.add('open'), 300); });
                card.addEventListener('mouseleave', () => { clearTimeout(openTimer); closeTimer = setTimeout(() => card.classList.remove('open'), 400); });
            });
            target.querySelectorAll('.alert-unassigned-name[data-driver-id]').forEach((el) => {
                el.addEventListener('click', () => openDriverProfile(el.dataset.driverId));
            });
            target.querySelectorAll('.alert-assign-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const wrap = btn.closest('.alert-assign-wrap');
                    const wasOpen = wrap.classList.contains('open');
                    target.querySelectorAll('.alert-assign-wrap.open').forEach(w => w.classList.remove('open'));
                    if (!wasOpen) wrap.classList.add('open');
                });
            });
            target.querySelectorAll('.alert-assign-option').forEach((opt) => {
                opt.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const wrap = opt.closest('.alert-assign-wrap');
                    const driverId = wrap.dataset.driverId;
                    const truckId = opt.dataset.truckId;
                    wrap.classList.remove('open');
                    try {
                        await col('drivers').doc(driverId).update({ truck: truckId, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                        const d = state.drivers.find(x => x.id === driverId);
                        if (d) d.truck = truckId;
                        const truck = state.trucks.find(t => t.id === truckId);
                        showMsg('Assigned to ' + (truck ? truck.unit : 'truck'));
                        renderDrivers();
                        updateOverview();
                    } catch (err) { console.error(err); showMsg('Error assigning truck', true); }
                });
            });
        }

        renderAlertsTo(container, overviewAlerts);
        renderAlertsTo(safetyContainer, safetyAlerts);
    }

    function populateTruckDropdown() {
        const sel = $('driverTruck');
        const current = sel.value;
        sel.innerHTML = '<option value="">Unassigned</option>';
        state.trucks.filter(t => t.status === 'active').forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.unit + (t.make ? ' “ ' + t.make + ' ' + (t.model || '') : '');
            sel.appendChild(opt);
        });
        sel.value = current;
    }

    function updateCount(elId, n) {
        const el = $(elId);
        if (el) el.textContent = n;
    }

    function updateOverview() {
        $('overviewTrucks').textContent = state.trucks.length;
        $('overviewTrailers').textContent = state.trailers.length;
        $('overviewDrivers').textContent = state.drivers.length;
        // Safety counts
        const st = $('safetyTruckCount'); if (st) st.textContent = state.trucks.length;
        const str = $('safetyTrailerCount'); if (str) str.textContent = state.trailers.length;
        const sd = $('safetyDriverCount'); if (sd) sd.textContent = state.drivers.length;
        // All department DTT counts
        document.querySelectorAll('[data-dtt-count="trucks"]').forEach(el => el.textContent = state.trucks.length);
        document.querySelectorAll('[data-dtt-count="trailers"]').forEach(el => el.textContent = state.trailers.length);
        document.querySelectorAll('[data-dtt-count="drivers"]').forEach(el => el.textContent = state.drivers.length);
        populateOverviewDropdowns();
        updateAlerts();
    }

    /* ── Dispatch Overview aggregation ── */
    let _dispatchTab = 'driver';

    function updateDispatchOverview() {
        const loads = state.loads.filter(l => l.status !== 'canceled');
        const totalLoads = loads.length;
        let totalMiles = 0, totalGross = 0, rpmCount = 0, rpmSum = 0;
        loads.forEach(l => {
            const m = parseFloat(l.mileage) || 0;
            const r = parseFloat(l.rate) || 0;
            const d = parseFloat(l.detention) || 0;
            totalMiles += m;
            totalGross += r + d;
            if (m > 0 && r > 0) { rpmSum += r / m; rpmCount++; }
        });
        const avgMiles = totalLoads ? Math.round(totalMiles / totalLoads) : 0;
        const avgRate = totalLoads ? totalGross / totalLoads : 0;
        const avgRPM = rpmCount ? rpmSum / rpmCount : 0;
        const el = id => $(id);
        el('dispTotalLoads').textContent = totalLoads;
        el('dispTotalMiles').textContent = totalMiles.toLocaleString();
        el('dispAvgMiles').textContent = avgMiles.toLocaleString();
        el('dispGrossRevenue').textContent = '$' + totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        el('dispAvgRate').textContent = '$' + avgRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        el('dispAvgRPM').textContent = '$' + avgRPM.toFixed(2);
        renderDispatchBreakdown(_dispatchTab);
    }

    function aggregateLoadsBy(key) {
        const map = {};
        state.loads.filter(l => l.status !== 'canceled').forEach(l => {
            const name = (l[key] || '').trim() || 'Unassigned';
            if (!map[name]) map[name] = { loads: 0, miles: 0, gross: 0, rpmSum: 0, rpmCount: 0 };
            const e = map[name];
            const m = parseFloat(l.mileage) || 0;
            const r = parseFloat(l.rate) || 0;
            const d = parseFloat(l.detention) || 0;
            e.loads++;
            e.miles += m;
            e.gross += r + d;
            if (m > 0 && r > 0) { e.rpmSum += r / m; e.rpmCount++; }
        });
        return Object.entries(map).map(([name, e]) => ({
            name,
            loads: e.loads,
            miles: e.miles,
            avgMiles: e.loads ? Math.round(e.miles / e.loads) : 0,
            gross: e.gross,
            avgRate: e.loads ? e.gross / e.loads : 0,
            avgRPM: e.rpmCount ? e.rpmSum / e.rpmCount : 0
        })).sort((a, b) => b.gross - a.gross);
    }

    function renderDispatchBreakdown(tab) {
        _dispatchTab = tab;
        const keyMap = { driver: 'driver', broker: 'broker', dispatcher: 'dispatcher', unit: 'unit' };
        const rows = aggregateLoadsBy(keyMap[tab] || 'driver');
        const tbody = $('dispatchBreakdownTbody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:1rem">No data</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(r => `<tr>
            <td>${escapeHtml(r.name)}</td>
            <td>${r.loads}</td>
            <td>${r.miles.toLocaleString()}</td>
            <td>${r.avgMiles.toLocaleString()}</td>
            <td>$${r.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>$${r.avgRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>$${r.avgRPM.toFixed(2)}</td>
        </tr>`).join('');
        // Update tab active state
        document.querySelectorAll('.dispatch-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    }

    function initDispatchOverview() {
        document.querySelectorAll('.dispatch-tab').forEach(btn => {
            btn.addEventListener('click', () => renderDispatchBreakdown(btn.dataset.tab));
        });
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
        openTruckDetailPanel(id);
    }
    function editTrailer(id) {
        openTrailerDetailPanel(id);
    }
    function editDriver(id) {
        const d = state.drivers.find(x => x.id === id);
        if (d) openDriverDetailPanel(id);
    }

    // ── Close modals on backdrop click ────
    function initModalBackdrops() {
        ['truckModal', 'trailerModal', 'driverModal'].forEach(id => {
            $(id).addEventListener('click', (e) => {
                if (e.target === $(id)) $(id).classList.add('hidden');
            });
        });
    }

    // ── Overview dropdown toggle ─────
    function initOverviewCards() {
        document.querySelectorAll('.overview-dropdown').forEach(dd => {
            let openTimer = null, closeTimer = null;
            dd.querySelector('.overview-card').addEventListener('click', () => {
                const wasOpen = dd.classList.contains('open');
                document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open'));
                if (!wasOpen) dd.classList.add('open');
            });
            dd.addEventListener('mouseenter', () => {
                clearTimeout(closeTimer);
                openTimer = setTimeout(() => {
                    document.querySelectorAll('.overview-dropdown.open').forEach(d => { if (d !== dd) d.classList.remove('open'); });
                    dd.classList.add('open');
                }, 300);
            });
            dd.addEventListener('mouseleave', () => {
                clearTimeout(openTimer);
                closeTimer = setTimeout(() => dd.classList.remove('open'), 400);
            });
        });
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.overview-dropdown')) {
                document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open'));
            }
        });
        // Dept landing page nav cards
        document.querySelectorAll('.dept-nav-card[data-navigate]').forEach(card => {
            card.addEventListener('click', () => {
                navigateToSection(card.dataset.navigate);
            });
        });
    }

    function populateOverviewDropdowns() {
        const trucksPanel = $('trucksDropdownPanel');
        const trailersPanel = $('trailersDropdownPanel');
        const driversPanel = $('driversDropdownPanel');
        if (!trucksPanel || !trailersPanel || !driversPanel) return;

        // Trucks
        if (state.trucks.length) {
            trucksPanel.innerHTML = state.trucks.map(t => {
                const label = t.unit || t.id;
                const meta = [t.year, t.make, t.model].filter(Boolean).join(' ');
                const initials = label.slice(0, 2);
                const sCls = t.status === 'active' ? 'active' : t.status === 'maintenance' ? 'maintenance' : 'inactive';
                const sLabel = t.status ? t.status.charAt(0).toUpperCase() + t.status.slice(1) : '';
                return `<div class="overview-dropdown-item" data-id="${escapeHtml(t.id)}">
                    <div class="overview-dropdown-item-icon">${escapeHtml(initials)}</div>
                    <div class="overview-dropdown-item-info">
                        <span class="overview-dropdown-item-name">${escapeHtml(label)}</span>
                        ${meta ? `<span class="overview-dropdown-item-meta">${escapeHtml(meta)}</span>` : ''}
                    </div>
                    ${sLabel ? `<span class="overview-dropdown-item-status ${sCls}">${escapeHtml(sLabel)}</span>` : ''}
                </div>`;
            }).join('');
        } else {
            trucksPanel.innerHTML = '<div class="overview-dropdown-empty">No trucks added</div>';
        }

        // Trailers
        if (state.trailers.length) {
            trailersPanel.innerHTML = state.trailers.map(t => {
                const label = t.unit || ('Trailer ' + t.id);
                const meta = [t.year, t.make, trailerTypeLabel(t.type)].filter(Boolean).join(' ');
                const initials = label.slice(0, 2);
                const sCls = t.status === 'active' ? 'active' : t.status === 'maintenance' ? 'maintenance' : 'inactive';
                const sLabel = t.status ? t.status.charAt(0).toUpperCase() + t.status.slice(1) : '';
                return `<div class="overview-dropdown-item" data-id="${escapeHtml(t.id)}">
                    <div class="overview-dropdown-item-icon">${escapeHtml(initials)}</div>
                    <div class="overview-dropdown-item-info">
                        <span class="overview-dropdown-item-name">${escapeHtml(label)}</span>
                        ${meta ? `<span class="overview-dropdown-item-meta">${escapeHtml(meta)}</span>` : ''}
                    </div>
                    ${sLabel ? `<span class="overview-dropdown-item-status ${sCls}">${escapeHtml(sLabel)}</span>` : ''}
                </div>`;
            }).join('');
        } else {
            trailersPanel.innerHTML = '<div class="overview-dropdown-empty">No trailers added</div>';
        }

        // Drivers
        if (state.drivers.length) {
            driversPanel.innerHTML = state.drivers.map(d => {
                const name = [d.firstName, d.lastName].filter(Boolean).join(' ') || ('Driver ' + d.id);
                const meta = [d.cdl, d.cdlState].filter(Boolean).join(' ');
                const initials = (d.firstName || '').charAt(0) + (d.lastName || '').charAt(0) || name.slice(0, 2);
                const sCls = d.status === 'active' ? 'active' : 'inactive';
                const sLabel = d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : '';
                return `<div class="overview-dropdown-item" data-id="${escapeHtml(d.id)}">
                    <div class="overview-dropdown-item-icon">${escapeHtml(initials.toUpperCase())}</div>
                    <div class="overview-dropdown-item-info">
                        <span class="overview-dropdown-item-name">${escapeHtml(name)}</span>
                        ${meta ? `<span class="overview-dropdown-item-meta">${escapeHtml(meta)}</span>` : ''}
                    </div>
                    ${sLabel ? `<span class="overview-dropdown-item-status ${sCls}">${escapeHtml(sLabel)}</span>` : ''}
                </div>`;
            }).join('');
        } else {
            driversPanel.innerHTML = '<div class="overview-dropdown-empty">No drivers added</div>';
        }

        // Click handlers for items
        trucksPanel.querySelectorAll('.overview-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open'));
                openTruckProfile(item.dataset.id);
            });
        });
        trailersPanel.querySelectorAll('.overview-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open'));
                openTrailerProfile(item.dataset.id);
            });
        });
        driversPanel.querySelectorAll('.overview-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open'));
                openDriverProfile(item.dataset.id);
            });
        });

        // Populate all department DTT panels (safety, maintenance, dispatch, etc.)
        document.querySelectorAll('.dtt-panel[data-dtt="trucks"]').forEach(panel => {
            panel.innerHTML = trucksPanel.innerHTML;
            panel.querySelectorAll('.overview-dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => { e.stopPropagation(); document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open')); openTruckProfile(item.dataset.id); });
            });
        });
        document.querySelectorAll('.dtt-panel[data-dtt="trailers"]').forEach(panel => {
            panel.innerHTML = trailersPanel.innerHTML;
            panel.querySelectorAll('.overview-dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => { e.stopPropagation(); document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open')); openTrailerProfile(item.dataset.id); });
            });
        });
        document.querySelectorAll('.dtt-panel[data-dtt="drivers"]').forEach(panel => {
            panel.innerHTML = driversPanel.innerHTML;
            panel.querySelectorAll('.overview-dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => { e.stopPropagation(); document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open')); openDriverProfile(item.dataset.id); });
            });
        });
        // Also populate safety ID-based panels
        const safeTrucks = $('safetyTrucksDropdownPanel');
        const safeTrailers = $('safetyTrailersDropdownPanel');
        const safeDrivers = $('safetyDriversDropdownPanel');
        if (safeTrucks) {
            safeTrucks.innerHTML = trucksPanel.innerHTML;
            safeTrucks.querySelectorAll('.overview-dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => { e.stopPropagation(); document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open')); openTruckProfile(item.dataset.id); });
            });
        }
        if (safeTrailers) {
            safeTrailers.innerHTML = trailersPanel.innerHTML;
            safeTrailers.querySelectorAll('.overview-dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => { e.stopPropagation(); document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open')); openTrailerProfile(item.dataset.id); });
            });
        }
        if (safeDrivers) {
            safeDrivers.innerHTML = driversPanel.innerHTML;
            safeDrivers.querySelectorAll('.overview-dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => { e.stopPropagation(); document.querySelectorAll('.overview-dropdown.open').forEach(d => d.classList.remove('open')); openDriverProfile(item.dataset.id); });
            });
        }
    }

    function buildOverviewLookupItems() {
        const truckItems = state.trucks.map(t => ({
            type: 'Truck',
            id: t.id,
            label: t.unit || t.id,
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

    // ── Samsara Integration ───────────────
    function updateSamsaraUI(samsaraData) {
        const connectBtn = $('samsaraConnectBtn');
        const disconnectBtn = $('samsaraDisconnectBtn');
        const desc = $('samsaraStatusDesc');
        if (!connectBtn || !disconnectBtn) return;

        if (samsaraData && samsaraData.connectedAt) {
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
            const d = new Date(samsaraData.connectedAt);
            if (desc) desc.textContent = 'Connected ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } else {
            connectBtn.classList.remove('hidden');
            disconnectBtn.classList.add('hidden');
            if (desc) desc.textContent = 'Connect your Samsara fleet account for ELD and telematics data';
        }
    }

    function initSamsara() {
        // Handle OAuth redirect result
        const params = new URLSearchParams(window.location.search);
        const samsaraResult = params.get('samsara');
        if (samsaraResult) {
            // Clean URL
            const clean = new URL(window.location.href);
            clean.searchParams.delete('samsara');
            clean.searchParams.delete('reason');
            window.history.replaceState({}, '', clean.toString());

            if (samsaraResult === 'connected') {
                showMsg('Samsara connected successfully');
                // Navigate to settings
                const settingsNav = document.querySelector('[data-section="settings"]');
                if (settingsNav) settingsNav.click();
            } else {
                const reason = params.get('reason') || 'unknown';
                showMsg('Samsara connection failed: ' + reason, true);
            }
        }

        // Connect button
        const connectBtn = $('samsaraConnectBtn');
        if (connectBtn) {
            connectBtn.addEventListener('click', async () => {
                connectBtn.disabled = true;
                connectBtn.textContent = 'Connecting...';
                try {
                    const fn = firebase.functions().httpsCallable('samsaraAuthUrl');
                    const result = await fn();
                    if (result.data && result.data.url) {
                        window.location.href = result.data.url;
                    } else {
                        showMsg('Failed to get Samsara authorization URL', true);
                    }
                } catch (err) {
                    console.error('Samsara connect error:', err);
                    showMsg(err.message || 'Failed to connect Samsara', true);
                } finally {
                    connectBtn.disabled = false;
                    connectBtn.textContent = 'Connect';
                }
            });
        }

        // Disconnect button
        const disconnectBtn = $('samsaraDisconnectBtn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', async () => {
                if (!confirm('Disconnect Samsara? This will remove your fleet data connection.')) return;
                disconnectBtn.disabled = true;
                disconnectBtn.textContent = 'Disconnecting...';
                try {
                    const fn = firebase.functions().httpsCallable('samsaraDisconnect');
                    await fn();
                    updateSamsaraUI(null);
                    showMsg('Samsara disconnected');
                } catch (err) {
                    console.error('Samsara disconnect error:', err);
                    showMsg(err.message || 'Failed to disconnect Samsara', true);
                } finally {
                    disconnectBtn.disabled = false;
                    disconnectBtn.textContent = 'Disconnect';
                }
            });
        }
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
        initFmcsaLookup();
        initTruckForm();
        initSheetModals();
        initTrailerForm();
        initDriverForm();
        initLoadForm();
        initLoadDocUpload();
        initDispatchOverview();
        wireLoadLocationEvents();
        initUnifiedSheet();
        initTruckDetailPanel();
        initTrailerDetailPanel();
        initDriverDetailPanel();
        initDropdownEditors();
        initModalBackdrops();
        initSearchFilters();
        initInlineEditing();
        initInspections();
        initTableColPickers();
        initGoogleDriveForImport();
        initSamsara();
        initAuth();

        // Handle URL params to open detail panel (e.g. from Task Manager)
        const params = new URLSearchParams(window.location.search);
        const openPanel = params.get('openPanel');
        const entityId = params.get('entityId');
        if (openPanel && entityId) {
            const waitForData = setInterval(() => {
                if (!state.user) return;
                if (openPanel === 'drivers' && state.drivers?.length) {
                    clearInterval(waitForData);
                    const driversNav = document.querySelector('[data-nav="drivers"]');
                    if (driversNav) driversNav.click();
                    setTimeout(() => openDriverDetailPanel(entityId), 200);
                } else if (openPanel === 'trucks' && state.trucks?.length) {
                    clearInterval(waitForData);
                    const trucksNav = document.querySelector('[data-nav="trucks"]');
                    if (trucksNav) trucksNav.click();
                    setTimeout(() => openTruckDetailPanel(entityId), 200);
                } else if (openPanel === 'trailers' && state.trailers?.length) {
                    clearInterval(waitForData);
                    const trailersNav = document.querySelector('[data-nav="trailers"]');
                    if (trailersNav) trailersNav.click();
                    setTimeout(() => openTrailerDetailPanel(entityId), 200);
                }
            }, 300);
            setTimeout(() => clearInterval(waitForData), 10000);
        }
    }

    // ── INSPECTIONS & CITATIONS ───────────
    async function loadInspections() {
        try {
            const snap = await col('inspections').orderBy('date', 'desc').get();
            state.inspections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderInspections();
            updateCount('inspectionCount', state.inspections.length);
        } catch (e) { console.error('Load inspections error:', e); }
    }

    function renderInspections() {
        const tbody = $('inspectionsTableBody');
        const table = $('inspectionsTable');
        const empty = $('inspectionsEmpty');
        const thead = table?.querySelector('thead tr');
        if (!tbody) return;
        if (state.inspections.length === 0) {
            table.style.display = 'none';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        table.style.display = '';
        const filtered = state.inspections.filter(d => matchesFilter(d, 'inspection'));
        const sorted = sortItems(filtered, sortState.inspections, 'inspection');
        const visCols = getVisibleTableCols('inspections');
        const widths = computeTableColWidths('inspections');
        if (thead) {
            let h = '<th class="col-checkbox"><input type="checkbox" id="inspectionSelectAll" title="Select all"></th>';
            visCols.forEach(c => { h += '<th style="width:' + widths[c.key] + '%">' + c.label + '</th>'; });
            h += '<th style="width:18%"></th>';
            thead.innerHTML = h;
        }
        const selAll = thead?.querySelector('#inspectionSelectAll');
        if (selAll) selAll.onchange = () => toggleSelectAll('inspections', selAll);
        tbody.innerHTML = sorted.map(d => {
            const resolved = d.inspStatus === 'resolved';
            const paid = d.paidStatus === 'paid';
            let cells = '<td class="col-checkbox"><input type="checkbox" class="bulk-cb" data-id="' + d.id + '" ' + (bulkSelection.inspections.has(d.id) ? 'checked' : '') + ' onchange="Dashboard.toggleBulkSelect(\'inspections\',\'' + d.id + '\',this)"></td>';
            visCols.forEach(c => { cells += inspectionCell(d, c.key); });
            cells += '<td class="row-actions"><div class="cell">';
            cells += '<button title="' + (resolved ? 'Reopen' : 'Mark Resolved') + '" class="insp-action-btn ' + (resolved ? 'insp-btn-reopen' : 'insp-btn-resolve') + '" onclick="Dashboard.toggleInspResolved(\'' + d.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></button>';
            if (d.fineAmount && parseFloat(d.fineAmount) > 0) {
                cells += '<button title="' + (paid ? 'Mark Unpaid' : 'Mark Paid') + '" class="insp-action-btn ' + (paid ? 'insp-btn-paid' : 'insp-btn-unpaid') + '" onclick="Dashboard.toggleInspPaid(\'' + d.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></button>';
            }
            cells += '<button title="Create Task" class="insp-action-btn insp-btn-task" onclick="Dashboard.createInspTask(\'' + d.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></button>';
            cells += '<button title="Edit" onclick="Dashboard.editInspection(\'' + d.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
            cells += '<button title="Delete" class="btn-delete" onclick="Dashboard.deleteInspection(\'' + d.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
            cells += '</div></td>';
            return '<tr data-id="' + d.id + '" class="' + (resolved ? 'insp-resolved' : '') + '">' + cells + '</tr>';
        }).join('');
    }

    function editInspection(id) {
        const d = state.inspections.find(x => x.id === id);
        if (d) openUnifiedSheet('inspection', [d], { mode: 'edit' });
    }

    async function deleteInspection(id) {
        if (!confirm('Delete this inspection? This cannot be undone.')) return;
        try {
            await col('inspections').doc(id).delete();
            await loadInspections();
            showMsg('Inspection deleted');
        } catch (e) { console.error(e); showMsg('Error deleting inspection', true); }
    }

    async function toggleInspResolved(id) {
        const d = state.inspections.find(x => x.id === id);
        if (!d) return;
        const newStatus = d.inspStatus === 'resolved' ? 'open' : 'resolved';
        try {
            await col('inspections').doc(id).update({ inspStatus: newStatus });
            d.inspStatus = newStatus;
            renderInspections();
            showMsg(newStatus === 'resolved' ? 'Inspection marked resolved' : 'Inspection reopened');
        } catch (e) { console.error(e); showMsg('Error updating status', true); }
    }

    async function toggleInspPaid(id) {
        const d = state.inspections.find(x => x.id === id);
        if (!d) return;
        const newStatus = d.paidStatus === 'paid' ? 'unpaid' : 'paid';
        try {
            await col('inspections').doc(id).update({ paidStatus: newStatus });
            d.paidStatus = newStatus;
            renderInspections();
            showMsg(newStatus === 'paid' ? 'Marked as paid' : 'Marked as unpaid');
        } catch (e) { console.error(e); showMsg('Error updating paid status', true); }
    }

    async function createInspTask(id) {
        const d = state.inspections.find(x => x.id === id);
        if (!d) return;
        const typeFmt = { 'level-1': 'Level I', 'level-2': 'Level II', 'level-3': 'Level III', 'level-4': 'Level IV', 'level-5': 'Level V', 'citation': 'Citation' };
        const typeLabel = typeFmt[d.type] || d.type || 'Inspection';
        const fine = d.fineAmount && parseFloat(d.fineAmount) > 0 ? ` — Fine: $${parseFloat(d.fineAmount).toFixed(2)}` : '';
        const text = `${typeLabel} (${d.reportNum || 'No report #'}) — ${d.driverName || 'No driver'} / ${d.truckUnit || 'No truck'} on ${d.date || '?'}${fine}`;
        const priority = d.result === 'fail' || d.result === 'oos' ? 'high' : 'normal';

        const taskData = {
            text,
            type: 'task',
            status: 'Open',
            priority,
            assignedTo: [],
            dueDate: null,
            createdBy: state.user.email || state.user.uid,
            source: 'inspection',
            inspectionId: id,
            createdAtIso: new Date().toISOString()
        };

        try {
            const result = await FirebaseDB.createTask(state.user.uid, 'inspections', id, taskData);
            if (!result.success) throw new Error(result.error);
            showMsg('Task created — view in Task Manager');
        } catch (e) { console.error(e); showMsg('Error creating task', true); }
    }

    function initInspections() {
        const addBtn = $('addInspectionBtn');
        const addFirst = $('addFirstInspection');

        const openAdd = () => openUnifiedSheet('inspection', null, { mode: 'add' });
        if (addBtn) addBtn.addEventListener('click', openAdd);
        if (addFirst) addFirst.addEventListener('click', openAdd);

        const importBtn = $('importInspectionsBtn');
        if (importBtn) {
            importBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showImportDropdown(importBtn, smartImportInspections);
            });
        }

        const selectAll = $('inspectionSelectAll');
        if (selectAll) selectAll.addEventListener('change', () => toggleSelectAll('inspections', selectAll));

        loadInspections();
    }

    // Expose edit/delete/inline methods for inline onclick
    window.Dashboard = {
        editTruck, editTrailer, editDriver, editLoad,
        deleteTruck, deleteTrailer, deleteDriver, deleteLoad, uploadLoadDoc,
        editInspection, deleteInspection, toggleInspResolved, toggleInspPaid, createInspTask,
        inlineStatus, inlineTruckAssign,
        toggleBulkSelect, bulkDelete, bulkChangeStatus, bulkExport, bulkEdit,
        openTruckProfile, openTrailerProfile, openDriverProfile,
        toggleSpreadsheet, ssChanged, ssSaveAll, ssDiscardAll,
        openUnifiedSheet
    };

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
