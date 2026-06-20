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

(() => {
  console.log('=== Smoke 135F: Runtime Session Admin API & UI ===');

  // 1. Verify admin route file exists
  const routeExists = fs.existsSync(path.join(__dirname, '../src/api/routes/controlledBetaRuntimeSessionAdmin.js'));
  assert(routeExists, 'controlledBetaRuntimeSessionAdmin.js router file exists');

  // 2. Verify router is mounted in admin.js
  const adminCode = fs.readFileSync(path.join(__dirname, '../src/api/routes/admin.js'), 'utf8');
  assert(adminCode.includes('/beta/runtime-sessions'), 'Router mounted at /beta/runtime-sessions in admin.js');

  // 3. Verify UI type definitions file exists
  const typesExist = fs.existsSync(path.join(__dirname, '../src/ui/types/controlledBetaRuntimeSession.ts'));
  assert(typesExist, 'UI types definition file exists');

  // 4. Verify UI API Client file exists
  const clientExists = fs.existsSync(path.join(__dirname, '../src/ui/api/controlledBetaRuntimeSessionClient.ts'));
  assert(clientExists, 'UI API Client file exists');

  // 5. Verify UI React page exists
  const pagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaRuntimeSession.tsx');
  const pageExists = fs.existsSync(pagePath);
  assert(pageExists, 'UI React page component file exists');

  if (pageExists) {
    const pageCode = fs.readFileSync(pagePath, 'utf8');
    assert(pageCode.includes('Controlled runtime sessions only.'), 'UI contains warning banner copy');
    assert(pageCode.includes('This is not public beta'), 'UI explicitly states restrictions');
    assert(!pageCode.includes('raw_session_token:'), 'UI does not display raw session tokens');
  }

  // 6. Verify sidebar navigation config registers new link
  const navCode = fs.readFileSync(path.join(__dirname, '../src/ui/config/controlPlaneNavigation.ts'), 'utf8');
  assert(navCode.includes('/admin/beta/runtime-sessions'), 'Navigation config contains beta-runtime-sessions item');

  console.log(`Smoke 135F: Finished. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
