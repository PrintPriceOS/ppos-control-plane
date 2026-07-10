'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('=== Smoke 179F: Phase 179 Admin API & UI Contract Verification ===');

  const adminJsPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
  const appTxsPath = path.join(__dirname, '..', 'src', 'ui', 'App.tsx');
  const clientLibPath = path.join(__dirname, '..', 'src', 'ui', 'lib', 'controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealClient.ts');
  const reactPagePath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'beta', 'ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal.tsx');

  try {
    // 1. Verify admin.js
    assert.ok(fs.existsSync(adminJsPath), 'admin.js does not exist');
    const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
    assert.ok(adminJsContent.includes('controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealAdmin'), 'Admin route import missing in admin.js');
    assert.ok(adminJsContent.includes('/beta/cohort-intervention/activation-token-redemption-unlock-final-non-execution-evidence-seal'), 'Admin route mount path missing in admin.js');
    console.log('  PASS: admin.js routing integration verified.');

    // 2. Verify App.tsx
    assert.ok(fs.existsSync(appTxsPath), 'App.tsx does not exist');
    const appTxsContent = fs.readFileSync(appTxsPath, 'utf8');
    assert.ok(appTxsContent.includes('ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal'), 'React page import/usage missing in App.tsx');
    assert.ok(appTxsContent.includes('activation-token-redemption-unlock-final-non-execution-evidence-seal'), 'Route path missing in App.tsx');
    console.log('  PASS: App.tsx routing integration verified.');

    // 3. Verify Client Library
    assert.ok(fs.existsSync(clientLibPath), 'Client library does not exist');
    const clientLibContent = fs.readFileSync(clientLibPath, 'utf8');
    assert.ok(clientLibContent.includes('ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealClient'), 'Client class export missing');
    assert.ok(clientLibContent.includes('createUnlockFinalNonExecutionEvidenceSeal'), 'createUnlockFinalNonExecutionEvidenceSeal method missing');
    assert.ok(clientLibContent.includes('evaluateUnlockFinalNonExecutionEvidenceSeal'), 'evaluateUnlockFinalNonExecutionEvidenceSeal method missing');
    assert.ok(clientLibContent.includes('finalizeUnlockFinalNonExecutionEvidenceSeal'), 'finalizeUnlockFinalNonExecutionEvidenceSeal method missing');
    console.log('  PASS: UI Client Library contract verified.');

    // 4. Verify React Page Component
    assert.ok(fs.existsSync(reactPagePath), 'React page component does not exist');
    const reactPageContent = fs.readFileSync(reactPagePath, 'utf8');
    assert.ok(reactPageContent.includes('final_non_execution_evidence_seal_confirmation'), '17-confirmation checklist missing in page');
    assert.ok(reactPageContent.includes('token_never_unlocked_confirmed'), 'Critical safety confirmation missing in page');
    console.log('  PASS: UI React page component verified.');

    console.log('\nSmoke 179F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 179F:', e.message, e.stack);
    process.exit(1);
  }
})();
