'use strict';
// Phase 121C Smoke Test — Controlled Production Pilot Admin API & UI

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}`);
    fail++;
  }
}

console.log('\n=== Phase 121C — Controlled Production Pilot Admin API & UI ===\n');

// --- Admin route file ---
const routePath = path.join(__dirname, '../src/api/routes/controlledProductionPilotActivationAdmin.js');
check('Admin route file exists', fs.existsSync(routePath));

if (fs.existsSync(routePath)) {
  const routeSrc = fs.readFileSync(routePath, 'utf8');

  const endpoints = [
    '/readiness',
    '/create',
    '/register-tenant',
    '/activate-tenant',
    '/suspend-tenant',
    '/finding',
    '/resolve-finding',
    '/rollback-point',
    '/simulate-rollback',
    '/audit-timeline',
    '/evidence-pack',
  ];
  for (const ep of endpoints) {
    check(`Endpoint ${ep} defined in route`, routeSrc.includes(`'${ep}'`));
  }

  // Safety markers in route
  check('controlledPilotOnly: true in route', routeSrc.includes('controlledPilotOnly: true'));
  check('fullPublicEnabled: false in route', routeSrc.includes('fullPublicEnabled: false'));
  check('rollbackAvailable: true in route', routeSrc.includes('rollbackAvailable: true'));

  // No unsafe flags
  check('No fullPublicEnabled: true in route', !routeSrc.includes('fullPublicEnabled: true'));
  check('No paymentExecutionEnabled: true in route', !routeSrc.includes('paymentExecutionEnabled: true'));
}

// --- Route mounted in admin.js ---
const adminPath = path.join(__dirname, '../src/api/routes/admin.js');
if (fs.existsSync(adminPath)) {
  const adminSrc = fs.readFileSync(adminPath, 'utf8');
  check('Route imported in admin.js', adminSrc.includes("require('./controlledProductionPilotActivationAdmin')"));
  check('Route mounted at /production/pilot-activation', adminSrc.includes("'/production/pilot-activation'"));
}

// --- UI types ---
const typesPath = path.join(__dirname, '../src/ui/types/controlledProductionPilotActivation.ts');
check('UI types file exists', fs.existsSync(typesPath));
if (fs.existsSync(typesPath)) {
  const typesSrc = fs.readFileSync(typesPath, 'utf8');
  check('PilotSafetyMarkers interface defined', typesSrc.includes('PilotSafetyMarkers'));
  check('PilotRun interface defined', typesSrc.includes('PilotRun'));
  check('PilotTenant interface defined', typesSrc.includes('PilotTenant'));
  check('PilotCheck interface defined', typesSrc.includes('PilotCheck'));
  check('PilotFinding interface defined', typesSrc.includes('PilotFinding'));
  check('PilotRollbackPoint interface defined', typesSrc.includes('PilotRollbackPoint'));
  check('PilotAuditEntry interface defined', typesSrc.includes('PilotAuditEntry'));
  check('PilotReadinessResult interface defined', typesSrc.includes('PilotReadinessResult'));
  check('PilotEvidencePack interface defined', typesSrc.includes('PilotEvidencePack'));
  check('PilotAuditTimeline interface defined', typesSrc.includes('PilotAuditTimeline'));
}

// --- UI API client ---
const clientPath = path.join(__dirname, '../src/ui/api/controlledProductionPilotActivationClient.ts');
check('UI API client file exists', fs.existsSync(clientPath));
if (fs.existsSync(clientPath)) {
  const clientSrc = fs.readFileSync(clientPath, 'utf8');
  const clientFunctions = [
    'getPilotReadiness',
    'createPilotRun',
    'registerPilotTenant',
    'activatePilotTenant',
    'suspendPilotTenant',
    'recordPilotFinding',
    'resolvePilotFinding',
    'createPilotRollbackPoint',
    'simulatePilotRollback',
    'getPilotAuditTimeline',
    'getPilotEvidencePack',
  ];
  for (const fn of clientFunctions) {
    check(`Client function ${fn} exported`, clientSrc.includes(fn));
  }
  check('Client uses correct base path', clientSrc.includes('/api/admin/production/pilot-activation'));
}

// --- UI page ---
const pagePath = path.join(__dirname, '../src/ui/pages/production/ControlledProductionPilotActivation.tsx');
check('UI page file exists', fs.existsSync(pagePath));
if (fs.existsSync(pagePath)) {
  const pageSrc = fs.readFileSync(pagePath, 'utf8');
  check('Page exports ControlledProductionPilotActivation', pageSrc.includes('ControlledProductionPilotActivation'));
  check('Page shows safety notice', pageSrc.includes('Controlled pilot only'));
  check('Page imports from client', pageSrc.includes('controlledProductionPilotActivationClient'));
}

// --- App.tsx route registration ---
const appPath = path.join(__dirname, '../src/ui/App.tsx');
if (fs.existsSync(appPath)) {
  const appSrc = fs.readFileSync(appPath, 'utf8');
  check('Route registered in App.tsx', appSrc.includes('/admin/production/pilot-activation'));
  check('Page imported in App.tsx', appSrc.includes('ControlledProductionPilotActivation'));
}

console.log(`\n  Phase 121C: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
