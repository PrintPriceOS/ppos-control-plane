'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 155F: Admin API & UI Contract Verification ===\n');

  try {
    // 1. Verify Admin Routing file exists and mounts paths
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenAuthAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Token auth admin router file missing');
    
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/auth'"), "Endpoint GET '/auth' missing");
    assert.ok(routerContent.includes("router.get('/auth/:activationTokenAuthId'"), "Endpoint GET '/auth/:activationTokenAuthId' missing");
    assert.ok(routerContent.includes("router.post('/auth/from-handoff/:activationHandoffId'"), "Endpoint POST '/auth/from-handoff/:activationHandoffId' missing");
    assert.ok(routerContent.includes("router.post('/auth/:activationTokenAuthId/evaluate'"), "Endpoint POST '/auth/:activationTokenAuthId/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/auth/:activationTokenAuthId/decision'"), "Endpoint POST '/auth/:activationTokenAuthId/decision' missing");
    assert.ok(routerContent.includes("router.post('/auth/:activationTokenAuthId/finalize'"), "Endpoint POST '/auth/:activationTokenAuthId/finalize' missing");

    console.log("  PASS: Admin API route mounting registered: /auth");
    console.log("  PASS: Admin API route mounting registered: /auth/:activationTokenAuthId");
    console.log("  PASS: Admin API route mounting registered: /auth/from-handoff/:activationHandoffId");
    console.log("  PASS: Admin API route mounting registered: /auth/:activationTokenAuthId/evaluate");
    console.log("  PASS: Admin API route mounting registered: /auth/:activationTokenAuthId/decision");
    console.log("  PASS: Admin API route mounting registered: /auth/:activationTokenAuthId/finalize");

    // 2. Verify TS Client API wrapper methods
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationTokenAuthClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS Client wrapper file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    assert.ok(clientContent.includes('getTokenAuthList'), "Client method 'getTokenAuthList' missing");
    assert.ok(clientContent.includes('getTokenAuthDetails'), "Client method 'getTokenAuthDetails' missing");
    assert.ok(clientContent.includes('createTokenAuth'), "Client method 'createTokenAuth' missing");
    assert.ok(clientContent.includes('evaluateTokenAuth'), "Client method 'evaluateTokenAuth' missing");
    assert.ok(clientContent.includes('recordDecision'), "Client method 'recordDecision' missing");
    assert.ok(clientContent.includes('finalizeTokenAuth'), "Client method 'finalizeTokenAuth' missing");

    console.log("  PASS: Client method 'getTokenAuthList' verified in TS source.");
    console.log("  PASS: Client method 'getTokenAuthDetails' verified in TS source.");
    console.log("  PASS: Client method 'createTokenAuth' verified in TS source.");
    console.log("  PASS: Client method 'evaluateTokenAuth' verified in TS source.");
    console.log("  PASS: Client method 'recordDecision' verified in TS source.");
    console.log("  PASS: Client method 'finalizeTokenAuth' verified in TS source.");

    // 3. Verify UI view safety banner text
    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenAuth.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Token issuance authorization does not issue the token.'), 'Safety warn text missing in page view');
    console.log("  PASS: UI Page contains the non-execution warning banner.");

    console.log('\nSmoke 155F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 155F:', e.message);
    process.exit(1);
  }
})();
