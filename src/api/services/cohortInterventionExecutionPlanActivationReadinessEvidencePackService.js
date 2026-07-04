'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const planEvidenceSvc = require('./cohortInterventionExecutionPlanEvidencePackService').serviceInstance;

function redactSensitiveData(str) {
  if (typeof str !== 'string') return str;
  let result = str;
  // Redact emails
  result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  // Redact secrets
  result = result.replace(/(?:secret|password|token|key|key_value|authorization)\s*:\s*[^\s,{}"]+/gi, match => {
    const parts = match.split(':');
    return `${parts[0]}:[REDACTED_SECRET]`;
  });
  return result;
}

function deepRedact(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') return redactSensitiveData(obj);
  if (Array.isArray(obj)) return obj.map(deepRedact);
  if (typeof obj === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = deepRedact(v);
    }
    return res;
  }
  return obj;
}

class CohortInterventionExecutionPlanActivationReadinessEvidencePackService {
  constructor() {
    this._mockState = {
      evidence: new Map()
    };
  }

  async buildEvidencePack(activationRdId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = await builder.getReadiness(activationRdId);
    if (!record) throw new Error('READINESS_RECORD_NOT_FOUND');

    // 1. Fetch parent Phase 149 plan evidence
    const parentEvidence = await planEvidenceSvc.getEvidence(record.source_plan_id);
    if (!parentEvidence) {
      throw new Error('PHASE149_EVIDENCE_NOT_FOUND');
    }

    const parentPayload = typeof parentEvidence.evidence_payload_json === 'string'
      ? JSON.parse(parentEvidence.evidence_payload_json)
      : parentEvidence.evidence_payload_json;
    const parentLineage = typeof parentEvidence.lineage_hash_chain_json === 'string'
      ? JSON.parse(parentEvidence.lineage_hash_chain_json)
      : parentEvidence.lineage_hash_chain_json;

    // 2. Build trace chain
    const lineageChain = {
      phase150_activation_rd_id: activationRdId,
      phase149_source_plan_hash: record.source_plan_hash,
      phase149_source_plan_evidence_pack_hash: record.source_plan_evidence_pack_hash,
      phase148_source_dispatcher_hash: parentLineage.phase148_source_dispatcher_hash || 'none',
      phase147_source_envelope_hash: parentLineage.phase147_source_envelope_hash || 'none',
      phase146_source_auth_hash: parentLineage.phase146_source_auth_hash || 'none',
      phase145_source_readiness_hash: parentLineage.phase145_source_readiness_hash || 'none',
      phase144_source_approval_hash: parentLineage.phase144_source_approval_hash || 'none',
      phase143_preparation_id: parentLineage.phase143_preparation_id || 'none',
      phase142_review_id: parentLineage.phase142_review_id || 'none',
      phase141_source_simulation_hash: parentLineage.phase141_source_simulation_hash || 'none',
      phase140_source_execution_hash: parentLineage.phase140_source_execution_hash || 'none',
      phase139_source_approval_hash: parentLineage.phase139_source_approval_hash || 'none',
      phase138_source_preparation_hash: parentLineage.phase138_source_preparation_hash || 'none',
      phase137_source_review_hash: parentLineage.phase137_source_review_hash || 'none'
    };

    // 3. Assemble raw payload
    const rules = await builder.getRules(activationRdId);
    const rawPayload = {
      evidence_schema_version: '150.0',
      activation_rd_id: record.activation_rd_id,
      source_plan_id: record.source_plan_id,
      cohort_id: record.cohort_id,
      tenant_id: record.tenant_id,
      simulation_type: record.simulation_type,
      activation_readiness_status: record.activation_readiness_status,
      activation_readiness_result: record.activation_readiness_result,
      risk_level: record.risk_level,
      confidence_level: record.confidence_level,
      guardrail_status: record.guardrail_status,
      write_scope_status: record.write_scope_status,
      canary_envelope: record.canary_envelope_json,
      rules: rules,
      non_execution_attestation: record.non_execution_attestation_json,
      write_scope_attestation: record.write_scope_attestation_json,
      built_by: actorId,
      built_at: new Date()
    };

    // 4. Redact sensitive info
    const redactedPayload = deepRedact(rawPayload);

    // 5. Generate hash
    const payloadStr = JSON.stringify(redactedPayload);
    const evidencePackHash = 'evp_150_' + crypto.createHash('sha256').update(payloadStr).digest('hex');

    const evidenceId = 'evd_150_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      this._mockState.evidence.set(activationRdId, {
        evidence_id: evidenceId,
        activation_rd_id: activationRdId,
        evidence_schema_version: '150.0',
        evidence_pack_hash: evidencePackHash,
        evidence_payload_json: redactedPayload,
        lineage_hash_chain_json: lineageChain,
        created_at: created
      });
      
      await builder.updateReadiness(activationRdId, {
        evidence_pack_hash: evidencePackHash,
        lineage_hash_chain_json: lineageChain
      });

      return { evidence_pack_hash: evidencePackHash, lineage_hash_chain: lineageChain };
    }

    // Drop previous evidence
    await db.query(`DELETE FROM cb_cohort_intervention_activation_rd_evidence WHERE activation_rd_id = ?`, [activationRdId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd_evidence
       (evidence_id, activation_rd_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json, created_at)
       VALUES (?, ?, '150.0', ?, ?, ?, ?)`,
      [
        evidenceId,
        activationRdId,
        evidencePackHash,
        JSON.stringify(redactedPayload),
        JSON.stringify(lineageChain),
        created
      ]
    );

    await builder.updateReadiness(activationRdId, {
      evidence_pack_hash: evidencePackHash,
      lineage_hash_chain_json: lineageChain
    });

    return { evidence_pack_hash: evidencePackHash, lineage_hash_chain: lineageChain };
  }

  async getEvidence(activationRdId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.evidence.get(activationRdId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_rd_evidence WHERE activation_rd_id = ?`,
      [activationRdId]
    );
    return rows[0] || null;
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationReadinessEvidencePackService();
module.exports = {
  CohortInterventionExecutionPlanActivationReadinessEvidencePackService,
  serviceInstance
};
