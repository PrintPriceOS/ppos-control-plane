'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const envBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedEnv(envId, authId, readinessId, issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase163_tables: true, wrote_phase128_to_162_operational_tables: false };
  const config = { redemption_envelope_mode: 'TOKEN_REDEMPTION_ENVELOPE_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redemption_envelope_status: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED', token_redeemable: false, allow_redemption_envelope_record: true, allow_usable_token_redeem: false, allow_token_redeem: false };

  const issuanceRecord = {
    activation_token_issuance_id: issuanceId, source_activation_token_preflight_id: 'atp_test_164b',
    source_activation_token_staging_id: 'ats_test_164b', source_activation_token_final_apv_id: 'apv_test_164b',
    source_activation_token_env_id: 'ate_test_164b', source_activation_handoff_id: 'ahf_test_164b',
    source_activation_decision_id: 'dec_test_164b', source_activation_lock_id: 'lock_test_164b',
    source_activation_auth_id: 'auth_test_164b', source_activation_readiness_id: 'rd_test_164b',
    source_plan_id: 'pln_test_164b', source_dispatcher_id: 'dsp_test_164b',
    source_envelope_id: 'env_test_164b', source_auth_id: 'ath_test_164b',
    source_readiness_id: 'rd_test_164b', source_approval_id: 'apv_test_164b', source_prep_id: 'prep_test_164b',
    activation_token_issuance_status: 'FINALIZED', activation_token_issuance_result: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_preflight_hash: 'pfl_hash_164b', source_activation_token_staging_hash: 'stg_hash_164b',
    source_token_material_hash: 'token_material_hash_164b', source_freeze_package_hash: 'lock_hash_164b',
    activation_token_issuance_hash: 'iss_hash_164b', token_issuance_evidence_pack_hash: 'ep_hash_164b', evidence_pack_hash: 'ep_hash_164b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const readinessRecord = {
    activation_token_redemption_readiness_id: readinessId, source_activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_164b', source_activation_token_staging_id: 'ats_test_164b',
    source_activation_token_final_apv_id: 'apv_test_164b', source_activation_token_env_id: 'ate_test_164b',
    source_activation_handoff_id: 'ahf_test_164b', source_activation_decision_id: 'dec_test_164b',
    source_activation_lock_id: 'lock_test_164b', source_activation_auth_id: 'auth_test_164b',
    source_activation_readiness_id: 'rd_test_164b', source_plan_id: 'pln_test_164b',
    source_dispatcher_id: 'dsp_test_164b', source_envelope_id: 'env_test_164b',
    source_auth_id: 'ath_test_164b', source_readiness_id: 'rd_test_164b',
    source_approval_id: 'apv_test_164b', source_prep_id: 'prep_test_164b',
    activation_token_redemption_readiness_status: 'FINALIZED',
    activation_token_redemption_readiness_result: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_issuance_hash: 'iss_hash_164b', source_activation_token_preflight_hash: 'pfl_hash_164b',
    source_activation_token_staging_hash: 'stg_hash_164b', source_token_material_hash: 'token_material_hash_164b',
    source_freeze_package_hash: 'lock_hash_164b', activation_token_redemption_readiness_hash: 'rdy_hash_164b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const authRecord = {
    activation_token_redemption_auth_id: authId, source_activation_token_redemption_readiness_id: readinessId,
    source_activation_token_issuance_id: issuanceId, source_activation_token_preflight_id: 'atp_test_164b',
    source_activation_token_staging_id: 'ats_test_164b', source_activation_token_final_apv_id: 'apv_test_164b',
    source_activation_token_env_id: 'ate_test_164b', source_activation_handoff_id: 'ahf_test_164b',
    source_activation_decision_id: 'dec_test_164b', source_activation_lock_id: 'lock_test_164b',
    source_activation_auth_id: 'auth_test_164b', source_activation_readiness_id: 'rd_test_164b',
    source_plan_id: 'pln_test_164b', source_dispatcher_id: 'dsp_test_164b',
    source_envelope_id: 'env_test_164b', source_auth_id: 'ath_test_164b',
    source_readiness_id: 'rd_test_164b', source_approval_id: 'apv_test_164b', source_prep_id: 'prep_test_164b',
    activation_token_redemption_auth_status: 'FINALIZED',
    activation_token_redemption_auth_result: 'REDEMPTION_AUTHORIZED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_redemption_readiness_hash: 'rdy_hash_164b', source_activation_token_issuance_hash: 'iss_hash_164b',
    source_activation_token_preflight_hash: 'pfl_hash_164b', source_activation_token_staging_hash: 'stg_hash_164b',
    source_token_material_hash: 'token_material_hash_164b', source_freeze_package_hash: 'lock_hash_164b',
    activation_token_redemption_auth_hash: 'ath_hash_164b', execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_REDEMPTION_AUTH_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  if (!isProdLike) {
    issuanceBuilder._mockState.tokenIssuance.set(issuanceId, issuanceRecord);
    readinessBuilder._mockState.tokenRedemptionReadiness.set(readinessId, readinessRecord);
    authBuilder._mockState.tokenRedemptionAuth.set(authId, authRecord);
    authBuilder._mockState.rules.set(authId, []);

    const envRecord = {
      activation_token_redemption_env_id: envId,
      source_activation_token_redemption_auth_id: authId,
      activation_token_redemption_envelope_status: 'FINALIZED',
      activation_token_redemption_envelope_result: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_token_redemption_envelope_hash: 'env_hash_164b'
    };
    envBuilder._mockState.tokenRedemptionEnvelope.set(envId, envRecord);
    envBuilder._mockState.rules.set(envId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_env WHERE activation_token_redemption_env_id = ?', [envId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_auth WHERE activation_token_redemption_auth_id = ?', [authId]);
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
       VALUES (?, 'atp_test_164b', 'ats_test_164b', 'apv_test_164b', 'ate_test_164b', 'ahf_test_164b', 'dec_test_164b', 'lock_test_164b', 'auth_test_164b', 'rd_test_164b', 'pln_test_164b', 'dsp_test_164b', 'env_test_164b', 'ath_test_164b', 'rd_test_164b', 'apv_test_164b', 'prep_test_164b',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', ?, ?,
        'pfl_hash_164b', 'stg_hash_164b', 'token_material_hash_164b', 'lock_hash_164b',
        'iss_hash_164b', 'ep_hash_164b', 'ep_hash_164b',
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
       VALUES (?, ?, 'atp_test_164b', 'ats_test_164b', 'apv_test_164b', 'ate_test_164b', 'ahf_test_164b', 'dec_test_164b', 'lock_test_164b', 'auth_test_164b', 'rd_test_164b', 'pln_test_164b', 'dsp_test_164b', 'env_test_164b', 'ath_test_164b', 'rd_test_164b', 'apv_test_164b', 'prep_test_164b',
        'FINALIZED', 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'iss_hash_164b', 'pfl_hash_164b', 'stg_hash_164b', 'token_material_hash_164b', 'lock_hash_164b',
        'rdy_hash_164b', 'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [readinessId, issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_auth
       (activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id,
        source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id,
        source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id,
        source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id,
        source_plan_id, source_dispatcher_id, source_envelope_id,
        source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_redemption_auth_status, activation_token_redemption_auth_result,
        risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_redemption_auth_summary_json,
        impact_review_json, rollback_review_json, guardrail_review_json,
        token_redemption_auth_rules_json, token_redemption_auth_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, non_redeemable_token_record_json, source_activation_token_redemption_readiness_hash,
        source_activation_token_issuance_hash, source_activation_token_preflight_hash, source_activation_token_staging_hash,
        source_token_material_hash, source_freeze_package_hash, activation_token_redemption_auth_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status,
        job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'FINALIZED', 'REDEMPTION_AUTHORIZED_NOT_REDEEMED',
               ?, ?, ?, ?, ?,
               'PASS', 'PASS', ?, '{}', '{}', '{}', '{}', '{}',
               '{}', ?, ?, ?, 'rdy_hash_164b', 'iss_hash_164b', 'pfl_hash_164b', 'stg_hash_164b',
               'token_material_hash_164b', 'lock_hash_164b', 'ath_hash_164b',
               'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_AUTH_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
               'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        authId, readinessId, issuanceId,
        issuanceRecord.source_activation_token_preflight_id, issuanceRecord.source_activation_token_staging_id, issuanceRecord.source_activation_token_final_apv_id,
        issuanceRecord.source_activation_token_env_id, issuanceRecord.source_activation_handoff_id, issuanceRecord.source_activation_decision_id,
        issuanceRecord.source_activation_lock_id, issuanceRecord.source_activation_auth_id, issuanceRecord.source_activation_readiness_id,
        issuanceRecord.source_plan_id, issuanceRecord.source_dispatcher_id, issuanceRecord.source_envelope_id, issuanceRecord.source_auth_id,
        issuanceRecord.source_readiness_id, issuanceRecord.source_approval_id, issuanceRecord.source_prep_id, issuanceRecord.source_review_id,
        issuanceRecord.source_simulation_id, issuanceRecord.source_execution_id, issuanceRecord.cohort_id, issuanceRecord.tenant_id, issuanceRecord.simulation_type,
        issuanceRecord.risk_level, issuanceRecord.confidence_level, issuanceRecord.projected_impact_score, issuanceRecord.rollback_feasibility_score, issuanceRecord.evidence_completeness_score,
        JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope), JSON.stringify({})
      ]
    );

    // Create the finalized Phase 163 envelope using the real builder to keep SQL mappings in sync.
    const createdEnv = await envBuilder.createTokenRedemptionEnvelopeDraft(authId, 'admin');
    await envBuilder._internalUpdateTokenRedemptionEnvelope(createdEnv.tokenRedemptionEnvelope.activation_token_redemption_env_id, {
      activation_token_redemption_env_id: envId, // override generated ID to keep test constant
      activation_token_redemption_envelope_status: 'FINALIZED',
      activation_token_redemption_envelope_result: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
      activation_token_redemption_envelope_hash: 'env_hash_164b'
    });
  }
}

