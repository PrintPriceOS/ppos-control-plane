'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const stagingBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedStaging(stagingId, result = 'STAGED_NOT_ISSUED') {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase158_tables: true, wrote_phase128_to_157_operational_tables: false };
  const config = { staging_mode: 'TOKEN_STAGING_ONLY', allow_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_staging_id: stagingId,
    source_activation_token_final_apv_id: 'apv_test_159b',
    source_activation_token_env_id: 'ate_test_159b',
    source_activation_token_auth_id: 'ath_test_159b',
    source_activation_handoff_id: 'ahf_test_159b',
    source_activation_decision_id: 'dec_test_159b',
    source_activation_lock_id: 'lock_test_159b',
    source_activation_auth_id: 'auth_test_159b',
    source_activation_readiness_id: 'rd_test_159b',
    source_plan_id: 'pln_test_159b',
    source_dispatcher_id: 'dsp_test_159b',
    source_envelope_id: 'env_test_159b',
    source_auth_id: 'ath_test_159b',
    source_readiness_id: 'rd_test_159b',
    source_approval_id: 'apv_test_159b',
    source_prep_id: 'prep_test_159b',
    source_review_id: 'rev_test_159b',
    source_simulation_id: 'sim_test_159b',
    source_execution_id: 'exec_test_159b',
    cohort_id: 'cohort_test_159b',
    tenant_id: 'tenant_test_159b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_staging_status: 'FINALIZED',
    activation_token_staging_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: config,
    token_staging_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_staging_rules_json: {},
    token_staging_blockers_json: {},
    non_execution_attestation_json: nonExecution,
    write_scope_attestation_json: writeScope,
    source_activation_token_final_apv_hash: 'apv_hash_159b',
    source_token_material_hash: 'token_material_hash_159b',
    source_freeze_package_hash: 'lock_hash_159b',
    activation_token_staging_hash: 'stg_hash_159b',
    token_staging_evidence_pack_hash: 'stg_ep_hash_159b',
    evidence_pack_hash: 'stg_ep_hash_159b',
    lineage_hash_chain_json: {},
    staging_signatures_json: { security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true },
    staging_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE',
    plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED',
    queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null,
    finalized_by: 'admin', finalized_at: new Date(),
    created_at: new Date(), updated_at: new Date()
  };

  if (!isProdLike) {
    stagingBuilder._mockState.tokenStaging.set(stagingId, record);
    stagingBuilder._mockState.rules.set(stagingId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging_rules WHERE activation_token_staging_id = ?', [stagingId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging_evidence WHERE activation_token_staging_id = ?', [stagingId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging WHERE activation_token_staging_id = ?', [stagingId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_staging
       (activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_staging_status, activation_token_staging_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_staging_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_staging_rules_json, token_staging_blockers_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_final_apv_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_staging_hash, token_staging_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'ate_test_159b', 'ath_test_159b', 'ahf_test_159b', 'dec_test_159b', 'lock_test_159b', 'auth_test_159b', 'rd_test_159b', 'pln_test_159b', 'dsp_test_159b', 'env_test_159b', 'ath_test_159b', 'rd_test_159b', 'apv_test_159b', 'prep_test_159b', 'rev_test_159b', 'sim_test_159b', 'exec_test_159b', 'cohort_test_159b', 'tenant_test_159b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, ?, ?, ?, 'stg_hash_159b', 'stg_ep_hash_159b', 'stg_ep_hash_159b',
        'EXECUTION_NOT_ENABLED', 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [stagingId, record.source_activation_token_final_apv_id,
       'FINALIZED', result,
       JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope),
       record.source_activation_token_final_apv_hash, record.source_token_material_hash, record.source_freeze_package_hash]
    );
  }
}

(async () => {
  console.log('=== Smoke 159B: Create Token Preflight from Phase 158 Staging ===\n');

  try {
    // 1. Positive case: create draft from finalized, STAGED_NOT_ISSUED staging
    const stagingId1 = 'ats_159b_1';
    await setupFinalizedStaging(stagingId1, 'STAGED_NOT_ISSUED');

    const draftRes = await builder.createTokenPreflightDraft(stagingId1, 'admin');
    assert.ok(draftRes.tokenPreflight);
    const preflightId = draftRes.tokenPreflight.activation_token_preflight_id;
    assert.ok(preflightId.startsWith('atp_'));

    const fetched = await builder.getTokenPreflight(preflightId);
    assert.strictEqual(fetched.activation_token_preflight_status, 'DRAFT');
    assert.strictEqual(fetched.source_activation_token_staging_id, stagingId1);
    console.log('  PASS: Draft token preflight created successfully from Phase 158 staging.');

    // 2. Negative case: block draft from non-STAGED_NOT_ISSUED staging
    const stagingId2 = 'ats_159b_2';
    await setupFinalizedStaging(stagingId2, 'STAGING_REJECTED_NOT_ISSUED');
    await assert.rejects(
      builder.createTokenPreflightDraft(stagingId2, 'admin'),
      /TOKEN_STAGING_NOT_READY/
    );
    console.log('  PASS: Correctly blocked preflight draft from non-STAGED_NOT_ISSUED staging.');

    console.log('\nSmoke 159B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 159B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
