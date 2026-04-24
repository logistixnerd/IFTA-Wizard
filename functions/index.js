'use strict';
/**
 * IFTA Wizard – Cloud Functions (Gen 1)
 *
 * Gen 1 functions are publicly accessible by default — no Cloud Run IAM.
 * Uses firebase-functions v4 with runWith() for Gen 1 deployment.
 *
 * Secrets required:
 *   firebase functions:secrets:set FMCSA_API_KEY
 *   firebase functions:secrets:set SAMSARA_CLIENT_ID
 *   firebase functions:secrets:set SAMSARA_CLIENT_SECRET
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const FMCSA_BASE_URL = 'https://mobile.fmcsa.dot.gov/qc/services';

/**
 * Normalise raw FMCSA carrier object into a clean response shape.
 */
function normaliseCarrier(carrier, requestedMc) {
  const address = [
    carrier.phyStreet,
    carrier.phyCityName,
    carrier.phyStateAbbr,
    carrier.phyZipcode,
  ]
    .filter(Boolean)
    .join(', ');

  // Census type can be "MC" or "MX" (Mexican carriers)
  const censusPrefix = carrier.censusTypeId === 'MX' ? 'MX' : 'MC';
  const mcFormatted = carrier.censusNum
    ? `${censusPrefix}-${carrier.censusNum}`
    : `MC-${requestedMc}`;

  return {
    companyName: carrier.legalName || null,
    dbaName: carrier.dbaName || null,
    dotNumber: carrier.dotNumber ? String(carrier.dotNumber) : null,
    mcNumber: mcFormatted,
    status: carrier.allowedToOperate === 'Y' ? 'Authorized' : 'Not Authorized',
    safetyRating: carrier.safetyRating || null,
    address: address || null,
    phone: carrier.telephone
      ? carrier.telephone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
      : null,
    operationType: carrier.carrierOperationDesc || null,
    entityType: carrier.entityTypeDesc || null,
    insuranceOnFile: carrier.bipdInsuranceOnFile === '1',
  };
}

