'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const planBuilder = require('../src/api/services/cohortInterventionExecutionPlanBuilderService').serviceInstance;
const rdBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupPlanAndReadiness(planId, activationRdId, status = 'FINALIZED', result = 'PLAN_MATERIALIZED_NOT_EXECUTED', rdConfig = {}) {
  const writeScope149 = { writes_only_phase149_tables: true, wrote_phase128_to_148_operational_tables: false };
  const writeScope150 = { writes_only_phase150_tables: true, wrote_phase128_to_149_operational_tables: false };
  const nonExecution149 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution150 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultRdConfig = {
    activation_mode: 'READINESS_ONLY',
    activation_status: 'ACTIVATION_READY_NOT_ACTIVE',
    allow_real_activation: false,
    allow_real_execution: false,
    allow_job_creation: false,
    allow_queue_dispatch: false,
    allow_runtime_writes: false,
    max_runtime_mutations: 0,
    max_execution_jobs: 0,
    requires_future_authorization_gate: true,
    requires_kill_switch: true,
    requires_rollback_authority: true,
    requires_operator_confirmation: true,
    requires_plan_hash_verification: true
  };
  const activeRdConfig = { ...defaultRdConfig, ...rdConfig };

  const planRecord = {
    plan_id: planId,
    source_dispatcher_id: 'dsp_test_150c',
    source_envelope_id: 'env_test_150c',
    source_auth_id: 'ath_test_150c',
    source_readiness_id: 'rd_test_150c',
    source_approval_id: 'apv_test_150c',
    source_prep_id: 'prep_test_150c',
    source_review_id: 'rev_test_150c',
    source_simulation_id: 'sim_test_150c',
    source_execution_id: 'exec_test_150c',
    cohort_id: 'cohort_test_150c',
    tenant_id: 'tenant_test_150c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    plan_status: status,
    plan_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { plan_mode: 'MATERIALIZED_NOT_EXECUTABLE', allow_real_execution: false },
    plan_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    plan_rules_json: {},
    plan_blockers_json: {},
    non_execution_attestation_json: nonExecution149,
    write_scope_attestation_json: writeScope149,
    source_dispatcher_hash: 'dsp_hash_150c',
    source_dispatcher_evidence_pack_hash: 'de_hash_150c',
    plan_materialization_hash: 'plan_hash_150c',
    evidence_pack_hash: 'pack_hash_150c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_plan_status: 'MATERIALIZED_NOT_EXECUTABLE',
    plan_execution_status: 'PLAN_MATERIALIZED_NOT_EXECUTED',
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

  const rdRecord = {
    activation_rd_id: activationRdId,
    source_plan_id: planId,
    source_dispatcher_id: 'dsp_test_150c',
    source_envelope_id: 'env_test_150c',
    source_auth_id: 'ath_test_150c',
    source_readiness_id: 'rd_test_150c',
    source_approval_id: 'apv_test_150c',
    source_prep_id: 'prep_test_150c',
    source_review_id: 'rev_test_150c',
    source_simulation_id: 'sim_test_150c',
    source_execution_id: 'exec_test_150c',
    cohort_id: 'cohort_test_150c',
    tenant_id: 'tenant_test_150c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_readiness_status: 'DRAFT',
    activation_readiness_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeRdConfig,
    readiness_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    readiness_rules_json: {},
    readiness_blockers_json: { missing_readiness_evaluation: true },
    non_execution_attestation_json: nonExecution150,
    write_scope_attestation_json: writeScope150,
    source_plan_hash: 'plan_hash_150c',
    source_plan_evidence_pack_hash: 'pack_hash_150c',
    activation_readiness_hash: null,
    readiness_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'ACTIVATION_NOT_EXECUTED',
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
    planBuilder._mockState.plan.set(planId, planRecord);
    rdBuilder._mockState.readiness.set(activationRdId, rdRecord);
    rdBuilder._mockState.rules.set(activationRdId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_plan_rules WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_plan_evidence WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_plan WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_rules WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_evidence WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd WHERE activation_rd_id = ?', [activationRdId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_plan
       (plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        plan_status, plan_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, plan_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        plan_rules_json, plan_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_dispatcher_hash, source_dispatcher_evidence_pack_hash,
        execution_capability_status, execution_plan_status, plan_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, plan_materialization_hash, evidence_pack_hash)
       VALUES (?, 'dsp_test_150c', 'env_test_150c', 'ath_test_150c', 'rd_test_150c', 'apv_test_150c', 'prep_test_150c', 'rev_test_150c', 'sim_test_150c', 'exec_test_150c', 'cohort_test_150c', 'tenant_test_150c', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"plan_mode":"MATERIALIZED_NOT_EXECUTABLE", "allow_real_execution":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'dsp_hash_150c', 'de_hash_150c', 'EXECUTION_NOT_ENABLED', 'MATERIALIZED_NOT_EXECUTABLE', 'PLAN_MATERIALIZED_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'plan_hash_150c', 'pack_hash_150c')`,
      [planId, status, result, JSON.stringify(nonExecution149), JSON.stringify(writeScope149)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd
       (activation_rd_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_readiness_status, activation_readiness_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, readiness_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        readiness_rules_json, readiness_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_plan_hash, source_plan_evidence_pack_hash,
        execution_capability_status, activation_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'dsp_test_150c', 'env_test_150c', 'ath_test_150c', 'rd_test_150c', 'apv_test_150c', 'prep_test_150c', 'rev_test_150c', 'sim_test_150c', 'exec_test_150c', 'cohort_test_150c', 'tenant_test_150c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_readiness_evaluation":true}', ?, ?, 'plan_hash_150c', 'pack_hash_150c', 'EXECUTION_NOT_ENABLED', 'ACTIVATION_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [activationRdId, planId, JSON.stringify(activeRdConfig), JSON.stringify(nonExecution150), JSON.stringify(writeScope150)]
    );
  }
}

(async () => {
  console.log('=== Smoke 150C: Activation Readiness Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const a1 = 'pln_150c_1';
    const e1 = 'ard_150c_1';
    await setupPlanAndReadiness(a1, e1, 'FINALIZED', 'PLAN_MATERIALIZED_NOT_EXECUTED');
    
    const passed = await evaluator.evaluateReadiness(e1, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await rdBuilder.getReadiness(e1);
    assert.strictEqual(record.activation_readiness_status, 'EVALUATED');
    assert.strictEqual(record.activation_readiness_result, 'ACTIVATION_READY_NOT_ACTIVE');
    console.log('  PASS: Evaluated readiness record successfully.');

    // 2. Negative: fail check if operator is missing
    const a2 = 'pln_150c_2';
    const e2 = 'ard_150c_2';
    await setupPlanAndReadiness(a2, e2, 'FINALIZED', 'PLAN_MATERIALIZED_NOT_EXECUTED');
    
    const passedFail = await evaluator.evaluateReadiness(e2, {
      operator_confirmed: false,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await rdBuilder.getReadiness(e2);
    assert.strictEqual(record.activation_readiness_status, 'BLOCKED');
    assert.strictEqual(record.activation_readiness_result, 'ACTIVATION_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when operator confirmation is missing.');

    console.log('\nSmoke 150C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 150C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
