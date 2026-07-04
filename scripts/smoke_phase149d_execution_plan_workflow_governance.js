'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const dispatcherBuilder = require('../src/api/services/cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const dispatcherEvidenceSvc = require('../src/api/services/cohortInterventionExecutionDispatcherEvidencePackService').serviceInstance;
const planBuilder = require('../src/api/services/cohortInterventionExecutionPlanBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanEvaluatorService').serviceInstance;
const decision = require('../src/api/services/cohortInterventionExecutionPlanDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupDispatcherAndPlan(dispatcherId, planId) {
  const writeScope148 = { writes_only_phase148_tables: true, wrote_phase128_to_147_operational_tables: false };
  const writeScope149 = { writes_only_phase149_tables: true, wrote_phase128_to_148_operational_tables: false };
  const nonExecution148 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution149 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const dispatcherRecord = {
    dispatcher_id: dispatcherId,
    source_envelope_id: 'env_test_149d',
    source_auth_id: 'ath_test_149d',
    source_readiness_id: 'rd_test_149d',
    source_approval_id: 'apv_test_149d',
    source_prep_id: 'prep_test_149d',
    source_review_id: 'rev_test_149d',
    source_simulation_id: 'sim_test_149d',
    source_execution_id: 'exec_test_149d',
    cohort_id: 'cohort_test_149d',
    tenant_id: 'tenant_test_149d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    dispatcher_status: 'FINALIZED',
    dispatcher_result: 'DRY_RUN_EXECUTED_NOT_MUTATED',
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
    source_envelope_hash: 'env_hash_149d',
    source_envelope_evidence_pack_hash: 'ee_hash_149d',
    dispatcher_result_hash: 'result_hash_149d',
    evidence_pack_hash: 'pack_hash_149d',
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
    source_envelope_id: 'env_test_149d',
    source_auth_id: 'ath_test_149d',
    source_readiness_id: 'rd_test_149d',
    source_approval_id: 'apv_test_149d',
    source_prep_id: 'prep_test_149d',
    source_review_id: 'rev_test_149d',
    source_simulation_id: 'sim_test_149d',
    source_execution_id: 'exec_test_149d',
    cohort_id: 'cohort_test_149d',
    tenant_id: 'tenant_test_149d',
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
    canary_envelope_json: { plan_mode: 'MATERIALIZED_NOT_EXECUTABLE', allow_real_execution: false },
    plan_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    plan_rules_json: {},
    plan_blockers_json: { missing_plan_evaluation: true },
    non_execution_attestation_json: nonExecution149,
    write_scope_attestation_json: writeScope149,
    source_dispatcher_hash: 'result_hash_149d',
    source_dispatcher_evidence_pack_hash: 'pack_hash_149d',
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
    dispatcherEvidenceSvc._mockState.evidence.set(dispatcherId, {
      evidence_pack_hash: 'pack_hash_149d',
      evidence_payload_json: { evidence_schema_version: '148.0', write_scope_attestation: writeScope148 },
      lineage_hash_chain_json: {
        phase148_dispatcher_id: dispatcherId,
        phase147_source_envelope_hash: 'env_hash_d',
        phase146_source_auth_hash: 'auth_hash_d',
        phase145_source_readiness_hash: 'rd_hash_d',
        phase144_source_approval_hash: 'apv_hash_d',
        phase143_preparation_id: 'prep_test_149d',
        phase142_review_id: 'rev_test_149d',
        phase141_source_simulation_hash: 'sim_hash_d',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
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
       VALUES (?, 'env_test_149d', 'ath_test_149d', 'rd_test_149d', 'apv_test_149d', 'prep_test_149d', 'rev_test_149d', 'sim_test_149d', 'exec_test_149d', 'cohort_test_149d', 'tenant_test_149d', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'DRY_RUN_EXECUTED_NOT_MUTATED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"dispatch_mode":"DRY_RUN_ONLY", "queue_dispatch_mode":"SIMULATED_ONLY", "allow_real_job_creation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'env_hash_149d', 'ee_hash_149d', 'EXECUTION_NOT_ENABLED', 'DRY_RUN_ACTIVE_NOT_MUTATING', 'DRY_RUN_EXECUTED_NOT_MUTATED', 'SIMULATED_ONLY', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_REAL_JOB_CREATED', 'result_hash_149d', 'pack_hash_149d')`,
      [dispatcherId, JSON.stringify(nonExecution148), JSON.stringify(writeScope148)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_dispatcher_evidence
       (evidence_id, dispatcher_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '148.0', 'pack_hash_149d', ?, ?)`,
      [
        'de_' + dispatcherId,
        dispatcherId,
        JSON.stringify({ evidence_schema_version: '148.0', write_scope_attestation: writeScope148 }),
        JSON.stringify({
          phase148_dispatcher_id: dispatcherId,
          phase147_source_envelope_hash: 'env_hash_d',
          phase146_source_auth_hash: 'auth_hash_d',
          phase145_source_readiness_hash: 'rd_hash_d',
          phase144_source_approval_hash: 'apv_hash_d',
          phase143_preparation_id: 'prep_test_149d',
          phase142_review_id: 'rev_test_149d',
          phase141_source_simulation_hash: 'sim_hash_d',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_plan
       (plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        plan_status, plan_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, plan_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        plan_rules_json, plan_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_dispatcher_hash, source_dispatcher_evidence_pack_hash,
        execution_capability_status, execution_plan_status, plan_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'env_test_149d', 'ath_test_149d', 'rd_test_149d', 'apv_test_149d', 'prep_test_149d', 'rev_test_149d', 'sim_test_149d', 'exec_test_149d', 'cohort_test_149d', 'tenant_test_149d', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', '{"plan_mode":"MATERIALIZED_NOT_EXECUTABLE", "allow_real_execution":false}', '{}', '{}', '{}', '{}', '{}', '{"missing_plan_evaluation":true}', ?, ?, 'result_hash_149d', 'pack_hash_149d', 'EXECUTION_NOT_ENABLED', 'MATERIALIZED_NOT_EXECUTABLE', 'PLAN_MATERIALIZED_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [planId, dispatcherId, JSON.stringify(nonExecution149), JSON.stringify(writeScope149)]
    );
  }
}

(async () => {
  console.log('=== Smoke 149D: Review Workflow Governance ===\n');

  try {
    const dispatcherId = 'dsp_149d_1';
    const planId = 'pln_149d_1';
    await setupDispatcherAndPlan(dispatcherId, planId);

    // 1. Finalization blocks before evaluation
    try {
      await decision.finalizePlan(planId, 'admin');
      assert.fail('Should block finalization when evaluation/decision are not done');
    } catch (e) {
      if (e.message.includes('PLAN_EVALUATION_NOT_COMPLETED') || e.message.includes('PLAN_DECISION_REQUIRED')) {
        console.log('  PASS: Finalization blocked before evaluation.');
      } else {
        throw e;
      }
    }

    // 2. Evaluate
    await evaluator.evaluatePlan(planId, {
      operator_confirmed: true,
      kill_switch_verified: true
    }, 'admin');

    // 3. Record decision
    await decision.recordDecision(planId, 'PLAN_MATERIALIZED_NOT_EXECUTED', 'Execution plan verification complete.', 'admin');

    // 4. Build evidence
    await evidenceSvc.buildEvidencePack(planId, 'admin');

    // 5. Finalize
    const { plan } = await decision.finalizePlan(planId, 'admin');
    assert.strictEqual(plan.plan_status, 'FINALIZED');
    assert.strictEqual(plan.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(plan.execution_plan_status, 'MATERIALIZED_NOT_EXECUTABLE');
    assert.strictEqual(plan.plan_execution_status, 'PLAN_MATERIALIZED_NOT_EXECUTED');
    console.log('  PASS: Execution plan finalized successfully with safe non-execution markers.');

    // 6. Block modification after finalization
    try {
      await decision.recordDecision(planId, 'PLAN_BLOCKED_BY_GUARDRAIL', 'Change mind', 'admin');
      assert.fail('Should block modifications on finalized plan');
    } catch (e) {
      if (e.message.includes('PLAN_RECORD_ALREADY_FINALIZED')) {
        console.log('  PASS: Modifications blocked on finalized plan.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 149D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 149D:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
