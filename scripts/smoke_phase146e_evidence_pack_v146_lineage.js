'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionReadinessBuilderService').serviceInstance;
const readinessEvidenceSvc = require('../src/api/services/cohortInterventionExecutionReadinessEvidencePackService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionAuthorizationEvaluatorService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionAuthorizationEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReadinessAndAuth(readinessId, authId) {
  const writeScope = { writes_only_phase145_tables: true, wrote_phase128_to_144_operational_tables: false };
  const writeScope146 = { writes_only_phase146_tables: true, wrote_phase128_to_145_operational_tables: false };
  const nonExecution146 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const readinessRecord = {
    readiness_id: readinessId,
    source_approval_id: 'apv_test_146e',
    source_prep_id: 'prep_test_146e',
    source_review_id: 'rev_test_146e',
    source_simulation_id: 'sim_test_146e',
    source_execution_id: 'exec_test_146e',
    cohort_id: 'cohort_test_146e',
    tenant_id: 'tenant_test_146e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    readiness_status: 'FINALIZED',
    readiness_decision: 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    kill_switch_status: 'PASS',
    rollback_authority_status: 'PASS',
    readiness_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    readiness_checks_json: {},
    readiness_blockers_json: {},
    non_execution_attestation_json: {},
    source_approval_hash: 'apv_hash_146e',
    source_approval_evidence_pack_hash: 'ae_hash_146e',
    readiness_result_hash: 'result_hash_146e',
    evidence_pack_hash: 'pack_hash_146e',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_readiness_status: 'EXECUTION_READY_NOT_ACTIVE',
    readiness_execution_status: 'READINESS_APPROVED_NOT_EXECUTED',
    created_at: new Date(),
    updated_at: new Date()
  };

  const authRecord = {
    auth_id: authId,
    source_readiness_id: readinessId,
    source_approval_id: 'apv_test_146e',
    source_prep_id: 'prep_test_146e',
    source_review_id: 'rev_test_146e',
    source_simulation_id: 'sim_test_146e',
    source_execution_id: 'exec_test_146e',
    cohort_id: 'cohort_test_146e',
    tenant_id: 'tenant_test_146e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    auth_status: 'DRAFT',
    auth_decision: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { max_cohorts: 0, max_participants: 0 },
    auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    auth_rules_json: {},
    auth_blockers_json: { missing_authorization_evaluation: true },
    non_execution_attestation_json: nonExecution146,
    write_scope_attestation_json: writeScope146,
    source_readiness_hash: 'result_hash_146e',
    source_readiness_evidence_pack_hash: 'pack_hash_146e',
    auth_result_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_authorization_status: 'EXECUTION_AUTHORIZED_NOT_ACTIVE',
    auth_execution_status: 'AUTHORIZATION_APPROVED_NOT_EXECUTED',
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
    readinessBuilder._mockState.readiness.set(readinessId, readinessRecord);
    readinessEvidenceSvc._mockState.evidence.set(readinessId, {
      evidence_pack_hash: 'pack_hash_146e',
      evidence_payload_json: { evidence_schema_version: '145.0', write_scope_attestation: writeScope },
      lineage_hash_chain_json: {
        phase145_readiness_id: readinessId,
        phase144_source_approval_hash: 'apv_hash_146e',
        phase143_preparation_id: 'prep_test_146e',
        phase142_review_id: 'rev_test_146e',
        phase141_source_simulation_hash: 'sim_hash_e',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    authBuilder._mockState.auth.set(authId, authRecord);
    authBuilder._mockState.rules.set(authId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_exec_ready_evidence WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_ready_checks WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_readiness WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_rules WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_evidence WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth WHERE auth_id = ?', [authId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_readiness
       (readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        readiness_status, readiness_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, kill_switch_status, rollback_authority_status, readiness_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, readiness_checks_json, readiness_blockers_json, non_execution_attestation_json, write_scope_attestation_json,
        source_approval_hash, source_approval_evidence_pack_hash, execution_capability_status, execution_readiness_status, readiness_execution_status, readiness_result_hash, evidence_pack_hash)
       VALUES (?, 'apv_test_146e', 'prep_test_146e', 'rev_test_146e', 'sim_test_146e', 'exec_test_146e', 'cohort_test_146e', 'tenant_test_146e', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', 'PASS', 'PASS', '{}', '{}', '{}', '{}', '{}', '{}', '{}', ?, 'apv_hash_146e', 'ae_hash_146e', 'EXECUTION_NOT_ENABLED', 'EXECUTION_READY_NOT_ACTIVE', 'READINESS_APPROVED_NOT_EXECUTED', 'result_hash_146e', 'pack_hash_146e')`,
      [readinessId, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_ready_evidence
       (evidence_id, readiness_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '145.0', 'pack_hash_146e', ?, ?)`,
      [
        're_' + readinessId,
        readinessId,
        JSON.stringify({ evidence_schema_version: '145.0', write_scope_attestation: writeScope }),
        JSON.stringify({
          phase145_readiness_id: readinessId,
          phase144_source_approval_hash: 'apv_hash_146e',
          phase143_preparation_id: 'prep_test_146e',
          phase142_review_id: 'rev_test_146e',
          phase141_source_simulation_hash: 'sim_hash_e',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_auth
       (auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        auth_status, auth_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_readiness_hash, source_readiness_evidence_pack_hash,
        execution_capability_status, execution_authorization_status, auth_execution_status)
       VALUES (?, ?, 'apv_test_146e', 'prep_test_146e', 'rev_test_146e', 'sim_test_146e', 'exec_test_146e', 'cohort_test_146e', 'tenant_test_146e', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', '{"max_cohorts":0, "max_participants":0}', '{}', '{}', '{}', '{}', '{}', '{"missing_authorization_evaluation":true}', ?, ?, 'result_hash_146e', 'pack_hash_146e', 'EXECUTION_NOT_ENABLED', 'EXECUTION_AUTHORIZED_NOT_ACTIVE', 'AUTHORIZATION_APPROVED_NOT_EXECUTED')`,
      [authId, readinessId, JSON.stringify(nonExecution146), JSON.stringify(writeScope146)]
    );
  }
}

(async () => {
  console.log('=== Smoke 146E: Evidence Pack Builder & Lineage ===\n');

  try {
    const readinessId = 'rd_146e_1';
    const authId = 'ath_146e_1';
    await setupReadinessAndAuth(readinessId, authId);

    // Evaluate
    await evaluator.evaluateAuth(authId, {
      operator_present: true,
      confirmation_phrase_present: true
    }, 'admin');

    // Create rules with secret description
    const sensitiveRule = {
      rule_id: 'rul_sensitive_e',
      auth_id: authId,
      check_type: 'OPERATOR_VERIFICATION',
      severity: 'INFO',
      description: 'Operator confirmation code: security@printprice.com with auth_token:op_token_123456'
    };
    if (!isProdLike) {
      authBuilder._mockState.rules.set(authId, [sensitiveRule]);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_exec_auth_rules
         (rule_id, auth_id, check_type, severity, description)
         VALUES (?, ?, ?, ?, ?)`,
        [sensitiveRule.rule_id, authId, sensitiveRule.check_type, sensitiveRule.severity, sensitiveRule.description]
      );
    }

    // Build evidence pack
    const runRes = await evidenceSvc.buildEvidencePack(authId, 'admin');
    const { evidence_pack_hash, lineage_hash_chain } = runRes;
    assert.ok(evidence_pack_hash);

    const evidenceRecord = await evidenceSvc.getEvidence(authId);
    assert.ok(evidenceRecord);

    const payload = typeof evidenceRecord.evidence_payload_json === 'string'
      ? JSON.parse(evidenceRecord.evidence_payload_json)
      : evidenceRecord.evidence_payload_json;

    // Verify v146.0 schema version
    assert.strictEqual(payload.evidence_schema_version, '146.0');
    console.log('  PASS: Evidence schema version is 146.0.');

    // Verify sensitive data is redacted
    const stringified = JSON.stringify(payload);
    assert.ok(!stringified.includes('security@printprice.com'), 'Email must be redacted');
    assert.ok(!stringified.includes('op_token_123456'), 'API key must be redacted');
    assert.ok(stringified.includes('[REDACTED_EMAIL]'), 'Redaction placeholder must be present');
    console.log('  PASS: Sensitive details redacted correctly.');

    // Verify lineage chain
    assert.strictEqual(lineage_hash_chain.phase146_auth_id, authId);
    assert.strictEqual(lineage_hash_chain.phase145_source_readiness_hash, 'result_hash_146e');
    assert.strictEqual(lineage_hash_chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 146E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 146E:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
