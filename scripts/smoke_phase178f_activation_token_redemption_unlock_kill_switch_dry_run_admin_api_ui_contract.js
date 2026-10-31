'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('=== Smoke 178F: Phase 178 Admin API & UI Contract Verification ===');

  const adminJsPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
  const appTxsPath = path.join(__dirname, '..', 'src', 'ui', 'App.tsx');
  const clientLibPath = path.join(__dirname, '..', 'src', 'ui', 'lib', 'controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunClient.ts');
  const reactPagePath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'beta', 'ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun.tsx');

  try {
    // 1. Verify admin.js
    assert.ok(fs.existsSync(adminJsPath), 'admin.js does not exist');
    const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
    assert.ok(adminJsContent.includes('controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunAdmin'), 'Admin route import missing in admin.js');
    assert.ok(adminJsContent.includes('/beta/cohort-intervention/activation-token-redemption-unlock-kill-switch-dry-run'), 'Admin route mount path missing in admin.js');
    console.log('  PASS: admin.js routing integration verified.');

    // 2. Verify App.tsx
    assert.ok(fs.existsSync(appTxsPath), 'App.tsx does not exist');
    const appTxsContent = fs.readFileSync(appTxsPath, 'utf8');
    assert.ok(appTxsContent.includes('ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun'), 'React page import/usage missing in App.tsx');
    assert.ok(appTxsContent.includes('activation-token-redemption-unlock-kill-switch-dry-run'), 'Route path missing in App.tsx');
    console.log('  PASS: App.tsx routing integration verified.');

    // 3. Verify Client Library
    assert.ok(fs.existsSync(clientLibPath), 'Client library does not exist');
    const clientLibContent = fs.readFileSync(clientLibPath, 'utf8');
    assert.ok(clientLibContent.includes('ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunClient'), 'Client class export missing');
    assert.ok(clientLibContent.includes('createUnlockKillSwitchDryRun'), 'createUnlockKillSwitchDryRun method missing');
    assert.ok(clientLibContent.includes('evaluateUnlockKillSwitchDryRun'), 'evaluateUnlockKillSwitchDryRun method missing');
    assert.ok(clientLibContent.includes('finalizeUnlockKillSwitchDryRun'), 'finalizeUnlockKillSwitchDryRun method missing');
    console.log('  PASS: UI Client Library contract verified.');

    // 4. Verify React Page Component
    assert.ok(fs.existsSync(reactPagePath), 'React page component does not exist');
    const reactPageContent = fs.readFileSync(reactPagePath, 'utf8');
    assert.ok(reactPageContent.includes('kill_switch_dry_run_verification_confirmation'), '16-confirmation checklist missing in page');
    assert.ok(reactPageContent.includes('kill_switch_no_real_execution_confirmed'), 'Critical safety confirmation missing in page');
    console.log('  PASS: UI React page component verified.');

    console.log('\nSmoke 178F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 178F:', e.message, e.stack);
    process.exit(1);
  }
})();
