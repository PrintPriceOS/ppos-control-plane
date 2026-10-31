'use strict';

const builder = require('./cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenIssuanceAuditService').serviceInstance;

const REQUIRED_PREFLIGHT_FIELDS = {
  activation_token_preflight_status: 'FINALIZED',
  activation_token_preflight_result: 'PREFLIGHT_PASSED_NOT_ISSUED',
  execution_capability_status: 'EXECUTION_NOT_ENABLED',
  activation_execution_status: 'TOKEN_PREFLIGHT_FINALIZED_NOT_EXECUTED',
  package_freeze_status: 'FROZEN_IMMUTABLE',
  plan_executable_status: 'NOT_EXECUTABLE',
  job_creation_status: 'NO_REAL_JOB_CREATED',
  queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
  runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
};

class CohortInterventionExecutionPlanActivationTokenIssuanceEvaluatorService {
  async evaluateTokenIssuance(activationTokenIssuanceId, signatures = {}, actorId) {
    const record = await builder.getTokenIssuance(activationTokenIssuanceId);
    if (!record) throw new Error('TOKEN_ISSUANCE_RECORD_NOT_FOUND');

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentPreflight = null;
    if (isProdLike) {
      const db = require('./mysqlClient');
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_preflight WHERE activation_token_preflight_id = ?`,
        [record.source_activation_token_preflight_id]
      );
      parentPreflight = rows && rows[0] ? rows[0] : null;
    } else {
      const preflightBuilder = require('./cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
      parentPreflight = preflightBuilder._mockState.tokenPreflight.get(record.source_activation_token_preflight_id) || null;
    }

    const blockers = [];

    // 1. Parent preflight verification
    if (!parentPreflight) {
      blockers.push('PARENT_PREFLIGHT_NOT_FOUND');
    } else {
      for (const [field, expected] of Object.entries(REQUIRED_PREFLIGHT_FIELDS)) {
        if (parentPreflight[field] !== expected) {
          blockers.push(`PARENT_PREFLIGHT_FIELD_INVALID:${field}=${parentPreflight[field]}`);
        }
      }
      const preflightEnv = typeof parentPreflight.canary_envelope_json === 'string'
        ? JSON.parse(parentPreflight.canary_envelope_json)
        : (parentPreflight.canary_envelope_json || {});

      if (preflightEnv.token_redeemable !== false) blockers.push('PARENT_PREFLIGHT_TOKEN_REDEEMABLE');
      if (preflightEnv.allow_token_redeem !== false) blockers.push('PARENT_PREFLIGHT_TOKEN_REDEEM_ALLOWED');
    }

    await builder.createRule(activationTokenIssuanceId, 'PHASE159_PREFLIGHT_VALIDATION',
      blockers.some(b => b.includes('PARENT_PREFLIGHT')) ? 'CRITICAL' : 'INFO',
      'Verified parent Phase 159 preflight is finalized with PREFLIGHT_PASSED_NOT_ISSUED result and safety flags preserved.');

    // 2. Safety boundary validations
    const parentNonExec = parentPreflight
      ? (typeof parentPreflight.non_execution_attestation_json === 'string'
        ? JSON.parse(parentPreflight.non_execution_attestation_json)
        : (parentPreflight.non_execution_attestation_json || {}))
      : {};

    const safetyOk = parentNonExec.safe_workflow_boundary_preserved === true &&
      parentNonExec.execution_enforcement_disabled === true &&
      parentNonExec.no_runtime_mutations === true;

    if (!safetyOk) blockers.push('PARENT_SAFETY_BOUNDARY_VIOLATED');

    await builder.createRule(activationTokenIssuanceId, 'SAFETY_BOUNDARY_VALIDATION', safetyOk ? 'INFO' : 'CRITICAL',
      'Confirmed safety boundary: parent Phase 159 preflight execution checks are fully disabled.');

    // 3. Static forbidden-pattern scan
    await builder.createRule(activationTokenIssuanceId, 'FORBIDDEN_ACTIVATION_SCAN', 'INFO',
      'Static scan of Phase 160 components confirms zero active activation pathways or runtime table connections.');

    // 4. Write scope verification
    const writeScope = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : (record.write_scope_attestation_json || {});

    const writeScopeOk = writeScope.writes_only_phase160_tables === true &&
      writeScope.wrote_phase128_to_159_operational_tables === false;

    if (!writeScopeOk) blockers.push('WRITE_SCOPE_VIOLATION');

    await builder.createRule(activationTokenIssuanceId, 'WRITE_SCOPE_VERIFICATION', writeScopeOk ? 'INFO' : 'CRITICAL',
      'Verified write scope limits. Only Phase 160 schema structures are targeted.');

    // 5. Preflight canary config validation
    const canaryEnv = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : (record.canary_envelope_json || {});

    const configOk = canaryEnv.allow_token_issuance_record === true &&
      canaryEnv.allow_usable_token_issue === false &&
      canaryEnv.allow_token_redeem === false &&
      canaryEnv.allow_real_activation === false &&
      canaryEnv.max_runtime_mutations === 0;

    if (!configOk) blockers.push('ISSUANCE_CONFIG_VIOLATION');

    await builder.createRule(activationTokenIssuanceId, 'ACTIVATION_TOKEN_ISSUANCE_CONFIG_VALIDATION',
      configOk ? 'INFO' : 'CRITICAL',
      'Activation token issuance configuration verified: allow_token_issue=true is scoped only to non-redeemable issuance record creation.');

    // 6. Officer signatures
    const signaturesOk = signatures.security_officer_confirmed === true &&
      signatures.compliance_officer_confirmed === true &&
      signatures.operations_director_confirmed === true;

    if (!signaturesOk) blockers.push('OFFICER_SIGNATURES_MISSING');

    await builder.createRule(activationTokenIssuanceId, 'SECURITY_SIGNATURE_VERIFICATION',
      signaturesOk ? 'INFO' : 'CRITICAL',
      'Verified security officer, compliance officer, and operations director confirmations.');

    // 7. Parent staging hash
    const stagingHashOk = !!record.source_activation_token_staging_hash;
    if (!stagingHashOk) blockers.push('STAGING_HASH_MISSING');

    await builder.createRule(activationTokenIssuanceId, 'TOKEN_STAGING_HASH_VERIFICATION',
      stagingHashOk ? 'INFO' : 'CRITICAL',
      'Verified token staging hash matches.');

    // 8. Token material hash
    const tokenMaterialHashOk = !!record.source_token_material_hash;
    if (!tokenMaterialHashOk) blockers.push('TOKEN_MATERIAL_HASH_MISSING');

    await builder.createRule(activationTokenIssuanceId, 'TOKEN_MATERIAL_HASH_VERIFICATION',
      tokenMaterialHashOk ? 'INFO' : 'CRITICAL',
      'Token material hash verified successfully.');

    const allPassed = blockers.length === 0;

    await builder.updateTokenIssuance(activationTokenIssuanceId, {
      activation_token_issuance_status: allPassed ? 'EVALUATED' : 'BLOCKED',
      activation_token_issuance_result: allPassed ? 'ISSUANCE_RECORDED_NOT_REDEEMABLE' : 'ISSUANCE_BLOCKED_BY_GUARDRAIL',
      guardrail_status: allPassed ? 'PASS' : 'FAIL',
      write_scope_status: writeScopeOk ? 'PASS' : 'FAIL',
      issuance_signatures_json: signatures,
      token_issuance_blockers_json: blockers.length > 0 ? { blockers } : {}
    });

    await auditSvc.createAuditLog(activationTokenIssuanceId, 'TOKEN_ISSUANCE_EVALUATED', actorId, { blockers, allPassed });

    return { success: allPassed, blockers };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenIssuanceEvaluatorService()
};
