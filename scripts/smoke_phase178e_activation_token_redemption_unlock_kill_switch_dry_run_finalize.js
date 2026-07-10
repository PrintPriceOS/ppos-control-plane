'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 178E: Kill-Switch Dry-Run Finalize ===');

  const eraId = 'era_smoke_178e';
  const lphId = 'lph_smoke_178e';
  const rocId = 'roc_smoke_178e';
  const cwnId = 'cwn_smoke_178e';
  const fhasId = 'fhas_smoke_178e';
  const dcauId = 'dcau_smoke_178e';
  const oattId = 'oatt_smoke_178e';
  const freezeId = 'freeze_smoke_178e';
  const sealId = 'seal_smoke_178e';
  const frevId = 'frev_smoke_178e';
  const apvId = 'apv_smoke_178e';
  const eligId = 'elig_smoke_178e';
  const lockId = 'lock_smoke_178e';
  const fapvId = 'fapv_smoke_178e';
  const envId = 'env_smoke_178e';
  const authId = 'auth_smoke_178e';
  const readinessId = 'readiness_smoke_178e';
  const issuanceId = 'issuance_smoke_178e';

  try {
    await setupHelper.setupFinalizedUnlockEmergencyRollbackAuthority(
      eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockKillSwitchDryRunDraft(eraId, 'admin');
    const id = draft.tokenRedemptionUnlockKillSwitchDryRun.act_token_redempt_unlock_kill_switch_dry_run_id;

    await decisionService.recordVerificationOfficer(id, 'dummy_henry', 'security_officer', 'Valid officer assigned', 'admin');

    const confirmations = {
      kill_switch_dry_run_verification_confirmation: true,
      kill_switch_route_available_confirmed: true,
      kill_switch_dry_run_response_confirmed: true,
      kill_switch_no_runtime_mutation_confirmed: true,
      kill_switch_no_real_execution_confirmed: true,
      rollback_officer_ready_confirmed: true,
      emergency_stop_authority_ready_confirmed: true,
      rollback_channel_available_confirmed: true,
      rollback_runbook_available_confirmed: true,
      non_execution_confirmed: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_authorization_seal_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    };
    await evaluator.evaluateUnlockKillSwitchDryRun(id, confirmations, 'admin');
    await decisionService.recordDecision(id, 'APPROVE_KILL_SWITCH_DRY_RUN', 'Approved for finalization', 'admin');

    // Finalize
    await decisionService.finalizeUnlockKillSwitchDryRun(id, 'admin');

    const finalized = await builder.getTokenRedemptionUnlockKillSwitchDryRun(id);
    assert.strictEqual(finalized.unlock_kill_switch_dry_run_status, 'FINALIZED');
    assert.strictEqual(finalized.activation_execution_status, 'UNLOCK_KILL_SWITCH_DRY_RUN_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED');
    assert.ok(finalized.evidence_pack_hash);

    // Verify lineage chain contains all expected phases
    const chain = finalized.lineage_hash_chain_json;
    assert.ok(chain.phase178_unlock_kill_switch_dry_run, 'Chain missing phase 178');
    assert.ok(chain.phase177_unlock_emergency_rollback_authority, 'Chain missing phase 177');
    assert.ok(chain.phase176_unlock_legal_policy_hold, 'Chain missing phase 176');
    assert.ok(chain.phase175_unlock_risk_officer_countersign, 'Chain missing phase 175');
    assert.ok(chain.phase174_unlock_compliance_witness, 'Chain missing phase 174');
    assert.ok(chain.phase164_redemption_final_approval, 'Chain missing phase 164');
    console.log('  PASS: Finalized kill-switch dry-run successfully with complete lineage back to Phase 164.');

    // Safety verifications
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    assert.strictEqual(finalized.token_redemption_status, 'LOCKED_NOT_REDEEMED');
    assert.strictEqual(finalized.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: All safety boundary invariants preserved after finalization.');

    console.log('\nSmoke 178E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 178E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