(async () => {
  console.log('=== Smoke 164B: Create Token Redemption Final Approval Draft ===\n');

  try {
    const envId = 'ate_164b_1';
    const authId = 'ata_164b_1';
    const readinessId = 'atr_164b_1';
    const issuanceId = 'ati_164b_1';
    await setupFinalizedEnv(envId, authId, readinessId, issuanceId);

    const result = await builder.createTokenRedemptionFinalApprovalDraft(envId, 'admin');
    assert.ok(result.tokenRedemptionFinalApproval);
    assert.strictEqual(result.tokenRedemptionFinalApproval.activation_token_redemption_final_apv_status, 'DRAFT');
    assert.strictEqual(result.tokenRedemptionFinalApproval.source_activation_token_redemption_env_id, envId);
    console.log('  PASS: Draft redemption final approval created successfully from Phase 163 envelope.');

    // Negative case: draft from non-finalized env
    if (!isProdLike) {
      envBuilder._mockState.tokenRedemptionEnvelope.set('env_invalid', {
        activation_token_redemption_env_id: 'env_invalid',
        activation_token_redemption_envelope_status: 'DRAFT'
      });
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_env WHERE activation_token_redemption_env_id = ?', ['env_invalid']);
      const invalidEnv = await envBuilder.createTokenRedemptionEnvelopeDraft(authId, 'admin');
      await envBuilder._internalUpdateTokenRedemptionEnvelope(invalidEnv.tokenRedemptionEnvelope.activation_token_redemption_env_id, {
        activation_token_redemption_env_id: 'env_invalid', // override generated ID to keep test constant
        activation_token_redemption_envelope_status: 'DRAFT'
      });
    }

    await assert.rejects(
      builder.createTokenRedemptionFinalApprovalDraft('env_invalid', 'admin'),
      /TOKEN_REDEMPTION_ENVELOPE_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized envelope.');

    console.log('\nSmoke 164B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 164B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
