'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const prepBuilderSvc = require('./cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationBuilderService');
const evaluatorSvc = require('./cohortInterventionSimulationApprovalPreparationEvaluatorService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationEvaluatorService');
const reviewEvidenceSvc = require('./cohortInterventionSimulationReviewEvidencePackService').serviceInstance || require('./cohortInterventionSimulationReviewEvidencePackService');
const auditService = require('./cohortInterventionSimulationApprovalPreparationAuditService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationAuditService');

class CohortInterventionSimulationApprovalPreparationEvidencePackService {
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

  async buildEvidencePack(prepId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Load prep details
    const prep = await prepBuilderSvc.getPrep(prepId);
    if (!prep) throw new Error('PREP_NOT_FOUND');

    const findings = await evaluatorSvc.getFindings(prepId);

    // Load Phase 142 evidence to copy lineage chain
    const reviewEvidence = await reviewEvidenceSvc.getEvidence(prep.source_review_id);
    if (!reviewEvidence) throw new Error('PHASE142_EVIDENCE_NOT_FOUND');
    const reviewPayload = typeof reviewEvidence.evidence_payload_json === 'string'
      ? JSON.parse(reviewEvidence.evidence_payload_json)
      : reviewEvidence.evidence_payload_json;
    
    let parentChain = {};
    if (reviewEvidence.lineage_hash_chain_json) {
      parentChain = typeof reviewEvidence.lineage_hash_chain_json === 'string'
        ? JSON.parse(reviewEvidence.lineage_hash_chain_json)
        : reviewEvidence.lineage_hash_chain_json;
    } else if (reviewPayload && reviewPayload.lineage_hash_chain) {
      parentChain = reviewPayload.lineage_hash_chain;
    }

    const lineageHashChain = {
      phase143_preparation_id: prepId,
      phase143_preparation_outcome: prep.prep_outcome || 'PENDING',
      phase142_review_id: prep.source_review_id,
      phase142_review_decision: parentChain.phase142_review_decision || 'PENDING',
      phase141_source_simulation_hash: parentChain.phase141_source_simulation_hash || 'placeholder',
      phase141_source_simulation_evidence_pack_hash: parentChain.phase141_source_simulation_evidence_pack_hash || 'placeholder',
      phase140_source_execution_hash: parentChain.phase140_source_execution_hash || 'placeholder',
      phase140_source_execution_evidence_pack_hash: parentChain.phase140_source_execution_evidence_pack_hash || 'placeholder',
      phase139_source_approval_hash: parentChain.phase139_source_approval_hash || 'placeholder',
      phase138_source_preparation_hash: parentChain.phase138_source_preparation_hash || 'placeholder',
      phase137_source_review_hash: parentChain.phase137_source_review_hash || 'placeholder'
    };

    const rawPayload = {
      evidence_schema_version: '143.0',
      prep_id: prepId,
      source_review_id: prep.source_review_id,
      source_simulation_id: prep.source_simulation_id,
      source_execution_id: prep.source_execution_id,
      tenant_id: prep.tenant_id,
      cohort_id: prep.cohort_id,
      simulation_type: prep.simulation_type,
      prep_status: prep.prep_status,
      prep_outcome: prep.prep_outcome,
      projected_impact_score: prep.projected_impact_score,
      rollback_feasibility_score: prep.rollback_feasibility_score,
      evidence_completeness_score: prep.evidence_completeness_score,
      guardrail_status: prep.guardrail_status,
      write_scope_status: prep.write_scope_status,
      findings: findings.map(f => ({ finding_type: f.finding_type, severity: f.severity, description: f.description })),
      non_execution_attestation: typeof prep.non_execution_attestation_json === 'string'
        ? JSON.parse(prep.non_execution_attestation_json)
        : prep.non_execution_attestation_json,
      write_scope_attestation: typeof prep.write_scope_attestation_json === 'string'
        ? JSON.parse(prep.write_scope_attestation_json)
        : prep.write_scope_attestation_json,
      lineage_hash_chain: lineageHashChain,
      generated_at: new Date().toISOString()
    };

    // Redact sensitive details
    const evidencePayload = this._redactSensitiveFields(rawPayload);

    // Compute hashes
    const prepResultPayload = {
      prep_id: prepId,
      outcome: prep.prep_outcome,
      status: prep.prep_status
    };
    const prepResultHash = crypto.createHash('sha256').update(JSON.stringify(prepResultPayload)).digest('hex');
    const evidencePackHash = crypto.createHash('sha256').update(JSON.stringify(evidencePayload)).digest('hex');
    const evidenceId = 'pre_' + crypto.randomBytes(8).toString('hex');

    const evidenceRecord = {
      evidence_id: evidenceId,
      prep_id: prepId,
      evidence_schema_version: '143.0',
      evidence_pack_hash: evidencePackHash,
      evidence_payload_json: evidencePayload,
      lineage_hash_chain_json: lineageHashChain,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidence.set(prepId, evidenceRecord);
      
      const record = prepBuilderSvc._mockState.preps.get(prepId);
      record.prep_result_hash = prepResultHash;
      record.evidence_pack_hash = evidencePackHash;
      prepBuilderSvc._mockState.preps.set(prepId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_app_prep_evidence
         (evidence_id, prep_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          evidenceId, prepId, '143.0', evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(lineageHashChain)
        ]
      );

      await db.query(
        `UPDATE controlled_beta_cohort_intervention_app_preps
         SET prep_result_hash = ?,
             evidence_pack_hash = ?
         WHERE prep_id = ?`,
        [prepResultHash, evidencePackHash, prepId]
      );
    }

    await auditService.recordAuditEvent(prepId, 'EVIDENCE_PACK_GENERATED', actorId, {
      evidence_pack_hash: evidencePackHash,
      prep_result_hash: prepResultHash
    });

    return { evidence_id: evidenceId, evidence_pack_hash: evidencePackHash, lineage_hash_chain: lineageHashChain };
  }

  async getEvidence(prepId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.evidence.get(prepId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_app_prep_evidence WHERE prep_id = ?', [prepId]);
      return list.length > 0 ? list[0] : null;
    }
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalPreparationEvidencePackService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalPreparationEvidencePackService = CohortInterventionSimulationApprovalPreparationEvidencePackService;
