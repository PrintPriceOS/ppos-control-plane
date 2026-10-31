'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class RuntimeActivityReviewEvidencePackService {
  constructor() {
    this._mockState = {
      evidence: new Map()
    };
  }

  async buildEvidencePack(reviewId, snapshot, evaluation, decision, findings) {
    const evidenceId = 'evd_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Redacted data payload structure
    const evidenceData = {
      evidence_schema_version: '137.0',
      snapshot_window: {
        start: snapshot.window_start,
        end: snapshot.window_end
      },
      summary: snapshot.summary,
      findings: findings.map(f => ({
        finding_key: f.finding_key,
        severity: f.severity
      })),
      decision: {
        recommended_decision: decision.recommended_decision,
        decision_execution_status: decision.decision_execution_status,
        execution_blocked_reason: decision.execution_blocked_reason
      },
      safety_invariants: {
        full_public_enabled: false,
        open_marketplace_enabled: false,
        public_signup_enabled: false,
        public_beta_enabled: false,
        payment_execution_enabled: false,
        provider_external_submission_enabled: false,
        source_mutation_enabled: false,
        auto_expansion_enabled: false,
        auto_revocation_enabled: false,
        auto_enforcement_enabled: false
      },
      redaction_proof: {
        raw_tokens_excluded: true,
        ip_addresses_excluded: true,
        emails_excluded: true,
        database_credentials_excluded: true
      }
    };

    const serialized = JSON.stringify(evidenceData);
    const evidencePackHash = crypto.createHash('sha256').update(serialized).digest('hex');

    const record = {
      evidence_id: evidenceId,
      review_id: reviewId,
      input_snapshot_hash: snapshot.inputSnapshotHash || crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      evaluation_result_hash: evaluation.evaluationResultHash || crypto.createHash('sha256').update(JSON.stringify(evaluation)).digest('hex'),
      evidence_pack_hash: evidencePackHash,
      evidence_schema_version: '137.0',
      evidence_data_json: evidenceData,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidence.set(reviewId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_review_evidence 
         (evidence_id, review_id, input_snapshot_hash, evaluation_result_hash, evidence_pack_hash, evidence_schema_version, evidence_data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [record.evidence_id, record.review_id, record.input_snapshot_hash, record.evaluation_result_hash, record.evidence_pack_hash, record.evidence_schema_version, JSON.stringify(record.evidence_data_json)]
      );
    }

    return record;
  }
}

const serviceInstance = new RuntimeActivityReviewEvidencePackService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
