'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

(async () => {
  console.log('=== Smoke 180B: Create Unlock Governance Readiness Closure Draft ===');

  const fneesId = 'fnees_smoke_180b';
  const ksdrId = 'ksdr_smoke_180b';
  const eraId = 'era_smoke_180b';
  const lphId = 'lph_smoke_180b';
  const rocId = 'roc_smoke_180b';
  const cwnId = 'cwn_smoke_180b';
  const fhasId = 'fhas_smoke_180b';
  const dcauId = 'dcau_smoke_180b';
  const oattId = 'oatt_smoke_180b';
  const freezeId = 'freeze_smoke_180b';
  const sealId = 'seal_smoke_180b';
  const frevId = 'frev_smoke_180b';
  const apvId = 'apv_smoke_180b';
  const eligId = 'elig_smoke_180b';
  const lockId = 'lock_smoke_180b';
  const fapvId = 'fapv_smoke_180b';
  const envId = 'env_smoke_180b';
  const authId = 'auth_smoke_180b';
  const readinessId = 'readiness_smoke_180b';
  const issuanceId = 'issuance_smoke_180b';

  try {
    await setupHelper.setupFinalizedUnlockFinalNonExecutionEvidenceSeal(
      fneesId, ksdrId, eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockGovernanceReadinessClosureDraft(fneesId, 'admin');
    const record = draft.tokenRedemptionUnlockGovernanceReadinessClosure;

    assert.strictEqual(record.source_unlock_fnees_id, fneesId);
    assert.strictEqual(record.unlock_governance_readiness_closure_status, 'DRAFT');
    assert.strictEqual(record.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(record.unlock_governance_readiness_closure_mode, 'GOVERNANCE_READINESS_CLOSURE_ONLY');
    console.log('  PASS: Draft unlock governance closure created successfully.');

    // Negative case: Parent not finalized
    const badParentId = 'fnees_unfinalized_smoke_180b';
    if (!isProdLike) {
      const parentBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
      parentBuilder._mockState.tokenRedemptionUnlockFinalNonExecutionEvidenceSeal.set(badParentId, {
        act_token_redempt_unlock_final_non_execution_evidence_seal_id: badParentId,
        unlock_final_non_execution_evidence_seal_status: 'DRAFT',
        unlock_final_non_execution_evidence_seal_result: 'FINAL_NON_EXECUTION_EVIDENCE_SEAL_FAILED',
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
      await setupHelper.setupFinalizedUnlockFinalNonExecutionEvidenceSeal(
        badParentId,
        'ksdr_bad_smoke_180b',
        'era_bad_smoke_180b',
        'lph_bad_smoke_180b',
        'roc_bad_smoke_180b',
        'cwn_bad_smoke_180b',
        'fhas_bad_smoke_180b',
        'dcau_bad_smoke_180b',
        'oatt_bad_smoke_180b',
        'freeze_bad_smoke_180b',
        'seal_bad_smoke_180b',
        'frev_bad_smoke_180b',
        'apv_bad_smoke_180b',
        'elig_bad_smoke_180b',
        'lock_bad_smoke_180b',
        'fapv_bad_smoke_180b',
        'env_bad_smoke_180b',
        'auth_bad_smoke_180b',
        'readiness_bad_smoke_180b',
        'issuance_bad_smoke_180b'
      );
      await db.query(
        `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_fnees
         SET unlock_final_non_execution_evidence_seal_status = 'DRAFT'
         WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?`,
        [badParentId]
      );
    }

    await assert.rejects(
      builder.createTokenRedemptionUnlockGovernanceReadinessClosureDraft(badParentId, 'admin'),
      /Parent emergency rollback authority must be FINALIZED/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized parent.');

    console.log('\nSmoke 180B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 180B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
