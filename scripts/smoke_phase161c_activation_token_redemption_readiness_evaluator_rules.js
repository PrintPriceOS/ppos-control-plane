'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedIssuance(issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase160_tables: true, wrote_phase128_to_159_operational_tables: false };
  const config = { issuance_mode: 'TOKEN_ISSUANCE_RECORD_ONLY', allow_token_issuance_record: true, allow_usable_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_161c',
    source_activation_token_staging_id: 'ats_test_161c',
    source_activation_token_final_apv_id: 'apv_test_161c',
    source_activation_token_env_id: 'ate_test_161c',
    source_activation_handoff_id: 'ahf_test_161c',
    source_activation_decision_id: 'dec_test_161c',
    source_activation_lock_id: 'lock_test_161c',
    source_activation_auth_id: 'auth_test_161c',
    source_activation_readiness_id: 'rd_test_161c',
    source_plan_id: 'pln_test_161c',
    source_dispatcher_id: 'dsp_test_161c',
    source_envelope_id: 'env_test_161c',
    source_auth_id: 'ath_test_161c',
    source_readiness_id: 'rd_test_161c',
    source_approval_id: 'apv_test_161c',
    source_prep_id: 'prep_test_161c',
    source_review_id: null, source_simulation_id: null, source_execution_id: null,
    cohort_id: null, tenant_id: null, simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_issuance_status: 'FINALIZED',
    activation_token_issuance_result: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
    risk_level: 'LOW', confidence_level: 'HIGH',
    projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS',
    canary_envelope_json: config,
    token_issuance_summary_json: {}, impact_review_json: {}, rollback_review_json: {}, guardrail_review_json: {},
    token_issuance_rules_json: {}, token_issuance_blockers_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_preflight_hash: 'pfl_hash_161c',
    source_activation_token_staging_hash: 'stg_hash_161c', source_token_material_hash: 'token_material_hash_161c',
    source_freeze_package_hash: 'lock_hash_161c', activation_token_issuance_hash: 'iss_hash_161c',
    token_issuance_evidence_pack_hash: 'ep_hash_161c', evidence_pack_hash: 'ep_hash_161c',
    lineage_hash_chain_json: {}, issuance_signatures_json: {}, issuance_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null,
    finalized_by: 'admin', finalized_at: new Date(), created_at: new Date(), updated_at: new Date()
  };

  if (!isProdLike) {
    issuanceBuilder._mockState.tokenIssuance.set(issuanceId, record);
    issuanceBuilder._mockState.rules.set(issuanceId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_issuance WHERE activation_token_issuance_id = ?', [issuanceId]);
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_issuance
       (activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        activation_token_issuance_status, activation_token_issuance_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_preflight_hash, source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_issuance_hash, token_issuance_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'atp_test_161c', 'ats_test_161c', 'apv_test_161c', 'ate_test_161c', 'ahf_test_161c', 'dec_test_161c', 'lock_test_161c', 'auth_test_161c', 'rd_test_161c', 'pln_test_161c', 'dsp_test_161c', 'env_test_161c', 'ath_test_161c', 'rd_test_161c', 'apv_test_161c', 'prep_test_161c',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'pfl_hash_161c', 'stg_hash_161c', 'token_material_hash_161c', 'lock_hash_161c',
        'iss_hash_161c', 'ep_hash_161c', 'ep_hash_161c',
        'EXECUTION_NOT_ENABLED', 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 161C: Activation Token Redemption Readiness Evaluator Rules ===\n');

  try {
    const issuanceId1 = 'ati_161c_1';
    await setupFinalizedIssuance(issuanceId1);
    const draft1 = await builder.createTokenRedemptionReadinessDraft(issuanceId1, 'admin');
    const readinessId1 = draft1.tokenRedemptionReadiness.activation_token_redemption_readiness_id;

    const evalResult1 = await evaluator.evaluateTokenRedemptionReadiness(readinessId1, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');

    assert.strictEqual(evalResult1.success, true, `Evaluation failed: ${JSON.stringify(evalResult1.blockers)}`);

    const rules = await builder.getRules(readinessId1);
    console.log(`Evaluated rules list for readinessId1:`, JSON.stringify(rules, null, 2));
    assert.ok(rules.length >= 7, `Expected at least 7 rules, got ${rules.length}`);
    const record1 = await builder.getTokenRedemptionReadiness(readinessId1);
    assert.strictEqual(record1.activation_token_redemption_readiness_status, 'EVALUATED');
    assert.strictEqual(record1.activation_token_redemption_readiness_result, 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED');
    console.log('  PASS: Evaluated redemption readiness record successfully.');

    // 2. Negative case: missing security officer signature
    const issuanceId2 = 'ati_161c_2';
    await setupFinalizedIssuance(issuanceId2);
    const draft2 = await builder.createTokenRedemptionReadinessDraft(issuanceId2, 'admin');
    const readinessId2 = draft2.tokenRedemptionReadiness.activation_token_redemption_readiness_id;
    const evalResult2 = await evaluator.evaluateTokenRedemptionReadiness(readinessId2, {
      security_officer_confirmed: false,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');
    assert.strictEqual(evalResult2.success, false);
    console.log('  PASS: Correctly failed evaluation when security officer confirmation is missing.');

    console.log('\nSmoke 161C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 161C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
