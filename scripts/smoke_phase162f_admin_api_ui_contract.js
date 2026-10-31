'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 162F: Admin API & UI Contract Verification ===\n');

  try {
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Phase 162 admin router file missing');
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/authorization'"), "Endpoint GET '/authorization' missing");
    assert.ok(routerContent.includes("router.get('/authorization/:activationTokenRedemptionAuthId'"), "Endpoint GET '/:id' missing");
    assert.ok(routerContent.includes("router.post('/authorization/from-readiness/:activationTokenRedemptionReadinessId'"), "Endpoint POST '/from-readiness/:id' missing");
    assert.ok(routerContent.includes("router.post('/authorization/:activationTokenRedemptionAuthId/evaluate'"), "Endpoint POST '/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/authorization/:activationTokenRedemptionAuthId/decision'"), "Endpoint POST '/decision' missing");
    assert.ok(routerContent.includes("router.post('/authorization/:activationTokenRedemptionAuthId/finalize'"), "Endpoint POST '/finalize' missing");
    console.log('  PASS: All 6 admin router endpoints verified.');

    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS client file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    for (const method of ['getTokenRedemptionAuthList', 'getTokenRedemptionAuthDetails', 'createTokenRedemptionAuth', 'evaluateTokenRedemptionAuth', 'recordDecision', 'finalizeTokenRedemptionAuth']) {
      assert.ok(clientContent.includes(method), `Client method '${method}' missing`);
      console.log(`  PASS: Client method '${method}' verified.`);
    }

    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionAuthorization.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Phase 162 is not token redemption.'), 'Safety banner missing in UI page');
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 162F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 162F:', e.message);
    process.exit(1);
  }
})();
