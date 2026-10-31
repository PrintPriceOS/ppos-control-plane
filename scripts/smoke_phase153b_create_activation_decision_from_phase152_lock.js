'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const lockBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;
const decisionBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupLockFixture(activationLockId, status = 'FINALIZED', result = 'LOCKED_NOT_ACTIVE') {
  const writeScope152 = { writes_only_phase152_tables: true, wrote_phase128_to_151_operational_tables: false };
  const nonExecution152 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const lockRecord = {
    activation_lock_id: activationLockId,
    source_activation_auth_id: 'auth_test_153b',
    source_activation_readiness_id: 'rd_test_153b',
    source_plan_id: 'pln_test_153b',
    source_dispatcher_id: 'dsp_test_153b',
    source_envelope_id: 'env_test_153b',
    source_auth_id: 'ath_test_153b',
    source_readiness_id: 'rd_test_153b',
    source_approval_id: 'apv_test_153b',
    source_prep_id: 'prep_test_153b',
    source_review_id: 'rev_test_153b',
    source_simulation_id: 'sim_test_153b',
    source_execution_id: 'exec_test_153b',
    cohort_id: 'cohort_test_153b',
    tenant_id: 'tenant_test_153b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_lock_status: status,
    activation_lock_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { lock_mode: 'PRE_EXECUTION_FREEZE_ONLY', allow_real_activation: false },
    lock_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    lock_rules_json: {},
    lock_blockers_json: {},
    non_execution_attestation_json: nonExecution152,
    write_scope_attestation_json: writeScope152,
    source_activation_authorization_hash: 'auth_hash_153b',
    activation_lock_hash: 'lock_hash_153b',
    freeze_package_hash: 'lock_hash_153b',
    evidence_pack_hash: 'pack_hash_153b',
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
    lockBuilder._mockState.lock.set(activationLockId, lockRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock_rules WHERE activation_lock_id = ?', [activationLockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock_evidence WHERE activation_lock_id = ?', [activationLockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_lock WHERE activation_lock_id = ?', [activationLockId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_lock
       (activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_lock_status, activation_lock_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, lock_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        lock_rules_json, lock_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_authorization_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_lock_hash, freeze_package_hash, evidence_pack_hash)
       VALUES (?, 'auth_test_153b', 'rd_test_153b', 'pln_test_153b', 'dsp_test_153b', 'env_test_153b', 'ath_test_153b', 'rd_test_153b', 'apv_test_153b', 'prep_test_153b', 'rev_test_153b', 'sim_test_153b', 'exec_test_153b', 'cohort_test_153b', 'tenant_test_153b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"lock_mode":"PRE_EXECUTION_FREEZE_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'auth_hash_153b', 'EXECUTION_NOT_ENABLED', 'LOCK_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'lock_hash_153b', 'lock_hash_153b', 'pack_hash_153b')`,
      [activationLockId, status, result, JSON.stringify(nonExecution152), JSON.stringify(writeScope152)]
    );
  }
}

(async () => {
  console.log('=== Smoke 153B: Create Activation Decision from Phase 152 Lock ===\n');

  try {
    // 1. Positive: create from finalized approved lock record
    const finalizedId = 'lock_finalized_153b';
    await setupLockFixture(finalizedId, 'FINALIZED', 'LOCKED_NOT_ACTIVE');
    
    const { decision } = await decisionBuilder.createDecision(finalizedId, 'admin');
    assert.ok(decision.activation_decision_id, 'activation_decision_id should exist');
    assert.strictEqual(decision.source_activation_lock_id, finalizedId);
    assert.strictEqual(decision.activation_decision_status, 'DRAFT');
    console.log('  PASS: Draft decision created successfully from finalized and approved lock.');

    // 2. Negative: block from DRAFT lock
    const draftId = 'lock_draft_153b';
    await setupLockFixture(draftId, 'DRAFT', 'LOCKED_NOT_ACTIVE');
    try {
      await decisionBuilder.createDecision(draftId, 'admin');
      assert.fail('Should have failed creating decision from DRAFT lock');
    } catch (e) {
      if (e.message.includes('PHASE152_LOCK_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked decision draft creation from non-finalized lock.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 153B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 153B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
