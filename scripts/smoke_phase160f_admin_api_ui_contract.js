'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 160F: Admin API & UI Contract Verification ===\n');

  try {
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenIssuanceAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Phase 160 admin router file missing');
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/issuance'"), "Endpoint GET '/issuance' missing");
    assert.ok(routerContent.includes("router.get('/issuance/:activationTokenIssuanceId'"), "Endpoint GET '/:id' missing");
    assert.ok(routerContent.includes("router.post('/issuance/from-preflight/:activationTokenPreflightId'"), "Endpoint POST '/from-preflight/:id' missing");
    assert.ok(routerContent.includes("router.post('/issuance/:activationTokenIssuanceId/evaluate'"), "Endpoint POST '/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/issuance/:activationTokenIssuanceId/decision'"), "Endpoint POST '/decision' missing");
    assert.ok(routerContent.includes("router.post('/issuance/:activationTokenIssuanceId/finalize'"), "Endpoint POST '/finalize' missing");
    console.log('  PASS: All 6 admin router endpoints verified.');

    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenIssuanceClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS client file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    for (const method of ['getTokenIssuanceList', 'getTokenIssuanceDetails', 'createTokenIssuance', 'evaluateTokenIssuance', 'recordDecision', 'finalizeTokenIssuance']) {
      assert.ok(clientContent.includes(method), `Client method '${method}' missing`);
      console.log(`  PASS: Client method '${method}' verified.`);
    }

    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenIssuance.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Phase 160 records issuance metadata only.'), 'Safety banner missing in UI page');
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 160F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 160F:', e.message);
    process.exit(1);
  }
})();
