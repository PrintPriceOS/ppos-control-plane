'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const prepBuilderSvc = require('./cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationBuilderService');

class CohortInterventionSimulationApprovalBuilderService {
  constructor() {
    this._mockState = {
      approvals: new Map(),
      findings: new Map()
    };
  }

  async createApproval(prepId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch source Phase 143 prep
    const prep = await prepBuilderSvc.getPrep(prepId);
    if (!prep) {
      throw new Error('PHASE143_PREPARATION_NOT_FOUND');
    }

    // 2. Validate finalized & correct status
    if (prep.prep_status !== 'FINALIZED') {
      throw new Error('PHASE143_PREPARATION_NOT_FINALIZED');
    }
    if (prep.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE143_EXECUTION_CAPABILITY_VIOLATION');
    }

    const approvalId = 'apv_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const writeScopeAttestation = {
      writes_only_phase144_tables: true,
      wrote_phase128_to_143_operational_tables: false
    };

    const nonExecutionAttestation = {
      zero_runtime_mutation_capability: true,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED',
      future_execution_eligibility_status: 'NOT_ELIGIBLE'
    };

    const approvalRecord = {
      approval_id: approvalId,
      source_prep_id: prepId,
      source_review_id: prep.source_review_id,
      source_simulation_id: prep.source_simulation_id,
      source_execution_id: prep.source_execution_id,
      cohort_id: prep.cohort_id,
      tenant_id: prep.tenant_id,
      simulation_type: prep.simulation_type,
      approval_status: 'DRAFT',
      approval_decision: null,
      risk_level: prep.risk_level || 'LOW',
      confidence_level: prep.confidence_level || 'HIGH',
      projected_impact_score: prep.projected_impact_score !== null ? Number(prep.projected_impact_score) : null,
      rollback_feasibility_score: prep.rollback_feasibility_score !== null ? Number(prep.rollback_feasibility_score) : null,
      evidence_completeness_score: prep.evidence_completeness_score !== null ? Number(prep.evidence_completeness_score) : null,
      guardrail_status: 'PASS',
      write_scope_status: 'PASS',
      approved_by: null,
      finalized_by: null,
      approval_summary_json: {},
      impact_review_json: typeof prep.impact_review_json === 'string' ? JSON.parse(prep.impact_review_json) : prep.impact_review_json,
      rollback_review_json: typeof prep.rollback_review_json === 'string' ? JSON.parse(prep.rollback_review_json) : prep.rollback_review_json,
      guardrail_review_json: typeof prep.guardrail_review_json === 'string' ? JSON.parse(prep.guardrail_review_json) : prep.guardrail_review_json,
      write_scope_attestation_json: writeScopeAttestation,
      approval_readiness_json: {},
      approval_blockers_json: { missing_evaluation: true, missing_decision: true },
      non_execution_attestation_json: nonExecutionAttestation,
      source_prep_hash: prep.prep_result_hash || 'placeholder',
      source_prep_evidence_pack_hash: prep.evidence_pack_hash || 'placeholder',
      approval_result_hash: null,
      evidence_pack_hash: null,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED',
      future_execution_eligibility_status: 'NOT_ELIGIBLE',
      created_at: created,
      updated_at: created,
      approved_at: null,
      finalized_at: null,
      superseded_at: null
    };

    if (!isProdLike) {
      this._mockState.approvals.set(approvalId, approvalRecord);
      this._mockState.findings.set(approvalId, []);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_approvals
         (approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
          cohort_id, tenant_id, simulation_type, approval_status, approval_decision, risk_level, confidence_level,
          projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status, write_scope_status,
          write_scope_attestation_json, approval_readiness_json, approval_blockers_json, non_execution_attestation_json,
          source_prep_hash, source_prep_evidence_pack_hash, execution_capability_status, approval_execution_status, future_execution_eligibility_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PASS', 'PASS', ?, '{}', ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED', 'NOT_ELIGIBLE')`,
        [
          approvalId, prepId, prep.source_review_id, prep.source_simulation_id, prep.source_execution_id,
          prep.cohort_id, prep.tenant_id, prep.simulation_type,
          approvalRecord.risk_level, approvalRecord.confidence_level,
          approvalRecord.projected_impact_score, approvalRecord.rollback_feasibility_score, approvalRecord.evidence_completeness_score,
          JSON.stringify(writeScopeAttestation),
          JSON.stringify(approvalRecord.approval_blockers_json),
          JSON.stringify(nonExecutionAttestation),
          approvalRecord.source_prep_hash, approvalRecord.source_prep_evidence_pack_hash
        ]
      );
    }

    const auditService = require('./cohortInterventionSimulationApprovalAuditService').serviceInstance || require('./cohortInterventionSimulationApprovalAuditService');
    await auditService.recordAuditEvent(approvalId, 'APPROVAL_DRAFT_CREATED', actorId, { source_prep_id: prepId });

    return { approval: approvalRecord };
  }

  async getApproval(approvalId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.approvals.get(approvalId) || null;
    } else {
      const rows = await db.query('SELECT * FROM controlled_beta_cohort_intervention_approvals WHERE approval_id = ?', [approvalId]);
      return rows.length > 0 ? rows[0] : null;
    }
  }

  async getApprovals() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return Array.from(this._mockState.approvals.values());
    } else {
      return await db.query('SELECT * FROM controlled_beta_cohort_intervention_approvals ORDER BY created_at DESC');
    }
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalBuilderService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalBuilderService = CohortInterventionSimulationApprovalBuilderService;
