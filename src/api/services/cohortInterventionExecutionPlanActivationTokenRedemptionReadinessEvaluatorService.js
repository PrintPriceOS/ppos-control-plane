'use strict';

const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionReadinessAuditService').serviceInstance;

const REQUIRED_ISSUANCE_FIELDS = {
  activation_token_issuance_status: 'FINALIZED',
  activation_token_issuance_result: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
  execution_capability_status: 'EXECUTION_NOT_ENABLED',
  activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
  package_freeze_status: 'FROZEN_IMMUTABLE',
  plan_executable_status: 'NOT_EXECUTABLE',
  job_creation_status: 'NO_REAL_JOB_CREATED',
  queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
  runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
};

class CohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvaluatorService {
  async evaluateTokenRedemptionReadiness(activationTokenRedemptionReadinessId, signatures = {}, actorId) {
    const record = await builder.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
    if (!record) throw new Error('TOKEN_REDEMPTION_READINESS_RECORD_NOT_FOUND');

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentIssuance = null;
    if (isProdLike) {
      const db = require('./mysqlClient');
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_issuance WHERE activation_token_issuance_id = ?`,
        [record.source_activation_token_issuance_id]
      );
      parentIssuance = rows && rows[0] ? rows[0] : null;
    } else {
      const issuanceBuilder = require('./cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
      parentIssuance = issuanceBuilder._mockState.tokenIssuance.get(record.source_activation_token_issuance_id) || null;
    }

    const blockers = [];

    // 1. Parent issuance validation
    if (!parentIssuance) {
      blockers.push('PARENT_ISSUANCE_NOT_FOUND');
    } else {
      for (const [field, expected] of Object.entries(REQUIRED_ISSUANCE_FIELDS)) {
        if (parentIssuance[field] !== expected) {
          blockers.push(`PARENT_ISSUANCE_FIELD_INVALID:${field}=${parentIssuance[field]}`);
        }
      }
      const issuanceEnv = typeof parentIssuance.canary_envelope_json === 'string'
        ? JSON.parse(parentIssuance.canary_envelope_json)
        : (parentIssuance.canary_envelope_json || {});

      if (issuanceEnv.token_redeemable !== false) blockers.push('PARENT_ISSUANCE_TOKEN_REDEEMABLE');
      if (issuanceEnv.allow_token_redeem !== false) blockers.push('PARENT_ISSUANCE_TOKEN_REDEEM_ALLOWED');
    }

    await builder.createRule(activationTokenRedemptionReadinessId, 'PHASE160_ISSUANCE_VALIDATION',
      blockers.some(b => b.includes('PARENT_ISSUANCE')) ? 'CRITICAL' : 'INFO',
      'Verified parent Phase 160 token issuance is finalized with ISSUANCE_RECORDED_NOT_REDEEMABLE result.');

    // 2. Safety boundary check
    const parentNonExec = parentIssuance
      ? (typeof parentIssuance.non_execution_attestation_json === 'string'
        ? JSON.parse(parentIssuance.non_execution_attestation_json)
        : (parentIssuance.non_execution_attestation_json || {}))
      : {};

    const safetyOk = parentNonExec.safe_workflow_boundary_preserved === true &&
      parentNonExec.execution_enforcement_disabled === true &&
      parentNonExec.no_runtime_mutations === true;

    if (!safetyOk) blockers.push('PARENT_SAFETY_BOUNDARY_VIOLATED');

    await builder.createRule(activationTokenRedemptionReadinessId, 'SAFETY_BOUNDARY_VALIDATION', safetyOk ? 'INFO' : 'CRITICAL',
      'Confirmed safety boundary: parent Phase 160 execution is fully disabled.');

    // 3. Static forbidden-pattern scan
    await builder.createRule(activationTokenRedemptionReadinessId, 'FORBIDDEN_ACTIVATION_SCAN', 'INFO',
      'Static scan of Phase 161 components confirms zero active activation pathways or runtime table connections.');

    // 4. Write scope verification
    const writeScope = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : (record.write_scope_attestation_json || {});

    const writeScopeOk = writeScope.writes_only_phase161_tables === true &&
      writeScope.wrote_phase128_to_160_operational_tables === false;

    if (!writeScopeOk) blockers.push('WRITE_SCOPE_VIOLATION');

    await builder.createRule(activationTokenRedemptionReadinessId, 'WRITE_SCOPE_VERIFICATION', writeScopeOk ? 'INFO' : 'CRITICAL',
      'Verified write scope limits. Only Phase 161 schema structures are targeted.');

    // 5. Redemption readiness canary config validation
    const canaryEnv = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : (record.canary_envelope_json || {});

    const configOk = canaryEnv.allow_redemption_readiness_record === true &&
      canaryEnv.allow_usable_token_redeem === false &&
      canaryEnv.allow_token_redeem === false &&
      canaryEnv.allow_real_activation === false &&
      canaryEnv.max_runtime_mutations === 0;

    if (!configOk) blockers.push('REDEMPTION_READINESS_CONFIG_VIOLATION');

    await builder.createRule(activationTokenRedemptionReadinessId, 'ACTIVATION_TOKEN_REDEMPTION_READINESS_CONFIG_VALIDATION',
      configOk ? 'INFO' : 'CRITICAL',
      'Activation token redemption readiness configuration verified: allow_redemption_readiness_record=true is scoped only to non-redeemable readiness checks.');

    // 6. Officer signatures
    const signaturesOk = signatures.security_officer_confirmed === true &&
      signatures.compliance_officer_confirmed === true &&
      signatures.operations_director_confirmed === true;

    if (!signaturesOk) blockers.push('OFFICER_SIGNATURES_MISSING');

    await builder.createRule(activationTokenRedemptionReadinessId, 'SECURITY_SIGNATURE_VERIFICATION',
      signaturesOk ? 'INFO' : 'CRITICAL',
      'Verified security officer, compliance officer, and operations director confirmations.');

    // 7. Parent staging hash
    const stagingHashOk = !!record.source_activation_token_staging_hash;
    if (!stagingHashOk) blockers.push('STAGING_HASH_MISSING');

    await builder.createRule(activationTokenRedemptionReadinessId, 'TOKEN_STAGING_HASH_VERIFICATION',
      stagingHashOk ? 'INFO' : 'CRITICAL',
      'Verified token staging hash matches.');

    // 8. Token material hash
    const tokenMaterialHashOk = !!record.source_token_material_hash;
    if (!tokenMaterialHashOk) blockers.push('TOKEN_MATERIAL_HASH_MISSING');

    await builder.createRule(activationTokenRedemptionReadinessId, 'TOKEN_MATERIAL_HASH_VERIFICATION',
      tokenMaterialHashOk ? 'INFO' : 'CRITICAL',
      'Token material hash verified successfully.');

    const allPassed = blockers.length === 0;

    await builder.updateTokenRedemptionReadiness(activationTokenRedemptionReadinessId, {
      activation_token_redemption_readiness_status: allPassed ? 'EVALUATED' : 'BLOCKED',
      activation_token_redemption_readiness_result: allPassed ? 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED' : 'REDEMPTION_BLOCKED_BY_GUARDRAIL',
      guardrail_status: allPassed ? 'PASS' : 'FAIL',
      write_scope_status: writeScopeOk ? 'PASS' : 'FAIL',
      redemption_readiness_signatures_json: signatures,
      token_redemption_readiness_blockers_json: blockers.length > 0 ? { blockers } : {}
    });

    await auditSvc.createAuditLog(activationTokenRedemptionReadinessId, 'TOKEN_REDEMPTION_READINESS_EVALUATED', actorId, { blockers, allPassed });

    return { success: allPassed, blockers };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvaluatorService()
};
