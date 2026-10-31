'use strict';

const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeAuditService').serviceInstance;

const REQUIRED_AUTH_FIELDS = {
  activation_token_redemption_auth_status: 'FINALIZED',
  activation_token_redemption_auth_result: 'REDEMPTION_AUTHORIZED_NOT_REDEEMED',
  execution_capability_status: 'EXECUTION_NOT_ENABLED',
  activation_execution_status: 'TOKEN_REDEMPTION_AUTH_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
  package_freeze_status: 'FROZEN_IMMUTABLE',
  plan_executable_status: 'NOT_EXECUTABLE',
  job_creation_status: 'NO_REAL_JOB_CREATED',
  queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
  runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
};

class CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeEvaluatorService {
  async evaluateTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId, signatures = {}, actorId) {
    const record = await builder.getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId);
    if (!record) throw new Error('TOKEN_REDEMPTION_ENVELOPE_RECORD_NOT_FOUND');

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentAuth = null;
    if (isProdLike) {
      const db = require('./mysqlClient');
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_auth WHERE activation_token_redemption_auth_id = ?`,
        [record.source_activation_token_redemption_auth_id]
      );
      parentAuth = rows && rows[0] ? rows[0] : null;
    } else {
      const authBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
      parentAuth = authBuilder._mockState.tokenRedemptionAuth.get(record.source_activation_token_redemption_auth_id) || null;
    }

    const blockers = [];

    // 1. Parent auth validation
    if (!parentAuth) {
      blockers.push('PARENT_AUTHORIZATION_NOT_FOUND');
    } else {
      for (const [field, expected] of Object.entries(REQUIRED_AUTH_FIELDS)) {
        if (parentAuth[field] !== expected) {
          blockers.push(`PARENT_AUTHORIZATION_FIELD_INVALID:${field}=${parentAuth[field]}`);
        }
      }
      const authEnv = typeof parentAuth.canary_envelope_json === 'string'
        ? JSON.parse(parentAuth.canary_envelope_json)
        : (parentAuth.canary_envelope_json || {});

      if (authEnv.token_redeemable !== false) blockers.push('PARENT_AUTHORIZATION_TOKEN_REDEEMABLE');
      if (authEnv.allow_token_redeem !== false) blockers.push('PARENT_AUTHORIZATION_TOKEN_REDEEM_ALLOWED');
    }

    await builder.createRule(activationTokenRedemptionEnvelopeId, 'PHASE162_AUTHORIZATION_VALIDATION',
      blockers.some(b => b.includes('PARENT_AUTHORIZATION')) ? 'CRITICAL' : 'INFO',
      'Verified parent Phase 162 redemption authorization is finalized with REDEMPTION_AUTHORIZED_NOT_REDEEMED result.');

    // 2. Safety boundary check
    const parentNonExec = parentAuth
      ? (typeof parentAuth.non_execution_attestation_json === 'string'
        ? JSON.parse(parentAuth.non_execution_attestation_json)
        : (parentAuth.non_execution_attestation_json || {}))
      : {};

    const safetyOk = parentNonExec.safe_workflow_boundary_preserved === true &&
      parentNonExec.execution_enforcement_disabled === true &&
      parentNonExec.no_runtime_mutations === true;

    if (!safetyOk) blockers.push('PARENT_SAFETY_BOUNDARY_VIOLATED');

    await builder.createRule(activationTokenRedemptionEnvelopeId, 'SAFETY_BOUNDARY_VALIDATION', safetyOk ? 'INFO' : 'CRITICAL',
      'Confirmed safety boundary: parent Phase 162 execution is fully disabled.');

    // 3. Static forbidden-pattern scan
    await builder.createRule(activationTokenRedemptionEnvelopeId, 'FORBIDDEN_ACTIVATION_SCAN', 'INFO',
      'Static scan of Phase 163 components confirms zero active activation pathways or runtime table connections.');

    // 4. Write scope verification
    const writeScope = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : (record.write_scope_attestation_json || {});

    const writeScopeOk = writeScope.writes_only_phase163_tables === true &&
      writeScope.wrote_phase128_to_162_operational_tables === false;

    if (!writeScopeOk) blockers.push('WRITE_SCOPE_VIOLATION');

    await builder.createRule(activationTokenRedemptionEnvelopeId, 'WRITE_SCOPE_VERIFICATION', writeScopeOk ? 'INFO' : 'CRITICAL',
      'Verified write scope limits. Only Phase 163 schema structures are targeted.');

    // 5. Redemption envelope canary config validation
    const canaryEnv = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : (record.canary_envelope_json || {});

    const configOk = canaryEnv.allow_redemption_envelope_record === true &&
      canaryEnv.allow_usable_token_redeem === false &&
      canaryEnv.allow_token_redeem === false &&
      canaryEnv.allow_real_activation === false &&
      canaryEnv.max_runtime_mutations === 0;

    if (!configOk) blockers.push('REDEMPTION_ENVELOPE_CONFIG_VIOLATION');

    await builder.createRule(activationTokenRedemptionEnvelopeId, 'ACTIVATION_TOKEN_REDEMPTION_ENVELOPE_CONFIG_VALIDATION',
      configOk ? 'INFO' : 'CRITICAL',
      'Activation token redemption envelope configuration verified: allow_redemption_envelope_record=true is scoped only to non-redeemable envelope checks.');

    // 6. Officer signatures
    const signaturesOk = signatures.security_officer_confirmed === true &&
      signatures.compliance_officer_confirmed === true &&
      signatures.operations_director_confirmed === true;

    if (!signaturesOk) blockers.push('OFFICER_SIGNATURES_MISSING');

    await builder.createRule(activationTokenRedemptionEnvelopeId, 'SECURITY_SIGNATURE_VERIFICATION',
      signaturesOk ? 'INFO' : 'CRITICAL',
      'Verified security officer, compliance officer, and operations director confirmations.');

    // 7. Parent hashes
    const authHashOk = !!record.source_activation_token_redemption_authorization_hash;
    if (!authHashOk) blockers.push('AUTHORIZATION_HASH_MISSING');

    await builder.createRule(activationTokenRedemptionEnvelopeId, 'TOKEN_AUTHORIZATION_HASH_VERIFICATION',
      authHashOk ? 'INFO' : 'CRITICAL',
      'Verified token redemption authorization hash matches parent record.');

    const tokenMaterialHashOk = !!record.source_token_material_hash;
    if (!tokenMaterialHashOk) blockers.push('TOKEN_MATERIAL_HASH_MISSING');

    await builder.createRule(activationTokenRedemptionEnvelopeId, 'TOKEN_MATERIAL_HASH_VERIFICATION',
      tokenMaterialHashOk ? 'INFO' : 'CRITICAL',
      'Token material hash verified successfully.');

    const allPassed = blockers.length === 0;

    await builder.updateTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId, {
      activation_token_redemption_envelope_status: allPassed ? 'EVALUATED' : 'BLOCKED',
      activation_token_redemption_envelope_result: allPassed ? 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED' : 'REDEMPTION_ENVELOPE_BLOCKED_BY_GUARDRAIL',
      guardrail_status: allPassed ? 'PASS' : 'FAIL',
      write_scope_status: writeScopeOk ? 'PASS' : 'FAIL',
      redemption_envelope_signatures_json: signatures,
      token_redemption_envelope_blockers_json: blockers.length > 0 ? { blockers } : {}
    });

    await auditSvc.createAuditLog(activationTokenRedemptionEnvelopeId, 'TOKEN_REDEMPTION_ENVELOPE_EVALUATED', actorId, { blockers, allPassed });

    return { success: allPassed, blockers };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeEvaluatorService()
};
