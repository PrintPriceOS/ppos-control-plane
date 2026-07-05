'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const rdBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const rdEvidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessEvidencePackService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationEvaluatorService').serviceInstance;
const decision = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReadinessAndAuth(activationRdId, activationAuthId) {
  const writeScope150 = { writes_only_phase150_tables: true, wrote_phase128_to_149_operational_tables: false };
  const writeScope151 = { writes_only_phase151_tables: true, wrote_phase128_to_150_operational_tables: false };
  const nonExecution150 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution151 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const rdRecord = {
    activation_rd_id: activationRdId,
    source_plan_id: 'pln_test_151d',
    source_dispatcher_id: 'dsp_test_151d',
    source_envelope_id: 'env_test_151d',
    source_auth_id: 'ath_test_151d',
    source_readiness_id: 'rd_test_151d',
    source_approval_id: 'apv_test_151d',
    source_prep_id: 'prep_test_151d',
    source_review_id: 'rev_test_151d',
    source_simulation_id: 'sim_test_151d',
    source_execution_id: 'exec_test_151d',
    cohort_id: 'cohort_test_151d',
    tenant_id: 'tenant_test_151d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_readiness_status: 'FINALIZED',
    activation_readiness_result: 'ACTIVATION_READY_NOT_ACTIVE',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { activation_mode: 'READINESS_ONLY', allow_real_activation: false },
    readiness_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    readiness_rules_json: {},
    readiness_blockers_json: {},
    non_execution_attestation_json: nonExecution150,
    write_scope_attestation_json: writeScope150,
    source_plan_hash: 'plan_hash_151d',
    source_plan_evidence_pack_hash: 'pe_hash_151d',
    activation_readiness_hash: 'rd_hash_151d',
    evidence_pack_hash: 'pack_hash_151d',
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

  const authRecord = {
    activation_auth_id: activationAuthId,
    source_activation_readiness_id: activationRdId,
    source_plan_id: 'pln_test_151d',
    source_dispatcher_id: 'dsp_test_151d',
    source_envelope_id: 'env_test_151d',
    source_auth_id: 'ath_test_151d',
    source_readiness_id: 'rd_test_151d',
    source_approval_id: 'apv_test_151d',
    source_prep_id: 'prep_test_151d',
    source_review_id: 'rev_test_151d',
    source_simulation_id: 'sim_test_151d',
    source_execution_id: 'exec_test_151d',
    cohort_id: 'cohort_test_151d',
    tenant_id: 'tenant_test_151d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_auth_status: 'DRAFT',
    activation_auth_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { authorization_mode: 'ACTIVATION_AUTHORIZATION_ONLY', allow_real_activation: false },
    auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    auth_rules_json: {},
    auth_blockers_json: { missing_authorization_evaluation: true },
    non_execution_attestation_json: nonExecution151,
    write_scope_attestation_json: writeScope151,
    source_activation_readiness_hash: 'rd_hash_151d',
    activation_authorization_hash: null,
    authorization_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
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
    rdBuilder._mockState.readiness.set(activationRdId, rdRecord);
    rdEvidenceSvc._mockState.evidence.set(activationRdId, {
      evidence_pack_hash: 'pack_hash_151d',
      evidence_payload_json: { evidence_schema_version: '150.0', write_scope_attestation: writeScope150 },
      lineage_hash_chain_json: {
        phase150_activation_rd_id: activationRdId,
        phase149_source_plan_hash: 'plan_hash_d',
        phase148_source_dispatcher_hash: 'dsp_hash_d',
        phase147_source_envelope_hash: 'env_hash_d',
        phase146_source_auth_hash: 'auth_hash_d',
        phase145_source_readiness_hash: 'rd_hash_d',
        phase144_source_approval_hash: 'apv_hash_d',
        phase143_preparation_id: 'prep_test_151d',
        phase142_review_id: 'rev_test_151d',
        phase141_source_simulation_hash: 'sim_hash_d',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    authBuilder._mockState.authorization.set(activationAuthId, authRecord);
    authBuilder._mockState.rules.set(activationAuthId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_rules WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_evidence WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_rules WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_evidence WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth WHERE activation_auth_id = ?', [activationAuthId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd
       (activation_rd_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_readiness_status, activation_readiness_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, readiness_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        readiness_rules_json, readiness_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_plan_hash, source_plan_evidence_pack_hash,
        execution_capability_status, activation_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_readiness_hash, evidence_pack_hash)
       VALUES (?, 'pln_test_151d', 'dsp_test_151d', 'env_test_151d', 'ath_test_151d', 'rd_test_151d', 'apv_test_151d', 'prep_test_151d', 'rev_test_151d', 'sim_test_151d', 'exec_test_151d', 'cohort_test_151d', 'tenant_test_151d', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'ACTIVATION_READY_NOT_ACTIVE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"activation_mode":"READINESS_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'plan_hash_151d', 'pe_hash_151d', 'EXECUTION_NOT_ENABLED', 'ACTIVATION_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'rd_hash_151d', 'pack_hash_151d')`,
      [activationRdId, JSON.stringify(nonExecution150), JSON.stringify(writeScope150)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd_evidence
       (evidence_id, activation_rd_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '150.0', 'pack_hash_151d', ?, ?)`,
      [
        're_' + activationRdId,
        activationRdId,
        JSON.stringify({ evidence_schema_version: '150.0', write_scope_attestation: writeScope150 }),
        JSON.stringify({
          phase150_activation_rd_id: activationRdId,
          phase149_source_plan_hash: 'plan_hash_d',
          phase148_source_dispatcher_hash: 'dsp_hash_d',
          phase147_source_envelope_hash: 'env_hash_d',
          phase146_source_auth_hash: 'auth_hash_d',
          phase145_source_readiness_hash: 'rd_hash_d',
          phase144_source_approval_hash: 'apv_hash_d',
          phase143_preparation_id: 'prep_test_151d',
          phase142_review_id: 'rev_test_151d',
          phase141_source_simulation_hash: 'sim_hash_d',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_auth
       (activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_auth_status, activation_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_readiness_hash,
        execution_capability_status, activation_execution_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'pln_test_151d', 'dsp_test_151d', 'env_test_151d', 'ath_test_151d', 'rd_test_151d', 'apv_test_151d', 'prep_test_151d', 'rev_test_151d', 'sim_test_151d', 'exec_test_151d', 'cohort_test_151d', 'tenant_test_151d', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_authorization_evaluation":true}', ?, ?, 'rd_hash_151d', 'EXECUTION_NOT_ENABLED', 'AUTHORIZATION_FINALIZED_NOT_EXECUTED', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationAuthId,
        activationRdId,
        JSON.stringify({ authorization_mode: 'ACTIVATION_AUTHORIZATION_ONLY', allow_real_activation: false }),
        JSON.stringify(nonExecution151),
        JSON.stringify(writeScope151)
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 151D: Review Workflow Governance ===\n');

  try {
    const activationRdId = 'rd_151d_1';
    const activationAuthId = 'ard_151d_1';
    await setupReadinessAndAuth(activationRdId, activationAuthId);

    // 1. Finalization blocks before evaluation
    try {
      await decision.finalizeAuthorization(activationAuthId, 'admin');
      assert.fail('Should block finalization when evaluation/decision are not done');
    } catch (e) {
      if (e.message.includes('AUTHORIZATION_EVALUATION_NOT_COMPLETED') || e.message.includes('AUTHORIZATION_DECISION_REQUIRED')) {
        console.log('  PASS: Finalization blocked before evaluation.');
      } else {
        throw e;
      }
    }

    // 2. Evaluate
    await evaluator.evaluateAuthorization(activationAuthId, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true,
      governance_signer_present: true
    }, 'admin');

    // 3. Record decision
    await decision.recordDecision(activationAuthId, 'AUTHORIZED_NOT_ACTIVE', 'Activation authorization check complete.', 'admin');

    // 4. Build evidence
    await evidenceSvc.buildEvidencePack(activationAuthId, 'admin');

    // 5. Finalize
    const { authorization } = await decision.finalizeAuthorization(activationAuthId, 'admin');
    assert.strictEqual(authorization.activation_auth_status, 'FINALIZED');
    assert.strictEqual(authorization.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(authorization.activation_execution_status, 'AUTHORIZATION_FINALIZED_NOT_EXECUTED');
    console.log('  PASS: Activation authorization finalized successfully with safe non-execution markers.');

    // 6. Block modification after finalization
    try {
      await decision.recordDecision(activationAuthId, 'AUTHORIZATION_BLOCKED_BY_GUARDRAIL', 'Change mind', 'admin');
      assert.fail('Should block modifications on finalized authorization');
    } catch (e) {
      if (e.message.includes('AUTHORIZATION_RECORD_ALREADY_FINALIZED')) {
        console.log('  PASS: Modifications blocked on finalized authorization.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 151D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 151D:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
