'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builderService = require('./cohortInterventionSimulationBuilderService').serviceInstance || require('./cohortInterventionSimulationBuilderService');
const auditService = require('./cohortInterventionSimulationAuditService').serviceInstance || require('./cohortInterventionSimulationAuditService');

class CohortInterventionSimulationEvidencePackService {
  constructor() {
    this._mockState = { evidence: new Map() };
  }

  async buildEvidencePack(simulationId, simulation, steps, impactProjection, rollbackPreview, simulationResult, guardrailRes) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const lineageHashChain = {
      phase141_simulation_id: simulationId,
      phase141_simulation_type: simulation.simulation_type,
      phase140_source_execution_hash: simulation.source_execution_hash || simulation.evidence_pack_hash,
      phase140_source_execution_evidence_pack_hash: simulation.source_execution_evidence_pack_hash,
      phase139_source_approval_hash: simulation.source_approval_hash,
      phase138_source_preparation_hash: simulation.source_preparation_hash,
      phase137_source_review_hash: simulation.source_review_hash
    };

    const evidencePayload = {
      evidence_schema_version: '141.0',
      simulation_id: simulationId,
      simulation_type: simulation.simulation_type,
      tenant_id: simulation.tenant_id,
      cohort_id: simulation.cohort_id,
      simulation_status: 'SIMULATED',
      safety_attestation: simulation.safe_scope_simulation_attestation,
      write_scope_attestation: typeof simulation.simulation_write_scope_attestation_json === 'string'
        ? JSON.parse(simulation.simulation_write_scope_attestation_json)
        : simulation.simulation_write_scope_attestation_json,
      impact_projection_hash: simulation.impact_projection_hash,
      rollback_preview_hash: simulation.rollback_preview_hash,
      simulation_result_hash: simulationResult ? simulationResult.simulation_result_hash : null,
      steps: steps.map(s => ({ step_key: s.step_key, status: s.status })),
      guardrail_findings: guardrailRes ? guardrailRes.findings : [],
      lineage_hash_chain: lineageHashChain,
      generated_at: new Date().toISOString()
    };

    const evidencePackHash = crypto.createHash('sha256').update(JSON.stringify(evidencePayload)).digest('hex');
    const evidenceId = 'sev_' + crypto.randomBytes(8).toString('hex');

    if (!isProdLike) {
      this._mockState.evidence.set(simulationId, {
        evidence_id: evidenceId,
        simulation_id: simulationId,
        evidence_schema_version: '141.0',
        evidence_pack_hash: evidencePackHash,
        evidence_payload_json: evidencePayload,
        lineage_hash_chain_json: lineageHashChain,
        created_at: new Date()
      });
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_simulation_evidence
         (evidence_id, simulation_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          evidenceId, simulationId, '141.0', evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(lineageHashChain)
        ]
      );
    }

    return { evidence_id: evidenceId, evidence_pack_hash: evidencePackHash, lineage_hash_chain: lineageHashChain };
  }

  async getEvidence(simulationId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.evidence.get(simulationId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_simulation_evidence WHERE simulation_id = ?', [simulationId]);
      return list.length > 0 ? list[0] : null;
    }
  }
}

const serviceInstance = new CohortInterventionSimulationEvidencePackService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationEvidencePackService = CohortInterventionSimulationEvidencePackService;
