'use strict';

const assert = require('assert');
const { setupFinalizedUnlockFinalHumanAuthorizationSeal, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessDecisionService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 174C: Activation Token Redemption Unlock Compliance Witness Evaluator Rules ===');

  const unlockComplianceWitnessId = 'cwn_smoke_174c';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_174c';
  const unlockDualControlAuthorizationId = 'dcau_smoke_174c';
  const unlockOperatorAttestationId = 'oatt_smoke_174c';
  const unlockPreExecutionFreezeId = 'freeze_smoke_174c';
  const unlockSealId = 'seal_smoke_174c';
  const finalReviewId = 'frev_smoke_174c';
  const approvalId = 'apv_smoke_174c';
  const eligibilityId = 'elig_smoke_174c';
  const lockId = 'lock_smoke_174c';
  const finalApvId = 'fapv_smoke_174c';
  const envId = 'env_smoke_174c';
  const authId = 'auth_smoke_174c';
  const readinessId = 'readiness_smoke_174c';
  const issuanceId = 'issuance_smoke_174c';

  try {
    await setupFinalizedUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockComplianceWitnessDraft(unlockFinalHumanAuthorizationSealId, 'admin');
    const tempId = draft.tokenRedemptionUnlockComplianceWitness.act_token_redempt_unlock_compliance_witness_id;

    await decisionSvc.recordComplianceWitness(tempId, 'user_diana', 'compliance_officer', 'Compliance witness checks done', 'admin');

    const confirmations = {
      compliance_witness_attestation_confirmation: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      security_officer_unlock_attestation_verified: true,
      compliance_officer_unlock_attestation_verified: true,
      operations_director_unlock_attestation_verified: true,
      rollback_authority_unlock_attestation_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    };

    const evalResult = await evaluator.evaluateUnlockComplianceWitness(tempId, confirmations, 'admin');
    assert.ok(evalResult.tokenRedemptionUnlockComplianceWitness, 'Evaluation result missing record');
    assert.ok(evalResult.rules.length >= 23, `Expected at least 23 rules evaluated, got ${evalResult.rules.length}`);

    const criticalViolations = evalResult.rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticalViolations.length, 0, 'Should have zero critical rule violations when all confirmations are true');
    console.log('  PASS: Evaluator ran successfully with 13 confirmations.');
    console.log(`  PASS: ${evalResult.rules.length} rules recorded.`);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    console.log('\nSmoke 174C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 174C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
