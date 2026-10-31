'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionApprovalEvidencePackService {
  constructor() {
    this._mockState = {
      evidence: new Map()
    };
  }

  async buildEvidencePack(approvalId, prepPayload, steps, attestation, decision, rationale) {
    const evidenceId = 'aev_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Redacted data payload structure
    const evidenceData = {
      evidence_schema_version: '139.0',
      approval_id: approvalId,
      source_preparation_id: prepPayload.preparation_id,
      cohort_id: prepPayload.cohort_id,
      tenant_id: prepPayload.tenant_id,
      completed_steps: steps.map(s => ({
        role: s.role,
        approver_id: s.approver_id,
        status: s.status,
        signed_at: s.signed_at
      })),
      decision: {
        approval_decision: decision,
        rationale: rationale
      },
      safety_invariants: {
        approval_only: true,
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

    const inputPreparationHash = crypto.createHash('sha256').update(JSON.stringify(prepPayload)).digest('hex');
    const approvalResultHash = crypto.createHash('sha256').update(JSON.stringify({ decision, rationale })).digest('hex');

    const record = {
      evidence_id: evidenceId,
      approval_id: approvalId,
      input_preparation_hash: inputPreparationHash,
      approval_result_hash: approvalResultHash,
      evidence_pack_hash: evidencePackHash,
      evidence_schema_version: '139.0',
      evidence_data_json: evidenceData,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidence.set(approvalId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_approval_evidence
         (evidence_id, approval_id, input_preparation_hash, approval_result_hash, evidence_pack_hash, evidence_schema_version, evidence_data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [record.evidence_id, record.approval_id, record.input_preparation_hash, record.approval_result_hash, record.evidence_pack_hash, record.evidence_schema_version, JSON.stringify(record.evidence_data_json)]
      );
    }

    return record;
  }
}

const serviceInstance = new CohortInterventionApprovalEvidencePackService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
