(function () {
    'use strict';

    const state = {
        user: null,
        samsaraTokens: null,
        samsaraSync: null,
        syncing: false
    };

    function $(id) { return document.getElementById(id); }
    function userDoc() { return db.collection('users').doc(state.user.uid); }
    function syncDoc() { return userDoc().collection('integration_sync').doc('samsara'); }

    function escapeHtml(v) {
        if (v == null) return '';
        const d = document.createElement('div');
        d.textContent = String(v);
        return d.innerHTML;
    }

    // ── Time helpers ──────────────────────────────────────────

    function formatRelative(ts) {
        if (!ts) return '—';
        let ms;
        if (typeof ts.toDate === 'function') ms = ts.toDate().getTime();
        else if (ts instanceof Date) ms = ts.getTime();
        else ms = Number(ts);
        if (!ms || Number.isNaN(ms)) return '—';

        const diff = Date.now() - ms;
        const mins = Math.floor(diff / 60000);
        if (mins < 2)  return 'Just now';
        if (mins < 60) return mins + ' min ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24)  return hrs + ' hr ago';
        const days = Math.floor(hrs / 24);
        return days + ' day' + (days === 1 ? '' : 's') + ' ago';
    }

    function formatDateTime(ts) {
        if (!ts) return '—';
        let ms;
        if (typeof ts.toDate === 'function') ms = ts.toDate().getTime();
        else if (ts instanceof Date) ms = ts.getTime();
        else ms = Number(ts);
        if (!ms || Number.isNaN(ms)) return '—';
        return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // ── Status helpers ────────────────────────────────────────

    function computeTokenHealth(tokens) {
        const accessToken = tokens && (tokens.accessToken || tokens.access_token);
        if (!accessToken) return 'disconnected';
        const expiry = Number(tokens.expiresAt || tokens.token_expiry);
        if (!expiry || Number.isNaN(expiry)) return 'warning';
        const msLeft = expiry - Date.now();
        if (msLeft <= 0) return 'error';
        if (msLeft < 30 * 60 * 1000) return 'warning'; // <30 min
        return 'connected';
    }

    function getSyncCursorPreview(syncMeta) {
        if (!syncMeta) return '—';
        if (syncMeta.cursor) return '…' + String(syncMeta.cursor).slice(-12);
        const cursors = syncMeta.cursors || null;
        if (!cursors || typeof cursors !== 'object') return '—';
        const values = Object.values(cursors).filter(Boolean);
        if (!values.length) return '—';
        const newest = values.sort().at(-1);
        return newest ? '…' + String(newest).slice(-12) : '—';
    }

    function statusLabel(health) {
        switch (health) {
            case 'connected':    return 'Connected';
            case 'warning':      return 'Token Expiring';
            case 'error':        return 'Token Expired';
            case 'disconnected': return 'Not Connected';
            default:             return 'Unknown';
        }
    }

    // ── Render ────────────────────────────────────────────────

    function renderSamsaraCard(tokens, syncMeta) {
        const health = computeTokenHealth(tokens);

        // Status dot + label
        const dot   = $('samsaraStatusDot');
        const label = $('samsaraStatusLabel');
        dot.className   = 'int-status-dot ' + health;
        label.textContent = statusLabel(health);
        label.className = 'int-status-label ' + health;

        // Meta rows
        const lastSyncTs = syncMeta && (syncMeta.lastSyncedAt || syncMeta.lastRunAt);
        $('samsaraLastSync').textContent  = lastSyncTs ? formatRelative(lastSyncTs) + ' (' + formatDateTime(lastSyncTs) + ')' : '—';
        $('samsaraCursor').textContent    = getSyncCursorPreview(syncMeta);

        // Token expiry
        const tokenExpiry = tokens && (tokens.expiresAt || tokens.token_expiry);
        if (tokenExpiry) {
            const expMs = Number(tokenExpiry);
            if (expMs && !Number.isNaN(expMs)) {
                const msLeft = expMs - Date.now();
                const minsLeft = Math.floor(msLeft / 60000);
                let expiryText;
                if (minsLeft <= 0) expiryText = 'Expired';
                else if (minsLeft < 60) expiryText = 'In ' + minsLeft + ' min';
                else expiryText = formatDateTime(expMs);
                $('samsaraTokenExpiry').textContent = expiryText;
            } else {
                $('samsaraTokenExpiry').textContent = '—';
            }
        } else {
            $('samsaraTokenExpiry').textContent = '—';
        }

        // Scopes
        const scopesEl = $('samsaraScopes');
        const rawScopes = tokens && (tokens.scopes || tokens.scope);
        let scopeList = [];
        if (typeof rawScopes === 'string' && rawScopes.trim()) {
            scopeList = rawScopes.split(/[\s,]+/).filter(Boolean);
        } else if (Array.isArray(rawScopes)) {
            scopeList = rawScopes.filter(Boolean);
        }

        if (scopeList.length) {
            scopesEl.innerHTML = scopeList.map(s =>
                '<span class="int-scope-tag">' + escapeHtml(s) + '</span>'
            ).join('');
        } else if (health !== 'disconnected') {
            scopesEl.innerHTML = '<span class="int-scope-tag no-scopes">No scope data</span>';
        } else {
            scopesEl.innerHTML = '<span class="int-scope-tag no-scopes">Not connected</span>';
        }

        // KPI strip
        $('kpiConnected').textContent = (health === 'connected' || health === 'warning') ? '1' : '0';
        $('kpiLastSync').textContent  = lastSyncTs ? formatRelative(lastSyncTs) : '—';
        $('kpiScopes').textContent    = scopeList.length || (health !== 'disconnected' ? '?' : '—');

        const healthCard = $('kpiHealthCard');
        const healthVal  = $('kpiHealth');
        healthCard.className = 'int-kpi ';
        healthVal.textContent = statusLabel(health);
        if (health === 'connected')    { healthCard.className += 'healthy'; healthVal.style.color = '#059669'; }
        else if (health === 'warning') { healthCard.className += 'warning'; healthVal.style.color = '#d97706'; }
        else if (health === 'error')   { healthCard.className += 'danger';  healthVal.style.color = '#dc2626'; }
        else                           { healthCard.className += 'neutral'; healthVal.style.color = ''; }
    }

    function renderSyncLog(syncMeta) {
        const logEl = $('syncLog');
        const entries = [];

        if (syncMeta) {
            const ts = syncMeta.lastSyncedAt || syncMeta.lastRunAt;
            if (ts) {
                entries.push({ dot: 'ok', time: ts, msg: 'Incremental sync completed successfully.', source: 'Samsara' });
            }
            if (syncMeta.lastErrorAt) {
                entries.push({ dot: 'err', time: syncMeta.lastErrorAt, msg: (syncMeta.lastError || 'Sync error recorded.'), source: 'Samsara' });
            }
            if (syncMeta.initialSyncAt) {
                entries.push({ dot: 'info', time: syncMeta.initialSyncAt, msg: 'Initial full sync completed.', source: 'Samsara' });
            }
        }

        if (!entries.length) {
            logEl.innerHTML = '<div class="int-log-empty">No sync activity recorded yet.</div>';
            return;
        }

        entries.sort((a, b) => {
            const ta = a.time && (typeof a.time.toDate === 'function' ? a.time.toDate().getTime() : Number(a.time));
            const tb = b.time && (typeof b.time.toDate === 'function' ? b.time.toDate().getTime() : Number(b.time));
            return (tb || 0) - (ta || 0);
        });

        logEl.innerHTML = entries.map(e => `
            <div class="int-log-entry">
                <span class="int-log-dot ${escapeHtml(e.dot)}"></span>
                <span class="int-log-time">${escapeHtml(formatDateTime(e.time))}</span>
                <span class="int-log-msg">${escapeHtml(e.msg)}</span>
                <span class="int-log-source">${escapeHtml(e.source)}</span>
            </div>
        `).join('');
    }

    // ── Load data ─────────────────────────────────────────────

    async function loadData() {
        try {
            const [userSnap, syncSnap] = await Promise.all([
                userDoc().get(),
                syncDoc().get()
            ]);

            state.samsaraTokens = (userSnap.exists && userSnap.data().samsara) ? userSnap.data().samsara : null;
            state.samsaraSync   = syncSnap.exists ? syncSnap.data() : null;

            renderSamsaraCard(state.samsaraTokens, state.samsaraSync);
            renderSyncLog(state.samsaraSync);
        } catch (err) {
            showBanner('Failed to load integration data. Please refresh.', 'error');
        }
    }

    // ── Manual sync ───────────────────────────────────────────

    async function triggerManualSync() {
        if (state.syncing) return;
        state.syncing = true;

        const btn        = $('samsaraSyncBtn');
        const resultEl   = $('samsaraSyncResult');

        btn.disabled = true;
        btn.textContent = 'Syncing…';
        resultEl.style.display = 'block';
        resultEl.className = 'int-sync-result running';
        resultEl.textContent = 'Incremental sync in progress…';

        try {
            const syncFn = firebase.functions().httpsCallable('samsaraIncrementalSync');
            const result = await syncFn({});
            const resultPayload = result && result.data ? result.data : null;
            const msg = (resultPayload && resultPayload.message)
                ? resultPayload.message
                : (resultPayload && resultPayload.result && resultPayload.result.runId)
                    ? ('Sync completed (' + resultPayload.result.runId + ').')
                    : 'Sync completed successfully.';
            resultEl.className = 'int-sync-result success';
            resultEl.textContent = msg;
            // Reload data to reflect updated sync time
            await loadData();
        } catch (err) {
            const msg = (err && err.message) ? err.message : 'Sync failed. Check your connection and try again.';
            resultEl.className = 'int-sync-result error';
            resultEl.textContent = msg;
        } finally {
            state.syncing = false;
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"/></svg> Sync Now';
        }
    }

    // ── Banner helper ─────────────────────────────────────────

    function showBanner(msg, type) {
        const el = $('intStatusBanner');
        el.className = 'int-status-banner ' + type;
        el.textContent = msg;
        el.style.display = 'block';
        if (type !== 'error') {
            setTimeout(() => { el.style.display = 'none'; }, 5000);
        }
    }

    // ── Init ──────────────────────────────────────────────────

    function init() {
        firebase.auth().onAuthStateChanged(function (user) {
            if (!user) {
                window.location.href = 'dashboard.html';
                return;
            }
            state.user = user;
            loadData();
        });

        $('refreshIntBtn').addEventListener('click', function () {
            loadData();
        });

        $('samsaraSyncBtn').addEventListener('click', function () {
            triggerManualSync();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
