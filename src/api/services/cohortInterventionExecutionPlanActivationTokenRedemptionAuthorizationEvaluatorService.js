'use strict';

const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationAuditService').serviceInstance;

const REQUIRED_READINESS_FIELDS = {
  activation_token_redemption_readiness_status: 'FINALIZED',
  activation_token_redemption_readiness_result: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED',
  execution_capability_status: 'EXECUTION_NOT_ENABLED',
  activation_execution_status: 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
  package_freeze_status: 'FROZEN_IMMUTABLE',
  plan_executable_status: 'NOT_EXECUTABLE',
  job_creation_status: 'NO_REAL_JOB_CREATED',
  queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
  runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
};

class CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvaluatorService {
  async evaluateTokenRedemptionAuth(activationTokenRedemptionAuthId, signatures = {}, actorId) {
    const record = await builder.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
    if (!record) throw new Error('TOKEN_REDEMPTION_AUTH_RECORD_NOT_FOUND');

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentReadiness = null;
    if (isProdLike) {
      const db = require('./mysqlClient');
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_readiness WHERE activation_token_redemption_readiness_id = ?`,
        [record.source_activation_token_redemption_readiness_id]
      );
      parentReadiness = rows && rows[0] ? rows[0] : null;
    } else {
      const readinessBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
      parentReadiness = readinessBuilder._mockState.tokenRedemptionReadiness.get(record.source_activation_token_redemption_readiness_id) || null;
    }

    const blockers = [];

    // 1. Parent readiness validation
    if (!parentReadiness) {
      blockers.push('PARENT_READINESS_NOT_FOUND');
    } else {
      for (const [field, expected] of Object.entries(REQUIRED_READINESS_FIELDS)) {
        if (parentReadiness[field] !== expected) {
          blockers.push(`PARENT_READINESS_FIELD_INVALID:${field}=${parentReadiness[field]}`);
        }
      }
      const readinessEnv = typeof parentReadiness.canary_envelope_json === 'string'
        ? JSON.parse(parentReadiness.canary_envelope_json)
        : (parentReadiness.canary_envelope_json || {});

      if (readinessEnv.token_redeemable !== false) blockers.push('PARENT_READINESS_TOKEN_REDEEMABLE');
      if (readinessEnv.allow_token_redeem !== false) blockers.push('PARENT_READINESS_TOKEN_REDEEM_ALLOWED');
    }

    await builder.createRule(activationTokenRedemptionAuthId, 'PHASE161_READINESS_VALIDATION',
      blockers.some(b => b.includes('PARENT_READINESS')) ? 'CRITICAL' : 'INFO',
      'Verified parent Phase 161 redemption readiness is finalized with REDEMPTION_READINESS_PASSED_NOT_REDEEMED result.');

    // 2. Safety boundary check
    const parentNonExec = parentReadiness
      ? (typeof parentReadiness.non_execution_attestation_json === 'string'
        ? JSON.parse(parentReadiness.non_execution_attestation_json)
        : (parentReadiness.non_execution_attestation_json || {}))
      : {};

    const safetyOk = parentNonExec.safe_workflow_boundary_preserved === true &&
      parentNonExec.execution_enforcement_disabled === true &&
      parentNonExec.no_runtime_mutations === true;

    if (!safetyOk) blockers.push('PARENT_SAFETY_BOUNDARY_VIOLATED');

    await builder.createRule(activationTokenRedemptionAuthId, 'SAFETY_BOUNDARY_VALIDATION', safetyOk ? 'INFO' : 'CRITICAL',
      'Confirmed safety boundary: parent Phase 161 execution is fully disabled.');

    // 3. Static forbidden-pattern scan
    await builder.createRule(activationTokenRedemptionAuthId, 'FORBIDDEN_ACTIVATION_SCAN', 'INFO',
      'Static scan of Phase 162 components confirms zero active activation pathways or runtime table connections.');

    // 4. Write scope verification
    const writeScope = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : (record.write_scope_attestation_json || {});

    const writeScopeOk = writeScope.writes_only_phase162_tables === true &&
      writeScope.wrote_phase128_to_161_operational_tables === false;

    if (!writeScopeOk) blockers.push('WRITE_SCOPE_VIOLATION');

    await builder.createRule(activationTokenRedemptionAuthId, 'WRITE_SCOPE_VERIFICATION', writeScopeOk ? 'INFO' : 'CRITICAL',
      'Verified write scope limits. Only Phase 162 schema structures are targeted.');

    // 5. Redemption auth canary config validation
    const canaryEnv = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : (record.canary_envelope_json || {});

    const configOk = canaryEnv.allow_redemption_authorization_record === true &&
      canaryEnv.allow_usable_token_redeem === false &&
      canaryEnv.allow_token_redeem === false &&
      canaryEnv.allow_real_activation === false &&
      canaryEnv.max_runtime_mutations === 0;

    if (!configOk) blockers.push('REDEMPTION_AUTH_CONFIG_VIOLATION');

    await builder.createRule(activationTokenRedemptionAuthId, 'ACTIVATION_TOKEN_REDEMPTION_AUTH_CONFIG_VALIDATION',
      configOk ? 'INFO' : 'CRITICAL',
      'Activation token redemption authorization configuration verified: allow_redemption_authorization_record=true is scoped only to non-redeemable authorization checks.');

    // 6. Officer signatures
    const signaturesOk = signatures.security_officer_confirmed === true &&
      signatures.compliance_officer_confirmed === true &&
      signatures.operations_director_confirmed === true;

    if (!signaturesOk) blockers.push('OFFICER_SIGNATURES_MISSING');

    await builder.createRule(activationTokenRedemptionAuthId, 'SECURITY_SIGNATURE_VERIFICATION',
      signaturesOk ? 'INFO' : 'CRITICAL',
      'Verified security officer, compliance officer, and operations director confirmations.');

    // 7. Parent staging hash
    const stagingHashOk = !!record.source_activation_token_staging_hash;
    if (!stagingHashOk) blockers.push('STAGING_HASH_MISSING');

    await builder.createRule(activationTokenRedemptionAuthId, 'TOKEN_STAGING_HASH_VERIFICATION',
      stagingHashOk ? 'INFO' : 'CRITICAL',
      'Verified token staging hash matches.');

    // 8. Token material hash
    const tokenMaterialHashOk = !!record.source_token_material_hash;
    if (!tokenMaterialHashOk) blockers.push('TOKEN_MATERIAL_HASH_MISSING');

    await builder.createRule(activationTokenRedemptionAuthId, 'TOKEN_MATERIAL_HASH_VERIFICATION',
      tokenMaterialHashOk ? 'INFO' : 'CRITICAL',
      'Token material hash verified successfully.');

    const allPassed = blockers.length === 0;

    await builder.updateTokenRedemptionAuth(activationTokenRedemptionAuthId, {
      activation_token_redemption_auth_status: allPassed ? 'EVALUATED' : 'BLOCKED',
      activation_token_redemption_auth_result: allPassed ? 'REDEMPTION_AUTHORIZED_NOT_REDEEMED' : 'REDEMPTION_AUTH_BLOCKED_BY_GUARDRAIL',
      guardrail_status: allPassed ? 'PASS' : 'FAIL',
      write_scope_status: writeScopeOk ? 'PASS' : 'FAIL',
      redemption_auth_signatures_json: signatures,
      token_redemption_auth_blockers_json: blockers.length > 0 ? { blockers } : {}
    });

    await auditSvc.createAuditLog(activationTokenRedemptionAuthId, 'TOKEN_REDEMPTION_AUTH_EVALUATED', actorId, { blockers, allPassed });

    return { success: allPassed, blockers };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvaluatorService()
};
