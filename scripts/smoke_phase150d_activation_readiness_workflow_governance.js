'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const planBuilder = require('../src/api/services/cohortInterventionExecutionPlanBuilderService').serviceInstance;
const planEvidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanEvidencePackService').serviceInstance;
const rdBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessEvaluatorService').serviceInstance;
const decision = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupPlanAndReadiness(planId, activationRdId) {
  const writeScope149 = { writes_only_phase149_tables: true, wrote_phase128_to_148_operational_tables: false };
  const writeScope150 = { writes_only_phase150_tables: true, wrote_phase128_to_149_operational_tables: false };
  const nonExecution149 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution150 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const planRecord = {
    plan_id: planId,
    source_dispatcher_id: 'dsp_test_150d',
    source_envelope_id: 'env_test_150d',
    source_auth_id: 'ath_test_150d',
    source_readiness_id: 'rd_test_150d',
    source_approval_id: 'apv_test_150d',
    source_prep_id: 'prep_test_150d',
    source_review_id: 'rev_test_150d',
    source_simulation_id: 'sim_test_150d',
    source_execution_id: 'exec_test_150d',
    cohort_id: 'cohort_test_150d',
    tenant_id: 'tenant_test_150d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    plan_status: 'FINALIZED',
    plan_result: 'PLAN_MATERIALIZED_NOT_EXECUTED',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { plan_mode: 'MATERIALIZED_NOT_EXECUTABLE', allow_real_execution: false },
    plan_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    plan_rules_json: {},
    plan_blockers_json: {},
    non_execution_attestation_json: nonExecution149,
    write_scope_attestation_json: writeScope149,
    source_dispatcher_hash: 'dsp_hash_150d',
    source_dispatcher_evidence_pack_hash: 'de_hash_150d',
    plan_materialization_hash: 'plan_hash_150d',
    evidence_pack_hash: 'pack_hash_150d',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_plan_status: 'MATERIALIZED_NOT_EXECUTABLE',
    plan_execution_status: 'PLAN_MATERIALIZED_NOT_EXECUTED',
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

  const rdRecord = {
    activation_rd_id: activationRdId,
    source_plan_id: planId,
    source_dispatcher_id: 'dsp_test_150d',
    source_envelope_id: 'env_test_150d',
    source_auth_id: 'ath_test_150d',
    source_readiness_id: 'rd_test_150d',
    source_approval_id: 'apv_test_150d',
    source_prep_id: 'prep_test_150d',
    source_review_id: 'rev_test_150d',
    source_simulation_id: 'sim_test_150d',
    source_execution_id: 'exec_test_150d',
    cohort_id: 'cohort_test_150d',
    tenant_id: 'tenant_test_150d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_readiness_status: 'DRAFT',
    activation_readiness_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { activation_mode: 'READINESS_ONLY', allow_real_activation: false },
    readiness_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    readiness_rules_json: {},
    readiness_blockers_json: { missing_readiness_evaluation: true },
    non_execution_attestation_json: nonExecution150,
    write_scope_attestation_json: writeScope150,
    source_plan_hash: 'plan_hash_150d',
    source_plan_evidence_pack_hash: 'pack_hash_150d',
    activation_readiness_hash: null,
    readiness_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'ACTIVATION_NOT_EXECUTED',
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
    planBuilder._mockState.plan.set(planId, planRecord);
    planEvidenceSvc._mockState.evidence.set(planId, {
      evidence_pack_hash: 'pack_hash_150d',
      evidence_payload_json: { evidence_schema_version: '149.0', write_scope_attestation: writeScope149 },
      lineage_hash_chain_json: {
        phase149_plan_id: planId,
        phase148_source_dispatcher_hash: 'dsp_hash_d',
        phase147_source_envelope_hash: 'env_hash_d',
        phase146_source_auth_hash: 'auth_hash_d',
        phase145_source_readiness_hash: 'rd_hash_d',
        phase144_source_approval_hash: 'apv_hash_d',
        phase143_preparation_id: 'prep_test_150d',
        phase142_review_id: 'rev_test_150d',
        phase141_source_simulation_hash: 'sim_hash_d',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    rdBuilder._mockState.readiness.set(activationRdId, rdRecord);
    rdBuilder._mockState.rules.set(activationRdId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_plan_rules WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_plan_evidence WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_plan WHERE plan_id = ?', [planId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_rules WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_evidence WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd WHERE activation_rd_id = ?', [activationRdId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_plan
       (plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        plan_status, plan_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, plan_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        plan_rules_json, plan_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_dispatcher_hash, source_dispatcher_evidence_pack_hash,
        execution_capability_status, execution_plan_status, plan_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, plan_materialization_hash, evidence_pack_hash)
       VALUES (?, 'dsp_test_150d', 'env_test_150d', 'ath_test_150d', 'rd_test_150d', 'apv_test_150d', 'prep_test_150d', 'rev_test_150d', 'sim_test_150d', 'exec_test_150d', 'cohort_test_150d', 'tenant_test_150d', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'PLAN_MATERIALIZED_NOT_EXECUTED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"plan_mode":"MATERIALIZED_NOT_EXECUTABLE", "allow_real_execution":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'dsp_hash_150d', 'de_hash_150d', 'EXECUTION_NOT_ENABLED', 'MATERIALIZED_NOT_EXECUTABLE', 'PLAN_MATERIALIZED_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'plan_hash_150d', 'pack_hash_150d')`,
      [planId, JSON.stringify(nonExecution149), JSON.stringify(writeScope149)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_plan_evidence
       (evidence_id, plan_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '149.0', 'pack_hash_150d', ?, ?)`,
      [
        'pe_' + planId,
        planId,
        JSON.stringify({ evidence_schema_version: '149.0', write_scope_attestation: writeScope149 }),
        JSON.stringify({
          phase149_plan_id: planId,
          phase148_source_dispatcher_hash: 'dsp_hash_d',
          phase147_source_envelope_hash: 'env_hash_d',
          phase146_source_auth_hash: 'auth_hash_d',
          phase145_source_readiness_hash: 'rd_hash_d',
          phase144_source_approval_hash: 'apv_hash_d',
          phase143_preparation_id: 'prep_test_150d',
          phase142_review_id: 'rev_test_150d',
          phase141_source_simulation_hash: 'sim_hash_d',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd
       (activation_rd_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_readiness_status, activation_readiness_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, readiness_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        readiness_rules_json, readiness_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_plan_hash, source_plan_evidence_pack_hash,
        execution_capability_status, activation_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'dsp_test_150d', 'env_test_150d', 'ath_test_150d', 'rd_test_150d', 'apv_test_150d', 'prep_test_150d', 'rev_test_150d', 'sim_test_150d', 'exec_test_150d', 'cohort_test_150d', 'tenant_test_150d', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', '{"activation_mode":"READINESS_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{"missing_readiness_evaluation":true}', ?, ?, 'plan_hash_150d', 'pack_hash_150d', 'EXECUTION_NOT_ENABLED', 'ACTIVATION_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [activationRdId, planId, JSON.stringify(nonExecution150), JSON.stringify(writeScope150)]
    );
  }
}

(async () => {
  console.log('=== Smoke 150D: Review Workflow Governance ===\n');

  try {
    const planId = 'pln_150d_1';
    const activationRdId = 'ard_150d_1';
    await setupPlanAndReadiness(planId, activationRdId);

    // 1. Finalization blocks before evaluation
    try {
      await decision.finalizeReadiness(activationRdId, 'admin');
      assert.fail('Should block finalization when evaluation/decision are not done');
    } catch (e) {
      if (e.message.includes('READINESS_EVALUATION_NOT_COMPLETED') || e.message.includes('READINESS_DECISION_REQUIRED')) {
        console.log('  PASS: Finalization blocked before evaluation.');
      } else {
        throw e;
      }
    }

    // 2. Evaluate
    await evaluator.evaluateReadiness(activationRdId, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    // 3. Record decision
    await decision.recordDecision(activationRdId, 'ACTIVATION_READY_NOT_ACTIVE', 'Activation readiness check complete.', 'admin');

    // 4. Build evidence
    await evidenceSvc.buildEvidencePack(activationRdId, 'admin');

    // 5. Finalize
    const { readiness } = await decision.finalizeReadiness(activationRdId, 'admin');
    assert.strictEqual(readiness.activation_readiness_status, 'FINALIZED');
    assert.strictEqual(readiness.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(readiness.activation_execution_status, 'ACTIVATION_NOT_EXECUTED');
    console.log('  PASS: Activation readiness finalized successfully with safe non-execution markers.');

    // 6. Block modification after finalization
    try {
      await decision.recordDecision(activationRdId, 'ACTIVATION_BLOCKED_BY_GUARDRAIL', 'Change mind', 'admin');
      assert.fail('Should block modifications on finalized readiness');
    } catch (e) {
      if (e.message.includes('READINESS_RECORD_ALREADY_FINALIZED')) {
        console.log('  PASS: Modifications blocked on finalized readiness.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 150D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 150D:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
