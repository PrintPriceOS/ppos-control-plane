'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionAuth: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionAuthDraft(activationTokenRedemptionReadinessId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentReadiness;
    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_readiness WHERE activation_token_redemption_readiness_id = ?`,
        [activationTokenRedemptionReadinessId]
      );
      parentReadiness = rows && rows[0];
    } else {
      const readinessBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
      parentReadiness = readinessBuilder._mockState.tokenRedemptionReadiness.get(activationTokenRedemptionReadinessId);
    }

    if (!parentReadiness) throw new Error('TOKEN_REDEMPTION_READINESS_RECORD_NOT_FOUND');
    if (parentReadiness.activation_token_redemption_readiness_status !== 'FINALIZED' || parentReadiness.activation_token_redemption_readiness_result !== 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED') {
      throw new Error('TOKEN_REDEMPTION_READINESS_NOT_READY');
    }

    const authId = 'ata_' + crypto.randomBytes(8).toString('hex');
    const writeScope162 = { writes_only_phase162_tables: true, wrote_phase128_to_161_operational_tables: false };
    const nonExecution162 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

    const authConfig = {
      redemption_authorization_mode: 'TOKEN_REDEMPTION_AUTHORIZATION_ONLY',
      token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_redemption_auth_status: 'REDEMPTION_AUTHORIZED_NOT_REDEEMED',
      token_redemption_status: 'REDEMPTION_AUTHORIZED_NOT_REDEEMED',
      token_redeemable: false,
      allow_redemption_authorization_record: true,
      allow_usable_token_redeem: false,
      allow_token_redeem: false,
      allow_make_token_redeemable: false,
      allow_real_activation: false,
      allow_real_execution: false,
      allow_plan_executable_state: false,
      allow_job_creation: false,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      requires_future_token_redemption_envelope_gate: true,
      requires_security_officer_confirmation: true,
      requires_compliance_officer_confirmation: true,
      requires_operations_director_confirmation: true,
      requires_redemption_readiness_hash_verification: true,
      immutable_after_finalization: true
    };

    const tokenRecord = {
      token_urn: `urn:printprice:cohort:intervention:token:authorization:${authId}`,
      authorized_at: new Date().toISOString(),
      governed_redemption_authorization_confirmed: true,
      allow_token_redemption_assertion: 'Phase 162 is not token redemption. It only authorizes a future redemption path.'
    };

    const record = {
      activation_token_redemption_auth_id: authId,
      source_activation_token_redemption_readiness_id: activationTokenRedemptionReadinessId,
      source_activation_token_issuance_id: parentReadiness.source_activation_token_issuance_id,
      source_activation_token_preflight_id: parentReadiness.source_activation_token_preflight_id,
      source_activation_token_staging_id: parentReadiness.source_activation_token_staging_id,
      source_activation_token_final_apv_id: parentReadiness.source_activation_token_final_apv_id,
      source_activation_token_env_id: parentReadiness.source_activation_token_env_id,
      source_activation_handoff_id: parentReadiness.source_activation_handoff_id,
      source_activation_decision_id: parentReadiness.source_activation_decision_id,
      source_activation_lock_id: parentReadiness.source_activation_lock_id,
      source_activation_auth_id: parentReadiness.source_activation_auth_id,
      source_activation_readiness_id: parentReadiness.source_activation_readiness_id,
      source_plan_id: parentReadiness.source_plan_id,
      source_dispatcher_id: parentReadiness.source_dispatcher_id,
      source_envelope_id: parentReadiness.source_envelope_id,
      source_auth_id: parentReadiness.source_auth_id,
      source_readiness_id: parentReadiness.source_readiness_id,
      source_approval_id: parentReadiness.source_approval_id,
      source_prep_id: parentReadiness.source_prep_id,
      source_review_id: parentReadiness.source_review_id,
      source_simulation_id: parentReadiness.source_simulation_id,
      source_execution_id: parentReadiness.source_execution_id,
      cohort_id: parentReadiness.cohort_id,
      tenant_id: parentReadiness.tenant_id,
      simulation_type: parentReadiness.simulation_type,
      activation_token_redemption_auth_status: 'DRAFT',
      activation_token_redemption_auth_result: null,
      risk_level: parentReadiness.risk_level,
      confidence_level: parentReadiness.confidence_level,
      projected_impact_score: parentReadiness.projected_impact_score,
      rollback_feasibility_score: parentReadiness.rollback_feasibility_score,
      evidence_completeness_score: parentReadiness.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: authConfig,
      token_redemption_auth_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      token_redemption_auth_rules_json: {},
      token_redemption_auth_blockers_json: { missing_token_redemption_auth_evaluation: true },
      non_execution_attestation_json: nonExecution162,
      write_scope_attestation_json: writeScope162,
      non_redeemable_token_record_json: tokenRecord,
      source_activation_token_redemption_readiness_hash: parentReadiness.activation_token_redemption_readiness_hash,
      source_activation_token_issuance_hash: parentReadiness.source_activation_token_issuance_hash,
      source_activation_token_preflight_hash: parentReadiness.source_activation_token_preflight_hash,
      source_activation_token_staging_hash: parentReadiness.source_activation_token_staging_hash,
      source_token_material_hash: parentReadiness.source_token_material_hash,
      source_freeze_package_hash: parentReadiness.source_freeze_package_hash,
      activation_token_redemption_auth_hash: null,
      token_redemption_auth_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      redemption_auth_signatures_json: {},
      redemption_auth_metadata_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_REDEMPTION_AUTH_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
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
      this._mockState.tokenRedemptionAuth.set(authId, record);
      this._mockState.rules.set(authId, []);
      await auditSvc.createAuditLog(authId, 'TOKEN_REDEMPTION_AUTH_DRAFT_CREATED', actorId, { activationTokenRedemptionReadinessId });
      return { tokenRedemptionAuth: record };
    }

    // Exact count: 25 columns and 25 placeholders in first section
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_auth
       (activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id,
        source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id,
        source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id,
        source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id,
        source_plan_id, source_dispatcher_id, source_envelope_id,
        source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_redemption_auth_status, activation_token_redemption_auth_result,
        risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_redemption_auth_summary_json,
        impact_review_json, rollback_review_json, guardrail_review_json,
        token_redemption_auth_rules_json, token_redemption_auth_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, non_redeemable_token_record_json, source_activation_token_redemption_readiness_hash,
        source_activation_token_issuance_hash, source_activation_token_preflight_hash, source_activation_token_staging_hash,
        source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status,
        job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}',
               '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_AUTH_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
               'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        authId, activationTokenRedemptionReadinessId, record.source_activation_token_issuance_id,
        record.source_activation_token_preflight_id, record.source_activation_token_staging_id, record.source_activation_token_final_apv_id,
        record.source_activation_token_env_id, record.source_activation_handoff_id, record.source_activation_decision_id,
        record.source_activation_lock_id, record.source_activation_auth_id, record.source_activation_readiness_id,
        record.source_plan_id, record.source_dispatcher_id, record.source_envelope_id, record.source_auth_id,
        record.source_readiness_id, record.source_approval_id, record.source_prep_id, record.source_review_id,
        record.source_simulation_id, record.source_execution_id, record.cohort_id, record.tenant_id, record.simulation_type,
        record.risk_level, record.confidence_level, record.projected_impact_score,
        record.rollback_feasibility_score, record.evidence_completeness_score,
        JSON.stringify(authConfig),
        JSON.stringify({ missing_token_redemption_auth_evaluation: true }),
        JSON.stringify(nonExecution162), JSON.stringify(writeScope162), JSON.stringify(tokenRecord),
        record.source_activation_token_redemption_readiness_hash, record.source_activation_token_issuance_hash,
        record.source_activation_token_preflight_hash, record.source_activation_token_staging_hash,
        record.source_token_material_hash, record.source_freeze_package_hash
      ]
    );

    await auditSvc.createAuditLog(authId, 'TOKEN_REDEMPTION_AUTH_DRAFT_CREATED', actorId, { activationTokenRedemptionReadinessId });
    return { tokenRedemptionAuth: await this.getTokenRedemptionAuth(authId) };
  }

  async getTokenRedemptionAuth(activationTokenRedemptionAuthId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.tokenRedemptionAuth.get(activationTokenRedemptionAuthId) || null;
    const rows = await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_auth WHERE activation_token_redemption_auth_id = ?`, [activationTokenRedemptionAuthId]);
    return rows && rows[0] ? rows[0] : null;
  }

  async listTokenRedemptionAuths() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return Array.from(this._mockState.tokenRedemptionAuth.values());
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_auth ORDER BY created_at DESC`);
  }

  async getRules(activationTokenRedemptionAuthId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.rules.get(activationTokenRedemptionAuthId) || [];
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_auth_rules WHERE activation_token_redemption_auth_id = ? ORDER BY created_at ASC`, [activationTokenRedemptionAuthId]);
  }

  async updateTokenRedemptionAuth(activationTokenRedemptionAuthId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
    if (!original) throw new Error('TOKEN_REDEMPTION_AUTH_RECORD_NOT_FOUND');

    if (original.activation_token_redemption_auth_status === 'FINALIZED') {
      throw new Error('TOKEN_REDEMPTION_AUTH_IMMUTABLE');
    }

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionAuth.set(activationTokenRedemptionAuthId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenRedemptionAuthId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_redempt_auth SET ${setClauses.join(', ')} WHERE activation_token_redemption_auth_id = ?`, bindings);
    return await this.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
  }

  async _internalUpdateTokenRedemptionAuth(activationTokenRedemptionAuthId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
    if (!original) throw new Error('TOKEN_REDEMPTION_AUTH_RECORD_NOT_FOUND');

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionAuth.set(activationTokenRedemptionAuthId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenRedemptionAuthId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_redempt_auth SET ${setClauses.join(', ')} WHERE activation_token_redemption_auth_id = ?`, bindings);
    return await this.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
  }

  async createRule(activationTokenRedemptionAuthId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const rule = { rule_id: ruleId, activation_token_redemption_auth_id: activationTokenRedemptionAuthId, check_type: checkType, severity, description, created_at: new Date() };

    if (!isProdLike) {
      const list = this._mockState.rules.get(activationTokenRedemptionAuthId) || [];
      list.push(rule);
      this._mockState.rules.set(activationTokenRedemptionAuthId, list);
      return rule;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_auth_rules 
       (rule_id, activation_token_redemption_auth_id, check_type, severity, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [ruleId, activationTokenRedemptionAuthId, checkType, severity, description]
    );
    return rule;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService()
};
