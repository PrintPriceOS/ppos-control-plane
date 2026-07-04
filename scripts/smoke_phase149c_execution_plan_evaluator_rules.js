'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const dispatcherBuilder = require('../src/api/services/cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const planBuilder = require('../src/api/services/cohortInterventionExecutionPlanBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupDispatcherAndPlan(dispatcherId, planId, status = 'FINALIZED', result = 'DRY_RUN_EXECUTED_NOT_MUTATED', planConfig = {}) {
  const writeScope148 = { writes_only_phase148_tables: true, wrote_phase128_to_147_operational_tables: false };
  const writeScope149 = { writes_only_phase149_tables: true, wrote_phase128_to_148_operational_tables: false };
  const nonExecution148 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution149 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultPlanConfig = {
    plan_mode: 'MATERIALIZED_NOT_EXECUTABLE',
    allow_real_execution: false,
    allow_job_creation: false,
    allow_queue_dispatch: false,
    allow_runtime_writes: false,
    max_runtime_mutations: 0,
    max_execution_jobs: 0,
    requires_future_activation_gate: true,
    requires_kill_switch: true,
    requires_rollback_hooks: true,
    requires_operator_confirmation: true,
    immutable_after_finalization: true
  };
  const activePlanConfig = { ...defaultPlanConfig, ...planConfig };

  const dispatcherRecord = {
    dispatcher_id: dispatcherId,
    source_envelope_id: 'env_test_149c',
    source_auth_id: 'ath_test_149c',
    source_readiness_id: 'rd_test_149c',
    source_approval_id: 'apv_test_149c',
    source_prep_id: 'prep_test_149c',
    source_review_id: 'rev_test_149c',
    source_simulation_id: 'sim_test_149c',
    source_execution_id: 'exec_test_149c',
    cohort_id: 'cohort_test_149c',
    tenant_id: 'tenant_test_149c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    dispatcher_status: status,
    dispatcher_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { dispatch_mode: 'DRY_RUN_ONLY', queue_dispatch_mode: 'SIMULATED_ONLY', allow_real_job_creation: false },
    dispatcher_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    dispatcher_rules_json: {},
    dispatcher_blockers_json: {},
    non_execution_attestation_json: nonExecution148,
    write_scope_attestation_json: writeScope148,
    source_envelope_hash: 'env_hash_149c',
    source_envelope_evidence_pack_hash: 'ee_hash_149c',
    dispatcher_result_hash: 'result_hash_149c',
    evidence_pack_hash: 'pack_hash_149c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    dispatcher_execution_status: 'DRY_RUN_ACTIVE_NOT_MUTATING',
    dry_run_execution_result: 'DRY_RUN_EXECUTED_NOT_MUTATED',
    queue_dispatch_status: 'SIMULATED_ONLY',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    job_creation_status: 'NO_REAL_JOB_CREATED',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    finalized_by: null,
    finalized_at: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  const planRecord = {
    plan_id: planId,
    source_dispatcher_id: dispatcherId,
    source_envelope_id: 'env_test_149c',
    source_auth_id: 'ath_test_149c',
    source_readiness_id: 'rd_test_149c',
    source_approval_id: 'apv_test_149c',
    source_prep_id: 'prep_test_149c',
    source_review_id: 'rev_test_149c',
    source_simulation_id: 'sim_test_149c',
    source_execution_id: 'exec_test_149c',
    cohort_id: 'cohort_test_149c',
    tenant_id: 'tenant_test_149c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    plan_status: 'DRAFT',
    plan_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activePlanConfig,
    plan_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    plan_rules_json: {},
    plan_blockers_json: { missing_plan_evaluation: true },
    non_execution_attestation_json: nonExecution149,
    write_scope_attestation_json: writeScope149,
    source_dispatcher_hash: 'result_hash_149c',
    source_dispatcher_evidence_pack_hash: 'pack_hash_149c',
    execution_plan_hash: null,
    plan_materialization_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
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

  if (!isProdLike) {
    dispatcherBuilder._mockState.dispatcher.set(dispatcherId, dispatcherRecord);
    planBuilder._mockState.plan.set(planId, planRecord);
    planBuilder._mockState.rules.set(planId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_dispatcher_rules WHERE dispatcher_id = ?', [dispatcherId]);
    await db.query('DELETE FROM cb_cohort_intervention_dispatcher_evidence WHERE dispatcher_id = ?', [dispatcherId]);
    await db.query('DELETE FROM cb_cohort_intervention_dry_run_dispatcher WHERE dispatcher_id = ?', [dispatcherId]);
    await db.query('DELETE FROM cb_cohort_intervention_plan_rules WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_plan_evidence WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_plan WHERE plan_id = ?', [planId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_dry_run_dispatcher
       (dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        dispatcher_status, dispatcher_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, dispatcher_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        dispatcher_rules_json, dispatcher_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_envelope_hash, source_envelope_evidence_pack_hash,
        execution_capability_status, dispatcher_execution_status, dry_run_execution_result, queue_dispatch_status, runtime_mutation_status, job_creation_status, dispatcher_result_hash, evidence_pack_hash)
       VALUES (?, 'env_test_149c', 'ath_test_149c', 'rd_test_149c', 'apv_test_149c', 'prep_test_149c', 'rev_test_149c', 'sim_test_149c', 'exec_test_149c', 'cohort_test_149c', 'tenant_test_149c', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"dispatch_mode":"DRY_RUN_ONLY", "queue_dispatch_mode":"SIMULATED_ONLY", "allow_real_job_creation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'env_hash_149c', 'ee_hash_149c', 'EXECUTION_NOT_ENABLED', 'DRY_RUN_ACTIVE_NOT_MUTATING', 'DRY_RUN_EXECUTED_NOT_MUTATED', 'SIMULATED_ONLY', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_REAL_JOB_CREATED', 'result_hash_149c', 'pack_hash_149c')`,
      [dispatcherId, status, result, JSON.stringify(nonExecution148), JSON.stringify(writeScope148)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_plan
       (plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        plan_status, plan_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, plan_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        plan_rules_json, plan_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_dispatcher_hash, source_dispatcher_evidence_pack_hash,
        execution_capability_status, execution_plan_status, plan_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'env_test_149c', 'ath_test_149c', 'rd_test_149c', 'apv_test_149c', 'prep_test_149c', 'rev_test_149c', 'sim_test_149c', 'exec_test_149c', 'cohort_test_149c', 'tenant_test_149c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_plan_evaluation":true}', ?, ?, 'result_hash_149c', 'pack_hash_149c', 'EXECUTION_NOT_ENABLED', 'MATERIALIZED_NOT_EXECUTABLE', 'PLAN_MATERIALIZED_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [planId, dispatcherId, JSON.stringify(activePlanConfig), JSON.stringify(nonExecution149), JSON.stringify(writeScope149)]
    );
  }
}

(async () => {
  console.log('=== Smoke 149C: Execution Plan Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready plan with all metrics passing
    const a1 = 'dsp_149c_1';
    const e1 = 'pln_149c_1';
    await setupDispatcherAndPlan(a1, e1, 'FINALIZED', 'DRY_RUN_EXECUTED_NOT_MUTATED');
    
    const passed = await evaluator.evaluatePlan(e1, {
      operator_confirmed: true,
      kill_switch_verified: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await planBuilder.getPlan(e1);
    assert.strictEqual(record.plan_status, 'EVALUATED');
    assert.strictEqual(record.plan_result, 'PLAN_MATERIALIZED_NOT_EXECUTED');
    console.log('  PASS: Evaluated execution plan record successfully.');

    // 2. Negative: fail check if operator is missing
    const a2 = 'dsp_149c_2';
    const e2 = 'pln_149c_2';
    await setupDispatcherAndPlan(a2, e2, 'FINALIZED', 'DRY_RUN_EXECUTED_NOT_MUTATED');
    
    const passedFail = await evaluator.evaluatePlan(e2, {
      operator_confirmed: false,
      kill_switch_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await planBuilder.getPlan(e2);
    assert.strictEqual(record.plan_status, 'BLOCKED');
    assert.strictEqual(record.plan_result, 'PLAN_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when operator confirmation is missing.');

    console.log('\nSmoke 149C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 149C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
