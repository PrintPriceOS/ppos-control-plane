'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const reviewBuilder = require('../src/api/services/cohortInterventionSimulationReviewBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewBuilderService');
const evaluator = require('../src/api/services/cohortInterventionSimulationReviewEvaluatorService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewEvaluatorService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function createReviewDraft() {
  const reviewId = 'srv_eval_test_' + Math.random().toString(36).substring(7);
  const reviewRecord = {
    review_id: reviewId,
    source_simulation_id: 'sim_test',
    source_execution_id: 'exec_test',
    cohort_id: 'cohort_test',
    tenant_id: 'tenant_test',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    review_status: 'DRAFT',
    review_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: {},
    approval_readiness_json: {},
    review_blockers_json: {},
    non_execution_attestation_json: {},
    source_simulation_hash: 'hash',
    source_simulation_evidence_pack_hash: 'ev_hash',
    source_execution_evidence_pack_hash: 'exec_ev_hash',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    reviewBuilder._mockState.reviews.set(reviewId, reviewRecord);
  } else {
    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_simulation_reviews
       (review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        review_status, review_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        write_scope_attestation_json, approval_readiness_json, review_blockers_json, non_execution_attestation_json,
        source_simulation_hash, source_simulation_evidence_pack_hash, source_execution_evidence_pack_hash)
       VALUES (?, 'sim_test', 'exec_test', 'cohort_test', 'tenant_test', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', 'hash', 'ev_hash', 'exec_ev_hash')`,
      [reviewId]
    );
  }
  return reviewId;
}

(async () => {
  console.log('=== Smoke 142C: Review Evaluator Decision Rules ===\n');

  try {
    // 1. Test ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL
    const id1 = await createReviewDraft();
    const res1 = await evaluator.evaluateReview(id1, 'admin', {
      projected_impact_score: 20.0,
      rollback_feasibility_score: 85.0,
      evidence_completeness_score: 95.0,
      guardrail_status: 'PASS',
      write_scope_status: 'PASS'
    });
    assert.strictEqual(res1.review.review_summary_json.suggested_decision, 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL');
    console.log('  PASS: Suggested decision ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL verified.');

    // 2. Test BLOCK_HIGH_RISK_EXECUTION_PATH (guardrail fail)
    const id2 = await createReviewDraft();
    const res2 = await evaluator.evaluateReview(id2, 'admin', {
      guardrail_status: 'FAIL'
    });
    assert.strictEqual(res2.review.review_summary_json.suggested_decision, 'BLOCK_HIGH_RISK_EXECUTION_PATH');
    console.log('  PASS: Suggested decision BLOCK_HIGH_RISK_EXECUTION_PATH verified.');

    // 3. Test REJECT_SIMULATION_OUTCOME (high impact / low rollback)
    const id3 = await createReviewDraft();
    const res3 = await evaluator.evaluateReview(id3, 'admin', {
      projected_impact_score: 90.0
    });
    assert.strictEqual(res3.review.review_summary_json.suggested_decision, 'REJECT_SIMULATION_OUTCOME');
    console.log('  PASS: Suggested decision REJECT_SIMULATION_OUTCOME verified.');

    // 4. Test REQUEST_RE_SIMULATION (low evidence completeness)
    const id4 = await createReviewDraft();
    const res4 = await evaluator.evaluateReview(id4, 'admin', {
      evidence_completeness_score: 30.0
    });
    assert.strictEqual(res4.review.review_summary_json.suggested_decision, 'REQUEST_RE_SIMULATION');
    console.log('  PASS: Suggested decision REQUEST_RE_SIMULATION verified.');

    // 5. Test ESCALATE_TO_GOVERNANCE_OWNER (controlled expansion with high risk)
    const id5 = await createReviewDraft();
    if (!isProdLike) {
      reviewBuilder._mockState.reviews.get(id5).simulation_type = 'SIMULATE_CONTROLLED_EXPANSION';
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_simulation_reviews SET simulation_type = 'SIMULATE_CONTROLLED_EXPANSION' WHERE review_id = ?",
        [id5]
      );
    }
    const res5 = await evaluator.evaluateReview(id5, 'admin', {
      risk_level: 'HIGH'
    });
    assert.strictEqual(res5.review.review_summary_json.suggested_decision, 'ESCALATE_TO_GOVERNANCE_OWNER');
    console.log('  PASS: Suggested decision ESCALATE_TO_GOVERNANCE_OWNER verified.');

    console.log('\nSmoke 142C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 142C:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
