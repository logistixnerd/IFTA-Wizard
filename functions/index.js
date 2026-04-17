'use strict';
/**
 * IFTA Wizard – FMCSA Lookup Cloud Functions
 *
 * Uses onRequest + Firebase Hosting rewrites so the browser calls
 * /api/mclookup and /api/carrierlookup on the SAME origin.
 * No CORS preflight, no Cloud Run IAM issue.
 *
 * Before deploying, set the API key secret:
 *   firebase functions:secrets:set FMCSA_API_KEY
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();

const FMCSA_API_KEY = defineSecret('FMCSA_API_KEY');
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

/**
 * Verify Firebase Auth token from Authorization header.
 * Returns decoded token or sends 401 and returns null.
 */
async function verifyAuth(req, res) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (e) {
    res.status(401).json({ error: 'Invalid auth token' });
    return null;
  }
}

exports.mcLookup = onRequest(
  { secrets: [FMCSA_API_KEY], memory: '256MiB', timeoutSeconds: 15, region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const user = await verifyAuth(req, res);
    if (!user) return;

    const mc = String(req.body?.mc || '').replace(/\D/g, '').trim();
    if (!mc) { res.status(400).json({ error: 'Missing required parameter: mc' }); return; }
    if (mc.length < 3 || mc.length > 8) { res.status(400).json({ error: 'MC number must be between 3 and 8 digits' }); return; }

    try {
      const apiKey = FMCSA_API_KEY.value();
      const url = `${FMCSA_BASE_URL}/carriers/docket-number/${encodeURIComponent(mc)}?webKey=${encodeURIComponent(apiKey)}`;

      const upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (upstream.status === 404) { res.status(404).json({ error: `No carrier found for MC number ${mc}` }); return; }
      if (!upstream.ok) { res.status(502).json({ error: 'Upstream FMCSA API error. Try again later.' }); return; }

      const body = await upstream.json();
      const carrier = body?.content?.carrier;
      if (!carrier) { res.status(404).json({ error: `No carrier data returned for MC number ${mc}` }); return; }

      res.json({ success: true, data: normaliseCarrier(carrier, mc) });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        res.status(504).json({ error: 'FMCSA API request timed out. Try again.' });
        return;
      }
      console.error('mcLookup unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

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

exports.carrierLookup = onRequest(
  { secrets: [FMCSA_API_KEY], memory: '256MiB', timeoutSeconds: 20, region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const user = await verifyAuth(req, res);
    if (!user) return;

    const dot = String(req.body?.dot || '').replace(/\D/g, '').trim();
    if (!dot) { res.status(400).json({ error: 'Missing required parameter: dot' }); return; }
    if (dot.length < 1 || dot.length > 9) { res.status(400).json({ error: 'DOT number must be between 1 and 9 digits' }); return; }

    try {
      const apiKey = FMCSA_API_KEY.value();
      const url = `${FMCSA_BASE_URL}/carriers/${encodeURIComponent(dot)}?webKey=${encodeURIComponent(apiKey)}`;

      const upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });

      if (upstream.status === 404) { res.status(404).json({ error: `No carrier found for DOT number ${dot}` }); return; }
      if (!upstream.ok) { res.status(502).json({ error: 'Upstream FMCSA API error. Try again later.' }); return; }

      const body = await upstream.json();
      const carrier = body?.content?.carrier;
      if (!carrier) { res.status(404).json({ error: `No carrier data returned for DOT number ${dot}` }); return; }

      res.json({ success: true, data: normaliseCarrierFull(carrier) });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        res.status(504).json({ error: 'FMCSA API request timed out. Try again.' });
        return;
      }
      console.error('carrierLookup unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);
