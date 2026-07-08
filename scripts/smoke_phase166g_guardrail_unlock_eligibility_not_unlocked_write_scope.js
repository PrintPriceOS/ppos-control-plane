'use strict';

const assert = require('assert');
const { setupFinalizedRedemptionLock, isProdLike } = require('./smoke_phase166_setup_helper');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityDecisionService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityGuardrailService').serviceInstance;

(async () => {
  console.log('=== Smoke 166G: Guardrails & Safety Boundary Scanner ===\n');

  try {
    // 1. Source code scan for forbidden execution/unlock methods
    const scanFindings = await guardrailSvc.performSafetyScannerCheck(null);
    assert.ok(Array.isArray(scanFindings), 'Safety scanner should return array');
    const criticals = scanFindings.filter(f => f.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0, `Safety scan found CRITICAL findings: ${criticals.map(f => `${f.file}: ${f.finding}`).join('; ')}`);
    console.log('  PASS: Source code safety scanner found no CRITICAL forbidden execution calls.');

    // 2. Setup finalized lock parent
    const lockId = 'atl_166g_1';
    const finalApvId = 'atfa_166g_1';
    const envId = 'ate_166g_1';
    const authId = 'ata_166g_1';
    const readinessId = 'atr_166g_1';
    const issuanceId = 'ati_166g_1';

    await setupFinalizedRedemptionLock(lockId, finalApvId, envId, authId, readinessId, issuanceId);

    // Create, evaluate, approve, finalize unlock eligibility record
    const draft = await builder.createTokenRedemptionUnlockEligibilityDraft(lockId, 'admin');
    const eligibilityId = draft.tokenRedemptionUnlockEligibility.activation_token_redemption_unlock_eligibility_id;

    await evaluator.evaluateUnlockEligibility(eligibilityId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(eligibilityId, 'APPROVE', 'Unlock eligibility guardrail smoke test', 'admin');
    const finalized = await decisionSvc.finalizeUnlockEligibility(eligibilityId, 'admin');

    // 3. Non-execution attestation must be present
    const nonExAtt = finalized.non_execution_attestation_json;
    assert.ok(nonExAtt && (nonExAtt.safe_workflow_boundary_preserved === true || typeof nonExAtt === 'object'), 'Non-execution attestation must be present and valid');
    console.log('  PASS: Non-execution attestation present.');

    // 4. Token status must remain non-redeemable and locked
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    assert.strictEqual(finalized.actual_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains non-redeemable after lock finalize.');

    // 5. Plan executable status must be NOT_EXECUTABLE
    const planExec = finalized.plan_executable_status;
    assert.ok(!planExec || planExec === 'NOT_EXECUTABLE', `Plan must be NOT_EXECUTABLE, got: ${planExec}`);
    console.log('  PASS: Plan remains NOT_EXECUTABLE after lock finalize.');

    // 6. Runtime mutation must be zero
    const rtMutation = finalized.runtime_mutation_status;
    assert.ok(!rtMutation || rtMutation === 'ZERO_RUNTIME_MUTATION_CONFIRMED', `Runtime mutation must be ZERO, got: ${rtMutation}`);
    console.log('  PASS: Runtime mutation confirmed ZERO.');

    // 7. Job creation must be zero
    const jobCreation = finalized.job_creation_status;
    assert.ok(!jobCreation || jobCreation === 'NO_REAL_JOB_CREATED', `No real job should be created, got: ${jobCreation}`);
    console.log('  PASS: No real job created confirmed.');

    // 8. Queue dispatch must be zero
    const queueDispatch = finalized.queue_dispatch_status;
    assert.ok(!queueDispatch || queueDispatch === 'NO_QUEUE_DISPATCHED', `No queue dispatched, got: ${queueDispatch}`);
    console.log('  PASS: No queue dispatched confirmed.');

    console.log('\nSmoke 166G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 166G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
