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
// HOSTING_ORIGIN is no longer hardcoded — derived from the request or passed by the client.
// Allowed redirect origins (must also be registered in Samsara developer portal).
const ALLOWED_ORIGINS = new Set([
  'https://ifta-wizard-a9061.web.app',
  'https://www.logistixnerd.com',
  'https://ifta-wizard-a9061.firebaseapp.com',
]);
const CANONICAL_ORIGIN = 'https://ifta-wizard-a9061.web.app';

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
        return res.redirect((parsed.origin || 'https://www.logistixnerd.com') + '/dashboard.html?samsara=error&reason=expired');
      }

      // Recover the origin that was used when the OAuth flow started.
      const callbackOrigin = parsed.origin && ALLOWED_ORIGINS.has(parsed.origin)
        ? parsed.origin
        : CANONICAL_ORIGIN;

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
        }
      }, { merge: true });

      return res.redirect(callbackOrigin + '/dashboard.html?samsara=connected');
    } catch (err) {
      console.error('samsaraCallback unexpected error:', err);
      return res.redirect((callbackOrigin || 'https://www.logistixnerd.com') + '/dashboard.html?samsara=error&reason=internal');
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
    const clientId = process.env.SAMSARA_CLIENT_ID;
    const clientSecret = process.env.SAMSARA_CLIENT_SECRET;

    try {
      const tokenRes = await fetch(SAMSARA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
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
