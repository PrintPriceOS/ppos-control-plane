'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenAuthBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenAuthGuardrailService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenAuthAttestation(activationTokenAuthId, writeScopeObj) {
  const writeScope155 = { writes_only_phase155_tables: true, wrote_phase128_to_154_operational_tables: false };
  const nonExecution155 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const record = {
    activation_token_auth_id: activationTokenAuthId,
    source_activation_handoff_id: 'ahf_test_155g',
    source_activation_decision_id: 'dec_test_155g',
    source_activation_lock_id: 'lock_test_155g',
    source_activation_auth_id: 'auth_test_155g',
    source_activation_readiness_id: 'rd_test_155g',
    source_plan_id: 'pln_test_155g',
    source_dispatcher_id: 'dsp_test_155g',
    source_envelope_id: 'env_test_155g',
    source_auth_id: 'ath_test_155g',
    source_readiness_id: 'rd_test_155g',
    source_approval_id: 'apv_test_155g',
    source_prep_id: 'prep_test_155g',
    source_review_id: 'rev_test_155g',
    source_simulation_id: 'sim_test_155g',
    source_execution_id: 'exec_test_155g',
    cohort_id: 'cohort_test_155g',
    tenant_id: 'tenant_test_155g',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_auth_status: 'DRAFT',
    activation_token_auth_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { token_auth_mode: 'TOKEN_ISSUANCE_AUTHORIZATION_ONLY', allow_token_issue: false },
    token_auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_auth_rules_json: {},
    token_auth_blockers_json: { missing_token_auth_evaluation: true },
    non_execution_attestation_json: nonExecution155,
    write_scope_attestation_json: writeScopeObj,
    source_activation_handoff_hash: 'handoff_hash_155g',
    source_token_material_hash: 'token_material_hash_155g',
    source_freeze_package_hash: 'lock_hash_155g',
    activation_token_auth_hash: null,
    token_auth_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    authorization_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED',
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
    tokenAuthBuilder._mockState.tokenAuth.set(activationTokenAuthId, record);
    tokenAuthBuilder._mockState.rules.set(activationTokenAuthId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_rules WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_evidence WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth WHERE activation_token_auth_id = ?', [activationTokenAuthId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_auth
       (activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_auth_status, activation_token_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_auth_rules_json, token_auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_handoff_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'dec_test_155g', 'lock_test_155g', 'auth_test_155g', 'rd_test_155g', 'pln_test_155g', 'dsp_test_155g', 'env_test_155g', 'ath_test_155g', 'rd_test_155g', 'apv_test_155g', 'prep_test_155g', 'rev_test_155g', 'sim_test_155g', 'exec_test_155g', 'cohort_test_155g', 'tenant_test_155g', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', '{"token_auth_mode":"TOKEN_ISSUANCE_AUTHORIZATION_ONLY", "allow_token_issue":false}', '{}', '{}', '{}', '{}', '{}', '{"missing_token_auth_evaluation":true}', ?, ?, 'handoff_hash_155g', 'token_material_hash_155g', 'lock_hash_155g', 'EXECUTION_NOT_ENABLED', 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [activationTokenAuthId, record.source_activation_handoff_id, JSON.stringify(nonExecution155), JSON.stringify(writeScopeObj)]
    );
  }
}

(async () => {
  console.log('=== Smoke 155G: Guardrails & Safety Boundary Scanner ===\n');

  try {
    // 1. Static scanner verification
    const scannerFindings = await guardrailSvc.performSafetyScannerCheck('dummy');
    const criticals = scannerFindings.filter(f => f.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0, 'Should contain zero forbidden activation/execution operations.');
    console.log('  PASS: Scanned Phase 155 components - safety boundary clean.');

    // 2. Write scope verification (Correct attestation)
    const validId = 'ata_155g_valid';
    await setupTokenAuthAttestation(validId, { writes_only_phase155_tables: true, wrote_phase128_to_154_operational_tables: false });
    const writeFindings = await guardrailSvc.verifyWriteScope(validId);
    const writeCrit = writeFindings.filter(f => f.severity === 'CRITICAL');
    assert.strictEqual(writeCrit.length, 0);
    console.log('  PASS: Verified write scope boundaries.');

    // 3. Write scope verification (Invalid attestation)
    const invalidId = 'ata_155g_invalid';
    await setupTokenAuthAttestation(invalidId, { writes_only_phase155_tables: false, wrote_phase128_to_154_operational_tables: true });
    const badWriteFindings = await guardrailSvc.verifyWriteScope(invalidId);
    const badWriteCrit = badWriteFindings.filter(f => f.severity === 'CRITICAL');
    assert.ok(badWriteCrit.length > 0);
    console.log('  PASS: Blocked invalid write scope attestation.');

    console.log('\nSmoke 155G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 155G:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
