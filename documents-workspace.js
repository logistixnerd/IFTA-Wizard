(function () {
    'use strict';

    const MAX_DOC_SIZE = 10 * 1024 * 1024;

    const state = {
        user: null,
        docs: [],
        drivers: [],
        trucks: [],
        trailers: [],
        replaceDoc: null,
        filters: {
            groupBy: 'ownerType',
            status: '',
            source: '',
            search: ''
        }
    };

    function $(id) { return document.getElementById(id); }
    function userCol(name) { return db.collection('users').doc(state.user.uid).collection(name); }

    function storageRef(path) {
        return firebase.storage().ref(path);
    }

    function escapeHtml(v) {
        if (v == null) return '';
        const d = document.createElement('div');
        d.textContent = String(v);
        return d.innerHTML;
    }

    function toDate(v) {
        if (!v) return null;
        if (typeof v.toDate === 'function') return v.toDate();
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function daysUntil(v) {
        const d = toDate(v);
        if (!d) return null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        d.setHours(0, 0, 0, 0);
        return Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    }

    function expirationState(rec) {
        const days = daysUntil(rec.expirationDate || rec.expiresAt || rec.expiration || rec.expiryDate);
        if (days == null) return { status: 'ok', label: 'No Expiration' };
        if (days < 0) return { status: 'expired', label: 'Expired ' + Math.abs(days) + 'd ago' };
        if (days <= 30) return { status: 'expiring', label: 'Expiring in ' + days + 'd' };
        return { status: 'ok', label: 'Valid (' + days + 'd)' };
    }

    function getDriverName(d) {
        return (d.firstName || d.lastName) ? [d.firstName, d.lastName].filter(Boolean).join(' ') : (d.name || d.email || d.id || 'Unknown Driver');
    }

    async function loadCollection(name) {
        try {
            const snap = await userCol(name).get();
            return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (err) {
            return [];
        }
    }

    async function loadAllDocs() {
        const [drivers, trucks, trailers, centralDocs, samsaraDocs] = await Promise.all([
            loadCollection('drivers'),
            loadCollection('trucks'),
            loadCollection('trailers'),
            loadCollection('documents'),
            loadCollection('samsara_documents')
        ]);

        state.drivers = drivers;
        state.trucks = trucks;
        state.trailers = trailers;

        const driverDocs = (await Promise.all(drivers.map(async (d) => {
            try {
                const snap = await userCol('drivers').doc(d.id).collection('documents').get();
                return snap.docs.map((doc) => ({
                    id: doc.id,
                    sourceCollection: 'drivers.documents',
                    source: 'manual',
                    ownerType: 'driver',
                    ownerId: d.id,
                    ownerName: getDriverName(d),
                    ...doc.data()
                }));
            } catch (err) {
                return [];
            }
        }))).flat();

        const truckDocs = (await Promise.all(trucks.map(async (t) => {
            try {
                const snap = await userCol('trucks').doc(t.id).collection('documents').get();
                return snap.docs.map((doc) => ({
                    id: doc.id,
                    sourceCollection: 'trucks.documents',
                    source: 'manual',
                    ownerType: 'vehicle',
                    ownerId: t.id,
                    ownerName: t.unit || t.name || t.plate || t.id,
                    ...doc.data()
                }));
            } catch (err) {
                return [];
            }
        }))).flat();

        const trailerDocs = (await Promise.all(trailers.map(async (t) => {
            try {
                const snap = await userCol('trailers').doc(t.id).collection('documents').get();
                return snap.docs.map((doc) => ({
                    id: doc.id,
                    sourceCollection: 'trailers.documents',
                    source: 'manual',
                    ownerType: 'trailer',
                    ownerId: t.id,
                    ownerName: t.unit || t.name || t.plate || t.id,
                    ...doc.data()
                }));
            } catch (err) {
                return [];
            }
        }))).flat();

        const normalizedCentral = centralDocs.map((doc) => ({
            ...doc,
            sourceCollection: 'documents',
            source: 'manual',
            ownerType: doc.ownerType || 'driver',
            ownerId: doc.ownerId || '',
            ownerName: doc.ownerName || 'Unknown Owner'
        }));

        const normalizedSamsara = samsaraDocs.map((doc) => ({
            ...doc,
            sourceCollection: 'samsara_documents',
            source: 'samsara',
            ownerType: doc.ownerType || (doc.entityType === 'trailer' ? 'trailer' : (doc.entityType === 'vehicle' ? 'vehicle' : 'driver')),
            ownerId: doc.ownerId || doc.driverSamsaraId || doc.vehicleSamsaraId || doc.trailerSamsaraId || doc.samsaraId || doc.id,
            ownerName: doc.ownerName || doc.driverName || doc.vehicleLabel || doc.trailerLabel || doc.title || 'Samsara'
        }));

        state.docs = [...normalizedCentral, ...driverDocs, ...truckDocs, ...trailerDocs, ...normalizedSamsara].map((doc, idx) => {
            const exp = expirationState(doc);
            return {
                _id: doc.sourceCollection + ':' + doc.id + ':' + idx,
                title: doc.name || doc.title || doc.documentName || doc.fileName || 'Document',
                docType: doc.type || doc.docType || doc.category || doc.entityType || 'other',
                source: doc.source,
                sourceCollection: doc.sourceCollection,
                ownerType: doc.ownerType,
                ownerId: doc.ownerId,
                ownerName: doc.ownerName,
                url: doc.url || doc.downloadUrl || doc.fileUrl || '',
                storagePath: doc.storagePath || '',
                contentType: doc.contentType || doc.mimeType || '',
                size: Number(doc.size || 0),
                uploadedAt: doc.uploadedAt || doc.createdAt || doc.updatedAt || doc.syncedAt || null,
                expirationDate: doc.expirationDate || doc.expiresAt || doc.expiration || doc.expiryDate || null,
                status: exp.status,
                statusLabel: exp.label,
                raw: doc
            };
        });
    }

    function populateOwnerSelect() {
        const kind = $('docOwnerType').value;
        const ownerSel = $('docOwnerId');
        let items = [];
        if (kind === 'driver') items = state.drivers.map((d) => ({ id: d.id, label: getDriverName(d) }));
        else if (kind === 'vehicle') items = state.trucks.map((t) => ({ id: t.id, label: t.unit || t.name || t.plate || t.id }));
        else items = state.trailers.map((t) => ({ id: t.id, label: t.unit || t.name || t.plate || t.id }));

        ownerSel.innerHTML = items.map((x) => '<option value="' + escapeHtml(x.id) + '">' + escapeHtml(x.label) + '</option>').join('');
        if (!items.length) ownerSel.innerHTML = '<option value="">No records found</option>';
    }

    function applyFilters() {
        return state.docs.filter((doc) => {
            if (state.filters.status && doc.status !== state.filters.status) return false;
            if (state.filters.source && doc.source !== state.filters.source) return false;
            const q = state.filters.search;
            if (q) {
                const hay = [doc.title, doc.docType, doc.ownerName, doc.ownerType, doc.source].join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    function groupKey(doc) {
        if (state.filters.groupBy === 'driver') return doc.ownerType === 'driver' ? doc.ownerName : 'Other Owners';
        if (state.filters.groupBy === 'vehicle') return doc.ownerType === 'vehicle' ? doc.ownerName : 'Other Owners';
        if (state.filters.groupBy === 'trailer') return doc.ownerType === 'trailer' ? doc.ownerName : 'Other Owners';
        if (state.filters.groupBy === 'docType') return String(doc.docType || 'other').toUpperCase();
        return String(doc.ownerType || 'unknown').toUpperCase();
    }

    function renderKpis() {
        const total = state.docs.length;
        const expiring = state.docs.filter((d) => d.status === 'expiring').length;
        const expired = state.docs.filter((d) => d.status === 'expired').length;
        const missingFile = state.docs.filter((d) => !d.url).length;
        const samsara = state.docs.filter((d) => d.source === 'samsara').length;

        $('kpiTotalDocs').textContent = String(total);
        $('kpiExpiring').textContent = String(expiring);
        $('kpiExpired').textContent = String(expired);
        $('kpiMissingFile').textContent = String(missingFile);
        $('kpiSamsara').textContent = String(samsara);
    }

    function renderGroupedList() {
        const list = $('docsGroupedList');
        const filtered = applyFilters();
        $('docRegistryMeta').textContent = filtered.length + ' records';

        if (!filtered.length) {
            list.innerHTML = '<p class="docs-empty">No documents match current filters.</p>';
            return;
        }

        const groups = {};
        filtered.forEach((doc) => {
            const key = groupKey(doc);
            if (!groups[key]) groups[key] = [];
            groups[key].push(doc);
        });

        list.innerHTML = Object.keys(groups).sort().map((key) => {
            const items = groups[key];
            return '<section class="docs-group">' +
                '<header class="docs-group-header"><h3>' + escapeHtml(key) + '</h3><span class="docs-group-count">' + items.length + ' docs</span></header>' +
                '<div class="docs-items">' + items.map((doc) => {
                    return '<article class="doc-card" data-doc-id="' + escapeHtml(doc._id) + '">' +
                        '<div class="doc-card-head"><span class="doc-title">' + escapeHtml(doc.title) + '</span></div>' +
                        '<div class="doc-sub">' + escapeHtml(doc.ownerName) + ' · ' + escapeHtml(String(doc.docType).toUpperCase()) + '</div>' +
                        '<div class="doc-tags">' +
                            '<span class="doc-tag ' + escapeHtml(doc.source) + '">' + escapeHtml(doc.source) + '</span>' +
                            '<span class="doc-tag ' + escapeHtml(doc.status) + '">' + escapeHtml(doc.statusLabel) + '</span>' +
                        '</div>' +
                        '<div class="doc-actions">' +
                            '<button class="doc-btn" data-action="detail" data-id="' + escapeHtml(doc._id) + '">Details</button>' +
                            '<button class="doc-btn" data-action="preview" data-id="' + escapeHtml(doc._id) + '" ' + (doc.url ? '' : 'disabled') + '>Preview</button>' +
                            '<button class="doc-btn" data-action="replace" data-id="' + escapeHtml(doc._id) + '" ' + (doc.storagePath ? '' : 'disabled') + '>Replace</button>' +
                        '</div>' +
                    '</article>';
                }).join('') + '</div>' +
            '</section>';
        }).join('');

        list.querySelectorAll('button[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const doc = state.docs.find((d) => d._id === id);
                if (!doc) return;
                const action = btn.dataset.action;
                if (action === 'detail') showDetail(doc);
                else if (action === 'preview') previewDoc(doc);
                else if (action === 'replace') startReplace(doc);
            });
        });
    }

    function previewDoc(doc) {
        if (!doc.url) return;
        window.open(doc.url, '_blank', 'noopener,noreferrer');
    }

    function showDetail(doc) {
        $('docsDetailTitle').textContent = 'Document Detail';
        const sections = [
            { title: 'Identity', rows: [
                ['Title', doc.title],
                ['Owner', doc.ownerName],
                ['Owner Type', doc.ownerType],
                ['Document Type', doc.docType]
            ] },
            { title: 'Status', rows: [
                ['Expiration', doc.expirationDate ? new Date(doc.expirationDate).toLocaleDateString() : 'No expiration'],
                ['Indicator', doc.statusLabel],
                ['Source', doc.source],
                ['Uploaded', doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '-']
            ] },
            { title: 'Storage', collapse: true, rows: [
                ['Has Preview URL', doc.url ? 'Yes' : 'No'],
                ['Replace Available', doc.storagePath ? 'Yes' : 'No'],
                ['Content Type', doc.contentType || '-'],
                ['Size', doc.size ? (Math.round((doc.size / 1024) * 10) / 10) + ' KB' : '-']
            ] }
        ];

        function sectionHtml(section) {
            const body = '<section class="docs-detail-block"><h4>' + escapeHtml(section.title) + '</h4><div class="docs-detail-grid">' +
                section.rows.map((row) => '<div class="docs-detail-item"><span>' + escapeHtml(row[0]) + '</span><strong>' + escapeHtml(row[1]) + '</strong></div>').join('') +
                '</div></section>';
            if (!section.collapse) return body;
            return '<details class="docs-detail-collapse"><summary>Additional Details</summary>' + body + '</details>';
        }

        $('docsDetailBody').innerHTML = sections.map(sectionHtml).join('');
    }

    async function uploadDocument(e) {
        e.preventDefault();
        const file = $('docFileInput').files[0];
        if (!file) return;
        if (file.size > MAX_DOC_SIZE) {
            alert('File too large. Maximum is 10 MB.');
            return;
        }

        const ownerType = $('docOwnerType').value;
        const ownerId = $('docOwnerId').value;
        const ownerName = $('docOwnerId').selectedOptions[0] ? $('docOwnerId').selectedOptions[0].textContent : 'Unknown Owner';
        const docType = $('docTypeInput').value.trim() || 'other';
        const expiration = $('docExpirationInput').value || null;

        if (!ownerId) {
            alert('Select a valid owner before uploading.');
            return;
        }

        const btn = $('docUploadSubmitBtn');
        btn.disabled = true;
        btn.textContent = 'Uploading...';

        try {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = 'users/' + state.user.uid + '/documents/' + ownerType + '/' + ownerId + '/' + Date.now() + '_' + safeName;
            const ref = storageRef(storagePath);
            await ref.put(file);
            const url = await ref.getDownloadURL();

            await userCol('documents').add({
                name: file.name,
                docType,
                ownerType,
                ownerId,
                ownerName,
                source: 'manual',
                storagePath,
                url,
                size: file.size,
                contentType: file.type,
                expirationDate: expiration,
                uploadedAt: new Date().toISOString(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            $('docUploadForm').reset();
            populateOwnerSelect();
            await refresh();
        } catch (err) {
            alert('Upload failed: ' + (err.message || err));
        } finally {
            btn.disabled = false;
            btn.textContent = 'Upload Document';
        }
    }

    function startReplace(doc) {
        state.replaceDoc = doc;
        const input = $('replaceDocInput');
        input.value = '';
        input.click();
    }

    async function onReplaceFileSelected(e) {
        const file = e.target.files[0];
        const doc = state.replaceDoc;
        state.replaceDoc = null;
        if (!file || !doc) return;
        if (!doc.storagePath) {
            alert('This record does not have a replaceable storage path.');
            return;
        }
        if (file.size > MAX_DOC_SIZE) {
            alert('File too large. Maximum is 10 MB.');
            return;
        }

        try {
            const ref = storageRef(doc.storagePath);
            await ref.put(file);
            const url = await ref.getDownloadURL();

            const payload = {
                name: file.name,
                url,
                size: file.size,
                contentType: file.type,
                uploadedAt: new Date().toISOString(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (doc.sourceCollection === 'documents') {
                await userCol('documents').doc(doc.raw.id).update(payload);
            } else if (doc.sourceCollection === 'drivers.documents') {
                await userCol('drivers').doc(doc.ownerId).collection('documents').doc(doc.raw.id).update(payload);
            } else if (doc.sourceCollection === 'trucks.documents') {
                await userCol('trucks').doc(doc.ownerId).collection('documents').doc(doc.raw.id).update(payload);
            } else if (doc.sourceCollection === 'trailers.documents') {
                await userCol('trailers').doc(doc.ownerId).collection('documents').doc(doc.raw.id).update(payload);
            }

            await refresh();
        } catch (err) {
            alert('Replace failed: ' + (err.message || err));
        }
    }

    function bindEvents() {
        $('refreshDocsBtn').addEventListener('click', async () => { await refresh(); });
        $('docOwnerType').addEventListener('change', () => populateOwnerSelect());
        $('docUploadForm').addEventListener('submit', uploadDocument);
        $('replaceDocInput').addEventListener('change', onReplaceFileSelected);

        $('docGroupBy').addEventListener('change', (e) => { state.filters.groupBy = e.target.value; renderGroupedList(); });
        $('docStatusFilter').addEventListener('change', (e) => { state.filters.status = e.target.value; renderGroupedList(); });
        $('docSourceFilter').addEventListener('change', (e) => { state.filters.source = e.target.value; renderGroupedList(); });
        $('docSearchInput').addEventListener('input', (e) => { state.filters.search = e.target.value.trim().toLowerCase(); renderGroupedList(); });

        $('closeDocsDetail').addEventListener('click', () => {
            $('docsDetailTitle').textContent = 'Document Detail';
            $('docsDetailBody').innerHTML = '<p class="docs-detail-empty">Select a document card to preview metadata, expiration, and available actions.</p>';
        });
    }

    async function refresh() {
        await loadAllDocs();
        renderKpis();
        populateOwnerSelect();
        renderGroupedList();
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
        if (typeof initializeFirebase === 'function') initializeFirebase();
    }

    init();
})();