'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionReadinessBuilderService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReadinessFixture(readinessId, status = 'FINALIZED', decision = 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED') {
  const writeScope = { writes_only_phase145_tables: true, wrote_phase128_to_144_operational_tables: false };
  const readinessRecord = {
    readiness_id: readinessId,
    source_approval_id: 'apv_test_146b',
    source_prep_id: 'prep_test_146b',
    source_review_id: 'rev_test_146b',
    source_simulation_id: 'sim_test_146b',
    source_execution_id: 'exec_test_146b',
    cohort_id: 'cohort_test_146b',
    tenant_id: 'tenant_test_146b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    readiness_status: status,
    readiness_decision: decision,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    kill_switch_status: 'PASS',
    rollback_authority_status: 'PASS',
    readiness_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    readiness_checks_json: {},
    readiness_blockers_json: {},
    non_execution_attestation_json: {},
    source_approval_hash: 'apv_hash_146b',
    source_approval_evidence_pack_hash: 'ae_hash_146b',
    readiness_result_hash: 'result_hash_146b',
    evidence_pack_hash: 'pack_hash_146b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_readiness_status: 'EXECUTION_READY_NOT_ACTIVE',
    readiness_execution_status: 'READINESS_APPROVED_NOT_EXECUTED',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    readinessBuilder._mockState.readiness.set(readinessId, readinessRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_exec_ready_evidence WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_ready_checks WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_readiness WHERE readiness_id = ?', [readinessId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_readiness
       (readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        readiness_status, readiness_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, kill_switch_status, rollback_authority_status, readiness_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, readiness_checks_json, readiness_blockers_json, non_execution_attestation_json, write_scope_attestation_json,
        source_approval_hash, source_approval_evidence_pack_hash, execution_capability_status, execution_readiness_status, readiness_execution_status, readiness_result_hash, evidence_pack_hash)
       VALUES (?, 'apv_test_146b', 'prep_test_146b', 'rev_test_146b', 'sim_test_146b', 'exec_test_146b', 'cohort_test_146b', 'tenant_test_146b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', 'PASS', 'PASS', '{}', '{}', '{}', '{}', '{}', '{}', '{}', ?, 'apv_hash_146b', 'ae_hash_146b', 'EXECUTION_NOT_ENABLED', 'EXECUTION_READY_NOT_ACTIVE', 'READINESS_APPROVED_NOT_EXECUTED', 'result_hash_146b', 'pack_hash_146b')`,
      [readinessId, status, decision, JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 146B: Create Authorization from Phase 145 Readiness ===\n');

  try {
    // 1. Positive: create from finalized approved readiness record
    const finalizedId = 'rd_finalized_146b';
    await setupReadinessFixture(finalizedId, 'FINALIZED', 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED');
    
    const { auth } = await authBuilder.createAuth(finalizedId, 'admin');
    assert.ok(auth.auth_id, 'auth_id should exist');
    assert.strictEqual(auth.source_readiness_id, finalizedId);
    assert.strictEqual(auth.auth_status, 'DRAFT');
    console.log('  PASS: Draft authorization created successfully from finalized and approved readiness.');

    // 2. Negative: block from DRAFT readiness
    const draftId = 'rd_draft_146b';
    await setupReadinessFixture(draftId, 'DRAFT', 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED');
    try {
      await authBuilder.createAuth(draftId, 'admin');
      assert.fail('Should have failed creating auth from DRAFT readiness');
    } catch (e) {
      if (e.message.includes('PHASE145_READINESS_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked authorization draft creation from non-finalized readiness.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 146B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 146B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
