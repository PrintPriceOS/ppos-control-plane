'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const adminRouter = require('../src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationDecisionAdmin');

(async () => {
  console.log('=== Smoke 153F: Admin API & UI Contract Verification ===\n');

  try {
    // 1. Validate Admin API router exists and has routes
    assert.ok(adminRouter, 'Admin router must be imported');
    const routePaths = adminRouter.stack
      .filter(r => r.route)
      .map(r => r.route.path);
    
    const expectedRoutes = [
      '/decision',
      '/decision/:activationDecisionId',
      '/decision/from-lock/:activationLockId',
      '/decision/:activationDecisionId/evaluate',
      '/decision/:activationDecisionId/decision',
      '/decision/:activationDecisionId/finalize'
    ];
    for (const route of expectedRoutes) {
      assert.ok(routePaths.includes(route), `Router missing path: ${route}`);
      console.log(`  PASS: Admin API route mounting registered: ${route}`);
    }

    // 2. Validate client methods in TS source
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionExecutionPlanActivationDecisionClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS client file must exist');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    
    const expectedClientMethods = [
      'getDecisionList',
      'getDecisionDetails',
      'createDecision',
      'evaluateDecision',
      'recordDecision',
      'finalizeDecision'
    ];
    for (const method of expectedClientMethods) {
      assert.ok(clientContent.includes(method), `Client missing method: ${method}`);
      console.log(`  PASS: Client method '${method}' verified in TS source.`);
    }

    // 3. Validate React Manager Page warning headers
    const pagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationDecision.tsx');
    assert.ok(fs.existsSync(pagePath), 'React manager page file must exist');
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    
    assert.ok(
      pageContent.includes('GO DECISION ONLY') ||
      pageContent.includes('FINAL_GO_NO_GO_DECISION_ONLY') ||
      pageContent.includes('Final GO approval does not') ||
      pageContent.includes('does not create jobs'),
      'Warning message must exist on UI page'
    );
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 153F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 153F:', e.message);
    process.exit(1);
  }
})();
