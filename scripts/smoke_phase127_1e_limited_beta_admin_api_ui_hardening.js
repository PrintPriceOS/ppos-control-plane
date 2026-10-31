'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 127.1e: Admin API & UI Hardening Verification ===\n');

// 1. Verify safeResponse mapping in Admin Router
const routerPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'limitedBetaPreparationGateAdmin.js');
const routerExists = fs.existsSync(routerPath);
assert(routerExists, "Admin router file exists");

if (routerExists) {
  const routerContent = fs.readFileSync(routerPath, 'utf8');

  // Verify safeResponse implementation asserts safety invariants
  assert(routerContent.includes('persistenceMode:'), "safeResponse maps persistenceMode");
  assert(routerContent.includes('persistenceStatus:'), "safeResponse maps persistenceStatus");
  assert(routerContent.includes('runtimeTruthStatus:'), "safeResponse maps runtimeTruthStatus");
  assert(routerContent.includes('betaRuntimeEnabled: false'), "safeResponse overrides betaRuntimeEnabled to false");
  assert(routerContent.includes('fullPublicEnabled: false'), "safeResponse overrides fullPublicEnabled to false");
  assert(routerContent.includes('openMarketplaceEnabled: false'), "safeResponse overrides openMarketplaceEnabled to false");
  assert(routerContent.includes('paymentExecutionEnabled: false'), "safeResponse overrides paymentExecutionEnabled to false");
}

// 2. Verify UI Page Component contains the required safety warning and status registry elements
const uiPath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'beta', 'LimitedBetaPreparationGate.tsx');
const uiExists = fs.existsSync(uiPath);
assert(uiExists, "UI component file exists");

if (uiExists) {
  const uiContent = fs.readFileSync(uiPath, 'utf8');

  assert(uiContent.includes('Limited Beta Preparation only. Beta runtime is not enabled. FULL_PUBLIC and open marketplace access remain disabled.'), "UI warning text exists");
  assert(uiContent.includes('PERSISTENCE STATUS'), "UI displays PERSISTENCE STATUS");
  assert(uiContent.includes('PERSISTENCE MODE'), "UI displays PERSISTENCE MODE");
  assert(uiContent.includes('RUNTIME TRUTH STATUS'), "UI displays RUNTIME TRUTH STATUS");
  assert(uiContent.includes('FAIL-CLOSED VERIFIED'), "UI displays FAIL-CLOSED VERIFIED");
  assert(uiContent.includes('PHASE 126.1 EVIDENCE'), "UI displays PHASE 126.1 EVIDENCE");
  assert(uiContent.includes('SECRET HYGIENE'), "UI displays SECRET HYGIENE");
}

console.log(`\nSmoke 127.1e: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
