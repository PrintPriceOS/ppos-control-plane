'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const preflightBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceDecisionService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedPreflight(preflightId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase159_tables: true, wrote_phase128_to_158_operational_tables: false };
  const config = { preflight_mode: 'TOKEN_ISSUANCE_PREFLIGHT_ONLY', allow_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_preflight_id: preflightId,
    source_activation_token_staging_id: 'ats_test_160d',
    source_activation_token_final_apv_id: 'apv_test_160d',
    source_activation_token_env_id: 'ate_test_160d',
    source_activation_handoff_id: 'ahf_test_160d',
    source_activation_decision_id: 'dec_test_160d',
    source_activation_lock_id: 'lock_test_160d',
    source_activation_auth_id: 'auth_test_160d',
    source_activation_readiness_id: 'rd_test_160d',
    source_plan_id: 'pln_test_160d',
    source_dispatcher_id: 'dsp_test_160d',
    source_envelope_id: 'env_test_160d',
    source_auth_id: 'ath_test_160d',
    source_readiness_id: 'rd_test_160d',
    source_approval_id: 'apv_test_160d',
    source_prep_id: 'prep_test_160d',
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
    source_activation_token_staging_hash: 'stg_hash_160d',
    source_token_material_hash: 'token_material_hash_160d', source_freeze_package_hash: 'lock_hash_160d',
    activation_token_preflight_hash: 'pfl_hash_160d', token_preflight_evidence_pack_hash: 'ep_hash_160d',
    evidence_pack_hash: 'ep_hash_160d', lineage_hash_chain_json: {}, preflight_signatures_json: {}, preflight_metadata_json: {},
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
       VALUES (?, 'ats_test_160d', 'apv_test_160d', 'ate_test_160d', 'ath_test_160d', 'ahf_test_160d', 'dec_test_160d', 'lock_test_160d', 'auth_test_160d', 'rd_test_160d', 'pln_test_160d', 'dsp_test_160d', 'env_test_160d', 'ath_test_160d', 'rd_test_160d', 'apv_test_160d', 'prep_test_160d',
        'FINALIZED', 'PREFLIGHT_PASSED_NOT_ISSUED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'stg_hash_160d', 'token_material_hash_160d', 'lock_hash_160d',
        'pfl_hash_160d', 'ep_hash_160d', 'ep_hash_160d',
        'EXECUTION_NOT_ENABLED', 'TOKEN_PREFLIGHT_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [preflightId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 160D: Review Workflow Governance ===\n');

  try {
    const preflightId = 'atp_160d_1';
    await setupFinalizedPreflight(preflightId);

    const draft = await builder.createTokenIssuanceDraft(preflightId, 'admin');
    const issuanceId = draft.tokenIssuance.activation_token_issuance_id;

    // 1. Finalize blocked before evaluation
    await assert.rejects(
      decisionSvc.finalizeIssuance(issuanceId, 'admin'),
      /TOKEN_ISSUANCE_NOT_RECORDED/
    );
    console.log('  PASS: Finalization blocked before evaluation.');

    // 2. Evaluated -> Approved -> Finalized
    await evaluator.evaluateTokenIssuance(issuanceId, {
      security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(issuanceId, 'APPROVE', 'Recording issuance event', 'admin');
    const passedRecord = await builder.getTokenIssuance(issuanceId);
    assert.strictEqual(passedRecord.activation_token_issuance_status, 'ISSUANCE_RECORDED');

    const finalRecord = await decisionSvc.finalizeIssuance(issuanceId, 'admin');
    assert.strictEqual(finalRecord.activation_token_issuance_status, 'FINALIZED');
    assert.strictEqual(finalRecord.activation_token_issuance_result, 'ISSUANCE_RECORDED_NOT_REDEEMABLE');
    assert.strictEqual(finalRecord.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(finalRecord.plan_executable_status, 'NOT_EXECUTABLE');
    assert.strictEqual(finalRecord.job_creation_status, 'NO_REAL_JOB_CREATED');
    assert.strictEqual(finalRecord.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    assert.strictEqual(finalRecord.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Activation token issuance finalized successfully with safe non-execution markers.');

    // 3. Mutations blocked on finalized record
    await assert.rejects(
      builder.updateTokenIssuance(issuanceId, { activation_token_issuance_status: 'DRAFT' }),
      /TOKEN_ISSUANCE_IMMUTABLE/
    );
    console.log('  PASS: Modifications blocked on finalized token issuance.');

    console.log('\nSmoke 160D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 160D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
