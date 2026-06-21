'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const preparationReviewService = require('./cohortInterventionPreparationReviewService').serviceInstance || require('./cohortInterventionPreparationReviewService');
const builderServicePhase138 = require('./cohortInterventionPreparationBuilderService').serviceInstance || require('./cohortInterventionPreparationBuilderService');
const policyService = require('./cohortInterventionApprovalPolicyService').serviceInstance || require('./cohortInterventionApprovalPolicyService');
const auditService = require('./cohortInterventionApprovalAuditService').serviceInstance || require('./cohortInterventionApprovalAuditService');

class CohortInterventionApprovalBuilderService {
  constructor() {
    this._mockState = {
      approvals: new Map(),
      steps: new Map()
    };
  }

  async getPrepEvidence(preparationId, isProdLike) {
    if (!isProdLike) {
      const evidenceServicePhase138 = require('./cohortInterventionPreparationEvidencePackService');
      return evidenceServicePhase138._mockState.evidence.get(preparationId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_preparation_evidence WHERE preparation_id = ?", [preparationId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async createApproval(preparationId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const prep = await preparationReviewService.getPreparation(preparationId);
    if (!prep) {
      throw new Error('PREPARATION_NOT_FOUND');
    }

    if (prep.preparation_status !== 'FINALIZED') {
      throw new Error('PREPARATION_NOT_FINALIZED_CANNOT_APPROVE');
    }

    // Load prep evidence
    const prepEv = await this.getPrepEvidence(preparationId, isProdLike);
    if (!prepEv || prepEv.evidence_schema_version !== '138.0') {
      throw new Error('PREPARATION_EVIDENCE_MISSING_OR_INVALID');
    }

    // Lineage hashes
    const sourcePreparationEvidencePackHash = prepEv.evidence_pack_hash;
    const sourceReviewEvidencePackHash = prep.source_review_evidence_pack_hash || 'hash_placeholder';

    // Serialize prep to compute source_preparation_hash
    const prepPayload = {
      preparation_id: prep.preparation_id,
      source_review_id: prep.source_review_id,
      cohort_id: prep.cohort_id,
      tenant_id: prep.tenant_id,
      preparation_type: prep.preparation_type,
      preparation_status: prep.preparation_status,
      risk_level: prep.risk_level,
      confidence_level: prep.confidence_level
    };
    const sourcePreparationHash = crypto.createHash('sha256').update(JSON.stringify(prepPayload)).digest('hex');

    // Run policy rules to determine required roles
    const policy = policyService.determineRequiredApprovers(prep.preparation_type, prep.risk_level);

    const approvalId = 'apv_' + crypto.randomBytes(8).toString('hex');

    const defaultAttestation = {
      approval_executed_intervention: false,
      cohort_access_mutated: false,
      participant_access_mutated: false,
      invite_access_mutated: false,
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

    const defaultBlockers = {
      missing_evidence_pack: true,
      missing_required_signatures: true,
      non_execution_attestation_invalid: false,
      guardrail_failed: false,
      source_preparation_not_finalized: false
    };

    const record = {
      approval_id: approvalId,
      source_preparation_id: preparationId,
      source_review_id: prep.source_review_id,
      cohort_id: prep.cohort_id,
      tenant_id: prep.tenant_id,
      preparation_type: prep.preparation_type,
      recommended_decision_from_phase137: prep.recommended_decision_from_phase137,
      approval_status: 'DRAFT',
      approval_decision: null,
      risk_level: prep.risk_level,
      confidence_level: prep.confidence_level,
      approval_policy_json: { policy_name: policy.policyName, required_roles: policy.requiredRoles },
      required_approvers_json: policy.requiredRoles.map(role => ({ role, signed: false, signed_by: null })),
      approval_steps_json: policy.requiredRoles.map(role => ({ step_key: `sign_${role}`, description: `Signature required from ${role}`, status: 'PENDING' })),
      approval_findings_json: [],
      approval_blockers_json: defaultBlockers,
      non_execution_attestation_json: defaultAttestation,
      source_preparation_hash: sourcePreparationHash,
      source_preparation_evidence_pack_hash: sourcePreparationEvidencePackHash,
      source_review_evidence_pack_hash: sourceReviewEvidencePackHash,
      approval_result_hash: null,
      evidence_pack_hash: null,
      requested_by: actorId,
      reviewed_by: null,
      approved_by: null,
      rejected_by: null,
      created_at: new Date(),
      updated_at: new Date(),
      reviewed_at: null,
      approved_at: null,
      rejected_at: null,
      finalized_at: null,
      superseded_at: null,
      superseded_by_approval_id: null,
      superseded_reason: null,
      rejected_reason: null
    };

    const steps = policy.requiredRoles.map(role => ({
      step_id: 'stp_' + crypto.randomBytes(8).toString('hex'),
      approval_id: approvalId,
      role: role,
      approver_id: null,
      status: 'PENDING',
      signed_at: null,
      created_at: new Date()
    }));

    if (!isProdLike) {
      this._mockState.approvals.set(approvalId, record);
      this._mockState.steps.set(approvalId, steps);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_approvals
         (approval_id, source_preparation_id, source_review_id, cohort_id, tenant_id, preparation_type,
          recommended_decision_from_phase137, approval_status, risk_level, confidence_level,
          approval_policy_json, required_approvers_json, approval_steps_json, approval_findings_json,
          approval_blockers_json, non_execution_attestation_json, source_preparation_hash,
          source_preparation_evidence_pack_hash, source_review_evidence_pack_hash, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.approval_id, record.source_preparation_id, record.source_review_id, record.cohort_id, record.tenant_id, record.preparation_type,
          record.recommended_decision_from_phase137, record.approval_status, record.risk_level, record.confidence_level,
          JSON.stringify(record.approval_policy_json), JSON.stringify(record.required_approvers_json), JSON.stringify(record.approval_steps_json), JSON.stringify(record.approval_findings_json),
          JSON.stringify(record.approval_blockers_json), JSON.stringify(record.non_execution_attestation_json), record.source_preparation_hash,
          record.source_preparation_evidence_pack_hash, record.source_review_evidence_pack_hash, record.requested_by
        ]
      );

      for (const step of steps) {
        await db.query(
          `INSERT INTO controlled_beta_cohort_intervention_approval_steps
           (step_id, approval_id, role, status)
           VALUES (?, ?, ?, ?)`,
          [step.step_id, step.approval_id, step.role, step.status]
        );
      }
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_CREATED', actorId, {
      source_preparation_id: preparationId,
      policy_name: policy.policyName
    });

    return {
      approval: record,
      steps
    };
  }
}

const serviceInstance = new CohortInterventionApprovalBuilderService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionApprovalBuilderService = CohortInterventionApprovalBuilderService;
