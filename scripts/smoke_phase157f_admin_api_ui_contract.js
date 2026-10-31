'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 157F: Admin API & UI Contract Verification ===\n');

  try {
    // 1. Verify Admin Routing file exists and mounts paths
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenFinalApvAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Token final approval admin router file missing');
    
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/apv'"), "Endpoint GET '/apv' missing");
    assert.ok(routerContent.includes("router.get('/apv/:activationTokenFinalApvId'"), "Endpoint GET '/apv/:activationTokenFinalApvId' missing");
    assert.ok(routerContent.includes("router.post('/apv/from-token-env/:activationTokenEnvId'"), "Endpoint POST '/apv/from-token-env/:activationTokenEnvId' missing");
    assert.ok(routerContent.includes("router.post('/apv/:activationTokenFinalApvId/evaluate'"), "Endpoint POST '/apv/:activationTokenFinalApvId/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/apv/:activationTokenFinalApvId/decision'"), "Endpoint POST '/apv/:activationTokenFinalApvId/decision' missing");
    assert.ok(routerContent.includes("router.post('/apv/:activationTokenFinalApvId/finalize'"), "Endpoint POST '/apv/:activationTokenFinalApvId/finalize' missing");

    console.log("  PASS: Admin API route mounting registered: /apv");
    console.log("  PASS: Admin API route mounting registered: /apv/:activationTokenFinalApvId");
    console.log("  PASS: Admin API route mounting registered: /apv/from-token-env/:activationTokenEnvId");
    console.log("  PASS: Admin API route mounting registered: /apv/:activationTokenFinalApvId/evaluate");
    console.log("  PASS: Admin API route mounting registered: /apv/:activationTokenFinalApvId/decision");
    console.log("  PASS: Admin API route mounting registered: /apv/:activationTokenFinalApvId/finalize");

    // 2. Verify TS Client API wrapper methods
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenFinalApvClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS Client wrapper file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    assert.ok(clientContent.includes('getTokenFinalApvList'), "Client method 'getTokenFinalApvList' missing");
    assert.ok(clientContent.includes('getTokenFinalApvDetails'), "Client method 'getTokenFinalApvDetails' missing");
    assert.ok(clientContent.includes('createTokenFinalApv'), "Client method 'createTokenFinalApv' missing");
    assert.ok(clientContent.includes('evaluateTokenFinalApv'), "Client method 'evaluateTokenFinalApv' missing");
    assert.ok(clientContent.includes('recordDecision'), "Client method 'recordDecision' missing");
    assert.ok(clientContent.includes('finalizeTokenFinalApv'), "Client method 'finalizeTokenFinalApv' missing");

    console.log("  PASS: Client method 'getTokenFinalApvList' verified in TS source.");
    console.log("  PASS: Client method 'getTokenFinalApvDetails' verified in TS source.");
    console.log("  PASS: Client method 'createTokenFinalApv' verified in TS source.");
    console.log("  PASS: Client method 'evaluateTokenFinalApv' verified in TS source.");
    console.log("  PASS: Client method 'recordDecision' verified in TS source.");
    console.log("  PASS: Client method 'finalizeTokenFinalApv' verified in TS source.");

    // 3. Verify UI view safety banner text
    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenFinalApv.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Token final issuance approval does not issue the token.'), 'Safety warn text missing in page view');
    console.log("  PASS: UI Page contains the non-execution warning banner.");

    console.log('\nSmoke 157F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 157F:', e.message);
    process.exit(1);
  }
})();
