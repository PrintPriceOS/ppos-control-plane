'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

(async () => {
  console.log('=== Smoke 178B: Create Unlock Kill-Switch Dry-Run Draft from Phase 177 ERA ===');

  const eraId = 'era_smoke_178b';
  const lphId = 'lph_smoke_178b';
  const rocId = 'roc_smoke_178b';
  const cwnId = 'cwn_smoke_178b';
  const fhasId = 'fhas_smoke_178b';
  const dcauId = 'dcau_smoke_178b';
  const oattId = 'oatt_smoke_178b';
  const freezeId = 'freeze_smoke_178b';
  const sealId = 'seal_smoke_178b';
  const frevId = 'frev_smoke_178b';
  const apvId = 'apv_smoke_178b';
  const eligId = 'elig_smoke_178b';
  const lockId = 'lock_smoke_178b';
  const fapvId = 'fapv_smoke_178b';
  const envId = 'env_smoke_178b';
  const authId = 'auth_smoke_178b';
  const readinessId = 'readiness_smoke_178b';
  const issuanceId = 'issuance_smoke_178b';

  try {
    await setupHelper.setupFinalizedUnlockEmergencyRollbackAuthority(
      eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockKillSwitchDryRunDraft(eraId, 'admin');
    const record = draft.tokenRedemptionUnlockKillSwitchDryRun;

    assert.strictEqual(record.source_act_token_redempt_unlock_emergency_rollback_authority_id, eraId);
    assert.strictEqual(record.unlock_kill_switch_dry_run_status, 'DRAFT');
    assert.strictEqual(record.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(record.unlock_kill_switch_dry_run_mode, 'KILL_SWITCH_DRY_RUN_ONLY');
    console.log('  PASS: Draft unlock kill-switch dry-run created successfully from Phase 177 ERA.');

    // Negative case: Parent not finalized
    const badParentId = 'era_unfinalized_smoke_178b';
    if (!isProdLike) {
      const parentBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
      parentBuilder._mockState.tokenRedemptionUnlockEmergencyRollbackAuthority.set(badParentId, {
        act_token_redempt_unlock_emergency_rollback_authority_id: badParentId,
        unlock_emergency_rollback_authority_status: 'DRAFT',
        unlock_emergency_rollback_authority_result: 'EMERGENCY_ROLLBACK_AUTHORITY_FAILED',
        token_unlock_status: 'NOT_UNLOCKED',
        token_redeemable_status: 'NOT_REDEEMABLE',
        token_redemption_status: 'LOCKED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        plan_executable_status: 'NOT_EXECUTABLE',
        job_creation_status: 'NO_REAL_JOB_CREATED',
        queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      });
    }

    await assert.rejects(
      builder.createTokenRedemptionUnlockKillSwitchDryRunDraft(badParentId, 'admin'),
      /Parent emergency rollback authority must be FINALIZED/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized parent.');

    console.log('\nSmoke 178B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 178B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
