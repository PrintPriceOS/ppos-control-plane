'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const decisionBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;
const handoffBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupDecisionAndHandoff(activationDecisionId, activationHandoffId, status = 'FINALIZED', result = 'GO_APPROVED_NOT_ACTIVE', handoffConfig = {}) {
  const writeScope153 = { writes_only_phase153_tables: true, wrote_phase128_to_152_operational_tables: false };
  const writeScope154 = { writes_only_phase154_tables: true, wrote_phase128_to_153_operational_tables: false };
  const nonExecution153 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution154 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultHandoffConfig = {
    handoff_mode: 'TOKEN_PREPARATION_ONLY',
    activation_handoff_status: 'TOKEN_PREPARED_NOT_ISSUED',
    token_status: 'PREPARED_NOT_ISSUED',
    token_issuance_status: 'TOKEN_NOT_ISSUED',
    token_redeemable: false,
    allow_token_issue: false,
    allow_token_redeem: false,
    allow_real_activation: false,
    allow_real_execution: false,
    allow_plan_executable_state: false,
    allow_job_creation: false,
    allow_queue_dispatch: false,
    allow_runtime_writes: false,
    max_runtime_mutations: 0,
    max_execution_jobs: 0,
    requires_future_token_issuance_authorization_gate: true,
    requires_kill_switch: true,
    requires_rollback_authority: true,
    requires_governance_signoff: true,
    requires_operator_confirmation: true,
    requires_decision_hash_verification: true,
    immutable_after_finalization: true
  };
  const activeHandoffConfig = { ...defaultHandoffConfig, ...handoffConfig };

  const decisionRecord = {
    activation_decision_id: activationDecisionId,
    source_activation_lock_id: 'lock_test_154c',
    source_activation_auth_id: 'auth_test_154c',
    source_activation_readiness_id: 'rd_test_154c',
    source_plan_id: 'pln_test_154c',
    source_dispatcher_id: 'dsp_test_154c',
    source_envelope_id: 'env_test_154c',
    source_auth_id: 'ath_test_154c',
    source_readiness_id: 'rd_test_154c',
    source_approval_id: 'apv_test_154c',
    source_prep_id: 'prep_test_154c',
    source_review_id: 'rev_test_154c',
    source_simulation_id: 'sim_test_154c',
    source_execution_id: 'exec_test_154c',
    cohort_id: 'cohort_test_154c',
    tenant_id: 'tenant_test_154c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_decision_status: status,
    activation_decision_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { decision_mode: 'FINAL_GO_NO_GO_DECISION_ONLY', allow_real_activation: false },
    decision_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    decision_rules_json: {},
    decision_blockers_json: {},
    non_execution_attestation_json: nonExecution153,
    write_scope_attestation_json: writeScope153,
    source_activation_lock_hash: 'lock_hash_154c',
    source_freeze_package_hash: 'lock_hash_154c',
    activation_decision_hash: 'decision_hash_154c',
    decision_evidence_pack_hash: 'pack_hash_154c',
    evidence_pack_hash: 'pack_hash_154c',
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

  const handoffRecord = {
    activation_handoff_id: activationHandoffId,
    source_activation_decision_id: activationDecisionId,
    source_activation_lock_id: 'lock_test_154c',
    source_activation_auth_id: 'auth_test_154c',
    source_activation_readiness_id: 'rd_test_154c',
    source_plan_id: 'pln_test_154c',
    source_dispatcher_id: 'dsp_test_154c',
    source_envelope_id: 'env_test_154c',
    source_auth_id: 'ath_test_154c',
    source_readiness_id: 'rd_test_154c',
    source_approval_id: 'apv_test_154c',
    source_prep_id: 'prep_test_154c',
    source_review_id: 'rev_test_154c',
    source_simulation_id: 'sim_test_154c',
    source_execution_id: 'exec_test_154c',
    cohort_id: 'cohort_test_154c',
    tenant_id: 'tenant_test_154c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_handoff_status: 'DRAFT',
    activation_handoff_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeHandoffConfig,
    handoff_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    handoff_rules_json: {},
    handoff_blockers_json: { missing_handoff_evaluation: true },
    non_execution_attestation_json: nonExecution154,
    write_scope_attestation_json: writeScope154,
    source_activation_decision_hash: 'decision_hash_154c',
    source_freeze_package_hash: 'lock_hash_154c',
    activation_handoff_hash: null,
    token_material_hash: null,
    handoff_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    handoff_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'HANDOFF_FINALIZED_NOT_EXECUTED',
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
    decisionBuilder._mockState.decision.set(activationDecisionId, decisionRecord);
    handoffBuilder._mockState.handoff.set(activationHandoffId, handoffRecord);
    handoffBuilder._mockState.rules.set(activationHandoffId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision_rules WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision_evidence WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_rules WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_evidence WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff WHERE activation_handoff_id = ?', [activationHandoffId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_decision
       (activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_decision_status, activation_decision_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, decision_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        decision_rules_json, decision_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_lock_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_decision_hash, decision_evidence_pack_hash, evidence_pack_hash)
       VALUES (?, 'lock_test_154c', 'auth_test_154c', 'rd_test_154c', 'pln_test_154c', 'dsp_test_154c', 'env_test_154c', 'ath_test_154c', 'rd_test_154c', 'apv_test_154c', 'prep_test_154c', 'rev_test_154c', 'sim_test_154c', 'exec_test_154c', 'cohort_test_154c', 'tenant_test_154c', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'GO_APPROVED_NOT_ACTIVE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"decision_mode":"FINAL_GO_NO_GO_DECISION_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'lock_hash_154c', 'lock_hash_154c', 'EXECUTION_NOT_ENABLED', 'GO_DECISION_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'decision_hash_154c', 'decision_hash_154c', 'pack_hash_154c')`,
      [activationDecisionId, JSON.stringify(nonExecution153), JSON.stringify(writeScope153)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_handoff
       (activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_handoff_status, activation_handoff_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, handoff_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        handoff_rules_json, handoff_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_decision_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'lock_test_154c', 'auth_test_154c', 'rd_test_154c', 'pln_test_154c', 'dsp_test_154c', 'env_test_154c', 'ath_test_154c', 'rd_test_154c', 'apv_test_154c', 'prep_test_154c', 'rev_test_154c', 'sim_test_154c', 'exec_test_154c', 'cohort_test_154c', 'tenant_test_154c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_handoff_evaluation":true}', ?, ?, 'decision_hash_154c', 'lock_hash_154c', 'EXECUTION_NOT_ENABLED', 'HANDOFF_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationHandoffId,
        activationDecisionId,
        JSON.stringify(activeHandoffConfig),
        JSON.stringify(nonExecution154),
        JSON.stringify(writeScope154)
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 154C: Activation Handoff Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const d1 = 'dec_154c_1';
    const h1 = 'ahf_154c_1';
    await setupDecisionAndHandoff(d1, h1, 'FINALIZED', 'GO_APPROVED_NOT_ACTIVE');
    
    const passed = await evaluator.evaluateHandoff(h1, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await handoffBuilder.getHandoff(h1);
    assert.strictEqual(record.activation_handoff_status, 'EVALUATED');
    assert.strictEqual(record.activation_handoff_result, 'TOKEN_PREPARED_NOT_ISSUED');
    console.log('  PASS: Evaluated handoff record successfully.');

    // 2. Negative: fail check if operator is missing
    const d2 = 'dec_154c_2';
    const h2 = 'ahf_154c_2';
    await setupDecisionAndHandoff(d2, h2, 'FINALIZED', 'GO_APPROVED_NOT_ACTIVE');
    
    const passedFail = await evaluator.evaluateHandoff(h2, {
      operator_confirmed: false,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await handoffBuilder.getHandoff(h2);
    assert.strictEqual(record.activation_handoff_status, 'BLOCKED');
    assert.strictEqual(record.activation_handoff_result, 'TOKEN_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when operator confirmation is missing.');

    console.log('\nSmoke 154C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 154C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
