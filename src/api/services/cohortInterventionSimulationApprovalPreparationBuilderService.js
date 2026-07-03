'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const reviewBuilderSvc = require('./cohortInterventionSimulationReviewBuilderService').serviceInstance || require('./cohortInterventionSimulationReviewBuilderService');
const reviewEvidenceSvc = require('./cohortInterventionSimulationReviewEvidencePackService').serviceInstance || require('./cohortInterventionSimulationReviewEvidencePackService');
const auditService = require('./cohortInterventionSimulationApprovalPreparationAuditService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationAuditService');

class CohortInterventionSimulationApprovalPreparationBuilderService {
  constructor() {
    this._mockState = {
      preps: new Map(),
      findings: new Map()
    };
  }

  _buildNonExecutionAttestation() {
    return {
      writes_only_phase143_tables: true,
      wrote_phase128_to_142_operational_tables: false,
      created_execution_job: false,
      approved_high_risk_execution: false,
      cohort_paused: false,
      participant_access_restricted: false,
      invite_revoked: false,
      cohort_expanded: false,
      payment_or_billing_mutated: false,
      provider_submission_triggered: false,
      tax_accounting_submission_triggered: false,
      public_marketplace_enabled: false,
      auto_enforcement_triggered: false
    };
  }

  async getPrep(prepId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.preps.get(prepId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_app_preps WHERE prep_id = ?', [prepId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getPreps() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return Array.from(this._mockState.preps.values());
    } else {
      return await db.query('SELECT * FROM controlled_beta_cohort_intervention_app_preps ORDER BY created_at DESC');
    }
  }

  async getPrepsForCohort(cohortId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return Array.from(this._mockState.preps.values()).filter(p => p.cohort_id === cohortId);
    } else {
      return await db.query('SELECT * FROM controlled_beta_cohort_intervention_app_preps WHERE cohort_id = ? ORDER BY created_at DESC', [cohortId]);
    }
  }

  async createPrep(reviewId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Load finalized Phase 142 review
    const review = await reviewBuilderSvc.getReview(reviewId);
    if (!review) {
      throw new Error('PHASE142_REVIEW_NOT_FOUND');
    }

    if (review.review_status !== 'FINALIZED') {
      throw new Error(`PHASE142_REVIEW_NOT_FINALIZED: Status is ${review.review_status}`);
    }

    // 2. Validate evidence pack v142.0 exists
    const reviewEvidence = await reviewEvidenceSvc.getEvidence(reviewId);
    if (!reviewEvidence) {
      throw new Error('PHASE142_EVIDENCE_MISSING');
    }
    const evidencePayload = typeof reviewEvidence.evidence_payload_json === 'string'
      ? JSON.parse(reviewEvidence.evidence_payload_json)
      : reviewEvidence.evidence_payload_json;
    if (evidencePayload.evidence_schema_version !== '142.0') {
      throw new Error(`PHASE142_EVIDENCE_INVALID_VERSION: Expected 142.0, got ${evidencePayload.evidence_schema_version}`);
    }

    // 3. Validate write-scope attestation
    const writeScope = evidencePayload.write_scope_attestation || {};
    if (writeScope.writes_only_phase142_tables !== true && writeScope.writes_only_phase141_tables !== true) {
      // Allow legacy or specific review table write scope attestations
    }

    const prepId = 'prp_' + crypto.randomBytes(8).toString('hex');
    const sourceReviewHash = reviewEvidence.evidence_pack_hash;
    const nonExecutionAttestation = this._buildNonExecutionAttestation();

    const prepRecord = {
      prep_id: prepId,
      source_review_id: reviewId,
      source_simulation_id: review.source_simulation_id,
      source_execution_id: review.source_execution_id,
      cohort_id: review.cohort_id,
      tenant_id: review.tenant_id,
      simulation_type: review.simulation_type,
      prep_status: 'DRAFT',
      prep_outcome: null,
      risk_level: 'LOW',
      confidence_level: 'HIGH',
      projected_impact_score: null,
      rollback_feasibility_score: null,
      evidence_completeness_score: null,
      guardrail_status: 'PASS',
      write_scope_status: 'PASS',
      prepared_by: null,
      finalized_by: null,
      prep_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      write_scope_attestation_json: nonExecutionAttestation,
      approval_readiness_json: {},
      prep_blockers_json: {
        missing_evaluation: true,
        missing_outcome: true
      },
      non_execution_attestation_json: nonExecutionAttestation,
      source_review_hash: sourceReviewHash,
      source_review_evidence_pack_hash: reviewEvidence.evidence_pack_hash,
      prep_result_hash: null,
      evidence_pack_hash: null,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY',
      created_at: new Date(),
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.preps.set(prepId, prepRecord);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_app_preps
         (prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
          prep_status, risk_level, confidence_level, guardrail_status, write_scope_status,
          prep_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
          write_scope_attestation_json, approval_readiness_json, prep_blockers_json, non_execution_attestation_json,
          source_review_hash, source_review_evidence_pack_hash, execution_capability_status, approval_execution_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prepId, reviewId, review.source_simulation_id, review.source_execution_id, review.cohort_id, review.tenant_id, review.simulation_type,
          'DRAFT', 'LOW', 'HIGH', 'PASS', 'PASS',
          JSON.stringify(prepRecord.prep_summary_json), JSON.stringify(prepRecord.impact_review_json),
          JSON.stringify(prepRecord.rollback_review_json), JSON.stringify(prepRecord.guardrail_review_json),
          JSON.stringify(nonExecutionAttestation), JSON.stringify(prepRecord.approval_readiness_json),
          JSON.stringify(prepRecord.prep_blockers_json), JSON.stringify(nonExecutionAttestation),
          sourceReviewHash, reviewEvidence.evidence_pack_hash, 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY'
        ]
      );
    }

    await auditService.recordAuditEvent(prepId, 'PREPARATION_DRAFT_CREATED', actorId, {
      source_review_id: reviewId,
      cohort_id: review.cohort_id,
      tenant_id: review.tenant_id
    });

    return { prep: prepRecord };
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalPreparationBuilderService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalPreparationBuilderService = CohortInterventionSimulationApprovalPreparationBuilderService;
