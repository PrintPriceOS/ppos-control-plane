'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const handoffBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffGuardrailService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupHandoffAttestation(activationHandoffId, writeScopeObj) {
  const writeScope154 = { writes_only_phase154_tables: true, wrote_phase128_to_153_operational_tables: false };
  const nonExecution154 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const record = {
    activation_handoff_id: activationHandoffId,
    source_activation_decision_id: 'dec_test_154g',
    source_activation_lock_id: 'lock_test_154g',
    source_activation_auth_id: 'auth_test_154g',
    source_activation_readiness_id: 'rd_test_154g',
    source_plan_id: 'pln_test_154g',
    source_dispatcher_id: 'dsp_test_154g',
    source_envelope_id: 'env_test_154g',
    source_auth_id: 'ath_test_154g',
    source_readiness_id: 'rd_test_154g',
    source_approval_id: 'apv_test_154g',
    source_prep_id: 'prep_test_154g',
    source_review_id: 'rev_test_154g',
    source_simulation_id: 'sim_test_154g',
    source_execution_id: 'exec_test_154g',
    cohort_id: 'cohort_test_154g',
    tenant_id: 'tenant_test_154g',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_handoff_status: 'DRAFT',
    activation_handoff_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { handoff_mode: 'TOKEN_PREPARATION_ONLY', allow_real_activation: false },
    handoff_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    handoff_rules_json: {},
    handoff_blockers_json: { missing_handoff_evaluation: true },
    non_execution_attestation_json: nonExecution154,
    write_scope_attestation_json: writeScopeObj,
    source_activation_decision_hash: 'decision_hash_154g',
    source_freeze_package_hash: 'lock_hash_154g',
    activation_handoff_hash: null,
    token_material_hash: null,
    handoff_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    handoff_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'HANDOFF_FINALIZED_NOT_EXECUTED',
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
    handoffBuilder._mockState.handoff.set(activationHandoffId, record);
    handoffBuilder._mockState.rules.set(activationHandoffId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_rules WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_evidence WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff WHERE activation_handoff_id = ?', [activationHandoffId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_handoff
       (activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_handoff_status, activation_handoff_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, handoff_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        handoff_rules_json, handoff_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_decision_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'dec_test_154g', 'lock_test_154g', 'auth_test_154g', 'rd_test_154g', 'pln_test_154g', 'dsp_test_154g', 'env_test_154g', 'ath_test_154g', 'rd_test_154g', 'apv_test_154g', 'prep_test_154g', 'rev_test_154g', 'sim_test_154g', 'exec_test_154g', 'cohort_test_154g', 'tenant_test_154g', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', '{"handoff_mode":"TOKEN_PREPARATION_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{"missing_handoff_evaluation":true}', ?, ?, 'decision_hash_154g', 'lock_hash_154g', 'EXECUTION_NOT_ENABLED', 'HANDOFF_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [activationHandoffId, JSON.stringify(nonExecution154), JSON.stringify(writeScopeObj)]
    );
  }
}

(async () => {
  console.log('=== Smoke 154G: Guardrails & Safety Boundary Scanner ===\n');

  try {
    // 1. Static scanner verification
    const scannerFindings = await guardrailSvc.performSafetyScannerCheck('dummy');
    const criticals = scannerFindings.filter(f => f.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0, 'Should contain zero forbidden activation/execution operations.');
    console.log('  PASS: Scanned Phase 154 components - safety boundary clean.');

    // 2. Write scope verification (Correct attestation)
    const validId = 'ahf_154g_valid';
    await setupHandoffAttestation(validId, { writes_only_phase154_tables: true, wrote_phase128_to_153_operational_tables: false });
    const writeFindings = await guardrailSvc.verifyWriteScope(validId);
    const writeCrit = writeFindings.filter(f => f.severity === 'CRITICAL');
    assert.strictEqual(writeCrit.length, 0);
    console.log('  PASS: Verified write scope boundaries.');

    // 3. Write scope verification (Invalid attestation)
    const invalidId = 'ahf_154g_invalid';
    await setupHandoffAttestation(invalidId, { writes_only_phase154_tables: false, wrote_phase128_to_153_operational_tables: true });
    const badWriteFindings = await guardrailSvc.verifyWriteScope(invalidId);
    const badWriteCrit = badWriteFindings.filter(f => f.severity === 'CRITICAL');
    assert.ok(badWriteCrit.length > 0);
    console.log('  PASS: Blocked invalid write scope attestation.');

    console.log('\nSmoke 154G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 154G:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
