'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 161F: Admin API & UI Contract Verification ===\n');

  try {
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionReadinessAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Phase 161 admin router file missing');
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/readiness'"), "Endpoint GET '/readiness' missing");
    assert.ok(routerContent.includes("router.get('/readiness/:activationTokenRedemptionReadinessId'"), "Endpoint GET '/:id' missing");
    assert.ok(routerContent.includes("router.post('/readiness/from-issuance/:activationTokenIssuanceId'"), "Endpoint POST '/from-issuance/:id' missing");
    assert.ok(routerContent.includes("router.post('/readiness/:activationTokenRedemptionReadinessId/evaluate'"), "Endpoint POST '/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/readiness/:activationTokenRedemptionReadinessId/decision'"), "Endpoint POST '/decision' missing");
    assert.ok(routerContent.includes("router.post('/readiness/:activationTokenRedemptionReadinessId/finalize'"), "Endpoint POST '/finalize' missing");
    console.log('  PASS: All 6 admin router endpoints verified.');

    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionReadinessClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS client file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    for (const method of ['getTokenRedemptionReadinessList', 'getTokenRedemptionReadinessDetails', 'createTokenRedemptionReadiness', 'evaluateTokenRedemptionReadiness', 'recordDecision', 'finalizeTokenRedemptionReadiness']) {
      assert.ok(clientContent.includes(method), `Client method '${method}' missing`);
      console.log(`  PASS: Client method '${method}' verified.`);
    }

    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionReadiness.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Phase 161 is not redemption.'), 'Safety banner missing in UI page');
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 161F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 161F:', e.message);
    process.exit(1);
  }
})();
