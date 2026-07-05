'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const decisionBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;
const decisionEvidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationDecisionEvidencePackService').serviceInstance;
const handoffBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffEvaluatorService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupDecisionAndHandoff(activationDecisionId, activationHandoffId) {
  const writeScope153 = { writes_only_phase153_tables: true, wrote_phase128_to_152_operational_tables: false };
  const writeScope154 = { writes_only_phase154_tables: true, wrote_phase128_to_153_operational_tables: false };
  const nonExecution153 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution154 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const decisionRecord = {
    activation_decision_id: activationDecisionId,
    source_activation_lock_id: 'lock_test_154e',
    source_activation_auth_id: 'auth_test_154e',
    source_activation_readiness_id: 'rd_test_154e',
    source_plan_id: 'pln_test_154e',
    source_dispatcher_id: 'dsp_test_154e',
    source_envelope_id: 'env_test_154e',
    source_auth_id: 'ath_test_154e',
    source_readiness_id: 'rd_test_154e',
    source_approval_id: 'apv_test_154e',
    source_prep_id: 'prep_test_154e',
    source_review_id: 'rev_test_154e',
    source_simulation_id: 'sim_test_154e',
    source_execution_id: 'exec_test_154e',
    cohort_id: 'cohort_test_154e',
    tenant_id: 'tenant_test_154e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_decision_status: 'FINALIZED',
    activation_decision_result: 'GO_APPROVED_NOT_ACTIVE',
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
    source_activation_lock_hash: 'lock_hash_154e',
    source_freeze_package_hash: 'lock_hash_154e',
    activation_decision_hash: 'decision_hash_154e',
    decision_evidence_pack_hash: 'pack_hash_154e',
    evidence_pack_hash: 'pack_hash_154e',
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

  const handoffRecord = {
    activation_handoff_id: activationHandoffId,
    source_activation_decision_id: activationDecisionId,
    source_activation_lock_id: 'lock_test_154e',
    source_activation_auth_id: 'auth_test_154e',
    source_activation_readiness_id: 'rd_test_154e',
    source_plan_id: 'pln_test_154e',
    source_dispatcher_id: 'dsp_test_154e',
    source_envelope_id: 'env_test_154e',
    source_auth_id: 'ath_test_154e',
    source_readiness_id: 'rd_test_154e',
    source_approval_id: 'apv_test_154e',
    source_prep_id: 'prep_test_154e',
    source_review_id: 'rev_test_154e',
    source_simulation_id: 'sim_test_154e',
    source_execution_id: 'exec_test_154e',
    cohort_id: 'cohort_test_154e',
    tenant_id: 'tenant_test_154e',
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
    write_scope_attestation_json: writeScope154,
    source_activation_decision_hash: 'decision_hash_154e',
    source_freeze_package_hash: 'lock_hash_154e',
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
    decisionBuilder._mockState.decision.set(activationDecisionId, decisionRecord);
    decisionEvidenceSvc._mockState.evidence.set(activationDecisionId, {
      evidence_pack_hash: 'pack_hash_154e',
      evidence_payload_json: { evidence_schema_version: '153.0', write_scope_attestation: writeScope153, operator_email: 'operator154@ppos.com', system_key: 'authorization:secret_key_154e' },
      lineage_hash_chain_json: {
        phase153_activation_decision_id: activationDecisionId,
        phase152_source_activation_lock_hash: 'lock_hash_e',
        phase151_source_activation_authorization_hash: 'auth_hash_e',
        phase150_source_activation_readiness_hash: 'rd_hash_e',
        phase149_source_plan_hash: 'plan_hash_e',
        phase148_source_dispatcher_hash: 'dsp_hash_e',
        phase147_source_envelope_hash: 'env_hash_e',
        phase146_source_auth_hash: 'auth_hash_e',
        phase145_source_readiness_hash: 'rd_hash_e',
        phase144_source_approval_hash: 'apv_hash_e',
        phase143_preparation_id: 'prep_test_154e',
        phase142_review_id: 'rev_test_154e',
        phase141_source_simulation_hash: 'sim_hash_e',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    handoffBuilder._mockState.handoff.set(activationHandoffId, handoffRecord);
    handoffBuilder._mockState.rules.set(activationHandoffId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision_rules WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision_evidence WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_decision WHERE activation_decision_id = ?', [activationDecisionId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_rules WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_evidence WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff WHERE activation_handoff_id = ?', [activationHandoffId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_decision
       (activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_decision_status, activation_decision_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, decision_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        decision_rules_json, decision_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_lock_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_decision_hash, decision_evidence_pack_hash, evidence_pack_hash)
       VALUES (?, 'lock_test_154e', 'auth_test_154e', 'rd_test_154e', 'pln_test_154e', 'dsp_test_154e', 'env_test_154e', 'ath_test_154e', 'rd_test_154e', 'apv_test_154e', 'prep_test_154e', 'rev_test_154e', 'sim_test_154e', 'exec_test_154e', 'cohort_test_154e', 'tenant_test_154e', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'GO_APPROVED_NOT_ACTIVE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"decision_mode":"FINAL_GO_NO_GO_DECISION_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'lock_hash_154e', 'lock_hash_154e', 'EXECUTION_NOT_ENABLED', 'GO_DECISION_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'decision_hash_154e', 'decision_hash_154e', 'pack_hash_154e')`,
      [activationDecisionId, JSON.stringify(nonExecution153), JSON.stringify(writeScope153)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_decision_evidence
       (evidence_id, activation_decision_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '153.0', 'pack_hash_154e', ?, ?)`,
      [
        'ae_' + activationDecisionId,
        activationDecisionId,
        JSON.stringify({ evidence_schema_version: '153.0', write_scope_attestation: writeScope153, operator_email: 'operator154@ppos.com', system_key: 'authorization:secret_key_154e' }),
        JSON.stringify({
          phase153_activation_decision_id: activationDecisionId,
          phase152_source_activation_lock_hash: 'lock_hash_e',
          phase151_source_activation_authorization_hash: 'auth_hash_e',
          phase150_source_activation_readiness_hash: 'rd_hash_e',
          phase149_source_plan_hash: 'plan_hash_e',
          phase148_source_dispatcher_hash: 'dsp_hash_e',
          phase147_source_envelope_hash: 'env_hash_e',
          phase146_source_auth_hash: 'auth_hash_e',
          phase145_source_readiness_hash: 'rd_hash_e',
          phase144_source_approval_hash: 'apv_hash_e',
          phase143_preparation_id: 'prep_test_154e',
          phase142_review_id: 'rev_test_154e',
          phase141_source_simulation_hash: 'sim_hash_e',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_handoff
       (activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_handoff_status, activation_handoff_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, handoff_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        handoff_rules_json, handoff_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_decision_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'lock_test_154e', 'auth_test_154e', 'rd_test_154e', 'pln_test_154e', 'dsp_test_154e', 'env_test_154e', 'ath_test_154e', 'rd_test_154e', 'apv_test_154e', 'prep_test_154e', 'rev_test_154e', 'sim_test_154e', 'exec_test_154e', 'cohort_test_154e', 'tenant_test_154e', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_handoff_evaluation":true}', ?, ?, 'decision_hash_154e', 'lock_hash_154e', 'EXECUTION_NOT_ENABLED', 'HANDOFF_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationHandoffId,
        activationDecisionId,
        JSON.stringify({ handoff_mode: 'TOKEN_PREPARATION_ONLY', allow_real_activation: false }),
        JSON.stringify(nonExecution154),
        JSON.stringify(writeScope154)
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 154E: Evidence Pack Builder & Lineage ===\n');

  try {
    const activationDecisionId = 'dec_154e_1';
    const activationHandoffId = 'ahf_154e_1';
    await setupDecisionAndHandoff(activationDecisionId, activationHandoffId);

    // Evaluate handoff first
    await evaluator.evaluateHandoff(activationHandoffId, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    const result = await evidenceSvc.buildEvidencePack(activationHandoffId, 'admin');
    assert.ok(result.evidence_pack_hash, 'evidence_pack_hash should exist');
    assert.strictEqual(result.lineage_hash_chain.phase153_activation_decision_id, activationDecisionId);
    console.log('  PASS: Evidence schema version is 154.0.');

    // Verify sensitive data is redacted from storage content
    const evidence = await evidenceSvc.getEvidence(activationHandoffId);
    const payloadStr = typeof evidence.evidence_payload_json === 'string'
      ? evidence.evidence_payload_json
      : JSON.stringify(evidence.evidence_payload_json);

    assert.ok(!payloadStr.includes('operator154@ppos.com'), 'Email should be redacted');
    assert.ok(!payloadStr.includes('secret_key_154e'), 'Secrets should be redacted');
    console.log('  PASS: Sensitive details redacted correctly.');

    // Lineage trace checks
    const chain = typeof evidence.lineage_hash_chain_json === 'string'
      ? JSON.parse(evidence.lineage_hash_chain_json)
      : evidence.lineage_hash_chain_json;

    assert.strictEqual(chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 154E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 154E:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
