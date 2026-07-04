'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const prepBuilder = require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService');
const prepEvidence = require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvidencePackService');
const approvalBuilder = require('../src/api/services/cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalBuilderService');
const evaluator = require('../src/api/services/cohortInterventionSimulationApprovalEvaluatorService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalEvaluatorService');
const evidenceSvc = require('../src/api/services/cohortInterventionSimulationApprovalEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalEvidencePackService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupPrepAndApproval(prepId, approvalId) {
  const writeScope = { writes_only_phase143_tables: true, wrote_phase128_to_142_operational_tables: false };
  const writeScope144 = { writes_only_phase144_tables: true, wrote_phase128_to_143_operational_tables: false };
  const prepRecord = {
    prep_id: prepId,
    source_review_id: 'rev_test_e',
    source_simulation_id: 'sim_test_e',
    source_execution_id: 'exec_test_e',
    cohort_id: 'cohort_test_e',
    tenant_id: 'tenant_test_e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    prep_status: 'FINALIZED',
    prep_outcome: 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    prepared_by: null,
    finalized_by: null,
    prep_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    approval_readiness_json: {},
    prep_blockers_json: {},
    non_execution_attestation_json: {},
    source_review_hash: 'review_hash_e',
    source_review_evidence_pack_hash: 'ev_hash_e',
    prep_result_hash: 'result_hash_e',
    evidence_pack_hash: 'pack_hash_e',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY',
    created_at: new Date(),
    updated_at: new Date()
  };

  const approvalRecord = {
    approval_id: approvalId,
    source_prep_id: prepId,
    source_review_id: 'rev_test_e',
    source_simulation_id: 'sim_test_e',
    source_execution_id: 'exec_test_e',
    cohort_id: 'cohort_test_e',
    tenant_id: 'tenant_test_e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    approval_status: 'DRAFT',
    approval_decision: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: null,
    rollback_feasibility_score: null,
    evidence_completeness_score: null,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    approved_by: null,
    finalized_by: null,
    approval_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope144,
    approval_readiness_json: {},
    approval_blockers_json: { missing_evaluation: true },
    non_execution_attestation_json: {},
    source_prep_hash: 'result_hash_e',
    source_prep_evidence_pack_hash: 'pack_hash_e',
    approval_result_hash: null,
    evidence_pack_hash: null,
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED',
    future_execution_eligibility_status: 'NOT_ELIGIBLE',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    prepBuilder._mockState.preps.set(prepId, prepRecord);
    prepEvidence._mockState.evidence.set(prepId, {
      evidence_pack_hash: 'pack_hash_e',
      evidence_payload_json: { evidence_schema_version: '143.0', write_scope_attestation: writeScope },
      lineage_hash_chain_json: {
        phase143_preparation_id: prepId,
        phase142_review_id: 'rev_test_e',
        phase141_source_simulation_hash: 'hash_e',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    approvalBuilder._mockState.approvals.set(approvalId, approvalRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_evidence WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_findings WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_preps WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approval_findings WHERE approval_id = ?', [approvalId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approval_evidence WHERE approval_id = ?', [approvalId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approvals WHERE approval_id = ?', [approvalId]);

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_app_preps
       (prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        prep_status, prep_outcome, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, prep_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        prep_blockers_json, non_execution_attestation_json, source_review_hash, source_review_evidence_pack_hash,
        prep_result_hash, evidence_pack_hash, execution_capability_status, approval_execution_status)
       VALUES (?, 'rev_test_e', 'sim_test_e', 'exec_test_e', 'cohort_test_e', 'tenant_test_e', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'review_hash_e', 'ev_hash_e', 'result_hash_e', 'pack_hash_e', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY')`,
      [prepId, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_app_prep_evidence
       (evidence_id, prep_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '143.0', 'pack_hash_e', ?, ?)`,
      [
        'pe_' + prepId,
        prepId,
        JSON.stringify({ evidence_schema_version: '143.0', write_scope_attestation: writeScope }),
        JSON.stringify({
          phase143_preparation_id: prepId,
          phase142_review_id: 'rev_test_e',
          phase141_source_simulation_hash: 'hash_e',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_approvals
       (approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        approval_status, approval_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, approval_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        approval_blockers_json, non_execution_attestation_json, source_prep_hash, source_prep_evidence_pack_hash,
        execution_capability_status, approval_execution_status, future_execution_eligibility_status)
       VALUES (?, ?, 'rev_test_e', 'sim_test_e', 'exec_test_e', 'cohort_test_e', 'tenant_test_e', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', NULL, NULL, NULL, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{"missing_evaluation":true}', '{}', 'result_hash_e', 'pack_hash_e', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED', 'NOT_ELIGIBLE')`,
      [approvalId, prepId, JSON.stringify(writeScope144)]
    );
  }
}

(async () => {
  console.log('=== Smoke 144E: Evidence Pack Builder & Lineage ===\n');

  try {
    const prepId = 'prep_e_1';
    const approvalId = 'apv_e_1';
    await setupPrepAndApproval(prepId, approvalId);

    // Evaluate approval
    await evaluator.evaluateApproval(approvalId, 'admin');

    // Inject sensitive data finding to test redaction
    const sensitiveFinding = {
      finding_id: 'finding_test_e4',
      approval_id: approvalId,
      finding_type: 'SECURITY_CHECK',
      severity: 'INFO',
      description: 'Mock finding with sensitive data: admin@printprice.com and secret:secret_123456',
      created_at: new Date()
    };
    if (!isProdLike) {
      approvalBuilder._mockState.findings.set(approvalId, [sensitiveFinding]);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_approval_findings
         (finding_id, approval_id, finding_type, severity, description)
         VALUES (?, ?, ?, ?, ?)`,
        [sensitiveFinding.finding_id, approvalId, sensitiveFinding.finding_type, sensitiveFinding.severity, sensitiveFinding.description]
      );
    }

    // Build evidence pack
    const runRes = await evidenceSvc.buildEvidencePack(approvalId, 'admin');
    const { evidence_pack_hash, lineage_hash_chain } = runRes;
    assert.ok(evidence_pack_hash, 'Evidence pack hash must be returned');

    // Retrieve evidence payload
    const evidenceRecord = await evidenceSvc.getEvidence(approvalId);
    assert.ok(evidenceRecord, 'Evidence record must exist');
    const payload = typeof evidenceRecord.evidence_payload_json === 'string'
      ? JSON.parse(evidenceRecord.evidence_payload_json)
      : evidenceRecord.evidence_payload_json;

    // Verify version 144.0
    assert.strictEqual(payload.evidence_schema_version, '144.0');
    console.log('  PASS: Evidence schema version is 144.0.');

    // Verify sensitive data is redacted
    const stringifiedPayload = JSON.stringify(payload);
    assert.ok(!stringifiedPayload.includes('admin@printprice.com'), 'Email must be redacted');
    assert.ok(!stringifiedPayload.includes('secret_123456'), 'API key must be redacted');
    assert.ok(stringifiedPayload.includes('[REDACTED_EMAIL]'), 'Redaction placeholder must be present');
    console.log('  PASS: Sensitive data (emails and keys) correctly redacted.');

    // Verify lineage hashes copied
    assert.strictEqual(lineage_hash_chain.phase144_approval_id, approvalId);
    assert.strictEqual(lineage_hash_chain.phase143_preparation_id, prepId);
    assert.strictEqual(lineage_hash_chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage hash chain verified.');

    console.log('\nSmoke 144E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 144E:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
