'use strict';
/**
 * IFTA Wizard – FMCSA Lookup Cloud Functions (Gen 1)
 *
 * Gen 1 functions are publicly accessible by default — no Cloud Run IAM.
 * Uses firebase-functions v4 with runWith() for Gen 1 deployment.
 *
 * Before deploying, set the API key secret:
 *   firebase functions:secrets:set FMCSA_API_KEY
 */

const functions = require('firebase-functions');

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
  .runWith({ secrets: ['FMCSA_API_KEY'], memory: '256MB', timeoutSeconds: 15 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in to use this feature.');
    }

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

exports.carrierLookup = functions
  .runWith({ secrets: ['FMCSA_API_KEY'], memory: '256MB', timeoutSeconds: 20 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in to use this feature.');
    }

    const dot = String(data.dot || '').replace(/\D/g, '').trim();
    if (!dot) throw new functions.https.HttpsError('invalid-argument', 'Missing required parameter: dot');
    if (dot.length < 1 || dot.length > 9) throw new functions.https.HttpsError('invalid-argument', 'DOT number must be between 1 and 9 digits');

    try {
      const apiKey = process.env.FMCSA_API_KEY;
      const url = `${FMCSA_BASE_URL}/carriers/${encodeURIComponent(dot)}?webKey=${encodeURIComponent(apiKey)}`;

      const upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });

      if (upstream.status === 404) throw new functions.https.HttpsError('not-found', `No carrier found for DOT number ${dot}`);
      if (!upstream.ok) throw new functions.https.HttpsError('unavailable', 'Upstream FMCSA API error. Try again later.');

      const body = await upstream.json();
      const carrier = body?.content?.carrier;
      if (!carrier) throw new functions.https.HttpsError('not-found', `No carrier data returned for DOT number ${dot}`);

      return { success: true, data: normaliseCarrierFull(carrier) };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new functions.https.HttpsError('deadline-exceeded', 'FMCSA API request timed out. Try again.');
      }
      console.error('carrierLookup unexpected error:', err);
      throw new functions.https.HttpsError('internal', 'Internal server error');
    }
  });
