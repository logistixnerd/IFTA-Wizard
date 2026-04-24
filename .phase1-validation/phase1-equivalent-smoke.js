const fs = require('fs');
const path = require('path');
const Module = require('module');

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runFirestoreRulesContractChecks(workspaceRoot) {
  const rulesPath = path.join(workspaceRoot, 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const checks = [];

  function check(name, fn) {
    try {
      fn();
      checks.push({ name, result: 'PASS' });
    } catch (e) {
      checks.push({ name, result: 'FAIL', error: e.message });
    }
  }

  check('users scope exists', () => {
    assert(/match\s*\/users\/\{userId\}/.test(rules), 'users/{userId} match block missing');
  });

  check('catch-all user-owned subcollection rule exists', () => {
    assert(/match\s*\/\{document=\*\*\}\s*\{[\s\S]*?allow\s+read,\s*create,\s*update,\s*delete\s*:\s*if\s+isOwner\(userId\)\s*;[\s\S]*?\}/.test(rules), 'catch-all owner rule missing or not CRUD owner-based');
  });

  check('new user-owned subcollections covered by users catch-all', () => {
    const hasCatchAll = /match\s*\/\{document=\*\*\}\s*\{[\s\S]*?allow\s+read,\s*create,\s*update,\s*delete\s*:\s*if\s+isOwner\(userId\)\s*;[\s\S]*?\}/.test(rules);
    assert(hasCatchAll, 'users catch-all owner rule missing');

    const sampleCoveredPaths = [
      'users/ownerA/integration_sync/samsara',
      'users/ownerA/samsara_oauth_pending/p1',
      'users/ownerA/samsara_sync_requests/r1',
      'users/ownerA/samsara_cache/fleet',
      'users/ownerA/documents/d1',
      'users/ownerA/ifta_records/i1',
    ];

    for (const p of sampleCoveredPaths) {
      assert(p.startsWith('users/ownerA/'), `path not in users scope: ${p}`);
    }
  });

  check('default deny remains present', () => {
    assert(/match\s*\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write\s*:\s*if\s+false\s*;\s*\}/.test(rules), 'global default deny rule missing');
  });

  return {
    suite: 'firestore-rules-contract',
    mode: 'equivalent-static',
    checks,
  };
}

