'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const adminRouter = require('../src/api/routes/controlledBetaCohortInterventionApprovalAdmin');

(async () => {
  console.log('=== Smoke 144F: Admin API & UI Contract Verification ===\n');

  try {
    // 1. Validate Admin API router exists and has routes
    assert.ok(adminRouter, 'Admin router must be imported');
    const routePaths = adminRouter.stack
      .filter(r => r.route)
      .map(r => r.route.path);
    
    const expectedRoutes = [
      '/approvals',
      '/approvals/:approvalId',
      '/approvals/from-preparation/:prepId',
      '/approvals/:approvalId/evaluate',
      '/approvals/:approvalId/decision',
      '/approvals/:approvalId/finalize'
    ];
    for (const route of expectedRoutes) {
      assert.ok(routePaths.includes(route), `Router missing path: ${route}`);
      console.log(`  PASS: Admin API route mounting registered: ${route}`);
    }

    // 2. Validate client methods in TS source
    const clientPath = path.join(__dirname, '../src/ui/lib/controlledBetaCohortInterventionSimulationApprovalClient.ts');
    assert.ok(fs.existsSync(clientPath), 'TS client file must exist');
    const clientContent = fs.readFileSync(clientPath, 'utf8');
    
    const expectedClientMethods = [
      'getApprovals',
      'getApproval',
      'createApproval',
      'evaluateApproval',
      'recordDecision',
      'finalizeApproval'
    ];
    for (const method of expectedClientMethods) {
      assert.ok(clientContent.includes(method), `Client missing method: ${method}`);
      console.log(`  PASS: Client method '${method}' verified in TS source.`);
    }

    // 3. Validate React Manager Page warning headers
    const pagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionSimulationApproval.tsx');
    assert.ok(fs.existsSync(pagePath), 'React manager page file must exist');
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    
    assert.ok(
      pageContent.includes('SAFE_WORKFLOW_BOUNDARIES_PRESERVED') ||
      pageContent.includes('SAFE_WORKFLOW_BOUNDARY_PRESERVED') ||
      pageContent.includes('SAFE WORKFLOW BOUNDARY PRESERVED') ||
      pageContent.includes('zero runtime mutation') ||
      pageContent.includes('Zero execution capability'),
      'Warning message must exist on UI page'
    );
    console.log('  PASS: UI Page contains the non-execution warning banner.');

    console.log('\nSmoke 144F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 144F:', e.message);
    process.exit(1);
  }
})();
