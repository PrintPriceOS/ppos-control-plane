'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const approvalBuilderSvc = require('./cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalBuilderService');
const auditSvc = require('./cohortInterventionExecutionReadinessAuditService').serviceInstance;

class CohortInterventionExecutionReadinessBuilderService {
  constructor() {
    this._mockState = {
      readiness: new Map(),
      checks: new Map()
    };
  }

  async createReadiness(approvalId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch source Phase 144 approval
    const approval = await approvalBuilderSvc.getApproval(approvalId);
    if (!approval) {
      throw new Error('PHASE144_APPROVAL_NOT_FOUND');
    }

    // 2. Validate finalized and correct status
    if (approval.approval_status !== 'FINALIZED') {
      throw new Error('PHASE144_APPROVAL_NOT_FINALIZED');
    }
    if (approval.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE144_EXECUTION_CAPABILITY_VIOLATION');
    }

    const readinessId = 'rd_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const writeScopeAttestation = {
      writes_only_phase145_tables: true,
      wrote_phase128_to_144_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const readinessRecord = {
      readiness_id: readinessId,
      source_approval_id: approval.approval_id,
      source_prep_id: approval.source_prep_id,
      source_review_id: approval.source_review_id,
      source_simulation_id: approval.source_simulation_id,
      source_execution_id: approval.source_execution_id,
      cohort_id: approval.cohort_id,
      tenant_id: approval.tenant_id,
      simulation_type: approval.simulation_type,
      readiness_status: 'DRAFT',
      readiness_decision: null,
      risk_level: approval.risk_level,
      confidence_level: approval.confidence_level,
      projected_impact_score: approval.projected_impact_score,
      rollback_feasibility_score: approval.rollback_feasibility_score,
      evidence_completeness_score: approval.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      kill_switch_status: 'PENDING',
      rollback_authority_status: 'PENDING',
      readiness_summary_json: {},
      impact_review_json: approval.impact_review_json || {},
      rollback_review_json: approval.rollback_review_json || {},
      guardrail_review_json: approval.guardrail_review_json || {},
      readiness_checks_json: {},
      readiness_blockers_json: { missing_readiness_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_approval_hash: approval.approval_result_hash || 'none',
      source_approval_evidence_pack_hash: approval.evidence_pack_hash || 'none',
      readiness_result_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      execution_readiness_status: 'EXECUTION_READY_NOT_ACTIVE',
      readiness_execution_status: 'READINESS_APPROVED_NOT_EXECUTED',
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      finalized_by: null,
      finalized_at: null,
      created_at: created,
      updated_at: created
    };

    if (!isProdLike) {
      this._mockState.readiness.set(readinessId, readinessRecord);
      this._mockState.checks.set(readinessId, []);
      await auditSvc.createAuditLog(readinessId, 'READINESS_DRAFT_CREATED', actorId, { source_approval_id: approvalId });
      return { readiness: readinessRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_readiness
       (readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, readiness_status, readiness_decision, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, kill_switch_status, rollback_authority_status, readiness_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, readiness_checks_json, readiness_blockers_json,
        non_execution_attestation_json, write_scope_attestation_json, source_approval_hash, source_approval_evidence_pack_hash,
        execution_capability_status, execution_readiness_status, readiness_execution_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', 'PENDING', 'PENDING', '{}', ?, ?, ?, '{}', '{"missing_readiness_evaluation":true}', ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'EXECUTION_READY_NOT_ACTIVE', 'READINESS_APPROVED_NOT_EXECUTED', ?, ?)`,
      [
        readinessId, approval.approval_id, approval.source_prep_id, approval.source_review_id,
        approval.source_simulation_id, approval.source_execution_id, approval.cohort_id, approval.tenant_id,
        approval.simulation_type, approval.risk_level, approval.confidence_level, approval.projected_impact_score,
        approval.rollback_feasibility_score, approval.evidence_completeness_score,
        JSON.stringify(approval.impact_review_json || {}), JSON.stringify(approval.rollback_review_json || {}),
        JSON.stringify(approval.guardrail_review_json || {}), JSON.stringify(nonExecutionAttestation),
        JSON.stringify(writeScopeAttestation), approval.approval_result_hash || 'none', approval.evidence_pack_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(readinessId, 'READINESS_DRAFT_CREATED', actorId, { source_approval_id: approvalId });
    return { readiness: readinessRecord };
  }

  async getReadiness(readinessId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.readiness.get(readinessId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_exec_readiness WHERE readiness_id = ?`,
      [readinessId]
    );
    return rows[0] || null;
  }

  async listReadiness() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.readiness.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_exec_readiness ORDER BY created_at DESC`);
  }

  async updateReadiness(readinessId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getReadiness(readinessId);
    if (!original) throw new Error('READINESS_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.readiness.set(readinessId, updated);
      return updated;
    }

    const updatePairs = [];
    const values = [];
    for (const [k, v] of Object.entries(fields)) {
      updatePairs.push(`${k} = ?`);
      if (typeof v === 'object' && v !== null) {
        values.push(JSON.stringify(v));
      } else {
        values.push(v);
      }
    }
    updatePairs.push(`updated_at = NOW()`);

    values.push(readinessId);
    await db.query(
      `UPDATE cb_cohort_intervention_exec_readiness SET ${updatePairs.join(', ')} WHERE readiness_id = ?`,
      values
    );

    return updated;
  }

  async createCheck(readinessId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const checkId = 'chk_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const checkRecord = {
      check_id: checkId,
      readiness_id: readinessId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.checks.has(readinessId)) {
        this._mockState.checks.set(readinessId, []);
      }
      this._mockState.checks.get(readinessId).push(checkRecord);
      return checkRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_ready_checks
       (check_id, readiness_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [checkId, readinessId, checkType, severity, description, created]
    );
    return checkRecord;
  }

  async getChecks(readinessId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.checks.get(readinessId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_exec_ready_checks WHERE readiness_id = ? ORDER BY created_at ASC`,
      [readinessId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionReadinessBuilderService();
module.exports = {
  CohortInterventionExecutionReadinessBuilderService,
  serviceInstance
};
