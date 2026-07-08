'use strict';

const assert = require('assert');
const { setupFinalizedRedemptionLock, isProdLike } = require('./smoke_phase166_setup_helper');
const db = require('../src/api/services/mysqlClient');
const lockBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;

(async () => {
  console.log('=== Smoke 166B: Create Unlock Eligibility Draft ===\n');

  try {
    const lockId = 'atl_166b_1';
    const finalApvId = 'atfa_166b_1';
    const envId = 'ate_166b_1';
    const authId = 'ata_166b_1';
    const readinessId = 'atr_166b_1';
    const issuanceId = 'ati_166b_1';

    await setupFinalizedRedemptionLock(lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const result = await builder.createTokenRedemptionUnlockEligibilityDraft(lockId, 'admin');
    assert.ok(result.tokenRedemptionUnlockEligibility);
    assert.strictEqual(result.tokenRedemptionUnlockEligibility.unlock_eligibility_status, 'DRAFT');
    assert.strictEqual(result.tokenRedemptionUnlockEligibility.source_activation_token_redemption_lock_id, lockId);
    console.log('  PASS: Draft unlock eligibility created successfully from Phase 165 redemption lock.');

    // Negative case: draft from non-finalized lock parent
    const invalidLockId = 'atl_invalid';
    if (!isProdLike) {
      lockBuilder._mockState.tokenRedemptionLock.set(invalidLockId, {
        activation_token_redemption_lock_id: invalidLockId,
        activation_token_redemption_lock_status: 'DRAFT'
      });
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_lock WHERE activation_token_redemption_lock_id = ?', [invalidLockId]);
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_lock
         (activation_token_redemption_lock_id, source_activation_token_redemption_final_apv_id, source_activation_token_redemption_env_id,
          source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id,
          source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id,
          source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id,
          source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id,
          source_auth_id, source_readiness_id, source_approval_id, source_prep_id, activation_token_redemption_lock_status,
          activation_token_redemption_lock_result, risk_level, confidence_level, projected_impact_score,
          rollback_feasibility_score, evidence_completeness_score, guardrail_status, write_scope_status, canary_envelope_json,
          token_redemption_lock_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
          token_redemption_lock_rules_json, token_redemption_lock_blockers_json, non_execution_attestation_json,
          write_scope_attestation_json, non_redeemable_token_record_json, source_activation_token_redemption_final_approval_hash,
          source_activation_token_redemption_envelope_hash, source_activation_token_redemption_authorization_hash,
          source_activation_token_redemption_readiness_hash, source_activation_token_issuance_hash, source_activation_token_preflight_hash,
          source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
          activation_token_redemption_lock_hash, execution_capability_status, token_status, token_redemption_lock_status_val,
          token_redemption_status, token_redeemable_status, activation_execution_status, redemption_package_freeze_status,
          package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status,
          created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT',
                 'PENDING', 'LOW', 'HIGH', 0.0, 100.0, 0.0, 'PENDING', 'PENDING', '{}',
                 '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', 'hash',
                 'hash', 'hash', 'hash', 'hash', 'hash', 'hash', 'hash', 'hash',
                 'hash', 'EXECUTION_NOT_ENABLED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOCKED_NOT_REDEEMED',
                 'LOCKED_NOT_REDEEMED', 'NOT_REDEEMABLE', 'TOKEN_REDEMPTION_LOCK_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
                 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED',
                 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'admin', 'admin')`,
        [invalidLockId, finalApvId, envId, authId, readinessId, issuanceId]
      );
    }

    await assert.rejects(
      builder.createTokenRedemptionUnlockEligibilityDraft(invalidLockId, 'admin'),
      /TOKEN_REDEMPTION_LOCK_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized lock.');

    console.log('\nSmoke 166B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 166B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
