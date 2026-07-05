'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const handoffBuilderSvc = require('./cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenAuthAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenAuthBuilderService {
  constructor() {
    this._mockState = {
      tokenAuth: new Map(),
      rules: new Map()
    };
  }

  async createTokenAuth(activationHandoffId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 154 handoff
    const handoff = await handoffBuilderSvc.getHandoff(activationHandoffId);
    if (!handoff) {
      throw new Error('PHASE154_HANDOFF_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (handoff.activation_handoff_status !== 'FINALIZED') {
      throw new Error('PHASE154_HANDOFF_NOT_FINALIZED');
    }
    if (handoff.activation_handoff_result !== 'TOKEN_PREPARED_NOT_ISSUED') {
      throw new Error('PHASE154_HANDOFF_NOT_APPROVED');
    }
    if (handoff.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE154_EXECUTION_CAPABILITY_VIOLATION');
    }

    const activationTokenAuthId = 'ata_155_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const authConfig = {
      token_auth_mode: 'TOKEN_ISSUANCE_AUTHORIZATION_ONLY',
      token_authorization_status: 'AUTHORIZED_NOT_ISSUED',
      token_status: 'PREPARED_NOT_ISSUED',
      token_issuance_status: 'AUTHORIZED_NOT_ISSUED',
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
      requires_future_token_issuance_envelope_gate: true,
      requires_kill_switch: true,
      requires_rollback_authority: true,
      requires_governance_signoff: true,
      requires_operator_confirmation: true,
      requires_handoff_hash_verification: true,
      immutable_after_finalization: true
    };

    const writeScopeAttestation = {
      writes_only_phase155_tables: true,
      wrote_phase128_to_154_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const tokenAuthRecord = {
      activation_token_auth_id: activationTokenAuthId,
      source_activation_handoff_id: handoff.activation_handoff_id,
      source_activation_decision_id: handoff.source_activation_decision_id,
      source_activation_lock_id: handoff.source_activation_lock_id,
      source_activation_auth_id: handoff.source_activation_auth_id,
      source_activation_readiness_id: handoff.source_activation_readiness_id,
      source_plan_id: handoff.source_plan_id,
      source_dispatcher_id: handoff.source_dispatcher_id,
      source_envelope_id: handoff.source_envelope_id,
      source_auth_id: handoff.source_auth_id,
      source_readiness_id: handoff.source_readiness_id,
      source_approval_id: handoff.source_approval_id,
      source_prep_id: handoff.source_prep_id,
      source_review_id: handoff.source_review_id,
      source_simulation_id: handoff.source_simulation_id,
      source_execution_id: handoff.source_execution_id,
      cohort_id: handoff.cohort_id,
      tenant_id: handoff.tenant_id,
      simulation_type: handoff.simulation_type,
      activation_token_auth_status: 'DRAFT',
      activation_token_auth_result: null,
      risk_level: handoff.risk_level,
      confidence_level: handoff.confidence_level,
      projected_impact_score: handoff.projected_impact_score,
      rollback_feasibility_score: handoff.rollback_feasibility_score,
      evidence_completeness_score: handoff.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: authConfig,
      token_auth_summary_json: {},
      impact_review_json: handoff.impact_review_json || {},
      rollback_review_json: handoff.rollback_review_json || {},
      guardrail_review_json: handoff.guardrail_review_json || {},
      token_auth_rules_json: {},
      token_auth_blockers_json: { missing_token_auth_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_activation_handoff_hash: handoff.activation_handoff_hash || 'none',
      source_token_material_hash: handoff.token_material_hash || 'none',
      source_freeze_package_hash: handoff.source_freeze_package_hash || 'none',
      activation_token_auth_hash: null,
      token_auth_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      authorization_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED',
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
      this._mockState.tokenAuth.set(activationTokenAuthId, tokenAuthRecord);
      this._mockState.rules.set(activationTokenAuthId, []);
      await auditSvc.createAuditLog(activationTokenAuthId, 'TOKEN_AUTH_DRAFT_CREATED', actorId, { source_activation_handoff_id: activationHandoffId });
      return { tokenAuth: tokenAuthRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_auth
       (activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, activation_token_auth_status, activation_token_auth_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, token_auth_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, token_auth_rules_json, token_auth_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_activation_handoff_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_token_auth_evaluation":true}', ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        activationTokenAuthId, handoff.activation_handoff_id, handoff.source_activation_decision_id, handoff.source_activation_lock_id, handoff.source_activation_auth_id, handoff.source_activation_readiness_id, handoff.source_plan_id, handoff.source_dispatcher_id, handoff.source_envelope_id, handoff.source_auth_id, handoff.source_readiness_id,
        handoff.source_approval_id, handoff.source_prep_id, handoff.source_review_id, handoff.source_simulation_id, handoff.source_execution_id,
        handoff.cohort_id, handoff.tenant_id, handoff.simulation_type,
        handoff.risk_level, handoff.confidence_level, handoff.projected_impact_score, handoff.rollback_feasibility_score,
        handoff.evidence_completeness_score, JSON.stringify(authConfig), JSON.stringify(handoff.impact_review_json || {}),
        JSON.stringify(handoff.rollback_review_json || {}), JSON.stringify(handoff.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), handoff.activation_handoff_hash || 'none', handoff.token_material_hash || 'none', handoff.source_freeze_package_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(activationTokenAuthId, 'TOKEN_AUTH_DRAFT_CREATED', actorId, { source_activation_handoff_id: activationHandoffId });
    return { tokenAuth: tokenAuthRecord };
  }

  async getTokenAuth(activationTokenAuthId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.tokenAuth.get(activationTokenAuthId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_auth WHERE activation_token_auth_id = ?`,
      [activationTokenAuthId]
    );
    return rows[0] || null;
  }

  async listTokenAuth() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.tokenAuth.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_auth ORDER BY created_at DESC`);
  }

  async updateTokenAuth(activationTokenAuthId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenAuth(activationTokenAuthId);
    if (!original) throw new Error('TOKEN_AUTH_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.tokenAuth.set(activationTokenAuthId, updated);
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

    values.push(activationTokenAuthId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_auth SET ${updatePairs.join(', ')} WHERE activation_token_auth_id = ?`,
      values
    );

    return updated;
  }

  async createRule(activationTokenAuthId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      activation_token_auth_id: activationTokenAuthId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(activationTokenAuthId)) {
        this._mockState.rules.set(activationTokenAuthId, []);
      }
      this._mockState.rules.get(activationTokenAuthId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_auth_rules
       (rule_id, activation_token_auth_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, activationTokenAuthId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(activationTokenAuthId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(activationTokenAuthId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_auth_rules WHERE activation_token_auth_id = ? ORDER BY created_at ASC`,
      [activationTokenAuthId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenAuthBuilderService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenAuthBuilderService,
  serviceInstance
};
