'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenAuthBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const tokenEnvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenAuthFixture(activationTokenAuthId, status = 'FINALIZED', result = 'AUTHORIZED_NOT_ISSUED') {
  const writeScope155 = { writes_only_phase155_tables: true, wrote_phase128_to_154_operational_tables: false };
  const nonExecution155 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const tokenAuthRecord = {
    activation_token_auth_id: activationTokenAuthId,
    source_activation_handoff_id: 'ahf_test_156b',
    source_activation_decision_id: 'dec_test_156b',
    source_activation_lock_id: 'lock_test_156b',
    source_activation_auth_id: 'auth_test_156b',
    source_activation_readiness_id: 'rd_test_156b',
    source_plan_id: 'pln_test_156b',
    source_dispatcher_id: 'dsp_test_156b',
    source_envelope_id: 'env_test_156b',
    source_auth_id: 'ath_test_156b',
    source_readiness_id: 'rd_test_156b',
    source_approval_id: 'apv_test_156b',
    source_prep_id: 'prep_test_156b',
    source_review_id: 'rev_test_156b',
    source_simulation_id: 'sim_test_156b',
    source_execution_id: 'exec_test_156b',
    cohort_id: 'cohort_test_156b',
    tenant_id: 'tenant_test_156b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_auth_status: status,
    activation_token_auth_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { token_auth_mode: 'TOKEN_ISSUANCE_AUTHORIZATION_ONLY', allow_token_issue: false, token_status: 'PREPARED_NOT_ISSUED', token_issuance_status: 'AUTHORIZED_NOT_ISSUED', token_redeemable: false },
    token_auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_auth_rules_json: {},
    token_auth_blockers_json: {},
    non_execution_attestation_json: nonExecution155,
    write_scope_attestation_json: writeScope155,
    source_activation_handoff_hash: 'handoff_hash_156b',
    source_token_material_hash: 'token_material_hash_156b',
    source_freeze_package_hash: 'lock_hash_156b',
    activation_token_auth_hash: 'token_auth_hash_156b',
    token_auth_evidence_pack_hash: 'pack_hash_156b',
    evidence_pack_hash: 'pack_hash_156b',
    lineage_hash_chain_json: {},
    authorization_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED',
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
    tokenAuthBuilder._mockState.tokenAuth.set(activationTokenAuthId, tokenAuthRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_rules WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_evidence WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth WHERE activation_token_auth_id = ?', [activationTokenAuthId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_auth
       (activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_auth_status, activation_token_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_auth_rules_json, token_auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_handoff_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_token_auth_hash, token_auth_evidence_pack_hash, evidence_pack_hash)
       VALUES (?, 'ahf_test_156b', 'dec_test_156b', 'lock_test_156b', 'auth_test_156b', 'rd_test_156b', 'pln_test_156b', 'dsp_test_156b', 'env_test_156b', 'ath_test_156b', 'rd_test_156b', 'apv_test_156b', 'prep_test_156b', 'rev_test_156b', 'sim_test_156b', 'exec_test_156b', 'cohort_test_156b', 'tenant_test_156b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"token_auth_mode":"TOKEN_ISSUANCE_AUTHORIZATION_ONLY", "allow_token_issue":false, "token_status":"PREPARED_NOT_ISSUED", "token_issuance_status":"AUTHORIZED_NOT_ISSUED", "token_redeemable":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'handoff_hash_156b', 'token_material_hash_156b', 'lock_hash_156b', 'EXECUTION_NOT_ENABLED', 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'token_auth_hash_156b', 'pack_hash_156b', 'pack_hash_156b')`,
      [activationTokenAuthId, status, result, JSON.stringify(nonExecution155), JSON.stringify(writeScope155)]
    );
  }
}

(async () => {
  console.log('=== Smoke 156B: Create Token Env from Phase 155 Token Auth ===\n');

  try {
    // 1. Positive: create from finalized approved token auth record
    const finalizedId = 'ath_finalized_156b';
    await setupTokenAuthFixture(finalizedId, 'FINALIZED', 'AUTHORIZED_NOT_ISSUED');
    
    const { tokenEnv } = await tokenEnvBuilder.createTokenEnv(finalizedId, 'admin');
    assert.ok(tokenEnv.activation_token_env_id, 'activation_token_env_id should exist');
    assert.strictEqual(tokenEnv.source_activation_token_auth_id, finalizedId);
    assert.strictEqual(tokenEnv.activation_token_env_status, 'DRAFT');
    console.log('  PASS: Draft token envelope created successfully from finalized and approved token auth.');

    // 2. Negative: block from DRAFT token auth
    const draftId = 'ath_draft_156b';
    await setupTokenAuthFixture(draftId, 'DRAFT', 'AUTHORIZED_NOT_ISSUED');
    try {
      await tokenEnvBuilder.createTokenEnv(draftId, 'admin');
      assert.fail('Should have failed creating token env from DRAFT token auth');
    } catch (e) {
      if (e.message.includes('PHASE155_TOKEN_AUTH_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked token env draft creation from non-finalized token auth.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 156B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 156B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
