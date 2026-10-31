'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

(async () => {
  console.log('=== Smoke 179B: Create Unlock Final Non-Execution Evidence Seal Draft ===');

  const ksdrId = 'ksdr_smoke_179b';
  const eraId = 'era_smoke_179b';
  const lphId = 'lph_smoke_179b';
  const rocId = 'roc_smoke_179b';
  const cwnId = 'cwn_smoke_179b';
  const fhasId = 'fhas_smoke_179b';
  const dcauId = 'dcau_smoke_179b';
  const oattId = 'oatt_smoke_179b';
  const freezeId = 'freeze_smoke_179b';
  const sealId = 'seal_smoke_179b';
  const frevId = 'frev_smoke_179b';
  const apvId = 'apv_smoke_179b';
  const eligId = 'elig_smoke_179b';
  const lockId = 'lock_smoke_179b';
  const fapvId = 'fapv_smoke_179b';
  const envId = 'env_smoke_179b';
  const authId = 'auth_smoke_179b';
  const readinessId = 'readiness_smoke_179b';
  const issuanceId = 'issuance_smoke_179b';

  try {
    await setupHelper.setupFinalizedUnlockKillSwitchDryRun(
      ksdrId, eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockFinalNonExecutionEvidenceSealDraft(ksdrId, 'admin');
    const record = draft.tokenRedemptionUnlockFinalNonExecutionEvidenceSeal;

    assert.strictEqual(record.source_act_token_redempt_unlock_kill_switch_dry_run_id, ksdrId);
    assert.strictEqual(record.unlock_final_non_execution_evidence_seal_status, 'DRAFT');
    assert.strictEqual(record.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(record.unlock_final_non_execution_evidence_seal_mode, 'FINAL_NON_EXECUTION_EVIDENCE_SEAL_ONLY');
    console.log('  PASS: Draft unlock final evidence seal created successfully.');

    // Negative case: Parent not finalized
    const badParentId = 'ksdr_unfinalized_smoke_179b';
    if (!isProdLike) {
      const parentBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;
      parentBuilder._mockState.tokenRedemptionUnlockKillSwitchDryRun.set(badParentId, {
        act_token_redempt_unlock_kill_switch_dry_run_id: badParentId,
        unlock_kill_switch_dry_run_status: 'DRAFT',
        unlock_kill_switch_dry_run_result: 'KILL_SWITCH_DRY_RUN_FAILED',
        token_unlock_status: 'NOT_UNLOCKED',
        token_redeemable_status: 'NOT_REDEEMABLE',
        token_redemption_status: 'LOCKED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        plan_executable_status: 'NOT_EXECUTABLE',
        job_creation_status: 'NO_REAL_JOB_CREATED',
        queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      });
    } else {
      await setupHelper.setupFinalizedUnlockKillSwitchDryRun(
        badParentId,
        'era_bad_smoke_179b',
        'lph_bad_smoke_179b',
        'roc_bad_smoke_179b',
        'cwn_bad_smoke_179b',
        'fhas_bad_smoke_179b',
        'dcau_bad_smoke_179b',
        'oatt_bad_smoke_179b',
        'freeze_bad_smoke_179b',
        'seal_bad_smoke_179b',
        'frev_bad_smoke_179b',
        'apv_bad_smoke_179b',
        'elig_bad_smoke_179b',
        'lock_bad_smoke_179b',
        'fapv_bad_smoke_179b',
        'env_bad_smoke_179b',
        'auth_bad_smoke_179b',
        'readiness_bad_smoke_179b',
        'issuance_bad_smoke_179b'
      );
      await db.query(
        `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_ksdr
         SET unlock_kill_switch_dry_run_status = 'DRAFT'
         WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?`,
        [badParentId]
      );
    }

    await assert.rejects(
      builder.createTokenRedemptionUnlockFinalNonExecutionEvidenceSealDraft(badParentId, 'admin'),
      /Parent emergency rollback authority must be FINALIZED/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized parent.');

    console.log('\nSmoke 179B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 179B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
