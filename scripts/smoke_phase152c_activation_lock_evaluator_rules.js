'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const lockBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationLockEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupAuthorizationAndLock(activationAuthId, activationLockId, status = 'FINALIZED', result = 'AUTHORIZED_NOT_ACTIVE', lockConfig = {}) {
  const writeScope151 = { writes_only_phase151_tables: true, wrote_phase128_to_150_operational_tables: false };
  const writeScope152 = { writes_only_phase152_tables: true, wrote_phase128_to_151_operational_tables: false };
  const nonExecution151 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution152 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultLockConfig = {
    lock_mode: 'PRE_EXECUTION_FREEZE_ONLY',
    activation_lock_status: 'LOCKED_NOT_ACTIVE',
    package_freeze_status: 'FROZEN_IMMUTABLE',
    allow_real_activation: false,
    allow_real_execution: false,
    allow_plan_executable_state: false,
    allow_job_creation: false,
    allow_queue_dispatch: false,
    allow_runtime_writes: false,
    max_runtime_mutations: 0,
    max_execution_jobs: 0,
    requires_future_go_no_go_gate: true,
    requires_kill_switch: true,
    requires_rollback_authority: true,
    requires_operator_confirmation: true,
    requires_authorization_hash_verification: true,
    immutable_after_finalization: true
  };
  const activeLockConfig = { ...defaultLockConfig, ...lockConfig };

  const authRecord = {
    activation_auth_id: activationAuthId,
    source_activation_readiness_id: 'rd_test_152c',
    source_plan_id: 'pln_test_152c',
    source_dispatcher_id: 'dsp_test_152c',
    source_envelope_id: 'env_test_152c',
    source_auth_id: 'ath_test_152c',
    source_readiness_id: 'rd_test_152c',
    source_approval_id: 'apv_test_152c',
    source_prep_id: 'prep_test_152c',
    source_review_id: 'rev_test_152c',
    source_simulation_id: 'sim_test_152c',
    source_execution_id: 'exec_test_152c',
    cohort_id: 'cohort_test_152c',
    tenant_id: 'tenant_test_152c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_auth_status: status,
    activation_auth_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { authorization_mode: 'ACTIVATION_AUTHORIZATION_ONLY', allow_real_activation: false },
    auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    auth_rules_json: {},
    auth_blockers_json: {},
    non_execution_attestation_json: nonExecution151,
    write_scope_attestation_json: writeScope151,
    source_activation_readiness_hash: 'rd_hash_152c',
    activation_authorization_hash: 'auth_hash_152c',
    evidence_pack_hash: 'pack_hash_152c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'AUTHORIZATION_FINALIZED_NOT_EXECUTED',
    plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED',
    queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    finalized_by: null,
    finalized_at: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  const lockRecord = {
    activation_lock_id: activationLockId,
    source_activation_auth_id: activationAuthId,
    source_activation_readiness_id: 'rd_test_152c',
    source_plan_id: 'pln_test_152c',
    source_dispatcher_id: 'dsp_test_152c',
    source_envelope_id: 'env_test_152c',
    source_auth_id: 'ath_test_152c',
    source_readiness_id: 'rd_test_152c',
    source_approval_id: 'apv_test_152c',
    source_prep_id: 'prep_test_152c',
    source_review_id: 'rev_test_152c',
    source_simulation_id: 'sim_test_152c',
    source_execution_id: 'exec_test_152c',
    cohort_id: 'cohort_test_152c',
    tenant_id: 'tenant_test_152c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_lock_status: 'DRAFT',
    activation_lock_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeLockConfig,
    lock_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    lock_rules_json: {},
    lock_blockers_json: { missing_lock_evaluation: true },
    non_execution_attestation_json: nonExecution152,
    write_scope_attestation_json: writeScope152,
    source_activation_authorization_hash: 'auth_hash_152c',
    activation_lock_hash: null,
    freeze_package_hash: null,
    lock_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'LOCK_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE',
    plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED',
    queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
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
    authBuilder._mockState.authorization.set(activationAuthId, authRecord);
    lockBuilder._mockState.lock.set(activationLockId, lockRecord);
    lockBuilder._mockState.rules.set(activationLockId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_rules WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_evidence WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock_rules WHERE activation_lock_id = ?', [activationLockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock_evidence WHERE activation_lock_id = ?', [activationLockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock WHERE activation_lock_id = ?', [activationLockId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_auth
       (activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_auth_status, activation_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_readiness_hash,
        execution_capability_status, activation_execution_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_authorization_hash, evidence_pack_hash)
       VALUES (?, 'rd_test_152c', 'pln_test_152c', 'dsp_test_152c', 'env_test_152c', 'ath_test_152c', 'rd_test_152c', 'apv_test_152c', 'prep_test_152c', 'rev_test_152c', 'sim_test_152c', 'exec_test_152c', 'cohort_test_152c', 'tenant_test_152c', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'AUTHORIZED_NOT_ACTIVE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"authorization_mode":"ACTIVATION_AUTHORIZATION_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'rd_hash_152c', 'EXECUTION_NOT_ENABLED', 'AUTHORIZATION_FINALIZED_NOT_EXECUTED', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'auth_hash_152c', 'pack_hash_152c')`,
      [activationAuthId, JSON.stringify(nonExecution151), JSON.stringify(writeScope151)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_lock
       (activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_lock_status, activation_lock_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, lock_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        lock_rules_json, lock_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_authorization_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'rd_test_152c', 'pln_test_152c', 'dsp_test_152c', 'env_test_152c', 'ath_test_152c', 'rd_test_152c', 'apv_test_152c', 'prep_test_152c', 'rev_test_152c', 'sim_test_152c', 'exec_test_152c', 'cohort_test_152c', 'tenant_test_152c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_lock_evaluation":true}', ?, ?, 'auth_hash_152c', 'EXECUTION_NOT_ENABLED', 'LOCK_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationLockId,
        activationAuthId,
        JSON.stringify(activeLockConfig),
        JSON.stringify(nonExecution152),
        JSON.stringify(writeScope152)
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 152C: Activation Lock Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const a1 = 'auth_152c_1';
    const e1 = 'alk_152c_1';
    await setupAuthorizationAndLock(a1, e1, 'FINALIZED', 'AUTHORIZED_NOT_ACTIVE');
    
    const passed = await evaluator.evaluateLock(e1, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await lockBuilder.getLock(e1);
    assert.strictEqual(record.activation_lock_status, 'EVALUATED');
    assert.strictEqual(record.activation_lock_result, 'LOCKED_NOT_ACTIVE');
    console.log('  PASS: Evaluated lock record successfully.');

    // 2. Negative: fail check if operator is missing
    const a2 = 'auth_152c_2';
    const e2 = 'alk_152c_2';
    await setupAuthorizationAndLock(a2, e2, 'FINALIZED', 'AUTHORIZED_NOT_ACTIVE');
    
    const passedFail = await evaluator.evaluateLock(e2, {
      operator_confirmed: false,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await lockBuilder.getLock(e2);
    assert.strictEqual(record.activation_lock_status, 'BLOCKED');
    assert.strictEqual(record.activation_lock_result, 'LOCK_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when operator confirmation is missing.');

    console.log('\nSmoke 152C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 152C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
