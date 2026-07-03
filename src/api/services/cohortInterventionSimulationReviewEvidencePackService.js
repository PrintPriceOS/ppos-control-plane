'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const reviewBuilderSvc = require('./cohortInterventionSimulationReviewBuilderService').serviceInstance || require('./cohortInterventionSimulationReviewBuilderService');
const evaluatorSvc = require('./cohortInterventionSimulationReviewEvaluatorService').serviceInstance || require('./cohortInterventionSimulationReviewEvaluatorService');
const decisionSvc = require('./cohortInterventionSimulationReviewDecisionService').serviceInstance || require('./cohortInterventionSimulationReviewDecisionService');
const simulationEvidenceSvc = require('./cohortInterventionSimulationEvidencePackService').serviceInstance || require('./cohortInterventionSimulationEvidencePackService');
const auditService = require('./cohortInterventionSimulationReviewAuditService').serviceInstance || require('./cohortInterventionSimulationReviewAuditService');

class CohortInterventionSimulationReviewEvidencePackService {
  constructor() {
    this._mockState = {
      evidence: new Map()
    };
  }

  _redactSensitiveFields(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      let redacted = obj;
      // Redact emails
      redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]");
      // Redact IP addresses (v4)
      redacted = redacted.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[REDACTED_IP]");
      // Redact inline keywords like secret keys or password values
      redacted = redacted.replace(/(password|token|secret|key|credential|private_key|auth|db_pass|passphrase)\s*[:=]\s*[^\s,;}]+/gi, "$1:[REDACTED]");
      return redacted;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this._redactSensitiveFields(item));
    }
    if (typeof obj === 'object') {
      const newObj = {};
      for (const [k, v] of Object.entries(obj)) {
        const lowerKey = k.toLowerCase();
        if (['password', 'token', 'secret', 'key', 'credential', 'private_key', 'auth', 'db_pass', 'passphrase'].some(s => lowerKey.includes(s))) {
          newObj[k] = '[REDACTED]';
        } else {
          newObj[k] = this._redactSensitiveFields(v);
        }
      }
      return newObj;
    }
    return obj;
  }


  async buildEvidencePack(reviewId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Load review details
    const review = await reviewBuilderSvc.getReview(reviewId);
    if (!review) throw new Error('REVIEW_NOT_FOUND');

    const findings = await evaluatorSvc.getFindings(reviewId);
    const decision = await decisionSvc.getDecision(reviewId);

    // Load Phase 141 evidence to copy lineage chain
    const simEvidence = await simulationEvidenceSvc.getEvidence(review.source_simulation_id);
    if (!simEvidence) throw new Error('PHASE141_EVIDENCE_NOT_FOUND');
    const simPayload = typeof simEvidence.evidence_payload_json === 'string'
      ? JSON.parse(simEvidence.evidence_payload_json)
      : simEvidence.evidence_payload_json;
    const parentChain = simPayload.lineage_hash_chain || {};

    const lineageHashChain = {
      phase142_review_id: reviewId,
      phase142_review_decision: review.review_decision || 'PENDING',
      phase141_source_simulation_hash: review.source_simulation_hash,
      phase141_source_simulation_evidence_pack_hash: review.source_simulation_evidence_pack_hash,
      phase140_source_execution_hash: parentChain.phase140_source_execution_hash,
      phase140_source_execution_evidence_pack_hash: review.source_execution_evidence_pack_hash,
      phase139_source_approval_hash: parentChain.phase139_source_approval_hash,
      phase138_source_preparation_hash: parentChain.phase138_source_preparation_hash,
      phase137_source_review_hash: parentChain.phase137_source_review_hash
    };

    const rawPayload = {
      evidence_schema_version: '142.0',
      review_id: reviewId,
      source_simulation_id: review.source_simulation_id,
      source_execution_id: review.source_execution_id,
      tenant_id: review.tenant_id,
      cohort_id: review.cohort_id,
      simulation_type: review.simulation_type,
      review_status: review.review_status,
      review_decision: review.review_decision,
      projected_impact_score: review.projected_impact_score,
      rollback_feasibility_score: review.rollback_feasibility_score,
      evidence_completeness_score: review.evidence_completeness_score,
      guardrail_status: review.guardrail_status,
      write_scope_status: review.write_scope_status,
      findings: findings.map(f => ({ finding_type: f.finding_type, severity: f.severity, description: f.description })),
      decision_rationale: decision ? decision.rationale : null,
      non_execution_attestation: typeof review.non_execution_attestation_json === 'string'
        ? JSON.parse(review.non_execution_attestation_json)
        : review.non_execution_attestation_json,
      write_scope_attestation: typeof review.write_scope_attestation_json === 'string'
        ? JSON.parse(review.write_scope_attestation_json)
        : review.write_scope_attestation_json,
      lineage_hash_chain: lineageHashChain,
      generated_at: new Date().toISOString()
    };

    // Redact sensitive details
    const evidencePayload = this._redactSensitiveFields(rawPayload);

    // Compute hashes
    const reviewResultPayload = {
      review_id: reviewId,
      decision: review.review_decision,
      rationale: decision ? decision.rationale : ''
    };
    const reviewResultHash = crypto.createHash('sha256').update(JSON.stringify(reviewResultPayload)).digest('hex');
    const evidencePackHash = crypto.createHash('sha256').update(JSON.stringify(evidencePayload)).digest('hex');
    const evidenceId = 'sre_' + crypto.randomBytes(8).toString('hex');

    const evidenceRecord = {
      evidence_id: evidenceId,
      review_id: reviewId,
      evidence_schema_version: '142.0',
      evidence_pack_hash: evidencePackHash,
      evidence_payload_json: evidencePayload,
      lineage_hash_chain_json: lineageHashChain,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidence.set(reviewId, evidenceRecord);
      
      const record = reviewBuilderSvc._mockState.reviews.get(reviewId);
      record.review_result_hash = reviewResultHash;
      record.evidence_pack_hash = evidencePackHash;
      reviewBuilderSvc._mockState.reviews.set(reviewId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_sim_review_evidence
         (evidence_id, review_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          evidenceId, reviewId, '142.0', evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(lineageHashChain)
        ]
      );

      await db.query(
        `UPDATE controlled_beta_cohort_intervention_sim_reviews
         SET review_result_hash = ?,
             evidence_pack_hash = ?
         WHERE review_id = ?`,
        [reviewResultHash, evidencePackHash, reviewId]
      );
    }

    await auditService.recordAuditEvent(reviewId, 'EVIDENCE_PACK_GENERATED', actorId, {
      evidence_pack_hash: evidencePackHash,
      review_result_hash: reviewResultHash
    });

    return { evidence_id: evidenceId, evidence_pack_hash: evidencePackHash, lineage_hash_chain: lineageHashChain };
  }

  async getEvidence(reviewId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.evidence.get(reviewId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_sim_review_evidence WHERE review_id = ?', [reviewId]);
      return list.length > 0 ? list[0] : null;
    }
  }
}

const serviceInstance = new CohortInterventionSimulationReviewEvidencePackService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationReviewEvidencePackService = CohortInterventionSimulationReviewEvidencePackService;
