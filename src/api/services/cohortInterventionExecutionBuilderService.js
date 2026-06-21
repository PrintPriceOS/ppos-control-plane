'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const workflowServicePhase139 = require('./cohortInterventionApprovalWorkflowService').serviceInstance || require('./cohortInterventionApprovalWorkflowService');
const builderServicePhase139 = require('./cohortInterventionApprovalBuilderService').serviceInstance || require('./cohortInterventionApprovalBuilderService');
const preparationReviewService = require('./cohortInterventionPreparationReviewService').serviceInstance || require('./cohortInterventionPreparationReviewService');
const auditService = require('./cohortInterventionExecutionAuditService').serviceInstance || require('./cohortInterventionExecutionAuditService');

class CohortInterventionExecutionBuilderService {
  constructor() {
    this._mockState = {
      executions: new Map(),
      steps: new Map(),
      dryRuns: new Map(),
      results: new Map(),
      rollbackPlans: new Map(),
      evidences: new Map()
    };
  }

  async getApprovalEvidence(approvalId, isProdLike) {
    if (!isProdLike) {
      const evidenceServicePhase139 = require('./cohortInterventionApprovalEvidencePackService').serviceInstance || require('./cohortInterventionApprovalEvidencePackService');
      return evidenceServicePhase139._mockState.evidence.get(approvalId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_approval_evidence WHERE approval_id = ?", [approvalId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getExecution(executionId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.executions.get(executionId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_executions WHERE execution_id = ?", [executionId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getSteps(executionId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.steps.get(executionId) || [];
    } else {
      return await db.query("SELECT * FROM controlled_beta_cohort_intervention_execution_steps WHERE execution_id = ?", [executionId]);
    }
  }

  async createExecution(approvalId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await workflowServicePhase139.getApproval(approvalId);
    if (!approval) {
      throw new Error('APPROVAL_NOT_FOUND');
    }

    if (approval.approval_status !== 'FINALIZED' && approval.approval_status !== 'APPROVED') {
      throw new Error('APPROVAL_NOT_FINALIZED');
    }

    if (approval.approval_decision !== 'APPROVE_FOR_FUTURE_EXECUTION') {
      throw new Error('INVALID_APPROVAL_DECISION');
    }

    const appEv = await this.getApprovalEvidence(approvalId, isProdLike);
    if (!appEv || appEv.evidence_schema_version !== '139.0') {
      throw new Error('APPROVAL_EVIDENCE_MISSING_OR_INVALID');
    }

    const prep = await preparationReviewService.getPreparation(approval.source_preparation_id);
    if (!prep || prep.preparation_status !== 'FINALIZED') {
      throw new Error('PREPARATION_NOT_FOUND_OR_NOT_FINALIZED');
    }

    const lineageHashes = {
      source_approval_hash: approval.approval_result_hash || 'placeholder_approval_hash',
      source_approval_evidence_pack_hash: appEv.evidence_pack_hash,
      source_preparation_hash: approval.source_preparation_hash,
      source_preparation_evidence_pack_hash: approval.source_preparation_evidence_pack_hash,
      source_review_evidence_pack_hash: approval.source_review_evidence_pack_hash
    };

    const executionId = 'exc_' + crypto.randomBytes(8).toString('hex');

    const defaultAttestation = {
      cohort_pause_executed: false,
      participant_access_restricted: false,
      invite_revoked: false,
      cohort_expanded: false,
      payment_action_triggered: false,
      provider_submission_triggered: false,
      tax_accounting_submission_triggered: false,
      public_marketplace_enabled: false,
      only_safe_scope_marker_or_task_created: true
    };

    const defaultBlockers = {
      missing_dry_run: true,
      missing_rollback_plan: true,
      missing_operator_confirmation: true,
      guardrail_failed: false,
      already_executed: false
    };

    const record = {
      execution_id: executionId,
      source_approval_id: approvalId,
      source_preparation_id: approval.source_preparation_id,
      source_review_id: approval.source_review_id,
      cohort_id: approval.cohort_id,
      tenant_id: approval.tenant_id,
      execution_type: approval.preparation_type.replace('PREPARE_', 'EXECUTE_'), // Maps e.g. PREPARE_OBSERVATION_EXTENSION -> EXECUTE_OBSERVATION_EXTENSION
      execution_status: 'DRAFT',
      risk_level: approval.risk_level,
      confidence_level: approval.confidence_level,
      dry_run_hash: null,
      operator_confirmed: false,
      operator_confirmed_by: null,
      operator_confirmed_at: null,
      operator_confirmation_phrase: null,
      operator_confirmation_signature: null,
      safe_scope_attestation_json: defaultAttestation,
      execution_blockers_json: defaultBlockers,
      execution_findings_json: [],
      lineage_hashes_json: lineageHashes,
      evidence_pack_hash: null,
      created_at: new Date(),
      updated_at: new Date(),
      started_at: null,
      finished_at: null,
      cancelled_at: null,
      cancelled_by: null,
      cancelled_reason: null,
      superseded_at: null,
      superseded_by_execution_id: null,
      superseded_reason: null
    };

    const steps = [
      {
        step_id: 'estp_' + crypto.randomBytes(8).toString('hex'),
        execution_id: executionId,
        step_key: 'dry_run',
        description: 'Generate dry-run mutation preview',
        status: 'PENDING',
        completed_at: null
      },
      {
        step_id: 'estp_' + crypto.randomBytes(8).toString('hex'),
        execution_id: executionId,
        step_key: 'rollback_plan',
        description: 'Establish rollback mitigation plan',
        status: 'PENDING',
        completed_at: null
      },
      {
        step_id: 'estp_' + crypto.randomBytes(8).toString('hex'),
        execution_id: executionId,
        step_key: 'operator_confirmation',
        description: 'Acquire manual operator confirmation phrase and signature',
        status: 'PENDING',
        completed_at: null
      }
    ];

    if (!isProdLike) {
      this._mockState.executions.set(executionId, record);
      this._mockState.steps.set(executionId, steps);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_executions
         (execution_id, source_approval_id, source_preparation_id, source_review_id, cohort_id, tenant_id, execution_type,
          execution_status, risk_level, confidence_level, safe_scope_attestation_json, execution_blockers_json,
          execution_findings_json, lineage_hashes_json, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.execution_id, record.source_approval_id, record.source_preparation_id, record.source_review_id, record.cohort_id, record.tenant_id, record.execution_type,
          record.execution_status, record.risk_level, record.confidence_level, JSON.stringify(record.safe_scope_attestation_json), JSON.stringify(record.execution_blockers_json),
          JSON.stringify(record.execution_findings_json), JSON.stringify(record.lineage_hashes_json), actorId
        ]
      );

      for (const step of steps) {
        await db.query(
          `INSERT INTO controlled_beta_cohort_intervention_execution_steps
           (step_id, execution_id, step_key, description, status)
           VALUES (?, ?, ?, ?, ?)`,
          [step.step_id, step.execution_id, step.step_key, step.description, step.status]
        );
      }
    }

    await auditService.recordAuditEvent(executionId, 'EXECUTION_CREATED', actorId, {
      source_approval_id: approvalId,
      execution_type: record.execution_type
    });

    return {
      execution: record,
      steps
    };
  }
}

const serviceInstance = new CohortInterventionExecutionBuilderService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionExecutionBuilderService = CohortInterventionExecutionBuilderService;
