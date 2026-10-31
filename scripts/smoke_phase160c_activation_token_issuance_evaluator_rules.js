'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const preflightBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedPreflight(preflightId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase159_tables: true, wrote_phase128_to_158_operational_tables: false };
  const config = { preflight_mode: 'TOKEN_ISSUANCE_PREFLIGHT_ONLY', allow_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_preflight_id: preflightId,
    source_activation_token_staging_id: 'ats_test_160c',
    source_activation_token_final_apv_id: 'apv_test_160c',
    source_activation_token_env_id: 'ate_test_160c',
    source_activation_handoff_id: 'ahf_test_160c',
    source_activation_decision_id: 'dec_test_160c',
    source_activation_lock_id: 'lock_test_160c',
    source_activation_auth_id: 'auth_test_160c',
    source_activation_readiness_id: 'rd_test_160c',
    source_plan_id: 'pln_test_160c',
    source_dispatcher_id: 'dsp_test_160c',
    source_envelope_id: 'env_test_160c',
    source_auth_id: 'ath_test_160c',
    source_readiness_id: 'rd_test_160c',
    source_approval_id: 'apv_test_160c',
    source_prep_id: 'prep_test_160c',
    source_review_id: null, source_simulation_id: null, source_execution_id: null,
    cohort_id: null, tenant_id: null, simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_preflight_status: 'FINALIZED',
    activation_token_preflight_result: 'PREFLIGHT_PASSED_NOT_ISSUED',
    risk_level: 'LOW', confidence_level: 'HIGH',
    projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS',
    canary_envelope_json: config,
    token_preflight_summary_json: {}, impact_review_json: {}, rollback_review_json: {}, guardrail_review_json: {},
    token_preflight_rules_json: {}, token_preflight_blockers_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_staging_hash: 'stg_hash_160c',
    source_token_material_hash: 'token_material_hash_160c', source_freeze_package_hash: 'lock_hash_160c',
    activation_token_preflight_hash: 'pfl_hash_160c', token_preflight_evidence_pack_hash: 'ep_hash_160c',
    evidence_pack_hash: 'ep_hash_160c', lineage_hash_chain_json: {}, preflight_signatures_json: {}, preflight_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_PREFLIGHT_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null,
    finalized_by: 'admin', finalized_at: new Date(), created_at: new Date(), updated_at: new Date()
  };

  if (!isProdLike) {
    preflightBuilder._mockState.tokenPreflight.set(preflightId, record);
    preflightBuilder._mockState.rules.set(preflightId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_preflight WHERE activation_token_preflight_id = ?', [preflightId]);
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_preflight
       (activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        activation_token_preflight_status, activation_token_preflight_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_preflight_hash, token_preflight_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'ats_test_160c', 'apv_test_160c', 'ate_test_160c', 'ath_test_160c', 'ahf_test_160c', 'dec_test_160c', 'lock_test_160c', 'auth_test_160c', 'rd_test_160c', 'pln_test_160c', 'dsp_test_160c', 'env_test_160c', 'ath_test_160c', 'rd_test_160c', 'apv_test_160c', 'prep_test_160c',
        'FINALIZED', 'PREFLIGHT_PASSED_NOT_ISSUED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'stg_hash_160c', 'token_material_hash_160c', 'lock_hash_160c',
        'pfl_hash_160c', 'ep_hash_160c', 'ep_hash_160c',
        'EXECUTION_NOT_ENABLED', 'TOKEN_PREFLIGHT_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [preflightId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 160C: Activation Token Issuance Evaluator Rules ===\n');

  try {
    const preflightId1 = 'atp_160c_1';
    await setupFinalizedPreflight(preflightId1);
    const draft1 = await builder.createTokenIssuanceDraft(preflightId1, 'admin');
    const issuanceId1 = draft1.tokenIssuance.activation_token_issuance_id;

    const evalResult1 = await evaluator.evaluateTokenIssuance(issuanceId1, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');

    assert.strictEqual(evalResult1.success, true, `Evaluation failed: ${JSON.stringify(evalResult1.blockers)}`);

    const rules = await builder.getRules(issuanceId1);
    console.log(`Evaluated rules list for issuanceId1:`, JSON.stringify(rules, null, 2));
    assert.ok(rules.length >= 7, `Expected at least 7 rules, got ${rules.length}`);
    const record1 = await builder.getTokenIssuance(issuanceId1);
    assert.strictEqual(record1.activation_token_issuance_status, 'EVALUATED');
    assert.strictEqual(record1.activation_token_issuance_result, 'ISSUANCE_RECORDED_NOT_REDEEMABLE');
    console.log('  PASS: Evaluated token issuance record successfully.');

    // 2. Negative case: missing compliance officer signature
    const preflightId2 = 'atp_160c_2';
    await setupFinalizedPreflight(preflightId2);
    const draft2 = await builder.createTokenIssuanceDraft(preflightId2, 'admin');
    const issuanceId2 = draft2.tokenIssuance.activation_token_issuance_id;
    const evalResult2 = await evaluator.evaluateTokenIssuance(issuanceId2, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: false,
      operations_director_confirmed: true
    }, 'admin');
    assert.strictEqual(evalResult2.success, false);
    console.log('  PASS: Correctly failed evaluation when compliance officer confirmation is missing.');

    console.log('\nSmoke 160C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 160C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
