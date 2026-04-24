const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PAGES_DIR = path.join(ROOT, 'pages');

const canonicalMap = {
  trucks: 'fleet-workspace.html?section=trucks',
  trailers: 'fleet-workspace.html?section=trailers',
  maintenance: 'fleet-workspace.html?section=maintenance',
  'work-orders': 'fleet-workspace.html?section=work-orders',
  'pm-schedules': 'fleet-workspace.html?section=pm-schedules',
  'parts-inventory': 'fleet-workspace.html?section=parts-inventory',

  safety: 'safety-workspace.html?section=overview',
  accidents: 'safety-workspace.html?section=accidents',
  'cross-dept-alerts': 'safety-workspace.html?section=alerts',
  operations: 'safety-workspace.html?section=operations',

  compliance: 'compliance-workspace.html?section=overview',
  claims: 'compliance-workspace.html?section=claims',
  insurance: 'compliance-workspace.html?section=insurance',

  reports: 'fuel-ifta-workspace.html?section=reports',
  expenses: 'fuel-ifta-workspace.html?section=expenses',
  settlements: 'fuel-ifta-workspace.html?section=settlements',
  accounting: 'fuel-ifta-workspace.html?section=accounting',
  invoices: 'fuel-ifta-workspace.html?section=invoices',
  payroll: 'fuel-ifta-workspace.html?section=payroll',

  afterhours: 'documents-workspace.html?section=afterhours',
  applications: 'documents-workspace.html?section=applications',
  'bulk-docs': 'documents-workspace.html?section=bulk-docs',
  'cargo-claims': 'documents-workspace.html?section=cargo-claims',
  'emergency-contacts': 'documents-workspace.html?section=emergency-contacts',
  'on-call': 'documents-workspace.html?section=on-call',
  'driver-support': 'documents-workspace.html?section=driver-support',

  tracking: 'integrations-workspace.html?section=tracking',
  'live-map': 'integrations-workspace.html?section=live-map',
  'load-status': 'integrations-workspace.html?section=load-status',
  'eta-tracking': 'integrations-workspace.html?section=eta-tracking',
  'command-center': 'integrations-workspace.html?section=command-center',

  overview: 'dashboard.html?section=overview',
  company: 'dashboard.html?section=company',
  settings: 'dashboard.html?section=settings',

  drivers: 'drivers-workspace.html?section=overview',
  'driver-assignments': 'drivers-workspace.html?section=assignments',
  hiring: 'drivers-workspace.html?section=hiring',
  'hiring-pipeline': 'drivers-workspace.html?section=hiring-pipeline',
  onboarding: 'drivers-workspace.html?section=onboarding',

  dispatch: 'dispatch-workspace.html?section=overview',
  'dispatch-board': 'dispatch-workspace.html?section=board',
  'active-loads': 'dispatch-workspace.html?section=active-loads',
};

function normalizeUrl(url) {
  return String(url || '').replace(/^\.\//, '').replace(/^\//, '');
}

function splitUrl(url) {
  const value = normalizeUrl(url);
  const idx = value.indexOf('?');
  if (idx < 0) return { pathname: value, search: '' };
  return {
    pathname: value.slice(0, idx),
    search: value.slice(idx + 1),
  };
}

function extractRedirectTarget(htmlText) {
  const scriptMatch = htmlText.match(/window\.location\.replace\(\s*['\"]([^'\"]+)['\"]\s*\)/i);
  if (scriptMatch) return scriptMatch[1];
  const metaMatch = htmlText.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>]+)["']/i);
  if (metaMatch) return metaMatch[1];
  return null;
}

function resolveRelative(basePathname, target) {
  const fromPath = '/' + normalizeUrl(basePathname);
  const u = new URL(target, 'https://placeholder.local' + fromPath);
  return normalizeUrl(u.pathname + u.search);
}

function fileExistsWorkspace(urlPath) {
  const { pathname } = splitUrl(urlPath);
  return fs.existsSync(path.join(ROOT, pathname));
}

function followRedirectChain(startUrl, maxHops = 10) {
  const hops = [];
  let current = normalizeUrl(startUrl);
  const seen = new Set();

  for (let i = 0; i < maxHops; i += 1) {
    if (seen.has(current)) {
      return { finalUrl: current, hops, loop: true, stopped: 'loop' };
    }
    seen.add(current);

    const { pathname } = splitUrl(current);
    const absFile = path.join(ROOT, pathname);

    if (!fs.existsSync(absFile)) {
      return { finalUrl: current, hops, loop: false, stopped: 'missing-file' };
    }

    const isHtml = pathname.toLowerCase().endsWith('.html');
    if (!isHtml) {
      return { finalUrl: current, hops, loop: false, stopped: 'non-html' };
    }

    const content = fs.readFileSync(absFile, 'utf8');
    const rawTarget = extractRedirectTarget(content);
    if (!rawTarget) {
      return { finalUrl: current, hops, loop: false, stopped: 'terminal-page' };
    }

    const next = resolveRelative(pathname, rawTarget);
    hops.push({ from: current, to: next });
    current = next;
  }

  return { finalUrl: current, hops, loop: false, stopped: 'max-hops' };
}

function main() {
  const wrapperFiles = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).sort();

  const rows = wrapperFiles.map((file) => {
    const slug = path.basename(file, '.html');
    const oldUrl = 'pages/' + file;
    const expectedCanonicalUrl = canonicalMap[slug] || 'dashboard.html?section=overview';

    const firstHop = followRedirectChain(oldUrl, 1);
    const firstHopTarget = firstHop.hops[0] ? firstHop.hops[0].to : null;

    const full = followRedirectChain(oldUrl, 10);
    const actualFinalUrl = full.finalUrl;

    let pass = true;
    const flags = [];

    if (firstHopTarget !== expectedCanonicalUrl) {
      pass = false;
      flags.push('route-mismatch');
    }

    if (full.loop) {
      pass = false;
      flags.push('redirect-loop');
    }

    const transitionalDashboardDependency =
      expectedCanonicalUrl.startsWith('drivers-workspace.html?') ||
      expectedCanonicalUrl.startsWith('dispatch-workspace.html?');

    if (transitionalDashboardDependency) {
      const terminalToDashboard = actualFinalUrl.startsWith('dashboard.html?section=');
      if (terminalToDashboard) {
        pass = false;
        flags.push('transitional-dashboard-dependency');
      }
    }

    if (!fileExistsWorkspace(actualFinalUrl)) {
      pass = false;
      flags.push('missing-final-target');
    }

    return {
      oldUrl,
      expectedCanonicalUrl,
      actualFinalUrl,
      pass,
      flags,
      stopped: full.stopped,
      hops: full.hops,
    };
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    pass: rows.filter((r) => r.pass).length,
    fail: rows.filter((r) => !r.pass).length,
    rows,
    architecturalDebt: rows
      .filter((r) => r.flags.includes('transitional-dashboard-dependency'))
      .map((r) => ({
        canonicalRoute: r.expectedCanonicalUrl,
        terminalRoute: r.actualFinalUrl,
      })),
  };

  const outPath = path.join(ROOT, 'scripts', 'validation', 'phase3-clickpath-validation-results.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));

  if (summary.fail > 0) process.exitCode = 2;
}

main();
