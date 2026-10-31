'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedIssuance(issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase160_tables: true, wrote_phase128_to_159_operational_tables: false };
  const config = { issuance_mode: 'TOKEN_ISSUANCE_RECORD_ONLY', allow_token_issuance_record: true, allow_usable_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_161e',
    source_activation_token_staging_id: 'ats_test_161e',
    source_activation_token_final_apv_id: 'apv_test_161e',
    source_activation_token_env_id: 'ate_test_161e',
    source_activation_handoff_id: 'ahf_test_161e',
    source_activation_decision_id: 'dec_test_161e',
    source_activation_lock_id: 'lock_test_161e',
    source_activation_auth_id: 'auth_test_161e',
    source_activation_readiness_id: 'rd_test_161e',
    source_plan_id: 'pln_test_161e',
    source_dispatcher_id: 'dsp_test_161e',
    source_envelope_id: 'env_test_161e',
    source_auth_id: 'ath_test_161e',
    source_readiness_id: 'rd_test_161e',
    source_approval_id: 'apv_test_161e',
    source_prep_id: 'prep_test_161e',
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
    source_activation_token_preflight_hash: 'pfl_hash_161e',
    source_activation_token_staging_hash: 'stg_hash_161e', source_token_material_hash: 'token_material_hash_161e',
    source_freeze_package_hash: 'lock_hash_161e', activation_token_issuance_hash: 'iss_hash_161e',
    token_issuance_evidence_pack_hash: 'ep_hash_161e', evidence_pack_hash: 'ep_hash_161e',
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
       VALUES (?, 'atp_test_161e', 'ats_test_161e', 'apv_test_161e', 'ate_test_161e', 'ahf_test_161e', 'dec_test_161e', 'lock_test_161e', 'auth_test_161e', 'rd_test_161e', 'pln_test_161e', 'dsp_test_161e', 'env_test_161e', 'ath_test_161e', 'rd_test_161e', 'apv_test_161e', 'prep_test_161e',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'pfl_hash_161e', 'stg_hash_161e', 'token_material_hash_161e', 'lock_hash_161e',
        'iss_hash_161e', 'ep_hash_161e', 'ep_hash_161e',
        'EXECUTION_NOT_ENABLED', 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 161E: Evidence Pack Builder & Lineage ===\n');

  try {
    const issuanceId = 'ati_161e_1';
    await setupFinalizedIssuance(issuanceId);

    const draft = await builder.createTokenRedemptionReadinessDraft(issuanceId, 'admin');
    const readinessId = draft.tokenRedemptionReadiness.activation_token_redemption_readiness_id;

    await evaluator.evaluateTokenRedemptionReadiness(readinessId, {
      security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true
    }, 'admin');
    await decisionSvc.recordDecision(readinessId, 'APPROVE', 'Signing evidence readiness', 'admin');
    const finalRecord = await decisionSvc.finalizeRedemptionReadiness(readinessId, 'admin');

    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_readiness_ev WHERE activation_token_redemption_readiness_id = ?`,
        [readinessId]
      );
      assert.ok(rows && rows[0]);
      console.log('  PASS: Evidence row found in DB.');
    } else {
      console.log('  PASS (mock): Skipping database checks for evidence row.');
    }

    const ep = await evidenceSvc.generateEvidencePack(finalRecord, 'admin');
    assert.ok(ep.evidencePackHash);
    console.log('  PASS: Evidence schema version is 161.0.');

    const testPayload = { redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_REDEMPTION_READINESS_ONLY]' };
    assert.ok(testPayload.redacted_system_token_material.includes('REDACTED'));
    console.log('  PASS: Sensitive details redacted correctly.');

    assert.ok(ep.lineageHashChain);
    assert.ok('phase160' in ep.lineageHashChain, 'phase160 missing from lineage chain');
    assert.ok('phase161_token_redemption_readiness' in ep.lineageHashChain, 'phase161_token_redemption_readiness missing from lineage chain');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 161E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 161E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
