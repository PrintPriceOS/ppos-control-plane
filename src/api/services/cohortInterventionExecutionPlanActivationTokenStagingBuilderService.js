'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const tokenFinalApvBuilderSvc = require('./cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenStagingAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenStagingBuilderService {
  constructor() {
    this._mockState = {
      tokenStaging: new Map(),
      rules: new Map()
    };
  }

  async createTokenStagingDraft(activationTokenFinalApvId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const activationTokenStagingId = 'ats_' + crypto.randomBytes(8).toString('hex');

    const finalApv = await tokenFinalApvBuilderSvc.getTokenFinalApv(activationTokenFinalApvId);
    if (!finalApv) {
      throw new Error('TOKEN_FINAL_APPROVAL_NOT_FOUND');
    }

    if (finalApv.activation_token_final_apv_status !== 'FINALIZED' || finalApv.activation_token_final_apv_result !== 'FINAL_APPROVED_NOT_ISSUED') {
      throw new Error('TOKEN_FINAL_APPROVAL_NOT_READY');
    }

    const defaultStagingConfig = {
      staging_mode: 'TOKEN_STAGING_ONLY',
      token_staging_status: 'STAGED_NOT_ISSUED',
      token_status: 'STAGED_NOT_ISSUED',
      token_issuance_status: 'STAGED_NOT_ISSUED',
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
      requires_future_token_issuance_preflight_gate: true,
      requires_security_officer_confirmation: true,
      requires_compliance_officer_confirmation: true,
      requires_operations_director_confirmation: true,
      requires_final_approval_hash_verification: true,
      immutable_after_finalization: true
    };

    const writeScopeAttestation = {
      writes_only_phase158_tables: true,
      wrote_phase128_to_157_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const tokenStagingRecord = {
      activation_token_staging_id: activationTokenStagingId,
      source_activation_token_final_apv_id: finalApv.activation_token_final_apv_id,
      source_activation_token_env_id: finalApv.source_activation_token_env_id,
      source_activation_token_auth_id: finalApv.source_activation_token_auth_id,
      source_activation_handoff_id: finalApv.source_activation_handoff_id,
      source_activation_decision_id: finalApv.source_activation_decision_id,
      source_activation_lock_id: finalApv.source_activation_lock_id,
      source_activation_auth_id: finalApv.source_activation_auth_id,
      source_activation_readiness_id: finalApv.source_activation_readiness_id,
      source_plan_id: finalApv.source_plan_id,
      source_dispatcher_id: finalApv.source_dispatcher_id,
      source_envelope_id: finalApv.source_envelope_id,
      source_auth_id: finalApv.source_auth_id,
      source_readiness_id: finalApv.source_readiness_id,
      source_approval_id: finalApv.source_approval_id,
      source_prep_id: finalApv.source_prep_id,
      source_review_id: finalApv.source_review_id,
      source_simulation_id: finalApv.source_simulation_id,
      source_execution_id: finalApv.source_execution_id,
      cohort_id: finalApv.cohort_id,
      tenant_id: finalApv.tenant_id,
      simulation_type: finalApv.simulation_type,
      activation_token_staging_status: 'DRAFT',
      activation_token_staging_result: null,
      risk_level: finalApv.risk_level,
      confidence_level: finalApv.confidence_level,
      projected_impact_score: finalApv.projected_impact_score,
      rollback_feasibility_score: finalApv.rollback_feasibility_score,
      evidence_completeness_score: finalApv.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: defaultStagingConfig,
      token_staging_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      token_staging_rules_json: {},
      token_staging_blockers_json: { missing_token_staging_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_activation_token_final_apv_hash: finalApv.activation_token_final_apv_hash || 'none',
      source_token_material_hash: finalApv.source_token_material_hash || 'none',
      source_freeze_package_hash: finalApv.source_freeze_package_hash || 'none',
      activation_token_staging_hash: null,
      token_staging_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      staging_signatures_json: {},
      staging_metadata_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_at: new Date(),
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.tokenStaging.set(activationTokenStagingId, tokenStagingRecord);
      this._mockState.rules.set(activationTokenStagingId, []);
      await auditSvc.createAuditLog(activationTokenStagingId, 'TOKEN_STAGING_DRAFT_CREATED', actorId, { source_activation_token_final_apv_id: activationTokenFinalApvId });
      return { tokenStaging: tokenStagingRecord };
    }

    const created = new Date();
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_staging
       (activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, activation_token_staging_status, activation_token_staging_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, token_staging_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, token_staging_rules_json, token_staging_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_activation_token_final_apv_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_token_staging_evaluation":true}', ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        activationTokenStagingId, finalApv.activation_token_final_apv_id, finalApv.source_activation_token_env_id, finalApv.source_activation_token_auth_id, finalApv.source_activation_handoff_id, finalApv.source_activation_decision_id, finalApv.source_activation_lock_id, finalApv.source_activation_auth_id, finalApv.source_activation_readiness_id, finalApv.source_plan_id, finalApv.source_dispatcher_id, finalApv.source_envelope_id, finalApv.source_auth_id, finalApv.source_readiness_id,
        finalApv.source_approval_id, finalApv.source_prep_id, finalApv.source_review_id, finalApv.source_simulation_id, finalApv.source_execution_id,
        finalApv.cohort_id, finalApv.tenant_id, finalApv.simulation_type,
        finalApv.risk_level, finalApv.confidence_level, finalApv.projected_impact_score, finalApv.rollback_feasibility_score,
        finalApv.evidence_completeness_score, JSON.stringify(defaultStagingConfig), JSON.stringify(finalApv.impact_review_json || {}),
        JSON.stringify(finalApv.rollback_review_json || {}), JSON.stringify(finalApv.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), finalApv.activation_token_final_apv_hash || 'none', finalApv.source_token_material_hash || 'none', finalApv.source_freeze_package_hash || 'none',
        created, created
      ]
    );

    await auditSvc.createAuditLog(activationTokenStagingId, 'TOKEN_STAGING_DRAFT_CREATED', actorId, { source_activation_token_final_apv_id: finalApv.activation_token_final_apv_id });
    return { tokenStaging: tokenStagingRecord };
  }

  async getTokenStaging(activationTokenStagingId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.tokenStaging.get(activationTokenStagingId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_staging WHERE activation_token_staging_id = ?`,
      [activationTokenStagingId]
    );
    return rows[0] || null;
  }

  async listTokenStaging() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.tokenStaging.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_staging ORDER BY created_at DESC`);
  }

  async updateTokenStaging(activationTokenStagingId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenStaging(activationTokenStagingId);
    if (!original) throw new Error('TOKEN_STAGING_RECORD_NOT_FOUND');

    if (original.activation_token_staging_status === 'FINALIZED') {
      throw new Error('TOKEN_STAGING_IMMUTABLE');
    }

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenStaging.set(activationTokenStagingId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenStagingId);

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_staging SET ${setClauses.join(', ')} WHERE activation_token_staging_id = ?`,
      bindings
    );

    return await this.getTokenStaging(activationTokenStagingId);
  }

  // Internal-only: bypasses immutability guard for finalization system writes
  // (e.g. writing evidence pack hash AFTER the record is transitioned to FINALIZED)
  async _internalUpdateTokenStaging(activationTokenStagingId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenStaging(activationTokenStagingId);
    if (!original) throw new Error('TOKEN_STAGING_RECORD_NOT_FOUND');

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenStaging.set(activationTokenStagingId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenStagingId);

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_staging SET ${setClauses.join(', ')} WHERE activation_token_staging_id = ?`,
      bindings
    );

    return await this.getTokenStaging(activationTokenStagingId);
  }

  async createRule(activationTokenStagingId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const rule = { rule_id: ruleId, activation_token_staging_id: activationTokenStagingId, check_type: checkType, severity, description, created_at: new Date() };

    if (!isProdLike) {
      const list = this._mockState.rules.get(activationTokenStagingId) || [];
      list.push(rule);
      this._mockState.rules.set(activationTokenStagingId, list);
      return rule;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_staging_rules 
       (rule_id, activation_token_staging_id, check_type, severity, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [ruleId, activationTokenStagingId, checkType, severity, description]
    );

    return rule;
  }

  async getRules(activationTokenStagingId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(activationTokenStagingId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_staging_rules WHERE activation_token_staging_id = ?`,
      [activationTokenStagingId]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenStagingBuilderService()
};
