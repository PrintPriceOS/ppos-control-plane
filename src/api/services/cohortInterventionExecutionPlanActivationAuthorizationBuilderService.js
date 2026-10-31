'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const rdBuilderSvc = require('./cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationAuthorizationAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationAuthorizationBuilderService {
  constructor() {
    this._mockState = {
      authorization: new Map(),
      rules: new Map()
    };
  }

  async createAuthorization(activationRdId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 150 readiness
    const rd = await rdBuilderSvc.getReadiness(activationRdId);
    if (!rd) {
      throw new Error('PHASE150_READINESS_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (rd.activation_readiness_status !== 'FINALIZED') {
      throw new Error('PHASE150_READINESS_NOT_FINALIZED');
    }
    if (rd.activation_readiness_result !== 'ACTIVATION_READY_NOT_ACTIVE') {
      throw new Error('PHASE150_READINESS_NOT_APPROVED');
    }
    if (rd.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE150_EXECUTION_CAPABILITY_VIOLATION');
    }

    const activationAuthId = 'aau_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const authConfig = {
      authorization_mode: 'ACTIVATION_AUTHORIZATION_ONLY',
      activation_authorization_status: 'AUTHORIZED_NOT_ACTIVE',
      allow_real_activation: false,
      allow_real_execution: false,
      allow_plan_executable_state: false,
      allow_job_creation: false,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      requires_future_activation_lock_gate: true,
      requires_kill_switch: true,
      requires_rollback_authority: true,
      requires_operator_confirmation: true,
      requires_governance_signature: true,
      requires_parent_readiness_hash_verification: true
    };

    const writeScopeAttestation = {
      writes_only_phase151_tables: true,
      wrote_phase128_to_150_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const authRecord = {
      activation_auth_id: activationAuthId,
      source_activation_readiness_id: rd.activation_rd_id,
      source_plan_id: rd.source_plan_id,
      source_dispatcher_id: rd.source_dispatcher_id,
      source_envelope_id: rd.source_envelope_id,
      source_auth_id: rd.source_auth_id,
      source_readiness_id: rd.source_readiness_id,
      source_approval_id: rd.source_approval_id,
      source_prep_id: rd.source_prep_id,
      source_review_id: rd.source_review_id,
      source_simulation_id: rd.source_simulation_id,
      source_execution_id: rd.source_execution_id,
      cohort_id: rd.cohort_id,
      tenant_id: rd.tenant_id,
      simulation_type: rd.simulation_type,
      activation_auth_status: 'DRAFT',
      activation_auth_result: null,
      risk_level: rd.risk_level,
      confidence_level: rd.confidence_level,
      projected_impact_score: rd.projected_impact_score,
      rollback_feasibility_score: rd.rollback_feasibility_score,
      evidence_completeness_score: rd.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: authConfig,
      auth_summary_json: {},
      impact_review_json: rd.impact_review_json || {},
      rollback_review_json: rd.rollback_review_json || {},
      guardrail_review_json: rd.guardrail_review_json || {},
      auth_rules_json: {},
      auth_blockers_json: { missing_authorization_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_activation_readiness_hash: rd.activation_readiness_hash || 'none',
      activation_authorization_hash: null,
      authorization_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'AUTHORIZATION_FINALIZED_NOT_EXECUTED',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
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
      this._mockState.authorization.set(activationAuthId, authRecord);
      this._mockState.rules.set(activationAuthId, []);
      await auditSvc.createAuditLog(activationAuthId, 'AUTHORIZATION_DRAFT_CREATED', actorId, { source_activation_readiness_id: activationRdId });
      return { authorization: authRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_auth
       (activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, activation_auth_status, activation_auth_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, auth_rules_json, auth_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_activation_readiness_hash,
        execution_capability_status, activation_execution_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_authorization_evaluation":true}', ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'AUTHORIZATION_FINALIZED_NOT_EXECUTED', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        activationAuthId, rd.activation_rd_id, rd.source_plan_id, rd.source_dispatcher_id, rd.source_envelope_id, rd.source_auth_id, rd.source_readiness_id,
        rd.source_approval_id, rd.source_prep_id, rd.source_review_id, rd.source_simulation_id, rd.source_execution_id,
        rd.cohort_id, rd.tenant_id, rd.simulation_type,
        rd.risk_level, rd.confidence_level, rd.projected_impact_score, rd.rollback_feasibility_score,
        rd.evidence_completeness_score, JSON.stringify(authConfig), JSON.stringify(rd.impact_review_json || {}),
        JSON.stringify(rd.rollback_review_json || {}), JSON.stringify(rd.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), rd.activation_readiness_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(activationAuthId, 'AUTHORIZATION_DRAFT_CREATED', actorId, { source_activation_readiness_id: activationRdId });
    return { authorization: authRecord };
  }

  async getAuthorization(activationAuthId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.authorization.get(activationAuthId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_auth WHERE activation_auth_id = ?`,
      [activationAuthId]
    );
    return rows[0] || null;
  }

  async listAuthorization() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.authorization.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_auth ORDER BY created_at DESC`);
  }

  async updateAuthorization(activationAuthId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getAuthorization(activationAuthId);
    if (!original) throw new Error('AUTHORIZATION_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.authorization.set(activationAuthId, updated);
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

    values.push(activationAuthId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_auth SET ${updatePairs.join(', ')} WHERE activation_auth_id = ?`,
      values
    );

    return updated;
  }

  async createRule(activationAuthId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      activation_auth_id: activationAuthId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(activationAuthId)) {
        this._mockState.rules.set(activationAuthId, []);
      }
      this._mockState.rules.get(activationAuthId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_auth_rules
       (rule_id, activation_auth_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, activationAuthId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(activationAuthId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(activationAuthId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_auth_rules WHERE activation_auth_id = ? ORDER BY created_at ASC`,
      [activationAuthId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationAuthorizationBuilderService();
module.exports = {
  CohortInterventionExecutionPlanActivationAuthorizationBuilderService,
  serviceInstance
};
