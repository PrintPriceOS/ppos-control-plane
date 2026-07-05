'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const lockBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupAuthorizationFixture(activationAuthId, status = 'FINALIZED', result = 'AUTHORIZED_NOT_ACTIVE') {
  const writeScope151 = { writes_only_phase151_tables: true, wrote_phase128_to_150_operational_tables: false };
  const nonExecution151 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const authRecord = {
    activation_auth_id: activationAuthId,
    source_activation_readiness_id: 'rd_test_152b',
    source_plan_id: 'pln_test_152b',
    source_dispatcher_id: 'dsp_test_152b',
    source_envelope_id: 'env_test_152b',
    source_auth_id: 'ath_test_152b',
    source_readiness_id: 'rd_test_152b',
    source_approval_id: 'apv_test_152b',
    source_prep_id: 'prep_test_152b',
    source_review_id: 'rev_test_152b',
    source_simulation_id: 'sim_test_152b',
    source_execution_id: 'exec_test_152b',
    cohort_id: 'cohort_test_152b',
    tenant_id: 'tenant_test_152b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_auth_status: status,
    activation_auth_result: result,
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
    source_activation_readiness_hash: 'rd_hash_152b',
    activation_authorization_hash: 'auth_hash_152b',
    evidence_pack_hash: 'pack_hash_152b',
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

  if (!isProdLike) {
    authBuilder._mockState.authorization.set(activationAuthId, authRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_rules WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_evidence WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth WHERE activation_auth_id = ?', [activationAuthId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_auth
       (activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_auth_status, activation_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_readiness_hash,
        execution_capability_status, activation_execution_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_authorization_hash, evidence_pack_hash)
       VALUES (?, 'rd_test_152b', 'pln_test_152b', 'dsp_test_152b', 'env_test_152b', 'ath_test_152b', 'rd_test_152b', 'apv_test_152b', 'prep_test_152b', 'rev_test_152b', 'sim_test_152b', 'exec_test_152b', 'cohort_test_152b', 'tenant_test_152b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"authorization_mode":"ACTIVATION_AUTHORIZATION_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'rd_hash_152b', 'EXECUTION_NOT_ENABLED', 'AUTHORIZATION_FINALIZED_NOT_EXECUTED', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'auth_hash_152b', 'pack_hash_152b')`,
      [activationAuthId, status, result, JSON.stringify(nonExecution151), JSON.stringify(writeScope151)]
    );
  }
}

(async () => {
  console.log('=== Smoke 152B: Create Activation Lock from Phase 151 Authorization ===\n');

  try {
    // 1. Positive: create from finalized approved auth record
    const finalizedId = 'auth_finalized_152b';
    await setupAuthorizationFixture(finalizedId, 'FINALIZED', 'AUTHORIZED_NOT_ACTIVE');
    
    const { lock } = await lockBuilder.createLock(finalizedId, 'admin');
    assert.ok(lock.activation_lock_id, 'activation_lock_id should exist');
    assert.strictEqual(lock.source_activation_auth_id, finalizedId);
    assert.strictEqual(lock.activation_lock_status, 'DRAFT');
    console.log('  PASS: Draft lock created successfully from finalized and approved authorization.');

    // 2. Negative: block from DRAFT authorization
    const draftId = 'auth_draft_152b';
    await setupAuthorizationFixture(draftId, 'DRAFT', 'AUTHORIZED_NOT_ACTIVE');
    try {
      await lockBuilder.createLock(draftId, 'admin');
      assert.fail('Should have failed creating lock from DRAFT authorization');
    } catch (e) {
      if (e.message.includes('PHASE151_AUTHORIZATION_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked lock draft creation from non-finalized authorization.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 152B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 152B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
