'use strict';

const builderService = require('../src/api/services/cohortInterventionExecutionBuilderService').serviceInstance || require('../src/api/services/cohortInterventionExecutionBuilderService');
const dryRunService = require('../src/api/services/cohortInterventionExecutionDryRunService').serviceInstance || require('../src/api/services/cohortInterventionExecutionDryRunService');
const rollbackService = require('../src/api/services/cohortInterventionExecutionRollbackService').serviceInstance || require('../src/api/services/cohortInterventionExecutionRollbackService');
const operatorConfirmationService = require('../src/api/services/cohortInterventionExecutionOperatorConfirmationService').serviceInstance || require('../src/api/services/cohortInterventionExecutionOperatorConfirmationService');
const runnerService = require('../src/api/services/cohortInterventionExecutionRunnerService').serviceInstance || require('../src/api/services/cohortInterventionExecutionRunnerService');
const workflowServicePhase139 = require('../src/api/services/cohortInterventionApprovalWorkflowService').serviceInstance || require('../src/api/services/cohortInterventionApprovalWorkflowService');
const builderServicePhase139 = require('../src/api/services/cohortInterventionApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionApprovalBuilderService');
const decisionServicePhase139 = require('../src/api/services/cohortInterventionApprovalDecisionService').serviceInstance || require('../src/api/services/cohortInterventionApprovalDecisionService');
const reviewServicePhase138 = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const builderServicePhase138 = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const reviewDecisionServicePhase137 = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 140D: Operator Confirmation and Execution Guardrails Verification ===\n');

  try {
    const tenantId = 'tenant_beta_test_7';
    const cohortId = 'cohort_beta_test_7';
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

    // Attempt to execute immediately (should fail - steps pending)
    try {
      await runnerService.runExecution(execution.execution_id, 'admin');
      console.error('FAIL: Ran execution with missing steps/blockers.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('EXECUTION_GUARDRAILS_FAILED')) {
        console.log('  PASS: Blocked run without dry-run, rollback, or operator confirmation correctly.');
      } else {
        console.error('FAIL: Runner threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    // Try confirm with wrong phrase - should fail
    try {
      await operatorConfirmationService.confirmExecution(execution.execution_id, 'admin', 'Operator Name', 'WRONG_PHRASE');
      console.error('FAIL: Allowed operator confirmation with wrong phrase.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('INVALID_CONFIRMATION_PHRASE')) {
        console.log('  PASS: Rejected incorrect operator confirmation phrase.');
      } else {
        console.error('FAIL: Confirmation threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    console.log('\nSmoke 140D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 140D:', e);
    process.exit(1);
  }
})();
