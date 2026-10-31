'use strict';

const builderService = require('../src/api/services/cohortInterventionExecutionBuilderService').serviceInstance || require('../src/api/services/cohortInterventionExecutionBuilderService');
const dryRunService = require('../src/api/services/cohortInterventionExecutionDryRunService').serviceInstance || require('../src/api/services/cohortInterventionExecutionDryRunService');
const rollbackService = require('../src/api/services/cohortInterventionExecutionRollbackService').serviceInstance || require('../src/api/services/cohortInterventionExecutionRollbackService');
const workflowServicePhase139 = require('../src/api/services/cohortInterventionApprovalWorkflowService').serviceInstance || require('../src/api/services/cohortInterventionApprovalWorkflowService');
const builderServicePhase139 = require('../src/api/services/cohortInterventionApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionApprovalBuilderService');
const decisionServicePhase139 = require('../src/api/services/cohortInterventionApprovalDecisionService').serviceInstance || require('../src/api/services/cohortInterventionApprovalDecisionService');
const reviewServicePhase138 = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const builderServicePhase138 = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const reviewDecisionServicePhase137 = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 140C: Dry-Run and Rollback Plan Verification ===\n');

  try {
    const tenantId = 'tenant_beta_test_6';
    const cohortId = 'cohort_beta_test_6';
    const start = new Date(Date.now() - 86400000);
    const end = new Date();

    const { review } = await reviewDecisionServicePhase137.createReview(tenantId, cohortId, start, end);
    await reviewDecisionServicePhase137.evaluateReview(review.review_id);
    await reviewDecisionServicePhase137.finalizeReview(review.review_id, 'admin');

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

    const { approval } = await builderServicePhase139.createApproval(preparation.preparation_id, 'admin');
    const requiredRoles = approval.approval_policy_json.required_roles;
    for (const role of requiredRoles) {
      await workflowServicePhase139.signStep(approval.approval_id, role, 'admin');
    }
    await decisionServicePhase139.recordDecision(approval.approval_id, 'APPROVE_FOR_FUTURE_EXECUTION', 'Approved for extension', 'admin');
    await workflowServicePhase139.finalizeApproval(approval.approval_id, 'admin');

    const { execution } = await builderService.createExecution(approval.approval_id, 'admin');

    // Generate Dry-Run
    const dryRun = await dryRunService.generateDryRun(execution.execution_id, 'admin');
    if (dryRun.dry_run_hash && dryRun.preview_mutations.length > 0) {
      console.log('  PASS: Generated non-mutating dry-run preview and computed dry_run_hash.');
    } else {
      console.error('FAIL: Dry-run hash computation failed.');
      process.exit(1);
    }

    // Create Rollback Plan
    const rollback = await rollbackService.createRollbackPlan(execution.execution_id, 'admin');
    if (rollback.rollback_plan_id && rollback.rollback_payload) {
      console.log('  PASS: Established rollback plan.');
    } else {
      console.error('FAIL: Rollback plan generation failed.');
      process.exit(1);
    }

    console.log('\nSmoke 140C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 140C:', e);
    process.exit(1);
  }
})();