exports.mcLookup = functions
  .runWith({ secrets: ['FMCSA_API_KEY'], memory: '256MB', timeoutSeconds: 20 })
  .https.onCall(async (data, context) => {
    // When called via Firebase Hosting rewrite, the Authorization header is stripped.
    // Accept idToken in data as a fallback.
    if (!context.auth) {
      if (!data.idToken) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
      try { await admin.auth().verifyIdToken(data.idToken); }
      catch (_) { throw new functions.https.HttpsError('unauthenticated', 'Invalid authentication token.'); }
    }

    // ── DOT lookup path — full carrier snapshot ──────────────────────────────
    if (data.dot) {
      const dot = String(data.dot).replace(/\D/g, '').trim();
      if (!dot || dot.length > 9) throw new functions.https.HttpsError('invalid-argument', 'Invalid DOT number');
      try {
        const apiKey = process.env.FMCSA_API_KEY;
        const base = FMCSA_BASE_URL;
        const upstream = await fetch(`${base}/carriers/${encodeURIComponent(dot)}?webKey=${encodeURIComponent(apiKey)}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(12_000),
        });
        if (upstream.status === 404) throw new functions.https.HttpsError('not-found', `No carrier found for DOT number ${dot}`);
        if (!upstream.ok) throw new functions.https.HttpsError('unavailable', 'Upstream FMCSA API error. Try again later.');
        const body = await upstream.json();
        const carrier = body?.content?.carrier;
        if (!carrier) throw new functions.https.HttpsError('not-found', `No carrier data returned for DOT number ${dot}`);
        let docketNumbers = [], operationClasses = [];
        try {
          const [docketRes, opsRes] = await Promise.all([
            fetch(`${base}/carriers/${encodeURIComponent(dot)}/docket-numbers?webKey=${encodeURIComponent(apiKey)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) }),
            fetch(`${base}/carriers/${encodeURIComponent(dot)}/operation-classification?webKey=${encodeURIComponent(apiKey)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) }),
          ]);
          if (docketRes.ok) { const d = await docketRes.json(); docketNumbers = d?.content || []; }
          if (opsRes.ok) { const d = await opsRes.json(); operationClasses = d?.content || []; }
        } catch (_) { /* non-critical */ }
        return { success: true, data: normaliseCarrierFull(carrier), raw: carrier, docketNumbers, operationClasses };
      } catch (err) {
        if (err instanceof functions.https.HttpsError) throw err;
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
          throw new functions.https.HttpsError('deadline-exceeded', 'FMCSA API request timed out. Try again.');
        }
        console.error('mcLookup DOT error:', err);
        throw new functions.https.HttpsError('internal', 'Internal server error');
      }
    }

    // ── MC lookup path ────────────────────────────────────────────────────────
    const mc = String(data.mc || '').replace(/\D/g, '').trim();
    if (!mc) throw new functions.https.HttpsError('invalid-argument', 'Missing required parameter: mc');
    if (mc.length < 3 || mc.length > 8) throw new functions.https.HttpsError('invalid-argument', 'MC number must be between 3 and 8 digits');

    try {
      const apiKey = process.env.FMCSA_API_KEY;
      const url = `${FMCSA_BASE_URL}/carriers/docket-number/${encodeURIComponent(mc)}?webKey=${encodeURIComponent(apiKey)}`;

      const upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (upstream.status === 404) throw new functions.https.HttpsError('not-found', `No carrier found for MC number ${mc}`);
      if (!upstream.ok) throw new functions.https.HttpsError('unavailable', 'Upstream FMCSA API error. Try again later.');

      const body = await upstream.json();
      const carrier = body?.content?.carrier;
      if (!carrier) throw new functions.https.HttpsError('not-found', `No carrier data returned for MC number ${mc}`);

      return { success: true, data: normaliseCarrier(carrier, mc) };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new functions.https.HttpsError('deadline-exceeded', 'FMCSA API request timed out. Try again.');
      }
      console.error('mcLookup unexpected error:', err);
      throw new functions.https.HttpsError('internal', 'Internal server error');
    }
  });

// ─────────────────────────────────────────────────────────
// Carrier Lookup by DOT — comprehensive company snapshot
// ─────────────────────────────────────────────────────────

/**
 * Normalise full carrier record into a comprehensive snapshot.
 */
function normaliseCarrierFull(c) {
  const fmt = (v) => (v != null && v !== '' ? String(v) : null);
  const fmtPhone = (v) => {
    if (!v) return null;
    const d = String(v).replace(/\D/g, '');
    return d.length === 10 ? d.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3') : String(v);
  };
  const yesNo = (v) => (v === 'Y' || v === '1' || v === true);

  return {
    // Identity
    legalName: fmt(c.legalName),
    dbaName: fmt(c.dbaName),
    dotNumber: fmt(c.dotNumber),
    mcNumber: c.censusNum ? `MC-${c.censusNum}` : null,
    einNumber: fmt(c.einNumber),
    dunsNumber: fmt(c.dunsNumber),
    statusCode: fmt(c.statusCode),
    allowedToOperate: yesNo(c.allowedToOperate) ? 'Authorized' : 'Not Authorized',
    operationType: fmt(c.carrierOperationDesc),
    entityType: fmt(c.entityTypeDesc),

    // Physical address
    phyStreet: fmt(c.phyStreet),
    phyCity: fmt(c.phyCityName || c.phyCity),
    phyState: fmt(c.phyStateAbbr || c.phyState),
    phyZip: fmt(c.phyZipcode),
    phyCountry: fmt(c.phyCountry),
    // Mailing address
    maiStreet: fmt(c.maiStreet),
    maiCity: fmt(c.maiCityName || c.maiCity),
    maiState: fmt(c.maiStateAbbr || c.maiState),
    maiZip: fmt(c.maiZipcode),
    maiCountry: fmt(c.maiCountry),

    telephone: fmtPhone(c.telephone),
    fax: fmtPhone(c.fax),
    email: fmt(c.emailAddress),

    // Fleet size
    totalDrivers: c.totalDrivers != null ? Number(c.totalDrivers) : null,
    totalPowerUnits: c.totalPowerUnits != null ? Number(c.totalPowerUnits) : null,

    // Mileage
    mcs150Mileage: c.mcs150Mileage != null ? Number(c.mcs150Mileage) : null,
    mcs150MileageYear: fmt(c.mcs150MileageYear),
    mcs150FormDate: fmt(c.mcs150FormDate),

    // Safety
    safetyRating: fmt(c.safetyRating),
    safetyRatingDate: fmt(c.safetyRatingDate),
    reviewDate: fmt(c.reviewDate),
    reviewType: fmt(c.reviewType),

    // Crashes
    crashTotal: c.crashTotal != null ? Number(c.crashTotal) : null,
    fatalCrash: c.fatalCrash != null ? Number(c.fatalCrash) : null,
    injCrash: c.injCrash != null ? Number(c.injCrash) : null,
    towCrash: c.towCrash != null ? Number(c.towCrash) : null,

    // Inspections
    inspectionTotal: c.inspectionTotal != null ? Number(c.inspectionTotal) : null,
    driverInsp: c.driverInsp != null ? Number(c.driverInsp) : null,
    vehicleInsp: c.vehicleInsp != null ? Number(c.vehicleInsp) : null,
    hazmatInsp: c.hazmatInsp != null ? Number(c.hazmatInsp) : null,

    // Out of service
    driverOOS: c.driverOOS != null ? Number(c.driverOOS) : null,
    vehicleOOS: c.vehicleOOS != null ? Number(c.vehicleOOS) : null,
    hazmatOOS: c.hazmatOOS != null ? Number(c.hazmatOOS) : null,
    driverOOSRate: c.driverOOSRate != null ? Number(c.driverOOSRate) : null,
    vehicleOOSRate: c.vehicleOOSRate != null ? Number(c.vehicleOOSRate) : null,

    // Insurance
    bipdInsuranceRequired: fmt(c.bipdInsuranceRequired),
    bipdInsuranceOnFile: fmt(c.bipdInsuranceOnFile),
    cargoInsuranceRequired: fmt(c.cargoInsuranceRequired),
    cargoInsuranceOnFile: fmt(c.cargoInsuranceOnFile),
    bondInsuranceRequired: fmt(c.bondInsuranceRequired),
    bondInsuranceOnFile: fmt(c.bondInsuranceOnFile),

    // OIC state (state of insurance)
    oicState: fmt(c.oicState),

    fetchedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────
// FMCSA DOT Lookup — Firestore-triggered (no public HTTP needed)
// Client writes users/{uid}/fmcsaLookups/{id} with {dot, status:'pending'}
// This function fetches FMCSA data and writes {status:'complete', raw, ...} back
// ─────────────────────────────────────────────────────────
exports.fmcsaLookup = functions
  .runWith({ secrets: ['FMCSA_API_KEY'], memory: '256MB', timeoutSeconds: 25 })
  .firestore.document('users/{uid}/fmcsaLookups/{lookupId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    if (data.status !== 'pending') return;
    const dot = String(data.dot || '').replace(/\D/g, '').trim();
    if (!dot || dot.length > 9) {
      await snap.ref.update({ status: 'error', error: 'Invalid DOT number' });
      return;
    }
    try {
      const apiKey = process.env.FMCSA_API_KEY;
      const base = FMCSA_BASE_URL;
      const upstream = await fetch(`${base}/carriers/${encodeURIComponent(dot)}?webKey=${encodeURIComponent(apiKey)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (upstream.status === 404) {
        await snap.ref.update({ status: 'error', error: `No carrier found for DOT number ${dot}` });
        return;
      }
      if (!upstream.ok) {
        await snap.ref.update({ status: 'error', error: 'Upstream FMCSA API error. Try again later.' });
        return;
      }
      const body = await upstream.json();
      const carrier = body?.content?.carrier;
      if (!carrier) {
        await snap.ref.update({ status: 'error', error: `No carrier data returned for DOT number ${dot}` });
        return;
      }
      let docketNumbers = [], operationClasses = [];
      try {
        const [docketRes, opsRes] = await Promise.all([
          fetch(`${base}/carriers/${encodeURIComponent(dot)}/docket-numbers?webKey=${encodeURIComponent(apiKey)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) }),
          fetch(`${base}/carriers/${encodeURIComponent(dot)}/operation-classification?webKey=${encodeURIComponent(apiKey)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) }),
        ]);
        if (docketRes.ok) { const d = await docketRes.json(); docketNumbers = d?.content || []; }
        if (opsRes.ok) { const d = await opsRes.json(); operationClasses = d?.content || []; }
      } catch (_) { /* non-critical */ }
      await snap.ref.update({
        status: 'complete',
        raw: carrier,
        docketNumbers,
        operationClasses,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        await snap.ref.update({ status: 'error', error: 'FMCSA API timed out. Try again.' });
        return;
      }
      console.error('fmcsaLookup error:', err);
      await snap.ref.update({ status: 'error', error: 'Internal error. Try again.' });
    }
  });

// ─────────────────────────────────────────────────────────
// Samsara OAuth2 Integration
// ─────────────────────────────────────────────────────────

const SAMSARA_TOKEN_URL = 'https://api.samsara.com/oauth2/token';
const SAMSARA_AUTH_URL = 'https://api.samsara.com/oauth2/authorize';
const SAMSARA_API_BASE = 'https://api.samsara.com';
// HOSTING_ORIGIN is no longer hardcoded — derived from the request or passed by the client.
// Allowed redirect origins (must also be registered in Samsara developer portal).
const ALLOWED_ORIGINS = new Set([
  'https://ifta-wizard-a9061.web.app',
  'https://www.logistixnerd.com',
  'https://ifta-wizard-a9061.firebaseapp.com',
]);
const CANONICAL_ORIGIN = 'https://ifta-wizard-a9061.web.app';

function resolveAllowedOrigin(origin) {
  return origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : CANONICAL_ORIGIN;
}

function safeNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function timestampMsFromUnknown(item) {
  if (!item || typeof item !== 'object') return null;

  const candidates = [
    item.updatedAt,
    item.lastUpdatedAt,
    item.lastModifiedAt,
    item.lastModifiedTime,
    item.time,
    item.createdAt,
    item.createdTime,
  ];

  for (const val of candidates) {
    if (!val) continue;
    const ms = Date.parse(String(val));
    if (!Number.isNaN(ms)) return ms;
  }

  return null;
}

const SAMSARA_ENTITY_MODELS = Object.freeze({
  drivers: { collection: 'samsara_drivers', entityType: 'driver' },
  vehicles: { collection: 'samsara_vehicles', entityType: 'vehicle' },
  trailers: { collection: 'samsara_trailers', entityType: 'trailer' },
  trips: { collection: 'samsara_trips', entityType: 'trip' },
  safetyEvents: { collection: 'samsara_safety_events', entityType: 'safety_event' },
  dvirs: { collection: 'samsara_dvirs', entityType: 'dvir' },
  defects: { collection: 'samsara_defects', entityType: 'defect' },
  alerts: { collection: 'samsara_alerts', entityType: 'alert' },
  documents: { collection: 'samsara_documents', entityType: 'document' },
  workOrders: { collection: 'samsara_work_orders', entityType: 'work_order' },
  fuelTransactions: { collection: 'samsara_fuel_transactions', entityType: 'fuel_transaction' },
  hosLogs: { collection: 'samsara_hos_logs', entityType: 'hos_log' },
  assignments: { collection: 'samsara_assignments', entityType: 'assignment' },
});

function buildSamsaraBaseRecord(modelKey, raw, payload) {
  const model = SAMSARA_ENTITY_MODELS[modelKey];
  if (!model) return null;

  const samsaraId = String(raw?.id || raw?.samsaraId || '').trim();
  if (!samsaraId) return null;

  return {
    internalId: samsaraId,
    samsaraId,
    sourceSystem: 'samsara',
    entityType: model.entityType,
    sourceUpdatedAt: raw.updatedAt || raw.lastUpdatedAt || raw.lastModifiedAt || raw.time || null,
    ...payload,
  };
}

function normalizeSamsaraVehicle(raw) {
  return buildSamsaraBaseRecord('vehicles', raw, {
    name: raw.name || '',
    vin: raw.vin ? String(raw.vin).toUpperCase() : null,
    licensePlate: raw.licensePlate || null,
    make: raw.make || null,
    model: raw.model || null,
    year: safeNumber(raw.year),
    status: raw.status || null,
  });
}

function normalizeSamsaraTrailer(raw) {
  return buildSamsaraBaseRecord('trailers', raw, {
    name: raw.name || '',
    vin: raw.vin ? String(raw.vin).toUpperCase() : null,
    licensePlate: raw.licensePlate || null,
    make: raw.make || null,
    model: raw.model || null,
    year: safeNumber(raw.year),
    status: raw.status || null,
  });
}

function normalizeSamsaraDriver(raw) {
  const firstName = raw.firstName || '';
  const lastName = raw.lastName || '';
  const fullName = (firstName + ' ' + lastName).trim() || raw.name || '';

  return buildSamsaraBaseRecord('drivers', raw, {
    firstName: firstName || null,
    lastName: lastName || null,
    fullName,
    email: raw.email || null,
    phone: raw.phone || null,
    licenseNumber: raw.licenseNumber || null,
    status: raw.status || null,
  });
}

function normalizeSamsaraTrip(raw) {
  return buildSamsaraBaseRecord('trips', raw, {
    vehicleSamsaraId: raw.vehicleId || raw.vehicle?.id || null,
    driverSamsaraId: raw.driverId || raw.driver?.id || null,
    startTime: raw.startTime || null,
    endTime: raw.endTime || null,
    distanceMeters: safeNumber(raw.distanceMeters),
    status: raw.status || null,
  });
}

function normalizeSamsaraSafetyEvent(raw) {
  return buildSamsaraBaseRecord('safetyEvents', raw, {
    vehicleSamsaraId: raw.vehicleId || raw.vehicle?.id || null,
    driverSamsaraId: raw.driverId || raw.driver?.id || null,
    eventType: raw.type || raw.behaviorLabel || null,
    severity: raw.severity || null,
    eventTime: raw.time || null,
  });
}

function normalizeSamsaraDvir(raw) {
  return buildSamsaraBaseRecord('dvirs', raw, {
    vehicleSamsaraId: raw.vehicleId || raw.vehicle?.id || null,
    trailerSamsaraId: raw.trailerId || raw.trailer?.id || null,
    driverSamsaraId: raw.driverId || raw.driver?.id || null,
    submittedAt: raw.submittedAt || raw.time || null,
    status: raw.status || null,
  });
}

function normalizeSamsaraDefect(raw) {
  return buildSamsaraBaseRecord('defects', raw, {
    dvirSamsaraId: raw.dvirId || null,
    vehicleSamsaraId: raw.vehicleId || raw.vehicle?.id || null,
    trailerSamsaraId: raw.trailerId || raw.trailer?.id || null,
    defectType: raw.type || null,
    status: raw.status || null,
    resolvedAt: raw.resolvedAt || null,
  });
}

function normalizeSamsaraAlert(raw) {
  return buildSamsaraBaseRecord('alerts', raw, {
    alertType: raw.type || null,
    severity: raw.severity || null,
    status: raw.status || null,
    message: raw.message || raw.description || null,
    triggeredAt: raw.triggeredAt || raw.time || null,
  });
}

function normalizeSamsaraDocument(raw) {
  return buildSamsaraBaseRecord('documents', raw, {
    documentType: raw.documentType || raw.type || null,
    title: raw.title || raw.name || null,
    ownerSamsaraId: raw.ownerId || null,
    expiresAt: raw.expiresAt || null,
    status: raw.status || null,
  });
}

function normalizeSamsaraWorkOrder(raw) {
  return buildSamsaraBaseRecord('workOrders', raw, {
    vehicleSamsaraId: raw.vehicleId || raw.assetId || null,
    title: raw.title || null,
    description: raw.description || null,
    priority: raw.priority || null,
    status: raw.status || null,
    dueAt: raw.dueAt || null,
  });
}

function normalizeSamsaraFuelTransaction(raw) {
  return buildSamsaraBaseRecord('fuelTransactions', raw, {
    vehicleSamsaraId: raw.vehicleId || raw.vehicle?.id || null,
    driverSamsaraId: raw.driverId || raw.driver?.id || null,
    gallons: safeNumber(raw.gallons),
    totalCost: safeNumber(raw.totalCost),
    currency: raw.currency || 'USD',
    purchasedAt: raw.purchasedAt || raw.time || null,
  });
}

function normalizeSamsaraHosLog(raw) {
  return buildSamsaraBaseRecord('hosLogs', raw, {
    driverSamsaraId: raw.driverId || raw.driver?.id || null,
    vehicleSamsaraId: raw.vehicleId || raw.vehicle?.id || null,
    status: raw.hosStatus || raw.status || null,
    dutyStatus: raw.dutyStatus || null,
    logDate: raw.logDate || null,
  });
}

function normalizeSamsaraAssignment(raw) {
  return buildSamsaraBaseRecord('assignments', raw, {
    driverSamsaraId: raw.driverId || raw.driver?.id || null,
    vehicleSamsaraId: raw.vehicleId || raw.vehicle?.id || null,
    trailerSamsaraId: raw.trailerId || raw.trailer?.id || null,
    assignmentType: raw.assignmentType || raw.type || null,
    startedAt: raw.startTime || raw.assignedAt || null,
    endedAt: raw.endTime || null,
    status: raw.status || null,
  });
}

const SAMSARA_NORMALIZERS = Object.freeze({
  vehicles: normalizeSamsaraVehicle,
  drivers: normalizeSamsaraDriver,
  trailers: normalizeSamsaraTrailer,
  trips: normalizeSamsaraTrip,
  safetyEvents: normalizeSamsaraSafetyEvent,
  dvirs: normalizeSamsaraDvir,
  defects: normalizeSamsaraDefect,
  alerts: normalizeSamsaraAlert,
  documents: normalizeSamsaraDocument,
  workOrders: normalizeSamsaraWorkOrder,
  fuelTransactions: normalizeSamsaraFuelTransaction,
  hosLogs: normalizeSamsaraHosLog,
  assignments: normalizeSamsaraAssignment,
});

async function getUserSamsaraTokens(uid) {
  const userSnap = await admin.firestore().collection('users').doc(uid).get();
  if (!userSnap.exists) return null;
  const userData = userSnap.data() || {};
  const tokens = userData.samsara || null;
  if (!tokens) return null;

  // Compatibility with legacy snake_case token fields.
  return {
    ...tokens,
    accessToken: tokens.accessToken || tokens.access_token || null,
    refreshToken: tokens.refreshToken || tokens.refresh_token || null,
    expiresAt: tokens.expiresAt || tokens.token_expiry || null,
    scope: tokens.scope || null,
    scopes: tokens.scopes || null,
  };
}

async function refreshSamsaraTokenIfNeeded(uid, tokens) {
  const compatibleTokens = {
    ...(tokens || {}),
    accessToken: tokens?.accessToken || tokens?.access_token || null,
    refreshToken: tokens?.refreshToken || tokens?.refresh_token || null,
    expiresAt: tokens?.expiresAt || tokens?.token_expiry || null,
  };

  if (!compatibleTokens.accessToken) {
    throw new functions.https.HttpsError('failed-precondition', 'Samsara account is not connected.');
  }

  if (!compatibleTokens.expiresAt || Date.now() < (compatibleTokens.expiresAt - 300000)) {
    return compatibleTokens;
  }

  if (!compatibleTokens.refreshToken) {
    throw new functions.https.HttpsError('failed-precondition', 'Samsara token expired. Reconnect integration.');
  }

  const clientId = (process.env.SAMSARA_CLIENT_ID || '').trim();
  const clientSecret = (process.env.SAMSARA_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new functions.https.HttpsError('failed-precondition', 'Samsara OAuth secrets are not configured.');
  }

  const refreshRes = await fetch(SAMSARA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: compatibleTokens.refreshToken,
    }).toString(),
    signal: AbortSignal.timeout(12000),
  });

  if (!refreshRes.ok) {
    const body = await refreshRes.text();
    console.error('refreshSamsaraTokenIfNeeded failed:', refreshRes.status, body);
    throw new functions.https.HttpsError('unauthenticated', 'Unable to refresh Samsara token. Reconnect integration.');
  }

  const refreshed = await refreshRes.json();
  const nextTokens = {
    ...compatibleTokens,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || compatibleTokens.refreshToken,
    expiresAt: Date.now() + ((refreshed.expires_in || 3600) * 1000),
    refreshedAt: Date.now(),
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || compatibleTokens.refreshToken,
    token_expiry: Date.now() + ((refreshed.expires_in || 3600) * 1000),
    scope: refreshed.scope || compatibleTokens.scope || null,
    scopes: refreshed.scope
      ? String(refreshed.scope).split(/\s+/).filter(Boolean)
      : (compatibleTokens.scopes || null),
  };

  await admin.firestore().collection('users').doc(uid).set({
    samsara: {
      accessToken: nextTokens.accessToken,
      refreshToken: nextTokens.refreshToken,
      expiresAt: nextTokens.expiresAt,
      refreshedAt: nextTokens.refreshedAt,
      access_token: nextTokens.access_token,
      refresh_token: nextTokens.refresh_token,
      token_expiry: nextTokens.token_expiry,
      scope: nextTokens.scope,
      scopes: nextTokens.scopes,
    },
  }, { merge: true });

  return nextTokens;
}

