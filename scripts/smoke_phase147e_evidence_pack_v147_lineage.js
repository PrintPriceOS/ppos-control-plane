'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const authBuilder = require('../src/api/services/cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const authEvidenceSvc = require('../src/api/services/cohortInterventionExecutionAuthorizationEvidencePackService').serviceInstance;
const envelopeBuilder = require('../src/api/services/cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionEnvelopeEvaluatorService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionEnvelopeEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupAuthAndEnvelope(authId, envelopeId) {
  const writeScope = { writes_only_phase146_tables: true, wrote_phase128_to_145_operational_tables: false };
  const writeScope147 = { writes_only_phase147_tables: true, wrote_phase128_to_146_operational_tables: false };
  const nonExecution147 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const authRecord = {
    auth_id: authId,
    source_readiness_id: 'rd_test_147e',
    source_approval_id: 'apv_test_147e',
    source_prep_id: 'prep_test_147e',
    source_review_id: 'rev_test_147e',
    source_simulation_id: 'sim_test_147e',
    source_execution_id: 'exec_test_147e',
    cohort_id: 'cohort_test_147e',
    tenant_id: 'tenant_test_147e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    auth_status: 'FINALIZED',
    auth_decision: 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    approved_by: null,
    finalized_by: null,
    canary_envelope_json: { max_cohorts: 0, max_participants: 0 },
    auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    auth_rules_json: {},
    auth_blockers_json: {},
    non_execution_attestation_json: {},
    source_readiness_hash: 'rd_hash_147e',
    source_readiness_evidence_pack_hash: 're_hash_147e',
    auth_result_hash: 'result_hash_147e',
    evidence_pack_hash: 'pack_hash_147e',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_authorization_status: 'EXECUTION_AUTHORIZED_NOT_ACTIVE',
    auth_execution_status: 'AUTHORIZATION_APPROVED_NOT_EXECUTED',
    created_at: new Date(),
    updated_at: new Date()
  };

  const envelopeRecord = {
    envelope_id: envelopeId,
    source_auth_id: authId,
    source_readiness_id: 'rd_test_147e',
    source_approval_id: 'apv_test_147e',
    source_prep_id: 'prep_test_147e',
    source_review_id: 'rev_test_147e',
    source_simulation_id: 'sim_test_147e',
    source_execution_id: 'exec_test_147e',
    cohort_id: 'cohort_test_147e',
    tenant_id: 'tenant_test_147e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    envelope_status: 'DRAFT',
    envelope_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { mode: 'NO_OP', max_cohorts: 0, max_participants: 0 },
    envelope_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    envelope_rules_json: {},
    envelope_blockers_json: { missing_envelope_evaluation: true },
    non_execution_attestation_json: nonExecution147,
    write_scope_attestation_json: writeScope147,
    source_auth_hash: 'result_hash_147e',
    source_auth_evidence_pack_hash: 'pack_hash_147e',
    envelope_result_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
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

  if (!isProdLike) {
    authBuilder._mockState.auth.set(authId, authRecord);
    authEvidenceSvc._mockState.evidence.set(authId, {
      evidence_pack_hash: 'pack_hash_147e',
      evidence_payload_json: { evidence_schema_version: '146.0', write_scope_attestation: writeScope },
      lineage_hash_chain_json: {
        phase146_auth_id: authId,
        phase145_source_readiness_hash: 'rd_hash_147e',
        phase144_source_approval_hash: 'apv_hash_147e',
        phase143_preparation_id: 'prep_test_147e',
        phase142_review_id: 'rev_test_147e',
        phase141_source_simulation_hash: 'sim_hash_e',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    envelopeBuilder._mockState.envelope.set(envelopeId, envelopeRecord);
    envelopeBuilder._mockState.rules.set(envelopeId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_evidence WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_rules WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_envelope_rules WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_envelope_evidence WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_no_op_envelope WHERE envelope_id = ?', [envelopeId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_auth
       (auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        auth_status, auth_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_readiness_hash, source_readiness_evidence_pack_hash,
        execution_capability_status, execution_authorization_status, auth_execution_status, auth_result_hash, evidence_pack_hash)
       VALUES (?, 'rd_test_147e', 'apv_test_147e', 'prep_test_147e', 'rev_test_147e', 'sim_test_147e', 'exec_test_147e', 'cohort_test_147e', 'tenant_test_147e', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"max_cohorts":0, "max_participants":0}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', ?, 'rd_hash_147e', 're_hash_147e', 'EXECUTION_NOT_ENABLED', 'EXECUTION_AUTHORIZED_NOT_ACTIVE', 'AUTHORIZATION_APPROVED_NOT_EXECUTED', 'result_hash_147e', 'pack_hash_147e')`,
      [authId, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_auth_evidence
       (evidence_id, auth_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '146.0', 'pack_hash_147e', ?, ?)`,
      [
        'ae_' + authId,
        authId,
        JSON.stringify({ evidence_schema_version: '146.0', write_scope_attestation: writeScope }),
        JSON.stringify({
          phase146_auth_id: authId,
          phase145_source_readiness_hash: 'rd_hash_147e',
          phase144_source_approval_hash: 'apv_hash_147e',
          phase143_preparation_id: 'prep_test_147e',
          phase142_review_id: 'rev_test_147e',
          phase141_source_simulation_hash: 'sim_hash_e',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_no_op_envelope
       (envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        envelope_status, envelope_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, envelope_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        envelope_rules_json, envelope_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_auth_hash, source_auth_evidence_pack_hash,
        execution_capability_status, envelope_execution_status, no_op_execution_result, runtime_mutation_status, job_dispatch_status)
       VALUES (?, ?, 'rd_test_147e', 'apv_test_147e', 'prep_test_147e', 'rev_test_147e', 'sim_test_147e', 'exec_test_147e', 'cohort_test_147e', 'tenant_test_147e', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', '{"mode":"NO_OP", "max_cohorts":0, "max_participants":0}', '{}', '{}', '{}', '{}', '{}', '{"missing_envelope_evaluation":true}', ?, ?, 'result_hash_147e', 'pack_hash_147e', 'EXECUTION_NOT_ENABLED', 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING', 'NO_OP_EXECUTED_NOT_MUTATED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_JOB_DISPATCHED')`,
      [envelopeId, authId, JSON.stringify(nonExecution147), JSON.stringify(writeScope147)]
    );
  }
}

(async () => {
  console.log('=== Smoke 147E: Evidence Pack Builder & Lineage ===\n');

  try {
    const authId = 'ath_147e_1';
    const envelopeId = 'env_147e_1';
    await setupAuthAndEnvelope(authId, envelopeId);

    // Evaluate
    await evaluator.evaluateEnvelope(envelopeId, {
      operator_confirmed: true,
      kill_switch_verified: true
    }, 'admin');

    // Create rules with secret description
    const sensitiveRule = {
      rule_id: 'rul_sensitive_e',
      envelope_id: envelopeId,
      check_type: 'SAFETY_ATTENUATION',
      severity: 'INFO',
      description: 'System validation completed: security@printprice.com with env_token:auth_token_987654'
    };
    if (!isProdLike) {
      envelopeBuilder._mockState.rules.set(envelopeId, [sensitiveRule]);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_envelope_rules
         (rule_id, envelope_id, check_type, severity, description)
         VALUES (?, ?, ?, ?, ?)`,
        [sensitiveRule.rule_id, envelopeId, sensitiveRule.check_type, sensitiveRule.severity, sensitiveRule.description]
      );
    }

    // Build evidence pack
    const runRes = await evidenceSvc.buildEvidencePack(envelopeId, 'admin');
    const { evidence_pack_hash, lineage_hash_chain } = runRes;
    assert.ok(evidence_pack_hash);

    const evidenceRecord = await evidenceSvc.getEvidence(envelopeId);
    assert.ok(evidenceRecord);

    const payload = typeof evidenceRecord.evidence_payload_json === 'string'
      ? JSON.parse(evidenceRecord.evidence_payload_json)
      : evidenceRecord.evidence_payload_json;

    // Verify v147.0 schema version
    assert.strictEqual(payload.evidence_schema_version, '147.0');
    console.log('  PASS: Evidence schema version is 147.0.');

    // Verify sensitive data is redacted
    const stringified = JSON.stringify(payload);
    assert.ok(!stringified.includes('security@printprice.com'), 'Email must be redacted');
    assert.ok(!stringified.includes('auth_token_987654'), 'API key must be redacted');
    assert.ok(stringified.includes('[REDACTED_EMAIL]'), 'Redaction placeholder must be present');
    console.log('  PASS: Sensitive details redacted correctly.');

    // Verify lineage chain
    assert.strictEqual(lineage_hash_chain.phase147_envelope_id, envelopeId);
    assert.strictEqual(lineage_hash_chain.phase146_source_auth_hash, 'result_hash_147e');
    assert.strictEqual(lineage_hash_chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 147E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 147E:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
