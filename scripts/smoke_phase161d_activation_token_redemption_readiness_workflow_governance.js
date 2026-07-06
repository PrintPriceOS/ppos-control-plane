'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessDecisionService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedIssuance(issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase160_tables: true, wrote_phase128_to_159_operational_tables: false };
  const config = { issuance_mode: 'TOKEN_ISSUANCE_RECORD_ONLY', allow_token_issuance_record: true, allow_usable_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_161d',
    source_activation_token_staging_id: 'ats_test_161d',
    source_activation_token_final_apv_id: 'apv_test_161d',
    source_activation_token_env_id: 'ate_test_161d',
    source_activation_handoff_id: 'ahf_test_161d',
    source_activation_decision_id: 'dec_test_161d',
    source_activation_lock_id: 'lock_test_161d',
    source_activation_auth_id: 'auth_test_161d',
    source_activation_readiness_id: 'rd_test_161d',
    source_plan_id: 'pln_test_161d',
    source_dispatcher_id: 'dsp_test_161d',
    source_envelope_id: 'env_test_161d',
    source_auth_id: 'ath_test_161d',
    source_readiness_id: 'rd_test_161d',
    source_approval_id: 'apv_test_161d',
    source_prep_id: 'prep_test_161d',
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
    source_activation_token_preflight_hash: 'pfl_hash_161d',
    source_activation_token_staging_hash: 'stg_hash_161d', source_token_material_hash: 'token_material_hash_161d',
    source_freeze_package_hash: 'lock_hash_161d', activation_token_issuance_hash: 'iss_hash_161d',
    token_issuance_evidence_pack_hash: 'ep_hash_161d', evidence_pack_hash: 'ep_hash_161d',
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
       VALUES (?, 'atp_test_161d', 'ats_test_161d', 'apv_test_161d', 'ate_test_161d', 'ahf_test_161d', 'dec_test_161d', 'lock_test_161d', 'auth_test_161d', 'rd_test_161d', 'pln_test_161d', 'dsp_test_161d', 'env_test_161d', 'ath_test_161d', 'rd_test_161d', 'apv_test_161d', 'prep_test_161d',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'pfl_hash_161d', 'stg_hash_161d', 'token_material_hash_161d', 'lock_hash_161d',
        'iss_hash_161d', 'ep_hash_161d', 'ep_hash_161d',
        'EXECUTION_NOT_ENABLED', 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 161D: Review Workflow Governance ===\n');

  try {
    const issuanceId = 'ati_161d_1';
    await setupFinalizedIssuance(issuanceId);

    const draft = await builder.createTokenRedemptionReadinessDraft(issuanceId, 'admin');
    const readinessId = draft.tokenRedemptionReadiness.activation_token_redemption_readiness_id;

    // 1. Finalize blocked before evaluation
    await assert.rejects(
      decisionSvc.finalizeRedemptionReadiness(readinessId, 'admin'),
      /TOKEN_REDEMPTION_READINESS_NOT_PASSED/
    );
    console.log('  PASS: Finalization blocked before evaluation.');

    // 2. Evaluated -> Approved -> Finalized
    await evaluator.evaluateTokenRedemptionReadiness(readinessId, {
      security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(readinessId, 'APPROVE', 'Recording readiness event', 'admin');
    const passedRecord = await builder.getTokenRedemptionReadiness(readinessId);
    assert.strictEqual(passedRecord.activation_token_redemption_readiness_status, 'READINESS_PASSED');

    const finalRecord = await decisionSvc.finalizeRedemptionReadiness(readinessId, 'admin');
    assert.strictEqual(finalRecord.activation_token_redemption_readiness_status, 'FINALIZED');
    assert.strictEqual(finalRecord.activation_token_redemption_readiness_result, 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED');
    assert.strictEqual(finalRecord.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(finalRecord.plan_executable_status, 'NOT_EXECUTABLE');
    assert.strictEqual(finalRecord.job_creation_status, 'NO_REAL_JOB_CREATED');
    assert.strictEqual(finalRecord.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    assert.strictEqual(finalRecord.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Activation token redemption readiness finalized successfully with safe non-execution markers.');

    // 3. Mutations blocked on finalized record
    await assert.rejects(
      builder.updateTokenRedemptionReadiness(readinessId, { activation_token_redemption_readiness_status: 'DRAFT' }),
      /TOKEN_REDEMPTION_READINESS_IMMUTABLE/
    );
    console.log('  PASS: Modifications blocked on finalized token redemption readiness.');

    console.log('\nSmoke 161D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 161D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