async function fetchSamsaraPages({ accessToken, path, limit = 512, extraParams = {} }) {
  const headers = { Authorization: 'Bearer ' + accessToken };
  const allItems = [];
  let cursor = null;
  let pageCount = 0;

  while (pageCount < 20) {
    pageCount += 1;
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    for (const [k, v] of Object.entries(extraParams || {})) {
      if (v != null && v !== '') params.set(k, String(v));
    }
    if (cursor) params.set('after', cursor);

    const url = `${SAMSARA_API_BASE}${path}?${params.toString()}`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Samsara API ${path} failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const payload = await res.json();
    const items = Array.isArray(payload?.data) ? payload.data : [];
    allItems.push(...items);

    const nextCursor = payload?.pagination?.endCursor || payload?.pagination?.nextCursor || null;
    const hasNext = payload?.pagination?.hasNextPage === true || Boolean(nextCursor);

    if (!hasNext || !nextCursor) break;
    cursor = nextCursor;
  }

  return allItems;
}

async function upsertNormalizedEntities(uid, collectionName, entities, runMeta) {
  if (!entities.length) return { upserted: 0 };

  const parent = admin.firestore().collection('users').doc(uid);
  let batch = admin.firestore().batch();
  let ops = 0;
  let commits = 0;

  for (const entity of entities) {
    const samsaraId = entity.samsaraId || entity.externalId;
    if (!samsaraId) continue;

    const internalId = entity.internalId || samsaraId;
    const docRef = parent.collection(collectionName).doc(String(internalId));
    batch.set(docRef, {
      ...entity,
      internalId: String(internalId),
      samsaraId: String(samsaraId),
      sourceSystem: 'samsara',
      external: {
        provider: 'samsara',
        id: String(samsaraId),
      },
      raw: entity.raw || null,
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSyncRunId: runMeta.runId,
    }, { merge: true });

    ops += 1;
    if (ops === 400) {
      await batch.commit();
      commits += 1;
      batch = admin.firestore().batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
    commits += 1;
  }

  return { upserted: entities.length, commits };
}

async function runSamsaraIncrementalSync(uid, options = {}) {
  const resources = Array.isArray(options.resources) && options.resources.length
    ? options.resources
    : ['vehicles', 'drivers', 'trailers'];
  const fullResync = Boolean(options.fullResync);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const stateRef = admin.firestore().collection('users').doc(uid).collection('integration_sync').doc('samsara');
  const stateSnap = await stateRef.get();
  const prevState = stateSnap.exists ? (stateSnap.data() || {}) : {};
  const prevCursors = prevState.cursors || {};

  let tokens = await getUserSamsaraTokens(uid);
  tokens = await refreshSamsaraTokenIfNeeded(uid, tokens);

  const summary = {
    runId,
    uid,
    fullResync,
    resources,
    startedAt: Date.now(),
    synced: {},
  };

  const configs = {
    vehicles: {
      path: '/fleet/vehicles',
      collection: SAMSARA_ENTITY_MODELS.vehicles.collection,
      normalize: SAMSARA_NORMALIZERS.vehicles,
      cursorKey: 'vehiclesLastSyncedAt',
    },
    drivers: {
      path: '/fleet/drivers',
      collection: SAMSARA_ENTITY_MODELS.drivers.collection,
      normalize: SAMSARA_NORMALIZERS.drivers,
      cursorKey: 'driversLastSyncedAt',
    },
    trailers: {
      path: '/fleet/trailers',
      collection: SAMSARA_ENTITY_MODELS.trailers.collection,
      normalize: SAMSARA_NORMALIZERS.trailers,
      cursorKey: 'trailersLastSyncedAt',
    },
  };

  const nextCursors = { ...prevCursors };

  for (const resource of resources) {
    const cfg = configs[resource];
    if (!cfg) continue;

    const previousCursor = fullResync ? null : (prevCursors[cfg.cursorKey] || null);
    const previousCursorMs = previousCursor ? Date.parse(previousCursor) : null;
    const extraParams = previousCursor ? { updatedAfter: previousCursor } : {};

    const rows = await fetchSamsaraPages({
      accessToken: tokens.accessToken,
      path: cfg.path,
      extraParams,
    });

    const filteredRows = (!fullResync && previousCursorMs)
      ? rows.filter((row) => {
          const ts = timestampMsFromUnknown(row);
          return ts == null || ts > previousCursorMs;
        })
      : rows;

    const normalized = filteredRows
      .map((raw) => {
        const base = cfg.normalize(raw);
        if (!base) return null;
        return {
          ...base,
          raw,
        };
      })
      .filter(Boolean);

    const writeResult = await upsertNormalizedEntities(uid, cfg.collection, normalized, { runId });

    const maxSeenTs = rows.reduce((acc, item) => {
      const ts = timestampMsFromUnknown(item);
      return ts && ts > acc ? ts : acc;
    }, previousCursorMs || 0);

    if (maxSeenTs) {
      nextCursors[cfg.cursorKey] = new Date(maxSeenTs).toISOString();
    } else if (!nextCursors[cfg.cursorKey]) {
      nextCursors[cfg.cursorKey] = new Date().toISOString();
    }

    summary.synced[resource] = {
      fetched: rows.length,
      incremental: filteredRows.length,
      upserted: writeResult.upserted,
      previousCursor: previousCursor || null,
      nextCursor: nextCursors[cfg.cursorKey],
    };
  }

  await stateRef.set({
    provider: 'samsara',
    lastRunId: runId,
    status: 'success',
    lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSyncedAtIso: new Date().toISOString(),
    cursors: nextCursors,
    resources,
    fullResync,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  summary.completedAt = Date.now();
  summary.lastSyncedAtIso = new Date().toISOString();

  return summary;
}

/**
 * Callable: Start Samsara OAuth flow — returns the authorize URL.
 * The client redirects the user to this URL.
 */
exports.samsaraAuthUrl = functions
  .runWith({ secrets: ['SAMSARA_CLIENT_ID'], memory: '256MB', timeoutSeconds: 10 })
  .https.onCall((data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }

    const clientId = process.env.SAMSARA_CLIENT_ID;
    if (!clientId) throw new functions.https.HttpsError('failed-precondition', 'Samsara integration not configured.');

    // Client passes its origin so the redirect_uri matches the domain the user is on.
    const origin = data && data.origin && ALLOWED_ORIGINS.has(data.origin)
      ? data.origin
      : CANONICAL_ORIGIN;

    // Encode uid + origin in state so the callback can reconstruct the redirect_uri.
    const state = Buffer.from(JSON.stringify({ uid: context.auth.uid, ts: Date.now(), origin })).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      state,
      redirect_uri: origin + '/api/samsara/callback',
    });

    return { url: `${SAMSARA_AUTH_URL}?${params.toString()}` };
  });

