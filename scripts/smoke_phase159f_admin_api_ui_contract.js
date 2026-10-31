'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 159F: Admin API & UI Contract Verification ===\n');

  try {
    // 1. Admin router endpoints
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenPreflightAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Phase 159 admin router file missing');
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/preflight'"), "Endpoint GET '/preflight' missing");
    assert.ok(routerContent.includes("router.get('/preflight/:activationTokenPreflightId'"), "Endpoint GET '/:id' missing");
    assert.ok(routerContent.includes("router.post('/preflight/from-staging/:activationTokenStagingId'"), "Endpoint POST '/from-staging/:id' missing");
    assert.ok(routerContent.includes("router.post('/preflight/:activationTokenPreflightId/evaluate'"), "Endpoint POST '/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/preflight/:activationTokenPreflightId/decision'"), "Endpoint POST '/decision' missing");
    assert.ok(routerContent.includes("router.post('/preflight/:activationTokenPreflightId/finalize'"), "Endpoint POST '/finalize' missing");
    console.log('  PASS: All 6 admin router endpoints verified.');

    // 2. TS Client methods
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenPreflightClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS client file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    for (const method of ['getTokenPreflightList', 'getTokenPreflightDetails', 'createTokenPreflight', 'evaluateTokenPreflight', 'recordDecision', 'finalizeTokenPreflight']) {
      assert.ok(clientContent.includes(method), `Client method '${method}' missing`);
      console.log(`  PASS: Client method '${method}' verified.`);
    }

    // 3. UI page safety banner
    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenPreflight.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Token issuance preflight does not issue the token.'), 'Safety banner missing in UI page');
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 159F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 159F:', e.message);
    process.exit(1);
  }
})();
