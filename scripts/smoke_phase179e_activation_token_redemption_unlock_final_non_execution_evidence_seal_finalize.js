'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealDecisionService').serviceInstance;
const evidenceService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvidencePackService').serviceInstance;

(async () => {
  console.log('=== Smoke 179E: Final Non-Execution Evidence Seal Finalize ===');

  const ksdrId = 'ksdr_smoke_179e';
  const eraId = 'era_smoke_179e';
  const lphId = 'lph_smoke_179e';
  const rocId = 'roc_smoke_179e';
  const cwnId = 'cwn_smoke_179e';
  const fhasId = 'fhas_smoke_179e';
  const dcauId = 'dcau_smoke_179e';
  const oattId = 'oatt_smoke_179e';
  const freezeId = 'freeze_smoke_179e';
  const sealId = 'seal_smoke_179e';
  const frevId = 'frev_smoke_179e';
  const apvId = 'apv_smoke_179e';
  const eligId = 'elig_smoke_179e';
  const lockId = 'lock_smoke_179e';
  const fapvId = 'fapv_smoke_179e';
  const envId = 'env_smoke_179e';
  const authId = 'auth_smoke_179e';
  const readinessId = 'readiness_smoke_179e';
  const issuanceId = 'issuance_smoke_179e';

  try {
    await setupHelper.setupFinalizedUnlockKillSwitchDryRun(
      ksdrId, eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockFinalNonExecutionEvidenceSealDraft(ksdrId, 'admin');
    const id = draft.tokenRedemptionUnlockFinalNonExecutionEvidenceSeal.act_token_redempt_unlock_final_non_execution_evidence_seal_id;

    await decisionService.recordEvidenceSealOfficer(id, 'dummy_karl', 'compliance_officer', 'Valid officer assigned', 'admin');

    const confirmations = {
      final_non_execution_evidence_seal_confirmation: true,
      token_never_unlocked_confirmed: true,
      token_never_redeemable_confirmed: true,
      token_never_redeemed_confirmed: true,
      high_risk_execution_never_enabled_confirmed: true,
      plan_never_executable_confirmed: true,
      no_real_job_created_confirmed: true,
      no_queue_dispatch_confirmed: true,
      zero_runtime_mutation_confirmed: true,
      kill_switch_dry_run_verified: true,
      emergency_rollback_authority_verified: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_authorization_seal_verified: true,
      dual_control_authorization_verified: true,
      lineage_integrity_verified: true
    };
    await evaluator.evaluateUnlockFinalNonExecutionEvidenceSeal(id, confirmations, 'admin');
    await decisionService.recordDecision(id, 'APPROVE_FINAL_NON_EXECUTION_EVIDENCE_SEAL', 'Approved for finalization', 'admin');

    // Finalize
    await decisionService.finalizeUnlockFinalNonExecutionEvidenceSeal(id, 'admin');

    const finalized = await builder.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(id);
    assert.strictEqual(finalized.unlock_final_non_execution_evidence_seal_status, 'FINALIZED');
    assert.strictEqual(finalized.activation_execution_status, 'UNLOCK_FINAL_NON_EXECUTION_EVIDENCE_SEAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED');
    assert.ok(finalized.evidence_pack_hash);

    // Verify lineage chain recursively contains all prior phases
    const chain = finalized.lineage_hash_chain_json;
    assert.ok(chain.phase179_unlock_final_non_execution_evidence_seal, 'Chain missing phase 179');
    assert.ok(chain.phase178_unlock_kill_switch_dry_run, 'Chain missing phase 178');
    assert.ok(chain.phase177_unlock_emergency_rollback_authority, 'Chain missing phase 177');
    assert.ok(chain.phase176_unlock_legal_policy_hold, 'Chain missing phase 176');
    assert.ok(chain.phase175_unlock_risk_officer_countersign, 'Chain missing phase 175');
    assert.ok(chain.phase174_unlock_compliance_witness, 'Chain missing phase 174');
    assert.ok(chain.phase164_redemption_final_approval, 'Chain missing phase 164');
    console.log('  PASS: Finalized evidence seal successfully with complete lineage back to Phase 164.');

    // Invariant checks
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    assert.strictEqual(finalized.token_redemption_status, 'LOCKED_NOT_REDEEMED');
    assert.strictEqual(finalized.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: All safety boundary invariants preserved after finalization.');

    // Persisted evidence check
    const ev = await evidenceService.getEvidence(id);
    assert.ok(ev);
    const evJson = JSON.parse(ev.evidence_pack_json);
    assert.strictEqual(evJson.schema_version, '179.0');
    console.log('  PASS: Evidence schema version is verified as 179.0.');

    console.log('\nSmoke 179E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 179E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
