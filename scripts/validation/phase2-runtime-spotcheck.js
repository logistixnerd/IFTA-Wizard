const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.cwd();
const ADMIN_JS = path.join(ROOT, 'admin.js');
const AUTH_JS = path.join(ROOT, 'auth-firebase.js');

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((v) => set.add(v)),
    remove: (...c) => c.forEach((v) => set.delete(v)),
    contains: (c) => set.has(c),
    toArray: () => Array.from(set),
  };
}

function makeElement() {
  return {
    classList: makeClassList(),
    style: {},
    textContent: '',
    value: '',
    innerHTML: '',
    addEventListener: () => {},
  };
}

function makeDocument() {
  const byId = new Map();
  return {
    _domReadyCallback: null,
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeElement());
      return byId.get(id);
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return makeElement();
    },
    addEventListener(event, cb) {
      if (event === 'DOMContentLoaded') this._domReadyCallback = cb;
    },
  };
}

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map.entries()),
  };
}

async function run() {
  const adminSource = fs.readFileSync(ADMIN_JS, 'utf8');
  const authSource = fs.readFileSync(AUTH_JS, 'utf8');

  const document = makeDocument();
  const localStorage = makeLocalStorage();

  const roleByUid = new Map();
  let authStateCallback = null;

  const firebase = {
    auth() {
      return {
        onAuthStateChanged(cb) {
          authStateCallback = cb;
        },
        signOut: async () => {},
      };
    },
    firestore: {
      FieldValue: {
        serverTimestamp: () => ({ __ts: true }),
      },
    },
  };

  const db = {
    collection(name) {
      if (name !== 'users') throw new Error('Unexpected top-level collection: ' + name);
      return {
        doc(uid) {
          return {
            async get() {
              const role = roleByUid.get(uid);
              if (!role) return { exists: false, data: () => ({}) };
              return { exists: true, data: () => ({ role }) };
            },
            async update() {},
          };
        },
      };
    },
  };

  const context = {
    console,
    window: { location: { href: '' } },
    document,
    localStorage,
    firebase,
    db,
    initializeFirebase: () => {},
    setTimeout,
    clearTimeout,
    alert: () => {},
    confirm: () => true,
  };

  vm.createContext(context);
  vm.runInContext(adminSource, context, { filename: 'admin.js' });

  const AdminPanel = vm.runInContext('typeof AdminPanel !== "undefined" ? AdminPanel : null', context);
  if (!AdminPanel) throw new Error('AdminPanel object not found after evaluating admin.js');

  let panelShown = 0;
  let deniedShown = 0;

  AdminPanel.showAdminPanel = function showAdminPanelMock() {
    panelShown += 1;
  };
  AdminPanel.showAccessDenied = function showAccessDeniedMock() {
    deniedShown += 1;
  };
  AdminPanel.setupEventListeners = function setupEventListenersMock() {};
  AdminPanel.loadDashboardData = async function loadDashboardDataMock() {};
  AdminPanel.loadUserProfileFromLocal = function loadUserProfileFromLocalMock() {};
  AdminPanel.initFirebaseIfAvailable = async function initFirebaseIfAvailableMock() {};

  await AdminPanel.init();
  if (!authStateCallback) throw new Error('Auth callback was not registered by AdminPanel.init()');

  async function invokeAuth(user, role, localAuthBlob) {
    panelShown = 0;
    deniedShown = 0;
    localStorage.clear();
    if (localAuthBlob) localStorage.setItem('ifta_user', JSON.stringify(localAuthBlob));
    if (user && role) roleByUid.set(user.uid, role);
    if (user && !role) roleByUid.delete(user.uid);

    await authStateCallback(user);

    return {
      panelShown,
      deniedShown,
      allowed: panelShown > 0 && deniedShown === 0,
      denied: deniedShown > 0 && panelShown === 0,
    };
  }

  const flows = [];

  // 1) non-admin user denied admin paths
  {
    const result = await invokeAuth(
      { uid: 'u_non_admin', email: 'driver@example.com', displayName: 'Driver User' },
      'user'
    );
    flows.push({
      flow: 'non-admin user denied admin paths',
      pass: result.denied,
      details: result,
    });
  }

  // 2) admin user allowed admin paths
  {
    const result = await invokeAuth(
      { uid: 'u_admin', email: 'admin@example.com', displayName: 'Admin User' },
      'admin'
    );
    flows.push({
      flow: 'admin user allowed admin paths',
      pass: result.allowed,
      details: result,
    });
  }

  // 3) role transition user -> admin reflected correctly
  {
    const user = { uid: 'u_transition_up', email: 'transition.up@example.com', displayName: 'Transition Up' };
    const first = await invokeAuth(user, 'user');
    const second = await invokeAuth(user, 'admin');
    flows.push({
      flow: 'role transition user->admin reflected',
      pass: first.denied && second.allowed,
      details: { first, second },
    });
  }

  // 4) role transition admin -> user removes access correctly
  {
    const user = { uid: 'u_transition_down', email: 'transition.down@example.com', displayName: 'Transition Down' };
    const first = await invokeAuth(user, 'admin');
    const second = await invokeAuth(user, 'user');
    flows.push({
      flow: 'role transition admin->user removes access',
      pass: first.allowed && second.denied,
      details: { first, second },
    });
  }

  // 5) stale localStorage does not preserve admin access
  {
    const result = await invokeAuth(
      { uid: 'u_stale', email: 'stale@example.com', displayName: 'Stale Local' },
      'user',
      { role: 'admin', email: 'stale@example.com', uid: 'u_stale' }
    );
    flows.push({
      flow: 'stale localStorage does not preserve admin access',
      pass: result.denied,
      details: result,
    });
  }

  // 6) hardcoded-email-only user without Firestore role is denied
  {
    const result = await invokeAuth(
      { uid: 'u_email_only', email: 'milan.pericic@logistixnerd.com', displayName: 'Email Only Legacy' },
      'user'
    );
    flows.push({
      flow: 'hardcoded-email-only user without Firestore role is denied',
      pass: result.denied,
      details: result,
    });
  }

  // Supplementary check on auth module predicate (menu gate) for authority source.
  const isAdminFnMatch = authSource.match(/isAdmin\(\)\s*\{[\s\S]*?\}/);
  const isAdminFn = isAdminFnMatch ? isAdminFnMatch[0] : '';

  const authorityLeaks = [];
  if (!/return\s*\(this\.user\?\.role\s*\|\|\s*''\)\.toLowerCase\(\)\s*===\s*'admin'\s*;/.test(isAdminFn)) {
    authorityLeaks.push('auth-firebase isAdmin() is not a strict role===admin check.');
  }

  const leakPatterns = [
    /ADMIN_EMAILS/,
    /adminEmails\s*\(/,
    /includes\(\s*this\.user\?\.email/,
    /includes\(\s*user\.email/,
  ];
  const adminSlice = adminSource;
  const authSlice = authSource;
  for (const pattern of leakPatterns) {
    if (pattern.test(adminSlice) || pattern.test(authSlice)) {
      authorityLeaks.push('Potential email-based authority pattern still present: ' + pattern.toString());
    }
  }

  const total = flows.length;
  const pass = flows.filter((f) => f.pass).length;
  const fail = total - pass;

  const report = {
    generatedAt: new Date().toISOString(),
    total,
    pass,
    fail,
    flows,
    authorityLeaks,
  };

  const outPath = path.join(ROOT, 'scripts', 'validation', 'phase2-runtime-spotcheck-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));

  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
