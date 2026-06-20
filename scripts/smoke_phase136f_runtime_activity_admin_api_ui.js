'use strict';

const fs = require('fs');
const path = require('path');
const adminRouter = require('../src/api/routes/admin');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 136F: Runtime Activity Admin API & UI Config ===\n');

try {
  // 1. Router verify
  assert(adminRouter !== undefined, 'Admin router is exported');

  // Verify route files exist
  const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaRuntimeActivityObservationAdmin.js');
  assert(fs.existsSync(routerPath), 'controlledBetaRuntimeActivityObservationAdmin.js route file exists');

  // 2. React Page file check
  const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaRuntimeActivityObservation.tsx');
  assert(fs.existsSync(uiPagePath), 'React component page file exists');

  const uiCode = fs.readFileSync(uiPagePath, 'utf8');
  assert(uiCode.includes('Controlled runtime activity observation only'), 'UI explicitly states warnings/restrictions banner');
  assert(!uiCode.includes('process.env.DATABASE_URL') && !uiCode.includes('process.env.JWT_SECRET'), 'UI does not display raw config secrets');

  // 3. Navigation configuration item check via reading file directly
  const navConfigPath = path.join(__dirname, '../src/ui/config/controlPlaneNavigation.ts');
  assert(fs.existsSync(navConfigPath), 'Navigation configuration file exists');

  const navCode = fs.readFileSync(navConfigPath, 'utf8');
  assert(navCode.includes('beta-runtime-activity') && navCode.includes('/admin/beta/runtime-activity'), 'Navigation config contains beta-runtime-activity route definition');

  console.log(`\nSmoke 136F: Finished execution. ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
} catch (e) {
  console.error('FAIL: UI / API configuration check threw error: ', e);
  process.exit(1);
}
