'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const stagingBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightDecisionService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedStaging(stagingId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase158_tables: true, wrote_phase128_to_157_operational_tables: false };
  const config = { staging_mode: 'TOKEN_STAGING_ONLY', allow_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_staging_id: stagingId,
    source_activation_token_final_apv_id: 'apv_test_159d',
    activation_token_staging_status: 'FINALIZED',
    activation_token_staging_result: 'STAGED_NOT_ISSUED',
    risk_level: 'LOW', confidence_level: 'HIGH',
    projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS',
    canary_envelope_json: config,
    non_execution_attestation_json: nonExecution,
    write_scope_attestation_json: writeScope,
    source_activation_token_final_apv_hash: 'apv_hash_159d',
    source_token_material_hash: 'token_mat_hash_159d',
    source_freeze_package_hash: 'lock_hash_159d',
    activation_token_staging_hash: 'stg_hash_159d',
    token_staging_evidence_pack_hash: 'ep_hash_159d',
    evidence_pack_hash: 'ep_hash_159d',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE',
    plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED',
    queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    finalized_by: 'admin', finalized_at: new Date(),
    created_at: new Date(), updated_at: new Date()
  };

  if (!isProdLike) {
    stagingBuilder._mockState.tokenStaging.set(stagingId, {
      ...record,
      source_activation_token_env_id: 'ate_test_159d',
      source_activation_token_auth_id: 'ath_test_159d',
      source_activation_handoff_id: 'ahf_test_159d',
      source_activation_decision_id: 'dec_test_159d',
      source_activation_lock_id: 'lock_test_159d',
      source_activation_auth_id: 'auth_test_159d',
      source_activation_readiness_id: 'rd_test_159d',
      source_plan_id: 'pln_test_159d',
      source_dispatcher_id: 'dsp_test_159d',
      source_envelope_id: 'env_test_159d',
      source_auth_id: 'ath_test_159d',
      source_readiness_id: 'rd_test_159d',
      source_approval_id: 'apv_test_159d',
      source_prep_id: 'prep_test_159d',
      source_review_id: null, source_simulation_id: null, source_execution_id: null,
      cohort_id: null, tenant_id: null, simulation_type: 'SIMULATE_COHORT_PAUSE',
      token_staging_summary_json: {}, impact_review_json: {},
      rollback_review_json: {}, guardrail_review_json: {},
      token_staging_rules_json: {}, token_staging_blockers_json: {},
      lineage_hash_chain_json: {}, staging_signatures_json: {}, staging_metadata_json: {},
      approved_by: null, approved_at: null, rejected_by: null, rejected_at: null
    });
    stagingBuilder._mockState.rules.set(stagingId, []);
    return;
  }

  // Real DB: clean up then insert
  await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging_rules WHERE activation_token_staging_id = ?', [stagingId]);
  await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging_evidence WHERE activation_token_staging_id = ?', [stagingId]);
  await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging WHERE activation_token_staging_id = ?', [stagingId]);

  await db.query(
    `INSERT INTO cb_cohort_intervention_activation_token_staging
     (activation_token_staging_id, source_activation_token_final_apv_id,
      source_activation_token_env_id, source_activation_token_auth_id,
      source_activation_handoff_id, source_activation_decision_id,
      source_activation_lock_id, source_activation_auth_id,
      source_activation_readiness_id, source_plan_id, source_dispatcher_id,
      source_envelope_id, source_auth_id, source_readiness_id,
      source_approval_id, source_prep_id,
      activation_token_staging_status, activation_token_staging_result,
      risk_level, confidence_level,
      projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
      guardrail_status, write_scope_status,
      canary_envelope_json, non_execution_attestation_json, write_scope_attestation_json,
      source_activation_token_final_apv_hash, source_token_material_hash,
      source_freeze_package_hash, activation_token_staging_hash,
      token_staging_evidence_pack_hash, evidence_pack_hash,
      execution_capability_status, activation_execution_status,
      package_freeze_status, plan_executable_status,
      job_creation_status, queue_dispatch_status, runtime_mutation_status,
      finalized_by, finalized_at)
     VALUES (?, 'apv_test_159d', 'ate_test_159d', 'ath_test_159d',
      'ahf_test_159d', 'dec_test_159d', 'lock_test_159d', 'auth_test_159d',
      'rd_test_159d', 'pln_test_159d', 'dsp_test_159d', 'env_test_159d',
      'ath_test_159d', 'rd_test_159d', 'apv_test_159d', 'prep_test_159d',
      'FINALIZED', 'STAGED_NOT_ISSUED',
      'LOW', 'HIGH', 35.0, 80.0, 95.0,
      'PASS', 'PASS',
      ?, ?, ?,
      'apv_hash_159d', 'token_mat_hash_159d',
      'lock_hash_159d', 'stg_hash_159d', 'ep_hash_159d', 'ep_hash_159d',
      'EXECUTION_NOT_ENABLED', 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
      'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE',
      'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      'admin', NOW())`,
    [stagingId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
  );
}

(async () => {
  console.log('=== Smoke 159D: Review Workflow Governance ===\n');

  try {
    const stagingId = 'ats_159d_1';
    await setupFinalizedStaging(stagingId);

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
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
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
