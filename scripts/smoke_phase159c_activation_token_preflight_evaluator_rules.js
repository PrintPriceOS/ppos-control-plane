'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const stagingBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedStaging(stagingId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase158_tables: true, wrote_phase128_to_157_operational_tables: false };
  const config = { staging_mode: 'TOKEN_STAGING_ONLY', allow_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_staging_id: stagingId,
    source_activation_token_final_apv_id: 'apv_test_159c',
    source_activation_token_env_id: 'ate_test_159c',
    source_activation_token_auth_id: 'ath_test_159c',
    source_activation_handoff_id: 'ahf_test_159c',
    source_activation_decision_id: 'dec_test_159c',
    source_activation_lock_id: 'lock_test_159c',
    source_activation_auth_id: 'auth_test_159c',
    source_activation_readiness_id: 'rd_test_159c',
    source_plan_id: 'pln_test_159c',
    source_dispatcher_id: 'dsp_test_159c',
    source_envelope_id: 'env_test_159c',
    source_auth_id: 'ath_test_159c',
    source_readiness_id: 'rd_test_159c',
    source_approval_id: 'apv_test_159c',
    source_prep_id: 'prep_test_159c',
    source_review_id: null, source_simulation_id: null, source_execution_id: null,
    cohort_id: null, tenant_id: null, simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_staging_status: 'FINALIZED',
    activation_token_staging_result: 'STAGED_NOT_ISSUED',
    risk_level: 'LOW', confidence_level: 'HIGH',
    projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS',
    canary_envelope_json: config,
    token_staging_summary_json: {}, impact_review_json: {}, rollback_review_json: {}, guardrail_review_json: {},
    token_staging_rules_json: {}, token_staging_blockers_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_final_apv_hash: 'apv_hash_159c',
    source_token_material_hash: 'token_material_hash_159c', source_freeze_package_hash: 'lock_hash_159c',
    activation_token_staging_hash: 'stg_hash_159c', token_staging_evidence_pack_hash: 'ep_hash_159c',
    evidence_pack_hash: 'ep_hash_159c', lineage_hash_chain_json: {}, staging_signatures_json: {}, staging_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null,
    finalized_by: 'admin', finalized_at: new Date(), created_at: new Date(), updated_at: new Date()
  };

  if (!isProdLike) {
    stagingBuilder._mockState.tokenStaging.set(stagingId, record);
    stagingBuilder._mockState.rules.set(stagingId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging WHERE activation_token_staging_id = ?', [stagingId]);
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_staging
       (activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        activation_token_staging_status, activation_token_staging_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_final_apv_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_staging_hash, token_staging_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'apv_test_159c', 'ate_test_159c', 'ath_test_159c', 'ahf_test_159c', 'dec_test_159c', 'lock_test_159c', 'auth_test_159c', 'rd_test_159c', 'pln_test_159c', 'dsp_test_159c', 'env_test_159c', 'ath_test_159c', 'rd_test_159c', 'apv_test_159c', 'prep_test_159c',
        'FINALIZED', 'STAGED_NOT_ISSUED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'apv_hash_159c', 'token_material_hash_159c', 'lock_hash_159c',
        'stg_hash_159c', 'ep_hash_159c', 'ep_hash_159c',
        'EXECUTION_NOT_ENABLED', 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [stagingId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 159C: Activation Token Preflight Evaluator Rules ===\n');

  try {
    const stagingId1 = 'ats_159c_1';
    await setupFinalizedStaging(stagingId1);
    const draft1 = await builder.createTokenPreflightDraft(stagingId1, 'admin');
    const preflightId1 = draft1.tokenPreflight.activation_token_preflight_id;

    const evalResult1 = await evaluator.evaluateTokenPreflight(preflightId1, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');

    assert.strictEqual(evalResult1.success, true, `Evaluation failed with blockers: ${JSON.stringify(evalResult1.blockers)}`);

    const rules = await builder.getRules(preflightId1);
    console.log(`Evaluated rules list for preflightId1:`, JSON.stringify(rules, null, 2));
    assert.ok(rules.length >= 7, `Expected at least 7 rules, got ${rules.length}`);
    const record1 = await builder.getTokenPreflight(preflightId1);
    assert.strictEqual(record1.activation_token_preflight_status, 'EVALUATED');
    assert.strictEqual(record1.activation_token_preflight_result, 'PREFLIGHT_PASSED_NOT_ISSUED');
    console.log('  PASS: Evaluated token preflight record successfully.');

    // 2. Negative case: missing security officer signature
    const stagingId2 = 'ats_159c_2';
    await setupFinalizedStaging(stagingId2);
    const draft2 = await builder.createTokenPreflightDraft(stagingId2, 'admin');
    const preflightId2 = draft2.tokenPreflight.activation_token_preflight_id;
    const evalResult2 = await evaluator.evaluateTokenPreflight(preflightId2, {
      security_officer_confirmed: false,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');
    assert.strictEqual(evalResult2.success, false);
    console.log('  PASS: Correctly failed evaluation when security officer confirmation is missing.');

    console.log('\nSmoke 159C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 159C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
