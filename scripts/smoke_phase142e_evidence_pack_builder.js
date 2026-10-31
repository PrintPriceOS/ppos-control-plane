'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const reviewBuilder = require('../src/api/services/cohortInterventionSimulationReviewBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewBuilderService');
const evaluator = require('../src/api/services/cohortInterventionSimulationReviewEvaluatorService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewEvaluatorService');
const decisionSvc = require('../src/api/services/cohortInterventionSimulationReviewDecisionService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewDecisionService');
const evidenceSvc = require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewEvidencePackService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function createReviewDraft() {
  const reviewId = 'srv_evp_test_' + Math.random().toString(36).substring(7);
  const reviewRecord = {
    review_id: reviewId,
    source_simulation_id: 'sim_test_evp',
    source_execution_id: 'exec_test_evp',
    cohort_id: 'cohort_test_evp',
    tenant_id: 'tenant_test_evp',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    review_status: 'DRAFT',
    review_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: {
      writes_only_phase141_tables: true,
      wrote_phase128_to_140_operational_tables: false
    },
    approval_readiness_json: {},
    review_blockers_json: {},
    non_execution_attestation_json: {
      review_executed_high_risk_intervention: false,
      cohort_paused: false
    },
    source_simulation_hash: 'hash_sim_evp',
    source_simulation_evidence_pack_hash: 'ev_hash_evp',
    source_execution_evidence_pack_hash: 'exec_ev_hash_evp',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    reviewBuilder._mockState.reviews.set(reviewId, reviewRecord);
    
    // Inject mock parent simulation evidence
    const simEvidence = require('../src/api/services/cohortInterventionSimulationEvidencePackService');
    simEvidence._mockState.evidence.set('sim_test_evp', {
      evidence_pack_hash: 'ev_hash_evp',
      evidence_payload_json: {
        lineage_hash_chain: {
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        }
      }
    });
  } else {
    // DB setup
    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_sim_reviews
       (review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        review_status, review_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        write_scope_attestation_json, approval_readiness_json, review_blockers_json, non_execution_attestation_json,
        source_simulation_hash, source_simulation_evidence_pack_hash, source_execution_evidence_pack_hash)
       VALUES (?, 'sim_test_evp', 'exec_test_evp', 'cohort_test_evp', 'tenant_test_evp', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', '{}', '{}', '{}', '{}', '{"writes_only_phase141_tables":true,"wrote_phase128_to_140_operational_tables":false}', '{}', '{}', '{"review_executed_high_risk_intervention":false,"cohort_paused":false}', 'hash_sim_evp', 'ev_hash_evp', 'exec_ev_hash_evp')`,
      [reviewId]
    );

    // Setup Parent Simulation evidence pack in DB
    await db.query('DELETE FROM controlled_beta_cohort_intervention_sim_evidence WHERE simulation_id = ?', ['sim_test_evp']);
    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_sim_evidence
       (evidence_id, simulation_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, 'sim_test_evp', '141.0', 'ev_hash_evp', '{}', '{"phase140_source_execution_hash":"parent_exec_hash","phase139_source_approval_hash":"parent_approval_hash","phase138_source_preparation_hash":"parent_prep_hash","phase137_source_review_hash":"parent_rev_hash"}')`,
      ['sev_sim_test_evp']
    );
  }
  return reviewId;
}

(async () => {
  console.log('=== Smoke 142E: Evidence Pack Builder ===\n');

  try {
    const reviewId = await createReviewDraft();

    // Evaluate
    await evaluator.evaluateReview(reviewId, 'admin');
    
    // Decision with sensitive values (email and key) inside rationale
    const sensitiveRationale = 'Approved. Contact admin@printprice.com with API key: secret_123456';
    await decisionSvc.recordDecision(reviewId, 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL', sensitiveRationale, 'admin');

    // Build evidence pack
    const { evidence_id, evidence_pack_hash, lineage_hash_chain } = await evidenceSvc.buildEvidencePack(reviewId, 'admin');
    assert.ok(evidence_id, 'Evidence ID must be returned');
    assert.ok(evidence_pack_hash, 'Evidence pack hash must be returned');

    // Retrieve evidence payload
    const evidenceRecord = await evidenceSvc.getEvidence(reviewId);
    assert.ok(evidenceRecord, 'Evidence record must exist');
    const payload = typeof evidenceRecord.evidence_payload_json === 'string'
      ? JSON.parse(evidenceRecord.evidence_payload_json)
      : evidenceRecord.evidence_payload_json;

    // Verify version 142.0
    assert.strictEqual(payload.evidence_schema_version, '142.0');
    console.log('  PASS: Evidence schema version is 142.0.');

    // Verify sensitive data is redacted
    const stringifiedPayload = JSON.stringify(payload);
    assert.ok(!stringifiedPayload.includes('admin@printprice.com'), 'Email must be redacted');
    assert.ok(!stringifiedPayload.includes('secret_123456'), 'API key must be redacted');
    assert.ok(stringifiedPayload.includes('[REDACTED_EMAIL]'), 'Redaction placeholder must be present');
    console.log('  PASS: Sensitive data (emails and keys) correctly redacted.');

    // Verify lineage hashescopied
    assert.strictEqual(lineage_hash_chain.phase142_review_id, reviewId);
    assert.strictEqual(lineage_hash_chain.phase141_source_simulation_hash, 'hash_sim_evp');
    assert.strictEqual(lineage_hash_chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage hash chain verified.');

    console.log('\nSmoke 142E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 142E:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
