'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const authBuilder = require('../src/api/services/cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const envelopeBuilder = require('../src/api/services/cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionEnvelopeEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupAuthAndEnvelope(authId, envelopeId, status = 'FINALIZED', decision = 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE', envConfig = {}) {
  const writeScope = { writes_only_phase146_tables: true, wrote_phase128_to_145_operational_tables: false };
  const writeScope147 = { writes_only_phase147_tables: true, wrote_phase128_to_146_operational_tables: false };
  const nonExecution147 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const defaultEnvConfig = {
    mode: 'NO_OP',
    max_cohorts: 0,
    max_participants: 0,
    max_invites: 0,
    max_runtime_mutations: 0,
    max_execution_jobs: 0,
    allow_queue_dispatch: false,
    allow_runtime_writes: false,
    requires_kill_switch: true,
    requires_operator_confirmation: true,
    requires_rollback_authority: true,
    snapshot_before_after_required: true
  };
  const activeEnvConfig = { ...defaultEnvConfig, ...envConfig };

  const authRecord = {
    auth_id: authId,
    source_readiness_id: 'rd_test_147c',
    source_approval_id: 'apv_test_147c',
    source_prep_id: 'prep_test_147c',
    source_review_id: 'rev_test_147c',
    source_simulation_id: 'sim_test_147c',
    source_execution_id: 'exec_test_147c',
    cohort_id: 'cohort_test_147c',
    tenant_id: 'tenant_test_147c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    auth_status: status,
    auth_decision: decision,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    approved_by: null,
    finalized_by: null,
    canary_envelope_json: { max_cohorts: 0, max_participants: 0 },
    auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    auth_rules_json: {},
    auth_blockers_json: {},
    non_execution_attestation_json: {},
    source_readiness_hash: 'rd_hash_147c',
    source_readiness_evidence_pack_hash: 're_hash_147c',
    auth_result_hash: 'result_hash_147c',
    evidence_pack_hash: 'pack_hash_147c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_authorization_status: 'EXECUTION_AUTHORIZED_NOT_ACTIVE',
    auth_execution_status: 'AUTHORIZATION_APPROVED_NOT_EXECUTED',
    created_at: new Date(),
    updated_at: new Date()
  };

  const envelopeRecord = {
    envelope_id: envelopeId,
    source_auth_id: authId,
    source_readiness_id: 'rd_test_147c',
    source_approval_id: 'apv_test_147c',
    source_prep_id: 'prep_test_147c',
    source_review_id: 'rev_test_147c',
    source_simulation_id: 'sim_test_147c',
    source_execution_id: 'exec_test_147c',
    cohort_id: 'cohort_test_147c',
    tenant_id: 'tenant_test_147c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    envelope_status: 'DRAFT',
    envelope_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeEnvConfig,
    envelope_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    envelope_rules_json: {},
    envelope_blockers_json: { missing_envelope_evaluation: true },
    non_execution_attestation_json: nonExecution147,
    write_scope_attestation_json: writeScope147,
    source_auth_hash: 'result_hash_147c',
    source_auth_evidence_pack_hash: 'pack_hash_147c',
    envelope_result_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    envelope_execution_status: 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING',
    no_op_execution_result: 'NO_OP_EXECUTED_NOT_MUTATED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    job_dispatch_status: 'NO_JOB_DISPATCHED',
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
    authBuilder._mockState.auth.set(authId, authRecord);
    envelopeBuilder._mockState.envelope.set(envelopeId, envelopeRecord);
    envelopeBuilder._mockState.rules.set(envelopeId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_evidence WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_rules WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_envelope_rules WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_envelope_evidence WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_no_op_envelope WHERE envelope_id = ?', [envelopeId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_auth
       (auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        auth_status, auth_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_readiness_hash, source_readiness_evidence_pack_hash,
        execution_capability_status, execution_authorization_status, auth_execution_status, auth_result_hash, evidence_pack_hash)
       VALUES (?, 'rd_test_147c', 'apv_test_147c', 'prep_test_147c', 'rev_test_147c', 'sim_test_147c', 'exec_test_147c', 'cohort_test_147c', 'tenant_test_147c', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"max_cohorts":0, "max_participants":0}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', ?, 'rd_hash_147c', 're_hash_147c', 'EXECUTION_NOT_ENABLED', 'EXECUTION_AUTHORIZED_NOT_ACTIVE', 'AUTHORIZATION_APPROVED_NOT_EXECUTED', 'result_hash_147c', 'pack_hash_147c')`,
      [authId, status, decision, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_no_op_envelope
       (envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        envelope_status, envelope_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, envelope_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        envelope_rules_json, envelope_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_auth_hash, source_auth_evidence_pack_hash,
        execution_capability_status, envelope_execution_status, no_op_execution_result, runtime_mutation_status, job_dispatch_status)
       VALUES (?, ?, 'rd_test_147c', 'apv_test_147c', 'prep_test_147c', 'rev_test_147c', 'sim_test_147c', 'exec_test_147c', 'cohort_test_147c', 'tenant_test_147c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_envelope_evaluation":true}', ?, ?, 'result_hash_147c', 'pack_hash_147c', 'EXECUTION_NOT_ENABLED', 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING', 'NO_OP_EXECUTED_NOT_MUTATED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_JOB_DISPATCHED')`,
      [envelopeId, authId, JSON.stringify(activeEnvConfig), JSON.stringify(nonExecution147), JSON.stringify(writeScope147)]
    );
  }
}

(async () => {
  console.log('=== Smoke 147C: NO_OP Envelope Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const a1 = 'ath_147c_1';
    const e1 = 'env_147c_1';
    await setupAuthAndEnvelope(a1, e1, 'FINALIZED', 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE');
    
    const passed = await evaluator.evaluateEnvelope(e1, {
      operator_confirmed: true,
      kill_switch_verified: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await envelopeBuilder.getEnvelope(e1);
    assert.strictEqual(record.envelope_status, 'EVALUATED');
    assert.strictEqual(record.envelope_result, 'NO_OP_EXECUTED_NOT_MUTATED');
    console.log('  PASS: Evaluated NO_OP envelope record successfully.');

    // 2. Negative: fail check if operator is missing
    const a2 = 'ath_147c_2';
    const e2 = 'env_147c_2';
    await setupAuthAndEnvelope(a2, e2, 'FINALIZED', 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE');
    
    const passedFail = await evaluator.evaluateEnvelope(e2, {
      operator_confirmed: false,
      kill_switch_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await envelopeBuilder.getEnvelope(e2);
    assert.strictEqual(record.envelope_status, 'BLOCKED');
    assert.strictEqual(record.envelope_result, 'NO_OP_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when operator confirmation is missing.');

    console.log('\nSmoke 147C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 147C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
