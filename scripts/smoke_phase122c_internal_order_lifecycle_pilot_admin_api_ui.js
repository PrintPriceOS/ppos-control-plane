'use strict';
// Phase 122C Smoke Test — Internal Order Lifecycle Pilot Admin API & UI

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

console.log('\n=== Phase 122C — Internal Order Lifecycle Pilot Admin API & UI ===\n');

// Route file
const routePath = path.join(__dirname, '../src/api/routes/internalOrderLifecyclePilotAdmin.js');
check('Route file exists', fs.existsSync(routePath));

if (fs.existsSync(routePath)) {
  const src = fs.readFileSync(routePath, 'utf8');

  const endpoints = [
    '/readiness', '/create-run', '/create-order', '/execute-lifecycle',
    '/rollback-point', '/simulate-rollback', '/finding', '/resolve-finding',
    '/steps', '/audit-timeline', '/evidence-pack',
  ];
  for (const ep of endpoints) {
    check(`Endpoint ${ep} exists`, src.includes(`'${ep}'`));
  }

  // Safety markers in route
  check('Route has pilotOnly: true', src.includes('pilotOnly: true'));
  check('Route has fullPublicEnabled: false', src.includes('fullPublicEnabled: false'));
  check('Route has paymentExecutionEnabled: false', src.includes('paymentExecutionEnabled: false'));

  // No production/live enablement
  const forbiddenPatterns = [
    'fullPublicEnabled: true', 'paymentExecutionEnabled: true',
    'openMarketplaceAccessEnabled: true', 'liveProviderConnectivityEnabled: true',
    'providerExternalSubmissionEnabled: true', 'sourceMutationOutsidePilotScope: true',
  ];
  for (const p of forbiddenPatterns) {
    check(`No forbidden pattern in route: ${p}`, !src.includes(p));
  }
}

// Admin route mount
const adminPath = path.join(__dirname, '../src/api/routes/admin.js');
if (fs.existsSync(adminPath)) {
  const adminSrc = fs.readFileSync(adminPath, 'utf8');
  check('Admin mount for internal-order-lifecycle-pilot exists', adminSrc.includes('internal-order-lifecycle-pilot'));
  check('Admin import for internalOrderLifecyclePilotAdmin exists', adminSrc.includes('internalOrderLifecyclePilotAdmin'));
}

// UI client
const clientPath = path.join(__dirname, '../src/ui/api/internalOrderLifecyclePilotClient.ts');
check('UI client file exists', fs.existsSync(clientPath));

// UI types
const typesPath = path.join(__dirname, '../src/ui/types/internalOrderLifecyclePilot.ts');
check('UI types file exists', fs.existsSync(typesPath));

// UI page
const pagePath = path.join(__dirname, '../src/ui/pages/production/InternalOrderLifecyclePilot.tsx');
check('UI page file exists', fs.existsSync(pagePath));

// App.tsx route
const appPath = path.join(__dirname, '../src/ui/App.tsx');
if (fs.existsSync(appPath)) {
  const appSrc = fs.readFileSync(appPath, 'utf8');
  check('App.tsx route for internal-order-lifecycle-pilot exists', appSrc.includes('internal-order-lifecycle-pilot'));
  check('App.tsx import for InternalOrderLifecyclePilot exists', appSrc.includes('InternalOrderLifecyclePilot'));
}

// UI safety banner
if (fs.existsSync(pagePath)) {
  const pageSrc = fs.readFileSync(pagePath, 'utf8');
  check('UI contains safety banner text', pageSrc.includes('FULL_PUBLIC remains disabled'));
  check('UI mentions pilot only', pageSrc.includes('Internal order lifecycle pilot only'));
  check('UI shows NOT_ENABLED markers', pageSrc.includes('NOT_ENABLED'));
}

console.log(`\n  Phase 122C: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
