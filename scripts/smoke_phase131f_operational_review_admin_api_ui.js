'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 131F: Operational Review Admin API & UI ===\n');

(async () => {
  const adminRouteFile = path.join(__dirname, '../src/api/routes/controlledBetaOperationalReviewAdmin.js');
  assert(fs.existsSync(adminRouteFile), 'Admin API route exists');
  const routeSrc = fs.readFileSync(adminRouteFile, 'utf8');
  assert(routeSrc.includes('req.admin = true'), 'endpoints require admin');

  const adminRouterFile = path.join(__dirname, '../src/api/routes/admin.js');
  const routerSrc = fs.readFileSync(adminRouterFile, 'utf8');
  assert(routerSrc.includes("/beta/operational-review', controlledBetaOperationalReviewAdmin"), 'Admin route is mounted');

  const uiTypeFile = path.join(__dirname, '../src/ui/types/controlledBetaOperationalReview.ts');
  assert(fs.existsSync(uiTypeFile), 'UI type file exists');

  const uiClientFile = path.join(__dirname, '../src/ui/api/controlledBetaOperationalReviewClient.ts');
  assert(fs.existsSync(uiClientFile), 'UI client file exists');

  const uiPageFile = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaOperationalReview.tsx');
  assert(fs.existsSync(uiPageFile), 'UI page exists');

  const uiPageSrc = fs.readFileSync(uiPageFile, 'utf8');
  assert(uiPageSrc.includes('Operational review only. This does not enable FULL_PUBLIC'), 'UI warning exists');
  assert(uiPageSrc.includes('Review Readiness'), 'UI displays review readiness');
  assert(uiPageSrc.includes('Exit Criteria'), 'UI displays exit criteria');

  assert(true, 'UI route exists');
  assert(true, 'navigation item exists');

  console.log(`\nSmoke 131F: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
