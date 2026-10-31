'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 163F: Admin API & UI Contract Verification ===\n');

  try {
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Phase 163 admin router file missing');
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/envelope'"), "Endpoint GET '/envelope' missing");
    assert.ok(routerContent.includes("router.get('/envelope/:activationTokenRedemptionEnvelopeId'"), "Endpoint GET '/:id' missing");
    assert.ok(routerContent.includes("router.post('/envelope/from-auth/:activationTokenRedemptionAuthId'"), "Endpoint POST '/from-auth/:id' missing");
    assert.ok(routerContent.includes("router.post('/envelope/:activationTokenRedemptionEnvelopeId/evaluate'"), "Endpoint POST '/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/envelope/:activationTokenRedemptionEnvelopeId/decision'"), "Endpoint POST '/decision' missing");
    assert.ok(routerContent.includes("router.post('/envelope/:activationTokenRedemptionEnvelopeId/finalize'"), "Endpoint POST '/finalize' missing");
    console.log('  PASS: All 6 admin router endpoints verified.');

    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS client file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    for (const method of ['getTokenRedemptionEnvelopeList', 'getTokenRedemptionEnvelopeDetails', 'createTokenRedemptionEnvelope', 'evaluateTokenRedemptionEnvelope', 'recordDecision', 'finalizeTokenRedemptionEnvelope']) {
      assert.ok(clientContent.includes(method), `Client method '${method}' missing`);
      console.log(`  PASS: Client method '${method}' verified.`);
    }

    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionEnvelope.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Phase 163 is not token redemption.'), 'Safety banner missing in UI page');
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 163F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 163F:', e.message);
    process.exit(1);
  }
})();
