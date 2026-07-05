'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const stagingBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightDecisionService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

function makeFinalizedStagingRecord(stagingId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase158_tables: true, wrote_phase128_to_157_operational_tables: false };
  const config = { staging_mode: 'TOKEN_STAGING_ONLY', allow_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  return {
    activation_token_staging_id: stagingId,
    source_activation_token_final_apv_id: 'apv_test_159d', source_activation_token_env_id: 'ate_test_159d',
    source_activation_token_auth_id: 'ath_test_159d', source_activation_handoff_id: 'ahf_test_159d',
    source_activation_decision_id: 'dec_test_159d', source_activation_lock_id: 'lock_test_159d',
    source_activation_auth_id: 'auth_test_159d', source_activation_readiness_id: 'rd_test_159d',
    source_plan_id: 'pln_test_159d', source_dispatcher_id: 'dsp_test_159d', source_envelope_id: 'env_test_159d',
    source_auth_id: 'ath_test_159d', source_readiness_id: 'rd_test_159d', source_approval_id: 'apv_test_159d',
    source_prep_id: 'prep_test_159d', source_review_id: null, source_simulation_id: null, source_execution_id: null,
    cohort_id: null, tenant_id: null, simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_staging_status: 'FINALIZED', activation_token_staging_result: 'STAGED_NOT_ISSUED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS',
    canary_envelope_json: config, token_staging_summary_json: {}, impact_review_json: {},
    rollback_review_json: {}, guardrail_review_json: {}, token_staging_rules_json: {}, token_staging_blockers_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_final_apv_hash: 'apv_hash_159d', source_token_material_hash: 'token_mat_hash_159d',
    source_freeze_package_hash: 'lock_hash_159d', activation_token_staging_hash: 'stg_hash_159d',
    token_staging_evidence_pack_hash: 'ep_hash_159d', evidence_pack_hash: 'ep_hash_159d',
    lineage_hash_chain_json: {}, staging_signatures_json: {}, staging_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null,
    finalized_by: 'admin', finalized_at: new Date(), created_at: new Date(), updated_at: new Date()
  };
}

(async () => {
  console.log('=== Smoke 159D: Review Workflow Governance ===\n');

  try {
    const stagingId = 'ats_159d_1';
    stagingBuilder._mockState.tokenStaging.set(stagingId, makeFinalizedStagingRecord(stagingId));
    stagingBuilder._mockState.rules.set(stagingId, []);

    // 1. Finalization blocked before evaluation
    const draft = await builder.createTokenPreflightDraft(stagingId, 'admin');
    const preflightId = draft.tokenPreflight.activation_token_preflight_id;

    await assert.rejects(
      decisionSvc.finalizePreflight(preflightId, 'admin'),
      /TOKEN_PREFLIGHT_NOT_PASSED/
    );
    console.log('  PASS: Finalization blocked before evaluation.');

    // 2. Full workflow: DRAFT -> EVALUATED -> PREFLIGHT_PASSED -> FINALIZED
    await evaluator.evaluateTokenPreflight(preflightId, {
      security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(preflightId, 'APPROVE', 'All preflight checks passed', 'admin');
    const passedRecord = await builder.getTokenPreflight(preflightId);
    assert.strictEqual(passedRecord.activation_token_preflight_status, 'PREFLIGHT_PASSED');

    const finalRecord = await decisionSvc.finalizePreflight(preflightId, 'admin');
    assert.strictEqual(finalRecord.activation_token_preflight_status, 'FINALIZED');
    assert.strictEqual(finalRecord.activation_token_preflight_result, 'PREFLIGHT_PASSED_NOT_ISSUED');
    assert.strictEqual(finalRecord.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(finalRecord.plan_executable_status, 'NOT_EXECUTABLE');
    assert.strictEqual(finalRecord.job_creation_status, 'NO_REAL_JOB_CREATED');
    assert.strictEqual(finalRecord.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    assert.strictEqual(finalRecord.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Activation token preflight finalized successfully with safe non-execution markers.');

    // 3. Mutations blocked on finalized record
    await assert.rejects(
      builder.updateTokenPreflight(preflightId, { activation_token_preflight_status: 'DRAFT' }),
      /TOKEN_PREFLIGHT_IMMUTABLE/
    );
    console.log('  PASS: Modifications blocked on finalized token preflight.');

    console.log('\nSmoke 159D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 159D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
