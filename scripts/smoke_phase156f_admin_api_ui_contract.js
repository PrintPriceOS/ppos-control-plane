'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 156F: Admin API & UI Contract Verification ===\n');

  try {
    // 1. Verify Admin Routing file exists and mounts paths
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenEnvAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Token env admin router file missing');
    
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/env'"), "Endpoint GET '/env' missing");
    assert.ok(routerContent.includes("router.get('/env/:activationTokenEnvId'"), "Endpoint GET '/env/:activationTokenEnvId' missing");
    assert.ok(routerContent.includes("router.post('/env/from-token-auth/:activationTokenAuthId'"), "Endpoint POST '/env/from-token-auth/:activationTokenAuthId' missing");
    assert.ok(routerContent.includes("router.post('/env/:activationTokenEnvId/evaluate'"), "Endpoint POST '/env/:activationTokenEnvId/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/env/:activationTokenEnvId/decision'"), "Endpoint POST '/env/:activationTokenEnvId/decision' missing");
    assert.ok(routerContent.includes("router.post('/env/:activationTokenEnvId/finalize'"), "Endpoint POST '/env/:activationTokenEnvId/finalize' missing");

    console.log("  PASS: Admin API route mounting registered: /env");
    console.log("  PASS: Admin API route mounting registered: /env/:activationTokenEnvId");
    console.log("  PASS: Admin API route mounting registered: /env/from-token-auth/:activationTokenAuthId");
    console.log("  PASS: Admin API route mounting registered: /env/:activationTokenEnvId/evaluate");
    console.log("  PASS: Admin API route mounting registered: /env/:activationTokenEnvId/decision");
    console.log("  PASS: Admin API route mounting registered: /env/:activationTokenEnvId/finalize");

    // 2. Verify TS Client API wrapper methods
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS Client wrapper file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    assert.ok(clientContent.includes('getTokenEnvList'), "Client method 'getTokenEnvList' missing");
    assert.ok(clientContent.includes('getTokenEnvDetails'), "Client method 'getTokenEnvDetails' missing");
    assert.ok(clientContent.includes('createTokenEnv'), "Client method 'createTokenEnv' missing");
    assert.ok(clientContent.includes('evaluateTokenEnv'), "Client method 'evaluateTokenEnv' missing");
    assert.ok(clientContent.includes('recordDecision'), "Client method 'recordDecision' missing");
    assert.ok(clientContent.includes('finalizeTokenEnv'), "Client method 'finalizeTokenEnv' missing");

    console.log("  PASS: Client method 'getTokenEnvList' verified in TS source.");
    console.log("  PASS: Client method 'getTokenEnvDetails' verified in TS source.");
    console.log("  PASS: Client method 'createTokenEnv' verified in TS source.");
    console.log("  PASS: Client method 'evaluateTokenEnv' verified in TS source.");
    console.log("  PASS: Client method 'recordDecision' verified in TS source.");
    console.log("  PASS: Client method 'finalizeTokenEnv' verified in TS source.");

    // 3. Verify UI view safety banner text
    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenEnv.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Token issuance envelope preparation does not issue the token.'), 'Safety warn text missing in page view');
    console.log("  PASS: UI Page contains the non-execution warning banner.");

    console.log('\nSmoke 156F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 156F:', e.message);
    process.exit(1);
  }
})();
