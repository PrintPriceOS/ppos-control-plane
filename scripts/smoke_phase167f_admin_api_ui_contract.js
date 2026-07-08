'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(() => {
  console.log('=== Smoke 167F: Admin API & UI Contract Verification ===\n');

  // 1. Verify admin route exists and is mounted in admin.js
  const adminJsPath = path.join(__dirname, '../src/api/routes/admin.js');
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
  assert.ok(adminJsContent.includes('controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalAdmin'), 'Admin route import missing in admin.js');
  assert.ok(adminJsContent.includes('/beta/cohort-intervention-activation-token-redemption-unlock-approval'), 'Admin route mounting missing in admin.js');
  console.log('  PASS: Phase 167 router imported and mounted in admin.js.');

  // 2. Verify UI Client methods
  const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalClient.ts');
  const clientContent = fs.readFileSync(clientPath, 'utf8');
  for (const method of [
    'getUnlockApprovalList',
    'getUnlockApprovalDetails',
    'createUnlockApproval',
    'evaluateUnlockApproval',
    'recordDecision',
    'finalizeUnlockApproval'
  ]) {
    assert.ok(clientContent.includes(method), `Client method ${method} missing`);
    console.log(`  PASS: Client method '${method}' verified.`);
  }

  // 3. Verify UI Page warnings
  const pagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockApproval.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf8');
  assert.ok(pageContent.includes('[SAFETY BOUNDARY ENFORCED]'), 'UI Page missing safety boundary warning banner');
  console.log('  PASS: UI Page contains the non-execution warning banner.');

  console.log('\nSmoke 167F: Passed.');
  process.exit(0);
})();
