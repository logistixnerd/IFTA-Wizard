/**
 * src/integrations/samsara.js
 * ─────────────────────────────────────────────────────────────
 * Client-side Samsara integration module for IFTA Wizard.
 *
 * ARCHITECTURE NOTE:
 *   Samsara's API does not support CORS — direct browser requests are blocked.
 *   All Samsara API calls are performed server-side by the `samsaraFleetSync`
 *   Cloud Function (functions/index.js). This module:
 *     1. Triggers server-side syncs via the Firestore trigger pattern.
 *     2. Reads the resulting data from the Firestore cache.
 *     3. Normalizes that data into a stable, UI-ready structure.
 *
 *   API key security: The Samsara access token is stored in Firestore
 *   under users/{uid}.samsara.accessToken (written by the OAuth flow) and
 *   is NEVER exposed to the client. The Cloud Function reads it server-side.
 *   process.env.SAMSARA_API_KEY is handled exclusively in functions/index.js.
 *
 * FIRESTORE PATHS:
 *   users/{uid}/samsara_sync_requests/{docId}  — sync trigger (client write)
 *   users/{uid}/samsara_cache/fleet             — fleet cache  (function write, client read)
 *   users/{uid}/trucks/{truckId}                — merged truck records
 */

'use strict';

// ── Firestore path helpers ────────────────────────────────────

const PATHS = {
    fleetCache:    (uid) => `users/${uid}/samsara_cache/fleet`,
    syncRequests:  (uid) => `users/${uid}/samsara_sync_requests`,
    truck:         (uid, truckId) => `users/${uid}/trucks/${truckId}`,
};

const SYNC_TIMEOUT_MS  = 55_000; // Must be < Cloud Function timeout (60s)
const DEFAULT_MAX_AGE  = 10 * 60 * 1000; // 10 minutes before auto-sync

// ── Internal utilities ────────────────────────────────────────

/** @returns {firebase.firestore.Firestore} */
function _db() {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
        throw new Error('SamsaraIntegration: Firebase not initialized.');
    }
    return firebase.firestore();
}

/**
 * Wait for a sync-request doc to be deleted (success) or marked as error.
 * The Cloud Function deletes the doc on success, sets status='error' on failure.
 *
 * @param {firebase.firestore.DocumentReference} docRef
 * @returns {Promise<void>}
 */
function _awaitSyncCompletion(docRef) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + SYNC_TIMEOUT_MS;

        const unsub = docRef.onSnapshot(
            (snap) => {
                if (Date.now() > deadline) {
                    unsub();
                    reject(new Error('Samsara sync timed out.'));
                    return;
                }
                if (!snap.exists) {
                    // Doc deleted → Cloud Function completed successfully
                    unsub();
                    resolve();
                    return;
                }
                const d = snap.data() || {};
                if (d.status === 'error') {
                    unsub();
                    reject(new Error('Samsara sync failed: ' + (d.error || 'unknown')));
                }
            },
            (err) => { unsub(); reject(err); }
        );

        // Hard deadline in case the snapshot listener stalls
        setTimeout(() => {
            unsub();
            reject(new Error('Samsara sync timed out.'));
        }, SYNC_TIMEOUT_MS);
    });
}

// ── Data normalization ────────────────────────────────────────

/**
 * Normalize a raw vehicle object from the Firestore fleet cache into
 * a stable, UI-ready structure. Missing fields default to null so callers
 * can safely destructure without null checks on every property.
 *
 * @typedef {object} SamsaraVehicleProfile
 * @property {string|null}  unitId        - Matched Firestore truck doc ID (null if unmatched)
 * @property {string|null}  samsaraId     - Samsara vehicle ID
 * @property {string}       name          - Vehicle name in Samsara
 * @property {string}       vin           - VIN (uppercase)
 * @property {string}       licensePlate
 * @property {string|null}  make
 * @property {string|null}  model
 * @property {number|null}  year
 * @property {number|null}  odometer      - Miles
 * @property {number|null}  engineHours
 * @property {number|null}  fuelLevel     - Percentage (0-100)
 * @property {number|null}  fuelUsed      - Gallons
 * @property {number|null}  mpg
 * @property {object[]}     faults        - Active fault/DTC codes
 * @property {object[]}     safetyEvents  - Harsh braking, speeding, etc.
 * @property {number|null}  safetyScore   - 0-100
 * @property {object|null}  lastLocation  - { lat, lng, heading, speed, location, timestamp }
 *
 * @param {object} raw - Raw vehicle object from samsara_cache/fleet
 * @returns {SamsaraVehicleProfile}
 */
