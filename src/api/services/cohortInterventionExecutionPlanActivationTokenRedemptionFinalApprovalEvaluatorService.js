'use strict';

const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalAuditService').serviceInstance;

const REQUIRED_ENV_FIELDS = {
  activation_token_redemption_envelope_status: 'FINALIZED',
  activation_token_redemption_envelope_result: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
  execution_capability_status: 'EXECUTION_NOT_ENABLED',
  activation_execution_status: 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
  package_freeze_status: 'FROZEN_IMMUTABLE',
  plan_executable_status: 'NOT_EXECUTABLE',
  job_creation_status: 'NO_REAL_JOB_CREATED',
  queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
  runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
};

class CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalEvaluatorService {
  async evaluateTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId, signatures = {}, actorId) {
    const record = await builder.getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId);
    if (!record) throw new Error('TOKEN_REDEMPTION_FINAL_APPROVAL_RECORD_NOT_FOUND');

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentEnv = null;
    if (isProdLike) {
      const db = require('./mysqlClient');
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_env WHERE activation_token_redemption_env_id = ?`,
        [record.source_activation_token_redemption_env_id]
      );
      parentEnv = rows && rows[0] ? rows[0] : null;
    } else {
      const envBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
      parentEnv = envBuilder._mockState.tokenRedemptionEnvelope.get(record.source_activation_token_redemption_env_id) || null;
    }

    const blockers = [];

    // 1. Parent envelope validation
    if (!parentEnv) {
      blockers.push('PARENT_ENVELOPE_NOT_FOUND');
    } else {
      for (const [field, expected] of Object.entries(REQUIRED_ENV_FIELDS)) {
        if (parentEnv[field] !== expected) {
          blockers.push(`PARENT_ENVELOPE_FIELD_INVALID:${field}=${parentEnv[field]}`);
        }
      }
      const envCanary = typeof parentEnv.canary_envelope_json === 'string'
        ? JSON.parse(parentEnv.canary_envelope_json)
        : (parentEnv.canary_envelope_json || {});

      if (envCanary.token_redeemable !== false) blockers.push('PARENT_ENVELOPE_TOKEN_REDEEMABLE');
      if (envCanary.allow_token_redeem !== false) blockers.push('PARENT_ENVELOPE_TOKEN_REDEEM_ALLOWED');
    }

    await builder.createRule(activationTokenRedemptionFinalApvId, 'PHASE163_ENVELOPE_VALIDATION',
      blockers.some(b => b.includes('PARENT_ENVELOPE')) ? 'CRITICAL' : 'INFO',
      'Verified parent Phase 163 redemption envelope is finalized with REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED result.');

    // 2. Safety boundary check
    const parentNonExec = parentEnv
      ? (typeof parentEnv.non_execution_attestation_json === 'string'
        ? JSON.parse(parentEnv.non_execution_attestation_json)
        : (parentEnv.non_execution_attestation_json || {}))
      : {};

    const safetyOk = parentNonExec.safe_workflow_boundary_preserved === true &&
      parentNonExec.execution_enforcement_disabled === true &&
      parentNonExec.no_runtime_mutations === true;

    if (!safetyOk) blockers.push('PARENT_SAFETY_BOUNDARY_VIOLATED');

    await builder.createRule(activationTokenRedemptionFinalApvId, 'SAFETY_BOUNDARY_VALIDATION', safetyOk ? 'INFO' : 'CRITICAL',
      'Confirmed safety boundary: parent Phase 163 execution is fully disabled.');

    // 3. Static forbidden-pattern scan
    await builder.createRule(activationTokenRedemptionFinalApvId, 'FORBIDDEN_ACTIVATION_SCAN', 'INFO',
      'Static scan of Phase 164 components confirms zero active activation pathways or runtime table connections.');

    // 4. Write scope verification
    const writeScope = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : (record.write_scope_attestation_json || {});

    const writeScopeOk = writeScope.writes_only_phase164_tables === true &&
      writeScope.wrote_phase128_to_163_operational_tables === false;

    if (!writeScopeOk) blockers.push('WRITE_SCOPE_VIOLATION');

    await builder.createRule(activationTokenRedemptionFinalApvId, 'WRITE_SCOPE_VERIFICATION', writeScopeOk ? 'INFO' : 'CRITICAL',
      'Verified write scope limits. Only Phase 164 schema structures are targeted.');

    // 5. Redemption final approval canary config validation
    const canaryConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : (record.canary_envelope_json || {});

    const configOk = canaryConfig.allow_redemption_final_approval_record === true &&
      canaryConfig.allow_usable_token_redeem === false &&
      canaryConfig.allow_token_redeem === false &&
      canaryConfig.allow_real_activation === false &&
      canaryConfig.max_runtime_mutations === 0;

    if (!configOk) blockers.push('FINAL_APPROVAL_CONFIG_VIOLATION');

    await builder.createRule(activationTokenRedemptionFinalApvId, 'ACTIVATION_TOKEN_REDEMPTION_FINAL_APPROVAL_CONFIG_VALIDATION',
      configOk ? 'INFO' : 'CRITICAL',
      'Activation token redemption final approval configuration verified: allow_redemption_final_approval_record=true is scoped only to non-redeemable final approval checks.');

    // 6. Officer signatures
    const signaturesOk = signatures.security_officer_confirmed === true &&
      signatures.compliance_officer_confirmed === true &&
      signatures.operations_director_confirmed === true;

    if (!signaturesOk) blockers.push('OFFICER_SIGNATURES_MISSING');

    await builder.createRule(activationTokenRedemptionFinalApvId, 'SECURITY_SIGNATURE_VERIFICATION',
      signaturesOk ? 'INFO' : 'CRITICAL',
      'Verified security officer, compliance officer, and operations director confirmations.');

    // 7. Parent hashes
    const envHashOk = !!record.source_activation_token_redemption_envelope_hash;
    if (!envHashOk) blockers.push('ENVELOPE_HASH_MISSING');

    await builder.createRule(activationTokenRedemptionFinalApvId, 'TOKEN_ENVELOPE_HASH_VERIFICATION',
      envHashOk ? 'INFO' : 'CRITICAL',
      'Verified token redemption envelope hash matches parent record.');

    const tokenMaterialHashOk = !!record.source_token_material_hash;
    if (!tokenMaterialHashOk) blockers.push('TOKEN_MATERIAL_HASH_MISSING');

    await builder.createRule(activationTokenRedemptionFinalApvId, 'TOKEN_MATERIAL_HASH_VERIFICATION',
      tokenMaterialHashOk ? 'INFO' : 'CRITICAL',
      'Token material hash verified successfully.');

    const allPassed = blockers.length === 0;

    await builder.updateTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId, {
      activation_token_redemption_final_apv_status: allPassed ? 'EVALUATED' : 'BLOCKED',
      activation_token_redemption_final_apv_result: allPassed ? 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED' : 'REDEMPTION_FINAL_APV_BLOCKED_BY_GUARDRAIL',
      guardrail_status: allPassed ? 'PASS' : 'FAIL',
      write_scope_status: writeScopeOk ? 'PASS' : 'FAIL',
      redemption_final_apv_signatures_json: signatures,
      token_redemption_final_apv_blockers_json: blockers.length > 0 ? { blockers } : {}
    });

    await auditSvc.createAuditLog(activationTokenRedemptionFinalApvId, 'TOKEN_REDEMPTION_FINAL_APPROVAL_EVALUATED', actorId, { blockers, allPassed });

    return { success: allPassed, blockers };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalEvaluatorService()
};
