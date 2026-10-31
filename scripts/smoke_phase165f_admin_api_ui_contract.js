'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 165F: Admin API & UI Contract Verification ===\n');

  try {
    // Verify admin router file
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionLockAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Phase 165 admin router file missing');
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/'"), "Endpoint GET '/' missing");
    assert.ok(routerContent.includes("router.get('/:activationTokenRedemptionLockId'"), "Endpoint GET '/:id' missing");
    assert.ok(routerContent.includes("router.post('/from-final-approval/:activationTokenRedemptionFinalApvId'"), "Endpoint POST '/from-final-approval/:id' missing");
    assert.ok(routerContent.includes("router.post('/:activationTokenRedemptionLockId/evaluate'"), "Endpoint POST '/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/:activationTokenRedemptionLockId/decision'"), "Endpoint POST '/decision' missing");
    assert.ok(routerContent.includes("router.post('/:activationTokenRedemptionLockId/finalize'"), "Endpoint POST '/finalize' missing");
    console.log('  PASS: All 6 admin router endpoints verified.');

    // Verify admin.js registration
    const adminPath = path.join(__dirname, '../src/api/routes/admin.js');
    assert.ok(fs.existsSync(adminPath), 'admin.js missing');
    const adminContent = fs.readFileSync(adminPath, 'utf8');
    assert.ok(adminContent.includes('controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionLockAdmin'), 'Phase 165 router not imported in admin.js');
    assert.ok(adminContent.includes('/beta/cohort-intervention-activation-token-redemption-lock'), 'Phase 165 route not mounted in admin.js');
    console.log('  PASS: Phase 165 router imported and mounted in admin.js.');

    // Verify TS client file
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionLockClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS client file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    for (const method of ['getTokenRedemptionLockList', 'getTokenRedemptionLockDetails', 'createTokenRedemptionLock', 'evaluateTokenRedemptionLock', 'recordDecision', 'finalizeTokenRedemptionLock']) {
      assert.ok(clientContent.includes(method), `Client method '${method}' missing`);
      console.log(`  PASS: Client method '${method}' verified.`);
    }

    // Verify UI page file
    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionLock.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Phase 165 is not token redemption.'), 'Safety banner missing in UI page');
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 165F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 165F:', e.message);
    process.exit(1);
  }
})();
