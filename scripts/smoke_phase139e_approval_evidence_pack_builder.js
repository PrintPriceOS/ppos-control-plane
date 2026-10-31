'use strict';

const builderService = require('../src/api/services/cohortInterventionApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionApprovalBuilderService');
const reviewServicePhase138 = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const reviewDecisionServicePhase137 = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const builderServicePhase138 = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const workflowService = require('../src/api/services/cohortInterventionApprovalWorkflowService').serviceInstance || require('../src/api/services/cohortInterventionApprovalWorkflowService');
const decisionService = require('../src/api/services/cohortInterventionApprovalDecisionService').serviceInstance || require('../src/api/services/cohortInterventionApprovalDecisionService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 139E: Evidence Pack Generation & Hashing ===\n');

  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Setup finalized Phase 137 review
    const tenantId = 'tenant_beta_test_6';
    const cohortId = 'cohort_beta_test_6';
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

    // 3. Create approval package and sign off steps
    const { approval, steps } = await builderService.createApproval(preparation.preparation_id, 'admin');
    for (const step of steps) {
      await workflowService.signStep(approval.approval_id, step.role, 'admin');
    }
    await decisionService.recordDecision(approval.approval_id, 'APPROVE_FOR_FUTURE_EXECUTION', 'Verification audits pass successfully', 'admin');

    // 4. Finalize to compile evidence pack version 139.0
    const { evidence } = await workflowService.finalizeApproval(approval.approval_id, 'admin');

    // 5. Assertions
    if (evidence.evidence_schema_version !== '139.0') {
      console.error(`FAIL: Evidence schema version is ${evidence.evidence_schema_version}, expected 139.0`);
      process.exit(1);
    }
    console.log('  PASS: Evidence schema version matches 139.0.');

    if (!evidence.input_preparation_hash || !evidence.approval_result_hash || !evidence.evidence_pack_hash) {
      console.error('FAIL: Missing required cryptographic hashes.');
      process.exit(1);
    }
    console.log('  PASS: Cryptographic hashes compiled.');

    const data = typeof evidence.evidence_data_json === 'string' ? JSON.parse(evidence.evidence_data_json) : evidence.evidence_data_json;
    if (!data.redaction_proof.database_credentials_redacted || !data.redaction_proof.private_keys_redacted) {
      console.error('FAIL: Redaction hygiene flags not verified.');
      process.exit(1);
    }
    console.log('  PASS: Verified redaction hygiene flags.');

    console.log('\nSmoke 139E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 139E:', e);
    process.exit(1);
  }
})();