/**
 * HTTPS handler: Samsara OAuth callback.
 * Exchanges the authorization code for tokens, stores them in Firestore,
 * and redirects back to the dashboard.
 */
exports.samsaraCallback = functions
  .runWith({ secrets: ['SAMSARA_CLIENT_ID', 'SAMSARA_CLIENT_SECRET'], memory: '256MB', timeoutSeconds: 20 })
  .https.onRequest(async (req, res) => {
    let callbackOrigin = CANONICAL_ORIGIN;
    try {
      const { code, state, error } = req.query;

      const FALLBACK_ORIGIN = CANONICAL_ORIGIN;

      if (error) {
        console.warn('Samsara OAuth error:', error);
        return res.redirect(FALLBACK_ORIGIN + '/dashboard.html?samsara=error&reason=' + encodeURIComponent(error));
      }

      if (!code || !state) {
        return res.redirect(FALLBACK_ORIGIN + '/dashboard.html?samsara=error&reason=missing_params');
      }

      // Decode state to get uid
      let parsed;
      try {
        parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
      } catch {
        return res.redirect(FALLBACK_ORIGIN + '/dashboard.html?samsara=error&reason=invalid_state');
      }

      const uid = parsed.uid;
      if (!uid) {
        return res.redirect(FALLBACK_ORIGIN + '/dashboard.html?samsara=error&reason=no_uid');
      }

      // Verify the state isn't stale (10 min window)
      if (Date.now() - parsed.ts > 600000) {
        callbackOrigin = resolveAllowedOrigin(parsed.origin);
        return res.redirect(callbackOrigin + '/dashboard.html?samsara=error&reason=expired');
      }

      // Recover the origin that was used when the OAuth flow started.
      callbackOrigin = resolveAllowedOrigin(parsed.origin);

      const clientId = process.env.SAMSARA_CLIENT_ID;
      const clientSecret = process.env.SAMSARA_CLIENT_SECRET;

      // Exchange code for tokens
      const tokenRes = await fetch(SAMSARA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackOrigin + '/api/samsara/callback',
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error('Samsara token exchange failed:', tokenRes.status, errBody);
        return res.redirect(callbackOrigin + '/dashboard.html?samsara=error&reason=token_exchange');
      }

      const tokens = await tokenRes.json();

      // Store tokens in Firestore under the user's doc
      await admin.firestore().collection('users').doc(uid).set({
        samsara: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in * 1000),
          connectedAt: Date.now(),
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry: Date.now() + (tokens.expires_in * 1000),
          scope: tokens.scope || null,
          scopes: tokens.scope ? String(tokens.scope).split(/\s+/).filter(Boolean) : null,
        }
      }, { merge: true });

      return res.redirect(callbackOrigin + '/dashboard.html?samsara=connected');
    } catch (err) {
      console.error('samsaraCallback unexpected error:', err);
      return res.redirect(callbackOrigin + '/dashboard.html?samsara=error&reason=internal');
    }
  });

