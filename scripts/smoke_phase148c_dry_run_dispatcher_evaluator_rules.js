'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const envelopeBuilder = require('../src/api/services/cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const dispatcherBuilder = require('../src/api/services/cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionDispatcherEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupEnvelopeAndDispatcher(envelopeId, dispatcherId, status = 'FINALIZED', result = 'NO_OP_EXECUTED_NOT_MUTATED', dspConfig = {}) {
  const writeScope147 = { writes_only_phase147_tables: true, wrote_phase128_to_146_operational_tables: false };
  const writeScope148 = { writes_only_phase148_tables: true, wrote_phase128_to_147_operational_tables: false };
  const nonExecution147 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution148 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultDspConfig = {
    dispatch_mode: 'DRY_RUN_ONLY',
    queue_dispatch_mode: 'SIMULATED_ONLY',
    allow_real_job_creation: false,
    allow_queue_writes: false,
    allow_runtime_writes: false,
    max_runtime_mutations: 0,
    max_execution_jobs: 0,
    rollback_hooks_required: true,
    kill_switch_required: true,
    operator_confirmation_required: true,
    snapshot_before_after_required: true
  };
  const activeDspConfig = { ...defaultDspConfig, ...dspConfig };

  const envelopeRecord = {
    envelope_id: envelopeId,
    source_auth_id: 'ath_test_148c',
    source_readiness_id: 'rd_test_148c',
    source_approval_id: 'apv_test_148c',
    source_prep_id: 'prep_test_148c',
    source_review_id: 'rev_test_148c',
    source_simulation_id: 'sim_test_148c',
    source_execution_id: 'exec_test_148c',
    cohort_id: 'cohort_test_148c',
    tenant_id: 'tenant_test_148c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    envelope_status: status,
    envelope_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { mode: 'NO_OP', max_cohorts: 0, max_participants: 0 },
    envelope_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    envelope_rules_json: {},
    envelope_blockers_json: {},
    non_execution_attestation_json: nonExecution147,
    write_scope_attestation_json: writeScope147,
    source_auth_hash: 'auth_hash_148c',
    source_auth_evidence_pack_hash: 'ae_hash_148c',
    envelope_result_hash: 'result_hash_148c',
    evidence_pack_hash: 'pack_hash_148c',
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

  const dispatcherRecord = {
    dispatcher_id: dispatcherId,
    source_envelope_id: envelopeId,
    source_auth_id: 'ath_test_148c',
    source_readiness_id: 'rd_test_148c',
    source_approval_id: 'apv_test_148c',
    source_prep_id: 'prep_test_148c',
    source_review_id: 'rev_test_148c',
    source_simulation_id: 'sim_test_148c',
    source_execution_id: 'exec_test_148c',
    cohort_id: 'cohort_test_148c',
    tenant_id: 'tenant_test_148c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    dispatcher_status: 'DRAFT',
    dispatcher_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeDspConfig,
    dispatcher_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    dispatcher_rules_json: {},
    dispatcher_blockers_json: { missing_dispatcher_evaluation: true },
    non_execution_attestation_json: nonExecution148,
    write_scope_attestation_json: writeScope148,
    source_envelope_hash: 'result_hash_148c',
    source_envelope_evidence_pack_hash: 'pack_hash_148c',
    dispatcher_result_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
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
    envelopeBuilder._mockState.envelope.set(envelopeId, envelopeRecord);
    dispatcherBuilder._mockState.dispatcher.set(dispatcherId, dispatcherRecord);
    dispatcherBuilder._mockState.rules.set(dispatcherId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_envelope_rules WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_envelope_evidence WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_no_op_envelope WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_dispatcher_rules WHERE dispatcher_id = ?', [dispatcherId]);
    await db.query('DELETE FROM cb_cohort_intervention_dispatcher_evidence WHERE dispatcher_id = ?', [dispatcherId]);
    await db.query('DELETE FROM cb_cohort_intervention_dry_run_dispatcher WHERE dispatcher_id = ?', [dispatcherId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_no_op_envelope
       (envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        envelope_status, envelope_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, envelope_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        envelope_rules_json, envelope_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_auth_hash, source_auth_evidence_pack_hash,
        execution_capability_status, envelope_execution_status, no_op_execution_result, runtime_mutation_status, job_dispatch_status, envelope_result_hash, evidence_pack_hash)
       VALUES (?, 'ath_test_148c', 'rd_test_148c', 'apv_test_148c', 'prep_test_148c', 'rev_test_148c', 'sim_test_148c', 'exec_test_148c', 'cohort_test_148c', 'tenant_test_148c', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"mode":"NO_OP", "max_cohorts":0, "max_participants":0}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'auth_hash_148c', 'ae_hash_148c', 'EXECUTION_NOT_ENABLED', 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING', 'NO_OP_EXECUTED_NOT_MUTATED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_JOB_DISPATCHED', 'result_hash_148c', 'pack_hash_148c')`,
      [envelopeId, status, result, JSON.stringify(nonExecution147), JSON.stringify(writeScope147)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_dry_run_dispatcher
       (dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        dispatcher_status, dispatcher_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, dispatcher_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        dispatcher_rules_json, dispatcher_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_envelope_hash, source_envelope_evidence_pack_hash,
        execution_capability_status, dispatcher_execution_status, dry_run_execution_result, queue_dispatch_status, runtime_mutation_status, job_creation_status)
       VALUES (?, ?, 'ath_test_148c', 'rd_test_148c', 'apv_test_148c', 'prep_test_148c', 'rev_test_148c', 'sim_test_148c', 'exec_test_148c', 'cohort_test_148c', 'tenant_test_148c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_dispatcher_evaluation":true}', ?, ?, 'result_hash_148c', 'pack_hash_148c', 'EXECUTION_NOT_ENABLED', 'DRY_RUN_ACTIVE_NOT_MUTATING', 'DRY_RUN_EXECUTED_NOT_MUTATED', 'SIMULATED_ONLY', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_REAL_JOB_CREATED')`,
      [dispatcherId, envelopeId, JSON.stringify(activeDspConfig), JSON.stringify(nonExecution148), JSON.stringify(writeScope148)]
    );
  }
}

(async () => {
  console.log('=== Smoke 148C: Dry-Run Dispatcher Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const a1 = 'env_148c_1';
    const e1 = 'dsp_148c_1';
    await setupEnvelopeAndDispatcher(a1, e1, 'FINALIZED', 'NO_OP_EXECUTED_NOT_MUTATED');
    
    const passed = await evaluator.evaluateDispatcher(e1, {
      operator_confirmed: true,
      kill_switch_verified: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await dispatcherBuilder.getDispatcher(e1);
    assert.strictEqual(record.dispatcher_status, 'EVALUATED');
    assert.strictEqual(record.dispatcher_result, 'DRY_RUN_EXECUTED_NOT_MUTATED');
    console.log('  PASS: Evaluated dry-run dispatcher record successfully.');

    // 2. Negative: fail check if operator is missing
    const a2 = 'env_148c_2';
    const e2 = 'dsp_148c_2';
    await setupEnvelopeAndDispatcher(a2, e2, 'FINALIZED', 'NO_OP_EXECUTED_NOT_MUTATED');
    
    const passedFail = await evaluator.evaluateDispatcher(e2, {
      operator_confirmed: false,
      kill_switch_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await dispatcherBuilder.getDispatcher(e2);
    assert.strictEqual(record.dispatcher_status, 'BLOCKED');
    assert.strictEqual(record.dispatcher_result, 'DRY_RUN_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when operator confirmation is missing.');

    console.log('\nSmoke 148C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 148C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
