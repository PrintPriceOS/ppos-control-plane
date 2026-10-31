'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const prepBuilder = require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService');
const approvalBuilder = require('../src/api/services/cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalBuilderService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupPrepFixture(prepId, status = 'FINALIZED') {
  const writeScope = { writes_only_phase143_tables: true, wrote_phase128_to_142_operational_tables: false };
  const prepRecord = {
    prep_id: prepId,
    source_review_id: 'rev_test_b',
    source_simulation_id: 'sim_test_b',
    source_execution_id: 'exec_test_b',
    cohort_id: 'cohort_test_b',
    tenant_id: 'tenant_test_b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    prep_status: status,
    prep_outcome: 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    prepared_by: null,
    finalized_by: null,
    prep_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    approval_readiness_json: {},
    prep_blockers_json: {},
    non_execution_attestation_json: {},
    source_review_hash: 'review_hash_b',
    source_review_evidence_pack_hash: 'ev_hash_b',
    prep_result_hash: 'result_hash_b',
    evidence_pack_hash: 'pack_hash_b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    prepBuilder._mockState.preps.set(prepId, prepRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_evidence WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_findings WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_preps WHERE prep_id = ?', [prepId]);

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_app_preps
       (prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        prep_status, prep_outcome, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, prep_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        prep_blockers_json, non_execution_attestation_json, source_review_hash, source_review_evidence_pack_hash,
        prep_result_hash, evidence_pack_hash, execution_capability_status, approval_execution_status)
       VALUES (?, 'rev_test_b', 'sim_test_b', 'exec_test_b', 'cohort_test_b', 'tenant_test_b', 'SIMULATE_COHORT_PAUSE',
        ?, 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'review_hash_b', 'ev_hash_b', 'result_hash_b', 'pack_hash_b', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY')`,
      [prepId, status, JSON.stringify(writeScope)]
    );
  }
  return prepId;
}

(async () => {
  console.log('=== Smoke 144B: Create Approval from Phase 143 Prep ===\n');

  try {
    // 1. Positive: create from finalized prep
    const finalizedId = await setupPrepFixture('prep_finalized_144b', 'FINALIZED');
    const { approval } = await approvalBuilder.createApproval(finalizedId, 'admin');
    assert.ok(approval.approval_id, 'approval_id should exist');
    assert.strictEqual(approval.source_prep_id, finalizedId);
    assert.strictEqual(approval.approval_status, 'DRAFT');
    console.log('  PASS: Draft approval created successfully from finalized preparation package.');

    // 2. Negative: block from DRAFT prep
    const draftId = await setupPrepFixture('prep_draft_144b', 'DRAFT');
    try {
      await approvalBuilder.createApproval(draftId, 'admin');
      assert.fail('Should have failed creating approval from DRAFT prep');
    } catch (e) {
      if (e.message.includes('PHASE143_PREPARATION_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked approval creation from non-finalized preparation.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 144B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 144B:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
