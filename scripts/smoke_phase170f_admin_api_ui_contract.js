'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(() => {
  console.log('=== Smoke 170F: Admin API & UI Contract Verification ===\n');

  // 1. Verify admin route exists and is mounted in admin.js
  const adminJsPath = path.join(__dirname, '../src/api/routes/admin.js');
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
  assert.ok(adminJsContent.includes('controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeAdmin'), 'Admin route import missing in admin.js');
  assert.ok(adminJsContent.includes('/beta/cohort-intervention-activation-token-redemption-unlock-pre-execution-freeze'), 'Admin route mounting missing in admin.js');
  console.log('  PASS: Phase 170 router imported and mounted in admin.js.');

  // 2. Verify UI Client methods
  const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeClient.ts');
  const clientContent = fs.readFileSync(clientPath, 'utf8');
  for (const method of [
    'getUnlockPreExecutionFreezeList',
    'getUnlockPreExecutionFreezeDetails',
    'createUnlockPreExecutionFreeze',
    'evaluateUnlockPreExecutionFreeze',
    'recordDecision',
    'finalizeUnlockPreExecutionFreeze'
  ]) {
    assert.ok(clientContent.includes(method), `Client method ${method} missing`);
    console.log(`  PASS: Client method '${method}' verified.`);
  }

  // 3. Verify UI Page warnings
  const pagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreeze.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf8');
  assert.ok(pageContent.includes('[SAFETY BOUNDARY ENFORCED]'), 'UI Page missing safety boundary warning banner');
  console.log('  PASS: UI Page contains the non-execution warning banner.');

  // 4. Verify UI path registered in App.tsx
  const appPath = path.join(__dirname, '../src/ui/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');
  assert.ok(appContent.includes('/admin/beta/cohort-intervention/activation-token-redemption-unlock-pre-execution-freeze/:unlockPreExecutionFreezeId'), 'UI Route registration missing in App.tsx');
  console.log('  PASS: UI Page route registered matching user recommendation.');

  console.log('\nSmoke 170F: Passed.');
  process.exit(0);
})();
