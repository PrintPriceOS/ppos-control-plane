'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const envBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const finalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

function seedFinalApprovalMock(finalApvId, envId, authId) {
  const config = { redemption_lock_mode: 'TOKEN_REDEMPTION_LOCK_PRE_REDEMPTION_FREEZE_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redeemable: false };
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase164_tables: true, wrote_phase128_to_163_operational_tables: false };
  envBuilder._mockState.tokenRedemptionEnvelope.set(envId, {
    activation_token_redemption_env_id: envId, source_activation_token_redemption_auth_id: authId,
    activation_token_redemption_envelope_status: 'FINALIZED',
    activation_token_redemption_envelope_result: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED', activation_token_redemption_envelope_hash: 'env_hash_165c'
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
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED', activation_token_redemption_final_apv_hash: 'fapv_hash_165c',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0, guardrail_status: 'PASS', write_scope_status: 'PASS',
    canary_envelope_json: config, non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
    token_redemption_final_apv_status_val: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
    token_redemption_status: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
    token_redeemable_status: 'NOT_REDEEMABLE'
  });
  finalApvBuilder._mockState.rules.set(finalApvId, []);
}

async function seedFinalApprovalRealDB(finalApvId, envId, authId) {
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
    activation_token_redemption_envelope_hash: 'env_hash_165c'
  });

  // Create final approval draft pointing to the newly finalized envelope
  const createdFApv = await finalApvBuilder.createTokenRedemptionFinalApprovalDraft(envId, 'admin');
  await finalApvBuilder._internalUpdateTokenRedemptionFinalApproval(createdFApv.tokenRedemptionFinalApproval.activation_token_redemption_final_apv_id, {
    activation_token_redemption_final_apv_id: finalApvId,
    activation_token_redemption_final_apv_status: 'FINALIZED',
    activation_token_redemption_final_apv_result: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
    activation_token_redemption_final_apv_hash: 'fapv_hash_165c'
  });
}

(async () => {
  console.log('=== Smoke 165C: Activation Token Redemption Lock Evaluator Rules ===\n');

  try {
    const finalApvId = 'atfa_165c_1';
    const envId = 'ate_165c_1';
    const authId = 'ata_165c_1';

    if (!isProdLike) {
      seedFinalApprovalMock(finalApvId, envId, authId);
    } else {
      await seedFinalApprovalRealDB(finalApvId, envId, authId);
    }

    // Create draft
    const draft = await builder.createTokenRedemptionLockDraft(finalApvId, 'admin');
    const lockId = draft.tokenRedemptionLock.activation_token_redemption_lock_id;
    console.log(`  Created draft lock: ${lockId}`);

    // Evaluate with confirmations
    const evalResult = await evaluator.evaluateTokenRedemptionLock(lockId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');
    assert.ok(evalResult);
    console.log('  PASS: Evaluator ran successfully with confirmations.');

    // Check rules were recorded
    const rules = await evaluator.getLockRules(lockId);
    assert.ok(Array.isArray(rules), 'Rules should be an array');
    console.log(`  PASS: ${rules.length} rules recorded.`);

    // Verify no CRITICAL rules when properly confirmed
    const criticals = rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0, `No CRITICAL rules expected when all officers confirmed, got: ${criticals.map(r => r.description).join(', ')}`);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    // Verify token is not marked redeemable
    const lockRecord = await builder.getTokenRedemptionLock(lockId);
    assert.ok(!lockRecord.token_redeemable_status || lockRecord.token_redeemable_status === 'NOT_REDEEMABLE', 'Token must not be redeemable after lock evaluation');
    console.log('  PASS: Token status confirmed NOT_REDEEMABLE after evaluation.');

    // Verify activation status boundary
    assert.ok(!lockRecord.activation_execution_status || lockRecord.activation_execution_status !== 'ACTIVE', 'Activation must not be ACTIVE');
    console.log('  PASS: Activation execution status is not ACTIVE.');

    console.log('\nSmoke 165C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 165C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
