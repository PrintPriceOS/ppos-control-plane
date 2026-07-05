'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const lockBuilderSvc = require('./cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationDecisionAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationDecisionBuilderService {
  constructor() {
    this._mockState = {
      decision: new Map(),
      rules: new Map()
    };
  }

  async createDecision(activationLockId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 152 lock
    const lock = await lockBuilderSvc.getLock(activationLockId);
    if (!lock) {
      throw new Error('PHASE152_LOCK_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (lock.activation_lock_status !== 'FINALIZED') {
      throw new Error('PHASE152_LOCK_NOT_FINALIZED');
    }
    if (lock.activation_lock_result !== 'LOCKED_NOT_ACTIVE') {
      throw new Error('PHASE152_LOCK_NOT_APPROVED');
    }
    if (lock.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE152_EXECUTION_CAPABILITY_VIOLATION');
    }

    const activationDecisionId = 'adc_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const decisionConfig = {
      decision_mode: 'FINAL_GO_NO_GO_DECISION_ONLY',
      activation_decision_status: 'GO_APPROVED_NOT_ACTIVE',
      allow_real_activation: false,
      allow_real_execution: false,
      allow_plan_executable_state: false,
      allow_job_creation: false,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      requires_future_activation_handoff_gate: true,
      requires_kill_switch: true,
      requires_rollback_authority: true,
      requires_governance_signoff: true,
      requires_operator_confirmation: true,
      requires_lock_hash_verification: true,
      immutable_after_finalization: true
    };

    const writeScopeAttestation = {
      writes_only_phase153_tables: true,
      wrote_phase128_to_152_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const decisionRecord = {
      activation_decision_id: activationDecisionId,
      source_activation_lock_id: lock.activation_lock_id,
      source_activation_auth_id: lock.source_activation_auth_id,
      source_activation_readiness_id: lock.source_activation_readiness_id,
      source_plan_id: lock.source_plan_id,
      source_dispatcher_id: lock.source_dispatcher_id,
      source_envelope_id: lock.source_envelope_id,
      source_auth_id: lock.source_auth_id,
      source_readiness_id: lock.source_readiness_id,
      source_approval_id: lock.source_approval_id,
      source_prep_id: lock.source_prep_id,
      source_review_id: lock.source_review_id,
      source_simulation_id: lock.source_simulation_id,
      source_execution_id: lock.source_execution_id,
      cohort_id: lock.cohort_id,
      tenant_id: lock.tenant_id,
      simulation_type: lock.simulation_type,
      activation_decision_status: 'DRAFT',
      activation_decision_result: null,
      risk_level: lock.risk_level,
      confidence_level: lock.confidence_level,
      projected_impact_score: lock.projected_impact_score,
      rollback_feasibility_score: lock.rollback_feasibility_score,
      evidence_completeness_score: lock.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: decisionConfig,
      decision_summary_json: {},
      impact_review_json: lock.impact_review_json || {},
      rollback_review_json: lock.rollback_review_json || {},
      guardrail_review_json: lock.guardrail_review_json || {},
      decision_rules_json: {},
      decision_blockers_json: { missing_decision_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_activation_lock_hash: lock.activation_lock_hash || 'none',
      source_freeze_package_hash: lock.freeze_package_hash || 'none',
      activation_decision_hash: null,
      decision_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      decision_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'GO_DECISION_FINALIZED_NOT_EXECUTED',
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
      this._mockState.decision.set(activationDecisionId, decisionRecord);
      this._mockState.rules.set(activationDecisionId, []);
      await auditSvc.createAuditLog(activationDecisionId, 'DECISION_DRAFT_CREATED', actorId, { source_activation_lock_id: activationLockId });
      return { decision: decisionRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_decision
       (activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, activation_decision_status, activation_decision_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, decision_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, decision_rules_json, decision_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_activation_lock_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_decision_evaluation":true}', ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'GO_DECISION_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        activationDecisionId, lock.activation_lock_id, lock.source_activation_auth_id, lock.source_activation_readiness_id, lock.source_plan_id, lock.source_dispatcher_id, lock.source_envelope_id, lock.source_auth_id, lock.source_readiness_id,
        lock.source_approval_id, lock.source_prep_id, lock.source_review_id, lock.source_simulation_id, lock.source_execution_id,
        lock.cohort_id, lock.tenant_id, lock.simulation_type,
        lock.risk_level, lock.confidence_level, lock.projected_impact_score, lock.rollback_feasibility_score,
        lock.evidence_completeness_score, JSON.stringify(decisionConfig), JSON.stringify(lock.impact_review_json || {}),
        JSON.stringify(lock.rollback_review_json || {}), JSON.stringify(lock.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), lock.activation_lock_hash || 'none', lock.freeze_package_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(activationDecisionId, 'DECISION_DRAFT_CREATED', actorId, { source_activation_lock_id: activationLockId });
    return { decision: decisionRecord };
  }

  async getDecision(activationDecisionId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.decision.get(activationDecisionId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_decision WHERE activation_decision_id = ?`,
      [activationDecisionId]
    );
    return rows[0] || null;
  }

  async listDecision() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.decision.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_decision ORDER BY created_at DESC`);
  }

  async updateDecision(activationDecisionId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getDecision(activationDecisionId);
    if (!original) throw new Error('DECISION_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.decision.set(activationDecisionId, updated);
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

    values.push(activationDecisionId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_decision SET ${updatePairs.join(', ')} WHERE activation_decision_id = ?`,
      values
    );

    return updated;
  }

  async createRule(activationDecisionId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      activation_decision_id: activationDecisionId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(activationDecisionId)) {
        this._mockState.rules.set(activationDecisionId, []);
      }
      this._mockState.rules.get(activationDecisionId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_decision_rules
       (rule_id, activation_decision_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, activationDecisionId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(activationDecisionId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(activationDecisionId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_decision_rules WHERE activation_decision_id = ? ORDER BY created_at ASC`,
      [activationDecisionId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationDecisionBuilderService();
module.exports = {
  CohortInterventionExecutionPlanActivationDecisionBuilderService,
  serviceInstance
};
