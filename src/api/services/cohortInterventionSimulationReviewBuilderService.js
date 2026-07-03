'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const simulationBuilderSvc = require('./cohortInterventionSimulationBuilderService').serviceInstance || require('./cohortInterventionSimulationBuilderService');
const simulationEvidenceSvc = require('./cohortInterventionSimulationEvidencePackService').serviceInstance || require('./cohortInterventionSimulationEvidencePackService');
const auditService = require('./cohortInterventionSimulationReviewAuditService').serviceInstance || require('./cohortInterventionSimulationReviewAuditService');

class CohortInterventionSimulationReviewBuilderService {
  constructor() {
    this._mockState = {
      reviews: new Map(),
      findings: new Map()
    };
  }

  _buildNonExecutionAttestation() {
    return {
      review_executed_high_risk_intervention: false,
      cohort_paused: false,
      participant_access_restricted: false,
      invite_revoked: false,
      cohort_expanded: false,
      billing_state_mutated: false,
      payment_execution_triggered: false,
      refund_execution_triggered: false,
      payout_execution_triggered: false,
      provider_submission_triggered: false,
      tax_submission_triggered: false,
      accounting_submission_triggered: false,
      marketplace_scope_changed: false,
      public_signup_enabled: false,
      public_beta_enabled: false,
      auto_expansion_triggered: false,
      auto_revocation_triggered: false,
      auto_enforcement_triggered: false,
      source_mutation_triggered: false,
      execution_job_created: false
    };
  }

  async getReview(reviewId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.reviews.get(reviewId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_simulation_reviews WHERE review_id = ?', [reviewId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getReviews() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return Array.from(this._mockState.reviews.values());
    } else {
      return await db.query('SELECT * FROM controlled_beta_cohort_intervention_simulation_reviews ORDER BY created_at DESC');
    }
  }

  async getReviewsForCohort(cohortId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return Array.from(this._mockState.reviews.values()).filter(r => r.cohort_id === cohortId);
    } else {
      return await db.query('SELECT * FROM controlled_beta_cohort_intervention_simulation_reviews WHERE cohort_id = ? ORDER BY created_at DESC', [cohortId]);
    }
  }

  async createReview(simulationId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Load finalized Phase 141 simulation
    const simulation = await simulationBuilderSvc.getSimulation(simulationId);
    if (!simulation) {
      throw new Error('PHASE141_SIMULATION_NOT_FOUND');
    }

    // Validate simulation_status is SIMULATED or FINALIZED
    if (simulation.simulation_status !== 'SIMULATED' && simulation.simulation_status !== 'FINALIZED') {
      throw new Error(`PHASE141_SIMULATION_NOT_FINALIZED: Status is ${simulation.simulation_status}`);
    }

    // 2. Validate evidence pack v141.0 exists
    const simEvidence = await simulationEvidenceSvc.getEvidence(simulationId);
    if (!simEvidence) {
      throw new Error('PHASE141_EVIDENCE_MISSING');
    }
    const evidencePayload = typeof simEvidence.evidence_payload_json === 'string'
      ? JSON.parse(simEvidence.evidence_payload_json)
      : simEvidence.evidence_payload_json;
    if (evidencePayload.evidence_schema_version !== '141.0') {
      throw new Error(`PHASE141_EVIDENCE_INVALID_VERSION: Expected 141.0, got ${evidencePayload.evidence_schema_version}`);
    }

    // 3. Validate write-scope attestation says Phase 141 tables only
    const writeScope = evidencePayload.write_scope_attestation || {};
    if (writeScope.writes_only_phase141_tables !== true || writeScope.wrote_phase128_to_140_operational_tables !== false) {
      throw new Error('PHASE141_WRITE_SCOPE_ATTESTATION_FAILED');
    }

    const reviewId = 'srv_' + crypto.randomBytes(8).toString('hex');
    
    // Copy lineage hashes
    const chain = evidencePayload.lineage_hash_chain || {};
    const sourceExecutionHash = chain.phase140_source_execution_hash || 'placeholder';
    const sourceExecutionEvidencePackHash = chain.phase140_source_execution_evidence_pack_hash || 'placeholder';
    const sourceApprovalHash = chain.phase139_source_approval_hash || 'placeholder';
    const sourcePreparationHash = chain.phase138_source_preparation_hash || 'placeholder';
    const sourceReviewHash = chain.phase137_source_review_hash || 'placeholder';

    // Compute source_simulation_hash
    const sourceSimHash = simEvidence.evidence_pack_hash;

    const nonExecutionAttestation = this._buildNonExecutionAttestation();

    const reviewRecord = {
      review_id: reviewId,
      source_simulation_id: simulationId,
      source_execution_id: simulation.source_execution_id,
      source_approval_id: null, // to be populated if needed
      source_preparation_id: null,
      source_review_id: null,
      cohort_id: simulation.cohort_id,
      tenant_id: simulation.tenant_id,
      simulation_type: simulation.simulation_type,
      review_status: 'DRAFT',
      review_decision: null,
      risk_level: 'LOW',
      confidence_level: 'HIGH',
      projected_impact_score: null,
      rollback_feasibility_score: null,
      evidence_completeness_score: null,
      guardrail_status: 'PASS',
      write_scope_status: 'PASS',
      reviewed_by: null,
      finalized_by: null,
      review_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      write_scope_attestation_json: writeScope,
      approval_readiness_json: {},
      review_blockers_json: {
        missing_evaluation: true,
        missing_decision: true
      },
      non_execution_attestation_json: nonExecutionAttestation,
      source_simulation_hash: sourceSimHash,
      source_simulation_evidence_pack_hash: simEvidence.evidence_pack_hash,
      source_execution_evidence_pack_hash: sourceExecutionEvidencePackHash,
      review_result_hash: null,
      evidence_pack_hash: null,
      created_at: new Date(),
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.reviews.set(reviewId, reviewRecord);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_simulation_reviews
         (review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
          review_status, risk_level, confidence_level, guardrail_status, write_scope_status,
          review_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
          write_scope_attestation_json, approval_readiness_json, review_blockers_json, non_execution_attestation_json,
          source_simulation_hash, source_simulation_evidence_pack_hash, source_execution_evidence_pack_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reviewId, simulationId, reviewRecord.source_execution_id, simulation.cohort_id, simulation.tenant_id, simulation.simulation_type,
          'DRAFT', 'LOW', 'HIGH', 'PASS', 'PASS',
          JSON.stringify(reviewRecord.review_summary_json), JSON.stringify(reviewRecord.impact_review_json),
          JSON.stringify(reviewRecord.rollback_review_json), JSON.stringify(reviewRecord.guardrail_review_json),
          JSON.stringify(writeScope), JSON.stringify(reviewRecord.approval_readiness_json),
          JSON.stringify(reviewRecord.review_blockers_json), JSON.stringify(nonExecutionAttestation),
          sourceSimHash, simEvidence.evidence_pack_hash, sourceExecutionEvidencePackHash
        ]
      );
    }

    await auditService.recordAuditEvent(reviewId, 'REVIEW_DRAFT_CREATED', actorId, {
      source_simulation_id: simulationId,
      cohort_id: simulation.cohort_id,
      tenant_id: simulation.tenant_id
    });

    return { review: reviewRecord };
  }
}

const serviceInstance = new CohortInterventionSimulationReviewBuilderService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationReviewBuilderService = CohortInterventionSimulationReviewBuilderService;
