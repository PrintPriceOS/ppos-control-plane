'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const readinessBuilderSvc = require('./cohortInterventionExecutionReadinessBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionAuthorizationAuditService').serviceInstance;

class CohortInterventionExecutionAuthorizationBuilderService {
  constructor() {
    this._mockState = {
      auth: new Map(),
      rules: new Map()
    };
  }

  async createAuth(readinessId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 145 readiness
    const readiness = await readinessBuilderSvc.getReadiness(readinessId);
    if (!readiness) {
      throw new Error('PHASE145_READINESS_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (readiness.readiness_status !== 'FINALIZED') {
      throw new Error('PHASE145_READINESS_NOT_FINALIZED');
    }
    if (readiness.readiness_decision !== 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED') {
      throw new Error('PHASE145_READINESS_NOT_APPROVED');
    }
    if (readiness.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE145_EXECUTION_CAPABILITY_VIOLATION');
    }

    const authId = 'ath_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const canaryEnvelope = {
      mode: 'NO_OP_OR_CANARY_ONLY',
      max_cohorts: 0,
      max_participants: 0,
      max_invites: 0,
      max_runtime_mutations: 0,
      requires_manual_confirmation: true,
      kill_switch_required: true,
      rollback_required: true
    };

    const writeScopeAttestation = {
      writes_only_phase146_tables: true,
      wrote_phase128_to_145_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const authRecord = {
      auth_id: authId,
      source_readiness_id: readiness.readiness_id,
      source_approval_id: readiness.source_approval_id,
      source_prep_id: readiness.source_prep_id,
      source_review_id: readiness.source_review_id,
      source_simulation_id: readiness.source_simulation_id,
      source_execution_id: readiness.source_execution_id,
      cohort_id: readiness.cohort_id,
      tenant_id: readiness.tenant_id,
      simulation_type: readiness.simulation_type,
      auth_status: 'DRAFT',
      auth_decision: null,
      risk_level: readiness.risk_level,
      confidence_level: readiness.confidence_level,
      projected_impact_score: readiness.projected_impact_score,
      rollback_feasibility_score: readiness.rollback_feasibility_score,
      evidence_completeness_score: readiness.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: canaryEnvelope,
      auth_summary_json: {},
      impact_review_json: readiness.impact_review_json || {},
      rollback_review_json: readiness.rollback_review_json || {},
      guardrail_review_json: readiness.guardrail_review_json || {},
      auth_rules_json: {},
      auth_blockers_json: { missing_authorization_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_readiness_hash: readiness.readiness_result_hash || 'none',
      source_readiness_evidence_pack_hash: readiness.evidence_pack_hash || 'none',
      auth_result_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      execution_authorization_status: 'EXECUTION_AUTHORIZED_NOT_ACTIVE',
      auth_execution_status: 'AUTHORIZATION_APPROVED_NOT_EXECUTED',
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
      this._mockState.auth.set(authId, authRecord);
      this._mockState.rules.set(authId, []);
      await auditSvc.createAuditLog(authId, 'AUTHORIZATION_DRAFT_CREATED', actorId, { source_readiness_id: readinessId });
      return { auth: authRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_auth
       (auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, auth_status, auth_decision, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, auth_rules_json, auth_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_readiness_hash, source_readiness_evidence_pack_hash,
        execution_capability_status, execution_authorization_status, auth_execution_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_authorization_evaluation":true}', ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'EXECUTION_AUTHORIZED_NOT_ACTIVE', 'AUTHORIZATION_APPROVED_NOT_EXECUTED', ?, ?)`,
      [
        authId, readiness.readiness_id, readiness.source_approval_id, readiness.source_prep_id, readiness.source_review_id,
        readiness.source_simulation_id, readiness.source_execution_id, readiness.cohort_id, readiness.tenant_id,
        readiness.simulation_type, readiness.risk_level, readiness.confidence_level, readiness.projected_impact_score,
        readiness.rollback_feasibility_score, readiness.evidence_completeness_score, JSON.stringify(canaryEnvelope),
        JSON.stringify(readiness.impact_review_json || {}), JSON.stringify(readiness.rollback_review_json || {}),
        JSON.stringify(readiness.guardrail_review_json || {}), JSON.stringify(nonExecutionAttestation),
        JSON.stringify(writeScopeAttestation), readiness.readiness_result_hash || 'none', readiness.evidence_pack_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(authId, 'AUTHORIZATION_DRAFT_CREATED', actorId, { source_readiness_id: readinessId });
    return { auth: authRecord };
  }

  async getAuth(authId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.auth.get(authId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_exec_auth WHERE auth_id = ?`,
      [authId]
    );
    return rows[0] || null;
  }

  async listAuth() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.auth.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_exec_auth ORDER BY created_at DESC`);
  }

  async updateAuth(authId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getAuth(authId);
    if (!original) throw new Error('AUTHORIZATION_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.auth.set(authId, updated);
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

    values.push(authId);
    await db.query(
      `UPDATE cb_cohort_intervention_exec_auth SET ${updatePairs.join(', ')} WHERE auth_id = ?`,
      values
    );

    return updated;
  }

  async createRule(authId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      auth_id: authId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(authId)) {
        this._mockState.rules.set(authId, []);
      }
      this._mockState.rules.get(authId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_auth_rules
       (rule_id, auth_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, authId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(authId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(authId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_exec_auth_rules WHERE auth_id = ? ORDER BY created_at ASC`,
      [authId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionAuthorizationBuilderService();
module.exports = {
  CohortInterventionExecutionAuthorizationBuilderService,
  serviceInstance
};
