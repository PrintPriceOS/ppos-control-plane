'use strict';

const builderService = require('../src/api/services/cohortInterventionExecutionBuilderService').serviceInstance || require('../src/api/services/cohortInterventionExecutionBuilderService');
const workflowServicePhase139 = require('../src/api/services/cohortInterventionApprovalWorkflowService').serviceInstance || require('../src/api/services/cohortInterventionApprovalWorkflowService');
const builderServicePhase139 = require('../src/api/services/cohortInterventionApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionApprovalBuilderService');
const decisionServicePhase139 = require('../src/api/services/cohortInterventionApprovalDecisionService').serviceInstance || require('../src/api/services/cohortInterventionApprovalDecisionService');
const reviewServicePhase138 = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const builderServicePhase138 = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const reviewDecisionServicePhase137 = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 140B: Create Execution from Phase 139 Approval Constraints ===\n');

  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Setup finalized Phase 137 review
    const tenantId = 'tenant_beta_test_5';
    const cohortId = 'cohort_beta_test_5';
    const start = new Date(Date.now() - 86400000);
    const end = new Date();

    const { review } = await reviewDecisionServicePhase137.createReview(tenantId, cohortId, start, end);
    await reviewDecisionServicePhase137.evaluateReview(review.review_id);
    await reviewDecisionServicePhase137.finalizeReview(review.review_id, 'admin');

    // 2. Create and finalize Phase 138 preparation (make it observation extension so it fits ALLOWED types)
    const { preparation, items } = await builderServicePhase138.createPreparation(review.review_id, 'admin');
    for (const item of items) {
      await reviewServicePhase138.updateChecklistItemStatus(preparation.preparation_id, item.item_id, 'COMPLETED', 'admin');
    }
    const currentPrep = await reviewServicePhase138.getPreparation(preparation.preparation_id);
    let prepApprovals = [];
    if (typeof currentPrep.required_approvals_json === 'string') {
      prepApprovals = JSON.parse(currentPrep.required_approvals_json);
    } else {
      prepApprovals = currentPrep.required_approvals_json || [];
    }
    for (const app of prepApprovals) {
      await reviewServicePhase138.approveRole(preparation.preparation_id, app.role, 'admin');
    }
    await reviewServicePhase138.finalizePreparation(preparation.preparation_id, 'admin');

    // 3. Create draft Phase 139 approval
    const { approval } = await builderServicePhase139.createApproval(preparation.preparation_id, 'admin');
    console.log(`  Created draft approval: ${approval.approval_id}`);

    // Try to build execution from DRAFT approval - should fail
    try {
      await builderService.createExecution(approval.approval_id, 'admin');
      console.error('FAIL: Allowed execution creation from DRAFT approval.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('APPROVAL_NOT_FINALIZED')) {
        console.log('  PASS: Blocked execution creation from unfinalized approval correctly.');
      } else {
        console.error('FAIL: Builder threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    // Sign steps and finalize approval
    const requiredRoles = approval.approval_policy_json.required_roles;
    for (const role of requiredRoles) {
      await workflowServicePhase139.signStep(approval.approval_id, role, 'admin');
    }
    await decisionServicePhase139.recordDecision(approval.approval_id, 'APPROVE_FOR_FUTURE_EXECUTION', 'Approved for extension', 'admin');
    const finalizeRes = await workflowServicePhase139.finalizeApproval(approval.approval_id, 'admin');

    // Now build execution from finalized approval - should pass
    const { execution } = await builderService.createExecution(approval.approval_id, 'admin');
    console.log(`  Created execution package: ${execution.execution_id}`);
    
    if (execution.lineage_hashes_json.source_approval_hash && execution.lineage_hashes_json.source_preparation_hash) {
      console.log('  PASS: Lineage hashes preserved correctly.');
    } else {
      console.error('FAIL: Lineage hashes missing from execution.');
      process.exit(1);
    }

    console.log('\nSmoke 140B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 140B:', e);
    process.exit(1);
  }
})();
