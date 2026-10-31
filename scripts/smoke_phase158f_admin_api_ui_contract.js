'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 158F: Admin API & UI Contract Verification ===\n');

  try {
    // 1. Verify Admin Routing file exists and mounts paths
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenStagingAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Token staging admin router file missing');
    
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/staging'"), "Endpoint GET '/staging' missing");
    assert.ok(routerContent.includes("router.get('/staging/:activationTokenStagingId'"), "Endpoint GET '/staging/:activationTokenStagingId' missing");
    assert.ok(routerContent.includes("router.post('/staging/from-final-apv/:activationTokenFinalApvId'"), "Endpoint POST '/staging/from-final-apv/:activationTokenFinalApvId' missing");
    assert.ok(routerContent.includes("router.post('/staging/:activationTokenStagingId/evaluate'"), "Endpoint POST '/staging/:activationTokenStagingId/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/staging/:activationTokenStagingId/decision'"), "Endpoint POST '/staging/:activationTokenStagingId/decision' missing");
    assert.ok(routerContent.includes("router.post('/staging/:activationTokenStagingId/finalize'"), "Endpoint POST '/staging/:activationTokenStagingId/finalize' missing");

    console.log("  PASS: Admin API route mounting registered: /staging");
    console.log("  PASS: Admin API route mounting registered: /staging/:activationTokenStagingId");
    console.log("  PASS: Admin API route mounting registered: /staging/from-final-apv/:activationTokenFinalApvId");
    console.log("  PASS: Admin API route mounting registered: /staging/:activationTokenStagingId/evaluate");
    console.log("  PASS: Admin API route mounting registered: /staging/:activationTokenStagingId/decision");
    console.log("  PASS: Admin API route mounting registered: /staging/:activationTokenStagingId/finalize");

    // 2. Verify TS Client API wrapper methods
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenStagingClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS Client wrapper file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    assert.ok(clientContent.includes('getTokenStagingList'), "Client method 'getTokenStagingList' missing");
    assert.ok(clientContent.includes('getTokenStagingDetails'), "Client method 'getTokenStagingDetails' missing");
    assert.ok(clientContent.includes('createTokenStaging'), "Client method 'createTokenStaging' missing");
    assert.ok(clientContent.includes('evaluateTokenStaging'), "Client method 'evaluateTokenStaging' missing");
    assert.ok(clientContent.includes('recordDecision'), "Client method 'recordDecision' missing");
    assert.ok(clientContent.includes('finalizeTokenStaging'), "Client method 'finalizeTokenStaging' missing");

    console.log("  PASS: Client method 'getTokenStagingList' verified in TS source.");
    console.log("  PASS: Client method 'getTokenStagingDetails' verified in TS source.");
    console.log("  PASS: Client method 'createTokenStaging' verified in TS source.");
    console.log("  PASS: Client method 'evaluateTokenStaging' verified in TS source.");
    console.log("  PASS: Client method 'recordDecision' verified in TS source.");
    console.log("  PASS: Client method 'finalizeTokenStaging' verified in TS source.");

    // 3. Verify UI view safety banner text
    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenStaging.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Token staging does not issue the token.'), 'Safety warn text missing in page view');
    console.log("  PASS: UI Page contains the non-execution warning banner.");

    console.log('\nSmoke 158F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 158F:', e.message);
    process.exit(1);
  }
})();
