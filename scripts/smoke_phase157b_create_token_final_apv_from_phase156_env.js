'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenEnvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const tokenFinalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenEnvFixture(activationTokenEnvId, status = 'FINALIZED', result = 'ENVELOPE_PREPARED_NOT_ISSUED') {
  const writeScope156 = { writes_only_phase156_tables: true, wrote_phase128_to_155_operational_tables: false };
  const nonExecution156 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const tokenEnvRecord = {
    activation_token_env_id: activationTokenEnvId,
    source_activation_token_auth_id: 'ath_test_157b',
    source_activation_handoff_id: 'ahf_test_157b',
    source_activation_decision_id: 'dec_test_157b',
    source_activation_lock_id: 'lock_test_157b',
    source_activation_auth_id: 'auth_test_157b',
    source_activation_readiness_id: 'rd_test_157b',
    source_plan_id: 'pln_test_157b',
    source_dispatcher_id: 'dsp_test_157b',
    source_envelope_id: 'env_test_157b',
    source_auth_id: 'ath_test_157b',
    source_readiness_id: 'rd_test_157b',
    source_approval_id: 'apv_test_157b',
    source_prep_id: 'prep_test_157b',
    source_review_id: 'rev_test_157b',
    source_simulation_id: 'sim_test_157b',
    source_execution_id: 'exec_test_157b',
    cohort_id: 'cohort_test_157b',
    tenant_id: 'tenant_test_157b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_env_status: status,
    activation_token_env_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { token_envelope_mode: 'ISSUANCE_ENVELOPE_PREPARATION_ONLY', allow_token_issue: false, token_status: 'PREPARED_NOT_ISSUED', token_issuance_status: 'ENVELOPE_PREPARED_NOT_ISSUED', token_redeemable: false },
    token_env_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_env_rules_json: {},
    token_env_blockers_json: {},
    non_execution_attestation_json: nonExecution156,
    write_scope_attestation_json: writeScope156,
    source_activation_token_auth_hash: 'token_auth_hash_157b',
    source_token_material_hash: 'token_material_hash_157b',
    source_freeze_package_hash: 'lock_hash_157b',
    activation_token_env_hash: 'token_env_hash_157b',
    token_env_evidence_pack_hash: 'pack_hash_157b',
    evidence_pack_hash: 'pack_hash_157b',
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_ENV_FINALIZED_NOT_EXECUTED',
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
    tokenEnvBuilder._mockState.tokenEnv.set(activationTokenEnvId, tokenEnvRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env_rules WHERE activation_token_env_id = ?', [activationTokenEnvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env_evidence WHERE activation_token_env_id = ?', [activationTokenEnvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env WHERE activation_token_env_id = ?', [activationTokenEnvId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_env
       (activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_env_status, activation_token_env_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_env_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_env_rules_json, token_env_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_auth_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_token_env_hash, token_env_evidence_pack_hash, evidence_pack_hash)
       VALUES (?, 'ath_test_157b', 'ahf_test_157b', 'dec_test_157b', 'lock_test_157b', 'auth_test_157b', 'rd_test_157b', 'pln_test_157b', 'dsp_test_157b', 'env_test_157b', 'ath_test_157b', 'rd_test_157b', 'apv_test_157b', 'prep_test_157b', 'rev_test_157b', 'sim_test_157b', 'exec_test_157b', 'cohort_test_157b', 'tenant_test_157b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"token_envelope_mode":"ISSUANCE_ENVELOPE_PREPARATION_ONLY", "allow_token_issue":false, "token_status":"PREPARED_NOT_ISSUED", "token_issuance_status":"ENVELOPE_PREPARED_NOT_ISSUED", "token_redeemable":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'token_auth_hash_157b', 'token_material_hash_157b', 'lock_hash_157b', 'EXECUTION_NOT_ENABLED', 'TOKEN_ENV_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'token_env_hash_157b', 'pack_hash_157b', 'pack_hash_157b')`,
      [activationTokenEnvId, status, result, JSON.stringify(nonExecution156), JSON.stringify(writeScope156)]
    );
  }
}

(async () => {
  console.log('=== Smoke 157B: Create Token Final Approval from Phase 156 Envelope ===\n');

  try {
    // 1. Positive: create from finalized approved envelope
    const envId = 'ate_finalized_157b';
    await setupTokenEnvFixture(envId, 'FINALIZED', 'ENVELOPE_PREPARED_NOT_ISSUED');
    
    const { tokenFinalApv } = await tokenFinalApvBuilder.createTokenFinalApv(envId, 'admin');
    assert.ok(tokenFinalApv.activation_token_final_apv_id, 'activation_token_final_apv_id should exist');
    assert.strictEqual(tokenFinalApv.source_activation_token_env_id, envId);
    assert.strictEqual(tokenFinalApv.activation_token_final_apv_status, 'DRAFT');
    console.log('  PASS: Draft token approval created successfully.');

    // 2. Negative: block from non-finalized envelope
    const envDraftId = 'ate_draft_157b';
    await setupTokenEnvFixture(envDraftId, 'DRAFT', 'ENVELOPE_PREPARED_NOT_ISSUED');
    try {
      await tokenFinalApvBuilder.createTokenFinalApv(envDraftId, 'admin');
      assert.fail('Should have failed creating draft from non-finalized envelope');
    } catch (e) {
      if (e.message.includes('PHASE156_TOKEN_ENV_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked draft creation from non-finalized envelope.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 157B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 157B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
