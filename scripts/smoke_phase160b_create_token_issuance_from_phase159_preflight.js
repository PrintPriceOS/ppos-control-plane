'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const preflightBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedPreflight(preflightId, result = 'PREFLIGHT_PASSED_NOT_ISSUED') {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase159_tables: true, wrote_phase128_to_158_operational_tables: false };
  const config = { preflight_mode: 'TOKEN_ISSUANCE_PREFLIGHT_ONLY', allow_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_preflight_id: preflightId,
    source_activation_token_staging_id: 'ats_test_160b',
    source_activation_token_final_apv_id: 'apv_test_160b',
    source_activation_token_env_id: 'ate_test_160b',
    source_activation_token_auth_id: 'ath_test_160b',
    source_activation_handoff_id: 'ahf_test_160b',
    source_activation_decision_id: 'dec_test_160b',
    source_activation_lock_id: 'lock_test_160b',
    source_activation_auth_id: 'auth_test_160b',
    source_activation_readiness_id: 'rd_test_160b',
    source_plan_id: 'pln_test_160b',
    source_dispatcher_id: 'dsp_test_160b',
    source_envelope_id: 'env_test_160b',
    source_auth_id: 'ath_test_160b',
    source_readiness_id: 'rd_test_160b',
    source_approval_id: 'apv_test_160b',
    source_prep_id: 'prep_test_160b',
    source_review_id: 'rev_test_160b',
    source_simulation_id: 'sim_test_160b',
    source_execution_id: 'exec_test_160b',
    cohort_id: 'cohort_test_160b',
    tenant_id: 'tenant_test_160b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_preflight_status: 'FINALIZED',
    activation_token_preflight_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: config,
    token_preflight_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_preflight_rules_json: {},
    token_preflight_blockers_json: {},
    non_execution_attestation_json: nonExecution,
    write_scope_attestation_json: writeScope,
    source_activation_token_staging_hash: 'stg_hash_160b',
    source_token_material_hash: 'token_material_hash_160b',
    source_freeze_package_hash: 'lock_hash_160b',
    activation_token_preflight_hash: 'pfl_hash_160b',
    token_preflight_evidence_pack_hash: 'pfl_ep_hash_160b',
    evidence_pack_hash: 'pfl_ep_hash_160b',
    lineage_hash_chain_json: {},
    preflight_signatures_json: { security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true },
    preflight_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_PREFLIGHT_FINALIZED_NOT_EXECUTED',
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
    preflightBuilder._mockState.tokenPreflight.set(preflightId, record);
    preflightBuilder._mockState.rules.set(preflightId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_preflight_rules WHERE activation_token_preflight_id = ?', [preflightId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_preflight_evidence WHERE activation_token_preflight_id = ?', [preflightId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_preflight WHERE activation_token_preflight_id = ?', [preflightId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_preflight
       (activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_preflight_status, activation_token_preflight_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_preflight_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_preflight_rules_json, token_preflight_blockers_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_preflight_hash, token_preflight_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'ats_test_160b', 'apv_test_160b', 'ate_test_160b', 'ath_test_160b', 'ahf_test_160b', 'dec_test_160b', 'lock_test_160b', 'auth_test_160b', 'rd_test_160b', 'pln_test_160b', 'dsp_test_160b', 'env_test_160b', 'ath_test_160b', 'rd_test_160b', 'apv_test_160b', 'prep_test_160b', 'rev_test_160b', 'sim_test_160b', 'exec_test_160b', 'cohort_test_160b', 'tenant_test_160b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, ?, ?, ?, 'pfl_hash_160b', 'pfl_ep_hash_160b', 'pfl_ep_hash_160b',
        'EXECUTION_NOT_ENABLED', 'TOKEN_PREFLIGHT_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [preflightId, 'FINALIZED', result,
       JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope),
       record.source_activation_token_staging_hash, record.source_token_material_hash, record.source_freeze_package_hash]
    );
  }
}

(async () => {
  console.log('=== Smoke 160B: Create Token Issuance from Phase 159 Preflight ===\n');

  try {
    const preflightId1 = 'atp_160b_1';
    await setupFinalizedPreflight(preflightId1, 'PREFLIGHT_PASSED_NOT_ISSUED');

    const draftRes = await builder.createTokenIssuanceDraft(preflightId1, 'admin');
    assert.ok(draftRes.tokenIssuance);
    const issuanceId = draftRes.tokenIssuance.activation_token_issuance_id;
    assert.ok(issuanceId.startsWith('ati_'));

    const fetched = await builder.getTokenIssuance(issuanceId);
    assert.strictEqual(fetched.activation_token_issuance_status, 'DRAFT');
    assert.strictEqual(fetched.source_activation_token_preflight_id, preflightId1);
    console.log('  PASS: Draft token issuance created successfully from Phase 159 preflight.');

    // 2. Negative case: block draft from non-PREFLIGHT_PASSED_NOT_ISSUED
    const preflightId2 = 'atp_160b_2';
    await setupFinalizedPreflight(preflightId2, 'PREFLIGHT_FAILED_NOT_ISSUED');
    await assert.rejects(
      builder.createTokenIssuanceDraft(preflightId2, 'admin'),
      /TOKEN_PREFLIGHT_NOT_READY/
    );
    console.log('  PASS: Correctly blocked token issuance draft from non-PREFLIGHT_PASSED_NOT_ISSUED preflight.');

    console.log('\nSmoke 160B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 160B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
