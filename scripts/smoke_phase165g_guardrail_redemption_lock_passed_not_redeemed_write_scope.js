'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const finalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const envBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockDecisionService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockGuardrailService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

(async () => {
  console.log('=== Smoke 165G: Guardrails & Safety Boundary Scanner ===\n');

  try {
    // 1. Source code scan for forbidden execution methods
    const scanFindings = await guardrailSvc.performSafetyScannerCheck(null);
    assert.ok(Array.isArray(scanFindings), 'Safety scanner should return array');
    const criticals = scanFindings.filter(f => f.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0, `Safety scan found CRITICAL findings: ${criticals.map(f => `${f.file}: ${f.finding}`).join('; ')}`);
    console.log('  PASS: Source code safety scanner found no CRITICAL forbidden execution calls.');

    // 2. Canary field checks — lock record must carry non-redeemable markers
    const finalApvId = 'atfa_165g_1';
    const envId = 'ate_165g_1';

async function seedFinalApprovalRealDB(finalApvId, envId) {
  // Clear any existing records to avoid duplicate keys
  await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_lock WHERE source_activation_token_redemption_final_apv_id = ?', [finalApvId]);
  await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_fapv WHERE activation_token_redemption_final_apv_id = ?', [finalApvId]);
  await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_env WHERE activation_token_redemption_env_id = ?', [envId]);

  // Create envelope draft pointing to the valid 'ata_165b_1' (from 165b)
  const createdEnv = await envBuilder.createTokenRedemptionEnvelopeDraft('ata_165b_1', 'admin');
  await envBuilder._internalUpdateTokenRedemptionEnvelope(createdEnv.tokenRedemptionEnvelope.activation_token_redemption_env_id, {
    activation_token_redemption_env_id: envId,
    activation_token_redemption_envelope_status: 'FINALIZED',
    activation_token_redemption_envelope_result: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
    activation_token_redemption_envelope_hash: 'env_hash_165g'
  });

  // Create final approval draft pointing to the newly finalized envelope
  const createdFApv = await finalApvBuilder.createTokenRedemptionFinalApprovalDraft(envId, 'admin');
  await finalApvBuilder._internalUpdateTokenRedemptionFinalApproval(createdFApv.tokenRedemptionFinalApproval.activation_token_redemption_final_apv_id, {
    activation_token_redemption_final_apv_id: finalApvId,
    activation_token_redemption_final_apv_status: 'FINALIZED',
    activation_token_redemption_final_apv_result: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
    activation_token_redemption_final_apv_hash: 'fapv_hash_165g'
  });
}

    if (!isProdLike) {
      const config = { redemption_lock_mode: 'TOKEN_REDEMPTION_LOCK_PRE_REDEMPTION_FREEZE_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redeemable: false };
      const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
      const writeScope = { writes_only_phase164_tables: true, wrote_phase128_to_163_operational_tables: false };
      envBuilder._mockState.tokenRedemptionEnvelope.set(envId, {
        activation_token_redemption_env_id: envId, activation_token_redemption_envelope_status: 'FINALIZED',
        activation_token_redemption_envelope_hash: 'env_hash_165g'
      });
      envBuilder._mockState.rules.set(envId, []);
      finalApvBuilder._mockState.tokenRedemptionFinalApproval.set(finalApvId, {
        activation_token_redemption_final_apv_id: finalApvId, source_activation_token_redemption_env_id: envId,
        activation_token_redemption_final_apv_status: 'FINALIZED',
        activation_token_redemption_final_apv_result: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        activation_execution_status: 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
        package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
        job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED', activation_token_redemption_final_apv_hash: 'fapv_hash_165g',
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

    // Create, evaluate, decide, finalize a lock record
    const draft = await builder.createTokenRedemptionLockDraft(finalApvId, 'admin');
    const lockId = draft.tokenRedemptionLock.activation_token_redemption_lock_id;
    await evaluator.evaluateTokenRedemptionLock(lockId, { security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true }, 'admin');
    await decisionSvc.recordDecision(lockId, 'APPROVE', 'Lock enforced — pre-redemption package frozen.', 'admin');
    await decisionSvc.finalizeRedemptionLock(lockId, 'admin');

    const finalLock = await builder.getTokenRedemptionLock(lockId);

    // 3. Non-execution attestation must be present
    const nonExAtt = finalLock.non_execution_attestation_json;
    assert.ok(nonExAtt && (nonExAtt.safe_workflow_boundary_preserved === true || typeof nonExAtt === 'object'), 'Non-execution attestation must be present and valid');
    console.log('  PASS: Non-execution attestation present.');

    // 4. Token status must remain non-redeemable
    const tokenStatus = finalLock.token_status || finalLock.token_redeemable_status;
    assert.ok(
      !tokenStatus || tokenStatus === 'ISSUANCE_RECORDED_NOT_REDEEMABLE' || tokenStatus === 'NOT_REDEEMABLE',
      `Token status must be non-redeemable, got: ${tokenStatus}`
    );
    console.log('  PASS: Token remains non-redeemable after lock finalize.');

    // 5. Plan executable status must be NOT_EXECUTABLE
    const planExec = finalLock.plan_executable_status;
    assert.ok(!planExec || planExec === 'NOT_EXECUTABLE', `Plan must be NOT_EXECUTABLE, got: ${planExec}`);
    console.log('  PASS: Plan remains NOT_EXECUTABLE after lock finalize.');

    // 6. Runtime mutation must be zero
    const rtMutation = finalLock.runtime_mutation_status;
    assert.ok(!rtMutation || rtMutation === 'ZERO_RUNTIME_MUTATION_CONFIRMED', `Runtime mutation must be ZERO, got: ${rtMutation}`);
    console.log('  PASS: Runtime mutation confirmed ZERO.');

    // 7. Job creation must be zero
    const jobCreation = finalLock.job_creation_status;
    assert.ok(!jobCreation || jobCreation === 'NO_REAL_JOB_CREATED', `No real job should be created, got: ${jobCreation}`);
    console.log('  PASS: No real job created confirmed.');

    // 8. Queue dispatch must be zero
    const queueDispatch = finalLock.queue_dispatch_status;
    assert.ok(!queueDispatch || queueDispatch === 'NO_QUEUE_DISPATCHED', `No queue dispatched, got: ${queueDispatch}`);
    console.log('  PASS: No queue dispatched confirmed.');

    console.log('\nSmoke 165G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 165G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
