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
        fetch('https://api.samsara.com/fleet/vehicles/stats?types=odometerMeters,engineSeconds,fuelPercents&limit=512', { headers: bearerHeaders, signal: AbortSignal.timeout(20000) }),
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
      const extStatsText    = extStatsRes.ok ? await extStatsRes.text() : '{"data":[]}';
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
          odometerMeters: v.odometerMeters?.value ?? null,
          engineSeconds:  v.engineSeconds?.value  ?? null,
          fuelPercent:    v.fuelPercents?.value   ?? null,
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
        const engineHours   = ext.engineSeconds  != null ? Math.round(ext.engineSeconds / 3600 * 10) / 10 : null;
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
      for (const v of vehicles) {
        if (!v.vin) continue;
        const match = trucks.find(t => t.vin && t.vin.toUpperCase() === v.vin);
        if (match) {
          v.matchedTruckId = match.id;
          const truckRef = admin.firestore().collection('users').doc(uid).collection('trucks').doc(match.id);
          const updateData = { samsaraId: v.id };
          if (v.gps)         updateData.samsaraLocation    = v.gps;
          if (v.odometer)    updateData.samsaraOdometer    = v.odometer;
          if (v.engineHours) updateData.samsaraEngineHours = v.engineHours;
          if (v.fuelLevel != null) updateData.samsaraFuelLevel = v.fuelLevel;
          if (v.faults.length)       updateData.samsaraFaults       = v.faults;
          if (v.safetyEvents.length) updateData.samsaraSafetyEvents = v.safetyEvents;
          batch.update(truckRef, updateData);
        }
      }
      for (const t of trailers) {
        if (!t.vin) continue;
        const match = ourTrailers.find(r => r.vin && r.vin.toUpperCase() === t.vin);
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
