'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const reviewBuilder = require('../src/api/services/cohortInterventionSimulationReviewBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewBuilderService');
const reviewEvidence = require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService');
const prepBuilder = require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService');
const evaluator = require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvaluatorService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvaluatorService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReviewAndPrep(reviewId, prepId, reviewDecision, simulationType = 'SIMULATE_COHORT_PAUSE') {
  const writeScope = { writes_only_phase142_tables: true, wrote_phase128_to_141_operational_tables: false };
  const reviewRecord = {
    review_id: reviewId,
    source_simulation_id: 'sim_test_c',
    source_execution_id: 'exec_test_c',
    cohort_id: 'cohort_test_c',
    tenant_id: 'tenant_test_c',
    simulation_type: simulationType,
    review_status: 'FINALIZED',
    review_decision: reviewDecision,
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
    source_simulation_hash: 'hash_c',
    source_simulation_evidence_pack_hash: 'ev_hash_c',
    source_execution_evidence_pack_hash: 'exec_ev_hash_c',
    review_result_hash: 'result_hash_c',
    evidence_pack_hash: 'pack_hash_c',
    created_at: new Date(),
    updated_at: new Date()
  };

  const prepRecord = {
    prep_id: prepId,
    source_review_id: reviewId,
    source_simulation_id: 'sim_test_c',
    source_execution_id: 'exec_test_c',
    cohort_id: 'cohort_test_c',
    tenant_id: 'tenant_test_c',
    simulation_type: simulationType,
    prep_status: 'DRAFT',
    prep_outcome: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: null,
    rollback_feasibility_score: null,
    evidence_completeness_score: null,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    prepared_by: null,
    finalized_by: null,
    prep_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: {},
    approval_readiness_json: {},
    prep_blockers_json: { missing_evaluation: true },
    non_execution_attestation_json: {},
    source_review_hash: 'pack_hash_c',
    source_review_evidence_pack_hash: 'pack_hash_c',
    prep_result_hash: null,
    evidence_pack_hash: null,
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    reviewBuilder._mockState.reviews.set(reviewId, reviewRecord);
    reviewEvidence._mockState.evidence.set(reviewId, {
      evidence_pack_hash: 'pack_hash_c',
      evidence_payload_json: { evidence_schema_version: '142.0', write_scope_attestation: writeScope }
    });
    prepBuilder._mockState.preps.set(prepId, prepRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM controlled_beta_cohort_intervention_sim_review_evidence WHERE review_id = ?', [reviewId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_sim_reviews WHERE review_id = ?', [reviewId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_evidence WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_findings WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_preps WHERE prep_id = ?', [prepId]);

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_sim_reviews
       (review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        review_status, review_decision, risk_level, confidence_level, guardrail_status, write_scope_status,
        review_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        write_scope_attestation_json, approval_readiness_json, review_blockers_json, non_execution_attestation_json,
        source_simulation_hash, source_simulation_evidence_pack_hash, source_execution_evidence_pack_hash,
        review_result_hash, evidence_pack_hash)
       VALUES (?, 'sim_test_c', 'exec_test_c', 'cohort_test_c', 'tenant_test_c', ?,
        'FINALIZED', ?, 'LOW', 'HIGH', 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'hash_c', 'ev_hash_c', 'exec_ev_hash_c', 'result_hash_c', 'pack_hash_c')`,
      [reviewId, simulationType, reviewDecision, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_sim_review_evidence
       (evidence_id, review_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '142.0', 'pack_hash_c', ?, '{}')`,
      ['sev_' + reviewId, reviewId, JSON.stringify({ evidence_schema_version: '142.0', write_scope_attestation: writeScope })]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_app_preps
       (prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        prep_status, prep_outcome, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, prep_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        prep_blockers_json, non_execution_attestation_json, source_review_hash, source_review_evidence_pack_hash,
        execution_capability_status, approval_execution_status)
       VALUES (?, ?, 'sim_test_c', 'exec_test_c', 'cohort_test_c', 'tenant_test_c', ?,
        'DRAFT', NULL, 'LOW', 'HIGH', NULL, NULL, NULL, 'PASS', 'PASS', '{}', '{}', '{}', '{}', '{}', '{}', '{"missing_evaluation":true}', '{}', 'pack_hash_c', 'pack_hash_c', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY')`,
      [prepId, reviewId, simulationType]
    );
  }
}

(async () => {
  console.log('=== Smoke 143C: Preparation Evaluator Rules ===\n');

  try {
    // 1. Test Accept Simulation -> Suggest pause approval
    const id1 = 'rev_c_1';
    const prp1 = 'prp_c_1';
    await setupReviewAndPrep(id1, prp1, 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL', 'SIMULATE_COHORT_PAUSE');
    await evaluator.evaluatePrep(prp1, 'admin');
    
    let prepObj = await prepBuilder.getPrep(prp1);
    assert.strictEqual(prepObj.prep_status, 'EVALUATED');
    assert.strictEqual(prepObj.prep_outcome, 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL');
    console.log('  PASS: Suggested decision PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL verified.');

    // 2. Test Reject Simulation -> Suggest Rejection Package
    const id2 = 'rev_c_2';
    const prp2 = 'prp_c_2';
    await setupReviewAndPrep(id2, prp2, 'REJECT_SIMULATION_OUTCOME', 'SIMULATE_COHORT_PAUSE');
    await evaluator.evaluatePrep(prp2, 'admin');

    prepObj = await prepBuilder.getPrep(prp2);
    assert.strictEqual(prepObj.prep_outcome, 'PREPARE_HIGH_RISK_REJECTION_PACKAGE');
    console.log('  PASS: Suggested decision PREPARE_HIGH_RISK_REJECTION_PACKAGE verified.');

    // 3. Test Overrides
    const id3 = 'rev_c_3';
    const prp3 = 'prp_c_3';
    await setupReviewAndPrep(id3, prp3, 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL', 'SIMULATE_COHORT_PAUSE');
    await evaluator.evaluatePrep(prp3, 'admin', {
      prep_outcome: 'PREPARE_HIGH_RISK_RE_SIMULATION_REQUEST',
      projected_impact_score: 99.0
    });

    prepObj = await prepBuilder.getPrep(prp3);
    assert.strictEqual(prepObj.prep_outcome, 'PREPARE_HIGH_RISK_RE_SIMULATION_REQUEST');
    assert.strictEqual(Number(prepObj.projected_impact_score), 99.0);
    console.log('  PASS: Overrides applied correctly.');

    console.log('\nSmoke 143C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 143C:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
