'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('=== Smoke 176F: Phase 176 Admin API & UI Contract Verification ===');

  const adminJsPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
  const appTxsPath = path.join(__dirname, '..', 'src', 'ui', 'App.tsx');
  const clientLibPath = path.join(__dirname, '..', 'src', 'ui', 'lib', 'controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldClient.ts');
  const reactPagePath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'beta', 'ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHold.tsx');

  try {
    // 1. Verify admin.js
    assert.ok(fs.existsSync(adminJsPath), 'admin.js does not exist');
    const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
    assert.ok(adminJsContent.includes('controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldAdmin'), 'Admin route import missing in admin.js');
    assert.ok(adminJsContent.includes('/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold'), 'Admin route mount path missing in admin.js');
    console.log('  PASS: admin.js routing integration verified.');

    // 2. Verify App.tsx
    assert.ok(fs.existsSync(appTxsPath), 'App.tsx does not exist');
    const appTxsContent = fs.readFileSync(appTxsPath, 'utf8');
    assert.ok(appTxsContent.includes('ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHold'), 'React page import/usage missing in App.tsx');
    console.log('  PASS: App.tsx routing integration verified.');

    // 3. Verify Client Library
    assert.ok(fs.existsSync(clientLibPath), 'Client library does not exist');
    const clientLibContent = fs.readFileSync(clientLibPath, 'utf8');
    assert.ok(clientLibContent.includes('ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldClient'), 'Client class export missing');
    console.log('  PASS: UI Client Library contract verified.');

    // 4. Verify React Page Component
    assert.ok(fs.existsSync(reactPagePath), 'React page component does not exist');
    console.log('  PASS: UI React page component verified.');

    console.log('\nSmoke 176F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 176F:', e.message, e.stack);
    process.exit(1);
  }
})();
