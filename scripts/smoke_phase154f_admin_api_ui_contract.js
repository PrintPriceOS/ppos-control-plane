'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

(async () => {
  console.log('=== Smoke 154F: Admin API & UI Contract Verification ===\n');

  try {
    // 1. Verify Admin Routing file exists and mounts paths
    const routerPath = path.join(__dirname, '../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationHandoffAdmin.js');
    assert.ok(fs.existsSync(routerPath), 'Handoff admin router file missing');
    
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    assert.ok(routerContent.includes("router.get('/handoff'"), "Endpoint GET '/handoff' missing");
    assert.ok(routerContent.includes("router.get('/handoff/:activationHandoffId'"), "Endpoint GET '/handoff/:activationHandoffId' missing");
    assert.ok(routerContent.includes("router.post('/handoff/from-decision/:activationDecisionId'"), "Endpoint POST '/handoff/from-decision/:activationDecisionId' missing");
    assert.ok(routerContent.includes("router.post('/handoff/:activationHandoffId/evaluate'"), "Endpoint POST '/handoff/:activationHandoffId/evaluate' missing");
    assert.ok(routerContent.includes("router.post('/handoff/:activationHandoffId/decision'"), "Endpoint POST '/handoff/:activationHandoffId/decision' missing");
    assert.ok(routerContent.includes("router.post('/handoff/:activationHandoffId/finalize'"), "Endpoint POST '/handoff/:activationHandoffId/finalize' missing");

    console.log("  PASS: Admin API route mounting registered: /handoff");
    console.log("  PASS: Admin API route mounting registered: /handoff/:activationHandoffId");
    console.log("  PASS: Admin API route mounting registered: /handoff/from-decision/:activationDecisionId");
    console.log("  PASS: Admin API route mounting registered: /handoff/:activationHandoffId/evaluate");
    console.log("  PASS: Admin API route mounting registered: /handoff/:activationHandoffId/decision");
    console.log("  PASS: Admin API route mounting registered: /handoff/:activationHandoffId/finalize");

    // 2. Verify TS Client API wrapper methods
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationHandoffClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS Client wrapper file missing');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    assert.ok(clientContent.includes('getHandoffList'), "Client method 'getHandoffList' missing");
    assert.ok(clientContent.includes('getHandoffDetails'), "Client method 'getHandoffDetails' missing");
    assert.ok(clientContent.includes('createHandoff'), "Client method 'createHandoff' missing");
    assert.ok(clientContent.includes('evaluateHandoff'), "Client method 'evaluateHandoff' missing");
    assert.ok(clientContent.includes('recordDecision'), "Client method 'recordDecision' missing");
    assert.ok(clientContent.includes('finalizeHandoff'), "Client method 'finalizeHandoff' missing");

    console.log("  PASS: Client method 'getHandoffList' verified in TS source.");
    console.log("  PASS: Client method 'getHandoffDetails' verified in TS source.");
    console.log("  PASS: Client method 'createHandoff' verified in TS source.");
    console.log("  PASS: Client method 'evaluateHandoff' verified in TS source.");
    console.log("  PASS: Client method 'recordDecision' verified in TS source.");
    console.log("  PASS: Client method 'finalizeHandoff' verified in TS source.");

    // 3. Verify UI view safety banner text
    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationHandoff.tsx');
    assert.ok(fs.existsSync(uiPagePath), 'UI page file missing');
    const uiContent = fs.readFileSync(uiPagePath, 'utf8');
    assert.ok(uiContent.includes('Activation handoff prepares a non-issued token only.'), 'Safety warn text missing in page view');
    console.log("  PASS: UI Page contains the non-execution warning banner.");

    console.log('\nSmoke 154F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 154F:', e.message);
    process.exit(1);
  }
})();
