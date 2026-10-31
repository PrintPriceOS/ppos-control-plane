'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedIssuance(issuanceId, result = 'ISSUANCE_RECORDED_NOT_REDEEMABLE') {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase160_tables: true, wrote_phase128_to_159_operational_tables: false };
  const config = { issuance_mode: 'TOKEN_ISSUANCE_RECORD_ONLY', allow_token_issuance_record: true, allow_usable_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_161b',
    source_activation_token_staging_id: 'ats_test_161b',
    source_activation_token_final_apv_id: 'apv_test_161b',
    source_activation_token_env_id: 'ate_test_161b',
    source_activation_handoff_id: 'ahf_test_161b',
    source_activation_decision_id: 'dec_test_161b',
    source_activation_lock_id: 'lock_test_161b',
    source_activation_auth_id: 'auth_test_161b',
    source_activation_readiness_id: 'rd_test_161b',
    source_plan_id: 'pln_test_161b',
    source_dispatcher_id: 'dsp_test_161b',
    source_envelope_id: 'env_test_161b',
    source_auth_id: 'ath_test_161b',
    source_readiness_id: 'rd_test_161b',
    source_approval_id: 'apv_test_161b',
    source_prep_id: 'prep_test_161b',
    source_review_id: 'rev_test_161b',
    source_simulation_id: 'sim_test_161b',
    source_execution_id: 'exec_test_161b',
    cohort_id: 'cohort_test_161b',
    tenant_id: 'tenant_test_161b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_issuance_status: 'FINALIZED',
    activation_token_issuance_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: config,
    token_issuance_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_issuance_rules_json: {},
    token_issuance_blockers_json: {},
    non_execution_attestation_json: nonExecution,
    write_scope_attestation_json: writeScope,
    non_redeemable_token_record_json: {},
    source_activation_token_preflight_hash: 'pfl_hash_161b',
    source_activation_token_staging_hash: 'stg_hash_161b',
    source_token_material_hash: 'token_material_hash_161b',
    source_freeze_package_hash: 'lock_hash_161b',
    activation_token_issuance_hash: 'iss_hash_161b',
    token_issuance_evidence_pack_hash: 'iss_ep_hash_161b',
    evidence_pack_hash: 'iss_ep_hash_161b',
    lineage_hash_chain_json: {},
    issuance_signatures_json: { security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true },
    issuance_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
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
    issuanceBuilder._mockState.tokenIssuance.set(issuanceId, record);
    issuanceBuilder._mockState.rules.set(issuanceId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_issuance_rules WHERE activation_token_issuance_id = ?', [issuanceId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_issuance_evidence WHERE activation_token_issuance_id = ?', [issuanceId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_issuance WHERE activation_token_issuance_id = ?', [issuanceId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_issuance
       (activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_issuance_status, activation_token_issuance_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_issuance_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_issuance_rules_json, token_issuance_blockers_json, non_execution_attestation_json, write_scope_attestation_json, non_redeemable_token_record_json,
        source_activation_token_preflight_hash, source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_issuance_hash, token_issuance_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'atp_test_161b', 'ats_test_161b', 'apv_test_161b', 'ate_test_161b', 'ahf_test_161b', 'dec_test_161b', 'lock_test_161b', 'auth_test_161b', 'rd_test_161b', 'pln_test_161b', 'dsp_test_161b', 'env_test_161b', 'ath_test_161b', 'rd_test_161b', 'apv_test_161b', 'prep_test_161b', 'rev_test_161b', 'sim_test_161b', 'exec_test_161b', 'cohort_test_161b', 'tenant_test_161b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, '{}', ?, ?, ?, ?,
        'iss_hash_161b', 'iss_ep_hash_161b', 'iss_ep_hash_161b',
        'EXECUTION_NOT_ENABLED', 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [issuanceId, 'FINALIZED', result,
       JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope),
       record.source_activation_token_preflight_hash, record.source_activation_token_staging_hash, record.source_token_material_hash, record.source_freeze_package_hash]
    );
  }
}

(async () => {
  console.log('=== Smoke 161B: Create Token Redemption Readiness from Phase 160 Issuance ===\n');

  try {
    const issuanceId1 = 'ati_161b_1';
    await setupFinalizedIssuance(issuanceId1, 'ISSUANCE_RECORDED_NOT_REDEEMABLE');

    const draftRes = await builder.createTokenRedemptionReadinessDraft(issuanceId1, 'admin');
    assert.ok(draftRes.tokenRedemptionReadiness);
    const readinessId = draftRes.tokenRedemptionReadiness.activation_token_redemption_readiness_id;
    assert.ok(readinessId.startsWith('atr_'));

    const fetched = await builder.getTokenRedemptionReadiness(readinessId);
    assert.strictEqual(fetched.activation_token_redemption_readiness_status, 'DRAFT');
    assert.strictEqual(fetched.source_activation_token_issuance_id, issuanceId1);
    console.log('  PASS: Draft redemption readiness created successfully from Phase 160 token issuance.');

    // 2. Negative case: block draft from non-ISSUANCE_RECORDED_NOT_REDEEMABLE
    const issuanceId2 = 'ati_161b_2';
    await setupFinalizedIssuance(issuanceId2, 'ISSUANCE_REJECTED_NOT_ISSUED');
    await assert.rejects(
      builder.createTokenRedemptionReadinessDraft(issuanceId2, 'admin'),
      /TOKEN_ISSUANCE_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-ISSUANCE_RECORDED_NOT_REDEEMABLE issuance.');

    console.log('\nSmoke 161B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 161B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
