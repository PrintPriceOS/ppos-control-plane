'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const tokenEnvBuilderSvc = require('./cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenFinalApvAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenFinalApvBuilderService {
  constructor() {
    this._mockState = {
      tokenFinalApv: new Map(),
      rules: new Map()
    };
  }

  async createTokenFinalApv(activationTokenEnvId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 156 token env
    const tokenEnv = await tokenEnvBuilderSvc.getTokenEnv(activationTokenEnvId);
    if (!tokenEnv) {
      throw new Error('PHASE156_TOKEN_ENV_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (tokenEnv.activation_token_env_status !== 'FINALIZED') {
      throw new Error('PHASE156_TOKEN_ENV_NOT_FINALIZED');
    }
    if (tokenEnv.activation_token_env_result !== 'ENVELOPE_PREPARED_NOT_ISSUED') {
      throw new Error('PHASE156_TOKEN_ENV_NOT_APPROVED');
    }
    if (tokenEnv.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE156_EXECUTION_CAPABILITY_VIOLATION');
    }

    const activationTokenFinalApvId = 'atf_157_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const apvConfig = {
      final_approval_mode: 'TOKEN_FINAL_ISSUANCE_APPROVAL_ONLY',
      token_final_approval_status: 'FINAL_APPROVED_NOT_ISSUED',
      token_status: 'PREPARED_NOT_ISSUED',
      token_issuance_status: 'FINAL_APPROVED_NOT_ISSUED',
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
      requires_future_token_staging_gate: true,
      requires_security_committee_chair_confirmation: true,
      requires_kill_switch: true,
      requires_rollback_authority: true,
      requires_token_env_hash_verification: true,
      immutable_after_finalization: true
    };

    const writeScopeAttestation = {
      writes_only_phase157_tables: true,
      wrote_phase128_to_156_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const tokenFinalApvRecord = {
      activation_token_final_apv_id: activationTokenFinalApvId,
      source_activation_token_env_id: tokenEnv.activation_token_env_id,
      source_activation_token_auth_id: tokenEnv.source_activation_token_auth_id,
      source_activation_handoff_id: tokenEnv.source_activation_handoff_id,
      source_activation_decision_id: tokenEnv.source_activation_decision_id,
      source_activation_lock_id: tokenEnv.source_activation_lock_id,
      source_activation_auth_id: tokenEnv.source_activation_auth_id,
      source_activation_readiness_id: tokenEnv.source_activation_readiness_id,
      source_plan_id: tokenEnv.source_plan_id,
      source_dispatcher_id: tokenEnv.source_dispatcher_id,
      source_envelope_id: tokenEnv.source_envelope_id,
      source_auth_id: tokenEnv.source_auth_id,
      source_readiness_id: tokenEnv.source_readiness_id,
      source_approval_id: tokenEnv.source_approval_id,
      source_prep_id: tokenEnv.source_prep_id,
      source_review_id: tokenEnv.source_review_id,
      source_simulation_id: tokenEnv.source_simulation_id,
      source_execution_id: tokenEnv.source_execution_id,
      cohort_id: tokenEnv.cohort_id,
      tenant_id: tokenEnv.tenant_id,
      simulation_type: tokenEnv.simulation_type,
      activation_token_final_apv_status: 'DRAFT',
      activation_token_final_apv_result: null,
      risk_level: tokenEnv.risk_level,
      confidence_level: tokenEnv.confidence_level,
      projected_impact_score: tokenEnv.projected_impact_score,
      rollback_feasibility_score: tokenEnv.rollback_feasibility_score,
      evidence_completeness_score: tokenEnv.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: apvConfig,
      token_final_apv_summary_json: {},
      impact_review_json: tokenEnv.impact_review_json || {},
      rollback_review_json: tokenEnv.rollback_review_json || {},
      guardrail_review_json: tokenEnv.guardrail_review_json || {},
      token_final_apv_rules_json: {},
      token_final_apv_blockers_json: { missing_token_final_apv_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_activation_token_env_hash: tokenEnv.activation_token_env_hash || 'none',
      source_token_material_hash: tokenEnv.source_token_material_hash || 'none',
      source_freeze_package_hash: tokenEnv.source_freeze_package_hash || 'none',
      activation_token_final_apv_hash: null,
      token_final_apv_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      security_chair_signature_json: {},
      final_approval_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED',
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
      this._mockState.tokenFinalApv.set(activationTokenFinalApvId, tokenFinalApvRecord);
      this._mockState.rules.set(activationTokenFinalApvId, []);
      await auditSvc.createAuditLog(activationTokenFinalApvId, 'TOKEN_FINAL_APV_DRAFT_CREATED', actorId, { source_activation_token_env_id: activationTokenEnvId });
      return { tokenFinalApv: tokenFinalApvRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv
       (activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, activation_token_final_apv_status, activation_token_final_apv_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, token_final_apv_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, token_final_apv_rules_json, token_final_apv_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_activation_token_env_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_token_final_apv_evaluation":true}', ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        activationTokenFinalApvId, tokenEnv.activation_token_env_id, tokenEnv.source_activation_token_auth_id, tokenEnv.source_activation_handoff_id, tokenEnv.source_activation_decision_id, tokenEnv.source_activation_lock_id, tokenEnv.source_activation_auth_id, tokenEnv.source_activation_readiness_id, tokenEnv.source_plan_id, tokenEnv.source_dispatcher_id, tokenEnv.source_envelope_id, tokenEnv.source_auth_id, tokenEnv.source_readiness_id,
        tokenEnv.source_approval_id, tokenEnv.source_prep_id, tokenEnv.source_review_id, tokenEnv.source_simulation_id, tokenEnv.source_execution_id,
        tokenEnv.cohort_id, tokenEnv.tenant_id, tokenEnv.simulation_type,
        tokenEnv.risk_level, tokenEnv.confidence_level, tokenEnv.projected_impact_score, tokenEnv.rollback_feasibility_score,
        tokenEnv.evidence_completeness_score, JSON.stringify(apvConfig), JSON.stringify(tokenEnv.impact_review_json || {}),
        JSON.stringify(tokenEnv.rollback_review_json || {}), JSON.stringify(tokenEnv.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), tokenEnv.activation_token_env_hash || 'none', tokenEnv.source_token_material_hash || 'none', tokenEnv.source_freeze_package_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(activationTokenFinalApvId, 'TOKEN_FINAL_APV_DRAFT_CREATED', actorId, { source_activation_token_env_id: activationTokenEnvId });
    return { tokenFinalApv: tokenFinalApvRecord };
  }

  async getTokenFinalApv(activationTokenFinalApvId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.tokenFinalApv.get(activationTokenFinalApvId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_final_apv WHERE activation_token_final_apv_id = ?`,
      [activationTokenFinalApvId]
    );
    return rows[0] || null;
  }

  async listTokenFinalApv() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.tokenFinalApv.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_final_apv ORDER BY created_at DESC`);
  }

  async updateTokenFinalApv(activationTokenFinalApvId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenFinalApv(activationTokenFinalApvId);
    if (!original) throw new Error('TOKEN_FINAL_APV_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.tokenFinalApv.set(activationTokenFinalApvId, updated);
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

    values.push(activationTokenFinalApvId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_final_apv SET ${updatePairs.join(', ')} WHERE activation_token_final_apv_id = ?`,
      values
    );

    return updated;
  }

  async createRule(activationTokenFinalApvId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      activation_token_final_apv_id: activationTokenFinalApvId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(activationTokenFinalApvId)) {
        this._mockState.rules.set(activationTokenFinalApvId, []);
      }
      this._mockState.rules.get(activationTokenFinalApvId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv_rules
       (rule_id, activation_token_final_apv_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, activationTokenFinalApvId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(activationTokenFinalApvId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(activationTokenFinalApvId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_final_apv_rules WHERE activation_token_final_apv_id = ? ORDER BY created_at ASC`,
      [activationTokenFinalApvId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenFinalApvBuilderService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenFinalApvBuilderService,
  serviceInstance
};