/**
 * Firestore trigger: Exchange Samsara OAuth code for tokens.
 * The client writes {code, state} to users/{uid}/samsara_oauth_pending/{docId}.
 * This function picks it up server-side — no HTTP IAM required.
 */
exports.samsaraOAuthCallback = functions
  .runWith({ secrets: ['SAMSARA_CLIENT_ID', 'SAMSARA_CLIENT_SECRET'], memory: '256MB', timeoutSeconds: 30 })
  .firestore.document('users/{uid}/samsara_oauth_pending/{docId}')
  .onCreate(async (snap, context) => {
    const { uid } = context.params;
    const { code, state } = snap.data() || {};

    // Signal to client that the trigger fired
    await snap.ref.update({ status: 'processing' });

    if (!code || !state) {
      await snap.ref.update({ status: 'error', error: 'missing_params' });
      return;
    }

    // Decode and validate state
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      await snap.ref.update({ status: 'error', error: 'invalid_state' });
      return;
    }

    if (parsed.uid !== uid) {
      await snap.ref.update({ status: 'error', error: 'uid_mismatch' });
      return;
    }

    if (Date.now() - parsed.ts > 600000) {
      await snap.ref.update({ status: 'error', error: 'expired' });
      return;
    }

    const REDIRECT_URI = CANONICAL_ORIGIN + '/samsara-callback.html';
    // Trim in case secrets were stored with trailing newline characters
    const clientId = (process.env.SAMSARA_CLIENT_ID || '').trim();
    const clientSecret = (process.env.SAMSARA_CLIENT_SECRET || '').trim();

    const codeAgeMs = Date.now() - parsed.ts;
    console.log(`samsaraOAuthCallback: code age ${codeAgeMs}ms, uid=${uid}`);
    console.log(`samsaraOAuthCallback: clientId prefix=${clientId.slice(0, 8) || 'MISSING'} len=${clientId.length}, secret len=${clientSecret.length}`);

    if (!clientId || !clientSecret) {
      await snap.ref.update({ status: 'error', error: 'missing_credentials' });
      console.error('samsaraOAuthCallback: SAMSARA_CLIENT_ID or SAMSARA_CLIENT_SECRET not set');
      return;
    }

    await snap.ref.update({ status: 'exchanging' });

    try {
      const tokenRes = await fetch(SAMSARA_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
        },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error('Samsara token exchange failed:', tokenRes.status, errBody);
        await snap.ref.update({ status: 'error', error: 'token_exchange_failed' });
        return;
      }

      const tokens = await tokenRes.json();

      // Store tokens in user doc
      await admin.firestore().collection('users').doc(uid).set({
        samsara: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          expiresAt: Date.now() + ((tokens.expires_in || 3600) * 1000),
          connectedAt: Date.now(),
        }
      }, { merge: true });

      // Clean up the pending doc (signals success to the client listener)
      await snap.ref.delete();

    } catch (err) {
      console.error('samsaraOAuthCallback error:', err);
      await snap.ref.update({ status: 'error', error: 'internal' });
    }
  });

