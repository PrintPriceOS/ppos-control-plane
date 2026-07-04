'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const envelopeBuilder = require('../src/api/services/cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const envelopeEvidenceSvc = require('../src/api/services/cohortInterventionExecutionEnvelopeEvidencePackService').serviceInstance;
const dispatcherBuilder = require('../src/api/services/cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionDispatcherEvaluatorService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionDispatcherEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupEnvelopeAndDispatcher(envelopeId, dispatcherId) {
  const writeScope147 = { writes_only_phase147_tables: true, wrote_phase128_to_146_operational_tables: false };
  const writeScope148 = { writes_only_phase148_tables: true, wrote_phase128_to_147_operational_tables: false };
  const nonExecution147 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution148 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const envelopeRecord = {
    envelope_id: envelopeId,
    source_auth_id: 'ath_test_148e',
    source_readiness_id: 'rd_test_148e',
    source_approval_id: 'apv_test_148e',
    source_prep_id: 'prep_test_148e',
    source_review_id: 'rev_test_148e',
    source_simulation_id: 'sim_test_148e',
    source_execution_id: 'exec_test_148e',
    cohort_id: 'cohort_test_148e',
    tenant_id: 'tenant_test_148e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    envelope_status: 'FINALIZED',
    envelope_result: 'NO_OP_EXECUTED_NOT_MUTATED',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { mode: 'NO_OP', max_cohorts: 0, max_participants: 0 },
    envelope_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    envelope_rules_json: {},
    envelope_blockers_json: {},
    non_execution_attestation_json: nonExecution147,
    write_scope_attestation_json: writeScope147,
    source_auth_hash: 'auth_hash_148e',
    source_auth_evidence_pack_hash: 'ae_hash_148e',
    envelope_result_hash: 'result_hash_148e',
    evidence_pack_hash: 'pack_hash_148e',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    envelope_execution_status: 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING',
    no_op_execution_result: 'NO_OP_EXECUTED_NOT_MUTATED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    job_dispatch_status: 'NO_JOB_DISPATCHED',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    finalized_by: null,
    finalized_at: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  const dispatcherRecord = {
    dispatcher_id: dispatcherId,
    source_envelope_id: envelopeId,
    source_auth_id: 'ath_test_148e',
    source_readiness_id: 'rd_test_148e',
    source_approval_id: 'apv_test_148e',
    source_prep_id: 'prep_test_148e',
    source_review_id: 'rev_test_148e',
    source_simulation_id: 'sim_test_148e',
    source_execution_id: 'exec_test_148e',
    cohort_id: 'cohort_test_148e',
    tenant_id: 'tenant_test_148e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    dispatcher_status: 'DRAFT',
    dispatcher_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { mode: 'DRY_RUN', allow_real_job_creation: false },
    dispatcher_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    dispatcher_rules_json: {},
    dispatcher_blockers_json: { missing_dispatcher_evaluation: true },
    non_execution_attestation_json: nonExecution148,
    write_scope_attestation_json: writeScope148,
    source_envelope_hash: 'result_hash_148e',
    source_envelope_evidence_pack_hash: 'pack_hash_148e',
    dispatcher_result_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    dispatcher_execution_status: 'DRY_RUN_ACTIVE_NOT_MUTATING',
    dry_run_execution_result: 'DRY_RUN_EXECUTED_NOT_MUTATED',
    queue_dispatch_status: 'SIMULATED_ONLY',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    job_creation_status: 'NO_REAL_JOB_CREATED',
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
    envelopeBuilder._mockState.envelope.set(envelopeId, envelopeRecord);
    envelopeEvidenceSvc._mockState.evidence.set(envelopeId, {
      evidence_pack_hash: 'pack_hash_148e',
      evidence_payload_json: { evidence_schema_version: '147.0', write_scope_attestation: writeScope147 },
      lineage_hash_chain_json: {
        phase147_envelope_id: envelopeId,
        phase146_source_auth_hash: 'auth_hash_e',
        phase145_source_readiness_hash: 'rd_hash_148e',
        phase144_source_approval_hash: 'apv_hash_148e',
        phase143_preparation_id: 'prep_test_148e',
        phase142_review_id: 'rev_test_148e',
        phase141_source_simulation_hash: 'sim_hash_e',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    dispatcherBuilder._mockState.dispatcher.set(dispatcherId, dispatcherRecord);
    dispatcherBuilder._mockState.rules.set(dispatcherId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_envelope_rules WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_envelope_evidence WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_no_op_envelope WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_dispatcher_rules WHERE dispatcher_id = ?', [dispatcherId]);
    await db.query('DELETE FROM cb_cohort_intervention_dispatcher_evidence WHERE dispatcher_id = ?', [dispatcherId]);
    await db.query('DELETE FROM cb_cohort_intervention_dry_run_dispatcher WHERE dispatcher_id = ?', [dispatcherId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_no_op_envelope
       (envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        envelope_status, envelope_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, envelope_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        envelope_rules_json, envelope_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_auth_hash, source_auth_evidence_pack_hash,
        execution_capability_status, envelope_execution_status, no_op_execution_result, runtime_mutation_status, job_dispatch_status, envelope_result_hash, evidence_pack_hash)
       VALUES (?, 'ath_test_148e', 'rd_test_148e', 'apv_test_148e', 'prep_test_148e', 'rev_test_148e', 'sim_test_148e', 'exec_test_148e', 'cohort_test_148e', 'tenant_test_148e', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'NO_OP_EXECUTED_NOT_MUTATED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"mode":"NO_OP", "max_cohorts":0, "max_participants":0}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'auth_hash_148e', 'ae_hash_148e', 'EXECUTION_NOT_ENABLED', 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING', 'NO_OP_EXECUTED_NOT_MUTATED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_JOB_DISPATCHED', 'result_hash_148e', 'pack_hash_148e')`,
      [envelopeId, JSON.stringify(nonExecution147), JSON.stringify(writeScope147)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_envelope_evidence
       (evidence_id, envelope_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '147.0', 'pack_hash_148e', ?, ?)`,
      [
        'ee_' + envelopeId,
        envelopeId,
        JSON.stringify({ evidence_schema_version: '147.0', write_scope_attestation: writeScope147 }),
        JSON.stringify({
          phase147_envelope_id: envelopeId,
          phase146_source_auth_hash: 'auth_hash_e',
          phase145_source_readiness_hash: 'rd_hash_148e',
          phase144_source_approval_hash: 'apv_hash_148e',
          phase143_preparation_id: 'prep_test_148e',
          phase142_review_id: 'rev_test_148e',
          phase141_source_simulation_hash: 'sim_hash_e',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_dry_run_dispatcher
       (dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        dispatcher_status, dispatcher_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, dispatcher_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        dispatcher_rules_json, dispatcher_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_envelope_hash, source_envelope_evidence_pack_hash,
        execution_capability_status, dispatcher_execution_status, dry_run_execution_result, queue_dispatch_status, runtime_mutation_status, job_creation_status)
       VALUES (?, ?, 'ath_test_148e', 'rd_test_148e', 'apv_test_148e', 'prep_test_148e', 'rev_test_148e', 'sim_test_148e', 'exec_test_148e', 'cohort_test_148e', 'tenant_test_148e', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', '{"dispatch_mode":"DRY_RUN_ONLY", "queue_dispatch_mode":"SIMULATED_ONLY", "allow_real_job_creation":false, "max_runtime_mutations":0}', '{}', '{}', '{}', '{}', '{}', '{"missing_dispatcher_evaluation":true}', ?, ?, 'result_hash_148e', 'pack_hash_148e', 'EXECUTION_NOT_ENABLED', 'DRY_RUN_ACTIVE_NOT_MUTATING', 'DRY_RUN_EXECUTED_NOT_MUTATED', 'SIMULATED_ONLY', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_REAL_JOB_CREATED')`,
      [dispatcherId, envelopeId, JSON.stringify(nonExecution148), JSON.stringify(writeScope148)]
    );
  }
}

(async () => {
  console.log('=== Smoke 148E: Evidence Pack Builder & Lineage ===\n');

  try {
    const envelopeId = 'env_148e_1';
    const dispatcherId = 'dsp_148e_1';
    await setupEnvelopeAndDispatcher(envelopeId, dispatcherId);

    // Evaluate
    await evaluator.evaluateDispatcher(dispatcherId, {
      operator_confirmed: true,
      kill_switch_verified: true
    }, 'admin');

    // Create rules with secret description
    const sensitiveRule = {
      rule_id: 'rul_sensitive_e',
      dispatcher_id: dispatcherId,
      check_type: 'SAFETY_ATTENUATION',
      severity: 'INFO',
      description: 'System validation completed: security@printprice.com with env_token:auth_token_987654'
    };
    if (!isProdLike) {
      dispatcherBuilder._mockState.rules.set(dispatcherId, [sensitiveRule]);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_dispatcher_rules
         (rule_id, dispatcher_id, check_type, severity, description)
         VALUES (?, ?, ?, ?, ?)`,
        [sensitiveRule.rule_id, dispatcherId, sensitiveRule.check_type, sensitiveRule.severity, sensitiveRule.description]
      );
    }

    // Build evidence pack
    const runRes = await evidenceSvc.buildEvidencePack(dispatcherId, 'admin');
    const { evidence_pack_hash, lineage_hash_chain } = runRes;
    assert.ok(evidence_pack_hash);

    const evidenceRecord = await evidenceSvc.getEvidence(dispatcherId);
    assert.ok(evidenceRecord);

    const payload = typeof evidenceRecord.evidence_payload_json === 'string'
      ? JSON.parse(evidenceRecord.evidence_payload_json)
      : evidenceRecord.evidence_payload_json;

    // Verify v148.0 schema version
    assert.strictEqual(payload.evidence_schema_version, '148.0');
    console.log('  PASS: Evidence schema version is 148.0.');

    // Verify sensitive data is redacted
    const stringified = JSON.stringify(payload);
    assert.ok(!stringified.includes('security@printprice.com'), 'Email must be redacted');
    assert.ok(!stringified.includes('auth_token_987654'), 'API key must be redacted');
    assert.ok(stringified.includes('[REDACTED_EMAIL]'), 'Redaction placeholder must be present');
    console.log('  PASS: Sensitive details redacted correctly.');

    // Verify lineage chain
    assert.strictEqual(lineage_hash_chain.phase148_dispatcher_id, dispatcherId);
    assert.strictEqual(lineage_hash_chain.phase147_source_envelope_hash, 'result_hash_148e');
    assert.strictEqual(lineage_hash_chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 148E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 148E:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
