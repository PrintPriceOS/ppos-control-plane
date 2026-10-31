'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const authEvidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationEvidencePackService').serviceInstance;
const lockBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationLockEvaluatorService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationLockEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupAuthorizationAndLock(activationAuthId, activationLockId) {
  const writeScope151 = { writes_only_phase151_tables: true, wrote_phase128_to_150_operational_tables: false };
  const writeScope152 = { writes_only_phase152_tables: true, wrote_phase128_to_151_operational_tables: false };
  const nonExecution151 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution152 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const authRecord = {
    activation_auth_id: activationAuthId,
    source_activation_readiness_id: 'rd_test_152e',
    source_plan_id: 'pln_test_152e',
    source_dispatcher_id: 'dsp_test_152e',
    source_envelope_id: 'env_test_152e',
    source_auth_id: 'ath_test_152e',
    source_readiness_id: 'rd_test_152e',
    source_approval_id: 'apv_test_152e',
    source_prep_id: 'prep_test_152e',
    source_review_id: 'rev_test_152e',
    source_simulation_id: 'sim_test_152e',
    source_execution_id: 'exec_test_152e',
    cohort_id: 'cohort_test_152e',
    tenant_id: 'tenant_test_152e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_auth_status: 'FINALIZED',
    activation_auth_result: 'AUTHORIZED_NOT_ACTIVE',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { authorization_mode: 'ACTIVATION_AUTHORIZATION_ONLY', allow_real_activation: false },
    auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    auth_rules_json: {},
    auth_blockers_json: {},
    non_execution_attestation_json: nonExecution151,
    write_scope_attestation_json: writeScope151,
    source_activation_readiness_hash: 'rd_hash_152e',
    activation_authorization_hash: 'auth_hash_152e',
    evidence_pack_hash: 'pack_hash_152e',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'AUTHORIZATION_FINALIZED_NOT_EXECUTED',
    plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED',
    queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    finalized_by: null,
    finalized_at: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  const lockRecord = {
    activation_lock_id: activationLockId,
    source_activation_auth_id: activationAuthId,
    source_activation_readiness_id: 'rd_test_152e',
    source_plan_id: 'pln_test_152e',
    source_dispatcher_id: 'dsp_test_152e',
    source_envelope_id: 'env_test_152e',
    source_auth_id: 'ath_test_152e',
    source_readiness_id: 'rd_test_152e',
    source_approval_id: 'apv_test_152e',
    source_prep_id: 'prep_test_152e',
    source_review_id: 'rev_test_152e',
    source_simulation_id: 'sim_test_152e',
    source_execution_id: 'exec_test_152e',
    cohort_id: 'cohort_test_152e',
    tenant_id: 'tenant_test_152e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_lock_status: 'DRAFT',
    activation_lock_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { lock_mode: 'PRE_EXECUTION_FREEZE_ONLY', allow_real_activation: false },
    lock_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    lock_rules_json: {},
    lock_blockers_json: { missing_lock_evaluation: true },
    non_execution_attestation_json: nonExecution152,
    write_scope_attestation_json: writeScope152,
    source_activation_authorization_hash: 'auth_hash_152e',
    activation_lock_hash: null,
    freeze_package_hash: null,
    lock_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'LOCK_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE',
    plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED',
    queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    finalized_by: null,
    finalized_at: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    authBuilder._mockState.authorization.set(activationAuthId, authRecord);
    authEvidenceSvc._mockState.evidence.set(activationAuthId, {
      evidence_pack_hash: 'pack_hash_152e',
      evidence_payload_json: { evidence_schema_version: '151.0', write_scope_attestation: writeScope151 },
      lineage_hash_chain_json: {
        phase151_activation_auth_id: activationAuthId,
        phase150_source_activation_readiness_hash: 'rd_hash_d',
        phase149_source_plan_hash: 'plan_hash_e',
        phase148_source_dispatcher_hash: 'dsp_hash_e',
        phase147_source_envelope_hash: 'env_hash_e',
        phase146_source_auth_hash: 'auth_hash_e',
        phase145_source_readiness_hash: 'rd_hash_d',
        phase144_source_approval_hash: 'apv_hash_d',
        phase143_preparation_id: 'prep_test_152e',
        phase142_review_id: 'rev_test_152e',
        phase141_source_simulation_hash: 'sim_hash_e',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    lockBuilder._mockState.lock.set(activationLockId, lockRecord);
    lockBuilder._mockState.rules.set(activationLockId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_rules WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_evidence WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock_rules WHERE activation_lock_id = ?', [activationLockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock_evidence WHERE activation_lock_id = ?', [activationLockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock WHERE activation_lock_id = ?', [activationLockId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_auth
       (activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_auth_status, activation_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_readiness_hash,
        execution_capability_status, activation_execution_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_authorization_hash, evidence_pack_hash)
       VALUES (?, 'rd_test_152e', 'pln_test_152e', 'dsp_test_152e', 'env_test_152e', 'ath_test_152e', 'rd_test_152e', 'apv_test_152e', 'prep_test_152e', 'rev_test_152e', 'sim_test_152e', 'exec_test_152e', 'cohort_test_152e', 'tenant_test_152e', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'AUTHORIZED_NOT_ACTIVE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"authorization_mode":"ACTIVATION_AUTHORIZATION_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'rd_hash_152e', 'EXECUTION_NOT_ENABLED', 'AUTHORIZATION_FINALIZED_NOT_EXECUTED', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'auth_hash_152e', 'pack_hash_152e')`,
      [activationAuthId, JSON.stringify(nonExecution151), JSON.stringify(writeScope151)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_auth_evidence
       (evidence_id, activation_auth_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '151.0', 'pack_hash_152e', ?, ?)`,
      [
        'ae_' + activationAuthId,
        activationAuthId,
        JSON.stringify({ evidence_schema_version: '151.0', write_scope_attestation: writeScope151 }),
        JSON.stringify({
          phase151_activation_auth_id: activationAuthId,
          phase150_source_activation_readiness_hash: 'rd_hash_d',
          phase149_source_plan_hash: 'plan_hash_e',
          phase148_source_dispatcher_hash: 'dsp_hash_e',
          phase147_source_envelope_hash: 'env_hash_e',
          phase146_source_auth_hash: 'auth_hash_e',
          phase145_source_readiness_hash: 'rd_hash_d',
          phase144_source_approval_hash: 'apv_hash_d',
          phase143_preparation_id: 'prep_test_152e',
          phase142_review_id: 'rev_test_152e',
          phase141_source_simulation_hash: 'sim_hash_e',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_lock
       (activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_lock_status, activation_lock_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, lock_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        lock_rules_json, lock_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_authorization_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'rd_test_152e', 'pln_test_152e', 'dsp_test_152e', 'env_test_152e', 'ath_test_152e', 'rd_test_152e', 'apv_test_152e', 'prep_test_152e', 'rev_test_152e', 'sim_test_152e', 'exec_test_152e', 'cohort_test_152e', 'tenant_test_152e', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_lock_evaluation":true}', ?, ?, 'auth_hash_152e', 'EXECUTION_NOT_ENABLED', 'LOCK_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationLockId,
        activationAuthId,
        JSON.stringify({ lock_mode: 'PRE_EXECUTION_FREEZE_ONLY', allow_real_activation: false }),
        JSON.stringify(nonExecution152),
        JSON.stringify(writeScope152)
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 152E: Evidence Pack Builder & Lineage ===\n');

  try {
    const activationAuthId = 'auth_152e_1';
    const activationLockId = 'alk_152e_1';
    await setupAuthorizationAndLock(activationAuthId, activationLockId);

    // Evaluate
    await evaluator.evaluateLock(activationLockId, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    // Create rules with secret description
    const sensitiveRule = {
      rule_id: 'rul_sensitive_e',
      activation_lock_id: activationLockId,
      check_type: 'SAFETY_ATTENUATION',
      severity: 'INFO',
      description: 'System validation completed: security@printprice.com with env_token:auth_token_987654'
    };
    if (!isProdLike) {
      lockBuilder._mockState.rules.set(activationLockId, [sensitiveRule]);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_lock_rules
         (rule_id, activation_lock_id, check_type, severity, description)
         VALUES (?, ?, ?, ?, ?)`,
        [sensitiveRule.rule_id, activationLockId, sensitiveRule.check_type, sensitiveRule.severity, sensitiveRule.description]
      );
    }

    // Build evidence pack
    const runRes = await evidenceSvc.buildEvidencePack(activationLockId, 'admin');
    const { evidence_pack_hash, lineage_hash_chain } = runRes;
    assert.ok(evidence_pack_hash);

    const evidenceRecord = await evidenceSvc.getEvidence(activationLockId);
    assert.ok(evidenceRecord);

    const payload = typeof evidenceRecord.evidence_payload_json === 'string'
      ? JSON.parse(evidenceRecord.evidence_payload_json)
      : evidenceRecord.evidence_payload_json;

    // Verify v152.0 schema version
    assert.strictEqual(payload.evidence_schema_version, '152.0');
    console.log('  PASS: Evidence schema version is 152.0.');

    // Verify sensitive data is redacted
    const stringified = JSON.stringify(payload);
    assert.ok(!stringified.includes('security@printprice.com'), 'Email must be redacted');
    assert.ok(!stringified.includes('auth_token_987654'), 'API key must be redacted');
    assert.ok(stringified.includes('[REDACTED_EMAIL]'), 'Redaction placeholder must be present');
    console.log('  PASS: Sensitive details redacted correctly.');

    // Verify lineage chain
    assert.strictEqual(lineage_hash_chain.phase152_activation_lock_id, activationLockId);
    assert.strictEqual(lineage_hash_chain.phase151_source_activation_authorization_hash, 'auth_hash_152e');
    assert.strictEqual(lineage_hash_chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 152E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 152E:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
