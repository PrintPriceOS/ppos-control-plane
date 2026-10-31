'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const decisionBuilderSvc = require('./cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationHandoffAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationHandoffBuilderService {
  constructor() {
    this._mockState = {
      handoff: new Map(),
      rules: new Map()
    };
  }

  async createHandoff(activationDecisionId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 153 decision
    const decision = await decisionBuilderSvc.getDecision(activationDecisionId);
    if (!decision) {
      throw new Error('PHASE153_DECISION_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (decision.activation_decision_status !== 'FINALIZED') {
      throw new Error('PHASE153_DECISION_NOT_FINALIZED');
    }
    if (decision.activation_decision_result !== 'GO_APPROVED_NOT_ACTIVE') {
      throw new Error('PHASE153_DECISION_NOT_APPROVED');
    }
    if (decision.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE153_EXECUTION_CAPABILITY_VIOLATION');
    }

    const activationHandoffId = 'ahf_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const handoffConfig = {
      handoff_mode: 'TOKEN_PREPARATION_ONLY',
      activation_handoff_status: 'TOKEN_PREPARED_NOT_ISSUED',
      token_status: 'PREPARED_NOT_ISSUED',
      token_issuance_status: 'TOKEN_NOT_ISSUED',
      token_redeemable: false,
      allow_token_issue: false,
      allow_token_redeem: false,
      allow_real_activation: false,
      allow_real_execution: false,
      allow_plan_executable_state: false,
      allow_job_creation: false,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      requires_future_token_issuance_authorization_gate: true,
      requires_kill_switch: true,
      requires_rollback_authority: true,
      requires_governance_signoff: true,
      requires_operator_confirmation: true,
      requires_decision_hash_verification: true,
      immutable_after_finalization: true
    };

    const writeScopeAttestation = {
      writes_only_phase154_tables: true,
      wrote_phase128_to_153_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const handoffRecord = {
      activation_handoff_id: activationHandoffId,
      source_activation_decision_id: decision.activation_decision_id,
      source_activation_lock_id: decision.source_activation_lock_id,
      source_activation_auth_id: decision.source_activation_auth_id,
      source_activation_readiness_id: decision.source_activation_readiness_id,
      source_plan_id: decision.source_plan_id,
      source_dispatcher_id: decision.source_dispatcher_id,
      source_envelope_id: decision.source_envelope_id,
      source_auth_id: decision.source_auth_id,
      source_readiness_id: decision.source_readiness_id,
      source_approval_id: decision.source_approval_id,
      source_prep_id: decision.source_prep_id,
      source_review_id: decision.source_review_id,
      source_simulation_id: decision.source_simulation_id,
      source_execution_id: decision.source_execution_id,
      cohort_id: decision.cohort_id,
      tenant_id: decision.tenant_id,
      simulation_type: decision.simulation_type,
      activation_handoff_status: 'DRAFT',
      activation_handoff_result: null,
      risk_level: decision.risk_level,
      confidence_level: decision.confidence_level,
      projected_impact_score: decision.projected_impact_score,
      rollback_feasibility_score: decision.rollback_feasibility_score,
      evidence_completeness_score: decision.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: handoffConfig,
      handoff_summary_json: {},
      impact_review_json: decision.impact_review_json || {},
      rollback_review_json: decision.rollback_review_json || {},
      guardrail_review_json: decision.guardrail_review_json || {},
      handoff_rules_json: {},
      handoff_blockers_json: { missing_handoff_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_activation_decision_hash: decision.activation_decision_hash || 'none',
      source_freeze_package_hash: decision.source_freeze_package_hash || 'none',
      activation_handoff_hash: null,
      token_material_hash: null,
      handoff_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      handoff_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'HANDOFF_FINALIZED_NOT_EXECUTED',
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
      this._mockState.handoff.set(activationHandoffId, handoffRecord);
      this._mockState.rules.set(activationHandoffId, []);
      await auditSvc.createAuditLog(activationHandoffId, 'HANDOFF_DRAFT_CREATED', actorId, { source_activation_decision_id: activationDecisionId });
      return { handoff: handoffRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_handoff
       (activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, activation_handoff_status, activation_handoff_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, handoff_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, handoff_rules_json, handoff_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_activation_decision_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_handoff_evaluation":true}', ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'HANDOFF_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        activationHandoffId, decision.activation_decision_id, decision.source_activation_lock_id, decision.source_activation_auth_id, decision.source_activation_readiness_id, decision.source_plan_id, decision.source_dispatcher_id, decision.source_envelope_id, decision.source_auth_id, decision.source_readiness_id,
        decision.source_approval_id, decision.source_prep_id, decision.source_review_id, decision.source_simulation_id, decision.source_execution_id,
        decision.cohort_id, decision.tenant_id, decision.simulation_type,
        decision.risk_level, decision.confidence_level, decision.projected_impact_score, decision.rollback_feasibility_score,
        decision.evidence_completeness_score, JSON.stringify(handoffConfig), JSON.stringify(decision.impact_review_json || {}),
        JSON.stringify(decision.rollback_review_json || {}), JSON.stringify(decision.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), decision.activation_decision_hash || 'none', decision.source_freeze_package_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(activationHandoffId, 'HANDOFF_DRAFT_CREATED', actorId, { source_activation_decision_id: activationDecisionId });
    return { handoff: handoffRecord };
  }

  async getHandoff(activationHandoffId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.handoff.get(activationHandoffId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_handoff WHERE activation_handoff_id = ?`,
      [activationHandoffId]
    );
    return rows[0] || null;
  }

  async listHandoff() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.handoff.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_handoff ORDER BY created_at DESC`);
  }

  async updateHandoff(activationHandoffId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getHandoff(activationHandoffId);
    if (!original) throw new Error('HANDOFF_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.handoff.set(activationHandoffId, updated);
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

    values.push(activationHandoffId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_handoff SET ${updatePairs.join(', ')} WHERE activation_handoff_id = ?`,
      values
    );

    return updated;
  }

  async createRule(activationHandoffId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      activation_handoff_id: activationHandoffId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(activationHandoffId)) {
        this._mockState.rules.set(activationHandoffId, []);
      }
      this._mockState.rules.get(activationHandoffId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_handoff_rules
       (rule_id, activation_handoff_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, activationHandoffId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(activationHandoffId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(activationHandoffId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_handoff_rules WHERE activation_handoff_id = ? ORDER BY created_at ASC`,
      [activationHandoffId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationHandoffBuilderService();
module.exports = {
  CohortInterventionExecutionPlanActivationHandoffBuilderService,
  serviceInstance
};
