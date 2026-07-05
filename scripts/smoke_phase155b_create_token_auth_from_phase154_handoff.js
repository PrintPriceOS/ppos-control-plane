'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const handoffBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const tokenAuthBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupHandoffFixture(activationHandoffId, status = 'FINALIZED', result = 'TOKEN_PREPARED_NOT_ISSUED') {
  const writeScope154 = { writes_only_phase154_tables: true, wrote_phase128_to_153_operational_tables: false };
  const nonExecution154 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const handoffRecord = {
    activation_handoff_id: activationHandoffId,
    source_activation_decision_id: 'dec_test_155b',
    source_activation_lock_id: 'lock_test_155b',
    source_activation_auth_id: 'auth_test_155b',
    source_activation_readiness_id: 'rd_test_155b',
    source_plan_id: 'pln_test_155b',
    source_dispatcher_id: 'dsp_test_155b',
    source_envelope_id: 'env_test_155b',
    source_auth_id: 'ath_test_155b',
    source_readiness_id: 'rd_test_155b',
    source_approval_id: 'apv_test_155b',
    source_prep_id: 'prep_test_155b',
    source_review_id: 'rev_test_155b',
    source_simulation_id: 'sim_test_155b',
    source_execution_id: 'exec_test_155b',
    cohort_id: 'cohort_test_155b',
    tenant_id: 'tenant_test_155b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_handoff_status: status,
    activation_handoff_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { handoff_mode: 'TOKEN_PREPARATION_ONLY', allow_real_activation: false },
    handoff_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    handoff_rules_json: {},
    handoff_blockers_json: {},
    non_execution_attestation_json: nonExecution154,
    write_scope_attestation_json: writeScope154,
    source_activation_decision_hash: 'decision_hash_155b',
    source_freeze_package_hash: 'lock_hash_155b',
    activation_handoff_hash: 'handoff_hash_155b',
    token_material_hash: 'token_material_hash_155b',
    evidence_pack_hash: 'pack_hash_155b',
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
    handoffBuilder._mockState.handoff.set(activationHandoffId, handoffRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_rules WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_evidence WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff WHERE activation_handoff_id = ?', [activationHandoffId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_handoff
       (activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_handoff_status, activation_handoff_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, handoff_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        handoff_rules_json, handoff_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_decision_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_handoff_hash, token_material_hash, evidence_pack_hash)
       VALUES (?, 'dec_test_155b', 'lock_test_155b', 'auth_test_155b', 'rd_test_155b', 'pln_test_155b', 'dsp_test_155b', 'env_test_155b', 'ath_test_155b', 'rd_test_155b', 'apv_test_155b', 'prep_test_155b', 'rev_test_155b', 'sim_test_155b', 'exec_test_155b', 'cohort_test_155b', 'tenant_test_155b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"handoff_mode":"TOKEN_PREPARATION_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'decision_hash_155b', 'lock_hash_155b', 'EXECUTION_NOT_ENABLED', 'HANDOFF_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'handoff_hash_155b', 'token_material_hash_155b', 'pack_hash_155b')`,
      [activationHandoffId, status, result, JSON.stringify(nonExecution154), JSON.stringify(writeScope154)]
    );
  }
}

(async () => {
  console.log('=== Smoke 155B: Create Token Auth from Phase 154 Handoff ===\n');

  try {
    // 1. Positive: create from finalized approved handoff record
    const finalizedId = 'ahf_finalized_155b';
    await setupHandoffFixture(finalizedId, 'FINALIZED', 'TOKEN_PREPARED_NOT_ISSUED');
    
    const { tokenAuth } = await tokenAuthBuilder.createTokenAuth(finalizedId, 'admin');
    assert.ok(tokenAuth.activation_token_auth_id, 'activation_token_auth_id should exist');
    assert.strictEqual(tokenAuth.source_activation_handoff_id, finalizedId);
    assert.strictEqual(tokenAuth.activation_token_auth_status, 'DRAFT');
    console.log('  PASS: Draft token auth created successfully from finalized and approved handoff.');

    // 2. Negative: block from DRAFT handoff
    const draftId = 'ahf_draft_155b';
    await setupHandoffFixture(draftId, 'DRAFT', 'TOKEN_PREPARED_NOT_ISSUED');
    try {
      await tokenAuthBuilder.createTokenAuth(draftId, 'admin');
      assert.fail('Should have failed creating token auth from DRAFT handoff');
    } catch (e) {
      if (e.message.includes('PHASE154_HANDOFF_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked token auth draft creation from non-finalized handoff.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 155B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 155B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
