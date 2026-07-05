'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenPreflightAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenPreflightBuilderService {
  constructor() {
    this._mockState = {
      tokenPreflight: new Map(),
      rules: new Map()
    };
  }

  async createTokenPreflightDraft(activationTokenStagingId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Validate parent Phase 158 staging record
    let parentStaging;
    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_staging WHERE activation_token_staging_id = ?`,
        [activationTokenStagingId]
      );
      parentStaging = rows && rows[0];
    } else {
      const stagingBuilder = require('./cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
      parentStaging = stagingBuilder._mockState.tokenStaging.get(activationTokenStagingId);
    }

    if (!parentStaging) throw new Error('TOKEN_STAGING_RECORD_NOT_FOUND');
    if (parentStaging.activation_token_staging_status !== 'FINALIZED' || parentStaging.activation_token_staging_result !== 'STAGED_NOT_ISSUED') {
      throw new Error('TOKEN_STAGING_NOT_READY');
    }

    const preflightId = 'atp_' + crypto.randomBytes(8).toString('hex');
    const writeScope159 = { writes_only_phase159_tables: true, wrote_phase128_to_158_operational_tables: false };
    const nonExecution159 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

    const preflightConfig = {
      preflight_mode: 'TOKEN_ISSUANCE_PREFLIGHT_ONLY',
      token_preflight_status: 'PREFLIGHT_PASSED_NOT_ISSUED',
      token_status: 'STAGED_NOT_ISSUED',
      token_issuance_status: 'PREFLIGHT_PASSED_NOT_ISSUED',
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
      requires_future_token_issuance_gate: true,
      requires_security_officer_confirmation: true,
      requires_compliance_officer_confirmation: true,
      requires_operations_director_confirmation: true,
      requires_staging_hash_verification: true,
      immutable_after_finalization: true
    };

    const record = {
      activation_token_preflight_id: preflightId,
      source_activation_token_staging_id: activationTokenStagingId,
      source_activation_token_final_apv_id: parentStaging.source_activation_token_final_apv_id,
      source_activation_token_env_id: parentStaging.source_activation_token_env_id,
      source_activation_token_auth_id: parentStaging.source_activation_token_auth_id,
      source_activation_handoff_id: parentStaging.source_activation_handoff_id,
      source_activation_decision_id: parentStaging.source_activation_decision_id,
      source_activation_lock_id: parentStaging.source_activation_lock_id,
      source_activation_auth_id: parentStaging.source_activation_auth_id,
      source_activation_readiness_id: parentStaging.source_activation_readiness_id,
      source_plan_id: parentStaging.source_plan_id,
      source_dispatcher_id: parentStaging.source_dispatcher_id,
      source_envelope_id: parentStaging.source_envelope_id,
      source_auth_id: parentStaging.source_auth_id,
      source_readiness_id: parentStaging.source_readiness_id,
      source_approval_id: parentStaging.source_approval_id,
      source_prep_id: parentStaging.source_prep_id,
      source_review_id: parentStaging.source_review_id,
      source_simulation_id: parentStaging.source_simulation_id,
      source_execution_id: parentStaging.source_execution_id,
      cohort_id: parentStaging.cohort_id,
      tenant_id: parentStaging.tenant_id,
      simulation_type: parentStaging.simulation_type,
      activation_token_preflight_status: 'DRAFT',
      activation_token_preflight_result: null,
      risk_level: parentStaging.risk_level,
      confidence_level: parentStaging.confidence_level,
      projected_impact_score: parentStaging.projected_impact_score,
      rollback_feasibility_score: parentStaging.rollback_feasibility_score,
      evidence_completeness_score: parentStaging.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: preflightConfig,
      token_preflight_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      token_preflight_rules_json: {},
      token_preflight_blockers_json: { missing_token_preflight_evaluation: true },
      non_execution_attestation_json: nonExecution159,
      write_scope_attestation_json: writeScope159,
      source_activation_token_staging_hash: parentStaging.activation_token_staging_hash,
      source_token_material_hash: parentStaging.source_token_material_hash,
      source_freeze_package_hash: parentStaging.source_freeze_package_hash,
      activation_token_preflight_hash: null,
      token_preflight_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      preflight_signatures_json: {},
      preflight_metadata_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_PREFLIGHT_FINALIZED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      approved_by: null, approved_at: null, rejected_by: null, rejected_at: null,
      finalized_by: null, finalized_at: null,
      created_at: new Date(), updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.tokenPreflight.set(preflightId, record);
      this._mockState.rules.set(preflightId, []);
      await auditSvc.createAuditLog(preflightId, 'TOKEN_PREFLIGHT_DRAFT_CREATED', actorId, { activationTokenStagingId });
      return { tokenPreflight: record };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_preflight
       (activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id,
        source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id,
        source_activation_decision_id, source_activation_lock_id, source_activation_auth_id,
        source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id,
        source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_preflight_status, activation_token_preflight_result,
        risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_preflight_summary_json,
        impact_review_json, rollback_review_json, guardrail_review_json,
        token_preflight_rules_json, token_preflight_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_activation_token_staging_hash, source_token_material_hash,
        source_freeze_package_hash, execution_capability_status, activation_execution_status,
        package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}',
               '{}', ?, ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_PREFLIGHT_FINALIZED_NOT_EXECUTED',
               'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        preflightId, activationTokenStagingId, record.source_activation_token_final_apv_id,
        record.source_activation_token_env_id, record.source_activation_token_auth_id, record.source_activation_handoff_id,
        record.source_activation_decision_id, record.source_activation_lock_id, record.source_activation_auth_id,
        record.source_activation_readiness_id, record.source_plan_id, record.source_dispatcher_id, record.source_envelope_id,
        record.source_auth_id, record.source_readiness_id, record.source_approval_id, record.source_prep_id,
        record.source_review_id, record.source_simulation_id, record.source_execution_id,
        record.cohort_id, record.tenant_id, record.simulation_type,
        record.risk_level, record.confidence_level, record.projected_impact_score,
        record.rollback_feasibility_score, record.evidence_completeness_score,
        JSON.stringify(preflightConfig),
        JSON.stringify({ missing_token_preflight_evaluation: true }),
        JSON.stringify(nonExecution159), JSON.stringify(writeScope159),
        record.source_activation_token_staging_hash, record.source_token_material_hash, record.source_freeze_package_hash
      ]
    );

    await auditSvc.createAuditLog(preflightId, 'TOKEN_PREFLIGHT_DRAFT_CREATED', actorId, { activationTokenStagingId });
    return { tokenPreflight: await this.getTokenPreflight(preflightId) };
  }

  async getTokenPreflight(activationTokenPreflightId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.tokenPreflight.get(activationTokenPreflightId) || null;
    const rows = await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_preflight WHERE activation_token_preflight_id = ?`, [activationTokenPreflightId]);
    return rows && rows[0] ? rows[0] : null;
  }

  async listTokenPreflights() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return Array.from(this._mockState.tokenPreflight.values());
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_preflight ORDER BY created_at DESC`);
  }

  async getRules(activationTokenPreflightId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.rules.get(activationTokenPreflightId) || [];
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_preflight_rules WHERE activation_token_preflight_id = ? ORDER BY created_at ASC`, [activationTokenPreflightId]);
  }

  async updateTokenPreflight(activationTokenPreflightId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenPreflight(activationTokenPreflightId);
    if (!original) throw new Error('TOKEN_PREFLIGHT_RECORD_NOT_FOUND');

    if (original.activation_token_preflight_status === 'FINALIZED') {
      throw new Error('TOKEN_PREFLIGHT_IMMUTABLE');
    }

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenPreflight.set(activationTokenPreflightId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenPreflightId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_preflight SET ${setClauses.join(', ')} WHERE activation_token_preflight_id = ?`, bindings);
    return await this.getTokenPreflight(activationTokenPreflightId);
  }

  // Bypass for post-FINALIZED evidence pack hash writes
  async _internalUpdateTokenPreflight(activationTokenPreflightId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenPreflight(activationTokenPreflightId);
    if (!original) throw new Error('TOKEN_PREFLIGHT_RECORD_NOT_FOUND');

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenPreflight.set(activationTokenPreflightId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenPreflightId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_preflight SET ${setClauses.join(', ')} WHERE activation_token_preflight_id = ?`, bindings);
    return await this.getTokenPreflight(activationTokenPreflightId);
  }

  async createRule(activationTokenPreflightId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const rule = { rule_id: ruleId, activation_token_preflight_id: activationTokenPreflightId, check_type: checkType, severity, description, created_at: new Date() };

    if (!isProdLike) {
      const list = this._mockState.rules.get(activationTokenPreflightId) || [];
      list.push(rule);
      this._mockState.rules.set(activationTokenPreflightId, list);
      return rule;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_preflight_rules 
       (rule_id, activation_token_preflight_id, check_type, severity, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [ruleId, activationTokenPreflightId, checkType, severity, description]
    );
    return rule;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenPreflightBuilderService()
};