/**
 * Callable: Disconnect Samsara — removes stored tokens.
 */
exports.samsaraDisconnect = functions
  .runWith({ memory: '256MB', timeoutSeconds: 10 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }

    await admin.firestore().collection('users').doc(context.auth.uid).update({
      samsara: admin.firestore.FieldValue.delete(),
    });

    return { success: true };
  });

/**
 * Firestore trigger: Sync Samsara fleet data (vehicles + GPS locations).
 * Client writes to users/{uid}/samsara_sync_requests/{docId}.
 * Function fetches from Samsara API, stores fleet cache, updates truck records.
 */
exports.samsaraFleetSync = functions
  .runWith({ secrets: ['SAMSARA_CLIENT_ID', 'SAMSARA_CLIENT_SECRET'], memory: '512MB', timeoutSeconds: 60 })
  .firestore.document('users/{uid}/samsara_sync_requests/{docId}')
  .onCreate(async (snap, context) => {
    const { uid } = context.params;

    await snap.ref.update({ status: 'syncing' });

    try {
      // Read stored Samsara tokens
      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      const userData = userDoc.data() || {};
      let samsaraTokens = userData.samsara;

      if (!samsaraTokens || !samsaraTokens.accessToken) {
        await snap.ref.update({ status: 'error', error: 'not_connected' });
        return;
      }

      // Refresh token if expired (within 5 min of expiry)
      if (Date.now() > (samsaraTokens.expiresAt - 300000)) {
        if (!samsaraTokens.refreshToken) {
          await snap.ref.update({ status: 'error', error: 'token_expired' });
          return;
        }
        const clientId = (process.env.SAMSARA_CLIENT_ID || '').trim();
        const clientSecret = (process.env.SAMSARA_CLIENT_SECRET || '').trim();
        const refreshRes = await fetch(SAMSARA_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
          },
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: samsaraTokens.refreshToken }).toString(),
          signal: AbortSignal.timeout(10000),
        });
        if (!refreshRes.ok) {
          console.error('samsaraFleetSync token refresh failed:', refreshRes.status, await refreshRes.text());
          await snap.ref.update({ status: 'error', error: 'token_refresh_failed' });
          return;
        }
        const newT = await refreshRes.json();
        samsaraTokens = {
          ...samsaraTokens,
          accessToken: newT.access_token,
          refreshToken: newT.refresh_token || samsaraTokens.refreshToken,
          expiresAt: Date.now() + ((newT.expires_in || 3600) * 1000),
        };
        await admin.firestore().collection('users').doc(uid).update({
          'samsara.accessToken': samsaraTokens.accessToken,
          'samsara.refreshToken': samsaraTokens.refreshToken,
          'samsara.expiresAt': samsaraTokens.expiresAt,
        });
      }

      const bearerHeaders = { 'Authorization': 'Bearer ' + samsaraTokens.accessToken };

      // Fetch vehicles, trailers, GPS stats + extended stats in parallel
      const [vehiclesRes, statsRes, extStatsRes, trailersRes, trailerStatsRes] = await Promise.all([
        fetch('https://api.samsara.com/fleet/vehicles?limit=512', { headers: bearerHeaders, signal: AbortSignal.timeout(20000) }),
        fetch('https://api.samsara.com/fleet/vehicles/stats?types=gps&limit=512', { headers: bearerHeaders, signal: AbortSignal.timeout(20000) }),
        fetch('https://api.samsara.com/fleet/vehicles/stats?types=obdOdometerMeters,fuelPercents,engineSeconds&limit=512', { headers: bearerHeaders, signal: AbortSignal.timeout(20000) }),
        fetch('https://api.samsara.com/fleet/trailers?limit=512', { headers: bearerHeaders, signal: AbortSignal.timeout(20000) }),
        fetch('https://api.samsara.com/fleet/trailers/stats?types=gps&limit=512', { headers: bearerHeaders, signal: AbortSignal.timeout(20000) }),
      ]);

      if (!vehiclesRes.ok) {
        console.error('samsaraFleetSync vehicles API error:', vehiclesRes.status, await vehiclesRes.text());
        await snap.ref.update({ status: 'error', error: 'api_error_vehicles' });
        return;
      }
      if (!statsRes.ok) {
        console.error('samsaraFleetSync stats API error:', statsRes.status, await statsRes.text());
        await snap.ref.update({ status: 'error', error: 'api_error_stats' });
        return;
      }

      const vehiclesText    = await vehiclesRes.text();
      const statsText       = await statsRes.text();
      const extStatsRawText = await extStatsRes.text();
      console.log('samsaraFleetSync diag: extStats HTTP status =', extStatsRes.status, '| body (first 500) =', extStatsRawText.slice(0, 500));
      const extStatsText    = extStatsRes.ok ? extStatsRawText : '{"data":[]}';
      const trailersText    = trailersRes.ok ? await trailersRes.text() : '{"data":[]}';
      const trailerStatsText = trailerStatsRes.ok ? await trailerStatsRes.text() : '{"data":[]}';

      let vehiclesData, statsData, extStatsData, trailersData, trailerStatsData;
      try { vehiclesData     = JSON.parse(vehiclesText);     } catch(e) { vehiclesData     = { data: [] }; }
      try { statsData        = JSON.parse(statsText);        } catch(e) { statsData        = { data: [] }; }
      try { extStatsData     = JSON.parse(extStatsText);     } catch(e) { extStatsData     = { data: [] }; }
      try { trailersData     = JSON.parse(trailersText);     } catch(e) { trailersData     = { data: [] }; }
      try { trailerStatsData = JSON.parse(trailerStatsText); } catch(e) { trailerStatsData = { data: [] }; }

      console.log('samsaraFleetSync diag: trailers count =', (trailersData.data || []).length,
        '| trailer GPS count =', (trailerStatsData.data || []).length);

      // Diagnostic: log raw counts and first 500 chars of each response
      console.log('samsaraFleetSync diag: vehicles count =', (vehiclesData.data || []).length,
        '| stats count =', (statsData.data || []).length,
        '| extStats count =', (extStatsData.data || []).length);
      console.log('samsaraFleetSync diag: vehicles body (first 500) =', vehiclesText.slice(0, 500));
      if ((statsData.data || []).length > 0) {
        const sample = statsData.data[0];
        console.log('samsaraFleetSync diag: stats sample keys =', Object.keys(sample).join(','),
          '| gps field =', JSON.stringify(sample.gps));
      }

      // Build GPS lookup by vehicle ID
      // The stats endpoint wraps each stat: { time, value: { latitude, longitude, ... } }
      // Fall back to flat structure in case the API version differs.
      const gpsById = {};
      for (const v of (statsData.data || [])) {
        if (!v.gps) continue;
        gpsById[v.id] = v.gps.value || v.gps; // unwrap .value if present
      }
      // Trailer GPS lookup
      const trailerGpsById = {};
      for (const t of (trailerStatsData.data || [])) {
        if (!t.gps) continue;
        trailerGpsById[t.id] = t.gps.value || t.gps;
      }
      console.log('samsaraFleetSync: GPS lookup built for', Object.keys(gpsById).length, 'vehicles (sample:', JSON.stringify(Object.values(gpsById)[0] || null), ')');

      // Build extended stats lookup by vehicle ID (odometer, engineHours, fuelLevel)
      const extById = {};
      for (const v of (extStatsData.data || [])) {
        extById[v.id] = {
          odometerMeters: v.obdOdometerMeters?.value ?? null,
          engineHours:    v.engineSeconds?.value    != null ? Math.round(v.engineSeconds.value / 360) / 10 : null,
          fuelPercent:    v.fuelPercents?.value      ?? null,
        };
      }

      // Fetch fault codes + safety events per vehicle (best-effort, parallel batch)
      // Only fetch for up to 50 vehicles to stay within function timeout
      const vehicleIds = (vehiclesData.data || []).map(v => v.id).slice(0, 50);
      const faultsByVehicle = {};
      const safetyByVehicle = {};

      // Safety events: single paginated call filtered by vehicleIds
      if (vehicleIds.length) {
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        try {
          const safetyRes = await fetch(
            'https://api.samsara.com/fleet/safety/events?startTime=' + new Date(sevenDaysAgo).toISOString() +
            '&endTime=' + new Date(now).toISOString() + '&limit=512',
            { headers: bearerHeaders, signal: AbortSignal.timeout(15000) }
          );
          if (safetyRes.ok) {
            const safetyData = await safetyRes.json();
            for (const ev of (safetyData.data || [])) {
              const vid = ev.vehicle?.id;
              if (!vid) continue;
              if (!safetyByVehicle[vid]) safetyByVehicle[vid] = [];
              safetyByVehicle[vid].push({
                type:      ev.behaviorLabel || ev.type || 'unknown',
                time:      ev.time || null,
                severity:  ev.severity || null,
              });
            }
          }
        } catch (e) {
          console.warn('samsaraFleetSync safety events fetch failed (non-fatal):', e.message);
        }

        // Fault codes: single bulk stats call
        try {
          const faultRes = await fetch(
            'https://api.samsara.com/fleet/vehicles/stats?types=faultCodes&limit=512',
            { headers: bearerHeaders, signal: AbortSignal.timeout(15000) }
          );
          if (faultRes.ok) {
            const faultData = await faultRes.json();
            for (const v of (faultData.data || [])) {
              if (!v.faultCodes) continue;
              faultsByVehicle[v.id] = (v.faultCodes.value || []).map(fc => ({
                code:         fc.faultCode   || fc.spn || fc.dtc || '',
                description:  fc.description || '',
                severity:     fc.severity    || null,
                source:       fc.ecuType     || null,
              }));
            }
          }
        } catch (e) {
          console.warn('samsaraFleetSync fault codes fetch failed (non-fatal):', e.message);
        }
      }

      // Build normalized fleet vehicles array
      const vehicles = (vehiclesData.data || []).map(v => {
        const gps = gpsById[v.id];
        const ext = extById[v.id] || {};
        const odometerMiles = ext.odometerMeters != null ? Math.round(ext.odometerMeters * 0.000621371) : null;
        const engineHours   = ext.engineHours     != null ? Math.round(ext.engineHours * 10) / 10 : null;
        return {
          id:            v.id,
          type:          'truck',
          name:          v.name           || '',
          vin:           (v.vin           || '').toUpperCase(),
          licensePlate:  v.licensePlate   || '',
          make:          v.make           || null,
          model:         v.model          || null,
          year:          v.year           || null,
          odometer:      odometerMiles,
          engineHours,
          fuelLevel:     ext.fuelPercent  != null ? Math.round(ext.fuelPercent) : null,
          faults:        faultsByVehicle[v.id] || [],
          safetyEvents:  safetyByVehicle[v.id] || [],
          safetyScore:   null,
          gps: gps ? {
            lat:      gps.latitude,
            lng:      gps.longitude,
            heading:  gps.headingDegrees || 0,
            speed:    Math.round(gps.speedMilesPerHour || 0),
            location: (gps.reverseGeo || {}).formattedLocation || '',
            time:     gps.time || null,
          } : null,
          matchedTruckId: null,
        };
      });

      // Build normalized trailers array
      const trailers = (trailersData.data || []).map(t => {
        const gps = trailerGpsById[t.id];
        return {
          id:           t.id,
          type:         'trailer',
          name:         t.name          || '',
          vin:          (t.vin          || '').toUpperCase(),
          licensePlate: t.licensePlate  || '',
          make:         t.make          || null,
          model:        t.model         || null,
          year:         t.year          || null,
          gps: gps ? {
            lat:      gps.latitude,
            lng:      gps.longitude,
            heading:  gps.headingDegrees || 0,
            speed:    Math.round(gps.speedMilesPerHour || 0),
            location: (gps.reverseGeo || {}).formattedLocation || '',
            time:     gps.time || null,
          } : null,
          matchedTrailerId: null,
        };
      });

      // Match Samsara vehicles to our trucks by VIN; update trucks with samsara link + location
      const [trucksSnap, trailersSnap] = await Promise.all([
        admin.firestore().collection('users').doc(uid).collection('trucks').get(),
        admin.firestore().collection('users').doc(uid).collection('trailers').get(),
      ]);
      const trucks = trucksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const ourTrailers = trailersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const batch = admin.firestore().batch();
      // Diagnostic: log extStats and how many vehicles have odometer data
      console.log('samsaraFleetSync diag: extStats count =', (extStatsData.data || []).length,
        '| vehicles with odometer =', vehicles.filter(v => v.odometer != null).length);
      if ((extStatsData.data || []).length > 0) {
        console.log('samsaraFleetSync diag: extStats[0] =', JSON.stringify(extStatsData.data[0]).slice(0, 300));
      }
      console.log('samsaraFleetSync diag: trucks in Firestore =', trucks.length,
        '| trucks with VIN =', trucks.filter(t => t.vin).length,
        '| trucks with samsaraId =', trucks.filter(t => t.samsaraId).length);

      let truckMatchCount = 0;
      for (const v of vehicles) {
        // Match by VIN (preferred) → samsaraId (already linked) → name≈unit (fallback)
        const normName = (v.name || '').trim().toLowerCase();
        const match = trucks.find(t =>
          (v.vin && t.vin && t.vin.toUpperCase() === v.vin) ||
          (t.samsaraId && t.samsaraId === v.id) ||
          (t.unit && normName && t.unit.trim().toLowerCase() === normName)
        );
        if (match) {
          truckMatchCount++;
          v.matchedTruckId = match.id;
          const truckRef = admin.firestore().collection('users').doc(uid).collection('trucks').doc(match.id);
          const updateData = { samsaraId: v.id };
          if (v.gps)               updateData.samsaraLocation    = v.gps;
          if (v.odometer    != null) updateData.samsaraOdometer    = v.odometer;
          if (v.engineHours != null) updateData.samsaraEngineHours = v.engineHours;
          if (v.fuelLevel   != null) updateData.samsaraFuelLevel   = v.fuelLevel;
          if (v.faults.length)       updateData.samsaraFaults       = v.faults;
          if (v.safetyEvents.length) updateData.samsaraSafetyEvents = v.safetyEvents;
          batch.update(truckRef, updateData);
        }
      }
      console.log('samsaraFleetSync diag: matched', truckMatchCount, 'of', vehicles.length, 'Samsara vehicles to Firestore trucks');
      for (const t of trailers) {
        // Match by VIN → samsaraId → name≈trailer name
        const normName = (t.name || '').trim().toLowerCase();
        const match = ourTrailers.find(r =>
          (t.vin && r.vin && r.vin.toUpperCase() === t.vin) ||
          (r.samsaraId && r.samsaraId === t.id) ||
          (r.unit && normName && r.unit.trim().toLowerCase() === normName)
        );
        if (match) {
          t.matchedTrailerId = match.id;
          const trailerRef = admin.firestore().collection('users').doc(uid).collection('trailers').doc(match.id);
          const updateData = { samsaraId: t.id };
          if (t.gps) updateData.samsaraLocation = t.gps;
          batch.update(trailerRef, updateData);
        }
      }
      await batch.commit();

      // Merge vehicles + trailers into one array for the map cache
      const allUnits = [...vehicles, ...trailers];

      // Cache fleet data (separate subcollection doc to avoid bloating user doc)
      await admin.firestore().collection('users').doc(uid).collection('samsara_cache').doc('fleet').set({
        vehicles: allUnits,
        syncedAt: Date.now(),
      });

      // Delete request doc → signals success to client listener
      await snap.ref.delete();
      console.log(`samsaraFleetSync: synced ${vehicles.length} trucks + ${trailers.length} trailers for uid=${uid}`);

    } catch (err) {
      console.error('samsaraFleetSync error:', err);
      await snap.ref.update({ status: 'error', error: 'internal' });
    }
  });

