'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenFinalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvGuardrailService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenFinalApvAttestation(activationTokenFinalApvId, writeScopeObj) {
  const writeScope157 = { writes_only_phase157_tables: true, wrote_phase128_to_156_operational_tables: false };
  const nonExecution157 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const record = {
    activation_token_final_apv_id: activationTokenFinalApvId,
    source_activation_token_env_id: 'ate_test_157g',
    source_activation_token_auth_id: 'ath_test_157g',
    source_activation_handoff_id: 'ahf_test_157g',
    source_activation_decision_id: 'dec_test_157g',
    source_activation_lock_id: 'lock_test_157g',
    source_activation_auth_id: 'auth_test_157g',
    source_activation_readiness_id: 'rd_test_157g',
    source_plan_id: 'pln_test_157g',
    source_dispatcher_id: 'dsp_test_157g',
    source_envelope_id: 'env_test_157g',
    source_auth_id: 'ath_test_157g',
    source_readiness_id: 'rd_test_157g',
    source_approval_id: 'apv_test_157g',
    source_prep_id: 'prep_test_157g',
    source_review_id: 'rev_test_157g',
    source_simulation_id: 'sim_test_157g',
    source_execution_id: 'exec_test_157g',
    cohort_id: 'cohort_test_157g',
    tenant_id: 'tenant_test_157g',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_final_apv_status: 'DRAFT',
    activation_token_final_apv_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { final_approval_mode: 'TOKEN_FINAL_ISSUANCE_APPROVAL_ONLY', allow_token_issue: false },
    token_final_apv_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_final_apv_rules_json: {},
    token_final_apv_blockers_json: { missing_token_final_apv_evaluation: true },
    non_execution_attestation_json: nonExecution157,
    write_scope_attestation_json: writeScopeObj,
    source_activation_token_env_hash: 'token_env_hash_157g',
    source_token_material_hash: 'token_material_hash_157g',
    source_freeze_package_hash: 'lock_hash_157g',
    activation_token_final_apv_hash: null,
    token_final_apv_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    security_chair_signature_json: {},
    final_approval_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED',
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
    tokenFinalApvBuilder._mockState.tokenFinalApv.set(activationTokenFinalApvId, record);
    tokenFinalApvBuilder._mockState.rules.set(activationTokenFinalApvId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv_rules WHERE activation_token_final_apv_id = ?', [activationTokenFinalApvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv_evidence WHERE activation_token_final_apv_id = ?', [activationTokenFinalApvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv WHERE activation_token_final_apv_id = ?', [activationTokenFinalApvId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv
       (activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_final_apv_status, activation_token_final_apv_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_final_apv_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_final_apv_rules_json, token_final_apv_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_env_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_token_final_apv_evaluation":true}', ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationTokenFinalApvId,
        record.source_activation_token_env_id,
        record.source_activation_token_auth_id,
        record.source_activation_handoff_id,
        record.source_activation_decision_id,
        record.source_activation_lock_id,
        record.source_activation_auth_id,
        record.source_activation_readiness_id,
        record.source_plan_id,
        record.source_dispatcher_id,
        record.source_envelope_id,
        record.source_auth_id,
        record.source_readiness_id,
        record.source_approval_id,
        record.source_prep_id,
        record.source_review_id,
        record.source_simulation_id,
        record.source_execution_id,
        record.cohort_id,
        record.tenant_id,
        record.simulation_type,
        record.risk_level,
        record.confidence_level,
        record.projected_impact_score,
        record.rollback_feasibility_score,
        record.evidence_completeness_score,
        JSON.stringify(record.canary_envelope_json),
        JSON.stringify(record.impact_review_json),
        JSON.stringify(record.rollback_review_json),
        JSON.stringify(record.guardrail_review_json),
        JSON.stringify(nonExecution157),
        JSON.stringify(writeScopeObj),
        record.source_activation_token_env_hash,
        record.source_token_material_hash,
        record.source_freeze_package_hash
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 157G: Guardrails & Safety Boundary Scanner ===\n');

  try {
    // 1. Static scanner verification
    const scannerFindings = await guardrailSvc.performSafetyScannerCheck('dummy');
    const criticals = scannerFindings.filter(f => f.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0, 'Should contain zero forbidden activation/execution operations.');
    console.log('  PASS: Scanned Phase 157 components - safety boundary clean.');

    // 2. Write scope verification (Correct attestation)
    const validId = 'atf_157g_valid';
    await setupTokenFinalApvAttestation(validId, { writes_only_phase157_tables: true, wrote_phase128_to_156_operational_tables: false });
    const writeFindings = await guardrailSvc.verifyWriteScope(validId);
    const writeCrit = writeFindings.filter(f => f.severity === 'CRITICAL');
    assert.strictEqual(writeCrit.length, 0);
    console.log('  PASS: Verified write scope boundaries.');

    // 3. Write scope verification (Invalid attestation)
    const invalidId = 'atf_157g_invalid';
    await setupTokenFinalApvAttestation(invalidId, { writes_only_phase157_tables: false, wrote_phase128_to_156_operational_tables: true });
    const badWriteFindings = await guardrailSvc.verifyWriteScope(invalidId);
    const badWriteCrit = badWriteFindings.filter(f => f.severity === 'CRITICAL');
    assert.ok(badWriteCrit.length > 0);
    console.log('  PASS: Blocked invalid write scope attestation.');

    console.log('\nSmoke 157G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 157G:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
