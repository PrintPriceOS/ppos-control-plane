'use strict';

const builderService = require('../src/api/services/cohortInterventionExecutionBuilderService').serviceInstance || require('../src/api/services/cohortInterventionExecutionBuilderService');
const dryRunService = require('../src/api/services/cohortInterventionExecutionDryRunService').serviceInstance || require('../src/api/services/cohortInterventionExecutionDryRunService');
const rollbackService = require('../src/api/services/cohortInterventionExecutionRollbackService').serviceInstance || require('../src/api/services/cohortInterventionExecutionRollbackService');
const operatorConfirmationService = require('../src/api/services/cohortInterventionExecutionOperatorConfirmationService').serviceInstance || require('../src/api/services/cohortInterventionExecutionOperatorConfirmationService');
const runnerService = require('../src/api/services/cohortInterventionExecutionRunnerService').serviceInstance || require('../src/api/services/cohortInterventionExecutionRunnerService');
const evidenceService = require('../src/api/services/cohortInterventionExecutionEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionExecutionEvidencePackService');
const workflowServicePhase139 = require('../src/api/services/cohortInterventionApprovalWorkflowService').serviceInstance || require('../src/api/services/cohortInterventionApprovalWorkflowService');
const builderServicePhase139 = require('../src/api/services/cohortInterventionApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionApprovalBuilderService');
const decisionServicePhase139 = require('../src/api/services/cohortInterventionApprovalDecisionService').serviceInstance || require('../src/api/services/cohortInterventionApprovalDecisionService');
const reviewServicePhase138 = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const builderServicePhase138 = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const reviewDecisionServicePhase137 = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 140F: Execution Evidence Pack Builder Verification ===\n');

  try {
    const tenantId = 'tenant_beta_test_9';
    const cohortId = 'cohort_beta_test_9';
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

    await dryRunService.generateDryRun(execution.execution_id, 'admin');
    await rollbackService.createRollbackPlan(execution.execution_id, 'admin');
    await operatorConfirmationService.confirmExecution(execution.execution_id, 'admin', 'Operator Signature Name', 'CONFIRM_PHASE_140_CONTROLLED_EXECUTION');

    await runnerService.runExecution(execution.execution_id, 'admin');

    const ev = await evidenceService.getEvidencePack(execution.execution_id);
    if (!ev) {
      console.error('FAIL: Evidence pack record not found.');
      process.exit(1);
    }

    if (ev.evidence_schema_version === '140.0' && ev.evidence_pack_hash) {
      console.log('  PASS: Evidence pack v140.0 compiled successfully.');
    } else {
      console.error('FAIL: Evidence pack schema or hash is invalid.');
      process.exit(1);
    }

    // Verify redaction
    const payloadString = JSON.stringify(ev.evidence_data_json);
    const mockStringWithSecrets = JSON.stringify({ password: 'secretpassword123', token: 'sometokendetails' });
    const redacted = evidenceService.redactSecrets(mockStringWithSecrets);
    if (redacted.includes('secretpassword123') || redacted.includes('sometokendetails')) {
      console.error('FAIL: Sensitive data was not redacted.');
      process.exit(1);
    }
    console.log('  PASS: Redaction mechanism verified.');

    console.log('\nSmoke 140F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 140F:', e);
    process.exit(1);
  }
})();
