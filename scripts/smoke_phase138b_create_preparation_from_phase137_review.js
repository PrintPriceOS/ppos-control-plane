'use strict';

const builderService = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const reviewDecisionService = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 138B: Create Preparation from Phase 137 Review Constraints ===\n');

  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Create a draft review
    const tenantId = 'tenant_beta_test';
    const cohortId = 'cohort_beta_test';
    const start = new Date(Date.now() - 86400000);
    const end = new Date();

    const { review } = await reviewDecisionService.createReview(tenantId, cohortId, start, end);
    console.log(`  Created draft review: ${review.review_id}`);

    // 2. Attempt to prepare. It should throw since it's DRAFT status (not FINALIZED)
    try {
      await builderService.createPreparation(review.review_id, 'admin');
      console.error('FAIL: Allowed preparation creation from DRAFT review.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('REVIEW_NOT_FINALIZED_CANNOT_PREPARE')) {
        console.log('  PASS: Blocked preparation creation from unfinalized review correctly.');
      } else {
        console.error('FAIL: Builder threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    console.log('\nSmoke 138B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 138B:', e);
    process.exit(1);
  }
})();
