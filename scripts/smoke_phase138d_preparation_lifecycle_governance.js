'use strict';

const builderService = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const reviewDecisionService = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const reviewService = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 138D: Preparation Lifecycle and Safety Governance ===\n');

  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Setup a finalized Phase 137 review
    const tenantId = 'tenant_beta_test_2';
    const cohortId = 'cohort_beta_test_2';
    const start = new Date(Date.now() - 86400000);
    const end = new Date();

    const { review } = await reviewDecisionService.createReview(tenantId, cohortId, start, end);
    await reviewDecisionService.evaluateReview(review.review_id);
    await reviewDecisionService.finalizeReview(review.review_id, 'admin');

    // 2. Create preparation package from finalized review
    const { preparation, items } = await builderService.createPreparation(review.review_id, 'admin');
    if (preparation.preparation_status !== 'DRAFT') {
      console.error('FAIL: Preparation did not initialize as DRAFT.');
      process.exit(1);
    }
    console.log('  PASS: Preparation initialized as DRAFT.');

    // 3. Attempt to finalize without signing off approvals. It should throw and log blockers
    try {
      await reviewService.finalizePreparation(preparation.preparation_id, 'admin');
      console.error('FAIL: Allowed finalization without required approvals.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('PREPARATION_FINALIZATION_BLOCKED')) {
        console.log('  PASS: Finalization blocked correctly on pending approvals.');
      } else {
        console.error('FAIL: Finalization threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    // 4. Update checklist items and sign off required approvals
    for (const item of items) {
      await reviewService.updateChecklistItemStatus(preparation.preparation_id, item.item_id, 'COMPLETED', 'admin');
    }
    console.log('  PASS: Checklist items checked off.');

    // Fetch approvals
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
    console.log('  PASS: Required roles signed off.');

    // 5. Finalize preparation
    const finPrepRes = await reviewService.finalizePreparation(preparation.preparation_id, 'admin');
    if (finPrepRes.preparation.preparation_status !== 'FINALIZED') {
      console.error('FAIL: Preparation did not transition to FINALIZED.');
      process.exit(1);
    }
    console.log('  PASS: Preparation finalized successfully.');

    // 6. Safety boundary verification: Finalized does NOT execute mutation
    if (finPrepRes.preparation.preparation_execution_status !== 'NOT_EXECUTED_PREPARATION_ONLY') {
      console.error('FAIL: Preparation changed execution status.');
      process.exit(1);
    }
    console.log('  PASS: Verified preparation execution status is strictly NOT_EXECUTED_PREPARATION_ONLY.');

    // 7. Verify reject constraints
    const { review: review3 } = await reviewDecisionService.createReview(tenantId, cohortId, start, end);
    await reviewDecisionService.evaluateReview(review3.review_id);
    await reviewDecisionService.finalizeReview(review3.review_id, 'admin');
    const { preparation: prep3 } = await builderService.createPreparation(review3.review_id, 'admin');

    try {
      await reviewService.rejectPreparation(prep3.preparation_id, '', 'admin');
      console.error('FAIL: Rejection succeeded without reason.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('REJECTION_REASON_EXIGENTLY_REQUIRED')) {
        console.log('  PASS: Rejection blocked correctly when reason is empty.');
      } else {
        console.error('FAIL: Rejection threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    await reviewService.rejectPreparation(prep3.preparation_id, 'Rejected due to telemetry deviation', 'admin');
    console.log('  PASS: Rejection completed successfully with reason.');

    // 8. Verify supersede constraints
    const { review: review4 } = await reviewDecisionService.createReview(tenantId, cohortId, start, end);
    await reviewDecisionService.evaluateReview(review4.review_id);
    await reviewDecisionService.finalizeReview(review4.review_id, 'admin');
    const { preparation: prep4 } = await builderService.createPreparation(review4.review_id, 'admin');

    try {
      await reviewService.supersedePreparation(prep4.preparation_id, 'prp_new_id', '', 'admin');
      console.error('FAIL: Supersede succeeded without reason.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('SUPERSEDE_REASON_EXIGENTLY_REQUIRED')) {
        console.log('  PASS: Superseding blocked correctly when reason is empty.');
      } else {
        console.error('FAIL: Superseding threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    await reviewService.supersedePreparation(prep4.preparation_id, 'prp_new_id', 'Superseding with newer logs', 'admin');
    console.log('  PASS: Superseding completed successfully with reason.');

    console.log('\nSmoke 138D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 138D:', e);
    process.exit(1);
  }
})();