/**
 * Callable: Incremental Samsara sync.
 * Writes normalized entities into Firestore subcollections and tracks cursors.
 *
 * Data contract:
 * - data.resources?: ['vehicles' | 'drivers' | 'trailers']
 * - data.fullResync?: boolean
 */
exports.samsaraIncrementalSync = functions
  .runWith({ secrets: ['SAMSARA_CLIENT_ID', 'SAMSARA_CLIENT_SECRET'], memory: '512MB', timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }

    const allowedResources = new Set(['vehicles', 'drivers', 'trailers']);
    const resources = Array.isArray(data?.resources)
      ? data.resources.filter((r) => allowedResources.has(r))
      : undefined;

    const result = await runSamsaraIncrementalSync(context.auth.uid, {
      resources,
      fullResync: Boolean(data?.fullResync),
    });

    return { success: true, result };
  });

/**
 * Callable: Normalize and upsert a batch of Samsara records for any supported entity model.
 *
 * Data contract:
 * - data.entity: one of Object.keys(SAMSARA_ENTITY_MODELS)
 * - data.records: array of raw Samsara payload records
 */
exports.samsaraUpsertNormalizedBatch = functions
  .runWith({ memory: '512MB', timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }

    const entity = String(data?.entity || '').trim();
    const records = Array.isArray(data?.records) ? data.records : [];

    if (!entity || !SAMSARA_ENTITY_MODELS[entity]) {
      throw new functions.https.HttpsError('invalid-argument', 'Unsupported entity model key.');
    }
    if (!records.length) {
      throw new functions.https.HttpsError('invalid-argument', 'records array is required.');
    }

    const normalizer = SAMSARA_NORMALIZERS[entity];
    if (!normalizer) {
      throw new functions.https.HttpsError('failed-precondition', 'No normalizer registered for entity.');
    }

    const normalized = records
      .map((raw) => {
        const base = normalizer(raw);
        if (!base) return null;
        return { ...base, raw };
      })
      .filter(Boolean);

    const runMeta = {
      runId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    const collectionName = SAMSARA_ENTITY_MODELS[entity].collection;
    const write = await upsertNormalizedEntities(context.auth.uid, collectionName, normalized, runMeta);

    const stateRef = admin.firestore().collection('users').doc(context.auth.uid).collection('integration_sync').doc('samsara');
    await stateRef.set({
      provider: 'samsara',
      lastRunId: runMeta.runId,
      lastManualEntity: entity,
      lastManualUpsertCount: write.upserted,
      lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSyncedAtIso: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      success: true,
      entity,
      collection: collectionName,
      upserted: write.upserted,
    };
  });

/**
 * Scheduled: periodic incremental sync for all connected Samsara users.
 */
exports.samsaraIncrementalSyncScheduled = functions
  .runWith({ secrets: ['SAMSARA_CLIENT_ID', 'SAMSARA_CLIENT_SECRET'], memory: '1GB', timeoutSeconds: 540 })
  .pubsub.schedule('every 30 minutes')
  .onRun(async () => {
    const usersSnap = await admin.firestore().collection('users').get();
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data() || {};
      if (!data.samsara || !data.samsara.accessToken) {
        skipped += 1;
        continue;
      }

      try {
        await runSamsaraIncrementalSync(userDoc.id, {
          resources: ['vehicles', 'drivers', 'trailers'],
          fullResync: false,
        });
        processed += 1;
      } catch (err) {
        failed += 1;
        console.error('samsaraIncrementalSyncScheduled user sync failed:', userDoc.id, err.message || err);
      }
    }

    console.log('samsaraIncrementalSyncScheduled summary:', { processed, skipped, failed });
    return null;
  });

/**
 * Callable: Download a file from Storage by path.
 * Returns { base64, contentType } for the requested file.
 * Validates the caller owns the file (path must start with users/{uid}/).
 */
exports.downloadFile = functions
  .runWith({ memory: '512MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const storagePath = data.storagePath;
    if (!storagePath || typeof storagePath !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'storagePath is required.');
    }
    // Verify the file belongs to the caller
    if (!storagePath.startsWith('users/' + context.auth.uid + '/')) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied.');
    }
    try {
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      const [contents] = await file.download();
      const [metadata] = await file.getMetadata();
      return {
        base64: contents.toString('base64'),
        contentType: metadata.contentType || 'application/octet-stream',
      };
    } catch (err) {
      console.error('downloadFile error:', err);
      throw new functions.https.HttpsError('not-found', 'File not found or inaccessible.');
    }
  });
