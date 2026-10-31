'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const planBuilder = require('../src/api/services/cohortInterventionExecutionPlanBuilderService').serviceInstance;
const rdBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupPlanFixture(planId, status = 'FINALIZED', result = 'PLAN_MATERIALIZED_NOT_EXECUTED') {
  const writeScope149 = { writes_only_phase149_tables: true, wrote_phase128_to_148_operational_tables: false };
  const nonExecution149 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const planRecord = {
    plan_id: planId,
    source_dispatcher_id: 'dsp_test_150b',
    source_envelope_id: 'env_test_150b',
    source_auth_id: 'ath_test_150b',
    source_readiness_id: 'rd_test_150b',
    source_approval_id: 'apv_test_150b',
    source_prep_id: 'prep_test_150b',
    source_review_id: 'rev_test_150b',
    source_simulation_id: 'sim_test_150b',
    source_execution_id: 'exec_test_150b',
    cohort_id: 'cohort_test_150b',
    tenant_id: 'tenant_test_150b',
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
    source_dispatcher_hash: 'dsp_hash_150b',
    source_dispatcher_evidence_pack_hash: 'de_hash_150b',
    plan_materialization_hash: 'plan_hash_150b',
    evidence_pack_hash: 'pack_hash_150b',
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
    planBuilder._mockState.plan.set(planId, planRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_plan_rules WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_plan_evidence WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_plan WHERE plan_id = ?', [planId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_plan
       (plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        plan_status, plan_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, plan_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        plan_rules_json, plan_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_dispatcher_hash, source_dispatcher_evidence_pack_hash,
        execution_capability_status, execution_plan_status, plan_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, plan_materialization_hash, evidence_pack_hash)
       VALUES (?, 'dsp_test_150b', 'env_test_150b', 'ath_test_150b', 'rd_test_150b', 'apv_test_150b', 'prep_test_150b', 'rev_test_150b', 'sim_test_150b', 'exec_test_150b', 'cohort_test_150b', 'tenant_test_150b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"plan_mode":"MATERIALIZED_NOT_EXECUTABLE", "allow_real_execution":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'dsp_hash_150b', 'de_hash_150b', 'EXECUTION_NOT_ENABLED', 'MATERIALIZED_NOT_EXECUTABLE', 'PLAN_MATERIALIZED_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'plan_hash_150b', 'pack_hash_150b')`,
      [planId, status, result, JSON.stringify(nonExecution149), JSON.stringify(writeScope149)]
    );
  }
}

(async () => {
  console.log('=== Smoke 150B: Create Activation Readiness from Phase 149 Plan ===\n');

  try {
    // 1. Positive: create from finalized approved plan record
    const finalizedId = 'pln_finalized_150b';
    await setupPlanFixture(finalizedId, 'FINALIZED', 'PLAN_MATERIALIZED_NOT_EXECUTED');
    
    const { readiness } = await rdBuilder.createReadiness(finalizedId, 'admin');
    assert.ok(readiness.activation_rd_id, 'activation_rd_id should exist');
    assert.strictEqual(readiness.source_plan_id, finalizedId);
    assert.strictEqual(readiness.activation_readiness_status, 'DRAFT');
    console.log('  PASS: Draft readiness created successfully from finalized and approved plan.');

    // 2. Negative: block from DRAFT plan
    const draftId = 'pln_draft_150b';
    await setupPlanFixture(draftId, 'DRAFT', 'PLAN_MATERIALIZED_NOT_EXECUTED');
    try {
      await rdBuilder.createReadiness(draftId, 'admin');
      assert.fail('Should have failed creating readiness from DRAFT plan');
    } catch (e) {
      if (e.message.includes('PHASE149_PLAN_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked readiness draft creation from non-finalized plan.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 150B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 150B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
