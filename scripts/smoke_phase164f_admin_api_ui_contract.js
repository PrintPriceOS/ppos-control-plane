'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 164F: Admin API & UI Contract Verification ===\n');

  try {
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Phase 164 admin router file missing');
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/approval'"), "Endpoint GET '/approval' missing");
    assert.ok(routerContent.includes("router.get('/approval/:activationTokenRedemptionFinalApvId'"), "Endpoint GET '/:id' missing");
    assert.ok(routerContent.includes("router.post('/approval/from-env/:activationTokenRedemptionEnvId'"), "Endpoint POST '/from-env/:id' missing");
    assert.ok(routerContent.includes("router.post('/approval/:activationTokenRedemptionFinalApvId/evaluate'"), "Endpoint POST '/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/approval/:activationTokenRedemptionFinalApvId/decision'"), "Endpoint POST '/decision' missing");
    assert.ok(routerContent.includes("router.post('/approval/:activationTokenRedemptionFinalApvId/finalize'"), "Endpoint POST '/finalize' missing");
    console.log('  PASS: All 6 admin router endpoints verified.');

    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS client file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    for (const method of ['getTokenRedemptionFinalApprovalList', 'getTokenRedemptionFinalApprovalDetails', 'createTokenRedemptionFinalApproval', 'evaluateTokenRedemptionFinalApproval', 'recordDecision', 'finalizeTokenRedemptionFinalApproval']) {
      assert.ok(clientContent.includes(method), `Client method '${method}' missing`);
      console.log(`  PASS: Client method '${method}' verified.`);
    }

    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionFinalApproval.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Phase 164 is not token redemption.'), 'Safety banner missing in UI page');
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 164F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 164F:', e.message);
    process.exit(1);
  }
})();
