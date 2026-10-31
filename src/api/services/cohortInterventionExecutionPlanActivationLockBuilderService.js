'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const authBuilderSvc = require('./cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationLockAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationLockBuilderService {
  constructor() {
    this._mockState = {
      lock: new Map(),
      rules: new Map()
    };
  }

  async createLock(activationAuthId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 151 authorization
    const auth = await authBuilderSvc.getAuthorization(activationAuthId);
    if (!auth) {
      throw new Error('PHASE151_AUTHORIZATION_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (auth.activation_auth_status !== 'FINALIZED') {
      throw new Error('PHASE151_AUTHORIZATION_NOT_FINALIZED');
    }
    if (auth.activation_auth_result !== 'AUTHORIZED_NOT_ACTIVE') {
      throw new Error('PHASE151_AUTHORIZATION_NOT_APPROVED');
    }
    if (auth.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE151_EXECUTION_CAPABILITY_VIOLATION');
    }

    const activationLockId = 'alk_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const lockConfig = {
      lock_mode: 'PRE_EXECUTION_FREEZE_ONLY',
      activation_lock_status: 'LOCKED_NOT_ACTIVE',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      allow_real_activation: false,
      allow_real_execution: false,
      allow_plan_executable_state: false,
      allow_job_creation: false,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      requires_future_go_no_go_gate: true,
      requires_kill_switch: true,
      requires_rollback_authority: true,
      requires_operator_confirmation: true,
      requires_authorization_hash_verification: true,
      immutable_after_finalization: true
    };

    const writeScopeAttestation = {
      writes_only_phase152_tables: true,
      wrote_phase128_to_151_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const lockRecord = {
      activation_lock_id: activationLockId,
      source_activation_auth_id: auth.activation_auth_id,
      source_activation_readiness_id: auth.source_activation_readiness_id,
      source_plan_id: auth.source_plan_id,
      source_dispatcher_id: auth.source_dispatcher_id,
      source_envelope_id: auth.source_envelope_id,
      source_auth_id: auth.source_auth_id,
      source_readiness_id: auth.source_readiness_id,
      source_approval_id: auth.source_approval_id,
      source_prep_id: auth.source_prep_id,
      source_review_id: auth.source_review_id,
      source_simulation_id: auth.source_simulation_id,
      source_execution_id: auth.source_execution_id,
      cohort_id: auth.cohort_id,
      tenant_id: auth.tenant_id,
      simulation_type: auth.simulation_type,
      activation_lock_status: 'DRAFT',
      activation_lock_result: null,
      risk_level: auth.risk_level,
      confidence_level: auth.confidence_level,
      projected_impact_score: auth.projected_impact_score,
      rollback_feasibility_score: auth.rollback_feasibility_score,
      evidence_completeness_score: auth.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: lockConfig,
      lock_summary_json: {},
      impact_review_json: auth.impact_review_json || {},
      rollback_review_json: auth.rollback_review_json || {},
      guardrail_review_json: auth.guardrail_review_json || {},
      lock_rules_json: {},
      lock_blockers_json: { missing_lock_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_activation_authorization_hash: auth.activation_authorization_hash || 'none',
      activation_lock_hash: null,
      freeze_package_hash: null,
      lock_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'LOCK_FINALIZED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
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
      this._mockState.lock.set(activationLockId, lockRecord);
      this._mockState.rules.set(activationLockId, []);
      await auditSvc.createAuditLog(activationLockId, 'LOCK_DRAFT_CREATED', actorId, { source_activation_auth_id: activationAuthId });
      return { lock: lockRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_lock
       (activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, activation_lock_status, activation_lock_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, lock_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, lock_rules_json, lock_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_activation_authorization_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_lock_evaluation":true}', ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'LOCK_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        activationLockId, auth.activation_auth_id, auth.source_activation_readiness_id, auth.source_plan_id, auth.source_dispatcher_id, auth.source_envelope_id, auth.source_auth_id, auth.source_readiness_id,
        auth.source_approval_id, auth.source_prep_id, auth.source_review_id, auth.source_simulation_id, auth.source_execution_id,
        auth.cohort_id, auth.tenant_id, auth.simulation_type,
        auth.risk_level, auth.confidence_level, auth.projected_impact_score, auth.rollback_feasibility_score,
        auth.evidence_completeness_score, JSON.stringify(lockConfig), JSON.stringify(auth.impact_review_json || {}),
        JSON.stringify(auth.rollback_review_json || {}), JSON.stringify(auth.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), auth.activation_authorization_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(activationLockId, 'LOCK_DRAFT_CREATED', actorId, { source_activation_auth_id: activationAuthId });
    return { lock: lockRecord };
  }

  async getLock(activationLockId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.lock.get(activationLockId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_lock WHERE activation_lock_id = ?`,
      [activationLockId]
    );
    return rows[0] || null;
  }

  async listLock() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.lock.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_lock ORDER BY created_at DESC`);
  }

  async updateLock(activationLockId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getLock(activationLockId);
    if (!original) throw new Error('LOCK_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.lock.set(activationLockId, updated);
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

    values.push(activationLockId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_lock SET ${updatePairs.join(', ')} WHERE activation_lock_id = ?`,
      values
    );

    return updated;
  }

  async createRule(activationLockId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      activation_lock_id: activationLockId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(activationLockId)) {
        this._mockState.rules.set(activationLockId, []);
      }
      this._mockState.rules.get(activationLockId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_lock_rules
       (rule_id, activation_lock_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, activationLockId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(activationLockId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(activationLockId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_lock_rules WHERE activation_lock_id = ? ORDER BY created_at ASC`,
      [activationLockId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationLockBuilderService();
module.exports = {
  CohortInterventionExecutionPlanActivationLockBuilderService,
  serviceInstance
};
