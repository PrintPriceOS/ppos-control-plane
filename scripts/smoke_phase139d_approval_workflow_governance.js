'use strict';

const builderService = require('../src/api/services/cohortInterventionApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionApprovalBuilderService');
const reviewServicePhase138 = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const reviewDecisionServicePhase137 = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const builderServicePhase138 = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const workflowService = require('../src/api/services/cohortInterventionApprovalWorkflowService').serviceInstance || require('../src/api/services/cohortInterventionApprovalWorkflowService');
const decisionService = require('../src/api/services/cohortInterventionApprovalDecisionService').serviceInstance || require('../src/api/services/cohortInterventionApprovalDecisionService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 139D: Approval Workflow Lifecycle & Safety Governance ===\n');

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

    // 2. Setup finalized Phase 138 prep
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

    // 3. Create approval package
    const { approval, steps } = await builderService.createApproval(preparation.preparation_id, 'admin');
    if (approval.approval_status !== 'DRAFT') {
      console.error('FAIL: Approval did not initialize as DRAFT.');
      process.exit(1);
    }
    console.log('  PASS: Approval initialized as DRAFT.');

    // 4. Try to finalize without signatures. Should throw blocker
    try {
      await workflowService.finalizeApproval(approval.approval_id, 'admin');
      console.error('FAIL: Finalized without required role signatures.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('APPROVAL_FINALIZATION_BLOCKED')) {
        console.log('  PASS: Blocked finalization correctly when signatures are missing.');
      } else {
        console.error('FAIL: Workflow threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    // 5. Try to record decision without rationale. Should throw rationale required
    try {
      await decisionService.recordDecision(approval.approval_id, 'APPROVE_FOR_FUTURE_EXECUTION', '', 'admin');
      console.error('FAIL: Recorded decision with empty rationale.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('DECISION_RATIONALE_REQUIRED')) {
        console.log('  PASS: Blocked decision when rationale is empty.');
      } else {
        console.error('FAIL: Decision threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    // 6. Sign off all steps and record decision
    for (const step of steps) {
      await workflowService.signStep(approval.approval_id, step.role, 'admin');
    }
    await decisionService.recordDecision(approval.approval_id, 'APPROVE_FOR_FUTURE_EXECUTION', 'Intervention criteria met, logs verified', 'admin');
    console.log('  PASS: Role signatures and decision rationale submitted.');

    // 7. Finalize approval
    const finRes = await workflowService.finalizeApproval(approval.approval_id, 'admin');
    if (finRes.approval.approval_status !== 'FINALIZED') {
      console.error('FAIL: Approval status is not FINALIZED after successful finalization.');
      process.exit(1);
    }
    console.log('  PASS: Approval finalized successfully.');

    // 8. Safety check: Finalized approved does NOT change execution bounds
    if (finRes.approval.non_execution_attestation_json.approval_executed_intervention !== false || finRes.approval.non_execution_attestation_json.execution_job_created !== false) {
      console.error('FAIL: Safety attestation flags are violated.');
      process.exit(1);
    }
    console.log('  PASS: Verified safety attestation remains false for execution indicators.');

    // 9. Rejections & change requests reasons verification
    const { approval: approval4 } = await builderService.createApproval(preparation.preparation_id, 'admin');
    try {
      await workflowService.rejectApproval(approval4.approval_id, '', 'admin');
      console.error('FAIL: Allowed reject without reason.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('REJECTION_REASON_EXIGENTLY_REQUIRED')) {
        console.log('  PASS: Blocked reject when reason is empty.');
      } else {
        console.error('FAIL: Reject threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    await workflowService.rejectApproval(approval4.approval_id, 'Fails audit compliance', 'admin');
    console.log('  PASS: Rejected approval successfully with reason.');

    // 10. Supersede reason verification
    const { approval: approval5 } = await builderService.createApproval(preparation.preparation_id, 'admin');
    try {
      await workflowService.supersedeApproval(approval5.approval_id, 'apv_new_id', '', 'admin');
      console.error('FAIL: Allowed supersede without reason.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('SUPERSEDE_REASON_EXIGENTLY_REQUIRED')) {
        console.log('  PASS: Blocked supersede when reason is empty.');
      } else {
        console.error('FAIL: Supersede threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    await workflowService.supersedeApproval(approval5.approval_id, 'apv_new_id', 'Superseding with newer review', 'admin');
    console.log('  PASS: Superseded approval successfully with reason.');

    console.log('\nSmoke 139D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 139D:', e);
    process.exit(1);
  }
})();
