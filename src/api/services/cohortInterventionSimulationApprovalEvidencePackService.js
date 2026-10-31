'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const approvalBuilderSvc = require('./cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalBuilderService');
const evaluatorSvc = require('./cohortInterventionSimulationApprovalEvaluatorService').serviceInstance || require('./cohortInterventionSimulationApprovalEvaluatorService');
const prepEvidenceSvc = require('./cohortInterventionSimulationApprovalPreparationEvidencePackService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationEvidencePackService');
const auditService = require('./cohortInterventionSimulationApprovalAuditService').serviceInstance || require('./cohortInterventionSimulationApprovalAuditService');

class CohortInterventionSimulationApprovalEvidencePackService {
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

  async buildEvidencePack(approvalId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Load approval details
    const approval = await approvalBuilderSvc.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');

    const findings = await evaluatorSvc.getFindings(approvalId);

    // Load Phase 143 prep evidence to copy lineage chain
    const prepEvidence = await prepEvidenceSvc.getEvidence(approval.source_prep_id);
    if (!prepEvidence) throw new Error('PHASE143_EVIDENCE_NOT_FOUND');
    
    let parentChain = {};
    if (prepEvidence.lineage_hash_chain_json) {
      parentChain = typeof prepEvidence.lineage_hash_chain_json === 'string'
        ? JSON.parse(prepEvidence.lineage_hash_chain_json)
        : prepEvidence.lineage_hash_chain_json;
    } else {
      const prepPayload = typeof prepEvidence.evidence_payload_json === 'string'
        ? JSON.parse(prepEvidence.evidence_payload_json)
        : prepEvidence.evidence_payload_json;
      if (prepPayload && prepPayload.lineage_hash_chain) {
        parentChain = prepPayload.lineage_hash_chain;
      }
    }

    const lineageHashChain = {
      phase144_approval_id: approvalId,
      phase144_approval_decision: approval.approval_decision || 'PENDING',
      phase144_future_execution_eligibility_status: approval.future_execution_eligibility_status || 'NOT_ELIGIBLE',
      phase143_preparation_id: approval.source_prep_id,
      phase143_preparation_outcome: parentChain.phase143_preparation_outcome || 'PENDING',
      phase142_review_id: approval.source_review_id,
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
      evidence_schema_version: '144.0',
      approval_id: approvalId,
      source_prep_id: approval.source_prep_id,
      source_review_id: approval.source_review_id,
      source_simulation_id: approval.source_simulation_id,
      source_execution_id: approval.source_execution_id,
      tenant_id: approval.tenant_id,
      cohort_id: approval.cohort_id,
      simulation_type: approval.simulation_type,
      approval_status: approval.approval_status,
      approval_decision: approval.approval_decision,
      projected_impact_score: approval.projected_impact_score,
      rollback_feasibility_score: approval.rollback_feasibility_score,
      evidence_completeness_score: approval.evidence_completeness_score,
      guardrail_status: approval.guardrail_status,
      write_scope_status: approval.write_scope_status,
      findings: findings.map(f => ({ finding_type: f.finding_type, severity: f.severity, description: f.description })),
      non_execution_attestation: typeof approval.non_execution_attestation_json === 'string'
        ? JSON.parse(approval.non_execution_attestation_json)
        : approval.non_execution_attestation_json,
      write_scope_attestation: typeof approval.write_scope_attestation_json === 'string'
        ? JSON.parse(approval.write_scope_attestation_json)
        : approval.write_scope_attestation_json,
      lineage_hash_chain: lineageHashChain,
      generated_at: new Date().toISOString()
    };

    // Redact sensitive details
    const evidencePayload = this._redactSensitiveFields(rawPayload);

    // Compute hashes
    const approvalResultPayload = {
      approval_id: approvalId,
      decision: approval.approval_decision,
      status: approval.approval_status
    };
    const approvalResultHash = crypto.createHash('sha256').update(JSON.stringify(approvalResultPayload)).digest('hex');
    const evidencePackHash = crypto.createHash('sha256').update(JSON.stringify(evidencePayload)).digest('hex');
    const evidenceId = 'ape_' + crypto.randomBytes(8).toString('hex');

    const evidenceRecord = {
      evidence_id: evidenceId,
      approval_id: approvalId,
      evidence_schema_version: '144.0',
      evidence_pack_hash: evidencePackHash,
      evidence_payload_json: evidencePayload,
      lineage_hash_chain_json: lineageHashChain,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidence.set(approvalId, evidenceRecord);
      
      const record = approvalBuilderSvc._mockState.approvals.get(approvalId);
      record.approval_result_hash = approvalResultHash;
      record.evidence_pack_hash = evidencePackHash;
      approvalBuilderSvc._mockState.approvals.set(approvalId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_approval_evidence
         (evidence_id, approval_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          evidenceId, approvalId, '144.0', evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(lineageHashChain)
        ]
      );

      await db.query(
        `UPDATE controlled_beta_cohort_intervention_approvals
         SET approval_result_hash = ?,
             evidence_pack_hash = ?
         WHERE approval_id = ?`,
        [approvalResultHash, evidencePackHash, approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'EVIDENCE_PACK_GENERATED', actorId, {
      evidence_pack_hash: evidencePackHash,
      approval_result_hash: approvalResultHash
    });

    return { evidence_id: evidenceId, evidence_pack_hash: evidencePackHash, lineage_hash_chain: lineageHashChain };
  }

  async getEvidence(approvalId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.evidence.get(approvalId) || null;
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_approval_evidence WHERE approval_id = ?', [approvalId]);
      return list.length > 0 ? list[0] : null;
    }
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalEvidencePackService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalEvidencePackService = CohortInterventionSimulationApprovalEvidencePackService;
