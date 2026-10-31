'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const decisionBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;
const handoffBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupDecisionFixture(activationDecisionId, status = 'FINALIZED', result = 'GO_APPROVED_NOT_ACTIVE') {
  const writeScope153 = { writes_only_phase153_tables: true, wrote_phase128_to_152_operational_tables: false };
  const nonExecution153 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const decisionRecord = {
    activation_decision_id: activationDecisionId,
    source_activation_lock_id: 'lock_test_154b',
    source_activation_auth_id: 'auth_test_154b',
    source_activation_readiness_id: 'rd_test_154b',
    source_plan_id: 'pln_test_154b',
    source_dispatcher_id: 'dsp_test_154b',
    source_envelope_id: 'env_test_154b',
    source_auth_id: 'ath_test_154b',
    source_readiness_id: 'rd_test_154b',
    source_approval_id: 'apv_test_154b',
    source_prep_id: 'prep_test_154b',
    source_review_id: 'rev_test_154b',
    source_simulation_id: 'sim_test_154b',
    source_execution_id: 'exec_test_154b',
    cohort_id: 'cohort_test_154b',
    tenant_id: 'tenant_test_154b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_decision_status: status,
    activation_decision_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { decision_mode: 'FINAL_GO_NO_GO_DECISION_ONLY', allow_real_activation: false },
    decision_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    decision_rules_json: {},
    decision_blockers_json: {},
    non_execution_attestation_json: nonExecution153,
    write_scope_attestation_json: writeScope153,
    source_activation_lock_hash: 'lock_hash_154b',
    source_freeze_package_hash: 'lock_hash_154b',
    activation_decision_hash: 'decision_hash_154b',
    decision_evidence_pack_hash: 'pack_hash_154b',
    evidence_pack_hash: 'pack_hash_154b',
    lineage_hash_chain_json: {},
    decision_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'GO_DECISION_FINALIZED_NOT_EXECUTED',
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
    decisionBuilder._mockState.decision.set(activationDecisionId, decisionRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision_rules WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision_evidence WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision WHERE activation_decision_id = ?', [activationDecisionId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_decision
       (activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_decision_status, activation_decision_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, decision_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        decision_rules_json, decision_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_lock_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_decision_hash, decision_evidence_pack_hash, evidence_pack_hash)
       VALUES (?, 'lock_test_154b', 'auth_test_154b', 'rd_test_154b', 'pln_test_154b', 'dsp_test_154b', 'env_test_154b', 'ath_test_154b', 'rd_test_154b', 'apv_test_154b', 'prep_test_154b', 'rev_test_154b', 'sim_test_154b', 'exec_test_154b', 'cohort_test_154b', 'tenant_test_154b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"decision_mode":"FINAL_GO_NO_GO_DECISION_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'lock_hash_154b', 'lock_hash_154b', 'EXECUTION_NOT_ENABLED', 'GO_DECISION_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'decision_hash_154b', 'decision_hash_154b', 'pack_hash_154b')`,
      [activationDecisionId, status, result, JSON.stringify(nonExecution153), JSON.stringify(writeScope153)]
    );
  }
}

(async () => {
  console.log('=== Smoke 154B: Create Activation Handoff from Phase 153 Decision ===\n');

  try {
    // 1. Positive: create from finalized approved decision record
    const finalizedId = 'dec_finalized_154b';
    await setupDecisionFixture(finalizedId, 'FINALIZED', 'GO_APPROVED_NOT_ACTIVE');
    
    const { handoff } = await handoffBuilder.createHandoff(finalizedId, 'admin');
    assert.ok(handoff.activation_handoff_id, 'activation_handoff_id should exist');
    assert.strictEqual(handoff.source_activation_decision_id, finalizedId);
    assert.strictEqual(handoff.activation_handoff_status, 'DRAFT');
    console.log('  PASS: Draft handoff created successfully from finalized and approved decision.');

    // 2. Negative: block from DRAFT decision
    const draftId = 'dec_draft_154b';
    await setupDecisionFixture(draftId, 'DRAFT', 'GO_APPROVED_NOT_ACTIVE');
    try {
      await handoffBuilder.createHandoff(draftId, 'admin');
      assert.fail('Should have failed creating handoff from DRAFT decision');
    } catch (e) {
      if (e.message.includes('PHASE153_DECISION_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked handoff draft creation from non-finalized decision.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 154B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 154B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
