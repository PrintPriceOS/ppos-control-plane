'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const dispatcherBuilder = require('../src/api/services/cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const planBuilder = require('../src/api/services/cohortInterventionExecutionPlanBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupDispatcherFixture(dispatcherId, status = 'FINALIZED', result = 'DRY_RUN_EXECUTED_NOT_MUTATED') {
  const writeScope148 = { writes_only_phase148_tables: true, wrote_phase128_to_147_operational_tables: false };
  const nonExecution148 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const dispatcherRecord = {
    dispatcher_id: dispatcherId,
    source_envelope_id: 'env_test_149b',
    source_auth_id: 'ath_test_149b',
    source_readiness_id: 'rd_test_149b',
    source_approval_id: 'apv_test_149b',
    source_prep_id: 'prep_test_149b',
    source_review_id: 'rev_test_149b',
    source_simulation_id: 'sim_test_149b',
    source_execution_id: 'exec_test_149b',
    cohort_id: 'cohort_test_149b',
    tenant_id: 'tenant_test_149b',
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
    source_envelope_hash: 'env_hash_149b',
    source_envelope_evidence_pack_hash: 'ee_hash_149b',
    dispatcher_result_hash: 'result_hash_149b',
    evidence_pack_hash: 'pack_hash_149b',
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

  if (!isProdLike) {
    dispatcherBuilder._mockState.dispatcher.set(dispatcherId, dispatcherRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_dispatcher_rules WHERE dispatcher_id = ?', [dispatcherId]);
    await db.query('DELETE FROM cb_cohort_intervention_dispatcher_evidence WHERE dispatcher_id = ?', [dispatcherId]);
    await db.query('DELETE FROM cb_cohort_intervention_dry_run_dispatcher WHERE dispatcher_id = ?', [dispatcherId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_dry_run_dispatcher
       (dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        dispatcher_status, dispatcher_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, dispatcher_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        dispatcher_rules_json, dispatcher_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_envelope_hash, source_envelope_evidence_pack_hash,
        execution_capability_status, dispatcher_execution_status, dry_run_execution_result, queue_dispatch_status, runtime_mutation_status, job_creation_status, dispatcher_result_hash, evidence_pack_hash)
       VALUES (?, 'env_test_149b', 'ath_test_149b', 'rd_test_149b', 'apv_test_149b', 'prep_test_149b', 'rev_test_149b', 'sim_test_149b', 'exec_test_149b', 'cohort_test_149b', 'tenant_test_149b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"dispatch_mode":"DRY_RUN_ONLY", "queue_dispatch_mode":"SIMULATED_ONLY", "allow_real_job_creation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'env_hash_149b', 'ee_hash_149b', 'EXECUTION_NOT_ENABLED', 'DRY_RUN_ACTIVE_NOT_MUTATING', 'DRY_RUN_EXECUTED_NOT_MUTATED', 'SIMULATED_ONLY', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_REAL_JOB_CREATED', 'result_hash_149b', 'pack_hash_149b')`,
      [dispatcherId, status, result, JSON.stringify(nonExecution148), JSON.stringify(writeScope148)]
    );
  }
}

(async () => {
  console.log('=== Smoke 149B: Create Plan from Phase 148 Dispatcher ===\n');

  try {
    // 1. Positive: create from finalized approved dispatcher record
    const finalizedId = 'dsp_finalized_149b';
    await setupDispatcherFixture(finalizedId, 'FINALIZED', 'DRY_RUN_EXECUTED_NOT_MUTATED');
    
    const { plan } = await planBuilder.createPlan(finalizedId, 'admin');
    assert.ok(plan.plan_id, 'plan_id should exist');
    assert.strictEqual(plan.source_dispatcher_id, finalizedId);
    assert.strictEqual(plan.plan_status, 'DRAFT');
    console.log('  PASS: Draft plan created successfully from finalized and approved dispatcher.');

    // 2. Negative: block from DRAFT dispatcher
    const draftId = 'dsp_draft_149b';
    await setupDispatcherFixture(draftId, 'DRAFT', 'DRY_RUN_EXECUTED_NOT_MUTATED');
    try {
      await planBuilder.createPlan(draftId, 'admin');
      assert.fail('Should have failed creating plan from DRAFT dispatcher');
    } catch (e) {
      if (e.message.includes('PHASE148_DISPATCHER_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked plan draft creation from non-finalized dispatcher.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 149B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 149B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
