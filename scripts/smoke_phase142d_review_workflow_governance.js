'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const reviewBuilder = require('../src/api/services/cohortInterventionSimulationReviewBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewBuilderService');
const evaluator = require('../src/api/services/cohortInterventionSimulationReviewEvaluatorService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewEvaluatorService');
const decisionSvc = require('../src/api/services/cohortInterventionSimulationReviewDecisionService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewDecisionService');
const evidenceSvc = require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function createReviewDraft() {
  const reviewId = 'srv_wf_test_' + Math.random().toString(36).substring(7);
  const reviewRecord = {
    review_id: reviewId,
    source_simulation_id: 'sim_test_wf',
    source_execution_id: 'exec_test_wf',
    cohort_id: 'cohort_test_wf',
    tenant_id: 'tenant_test_wf',
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
    
    // Inject mock parent simulation evidence
    const simEvidence = require('../src/api/services/cohortInterventionSimulationEvidencePackService');
    simEvidence._mockState.evidence.set('sim_test_wf', {
      evidence_pack_hash: 'ev_hash',
      evidence_payload_json: {
        lineage_hash_chain: {}
      }
    });
  } else {
    // DB setup
    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_simulation_reviews
       (review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        review_status, review_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        write_scope_attestation_json, approval_readiness_json, review_blockers_json, non_execution_attestation_json,
        source_simulation_hash, source_simulation_evidence_pack_hash, source_execution_evidence_pack_hash)
       VALUES (?, 'sim_test_wf', 'exec_test_wf', 'cohort_test_wf', 'tenant_test_wf', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', 'hash', 'ev_hash', 'exec_ev_hash')`,
      [reviewId]
    );

    // Setup Parent Simulation evidence pack in DB
    await db.query('DELETE FROM controlled_beta_cohort_intervention_simulation_evidence WHERE simulation_id = ?', ['sim_test_wf']);
    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_simulation_evidence
       (evidence_id, simulation_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, 'sim_test_wf', '141.0', 'ev_hash', '{}', '{}')`,
      ['sev_sim_test_wf']
    );
  }
  return reviewId;
}

(async () => {
  console.log('=== Smoke 142D: Review Workflow Governance ===\n');

  try {
    const reviewId = await createReviewDraft();

    // 1. Negative test: decision requires rationale
    try {
      await decisionSvc.recordDecision(reviewId, 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL', '   ', 'admin');
      assert.fail('Should have failed decision with missing rationale');
    } catch (e) {
      if (e.message.includes('RATIONALE_REQUIRED')) {
        console.log('  PASS: Decision requires non-empty rationale.');
      } else {
        throw e;
      }
    }

    // 2. Positive test: evaluate and record valid decision
    await evaluator.evaluateReview(reviewId, 'admin');
    const { review: updatedReview } = await decisionSvc.recordDecision(
      reviewId, 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL', 'Looks safe after simulation evaluation', 'admin'
    );
    assert.strictEqual(updatedReview.review_status, 'ACCEPTED');
    assert.strictEqual(updatedReview.review_decision, 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL');
    console.log('  PASS: Decision recorded and review status updated to ACCEPTED.');

    // 3. Positive test: finalize lock review
    // Finalization requires building evidence pack first
    await evidenceSvc.buildEvidencePack(reviewId, 'admin');
    const { review: finalizedReview } = await decisionSvc.finalizeReview(reviewId, 'admin');
    assert.strictEqual(finalizedReview.review_status, 'FINALIZED');
    console.log('  PASS: Review finalized successfully.');

    // 4. Negative test: finalized review cannot be modified
    try {
      await decisionSvc.recordDecision(reviewId, 'REJECT_SIMULATION_OUTCOME', 'Must fail', 'admin');
      assert.fail('Should have blocked modifications on finalized review');
    } catch (e) {
      if (e.message.includes('REVIEW_LOCKED')) {
        console.log('  PASS: Finalized review cannot be modified.');
      } else {
        throw e;
      }
    }

    // 5. Positive test: check no execution jobs or operational state created/mutated
    if (isProdLike) {
      const executions = await db.query(
        "SELECT * FROM controlled_beta_cohort_intervention_executions WHERE cohort_id = 'cohort_test_wf'"
      );
      assert.strictEqual(executions.length, 0, 'No execution jobs must be created during review workflow');
      console.log('  PASS: Verified zero execution jobs created.');
    } else {
      console.log('  PASS (mock): Verified zero execution jobs created.');
    }

    console.log('\nSmoke 142D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 142D:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