function normalizeSamsaraVehicle(raw) {
    const gps = raw.gps || null;
    return {
        unitId:       raw.matchedTruckId  || null,
        samsaraId:    raw.id              || null,
        name:         raw.name            || '',
        vin:          raw.vin             || '',
        licensePlate: raw.licensePlate    || '',
        // Extended fields — populated when the Cloud Function fetches additional stats
        make:         raw.make            != null ? raw.make            : null,
        model:        raw.model           != null ? raw.model           : null,
        year:         raw.year            != null ? raw.year            : null,
        odometer:     raw.odometer        != null ? raw.odometer        : null,
        engineHours:  raw.engineHours     != null ? raw.engineHours     : null,
        fuelLevel:    raw.fuelLevel       != null ? raw.fuelLevel       : null,
        fuelUsed:     raw.fuelUsed        != null ? raw.fuelUsed        : null,
        mpg:          raw.mpg             != null ? raw.mpg             : null,
        faults:       Array.isArray(raw.faults)        ? raw.faults        : [],
        safetyEvents: Array.isArray(raw.safetyEvents)  ? raw.safetyEvents  : [],
        safetyScore:  raw.safetyScore     || null,
        lastLocation: gps ? {
            lat:       gps.lat,
            lng:       gps.lng,
            heading:   gps.heading   || 0,
            speed:     gps.speed     || 0,
            location:  gps.location  || '',
            timestamp: gps.time      || null,
        } : null,
    };
}

// ── Public API ────────────────────────────────────────────────

/**
 * Trigger a server-side fleet sync for the given user.
 * Writes a request doc to Firestore; the `samsaraFleetSync` Cloud Function
 * picks it up, calls the Samsara API, and deletes the doc on completion.
 *
 * @param {string} uid - Firebase Auth user ID
 * @returns {Promise<void>} Resolves when the sync completes
 * @throws {Error} If sync fails or times out
 */
async function triggerSync(uid) {
    if (!uid) throw new Error('triggerSync: uid is required.');
    const db = _db();
    const reqRef = await db.collection(PATHS.syncRequests(uid)).add({
        requestedAt: Date.now(),
    });
    await _awaitSyncCompletion(reqRef);
}

/**
 * Fetch all vehicles from the Samsara fleet cache.
 * If the cache is absent or stale (older than maxAgeMs), a fresh sync is
 * triggered automatically before reading.
 *
 * This is the primary entry point for consuming Samsara vehicle data.
 *
 * @param {string} uid
 * @param {object} [options]
 * @param {boolean} [options.forceSync=false]      - Always sync before reading
 * @param {number}  [options.maxAgeMs]             - Max cache age; defaults to 10 min
 * @returns {Promise<SamsaraVehicleProfile[]>}
 */
async function fetchVehicles(uid, { forceSync = false, maxAgeMs = DEFAULT_MAX_AGE } = {}) {
    if (!uid) throw new Error('fetchVehicles: uid is required.');

    const db = _db();
    const cacheRef = db.doc(PATHS.fleetCache(uid));
    const cacheSnap = await cacheRef.get();

    const cachedAt  = cacheSnap.exists ? (cacheSnap.data().syncedAt || 0) : 0;
    const isStale   = (Date.now() - cachedAt) > maxAgeMs;
    const needsSync = forceSync || !cacheSnap.exists || isStale;

    if (needsSync) {
        await triggerSync(uid);
        const freshSnap = await cacheRef.get();
        if (!freshSnap.exists) return [];
        return (freshSnap.data().vehicles || []).map(normalizeSamsaraVehicle);
    }

    return (cacheSnap.data().vehicles || []).map(normalizeSamsaraVehicle);
}

