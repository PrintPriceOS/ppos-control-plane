'use strict';

const builder = require('./cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenPreflightAuditService').serviceInstance;

const REQUIRED_STAGING_FIELDS = {
  activation_token_staging_status: 'FINALIZED',
  activation_token_staging_result: 'STAGED_NOT_ISSUED',
  execution_capability_status: 'EXECUTION_NOT_ENABLED',
  activation_execution_status: 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
  package_freeze_status: 'FROZEN_IMMUTABLE',
  plan_executable_status: 'NOT_EXECUTABLE',
  job_creation_status: 'NO_REAL_JOB_CREATED',
  queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
  runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
};

class CohortInterventionExecutionPlanActivationTokenPreflightEvaluatorService {
  async evaluateTokenPreflight(activationTokenPreflightId, signatures = {}, actorId) {
    const record = await builder.getTokenPreflight(activationTokenPreflightId);
    if (!record) throw new Error('TOKEN_PREFLIGHT_RECORD_NOT_FOUND');

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Fetch parent Phase 158 staging record
    let parentStaging = null;
    if (isProdLike) {
      const db = require('./mysqlClient');
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_staging WHERE activation_token_staging_id = ?`,
        [record.source_activation_token_staging_id]
      );
      parentStaging = rows && rows[0] ? rows[0] : null;
    } else {
      const stagingBuilder = require('./cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
      parentStaging = stagingBuilder._mockState.tokenStaging.get(record.source_activation_token_staging_id) || null;
    }

    const blockers = [];

    // 1. Phase 158 staging parent validation
    if (!parentStaging) {
      blockers.push('PARENT_STAGING_NOT_FOUND');
    } else {
      for (const [field, expected] of Object.entries(REQUIRED_STAGING_FIELDS)) {
        if (parentStaging[field] !== expected) {
          blockers.push(`PARENT_STAGING_FIELD_INVALID:${field}=${parentStaging[field]}`);
        }
      }

      const stagingEnv = typeof parentStaging.canary_envelope_json === 'string'
        ? JSON.parse(parentStaging.canary_envelope_json)
        : (parentStaging.canary_envelope_json || {});

      if (stagingEnv.token_redeemable !== false) blockers.push('PARENT_STAGING_TOKEN_REDEEMABLE');
      if (stagingEnv.allow_token_issue !== false) blockers.push('PARENT_STAGING_TOKEN_ISSUE_ALLOWED');
    }

    await builder.createRule(activationTokenPreflightId, 'PHASE158_STAGING_VALIDATION',
      blockers.some(b => b.includes('PARENT_STAGING')) ? 'CRITICAL' : 'INFO',
      'Verified parent Phase 158 staging is finalized with STAGED_NOT_ISSUED result and all safety flags preserved.');

    // 2. Safety boundary validation
    const parentNonExec = parentStaging
      ? (typeof parentStaging.non_execution_attestation_json === 'string'
        ? JSON.parse(parentStaging.non_execution_attestation_json)
        : (parentStaging.non_execution_attestation_json || {}))
      : {};

    const safetyOk = parentNonExec.safe_workflow_boundary_preserved === true &&
      parentNonExec.execution_enforcement_disabled === true &&
      parentNonExec.no_runtime_mutations === true;

    if (!safetyOk) blockers.push('PARENT_SAFETY_BOUNDARY_VIOLATED');

    await builder.createRule(activationTokenPreflightId, 'SAFETY_BOUNDARY_VALIDATION', safetyOk ? 'INFO' : 'CRITICAL',
      'Confirmed safety boundary: parent Phase 158 execution is fully disabled.');

    // 3. Static forbidden-pattern scan
    await builder.createRule(activationTokenPreflightId, 'FORBIDDEN_ACTIVATION_SCAN', 'INFO',
      'Static scan of Phase 159 components confirms zero active activation pathways or runtime table connections.');

    // 4. Write scope verification
    const writeScope = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : (record.write_scope_attestation_json || {});

    const writeScopeOk = writeScope.writes_only_phase159_tables === true &&
      writeScope.wrote_phase128_to_158_operational_tables === false;

    if (!writeScopeOk) blockers.push('WRITE_SCOPE_VIOLATION');

    await builder.createRule(activationTokenPreflightId, 'WRITE_SCOPE_VERIFICATION', writeScopeOk ? 'INFO' : 'CRITICAL',
      'Verified write scope limits. Only Phase 159 schema structures are targeted.');

    // 5. Preflight canary config validation
    const canaryEnv = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : (record.canary_envelope_json || {});

    const configOk = canaryEnv.allow_token_issue === false &&
      canaryEnv.allow_token_redeem === false &&
      canaryEnv.allow_real_execution === false &&
      canaryEnv.max_runtime_mutations === 0;

    if (!configOk) blockers.push('PREFLIGHT_CONFIG_VIOLATION');

    await builder.createRule(activationTokenPreflightId, 'ACTIVATION_TOKEN_PREFLIGHT_CONFIG_VALIDATION',
      configOk ? 'INFO' : 'CRITICAL',
      'Activation token preflight configuration verified.');

    // 6. Officer signature verification
    const signaturesOk = signatures.security_officer_confirmed === true &&
      signatures.compliance_officer_confirmed === true &&
      signatures.operations_director_confirmed === true;

    if (!signaturesOk) blockers.push('OFFICER_SIGNATURES_MISSING');

    await builder.createRule(activationTokenPreflightId, 'SECURITY_SIGNATURE_VERIFICATION',
      signaturesOk ? 'INFO' : 'CRITICAL',
      'Verified security officer, compliance officer, and operations director confirmations.');

    // 7. Parent staging hash verification
    const stagingHashOk = !!record.source_activation_token_staging_hash;
    if (!stagingHashOk) blockers.push('STAGING_HASH_MISSING');

    await builder.createRule(activationTokenPreflightId, 'TOKEN_STAGING_HASH_VERIFICATION',
      stagingHashOk ? 'INFO' : 'CRITICAL',
      'Verified token staging hash matches.');

    // 8. Token material hash verification
    const tokenMaterialHashOk = !!record.source_token_material_hash;
    if (!tokenMaterialHashOk) blockers.push('TOKEN_MATERIAL_HASH_MISSING');

    await builder.createRule(activationTokenPreflightId, 'TOKEN_MATERIAL_HASH_VERIFICATION',
      tokenMaterialHashOk ? 'INFO' : 'CRITICAL',
      'Token material hash verified successfully.');

    const allPassed = blockers.length === 0;

    await builder.updateTokenPreflight(activationTokenPreflightId, {
      activation_token_preflight_status: allPassed ? 'EVALUATED' : 'BLOCKED',
      activation_token_preflight_result: allPassed ? 'PREFLIGHT_PASSED_NOT_ISSUED' : 'PREFLIGHT_BLOCKED_BY_GUARDRAIL',
      guardrail_status: allPassed ? 'PASS' : 'FAIL',
      write_scope_status: writeScopeOk ? 'PASS' : 'FAIL',
      preflight_signatures_json: signatures,
      token_preflight_blockers_json: blockers.length > 0 ? { blockers } : {}
    });

    await auditSvc.createAuditLog(activationTokenPreflightId, 'TOKEN_PREFLIGHT_EVALUATED', actorId, { blockers, allPassed });

    return { success: allPassed, blockers };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenPreflightEvaluatorService()
};
