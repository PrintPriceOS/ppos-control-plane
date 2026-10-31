'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionReadinessBuilderService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionAuthorizationEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReadinessAndAuth(readinessId, authId, status = 'FINALIZED', decision = 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED', envelope = {}) {
  const writeScope = { writes_only_phase145_tables: true, wrote_phase128_to_144_operational_tables: false };
  const writeScope146 = { writes_only_phase146_tables: true, wrote_phase128_to_145_operational_tables: false };
  const nonExecution146 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const defaultEnvelope = {
    mode: 'NO_OP_OR_CANARY_ONLY',
    max_cohorts: 0,
    max_participants: 0,
    max_invites: 0,
    max_runtime_mutations: 0,
    requires_manual_confirmation: true,
    kill_switch_required: true,
    rollback_required: true
  };
  const activeEnvelope = { ...defaultEnvelope, ...envelope };

  const readinessRecord = {
    readiness_id: readinessId,
    source_approval_id: 'apv_test_146c',
    source_prep_id: 'prep_test_146c',
    source_review_id: 'rev_test_146c',
    source_simulation_id: 'sim_test_146c',
    source_execution_id: 'exec_test_146c',
    cohort_id: 'cohort_test_146c',
    tenant_id: 'tenant_test_146c',
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
    source_approval_hash: 'apv_hash_146c',
    source_approval_evidence_pack_hash: 'ae_hash_146c',
    readiness_result_hash: 'result_hash_146c',
    evidence_pack_hash: 'pack_hash_146c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_readiness_status: 'EXECUTION_READY_NOT_ACTIVE',
    readiness_execution_status: 'READINESS_APPROVED_NOT_EXECUTED',
    created_at: new Date(),
    updated_at: new Date()
  };

  const authRecord = {
    auth_id: authId,
    source_readiness_id: readinessId,
    source_approval_id: 'apv_test_146c',
    source_prep_id: 'prep_test_146c',
    source_review_id: 'rev_test_146c',
    source_simulation_id: 'sim_test_146c',
    source_execution_id: 'exec_test_146c',
    cohort_id: 'cohort_test_146c',
    tenant_id: 'tenant_test_146c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    auth_status: 'DRAFT',
    auth_decision: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeEnvelope,
    auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    auth_rules_json: {},
    auth_blockers_json: { missing_authorization_evaluation: true },
    non_execution_attestation_json: nonExecution146,
    write_scope_attestation_json: writeScope146,
    source_readiness_hash: 'result_hash_146c',
    source_readiness_evidence_pack_hash: 'pack_hash_146c',
    auth_result_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_authorization_status: 'EXECUTION_AUTHORIZED_NOT_ACTIVE',
    auth_execution_status: 'AUTHORIZATION_APPROVED_NOT_EXECUTED',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    finalized_by: null,
    finalized_at: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    readinessBuilder._mockState.readiness.set(readinessId, readinessRecord);
    authBuilder._mockState.auth.set(authId, authRecord);
    authBuilder._mockState.rules.set(authId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_exec_ready_evidence WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_ready_checks WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_readiness WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_rules WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_evidence WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth WHERE auth_id = ?', [authId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_readiness
       (readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        readiness_status, readiness_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, kill_switch_status, rollback_authority_status, readiness_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, readiness_checks_json, readiness_blockers_json, non_execution_attestation_json, write_scope_attestation_json,
        source_approval_hash, source_approval_evidence_pack_hash, execution_capability_status, execution_readiness_status, readiness_execution_status, readiness_result_hash, evidence_pack_hash)
       VALUES (?, 'apv_test_146c', 'prep_test_146c', 'rev_test_146c', 'sim_test_146c', 'exec_test_146c', 'cohort_test_146c', 'tenant_test_146c', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', 'PASS', 'PASS', '{}', '{}', '{}', '{}', '{}', '{}', '{}', ?, 'apv_hash_146c', 'ae_hash_146c', 'EXECUTION_NOT_ENABLED', 'EXECUTION_READY_NOT_ACTIVE', 'READINESS_APPROVED_NOT_EXECUTED', 'result_hash_146c', 'pack_hash_146c')`,
      [readinessId, status, decision, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_auth
       (auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        auth_status, auth_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_readiness_hash, source_readiness_evidence_pack_hash,
        execution_capability_status, execution_authorization_status, auth_execution_status)
       VALUES (?, ?, 'apv_test_146c', 'prep_test_146c', 'rev_test_146c', 'sim_test_146c', 'exec_test_146c', 'cohort_test_146c', 'tenant_test_146c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_authorization_evaluation":true}', ?, ?, 'result_hash_146c', 'pack_hash_146c', 'EXECUTION_NOT_ENABLED', 'EXECUTION_AUTHORIZED_NOT_ACTIVE', 'AUTHORIZATION_APPROVED_NOT_EXECUTED')`,
      [authId, readinessId, JSON.stringify(activeEnvelope), JSON.stringify(nonExecution146), JSON.stringify(writeScope146)]
    );
  }
}

(async () => {
  console.log('=== Smoke 146C: Authorization Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const r1 = 'rd_146c_1';
    const a1 = 'ath_146c_1';
    await setupReadinessAndAuth(r1, a1, 'FINALIZED', 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED');
    
    const passed = await evaluator.evaluateAuth(a1, {
      operator_present: true,
      confirmation_phrase_present: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await authBuilder.getAuth(a1);
    assert.strictEqual(record.auth_status, 'EVALUATED');
    assert.strictEqual(record.auth_decision, 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE');
    console.log('  PASS: Evaluated authorization record successfully.');

    // 2. Negative: fail check if canary limits are exceeded (>0)
    const r2 = 'rd_146c_2';
    const a2 = 'ath_146c_2';
    await setupReadinessAndAuth(r2, a2, 'FINALIZED', 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED', { max_cohorts: 5 });
    
    const passedFail = await evaluator.evaluateAuth(a2, {
      operator_present: true,
      confirmation_phrase_present: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await authBuilder.getAuth(a2);
    assert.strictEqual(record.auth_status, 'BLOCKED');
    assert.strictEqual(record.auth_decision, 'BLOCK_EXECUTION_PATH');
    console.log('  PASS: Correctly failed evaluation when canary envelope limits are violated.');

    console.log('\nSmoke 146C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 146C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
