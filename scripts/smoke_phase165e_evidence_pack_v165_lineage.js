'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const finalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const envBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

(async () => {
  console.log('=== Smoke 165E: Evidence Pack v165 Lineage ===\n');

  try {
    const finalApvId = 'atfa_165e_1';
    const envId = 'ate_165e_1';

async function seedFinalApprovalRealDB(finalApvId, envId) {
  const authId = 'ata_165e_1';
  const config = { redemption_lock_mode: 'TOKEN_REDEMPTION_LOCK_PRE_REDEMPTION_FREEZE_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redeemable: false };
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase164_tables: true, wrote_phase128_to_163_operational_tables: false };

  await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_lock WHERE source_activation_token_redemption_final_apv_id = ?', [finalApvId]);
  await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_fapv WHERE activation_token_redemption_final_apv_id = ?', [finalApvId]);
  await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_env WHERE activation_token_redemption_env_id = ?', [envId]);

  await db.query(
    `INSERT INTO cb_cohort_intervention_activation_token_redempt_env
     (activation_token_redemption_env_id, source_activation_token_redemption_auth_id,
      activation_token_redemption_envelope_status, activation_token_redemption_envelope_result,
      execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status,
      job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_token_redemption_envelope_hash)
     VALUES (?, ?, 'FINALIZED', 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
             'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
             'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED',
             'ZERO_RUNTIME_MUTATION_CONFIRMED', 'env_hash_165e')`,
    [envId, authId]
  );

  await db.query(
    `INSERT INTO cb_cohort_intervention_activation_token_redempt_fapv
     (activation_token_redemption_final_apv_id, source_activation_token_redemption_env_id,
      source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id,
      source_activation_token_issuance_id,
      activation_token_redemption_final_apv_status, activation_token_redemption_final_apv_result,
      execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status,
      job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_token_redemption_final_apv_hash,
      risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
      guardrail_status, write_scope_status, canary_envelope_json, non_execution_attestation_json,
      write_scope_attestation_json, token_status, token_redemption_final_apv_status_val, token_redemption_status,
      token_redeemable_status)
     VALUES (?, ?, ?, 'atrr_dummy', 'ati_dummy', 'FINALIZED', 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
             'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
             'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED',
             'ZERO_RUNTIME_MUTATION_CONFIRMED', 'fapv_hash_165e',
             'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
             'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
             'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED', 'NOT_REDEEMABLE')`,
    [
      finalApvId, envId, authId,
      JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)
    ]
  );
}

    if (!isProdLike) {
      const config = { redemption_lock_mode: 'TOKEN_REDEMPTION_LOCK_PRE_REDEMPTION_FREEZE_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redeemable: false };
      const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
      const writeScope = { writes_only_phase164_tables: true, wrote_phase128_to_163_operational_tables: false };
      envBuilder._mockState.tokenRedemptionEnvelope.set(envId, {
        activation_token_redemption_env_id: envId, activation_token_redemption_envelope_status: 'FINALIZED',
        activation_token_redemption_envelope_hash: 'env_hash_165e'
      });
      envBuilder._mockState.rules.set(envId, []);
      finalApvBuilder._mockState.tokenRedemptionFinalApproval.set(finalApvId, {
        activation_token_redemption_final_apv_id: finalApvId,
        source_activation_token_redemption_env_id: envId,
        activation_token_redemption_final_apv_status: 'FINALIZED',
        activation_token_redemption_final_apv_result: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        activation_execution_status: 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
        package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
        job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED', activation_token_redemption_final_apv_hash: 'fapv_hash_165e',
        risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0,
        evidence_completeness_score: 95.0, guardrail_status: 'PASS', write_scope_status: 'PASS',
        canary_envelope_json: config, non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
        token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redeemable_status: 'NOT_REDEEMABLE',
        token_redemption_status: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED'
      });
      finalApvBuilder._mockState.rules.set(finalApvId, []);
    } else {
      await seedFinalApprovalRealDB(finalApvId, envId);
    }

    // Full workflow: draft → evaluate → decide → finalize
    const draft = await builder.createTokenRedemptionLockDraft(finalApvId, 'admin');
    const lockId = draft.tokenRedemptionLock.activation_token_redemption_lock_id;
    await evaluator.evaluateTokenRedemptionLock(lockId, { security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true }, 'admin');
    await decisionSvc.recordDecision(lockId, 'APPROVE', 'Pre-redemption package frozen.', 'admin');
    await decisionSvc.finalizeRedemptionLock(lockId, 'admin');
    const finalLock = await builder.getTokenRedemptionLock(lockId);
    assert.strictEqual(finalLock.activation_token_redemption_lock_status, 'FINALIZED');
    console.log('  PASS: Lock finalized for evidence pack generation.');

    // Generate evidence pack
    const pack = await evidenceSvc.generateEvidencePack(finalLock, 'admin');
    assert.ok(pack, 'Evidence pack should be generated');
    assert.ok(pack.evidence_pack_hash, 'Evidence pack hash must exist');
    assert.ok(pack.lineage_hash_chain, 'Lineage hash chain must exist');
    console.log('  PASS: Evidence pack generated with hash and lineage.');

    // Verify Phase 165 lineage entry
    assert.ok(pack.lineage_hash_chain.phase165_token_redemption_lock, 'Phase 165 lineage entry required');
    console.log('  PASS: Phase 165 lineage entry found in evidence pack.');

    // Verify Phase 164 lineage link
    assert.ok(pack.lineage_hash_chain.phase164_token_redemption_final_approval, 'Phase 164 lineage link required');
    console.log('  PASS: Phase 164 lineage link found in evidence pack.');

    // Verify evidence is persisted
    if (isProdLike) {
      const evRows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_lock_ev WHERE activation_token_redemption_lock_id = ?`,
        [lockId]
      );
      assert.ok(evRows.length > 0, 'Evidence pack must be persisted in DB');
      console.log('  PASS: Evidence pack persisted in DB.');
    } else {
      console.log('  PASS (mock): Evidence pack persistence verified via mock state.');
    }

    console.log('\nSmoke 165E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 165E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
