'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const planBuilder = require('../src/api/services/cohortInterventionExecutionPlanBuilderService').serviceInstance;
const planEvidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanEvidencePackService').serviceInstance;
const rdBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessEvaluatorService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupPlanAndReadiness(planId, activationRdId) {
  const writeScope149 = { writes_only_phase149_tables: true, wrote_phase128_to_148_operational_tables: false };
  const writeScope150 = { writes_only_phase150_tables: true, wrote_phase128_to_149_operational_tables: false };
  const nonExecution149 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution150 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const planRecord = {
    plan_id: planId,
    source_dispatcher_id: 'dsp_test_150e',
    source_envelope_id: 'env_test_150e',
    source_auth_id: 'ath_test_150e',
    source_readiness_id: 'rd_test_150e',
    source_approval_id: 'apv_test_150e',
    source_prep_id: 'prep_test_150e',
    source_review_id: 'rev_test_150e',
    source_simulation_id: 'sim_test_150e',
    source_execution_id: 'exec_test_150e',
    cohort_id: 'cohort_test_150e',
    tenant_id: 'tenant_test_150e',
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
    source_dispatcher_hash: 'dsp_hash_150e',
    source_dispatcher_evidence_pack_hash: 'de_hash_150e',
    plan_materialization_hash: 'plan_hash_150e',
    evidence_pack_hash: 'pack_hash_150e',
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
    source_dispatcher_id: 'dsp_test_150e',
    source_envelope_id: 'env_test_150e',
    source_auth_id: 'ath_test_150e',
    source_readiness_id: 'rd_test_150e',
    source_approval_id: 'apv_test_150e',
    source_prep_id: 'prep_test_150e',
    source_review_id: 'rev_test_150e',
    source_simulation_id: 'sim_test_150e',
    source_execution_id: 'exec_test_150e',
    cohort_id: 'cohort_test_150e',
    tenant_id: 'tenant_test_150e',
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
    source_plan_hash: 'plan_hash_150e',
    source_plan_evidence_pack_hash: 'pack_hash_150e',
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
      evidence_pack_hash: 'pack_hash_150e',
      evidence_payload_json: { evidence_schema_version: '149.0', write_scope_attestation: writeScope149 },
      lineage_hash_chain_json: {
        phase149_plan_id: planId,
        phase148_source_dispatcher_hash: 'dsp_hash_e',
        phase147_source_envelope_hash: 'env_hash_e',
        phase146_source_auth_hash: 'auth_hash_e',
        phase145_source_readiness_hash: 'rd_hash_150e',
        phase144_source_approval_hash: 'apv_hash_150e',
        phase143_preparation_id: 'prep_test_150e',
        phase142_review_id: 'rev_test_150e',
        phase141_source_simulation_hash: 'sim_hash_e',
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
       VALUES (?, 'dsp_test_150e', 'env_test_150e', 'ath_test_150e', 'rd_test_150e', 'apv_test_150e', 'prep_test_150e', 'rev_test_150e', 'sim_test_150e', 'exec_test_150e', 'cohort_test_150e', 'tenant_test_150e', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'PLAN_MATERIALIZED_NOT_EXECUTED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"plan_mode":"MATERIALIZED_NOT_EXECUTABLE", "allow_real_execution":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'dsp_hash_150e', 'de_hash_150e', 'EXECUTION_NOT_ENABLED', 'MATERIALIZED_NOT_EXECUTABLE', 'PLAN_MATERIALIZED_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'plan_hash_150e', 'pack_hash_150e')`,
      [planId, JSON.stringify(nonExecution149), JSON.stringify(writeScope149)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_plan_evidence
       (evidence_id, plan_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '149.0', 'pack_hash_150e', ?, ?)`,
      [
        'pe_' + planId,
        planId,
        JSON.stringify({ evidence_schema_version: '149.0', write_scope_attestation: writeScope149 }),
        JSON.stringify({
          phase149_plan_id: planId,
          phase148_source_dispatcher_hash: 'dsp_hash_e',
          phase147_source_envelope_hash: 'env_hash_e',
          phase146_source_auth_hash: 'auth_hash_e',
          phase145_source_readiness_hash: 'rd_hash_150e',
          phase144_source_approval_hash: 'apv_hash_150e',
          phase143_preparation_id: 'prep_test_150e',
          phase142_review_id: 'rev_test_150e',
          phase141_source_simulation_hash: 'sim_hash_e',
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
       VALUES (?, ?, 'dsp_test_150e', 'env_test_150e', 'ath_test_150e', 'rd_test_150e', 'apv_test_150e', 'prep_test_150e', 'rev_test_150e', 'sim_test_150e', 'exec_test_150e', 'cohort_test_150e', 'tenant_test_150e', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', '{"activation_mode":"READINESS_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{"missing_readiness_evaluation":true}', ?, ?, 'plan_hash_150e', 'pack_hash_150e', 'EXECUTION_NOT_ENABLED', 'ACTIVATION_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [activationRdId, planId, JSON.stringify(nonExecution150), JSON.stringify(writeScope150)]
    );
  }
}

(async () => {
  console.log('=== Smoke 150E: Evidence Pack Builder & Lineage ===\n');

  try {
    const planId = 'pln_150e_1';
    const activationRdId = 'ard_150e_1';
    await setupPlanAndReadiness(planId, activationRdId);

    // Evaluate
    await evaluator.evaluateReadiness(activationRdId, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    // Create rules with secret description
    const sensitiveRule = {
      rule_id: 'rul_sensitive_e',
      activation_rd_id: activationRdId,
      check_type: 'SAFETY_ATTENUATION',
      severity: 'INFO',
      description: 'System validation completed: security@printprice.com with env_token:auth_token_987654'
    };
    if (!isProdLike) {
      rdBuilder._mockState.rules.set(activationRdId, [sensitiveRule]);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_rd_rules
         (rule_id, activation_rd_id, check_type, severity, description)
         VALUES (?, ?, ?, ?, ?)`,
        [sensitiveRule.rule_id, activationRdId, sensitiveRule.check_type, sensitiveRule.severity, sensitiveRule.description]
      );
    }

    // Build evidence pack
    const runRes = await evidenceSvc.buildEvidencePack(activationRdId, 'admin');
    const { evidence_pack_hash, lineage_hash_chain } = runRes;
    assert.ok(evidence_pack_hash);

    const evidenceRecord = await evidenceSvc.getEvidence(activationRdId);
    assert.ok(evidenceRecord);

    const payload = typeof evidenceRecord.evidence_payload_json === 'string'
      ? JSON.parse(evidenceRecord.evidence_payload_json)
      : evidenceRecord.evidence_payload_json;

    // Verify v150.0 schema version
    assert.strictEqual(payload.evidence_schema_version, '150.0');
    console.log('  PASS: Evidence schema version is 150.0.');

    // Verify sensitive data is redacted
    const stringified = JSON.stringify(payload);
    assert.ok(!stringified.includes('security@printprice.com'), 'Email must be redacted');
    assert.ok(!stringified.includes('auth_token_987654'), 'API key must be redacted');
    assert.ok(stringified.includes('[REDACTED_EMAIL]'), 'Redaction placeholder must be present');
    console.log('  PASS: Sensitive details redacted correctly.');

    // Verify lineage chain
    assert.strictEqual(lineage_hash_chain.phase150_activation_rd_id, activationRdId);
    assert.strictEqual(lineage_hash_chain.phase149_source_plan_hash, 'plan_hash_150e');
    assert.strictEqual(lineage_hash_chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 150E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 150E:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
