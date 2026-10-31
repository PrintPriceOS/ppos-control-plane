'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityDecisionService').serviceInstance;
const evidenceService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvidencePackService').serviceInstance;

(async () => {
  console.log('=== Smoke 177E: Activation Token Redemption Unlock Emergency Rollback Authority Finalize ===');

  const parentId = 'lph_smoke_177e';
  const rocId = 'roc_smoke_177e';
  const cwnId = 'cwn_smoke_177e';
  const fhasId = 'fhas_smoke_177e';
  const dcauId = 'dcau_smoke_177e';
  const oattId = 'oatt_smoke_177e';
  const freezeId = 'freeze_smoke_177e';
  const sealId = 'seal_smoke_177e';
  const frevId = 'frev_smoke_177e';
  const apvId = 'apv_smoke_177e';
  const eligId = 'elig_smoke_177e';
  const lockId = 'lock_smoke_177e';
  const fapvId = 'fapv_smoke_177e';
  const envId = 'env_smoke_177e';
  const authId = 'auth_smoke_177e';
  const readinessId = 'readiness_smoke_177e';
  const issuanceId = 'issuance_smoke_177e';

  try {
    await setupHelper.setupFinalizedUnlockLegalPolicyHold(
      parentId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockEmergencyRollbackAuthorityDraft(parentId, 'admin');
    const id = draft.tokenRedemptionUnlockEmergencyRollbackAuthority.act_token_redempt_unlock_emergency_rollback_authority_id;

    await decisionService.recordRollbackOfficer(id, 'dummy_george', 'rollback_officer', 'Valid officer assigned', 'admin');

    const confirmations = {
      emergency_rollback_authority_confirmation: true,
      rollback_officer_assigned_confirmed: true,
      emergency_stop_authority_ready_confirmed: true,
      rollback_channel_available_confirmed: true,
      rollback_runbook_available_confirmed: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    };
    await evaluator.evaluateUnlockEmergencyRollbackAuthority(id, confirmations, 'admin');

    await decisionService.recordDecision(id, 'APPROVE_EMERGENCY_ROLLBACK_AUTHORITY', 'Approved for finalization', 'admin');

    // Finalize
    await decisionService.finalizeUnlockEmergencyRollbackAuthority(id, 'admin');

    const finalized = await builder.getTokenRedemptionUnlockEmergencyRollbackAuthority(id);
    assert.strictEqual(finalized.unlock_emergency_rollback_authority_status, 'FINALIZED');
    assert.strictEqual(finalized.activation_execution_status, 'UNLOCK_EMERGENCY_ROLLBACK_AUTHORITY_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED');
    assert.ok(finalized.evidence_pack_hash);

    // Verify lineage contains parent stages
    const chain = finalized.lineage_hash_chain_json;
    assert.ok(chain.phase177_unlock_emergency_rollback_authority, 'Chain missing phase 177');
    assert.ok(chain.phase176_unlock_legal_policy_hold, 'Chain missing phase 176');
    assert.ok(chain.phase175_unlock_risk_officer_countersign, 'Chain missing phase 175');
    assert.ok(chain.phase174_unlock_compliance_witness, 'Chain missing phase 174');
    assert.ok(chain.phase173_unlock_final_human_authorization_seal, 'Chain missing phase 173');
    assert.ok(chain.phase164_redemption_final_approval, 'Chain missing phase 164');

    console.log('  PASS: Finalized unlock emergency rollback authority successfully with complete lineage back to Phase 164.');

    console.log('\nSmoke 177E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 177E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