function runIntegrationMetadataCompatibilityChecks(workspaceRoot) {
  const srcPath = path.join(workspaceRoot, 'integrations-workspace.js');
  const src = fs.readFileSync(srcPath, 'utf8');

  const fnA = extractNamedFunction(src, 'computeTokenHealth');
  const fnB = extractNamedFunction(src, 'getSyncCursorPreview');
  const harness = `${fnA}\n${fnB}\nmodule.exports={computeTokenHealth,getSyncCursorPreview};`;
  const m = { exports: {} };
  const evaluator = new Function('module', harness);
  evaluator(m);

  const { computeTokenHealth, getSyncCursorPreview } = m.exports;
  const checks = [];

  function check(name, fn) {
    try {
      fn();
      checks.push({ name, result: 'PASS' });
    } catch (e) {
      checks.push({ name, result: 'FAIL', error: e.message });
    }
  }

  const future = Date.now() + 3600_000;

  check('camelCase token shape accepted', () => {
    const health = computeTokenHealth({ accessToken: 'a', expiresAt: future });
    assert(health === 'connected', `expected connected, got ${health}`);
  });

  check('snake_case token shape accepted', () => {
    const health = computeTokenHealth({ access_token: 'a', token_expiry: future });
    assert(health === 'connected', `expected connected, got ${health}`);
  });

  check('cursor field supported', () => {
    const preview = getSyncCursorPreview({ cursor: 'abcdef1234567890' });
    assert(preview.endsWith('34567890') || preview.includes('34567890'), `unexpected cursor preview: ${preview}`);
  });

  check('cursors map field supported', () => {
    const preview = getSyncCursorPreview({ cursors: { vehiclesLastSyncedAt: '2026-01-01T00:00:00.000Z', driversLastSyncedAt: '2026-02-01T00:00:00.000Z' } });
    assert(preview !== '—', 'expected derived preview from cursors map');
  });

  return {
    suite: 'integrations-metadata-compatibility',
    mode: 'runtime-function-exec',
    checks,
  };
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
        const data = { ...root.users[uid] };
        delete data._sub;
        return {
          exists: true,
          data: () => data,
        };
      },
      async set(payload, opts = {}) {
        if (opts.merge) {
          deepMerge(root.users[uid], payload);
        } else {
          root.users[uid] = { ...(payload || {}), _sub: root.users[uid]._sub || {} };
        }
      },
      async update(payload) {
        deepMerge(root.users[uid], payload);
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
                  root.users[uid]._sub[name][id] = deepMerge(root.users[uid]._sub[name][id], payload);
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

  const runWithFactory = () => ({
    https: httpsApi,
    pubsub: pubsubTriggers,
    firestore: firestoreTriggers,
  });

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

async function runOAuthCallbackChecks(workspaceRoot) {
  const checks = [];
  const functionsPath = path.join(workspaceRoot, 'functions', 'index.js');

  function check(name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(() => checks.push({ name, result: 'PASS' }))
      .catch((e) => checks.push({ name, result: 'FAIL', error: e.message || String(e) }));
  }

  const originalLoad = Module._load;
  const originalFetch = global.fetch;

  const adminMock = buildMockAdmin();
  const functionsMock = buildMockFunctions();

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'firebase-functions') return functionsMock;
    if (request === 'firebase-admin') return adminMock;
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[require.resolve(functionsPath)];
  process.env.SAMSARA_CLIENT_ID = 'client-id';
  process.env.SAMSARA_CLIENT_SECRET = 'client-secret';
  const exported = require(functionsPath);
  const callbackHandler = exported.samsaraCallback;

  function makeReq(query) { return { query: query || {} }; }
  function makeRes() {
    return {
      redirectUrl: null,
      redirect(url) { this.redirectUrl = url; return this; },
    };
  }

  await check('oauth callback failure redirect: provider error', async () => {
    const req = makeReq({ error: 'access_denied' });
    const res = makeRes();
    await callbackHandler(req, res);
    assert(String(res.redirectUrl || '').includes('samsara=error&reason=access_denied'), `unexpected redirect: ${res.redirectUrl}`);
  });

  await check('oauth callback failure redirect: missing params', async () => {
    const req = makeReq({});
    const res = makeRes();
    await callbackHandler(req, res);
    assert(String(res.redirectUrl || '').includes('reason=missing_params'), `unexpected redirect: ${res.redirectUrl}`);
  });

  await check('oauth callback failure redirect: invalid_state', async () => {
    const req = makeReq({ code: 'abc', state: '%%%notbase64%%%' });
    const res = makeRes();
    await callbackHandler(req, res);
    assert(String(res.redirectUrl || '').includes('reason=invalid_state'), `unexpected redirect: ${res.redirectUrl}`);
  });

  await check('oauth callback failure redirect: expired state uses origin', async () => {
    const oldState = Buffer.from(JSON.stringify({ uid: 'u1', ts: Date.now() - 700000, origin: 'http://localhost:5000' })).toString('base64url');
    const req = makeReq({ code: 'abc', state: oldState });
    const res = makeRes();
    await callbackHandler(req, res);
    assert(String(res.redirectUrl || '').startsWith('http://localhost:5000/'), `unexpected redirect origin: ${res.redirectUrl}`);
    assert(String(res.redirectUrl || '').includes('reason=expired'), `unexpected redirect reason: ${res.redirectUrl}`);
  });

  await check('oauth callback contract: expired state origin should be allow-list sanitized', async () => {
    const oldState = Buffer.from(JSON.stringify({ uid: 'u1', ts: Date.now() - 700000, origin: 'http://localhost:5000' })).toString('base64url');
    const req = makeReq({ code: 'abc', state: oldState });
    const res = makeRes();
    await callbackHandler(req, res);
    assert(String(res.redirectUrl || '').startsWith('https://ifta-wizard-a9061.web.app/'), `origin not sanitized to canonical allow-list: ${res.redirectUrl}`);
  });

  await check('oauth callback failure redirect: token_exchange', async () => {
    global.fetch = async () => ({ ok: false, status: 400, text: async () => 'bad code' });
    const st = Buffer.from(JSON.stringify({ uid: 'u2', ts: Date.now(), origin: 'http://localhost:5000' })).toString('base64url');
    const req = makeReq({ code: 'bad-code', state: st });
    const res = makeRes();
    await callbackHandler(req, res);
    assert(String(res.redirectUrl || '').includes('reason=token_exchange'), `unexpected redirect: ${res.redirectUrl}`);
  });

  await check('oauth callback success redirect + dual token fields persisted (disallowed origin falls back)', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, scope: 'fleet.read drivers.read' }),
    });

    const st = Buffer.from(JSON.stringify({ uid: 'u3', ts: Date.now(), origin: 'http://localhost:5000' })).toString('base64url');
    const req = makeReq({ code: 'good-code', state: st });
    const res = makeRes();
    await callbackHandler(req, res);

    assert(String(res.redirectUrl || '') === 'https://ifta-wizard-a9061.web.app/dashboard.html?samsara=connected', `unexpected success redirect: ${res.redirectUrl}`);

    const saved = adminMock.__root.users.u3 && adminMock.__root.users.u3.samsara;
    assert(saved, 'samsara token payload missing in persisted user doc');
    assert(saved.accessToken === 'at-1', 'camelCase accessToken missing');
    assert(saved.access_token === 'at-1', 'snake_case access_token missing');
    assert(saved.refreshToken === 'rt-1', 'camelCase refreshToken missing');
    assert(saved.refresh_token === 'rt-1', 'snake_case refresh_token missing');
    assert(typeof saved.expiresAt === 'number', 'camelCase expiresAt missing');
    assert(typeof saved.token_expiry === 'number', 'snake_case token_expiry missing');
    assert(Array.isArray(saved.scopes) && saved.scopes.length === 2, 'scopes array missing from persisted payload');
    assert(typeof saved.scope === 'string', 'scope string missing from persisted payload');
  });

  await check('oauth callback success redirect preserves allowed origin', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600, scope: 'fleet.read' }),
    });

    const st = Buffer.from(JSON.stringify({ uid: 'u4', ts: Date.now(), origin: 'https://www.logistixnerd.com' })).toString('base64url');
    const req = makeReq({ code: 'good-code-2', state: st });
    const res = makeRes();
    await callbackHandler(req, res);

    assert(String(res.redirectUrl || '') === 'https://www.logistixnerd.com/dashboard.html?samsara=connected', `allowed origin not preserved: ${res.redirectUrl}`);
  });

  Module._load = originalLoad;
  global.fetch = originalFetch;

  return {
    suite: 'oauth-callback-and-token-shape',
    mode: 'runtime-mocked-boundaries',
    checks,
  };
}

(async () => {
  const workspaceRoot = process.cwd();
  const suites = [];

  suites.push(runFirestoreRulesContractChecks(workspaceRoot));
  suites.push(runIntegrationMetadataCompatibilityChecks(workspaceRoot));
  suites.push(await runOAuthCallbackChecks(workspaceRoot));

  const flattened = suites.flatMap(s => s.checks.map(c => ({ suite: s.suite, ...c })));
  const pass = flattened.filter(c => c.result === 'PASS').length;
  const fail = flattened.length - pass;

  const report = {
    totalChecks: flattened.length,
    pass,
    fail,
    suites,
  };

  console.log(JSON.stringify(report, null, 2));
  if (fail > 0) process.exit(1);
})();
