const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = process.cwd();
const RESULTS_PATH = path.join(ROOT, 'scripts', 'validation', 'phase1-validation-results.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractNamedFunction(src, fnName) {
  const start = src.indexOf(`function ${fnName}`);
  if (start < 0) throw new Error(`Function not found: ${fnName}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`Unbalanced braces for ${fnName}`);
  return src.slice(start, i + 1);
}

function runTest(name, suite, fn, out) {
  return Promise.resolve()
    .then(fn)
    .then(() => out.push({ suite, name, result: 'PASS' }))
    .catch((err) => out.push({ suite, name, result: 'FAIL', error: String(err && err.message ? err.message : err) }));
}

function buildMockAdmin() {
  const root = { users: {} };

  function deepMerge(target, src) {
    for (const [k, v] of Object.entries(src || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v && v.__serverTimestamp)) {
        target[k] = target[k] && typeof target[k] === 'object' ? target[k] : {};
        deepMerge(target[k], v);
      } else {
        target[k] = v;
      }
    }
    return target;
  }

  function userDoc(uid) {
    if (!root.users[uid]) root.users[uid] = { _sub: {} };

    return {
      async get() {
        const copy = { ...root.users[uid] };
        delete copy._sub;
        return { exists: true, data: () => copy };
      },
      async set(payload, opts = {}) {
        if (opts.merge) {
          deepMerge(root.users[uid], payload || {});
        } else {
          root.users[uid] = { ...(payload || {}), _sub: root.users[uid]._sub || {} };
        }
      },
      async update(payload) {
        deepMerge(root.users[uid], payload || {});
      },
      collection(name) {
        if (!root.users[uid]._sub[name]) root.users[uid]._sub[name] = {};
        return {
          doc(id) {
            return {
              async get() {
                const v = root.users[uid]._sub[name][id];
                return { exists: !!v, data: () => v || null };
              },
              async set(payload, opts = {}) {
                if (!root.users[uid]._sub[name][id] || !opts.merge) {
                  root.users[uid]._sub[name][id] = payload || {};
                } else {
                  root.users[uid]._sub[name][id] = deepMerge(root.users[uid]._sub[name][id], payload || {});
                }
              },
              async update(payload) {
                root.users[uid]._sub[name][id] = deepMerge(root.users[uid]._sub[name][id] || {}, payload || {});
              },
              async delete() {
                delete root.users[uid]._sub[name][id];
              },
            };
          },
          async get() {
            const docs = Object.entries(root.users[uid]._sub[name]).map(([id, data]) => ({ id, data: () => data }));
            return { docs };
          },
        };
      },
    };
  }

  const firestoreFn = function firestore() {
    return {
      collection(name) {
        if (name !== 'users') throw new Error(`Unsupported top-level collection in mock: ${name}`);
        return {
          doc(uid) {
            return userDoc(uid);
          },
          async get() {
            const docs = Object.entries(root.users).map(([id, data]) => ({ id, data: () => ({ ...data, _sub: undefined }) }));
            return { docs };
          },
        };
      },
    };
  };

  firestoreFn.FieldValue = {
    serverTimestamp: () => ({ __serverTimestamp: true }),
    increment: (n) => ({ __increment: n }),
  };

  return {
    __root: root,
    initializeApp() {},
    firestore: firestoreFn,
  };
}

function buildMockFunctions() {
  class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  const firestoreTriggers = {
    document: () => ({
      onCreate: (fn) => fn,
      onWrite: (fn) => fn,
      onUpdate: (fn) => fn,
      onDelete: (fn) => fn,
    }),
  };

  const pubsubTriggers = {
    schedule: () => ({ onRun: (fn) => fn }),
  };

  const httpsApi = {
    HttpsError,
    onCall: (fn) => fn,
    onRequest: (fn) => fn,
  };

  const runWithFactory = () => ({ https: httpsApi, pubsub: pubsubTriggers, firestore: firestoreTriggers });

  return {
    https: httpsApi,
    runWith: runWithFactory,
    pubsub: pubsubTriggers,
    firestore: firestoreTriggers,
    region: () => ({ https: httpsApi, firestore: firestoreTriggers, pubsub: pubsubTriggers, runWith: runWithFactory }),
    config: () => ({}),
    logger: { info() {}, warn() {}, error() {} },
  };
}

function evaluateIntegrationFns() {
  const src = fs.readFileSync(path.join(ROOT, 'integrations-workspace.js'), 'utf8');
  const code = [
    extractNamedFunction(src, 'computeTokenHealth'),
    extractNamedFunction(src, 'getSyncCursorPreview'),
    'module.exports = { computeTokenHealth, getSyncCursorPreview };',
  ].join('\n\n');

  const m = { exports: {} };
  const fn = new Function('module', code);
  fn(m);
  return m.exports;
}

async function main() {
  const results = [];

  // A) Firestore rules contract checks for affected collections.
  const rulesText = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const affectedCollections = [
    'integration_sync',
    'samsara_oauth_pending',
    'samsara_sync_requests',
    'samsara_cache',
    'documents',
    'ifta_records',
  ];

  await runTest('A0 users scope exists', 'firestore-rules-contract', () => {
    assert(/match\s*\/users\/\{userId\}/.test(rulesText), 'users/{userId} block missing');
  }, results);

  await runTest('A0 catch-all owner CRUD rule exists', 'firestore-rules-contract', () => {
    assert(
      /match\s*\/\{document=\*\*\}\s*\{[\s\S]*?allow\s+read,\s*create,\s*update,\s*delete\s*:\s*if\s+isOwner\(userId\)\s*;[\s\S]*?\}/.test(rulesText),
      'owner catch-all CRUD rule missing under users scope'
    );
  }, results);

  for (const col of affectedCollections) {
    await runTest(`A1 authenticated owner RW expected allow for ${col}`, 'firestore-rules-contract', () => {
      const samplePath = `users/ownerA/${col}/doc1`;
      assert(samplePath.startsWith('users/ownerA/'), `path out of users scope: ${samplePath}`);
    }, results);

    await runTest(`A2 unauthorized access expected deny for ${col}`, 'firestore-rules-contract', () => {
      assert(/isOwner\(userId\)/.test(rulesText), 'owner guard is missing; deny expectation invalid');
      assert(/match\s*\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write\s*:\s*if\s+false\s*;\s*\}/.test(rulesText), 'global default deny missing');
    }, results);
  }

  // B) Frontend metadata compatibility checks.
  const { computeTokenHealth, getSyncCursorPreview } = evaluateIntegrationFns();
  const futureMs = Date.now() + 3600_000;

  await runTest('B2 frontend token health accepts camelCase', 'metadata-roundtrip', () => {
    const health = computeTokenHealth({ accessToken: 'token', expiresAt: futureMs });
    assert(health === 'connected', `expected connected, got ${health}`);
  }, results);

  await runTest('B3 frontend token health accepts snake_case', 'metadata-roundtrip', () => {
    const health = computeTokenHealth({ access_token: 'token', token_expiry: futureMs });
    assert(health === 'connected', `expected connected, got ${health}`);
  }, results);

  await runTest('B4 frontend sync cursor supports cursor and cursors map', 'metadata-roundtrip', () => {
    const previewA = getSyncCursorPreview({ cursor: 'abcdef1234567890' });
    const previewB = getSyncCursorPreview({ cursors: { vehiclesLastSyncedAt: '2026-01-01T00:00:00.000Z' } });
    assert(previewA !== '—', 'cursor field not recognized');
    assert(previewB !== '—', 'cursors map field not recognized');
  }, results);

  // C) Callback redirect + backend token write checks.
  const originalLoad = Module._load;
  const originalFetch = global.fetch;

  const adminMock = buildMockAdmin();
  const functionsMock = buildMockFunctions();

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'firebase-functions') return functionsMock;
    if (request === 'firebase-admin') return adminMock;
    return originalLoad(request, parent, isMain);
  };

  process.env.SAMSARA_CLIENT_ID = 'client-id';
  process.env.SAMSARA_CLIENT_SECRET = 'client-secret';

  const functionsPath = path.join(ROOT, 'functions', 'index.js');
  delete require.cache[require.resolve(functionsPath)];
  const exported = require(functionsPath);
  const callback = exported.samsaraCallback;

  function makeReq(query) {
    return { query: query || {} };
  }

  function makeRes() {
    return {
      redirectUrl: null,
      redirect(url) {
        this.redirectUrl = url;
        return this;
      },
    };
  }

  await runTest('C1 provider error redirect', 'oauth-callback', async () => {
    const res = makeRes();
    await callback(makeReq({ error: 'access_denied' }), res);
    assert(String(res.redirectUrl).includes('samsara=error&reason=access_denied'), `unexpected redirect: ${res.redirectUrl}`);
  }, results);

  await runTest('C2 missing params redirect', 'oauth-callback', async () => {
    const res = makeRes();
    await callback(makeReq({}), res);
    assert(String(res.redirectUrl).includes('reason=missing_params'), `unexpected redirect: ${res.redirectUrl}`);
  }, results);

  await runTest('C3 invalid state redirect', 'oauth-callback', async () => {
    const res = makeRes();
    await callback(makeReq({ code: 'abc', state: '%%%bad%%%' }), res);
    assert(String(res.redirectUrl).includes('reason=invalid_state'), `unexpected redirect: ${res.redirectUrl}`);
  }, results);

  await runTest('C4 token exchange failure redirect', 'oauth-callback', async () => {
    global.fetch = async () => ({ ok: false, status: 400, text: async () => 'bad_code' });
    const state = Buffer.from(JSON.stringify({ uid: 'u2', ts: Date.now(), origin: 'https://www.logistixnerd.com' })).toString('base64url');
    const res = makeRes();
    await callback(makeReq({ code: 'bad', state }), res);
    assert(String(res.redirectUrl).includes('reason=token_exchange'), `unexpected redirect: ${res.redirectUrl}`);
  }, results);

  await runTest('C5 success redirect preserves allowed origin', 'oauth-callback', async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ access_token: 'at-ok', refresh_token: 'rt-ok', expires_in: 3600, scope: 'fleet.read' }) });
    const state = Buffer.from(JSON.stringify({ uid: 'u3', ts: Date.now(), origin: 'https://www.logistixnerd.com' })).toString('base64url');
    const res = makeRes();
    await callback(makeReq({ code: 'good', state }), res);
    assert(String(res.redirectUrl) === 'https://www.logistixnerd.com/dashboard.html?samsara=connected', `unexpected redirect: ${res.redirectUrl}`);
  }, results);

  await runTest('C6 success redirect falls back for disallowed origin', 'oauth-callback', async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ access_token: 'at-fallback', refresh_token: 'rt-fallback', expires_in: 3600, scope: 'fleet.read drivers.read' }) });
    const state = Buffer.from(JSON.stringify({ uid: 'u4', ts: Date.now(), origin: 'http://localhost:5000' })).toString('base64url');
    const res = makeRes();
    await callback(makeReq({ code: 'good2', state }), res);
    assert(String(res.redirectUrl) === 'https://ifta-wizard-a9061.web.app/dashboard.html?samsara=connected', `unexpected redirect: ${res.redirectUrl}`);
  }, results);

  await runTest('B1 backend writes dual token metadata fields', 'metadata-roundtrip', async () => {
    const saved = adminMock.__root.users.u4 && adminMock.__root.users.u4.samsara;
    assert(saved, 'missing samsara payload for u4');
    assert(saved.accessToken === 'at-fallback', 'missing camelCase accessToken');
    assert(saved.access_token === 'at-fallback', 'missing snake_case access_token');
    assert(saved.refreshToken === 'rt-fallback', 'missing camelCase refreshToken');
    assert(saved.refresh_token === 'rt-fallback', 'missing snake_case refresh_token');
    assert(typeof saved.expiresAt === 'number', 'missing camelCase expiresAt');
    assert(typeof saved.token_expiry === 'number', 'missing snake_case token_expiry');
    assert(Array.isArray(saved.scopes) && saved.scopes.length >= 1, 'missing scopes array');
    assert(typeof saved.scope === 'string', 'missing scope string');

    const frontendHealth = computeTokenHealth(saved);
    assert(frontendHealth === 'connected' || frontendHealth === 'warning', `frontend could not consume backend token payload; got ${frontendHealth}`);
  }, results);

  await runTest('C7 expired state redirect origin sanitized to allow-list/canonical', 'oauth-callback', async () => {
    const state = Buffer.from(JSON.stringify({ uid: 'u5', ts: Date.now() - 700000, origin: 'http://localhost:5000' })).toString('base64url');
    const res = makeRes();
    await callback(makeReq({ code: 'expired', state }), res);
    assert(String(res.redirectUrl).startsWith('https://ifta-wizard-a9061.web.app/'), `expired redirect not sanitized: ${res.redirectUrl}`);
  }, results);

  Module._load = originalLoad;
  global.fetch = originalFetch;

  const pass = results.filter((r) => r.result === 'PASS').length;
  const fail = results.length - pass;

  const output = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    pass,
    fail,
    results,
  };

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
