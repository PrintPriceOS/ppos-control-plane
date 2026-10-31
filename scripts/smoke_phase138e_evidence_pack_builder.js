'use strict';

const builderService = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const reviewDecisionService = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const reviewService = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 138E: Evidence Pack Generation & Hashing ===\n');

  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Setup a finalized Phase 137 review
    const tenantId = 'tenant_beta_test_3';
    const cohortId = 'cohort_beta_test_3';
    const start = new Date(Date.now() - 86400000);
    const end = new Date();

    const { review } = await reviewDecisionService.createReview(tenantId, cohortId, start, end);
    await reviewDecisionService.evaluateReview(review.review_id);
    await reviewDecisionService.finalizeReview(review.review_id, 'admin');

    // 2. Create preparation package
    const { preparation, items } = await builderService.createPreparation(review.review_id, 'admin');

    // 3. Mark items and approve role
    for (const item of items) {
      await reviewService.updateChecklistItemStatus(preparation.preparation_id, item.item_id, 'COMPLETED', 'admin');
    }
    const currentPrep = await reviewService.getPreparation(preparation.preparation_id);
    let approvals = [];
    if (typeof currentPrep.required_approvals_json === 'string') {
      approvals = JSON.parse(currentPrep.required_approvals_json);
    } else {
      approvals = currentPrep.required_approvals_json || [];
    }
    for (const app of approvals) {
      await reviewService.approveRole(preparation.preparation_id, app.role, 'admin');
    }

    // 4. Finalize to trigger evidence pack compilation
    const { evidence } = await reviewService.finalizePreparation(preparation.preparation_id, 'admin');

    // 5. Assertions
    if (evidence.evidence_schema_version !== '138.0') {
      console.error(`FAIL: Evidence schema version is ${evidence.evidence_schema_version}, expected 138.0`);
      process.exit(1);
    }
    console.log('  PASS: Evidence schema version matches 138.0.');

    if (!evidence.input_review_hash || !evidence.preparation_result_hash || !evidence.evidence_pack_hash) {
      console.error('FAIL: Missing required cryptographic hashes.');
      process.exit(1);
    }
    console.log('  PASS: Cryptographic hashes compiled.');

    const data = typeof evidence.evidence_data_json === 'string' ? JSON.parse(evidence.evidence_data_json) : evidence.evidence_data_json;
    if (!data.redaction_proof.database_credentials_redacted || !data.redaction_proof.private_keys_redacted) {
      console.error('FAIL: Redaction proof flags not verified.');
      process.exit(1);
    }
    console.log('  PASS: Verified redaction hygiene flags.');

    console.log('\nSmoke 138E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 138E:', e);
    process.exit(1);
  }
})();
