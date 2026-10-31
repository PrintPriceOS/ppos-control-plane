'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const tokenAuthBuilderSvc = require('./cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenEnvAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenEnvBuilderService {
  constructor() {
    this._mockState = {
      tokenEnv: new Map(),
      rules: new Map()
    };
  }

  async createTokenEnv(activationTokenAuthId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 155 token auth
    const tokenAuth = await tokenAuthBuilderSvc.getTokenAuth(activationTokenAuthId);
    if (!tokenAuth) {
      throw new Error('PHASE155_TOKEN_AUTH_NOT_FOUND');
    }

    // 2. Validate finalized and authorized
    if (tokenAuth.activation_token_auth_status !== 'FINALIZED') {
      throw new Error('PHASE155_TOKEN_AUTH_NOT_FINALIZED');
    }
    if (tokenAuth.activation_token_auth_result !== 'AUTHORIZED_NOT_ISSUED') {
      throw new Error('PHASE155_TOKEN_AUTH_NOT_APPROVED');
    }
    if (tokenAuth.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE155_EXECUTION_CAPABILITY_VIOLATION');
    }

    const activationTokenEnvId = 'ate_156_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const envConfig = {
      token_envelope_mode: 'ISSUANCE_ENVELOPE_PREPARATION_ONLY',
      token_env_status: 'ENVELOPE_PREPARED_NOT_ISSUED',
      token_status: 'PREPARED_NOT_ISSUED',
      token_issuance_status: 'ENVELOPE_PREPARED_NOT_ISSUED',
      token_redeemable: false,
      envelope_redeemable: false,
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
      requires_future_token_issuance_final_approval_gate: true,
      requires_security_officer_confirmation: true,
      requires_kill_switch: true,
      requires_rollback_authority: true,
      requires_token_auth_hash_verification: true,
      immutable_after_finalization: true
    };

    const writeScopeAttestation = {
      writes_only_phase156_tables: true,
      wrote_phase128_to_155_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const tokenEnvRecord = {
      activation_token_env_id: activationTokenEnvId,
      source_activation_token_auth_id: tokenAuth.activation_token_auth_id,
      source_activation_handoff_id: tokenAuth.source_activation_handoff_id,
      source_activation_decision_id: tokenAuth.source_activation_decision_id,
      source_activation_lock_id: tokenAuth.source_activation_lock_id,
      source_activation_auth_id: tokenAuth.source_activation_auth_id,
      source_activation_readiness_id: tokenAuth.source_activation_readiness_id,
      source_plan_id: tokenAuth.source_plan_id,
      source_dispatcher_id: tokenAuth.source_dispatcher_id,
      source_envelope_id: tokenAuth.source_envelope_id,
      source_auth_id: tokenAuth.source_auth_id,
      source_readiness_id: tokenAuth.source_readiness_id,
      source_approval_id: tokenAuth.source_approval_id,
      source_prep_id: tokenAuth.source_prep_id,
      source_review_id: tokenAuth.source_review_id,
      source_simulation_id: tokenAuth.source_simulation_id,
      source_execution_id: tokenAuth.source_execution_id,
      cohort_id: tokenAuth.cohort_id,
      tenant_id: tokenAuth.tenant_id,
      simulation_type: tokenAuth.simulation_type,
      activation_token_env_status: 'DRAFT',
      activation_token_env_result: null,
      risk_level: tokenAuth.risk_level,
      confidence_level: tokenAuth.confidence_level,
      projected_impact_score: tokenAuth.projected_impact_score,
      rollback_feasibility_score: tokenAuth.rollback_feasibility_score,
      evidence_completeness_score: tokenAuth.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: envConfig,
      token_env_summary_json: {},
      impact_review_json: tokenAuth.impact_review_json || {},
      rollback_review_json: tokenAuth.rollback_review_json || {},
      guardrail_review_json: tokenAuth.guardrail_review_json || {},
      token_env_rules_json: {},
      token_env_blockers_json: { missing_token_env_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_activation_token_auth_hash: tokenAuth.activation_token_auth_hash || 'none',
      source_token_material_hash: tokenAuth.source_token_material_hash || 'none',
      source_freeze_package_hash: tokenAuth.source_freeze_package_hash || 'none',
      activation_token_env_hash: null,
      token_env_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      security_signature_json: {},
      envelope_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_ENV_FINALIZED_NOT_EXECUTED',
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
      this._mockState.tokenEnv.set(activationTokenEnvId, tokenEnvRecord);
      this._mockState.rules.set(activationTokenEnvId, []);
      await auditSvc.createAuditLog(activationTokenEnvId, 'TOKEN_ENV_DRAFT_CREATED', actorId, { source_activation_token_auth_id: activationTokenAuthId });
      return { tokenEnv: tokenEnvRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_env
       (activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, activation_token_env_status, activation_token_env_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, token_env_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, token_env_rules_json, token_env_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_activation_token_auth_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_token_env_evaluation":true}', ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_ENV_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        activationTokenEnvId, tokenAuth.activation_token_auth_id, tokenAuth.source_activation_handoff_id, tokenAuth.source_activation_decision_id, tokenAuth.source_activation_lock_id, tokenAuth.source_activation_auth_id, tokenAuth.source_activation_readiness_id, tokenAuth.source_plan_id, tokenAuth.source_dispatcher_id, tokenAuth.source_envelope_id, tokenAuth.source_auth_id, tokenAuth.source_readiness_id,
        tokenAuth.source_approval_id, tokenAuth.source_prep_id, tokenAuth.source_review_id, tokenAuth.source_simulation_id, tokenAuth.source_execution_id,
        tokenAuth.cohort_id, tokenAuth.tenant_id, tokenAuth.simulation_type,
        tokenAuth.risk_level, tokenAuth.confidence_level, tokenAuth.projected_impact_score, tokenAuth.rollback_feasibility_score,
        tokenAuth.evidence_completeness_score, JSON.stringify(envConfig), JSON.stringify(tokenAuth.impact_review_json || {}),
        JSON.stringify(tokenAuth.rollback_review_json || {}), JSON.stringify(tokenAuth.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), tokenAuth.activation_token_auth_hash || 'none', tokenAuth.source_token_material_hash || 'none', tokenAuth.source_freeze_package_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(activationTokenEnvId, 'TOKEN_ENV_DRAFT_CREATED', actorId, { source_activation_token_auth_id: activationTokenAuthId });
    return { tokenEnv: tokenEnvRecord };
  }

  async getTokenEnv(activationTokenEnvId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.tokenEnv.get(activationTokenEnvId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_env WHERE activation_token_env_id = ?`,
      [activationTokenEnvId]
    );
    return rows[0] || null;
  }

  async listTokenEnv() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.tokenEnv.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_env ORDER BY created_at DESC`);
  }

  async updateTokenEnv(activationTokenEnvId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenEnv(activationTokenEnvId);
    if (!original) throw new Error('TOKEN_ENV_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.tokenEnv.set(activationTokenEnvId, updated);
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

    values.push(activationTokenEnvId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_env SET ${updatePairs.join(', ')} WHERE activation_token_env_id = ?`,
      values
    );

    return updated;
  }

  async createRule(activationTokenEnvId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      activation_token_env_id: activationTokenEnvId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(activationTokenEnvId)) {
        this._mockState.rules.set(activationTokenEnvId, []);
      }
      this._mockState.rules.get(activationTokenEnvId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_env_rules
       (rule_id, activation_token_env_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, activationTokenEnvId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(activationTokenEnvId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(activationTokenEnvId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_env_rules WHERE activation_token_env_id = ? ORDER BY created_at ASC`,
      [activationTokenEnvId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenEnvBuilderService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenEnvBuilderService,
  serviceInstance
};
