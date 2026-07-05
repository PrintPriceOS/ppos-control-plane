'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const lockBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;
const decisionBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationDecisionEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupLockAndDecision(activationLockId, activationDecisionId, status = 'FINALIZED', result = 'LOCKED_NOT_ACTIVE', decisionConfig = {}) {
  const writeScope152 = { writes_only_phase152_tables: true, wrote_phase128_to_151_operational_tables: false };
  const writeScope153 = { writes_only_phase153_tables: true, wrote_phase128_to_152_operational_tables: false };
  const nonExecution152 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution153 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultDecisionConfig = {
    decision_mode: 'FINAL_GO_NO_GO_DECISION_ONLY',
    activation_decision_status: 'GO_APPROVED_NOT_ACTIVE',
    allow_real_activation: false,
    allow_real_execution: false,
    allow_plan_executable_state: false,
    allow_job_creation: false,
    allow_queue_dispatch: false,
    allow_runtime_writes: false,
    max_runtime_mutations: 0,
    max_execution_jobs: 0,
    requires_future_activation_handoff_gate: true,
    requires_kill_switch: true,
    requires_rollback_authority: true,
    requires_governance_signoff: true,
    requires_operator_confirmation: true,
    requires_lock_hash_verification: true,
    immutable_after_finalization: true
  };
  const activeDecisionConfig = { ...defaultDecisionConfig, ...decisionConfig };

  const lockRecord = {
    activation_lock_id: activationLockId,
    source_activation_auth_id: 'auth_test_153c',
    source_activation_readiness_id: 'rd_test_153c',
    source_plan_id: 'pln_test_153c',
    source_dispatcher_id: 'dsp_test_153c',
    source_envelope_id: 'env_test_153c',
    source_auth_id: 'ath_test_153c',
    source_readiness_id: 'rd_test_153c',
    source_approval_id: 'apv_test_153c',
    source_prep_id: 'prep_test_153c',
    source_review_id: 'rev_test_153c',
    source_simulation_id: 'sim_test_153c',
    source_execution_id: 'exec_test_153c',
    cohort_id: 'cohort_test_153c',
    tenant_id: 'tenant_test_153c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_lock_status: status,
    activation_lock_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { lock_mode: 'PRE_EXECUTION_FREEZE_ONLY', allow_real_activation: false },
    lock_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    lock_rules_json: {},
    lock_blockers_json: {},
    non_execution_attestation_json: nonExecution152,
    write_scope_attestation_json: writeScope152,
    source_activation_authorization_hash: 'auth_hash_153c',
    activation_lock_hash: 'lock_hash_153c',
    freeze_package_hash: 'lock_hash_153c',
    evidence_pack_hash: 'pack_hash_153c',
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

  const decisionRecord = {
    activation_decision_id: activationDecisionId,
    source_activation_lock_id: activationLockId,
    source_activation_auth_id: 'auth_test_153c',
    source_activation_readiness_id: 'rd_test_153c',
    source_plan_id: 'pln_test_153c',
    source_dispatcher_id: 'dsp_test_153c',
    source_envelope_id: 'env_test_153c',
    source_auth_id: 'ath_test_153c',
    source_readiness_id: 'rd_test_153c',
    source_approval_id: 'apv_test_153c',
    source_prep_id: 'prep_test_153c',
    source_review_id: 'rev_test_153c',
    source_simulation_id: 'sim_test_153c',
    source_execution_id: 'exec_test_153c',
    cohort_id: 'cohort_test_153c',
    tenant_id: 'tenant_test_153c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_decision_status: 'DRAFT',
    activation_decision_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeDecisionConfig,
    decision_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    decision_rules_json: {},
    decision_blockers_json: { missing_decision_evaluation: true },
    non_execution_attestation_json: nonExecution153,
    write_scope_attestation_json: writeScope153,
    source_activation_lock_hash: 'lock_hash_153c',
    source_freeze_package_hash: 'lock_hash_153c',
    activation_decision_hash: null,
    decision_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    decision_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'GO_DECISION_FINALIZED_NOT_EXECUTED',
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
    lockBuilder._mockState.lock.set(activationLockId, lockRecord);
    decisionBuilder._mockState.decision.set(activationDecisionId, decisionRecord);
    decisionBuilder._mockState.rules.set(activationDecisionId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock_rules WHERE activation_lock_id = ?', [activationLockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock_evidence WHERE activation_lock_id = ?', [activationLockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock WHERE activation_lock_id = ?', [activationLockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision_rules WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision_evidence WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision WHERE activation_decision_id = ?', [activationDecisionId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_lock
       (activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_lock_status, activation_lock_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, lock_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        lock_rules_json, lock_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_authorization_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_lock_hash, freeze_package_hash, evidence_pack_hash)
       VALUES (?, 'auth_test_153c', 'rd_test_153c', 'pln_test_153c', 'dsp_test_153c', 'env_test_153c', 'ath_test_153c', 'rd_test_153c', 'apv_test_153c', 'prep_test_153c', 'rev_test_153c', 'sim_test_153c', 'exec_test_153c', 'cohort_test_153c', 'tenant_test_153c', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'LOCKED_NOT_ACTIVE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"lock_mode":"PRE_EXECUTION_FREEZE_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'auth_hash_153c', 'EXECUTION_NOT_ENABLED', 'LOCK_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'lock_hash_153c', 'lock_hash_153c', 'pack_hash_153c')`,
      [activationLockId, JSON.stringify(nonExecution152), JSON.stringify(writeScope152)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_decision
       (activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_decision_status, activation_decision_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, decision_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        decision_rules_json, decision_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_lock_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'auth_test_153c', 'rd_test_153c', 'pln_test_153c', 'dsp_test_153c', 'env_test_153c', 'ath_test_153c', 'rd_test_153c', 'apv_test_153c', 'prep_test_153c', 'rev_test_153c', 'sim_test_153c', 'exec_test_153c', 'cohort_test_153c', 'tenant_test_153c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_decision_evaluation":true}', ?, ?, 'lock_hash_153c', 'lock_hash_153c', 'EXECUTION_NOT_ENABLED', 'GO_DECISION_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationDecisionId,
        activationLockId,
        JSON.stringify(activeDecisionConfig),
        JSON.stringify(nonExecution153),
        JSON.stringify(writeScope153)
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 153C: Activation Decision Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const l1 = 'lock_153c_1';
    const d1 = 'adc_153c_1';
    await setupLockAndDecision(l1, d1, 'FINALIZED', 'LOCKED_NOT_ACTIVE');
    
    const passed = await evaluator.evaluateDecision(d1, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await decisionBuilder.getDecision(d1);
    assert.strictEqual(record.activation_decision_status, 'EVALUATED');
    assert.strictEqual(record.activation_decision_result, 'GO_APPROVED_NOT_ACTIVE');
    console.log('  PASS: Evaluated decision record successfully.');

    // 2. Negative: fail check if operator is missing
    const l2 = 'lock_153c_2';
    const d2 = 'adc_153c_2';
    await setupLockAndDecision(l2, d2, 'FINALIZED', 'LOCKED_NOT_ACTIVE');
    
    const passedFail = await evaluator.evaluateDecision(d2, {
      operator_confirmed: false,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await decisionBuilder.getDecision(d2);
    assert.strictEqual(record.activation_decision_status, 'BLOCKED');
    assert.strictEqual(record.activation_decision_result, 'DECISION_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when operator confirmation is missing.');

    console.log('\nSmoke 153C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 153C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
