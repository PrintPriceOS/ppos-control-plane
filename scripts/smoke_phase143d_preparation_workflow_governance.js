'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const reviewBuilder = require('../src/api/services/cohortInterventionSimulationReviewBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewBuilderService');
const reviewEvidence = require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService');
const prepBuilder = require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService');
const evaluator = require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvaluatorService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvaluatorService');
const decision = require('../src/api/services/cohortInterventionSimulationApprovalPreparationDecisionService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationDecisionService');
const evidence = require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvidencePackService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReviewAndPrep(reviewId, prepId, reviewDecision) {
  const writeScope = { writes_only_phase142_tables: true, wrote_phase128_to_141_operational_tables: false };
  const writeScope143 = { writes_only_phase143_tables: true, wrote_phase128_to_142_operational_tables: false };
  const reviewRecord = {
    review_id: reviewId,
    source_simulation_id: 'sim_test_d',
    source_execution_id: 'exec_test_d',
    cohort_id: 'cohort_test_d',
    tenant_id: 'tenant_test_d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
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
    source_simulation_hash: 'hash_d',
    source_simulation_evidence_pack_hash: 'ev_hash_d',
    source_execution_evidence_pack_hash: 'exec_ev_hash_d',
    review_result_hash: 'result_hash_d',
    evidence_pack_hash: 'pack_hash_d',
    created_at: new Date(),
    updated_at: new Date()
  };

  const prepRecord = {
    prep_id: prepId,
    source_review_id: reviewId,
    source_simulation_id: 'sim_test_d',
    source_execution_id: 'exec_test_d',
    cohort_id: 'cohort_test_d',
    tenant_id: 'tenant_test_d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
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
    write_scope_attestation_json: writeScope143,
    approval_readiness_json: {},
    prep_blockers_json: { missing_evaluation: true },
    non_execution_attestation_json: {},
    source_review_hash: 'pack_hash_d',
    source_review_evidence_pack_hash: 'pack_hash_d',
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
      evidence_pack_hash: 'pack_hash_d',
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
       VALUES (?, 'sim_test_d', 'exec_test_d', 'cohort_test_d', 'tenant_test_d', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', ?, 'LOW', 'HIGH', 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'hash_d', 'ev_hash_d', 'exec_ev_hash_d', 'result_hash_d', 'pack_hash_d')`,
      [reviewId, reviewDecision, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_sim_review_evidence
       (evidence_id, review_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '142.0', 'pack_hash_d', ?, '{}')`,
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
       VALUES (?, ?, 'sim_test_d', 'exec_test_d', 'cohort_test_d', 'tenant_test_d', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', NULL, NULL, NULL, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{"missing_evaluation":true}', '{}', 'pack_hash_d', 'pack_hash_d', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY')`,
      [prepId, reviewId, JSON.stringify(writeScope143)]
    );
  }
}

(async () => {
  console.log('=== Smoke 143D: Review Workflow Governance ===\n');

  try {
    const revId = 'rev_d_1';
    const prepId = 'prp_d_1';
    await setupReviewAndPrep(revId, prepId, 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL');

    // 1. Finalize blocks before evaluation
    try {
      await decision.finalizePrep(prepId, 'admin');
      assert.fail('Should block finalization when status is DRAFT');
    } catch (e) {
      if (e.message.includes('EVALUATION_NOT_COMPLETED')) {
        console.log('  PASS: Finalization blocked before evaluation.');
      } else {
        throw e;
      }
    }

    // 2. Evaluate prep
    await evaluator.evaluatePrep(prepId, 'admin');

    // 3. Build evidence pack
    await evidence.buildEvidencePack(prepId, 'admin');

    // 4. Finalize prep package
    const { prep } = await decision.finalizePrep(prepId, 'admin');
    assert.strictEqual(prep.prep_status, 'FINALIZED');
    console.log('  PASS: Preparation package finalized successfully.');

    // 5. Finalized prep cannot be modified
    try {
      await evaluator.evaluatePrep(prepId, 'admin');
      assert.fail('Should block evaluation of finalized prep');
    } catch (e) {
      if (e.message.includes('PREP_NOT_EVALUATABLE')) {
        console.log('  PASS: Modifications blocked on finalized prep.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 143D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 143D:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