/**
 * Subscribe to live fleet cache updates.
 * The callback is called immediately with current data and again whenever
 * a sync completes and the cache doc is updated.
 *
 * @param {string} uid
 * @param {function(SamsaraVehicleProfile[]): void} onUpdate
 * @param {function(Error): void} [onError]
 * @returns {function} Unsubscribe function
 */
function subscribeToFleet(uid, onUpdate, onError = console.warn) {
    if (!uid) throw new Error('subscribeToFleet: uid is required.');
    const db = _db();
    return db.doc(PATHS.fleetCache(uid)).onSnapshot(
        (snap) => {
            if (!snap.exists) { onUpdate([]); return; }
            onUpdate((snap.data().vehicles || []).map(normalizeSamsaraVehicle));
        },
        onError
    );
}

/**
 * Return the cached SamsaraVehicleProfile for a specific Firestore truck doc ID.
 * Returns null if no match is found in the cache.
 *
 * @param {string} uid
 * @param {string} truckId - Firestore truck document ID
 * @returns {Promise<SamsaraVehicleProfile|null>}
 */
async function getVehicleByTruckId(uid, truckId) {
    if (!uid || !truckId) throw new Error('getVehicleByTruckId: uid and truckId are required.');
    const vehicles = await fetchVehicles(uid);
    return vehicles.find(v => v.unitId === truckId) || null;
}

// ── Stub functions (later steps) ─────────────────────────────
// These will be implemented when the Cloud Function is expanded to
// fetch and cache detailed per-vehicle stats.

/**
 * @todo Step 2: Expand samsaraFleetSync to fetch detailed vehicle stats.
 * Endpoint: GET /fleet/vehicles/{id}/stats (odometer, engineHours, fuelPercents)
 */
async function fetchVehicleStats(_uid, _samsaraVehicleId) {
    throw new Error('fetchVehicleStats: not yet implemented. See TODO Step 2.');
}

/**
 * @todo Step 3: Fault/DTC codes.
 * Endpoint: GET /fleet/vehicles/{id}/safety/fault-codes
 */
async function fetchFaultCodes(_uid, _samsaraVehicleId) {
    throw new Error('fetchFaultCodes: not yet implemented. See TODO Step 3.');
}

/**
 * @todo Step 4: Safety events (harsh braking, speeding, distracted driving).
 * Endpoint: GET /fleet/safety/events
 */
async function fetchSafetyEvents(_uid, _samsaraVehicleId) {
    throw new Error('fetchSafetyEvents: not yet implemented. See TODO Step 4.');
}

/**
 * @todo Step 5: Per-vehicle fuel data.
 * Endpoint: GET /fleet/vehicles/stats?types=fuelPercents,engineLoad
 */
async function fetchFuelData(_uid, _samsaraVehicleId) {
    throw new Error('fetchFuelData: not yet implemented. See TODO Step 5.');
}

/**
 * Full fleet sync: force-refresh all cached vehicle data.
 * Currently covers: vehicle list, VIN matching, GPS locations.
 * Extended stats (faults, fuel, safety) will be added in later steps.
 *
 * @param {string} uid
 * @returns {Promise<SamsaraVehicleProfile[]>}
 */
async function syncSamsaraFleet(uid) {
    return fetchVehicles(uid, { forceSync: true });
}

// ── Module export ─────────────────────────────────────────────
// Supports both ES module imports and legacy browser global.

const SamsaraIntegration = {
    // Core (implemented)
    fetchVehicles,
    syncSamsaraFleet,
    triggerSync,
    subscribeToFleet,
    getVehicleByTruckId,
    normalizeSamsaraVehicle,
    // Stubs (future steps)
    fetchVehicleStats,
    fetchFaultCodes,
    fetchSafetyEvents,
    fetchFuelData,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SamsaraIntegration;
} else {
    window.SamsaraIntegration = SamsaraIntegration;
}
