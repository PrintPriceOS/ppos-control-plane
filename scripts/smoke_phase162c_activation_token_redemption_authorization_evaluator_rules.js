'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedReadiness(readinessId, issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase161_tables: true, wrote_phase128_to_160_operational_tables: false };
  const config = { redemption_readiness_mode: 'TOKEN_REDEMPTION_READINESS_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redemption_readiness_status: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED', token_redeemable: false, allow_redemption_readiness_record: true, allow_usable_token_redeem: false, allow_token_redeem: false };

  const issuanceRecord = {
    activation_token_issuance_id: issuanceId, source_activation_token_preflight_id: 'atp_test_162c',
    source_activation_token_staging_id: 'ats_test_162c', source_activation_token_final_apv_id: 'apv_test_162c',
    source_activation_token_env_id: 'ate_test_162c', source_activation_handoff_id: 'ahf_test_162c',
    source_activation_decision_id: 'dec_test_162c', source_activation_lock_id: 'lock_test_162c',
    source_activation_auth_id: 'auth_test_162c', source_activation_readiness_id: 'rd_test_162c',
    source_plan_id: 'pln_test_162c', source_dispatcher_id: 'dsp_test_162c',
    source_envelope_id: 'env_test_162c', source_auth_id: 'ath_test_162c',
    source_readiness_id: 'rd_test_162c', source_approval_id: 'apv_test_162c', source_prep_id: 'prep_test_162c',
    activation_token_issuance_status: 'FINALIZED', activation_token_issuance_result: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_preflight_hash: 'pfl_hash_162c', source_activation_token_staging_hash: 'stg_hash_162c',
    source_token_material_hash: 'token_material_hash_162c', source_freeze_package_hash: 'lock_hash_162c',
    activation_token_issuance_hash: 'iss_hash_162c', token_issuance_evidence_pack_hash: 'ep_hash_162c', evidence_pack_hash: 'ep_hash_162c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const readinessRecord = {
    activation_token_redemption_readiness_id: readinessId, source_activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_162c', source_activation_token_staging_id: 'ats_test_162c',
    source_activation_token_final_apv_id: 'apv_test_162c', source_activation_token_env_id: 'ate_test_162c',
    source_activation_handoff_id: 'ahf_test_162c', source_activation_decision_id: 'dec_test_162c',
    source_activation_lock_id: 'lock_test_162c', source_activation_auth_id: 'auth_test_162c',
    source_activation_readiness_id: 'rd_test_162c', source_plan_id: 'pln_test_162c',
    source_dispatcher_id: 'dsp_test_162c', source_envelope_id: 'env_test_162c',
    source_auth_id: 'ath_test_162c', source_readiness_id: 'rd_test_162c',
    source_approval_id: 'apv_test_162c', source_prep_id: 'prep_test_162c',
    activation_token_redemption_readiness_status: 'FINALIZED',
    activation_token_redemption_readiness_result: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_issuance_hash: 'iss_hash_162c', source_activation_token_preflight_hash: 'pfl_hash_162c',
    source_activation_token_staging_hash: 'stg_hash_162c', source_token_material_hash: 'token_material_hash_162c',
    source_freeze_package_hash: 'lock_hash_162c', activation_token_redemption_readiness_hash: 'rdy_hash_162c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  if (!isProdLike) {
    issuanceBuilder._mockState.tokenIssuance.set(issuanceId, issuanceRecord);
    issuanceBuilder._mockState.rules.set(issuanceId, []);
    readinessBuilder._mockState.tokenRedemptionReadiness.set(readinessId, readinessRecord);
    readinessBuilder._mockState.rules.set(readinessId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_readiness WHERE activation_token_redemption_readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_issuance WHERE activation_token_issuance_id = ?', [issuanceId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_issuance
       (activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        activation_token_issuance_status, activation_token_issuance_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_preflight_hash, source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_issuance_hash, token_issuance_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'atp_test_162c', 'ats_test_162c', 'apv_test_162c', 'ate_test_162c', 'ahf_test_162c', 'dec_test_162c', 'lock_test_162c', 'auth_test_162c', 'rd_test_162c', 'pln_test_162c', 'dsp_test_162c', 'env_test_162c', 'ath_test_162c', 'rd_test_162c', 'apv_test_162c', 'prep_test_162c',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', ?, ?,
        'pfl_hash_162c', 'stg_hash_162c', 'token_material_hash_162c', 'lock_hash_162c',
        'iss_hash_162c', 'ep_hash_162c', 'ep_hash_162c',
        'EXECUTION_NOT_ENABLED', 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [issuanceId, JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_readiness
       (activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        activation_token_redemption_readiness_status, activation_token_redemption_readiness_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_issuance_hash, source_activation_token_preflight_hash, source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_redemption_readiness_hash, execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'atp_test_162c', 'ats_test_162c', 'apv_test_162c', 'ate_test_162c', 'ahf_test_162c', 'dec_test_162c', 'lock_test_162c', 'auth_test_162c', 'rd_test_162c', 'pln_test_162c', 'dsp_test_162c', 'env_test_162c', 'ath_test_162c', 'rd_test_162c', 'apv_test_162c', 'prep_test_162c',
        'FINALIZED', 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'iss_hash_162c', 'pfl_hash_162c', 'stg_hash_162c', 'token_material_hash_162c', 'lock_hash_162c',
        'rdy_hash_162c', 'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [readinessId, issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 162C: Activation Token Redemption Auth Evaluator Rules ===\n');

  try {
    const readinessId1 = 'atr_162c_1';
    const issuanceId1 = 'ati_162c_1';
    await setupFinalizedReadiness(readinessId1, issuanceId1);
    const draft1 = await builder.createTokenRedemptionAuthDraft(readinessId1, 'admin');
    const authId1 = draft1.tokenRedemptionAuth.activation_token_redemption_auth_id;

    const evalResult1 = await evaluator.evaluateTokenRedemptionAuth(authId1, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');

    assert.strictEqual(evalResult1.success, true, `Evaluation failed: ${JSON.stringify(evalResult1.blockers)}`);

    const rules = await builder.getRules(authId1);
    console.log(`Evaluated rules list for authId1:`, JSON.stringify(rules, null, 2));
    assert.ok(rules.length >= 8, `Expected at least 8 rules, got ${rules.length}`);
    const record1 = await builder.getTokenRedemptionAuth(authId1);
    assert.strictEqual(record1.activation_token_redemption_auth_status, 'EVALUATED');
    assert.strictEqual(record1.activation_token_redemption_auth_result, 'REDEMPTION_AUTHORIZED_NOT_REDEEMED');
    console.log('  PASS: Evaluated redemption authorization record successfully.');

    // 2. Negative case: missing security officer signature
    const readinessId2 = 'atr_162c_2';
    const issuanceId2 = 'ati_162c_2';
    await setupFinalizedReadiness(readinessId2, issuanceId2);
    const draft2 = await builder.createTokenRedemptionAuthDraft(readinessId2, 'admin');
    const authId2 = draft2.tokenRedemptionAuth.activation_token_redemption_auth_id;
    const evalResult2 = await evaluator.evaluateTokenRedemptionAuth(authId2, {
      security_officer_confirmed: false,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');
    assert.strictEqual(evalResult2.success, false);
    console.log('  PASS: Correctly failed evaluation when security officer confirmation is missing.');

    console.log('\nSmoke 162C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 162C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
