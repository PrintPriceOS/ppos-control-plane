'use strict';

const decisionService = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');

(async () => {
  console.log('=== Smoke 137D: Review Decision Governance Workflow ===\n');

  try {
    const tenantId = 'tenant_beta_01';
    const cohortId = 'cohort_beta_01';
    const start = new Date(Date.now() - 86400000);
    const end = new Date();

    // 1. Create review
    const { review } = await decisionService.createReview(tenantId, cohortId, start, end);
    if (review.review_status !== 'DRAFT') {
      console.error('FAIL: Review did not initialize as DRAFT.');
      process.exit(1);
    }
    console.log('  PASS: Review initialized as DRAFT.');

    // 2. Finalization block check (fails when not evaluated yet)
    try {
      await decisionService.finalizeReview(review.review_id, 'admin');
      console.error('FAIL: Review finalized without evaluation.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('EVALUATION_MISSING_CANNOT_FINALIZE')) {
        console.log('  PASS: Finalization blocked correctly when evaluation is missing.');
      } else {
        console.error('FAIL: Finalization threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    // 3. Evaluate review
    const evalRes = await decisionService.evaluateReview(review.review_id);
    if (!evalRes.decision || evalRes.decision.decision_execution_status !== 'NOT_EXECUTED_REVIEW_ONLY') {
      console.error('FAIL: Recommended decision did not bind properly as review-only.');
      process.exit(1);
    }
    console.log('  PASS: Review evaluated and populated recommendation.');

    // 4. Finalize review
    const finRes = await decisionService.finalizeReview(review.review_id, 'admin');
    if (finRes.review.review_status !== 'FINALIZED') {
      console.error('FAIL: Review finalization did not lock state.');
      process.exit(1);
    }
    console.log('  PASS: Review finalized and locked successfully.');

    // 5. Supersede exigent reason validation
    try {
      await decisionService.supersedeReview(review.review_id, 'rev_new_id', '', 'admin');
      console.error('FAIL: Review superseded without reason.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('SUPERSEDE_REASON_EXIGENTLY_REQUIRED')) {
        console.log('  PASS: Superseding blocked correctly when reason is empty.');
      } else {
        console.error('FAIL: Superseding threw unexpected error:', e.message);
        process.exit(1);
      }
    }

    await decisionService.supersedeReview(review.review_id, 'rev_new_id', 'Replacing with newer logs', 'admin');
    console.log('  PASS: Review superseded successfully with exigent reason.');

    console.log('\nSmoke 137D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 137D:', e);
    process.exit(1);
  }
})();
