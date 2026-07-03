'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');


(async () => {
  console.log('=== Smoke 142F: Admin API & UI Contract Verification ===\n');

  try {
    // 1. Verify Admin API Route registration in admin.js
    const adminPath = path.join(__dirname, '../src/api/routes/admin.js');
    assert.ok(fs.existsSync(adminPath), 'admin.js must exist');
    const adminCode = fs.readFileSync(adminPath, 'utf8');

    const hasReviewRoute = adminCode.includes('/beta/cohort-intervention-simulation-reviews');
    assert.ok(hasReviewRoute, 'Simulation review admin sub-router must be registered in admin.js');


    console.log('  PASS: Admin API route mounting registered.');

    // 2. Verify all API Client wrapper methods exist in the TS source code
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionSimulationReviewClient.ts');
    assert.ok(fs.existsSync(clientPath), 'Client TS file must exist');
    const clientCode = fs.readFileSync(clientPath, 'utf8');

    const requiredMethods = [
      'getReviews', 'getReview', 'createReview', 'evaluateReview',
      'recordDecision', 'finalizeReview', 'requestResimulation',
      'escalateReview', 'blockReview', 'rejectReview', 'supersedeReview',
      'getEvidence', 'getReviewSummary', 'getCohortReviewHistory'
    ];
    for (const method of requiredMethods) {
      assert.ok(clientCode.includes(method), `Client method missing in TS file: ${method}`);
      console.log(`  PASS: Client method '${method}' verified in TS source.`);
    }

    // 3. Verify UI Warning Banner text is defined in the source file
    const uiFilePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationReview.tsx');
    assert.ok(fs.existsSync(uiFilePath), 'UI file must exist');
    
    const uiContent = fs.readFileSync(uiFilePath, 'utf8');
    const hasWarningText = uiContent.includes('This review does not execute high-risk intervention');
    assert.ok(hasWarningText, 'UI file must contain the exact non-execution warning text');
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 142F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 142F:', e.message);
    process.exit(1);
  }
})();

