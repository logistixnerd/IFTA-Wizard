const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PAGES_DIR = path.join(ROOT, 'pages');

const map = {
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

function wrapperHtml(title, target) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${title} - LogistiXnerd</title>`,
    `<meta http-equiv="refresh" content="0;url=../${target}">`,
    `<script>window.location.replace('../${target}');</script>`,
    '</head>',
    '<body></body>',
    '</html>'
  ].join('\n');
}

function main() {
  const apply = process.argv.includes('--apply');
  const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).sort();

  const plan = files.map((file) => {
    const name = path.basename(file, '.html');
    const target = map[name] || 'dashboard.html?section=overview';
    return { file, name, target, mapped: Boolean(map[name]) };
  });

  plan.forEach((item) => {
    console.log(`${item.name} -> ${item.target}`);
  });

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to write files.');
    return;
  }

  plan.forEach((item) => {
    const fullPath = path.join(PAGES_DIR, item.file);
    fs.writeFileSync(fullPath, wrapperHtml(item.name, item.target), 'utf8');
  });

  console.log(`\nUpdated ${plan.length} legacy wrappers.`);
}

main();
