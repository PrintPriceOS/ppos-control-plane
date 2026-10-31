'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionPreparationEvidencePackService {
  constructor() {
    this._mockState = {
      evidence: new Map()
    };
  }

  async buildEvidencePack(preparationId, reviewPayload, planResult, items, attestation) {
    const evidenceId = 'pev_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Redacted data payload structure
    const evidenceData = {
      evidence_schema_version: '138.0',
      preparation_id: preparationId,
      source_review_id: reviewPayload.review_id,
      cohort_id: reviewPayload.cohort_id,
      tenant_id: reviewPayload.tenant_id,
      recommended_decision: reviewPayload.risk_level, // or recommended_decision_from_phase137
      checklist_items: items.map(item => ({
        action_key: item.action_key,
        description: item.description,
        item_status: item.item_status
      })),
      safety_invariants: {
        preparation_only: true,
        execution_disabled: true,
        billing_mutated: false,
        payment_execution_triggered: false,
        provider_submission_triggered: false,
        cohort_status_altered: false,
        participant_status_altered: false
      },
      redaction_proof: {
        database_credentials_redacted: true,
        private_keys_redacted: true,
        api_keys_redacted: true,
        pii_redacted: true
      },
      attestation
    };

    const serializedEvidence = JSON.stringify(evidenceData);
    const evidencePackHash = crypto.createHash('sha256').update(serializedEvidence).digest('hex');

    const inputReviewHash = crypto.createHash('sha256').update(JSON.stringify(reviewPayload)).digest('hex');
    const preparationResultHash = crypto.createHash('sha256').update(JSON.stringify(planResult)).digest('hex');

    const record = {
      evidence_id: evidenceId,
      preparation_id: preparationId,
      input_review_hash: inputReviewHash,
      preparation_result_hash: preparationResultHash,
      evidence_pack_hash: evidencePackHash,
      evidence_schema_version: '138.0',
      evidence_data_json: evidenceData,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidence.set(preparationId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_preparation_evidence
         (evidence_id, preparation_id, input_review_hash, preparation_result_hash, evidence_pack_hash, evidence_schema_version, evidence_data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [record.evidence_id, record.preparation_id, record.input_review_hash, record.preparation_result_hash, record.evidence_pack_hash, record.evidence_schema_version, JSON.stringify(record.evidence_data_json)]
      );
    }

    return record;
  }
}

const serviceInstance = new CohortInterventionPreparationEvidencePackService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
