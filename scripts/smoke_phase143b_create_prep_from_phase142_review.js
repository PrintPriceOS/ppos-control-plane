'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const reviewBuilder = require('../src/api/services/cohortInterventionSimulationReviewBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewBuilderService');
const reviewEvidence = require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService');
const prepBuilder = require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReviewFixture(reviewId, status = 'FINALIZED', decision = 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL') {
  const writeScope = { writes_only_phase142_tables: true, wrote_phase128_to_141_operational_tables: false };
  const reviewRecord = {
    review_id: reviewId,
    source_simulation_id: 'sim_test_b',
    source_execution_id: 'exec_test_b',
    cohort_id: 'cohort_test_b',
    tenant_id: 'tenant_test_b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    review_status: status,
    review_decision: decision,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    review_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    approval_readiness_json: {},
    review_blockers_json: {},
    non_execution_attestation_json: {},
    source_simulation_hash: 'hash_b',
    source_simulation_evidence_pack_hash: 'ev_hash_b',
    source_execution_evidence_pack_hash: 'exec_ev_hash_b',
    review_result_hash: 'result_hash_b',
    evidence_pack_hash: 'pack_hash_b',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    reviewBuilder._mockState.reviews.set(reviewId, reviewRecord);
    reviewEvidence._mockState.evidence.set(reviewId, {
      evidence_pack_hash: 'pack_hash_b',
      evidence_payload_json: {
        evidence_schema_version: '142.0',
        write_scope_attestation: writeScope
      }
    });
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM controlled_beta_cohort_intervention_sim_review_evidence WHERE review_id = ?', [reviewId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_sim_reviews WHERE review_id = ?', [reviewId]);

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_sim_reviews
       (review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        review_status, review_decision, risk_level, confidence_level, guardrail_status, write_scope_status,
        review_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        write_scope_attestation_json, approval_readiness_json, review_blockers_json, non_execution_attestation_json,
        source_simulation_hash, source_simulation_evidence_pack_hash, source_execution_evidence_pack_hash,
        review_result_hash, evidence_pack_hash)
       VALUES (?, 'sim_test_b', 'exec_test_b', 'cohort_test_b', 'tenant_test_b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'hash_b', 'ev_hash_b', 'exec_ev_hash_b', 'result_hash_b', 'pack_hash_b')`,
      [reviewId, status, decision, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_sim_review_evidence
       (evidence_id, review_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '142.0', 'pack_hash_b', ?, '{}')`,
      ['sev_' + reviewId, reviewId, JSON.stringify({ evidence_schema_version: '142.0', write_scope_attestation: writeScope })]
    );
  }
  return reviewId;
}

(async () => {
  console.log('=== Smoke 143B: Create Prep from Phase 142 Review ===\n');

  try {
    // 1. Positive: create from finalized review
    const finalizedId = await setupReviewFixture('rev_finalized_143b', 'FINALIZED', 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL');
    const { prep } = await prepBuilder.createPrep(finalizedId, 'admin');
    assert.ok(prep.prep_id, 'prep_id should exist');
    assert.strictEqual(prep.source_review_id, finalizedId);
    assert.strictEqual(prep.prep_status, 'DRAFT');
    console.log('  PASS: Draft preparation created successfully from finalized review.');

    // 2. Negative: block from DRAFT review
    const draftId = await setupReviewFixture('rev_draft_143b', 'DRAFT', null);
    try {
      await prepBuilder.createPrep(draftId, 'admin');
      assert.fail('Should have failed creating prep from DRAFT review');
    } catch (e) {
      if (e.message.includes('PHASE142_REVIEW_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked draft preparation creation from non-finalized review.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 143B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 143B:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
