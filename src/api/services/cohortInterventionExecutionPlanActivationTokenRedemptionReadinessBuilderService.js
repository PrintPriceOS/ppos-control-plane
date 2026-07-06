'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionReadinessAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionReadiness: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionReadinessDraft(activationTokenIssuanceId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentIssuance;
    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_issuance WHERE activation_token_issuance_id = ?`,
        [activationTokenIssuanceId]
      );
      parentIssuance = rows && rows[0];
    } else {
      const issuanceBuilder = require('./cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
      parentIssuance = issuanceBuilder._mockState.tokenIssuance.get(activationTokenIssuanceId);
    }

    if (!parentIssuance) throw new Error('TOKEN_ISSUANCE_RECORD_NOT_FOUND');
    if (parentIssuance.activation_token_issuance_status !== 'FINALIZED' || parentIssuance.activation_token_issuance_result !== 'ISSUANCE_RECORDED_NOT_REDEEMABLE') {
      throw new Error('TOKEN_ISSUANCE_NOT_READY');
    }

    const readinessId = 'atr_' + crypto.randomBytes(8).toString('hex');
    const writeScope161 = { writes_only_phase161_tables: true, wrote_phase128_to_160_operational_tables: false };
    const nonExecution161 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

    const readinessConfig = {
      redemption_readiness_mode: 'TOKEN_REDEMPTION_READINESS_ONLY',
      token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_redemption_readiness_status: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED',
      token_redemption_status: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED',
      token_redeemable: false,
      allow_redemption_readiness_record: true,
      allow_usable_token_redeem: false,
      allow_token_redeem: false,
      allow_real_activation: false,
      allow_real_execution: false,
      allow_plan_executable_state: false,
      allow_job_creation: false,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      requires_future_token_redemption_gate: true,
      requires_security_officer_confirmation: true,
      requires_compliance_officer_confirmation: true,
      requires_operations_director_confirmation: true,
      requires_issuance_hash_verification: true,
      immutable_after_finalization: true
    };

    const tokenRecord = {
      token_urn: `urn:printprice:cohort:intervention:token:readiness:${readinessId}`,
      readiness_checked_at: new Date().toISOString(),
      governed_redemption_readiness_confirmed: true,
      allow_token_redemption_assertion: 'Phase 161 is not redemption. It only validates readiness for a future redemption gate.'
    };

    const record = {
      activation_token_redemption_readiness_id: readinessId,
      source_activation_token_issuance_id: activationTokenIssuanceId,
      source_activation_token_preflight_id: parentIssuance.source_activation_token_preflight_id,
      source_activation_token_staging_id: parentIssuance.source_activation_token_staging_id,
      source_activation_token_final_apv_id: parentIssuance.source_activation_token_final_apv_id,
      source_activation_token_env_id: parentIssuance.source_activation_token_env_id,
      source_activation_handoff_id: parentIssuance.source_activation_handoff_id,
      source_activation_decision_id: parentIssuance.source_activation_decision_id,
      source_activation_lock_id: parentIssuance.source_activation_lock_id,
      source_activation_auth_id: parentIssuance.source_activation_auth_id,
      source_activation_readiness_id: parentIssuance.source_activation_readiness_id,
      source_plan_id: parentIssuance.source_plan_id,
      source_dispatcher_id: parentIssuance.source_dispatcher_id,
      source_envelope_id: parentIssuance.source_envelope_id,
      source_auth_id: parentIssuance.source_auth_id,
      source_readiness_id: parentIssuance.source_readiness_id,
      source_approval_id: parentIssuance.source_approval_id,
      source_prep_id: parentIssuance.source_prep_id,
      source_review_id: parentIssuance.source_review_id,
      source_simulation_id: parentIssuance.source_simulation_id,
      source_execution_id: parentIssuance.source_execution_id,
      cohort_id: parentIssuance.cohort_id,
      tenant_id: parentIssuance.tenant_id,
      simulation_type: parentIssuance.simulation_type,
      activation_token_redemption_readiness_status: 'DRAFT',
      activation_token_redemption_readiness_result: null,
      risk_level: parentIssuance.risk_level,
      confidence_level: parentIssuance.confidence_level,
      projected_impact_score: parentIssuance.projected_impact_score,
      rollback_feasibility_score: parentIssuance.rollback_feasibility_score,
      evidence_completeness_score: parentIssuance.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: readinessConfig,
      token_redemption_readiness_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      token_redemption_readiness_rules_json: {},
      token_redemption_readiness_blockers_json: { missing_token_redemption_readiness_evaluation: true },
      non_execution_attestation_json: nonExecution161,
      write_scope_attestation_json: writeScope161,
      non_redeemable_token_record_json: tokenRecord,
      source_activation_token_issuance_hash: parentIssuance.activation_token_issuance_hash,
      source_activation_token_preflight_hash: parentIssuance.source_activation_token_preflight_hash,
      source_activation_token_staging_hash: parentIssuance.source_activation_token_staging_hash,
      source_token_material_hash: parentIssuance.source_token_material_hash,
      source_freeze_package_hash: parentIssuance.source_freeze_package_hash,
      activation_token_redemption_readiness_hash: null,
      token_redemption_readiness_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      redemption_readiness_signatures_json: {},
      redemption_readiness_metadata_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
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
      this._mockState.tokenRedemptionReadiness.set(readinessId, record);
      this._mockState.rules.set(readinessId, []);
      await auditSvc.createAuditLog(readinessId, 'TOKEN_REDEMPTION_READINESS_DRAFT_CREATED', actorId, { activationTokenIssuanceId });
      return { tokenRedemptionReadiness: record };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_readiness
       (activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_preflight_id,
        source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id,
        source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id,
        source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id,
        source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_redemption_readiness_status, activation_token_redemption_readiness_result,
        risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_redemption_readiness_summary_json,
        impact_review_json, rollback_review_json, guardrail_review_json,
        token_redemption_readiness_rules_json, token_redemption_readiness_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, non_redeemable_token_record_json, source_activation_token_issuance_hash,
        source_activation_token_preflight_hash, source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status,
        job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}',
               '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
               'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        readinessId, activationTokenIssuanceId, record.source_activation_token_preflight_id,
        record.source_activation_token_staging_id, record.source_activation_token_final_apv_id,
        record.source_activation_token_env_id, record.source_activation_handoff_id, record.source_activation_decision_id,
        record.source_activation_lock_id, record.source_activation_auth_id, record.source_activation_readiness_id,
        record.source_plan_id, record.source_dispatcher_id, record.source_envelope_id, record.source_auth_id,
        record.source_readiness_id, record.source_approval_id, record.source_prep_id, record.source_review_id,
        record.source_simulation_id, record.source_execution_id, record.cohort_id, record.tenant_id, record.simulation_type,
        record.risk_level, record.confidence_level, record.projected_impact_score,
        record.rollback_feasibility_score, record.evidence_completeness_score,
        JSON.stringify(readinessConfig),
        JSON.stringify({ missing_token_redemption_readiness_evaluation: true }),
        JSON.stringify(nonExecution161), JSON.stringify(writeScope161), JSON.stringify(tokenRecord),
        record.source_activation_token_issuance_hash, record.source_activation_token_preflight_hash,
        record.source_activation_token_staging_hash, record.source_token_material_hash, record.source_freeze_package_hash
      ]
    );

    await auditSvc.createAuditLog(readinessId, 'TOKEN_REDEMPTION_READINESS_DRAFT_CREATED', actorId, { activationTokenIssuanceId });
    return { tokenRedemptionReadiness: await this.getTokenRedemptionReadiness(readinessId) };
  }

  async getTokenRedemptionReadiness(activationTokenRedemptionReadinessId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.tokenRedemptionReadiness.get(activationTokenRedemptionReadinessId) || null;
    const rows = await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_readiness WHERE activation_token_redemption_readiness_id = ?`, [activationTokenRedemptionReadinessId]);
    return rows && rows[0] ? rows[0] : null;
  }

  async listTokenRedemptionReadinesses() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return Array.from(this._mockState.tokenRedemptionReadiness.values());
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_readiness ORDER BY created_at DESC`);
  }

  async getRules(activationTokenRedemptionReadinessId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.rules.get(activationTokenRedemptionReadinessId) || [];
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_readiness_rules WHERE activation_token_redemption_readiness_id = ? ORDER BY created_at ASC`, [activationTokenRedemptionReadinessId]);
  }

  async updateTokenRedemptionReadiness(activationTokenRedemptionReadinessId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
    if (!original) throw new Error('TOKEN_REDEMPTION_READINESS_RECORD_NOT_FOUND');

    if (original.activation_token_redemption_readiness_status === 'FINALIZED') {
      throw new Error('TOKEN_REDEMPTION_READINESS_IMMUTABLE');
    }

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionReadiness.set(activationTokenRedemptionReadinessId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenRedemptionReadinessId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_redempt_readiness SET ${setClauses.join(', ')} WHERE activation_token_redemption_readiness_id = ?`, bindings);
    return await this.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
  }

  async _internalUpdateTokenRedemptionReadiness(activationTokenRedemptionReadinessId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
    if (!original) throw new Error('TOKEN_REDEMPTION_READINESS_RECORD_NOT_FOUND');

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionReadiness.set(activationTokenRedemptionReadinessId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenRedemptionReadinessId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_redempt_readiness SET ${setClauses.join(', ')} WHERE activation_token_redemption_readiness_id = ?`, bindings);
    return await this.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
  }

  async createRule(activationTokenRedemptionReadinessId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const rule = { rule_id: ruleId, activation_token_redemption_readiness_id: activationTokenRedemptionReadinessId, check_type: checkType, severity, description, created_at: new Date() };

    if (!isProdLike) {
      const list = this._mockState.rules.get(activationTokenRedemptionReadinessId) || [];
      list.push(rule);
      this._mockState.rules.set(activationTokenRedemptionReadinessId, list);
      return rule;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_readiness_rules 
       (rule_id, activation_token_redemption_readiness_id, check_type, severity, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [ruleId, activationTokenRedemptionReadinessId, checkType, severity, description]
    );
    return rule;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService()
};
