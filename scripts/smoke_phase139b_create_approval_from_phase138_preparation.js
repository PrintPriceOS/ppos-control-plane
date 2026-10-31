'use strict';

const builderService = require('../src/api/services/cohortInterventionApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionApprovalBuilderService');
const reviewServicePhase138 = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const reviewDecisionServicePhase137 = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const builderServicePhase138 = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 139B: Create Approval from Phase 138 Preparation Constraints ===\n');

  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Setup finalized Phase 137 review
    const tenantId = 'tenant_beta_test_4';
    const cohortId = 'cohort_beta_test_4';
    const start = new Date(Date.now() - 86400000);
    const end = new Date();

    const { review } = await reviewDecisionServicePhase137.createReview(tenantId, cohortId, start, end);
    await reviewDecisionServicePhase137.evaluateReview(review.review_id);
    await reviewDecisionServicePhase137.finalizeReview(review.review_id, 'admin');

    // 2. Create draft Phase 138 preparation
    const { preparation } = await builderServicePhase138.createPreparation(review.review_id, 'admin');
    console.log(`  Created draft preparation: ${preparation.preparation_id}`);

    // 3. Try to build approval from it - should fail (prep is DRAFT)
    try {
      await builderService.createApproval(preparation.preparation_id, 'admin');
      console.error('FAIL: Allowed approval creation from DRAFT preparation.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('PREPARATION_NOT_FINALIZED_CANNOT_APPROVE')) {
        console.log('  PASS: Blocked approval creation from unfinalized preparation correctly.');
      } else {
        console.error('FAIL: Builder threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    console.log('\nSmoke 139B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 139B:', e);
    process.exit(1);
  }
})();
