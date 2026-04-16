'use strict';

/**
 * IFTA Wizard – MC Number Lookup Cloud Function
 *
 * Endpoint: GET /mcLookup?mc=<number>
 *
 * Data source: FMCSA QCMobile REST API
 *   https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/{mc}?webKey={key}
 *
 * Before deploying, set the API key secret:
 *   firebase functions:secrets:set FMCSA_API_KEY
 *   (Request a free key at https://mobile.fmcsa.dot.gov/developer/apidoc.page)
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const FMCSA_API_KEY = defineSecret('FMCSA_API_KEY');
const FMCSA_BASE_URL = 'https://mobile.fmcsa.dot.gov/qc/services';

// Restrict which origins may call this function
const ALLOWED_ORIGINS = [
  'https://www.logistixnerd.com',
  'https://logistixnerd.com',
  'https://ifta-wizard-a9061.web.app',
  'https://ifta-wizard-a9061.firebaseapp.com',
];

/**
 * Sets CORS headers for allowed origins.
 * Returns true if the origin is allowed, false otherwise.
 */
function handleCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin)
    // Also allow localhost for local development / emulator
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }

  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '600');
  return allowed;
}

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

exports.mcLookup = onRequest(
  {
    secrets: [FMCSA_API_KEY],
    // No built-in cors: true — we handle allowed-origin logic ourselves
    cors: false,
    // Keep cold-start fast; this is a lightweight proxy
    memory: '256MiB',
    timeoutSeconds: 15,
    region: 'us-central1',
  },
  async (req, res) => {
    // ── CORS pre-flight ──────────────────────────────────
    handleCors(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // ── Method guard ─────────────────────────────────────
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    // ── Input validation ─────────────────────────────────
    // Strip any non-digit characters so callers can pass "MC-123456" or "123456"
    const mc = String(req.query.mc || '').replace(/\D/g, '').trim();

    if (!mc) {
      res.status(400).json({
        success: false,
        error: 'Missing required query parameter: mc',
      });
      return;
    }

    if (mc.length < 3 || mc.length > 8) {
      res.status(400).json({
        success: false,
        error: 'MC number must be between 3 and 8 digits',
      });
      return;
    }

    // ── FMCSA API request ────────────────────────────────
    try {
      const apiKey = FMCSA_API_KEY.value();
      const url =
        `${FMCSA_BASE_URL}/carriers/docket-number/${encodeURIComponent(mc)}` +
        `?webKey=${encodeURIComponent(apiKey)}`;

      const upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000), // 10 s hard timeout
      });

      if (upstream.status === 404) {
        res.status(404).json({
          success: false,
          error: `No carrier found for MC number ${mc}`,
        });
        return;
      }

      if (!upstream.ok) {
        console.error(`FMCSA API error: ${upstream.status} ${upstream.statusText}`);
        res.status(502).json({
          success: false,
          error: 'Upstream FMCSA API returned an error. Try again later.',
        });
        return;
      }

      const body = await upstream.json();

      // FMCSA wraps the result: { content: { carrier: { ... } } }
      const carrier = body?.content?.carrier;

      if (!carrier) {
        res.status(404).json({
          success: false,
          error: `No carrier data returned for MC number ${mc}`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: normaliseCarrier(carrier, mc),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        console.error('FMCSA request timed out');
        res.status(504).json({
          success: false,
          error: 'FMCSA API request timed out. Try again.',
        });
        return;
      }
      console.error('mcLookup unexpected error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);
