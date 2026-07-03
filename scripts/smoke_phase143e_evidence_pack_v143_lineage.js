'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const reviewBuilder = require('../src/api/services/cohortInterventionSimulationReviewBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewBuilderService');
const reviewEvidence = require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService');
const prepBuilder = require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService');
const evaluator = require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvaluatorService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvaluatorService');
const evidenceSvc = require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvidencePackService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReviewAndPrep(reviewId, prepId) {
  const writeScope = { writes_only_phase142_tables: true, wrote_phase128_to_141_operational_tables: false };
  const writeScope143 = { writes_only_phase143_tables: true, wrote_phase128_to_142_operational_tables: false };
  const reviewRecord = {
    review_id: reviewId,
    source_simulation_id: 'sim_test_e',
    source_execution_id: 'exec_test_e',
    cohort_id: 'cohort_test_e',
    tenant_id: 'tenant_test_e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    review_status: 'FINALIZED',
    review_decision: 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    review_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    approval_readiness_json: {},
    review_blockers_json: {},
    non_execution_attestation_json: {},
    source_simulation_hash: 'hash_e',
    source_simulation_evidence_pack_hash: 'ev_hash_e',
    source_execution_evidence_pack_hash: 'exec_ev_hash_e',
    review_result_hash: 'result_hash_e',
    evidence_pack_hash: 'pack_hash_e',
    created_at: new Date(),
    updated_at: new Date()
  };

  const prepRecord = {
    prep_id: prepId,
    source_review_id: reviewId,
    source_simulation_id: 'sim_test_e',
    source_execution_id: 'exec_test_e',
    cohort_id: 'cohort_test_e',
    tenant_id: 'tenant_test_e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    prep_status: 'DRAFT',
    prep_outcome: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: null,
    rollback_feasibility_score: null,
    evidence_completeness_score: null,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    prepared_by: null,
    finalized_by: null,
    prep_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope143,
    approval_readiness_json: {},
    prep_blockers_json: { missing_evaluation: true },
    non_execution_attestation_json: {},
    source_review_hash: 'pack_hash_e',
    source_review_evidence_pack_hash: 'pack_hash_e',
    prep_result_hash: null,
    evidence_pack_hash: null,
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    reviewBuilder._mockState.reviews.set(reviewId, reviewRecord);
    reviewEvidence._mockState.evidence.set(reviewId, {
      evidence_pack_hash: 'pack_hash_e',
      evidence_payload_json: {
        evidence_schema_version: '142.0',
        write_scope_attestation: writeScope,
        sensitive_data: { email: 'admin@printprice.com', secret: 'secret_123456' }
      },
      lineage_hash_chain_json: {
        phase142_review_id: reviewId,
        phase141_source_simulation_hash: 'hash_e',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    prepBuilder._mockState.preps.set(prepId, prepRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM controlled_beta_cohort_intervention_sim_review_evidence WHERE review_id = ?', [reviewId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_sim_reviews WHERE review_id = ?', [reviewId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_evidence WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_findings WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_preps WHERE prep_id = ?', [prepId]);

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_sim_reviews
       (review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        review_status, review_decision, risk_level, confidence_level, guardrail_status, write_scope_status,
        review_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        write_scope_attestation_json, approval_readiness_json, review_blockers_json, non_execution_attestation_json,
        source_simulation_hash, source_simulation_evidence_pack_hash, source_execution_evidence_pack_hash,
        review_result_hash, evidence_pack_hash)
       VALUES (?, 'sim_test_e', 'exec_test_e', 'cohort_test_e', 'tenant_test_e', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL', 'LOW', 'HIGH', 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'hash_e', 'ev_hash_e', 'exec_ev_hash_e', 'result_hash_e', 'pack_hash_e')`,
      [reviewId, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_sim_review_evidence
       (evidence_id, review_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '142.0', 'pack_hash_e', ?, ?)`,
      [
        'sev_' + reviewId,
        reviewId,
        JSON.stringify({ evidence_schema_version: '142.0', write_scope_attestation: writeScope, sensitive_data: { email: 'admin@printprice.com', secret: 'secret_123456' } }),
        JSON.stringify({
          phase142_review_id: reviewId,
          phase141_source_simulation_hash: 'hash_e',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_app_preps
       (prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        prep_status, prep_outcome, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, prep_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        prep_blockers_json, non_execution_attestation_json, source_review_hash, source_review_evidence_pack_hash,
        execution_capability_status, approval_execution_status)
       VALUES (?, ?, 'sim_test_e', 'exec_test_e', 'cohort_test_e', 'tenant_test_e', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', NULL, NULL, NULL, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{"missing_evaluation":true}', '{}', 'pack_hash_e', 'pack_hash_e', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY')`,
      [prepId, reviewId, JSON.stringify(writeScope143)]
    );
  }
}

(async () => {
  console.log('=== Smoke 143E: Evidence Pack Builder & Lineage ===\n');

  try {
    const revId = 'rev_e_1';
    const prepId = 'prp_e_1';
    await setupReviewAndPrep(revId, prepId);

    // Evaluate prep
    await evaluator.evaluatePrep(prepId, 'admin');

    // Inject sensitive data finding to test redaction
    const sensitiveFinding = {
      finding_id: 'finding_test_e',
      prep_id: prepId,
      finding_type: 'SECURITY_CHECK',
      severity: 'INFO',
      description: 'Mock finding with sensitive data: admin@printprice.com and secret:secret_123456',
      created_at: new Date()
    };
    if (!isProdLike) {
      prepBuilder._mockState.findings.set(prepId, [sensitiveFinding]);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_app_prep_findings
         (finding_id, prep_id, finding_type, severity, description)
         VALUES (?, ?, ?, ?, ?)`,
        [sensitiveFinding.finding_id, prepId, sensitiveFinding.finding_type, sensitiveFinding.severity, sensitiveFinding.description]
      );
    }

    // Build evidence pack
    const runRes = await evidenceSvc.buildEvidencePack(prepId, 'admin');
    const { evidence_pack_hash, lineage_hash_chain } = runRes;
    assert.ok(evidence_pack_hash, 'Evidence pack hash must be returned');

    // Retrieve evidence payload
    const evidenceRecord = await evidenceSvc.getEvidence(prepId);
    assert.ok(evidenceRecord, 'Evidence record must exist');
    const payload = typeof evidenceRecord.evidence_payload_json === 'string'
      ? JSON.parse(evidenceRecord.evidence_payload_json)
      : evidenceRecord.evidence_payload_json;

    // Verify version 143.0
    assert.strictEqual(payload.evidence_schema_version, '143.0');
    console.log('  PASS: Evidence schema version is 143.0.');

    // Verify sensitive data is redacted
    const stringifiedPayload = JSON.stringify(payload);
    assert.ok(!stringifiedPayload.includes('admin@printprice.com'), 'Email must be redacted');
    assert.ok(!stringifiedPayload.includes('secret_123456'), 'API key must be redacted');
    assert.ok(stringifiedPayload.includes('[REDACTED_EMAIL]'), 'Redaction placeholder must be present');
    console.log('  PASS: Sensitive data (emails and keys) correctly redacted.');

    // Verify lineage hashes copied
    assert.strictEqual(lineage_hash_chain.phase143_preparation_id, prepId);
    assert.strictEqual(lineage_hash_chain.phase142_review_id, revId);
    assert.strictEqual(lineage_hash_chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage hash chain verified.');

    console.log('\nSmoke 143E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 143E:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
