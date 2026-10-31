'use strict';

const builder = require('./cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
const tokenFinalApvBuilderSvc = require('./cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanActivationTokenStagingGuardrailService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenStagingAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenStagingEvaluatorService {
  async evaluateTokenStaging(activationTokenStagingId, signatures, actorId) {
    const record = await builder.getTokenStaging(activationTokenStagingId);
    if (!record) throw new Error('TOKEN_STAGING_RECORD_NOT_FOUND');

    if (record.activation_token_staging_status === 'FINALIZED' || record.activation_token_staging_status === 'STAGED') {
      throw new Error('TOKEN_STAGING_IMMUTABLE');
    }

    // Reset rules table for this staging run
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      const db = require('./mysqlClient');
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging_rules WHERE activation_token_staging_id = ?', [activationTokenStagingId]);
    } else {
      builder._mockState.rules.set(activationTokenStagingId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Parent Phase 157 Final Approval validation
    const parentApv = await tokenFinalApvBuilderSvc.getTokenFinalApv(record.source_activation_token_final_apv_id);
    if (!parentApv) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'PHASE157_FINAL_APPROVAL_VALIDATION', 'CRITICAL', 'Parent Phase 157 final approval record missing.'));
    } else if (parentApv.activation_token_final_apv_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'PHASE157_FINAL_APPROVAL_VALIDATION', 'CRITICAL', 'Parent Phase 157 final approval is not finalized.'));
    } else if (parentApv.activation_token_final_apv_result !== 'FINAL_APPROVED_NOT_ISSUED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'PHASE157_FINAL_APPROVAL_VALIDATION', 'CRITICAL', `Parent Phase 157 final approval result is invalid: ${parentApv.activation_token_final_apv_result}`));
    } else {
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'PHASE157_FINAL_APPROVAL_VALIDATION', 'INFO', 'Verified parent Phase 157 final approval is finalized and passed.'));
    }

    // 2. Safety markers check on parent Phase 157
    if (parentApv) {
      const parentConfig = typeof parentApv.canary_envelope_json === 'string'
        ? JSON.parse(parentApv.canary_envelope_json)
        : parentApv.canary_envelope_json;

      if (parentApv.execution_capability_status !== 'EXECUTION_NOT_ENABLED' ||
          parentApv.activation_execution_status !== 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED' ||
          parentApv.package_freeze_status !== 'FROZEN_IMMUTABLE' ||
          parentApv.plan_executable_status !== 'NOT_EXECUTABLE' ||
          parentApv.job_creation_status !== 'NO_REAL_JOB_CREATED' ||
          parentApv.queue_dispatch_status !== 'NO_QUEUE_DISPATCHED' ||
          parentApv.runtime_mutation_status !== 'ZERO_RUNTIME_MUTATION_CONFIRMED' ||
          (parentConfig && (parentConfig.token_status !== 'PREPARED_NOT_ISSUED' || parentConfig.token_issuance_status !== 'FINAL_APPROVED_NOT_ISSUED' || parentConfig.token_redeemable === true))) {
        overallBlocked = true;
        rulesRun.push(await builder.createRule(activationTokenStagingId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 157 safety boundaries are violated.'));
      } else {
        rulesRun.push(await builder.createRule(activationTokenStagingId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent Phase 157 execution is fully disabled.'));
      }
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(activationTokenStagingId);
    for (const s of staticScan) {
      const added = await builder.createRule(activationTokenStagingId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(activationTokenStagingId);
    for (const w of writeScope) {
      const added = await builder.createRule(activationTokenStagingId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Activation token staging configuration checks
    const stagingConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!stagingConfig || stagingConfig.token_status !== 'STAGED_NOT_ISSUED' || stagingConfig.token_issuance_status !== 'STAGED_NOT_ISSUED' || stagingConfig.token_redeemable === true || stagingConfig.allow_token_issue === true) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'ACTIVATION_TOKEN_STAGING_CONFIG_VALIDATION', 'CRITICAL', 'Activation token staging configuration is invalid or allows execution.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'ACTIVATION_TOKEN_STAGING_CONFIG_VALIDATION', 'INFO', 'Activation token staging configuration verified.'));
    }

    // 6. Signatures checks
    const { security_officer_confirmed, compliance_officer_confirmed, operations_director_confirmed } = signatures || {};
    if (!security_officer_confirmed || !compliance_officer_confirmed || !operations_director_confirmed) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'SECURITY_SIGNATURE_VERIFICATION', 'CRITICAL', 'Missing required confirmations from security, compliance, or operations officers.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'SECURITY_SIGNATURE_VERIFICATION', 'INFO', 'Verified security officer, compliance officer, and operations director confirmations.'));
    }

    // 7. Verify token final approval hash & token material hash matching
    if (parentApv && parentApv.activation_token_final_apv_hash !== record.source_activation_token_final_apv_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'TOKEN_FINAL_APPROVAL_HASH_VERIFICATION', 'CRITICAL', 'Token final approval hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'TOKEN_FINAL_APPROVAL_HASH_VERIFICATION', 'INFO', 'Verified token final approval hash matches.'));
    }

    if (parentApv && parentApv.source_token_material_hash !== record.source_token_material_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'TOKEN_MATERIAL_HASH_VERIFICATION', 'CRITICAL', 'Token material hash mismatch.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenStagingId, 'TOKEN_MATERIAL_HASH_VERIFICATION', 'INFO', 'Token material hash verified successfully.'));
    }

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overallBlocked ? 'STAGING_BLOCKED_BY_GUARDRAIL' : 'STAGED_NOT_ISSUED';

    await builder.updateTokenStaging(activationTokenStagingId, {
      activation_token_staging_status: status,
      activation_token_staging_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      staging_signatures_json: signatures || {},
      token_staging_blockers_json: { failed_token_staging_rules: overallBlocked }
    });

    await auditSvc.createAuditLog(activationTokenStagingId, 'TOKEN_STAGING_EVALUATED', actorId, { status, result });
    return { success: !overallBlocked, status, result, rules: rulesRun };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenStagingEvaluatorService()
};
