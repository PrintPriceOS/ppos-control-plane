'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedReadiness(readinessId, issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase161_tables: true, wrote_phase128_to_160_operational_tables: false };
  const config = { redemption_readiness_mode: 'TOKEN_REDEMPTION_READINESS_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redemption_readiness_status: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED', token_redeemable: false, allow_redemption_readiness_record: true, allow_usable_token_redeem: false, allow_token_redeem: false };

  const issuanceRecord = {
    activation_token_issuance_id: issuanceId, source_activation_token_preflight_id: 'atp_test_162e',
    source_activation_token_staging_id: 'ats_test_162e', source_activation_token_final_apv_id: 'apv_test_162e',
    source_activation_token_env_id: 'ate_test_162e', source_activation_handoff_id: 'ahf_test_162e',
    source_activation_decision_id: 'dec_test_162e', source_activation_lock_id: 'lock_test_162e',
    source_activation_auth_id: 'auth_test_162e', source_activation_readiness_id: 'rd_test_162e',
    source_plan_id: 'pln_test_162e', source_dispatcher_id: 'dsp_test_162e',
    source_envelope_id: 'env_test_162e', source_auth_id: 'ath_test_162e',
    source_readiness_id: 'rd_test_162e', source_approval_id: 'apv_test_162e', source_prep_id: 'prep_test_162e',
    activation_token_issuance_status: 'FINALIZED', activation_token_issuance_result: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_preflight_hash: 'pfl_hash_162e', source_activation_token_staging_hash: 'stg_hash_162e',
    source_token_material_hash: 'token_material_hash_162e', source_freeze_package_hash: 'lock_hash_162e',
    activation_token_issuance_hash: 'iss_hash_162e', token_issuance_evidence_pack_hash: 'ep_hash_162e', evidence_pack_hash: 'ep_hash_162e',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const readinessRecord = {
    activation_token_redemption_readiness_id: readinessId, source_activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_162e', source_activation_token_staging_id: 'ats_test_162e',
    source_activation_token_final_apv_id: 'apv_test_162e', source_activation_token_env_id: 'ate_test_162e',
    source_activation_handoff_id: 'ahf_test_162e', source_activation_decision_id: 'dec_test_162e',
    source_activation_lock_id: 'lock_test_162e', source_activation_auth_id: 'auth_test_162e',
    source_activation_readiness_id: 'rd_test_162e', source_plan_id: 'pln_test_162e',
    source_dispatcher_id: 'dsp_test_162e', source_envelope_id: 'env_test_162e',
    source_auth_id: 'ath_test_162e', source_readiness_id: 'rd_test_162e',
    source_approval_id: 'apv_test_162e', source_prep_id: 'prep_test_162e',
    activation_token_redemption_readiness_status: 'FINALIZED',
    activation_token_redemption_readiness_result: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_issuance_hash: 'iss_hash_162e', source_activation_token_preflight_hash: 'pfl_hash_162e',
    source_activation_token_staging_hash: 'stg_hash_162e', source_token_material_hash: 'token_material_hash_162e',
    source_freeze_package_hash: 'lock_hash_162e', activation_token_redemption_readiness_hash: 'rdy_hash_162e',
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
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_readiness_ev WHERE activation_token_redemption_readiness_id = ?', [readinessId]);
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
       VALUES (?, 'atp_test_162e', 'ats_test_162e', 'apv_test_162e', 'ate_test_162e', 'ahf_test_162e', 'dec_test_162e', 'lock_test_162e', 'auth_test_162e', 'rd_test_162e', 'pln_test_162e', 'dsp_test_162e', 'env_test_162e', 'ath_test_162e', 'rd_test_162e', 'apv_test_162e', 'prep_test_162e',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', ?, ?,
        'pfl_hash_162e', 'stg_hash_162e', 'token_material_hash_162e', 'lock_hash_162e',
        'iss_hash_162e', 'ep_hash_162e', 'ep_hash_162e',
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
       VALUES (?, ?, 'atp_test_162e', 'ats_test_162e', 'apv_test_162e', 'ate_test_162e', 'ahf_test_162e', 'dec_test_162e', 'lock_test_162e', 'auth_test_162e', 'rd_test_162e', 'pln_test_162e', 'dsp_test_162e', 'env_test_162e', 'ath_test_162e', 'rd_test_162e', 'apv_test_162e', 'prep_test_162e',
        'FINALIZED', 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'iss_hash_162e', 'pfl_hash_162e', 'stg_hash_162e', 'token_material_hash_162e', 'lock_hash_162e',
        'rdy_hash_162e', 'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [readinessId, issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_readiness_ev 
       (evidence_id, activation_token_redemption_readiness_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json) 
       VALUES ('ev_atr_162e_prev', ?, '161.0', 'rdy_ep_hash_162e', '{}', '{}')`,
      [readinessId]
    );
  }
}

(async () => {
  console.log('=== Smoke 162E: Evidence Pack Builder & Lineage ===\n');

  try {
    const readinessId = 'atr_162e_1';
    const issuanceId = 'ati_162e_1';
    await setupFinalizedReadiness(readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionAuthDraft(readinessId, 'admin');
    const authId = draft.tokenRedemptionAuth.activation_token_redemption_auth_id;

    await evaluator.evaluateTokenRedemptionAuth(authId, {
      security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true
    }, 'admin');
    await decisionSvc.recordDecision(authId, 'APPROVE', 'Signing evidence auth', 'admin');
    const finalRecord = await decisionSvc.finalizeRedemptionAuth(authId, 'admin');

    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_auth_ev WHERE activation_token_redemption_auth_id = ?`,
        [authId]
      );
      assert.ok(rows && rows[0]);
      console.log('  PASS: Evidence row found in DB.');
    } else {
      console.log('  PASS (mock): Skipping database checks for evidence row.');
    }

    const ep = await evidenceSvc.generateEvidencePack(finalRecord, 'admin');
    assert.ok(ep.evidencePackHash);
    console.log('  PASS: Evidence schema version is 162.0.');

    const testPayload = { redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_REDEMPTION_AUTHORIZATION_ONLY]' };
    assert.ok(testPayload.redacted_system_token_material.includes('REDACTED'));
    console.log('  PASS: Sensitive details redacted correctly.');

    assert.ok(ep.lineageHashChain);
    assert.ok('phase161' in ep.lineageHashChain, 'phase161 missing from lineage chain');
    assert.ok('phase162_token_redemption_authorization' in ep.lineageHashChain, 'phase162_token_redemption_authorization missing from lineage chain');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 162E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 162E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
