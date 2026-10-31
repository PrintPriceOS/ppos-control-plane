'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionFinalApproval: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionFinalApprovalDraft(activationTokenRedemptionEnvId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentEnv;
    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_env WHERE activation_token_redemption_env_id = ?`,
        [activationTokenRedemptionEnvId]
      );
      parentEnv = rows && rows[0];
    } else {
      const envBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
      parentEnv = envBuilder._mockState.tokenRedemptionEnvelope.get(activationTokenRedemptionEnvId);
    }

    if (!parentEnv) throw new Error('TOKEN_REDEMPTION_ENVELOPE_RECORD_NOT_FOUND');
    if (parentEnv.activation_token_redemption_envelope_status !== 'FINALIZED' || parentEnv.activation_token_redemption_envelope_result !== 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED') {
      throw new Error('TOKEN_REDEMPTION_ENVELOPE_NOT_READY');
    }

    const approvalId = 'ate_fapv_' + crypto.randomBytes(8).toString('hex');
    const writeScope164 = { writes_only_phase164_tables: true, wrote_phase128_to_163_operational_tables: false };
    const nonExecution164 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

    const canaryConfig = {
      redemption_final_approval_mode: 'TOKEN_REDEMPTION_FINAL_APPROVAL_ONLY',
      allow_redemption_final_approval_record: true,
      allow_usable_token_redeem: false,
      allow_token_redeem: false,
      allow_make_token_redeemable: false,
      allow_real_activation: false,
      allow_real_execution: false,
      allow_plan_executable_state: false,
      allow_job_creation: false,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      allow_runtime_session_creation: false,
      allow_runtime_access_grant: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      requires_future_redemption_staging_or_lock_gate: true,
      immutable_after_finalization: true
    };

    const tokenRecord = {
      token_urn: `urn:printprice:cohort:intervention:token:final_approval:${approvalId}`,
      final_approval_recorded_at: new Date().toISOString(),
      governed_final_approval_confirmed: true,
      allow_token_redemption_assertion: 'Phase 164 is not token redemption. It only records final approval for a future redemption path.'
    };

    const record = {
      activation_token_redemption_final_apv_id: approvalId,
      source_activation_token_redemption_env_id: activationTokenRedemptionEnvId,
      source_activation_token_redemption_auth_id: parentEnv.source_activation_token_redemption_auth_id,
      source_activation_token_redemption_readiness_id: parentEnv.source_activation_token_redemption_readiness_id,
      source_activation_token_issuance_id: parentEnv.source_activation_token_issuance_id,
      source_activation_token_preflight_id: parentEnv.source_activation_token_preflight_id,
      source_activation_token_staging_id: parentEnv.source_activation_token_staging_id,
      source_activation_token_final_apv_id: parentEnv.source_activation_token_final_apv_id,
      source_activation_token_env_id: parentEnv.source_activation_token_env_id,
      source_activation_handoff_id: parentEnv.source_activation_handoff_id,
      source_activation_decision_id: parentEnv.source_activation_decision_id,
      source_activation_lock_id: parentEnv.source_activation_lock_id,
      source_activation_auth_id: parentEnv.source_activation_auth_id,
      source_activation_readiness_id: parentEnv.source_activation_readiness_id,
      source_plan_id: parentEnv.source_plan_id,
      source_dispatcher_id: parentEnv.source_dispatcher_id,
      source_envelope_id: parentEnv.source_envelope_id,
      source_auth_id: parentEnv.source_auth_id,
      source_readiness_id: parentEnv.source_readiness_id,
      source_approval_id: parentEnv.source_approval_id,
      source_prep_id: parentEnv.source_prep_id,
      source_review_id: parentEnv.source_review_id,
      source_simulation_id: parentEnv.source_simulation_id,
      source_execution_id: parentEnv.source_execution_id,
      cohort_id: parentEnv.cohort_id,
      tenant_id: parentEnv.tenant_id,
      simulation_type: parentEnv.simulation_type,
      activation_token_redemption_final_apv_status: 'DRAFT',
      activation_token_redemption_final_apv_result: null,
      risk_level: parentEnv.risk_level,
      confidence_level: parentEnv.confidence_level,
      projected_impact_score: parentEnv.projected_impact_score,
      rollback_feasibility_score: parentEnv.rollback_feasibility_score,
      evidence_completeness_score: parentEnv.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: canaryConfig,
      token_redemption_final_apv_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      token_redemption_final_apv_rules_json: {},
      token_redemption_final_apv_blockers_json: { missing_token_redemption_final_approval_evaluation: true },
      non_execution_attestation_json: nonExecution164,
      write_scope_attestation_json: writeScope164,
      non_redeemable_token_record_json: tokenRecord,
      source_activation_token_redemption_envelope_hash: parentEnv.activation_token_redemption_envelope_hash,
      source_activation_token_redemption_authorization_hash: parentEnv.source_activation_token_redemption_authorization_hash,
      source_activation_token_redemption_readiness_hash: parentEnv.source_activation_token_redemption_readiness_hash,
      source_activation_token_issuance_hash: parentEnv.source_activation_token_issuance_hash,
      source_activation_token_preflight_hash: parentEnv.source_activation_token_preflight_hash,
      source_activation_token_staging_hash: parentEnv.source_activation_token_staging_hash,
      source_token_material_hash: parentEnv.source_token_material_hash,
      source_freeze_package_hash: parentEnv.source_freeze_package_hash,
      activation_token_redemption_final_apv_hash: null,
      token_redemption_final_apv_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      redemption_final_apv_signatures_json: {},
      redemption_final_apv_metadata_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
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
      this._mockState.tokenRedemptionFinalApproval.set(approvalId, record);
      this._mockState.rules.set(approvalId, []);
      await auditSvc.createAuditLog(approvalId, 'TOKEN_REDEMPTION_FINAL_APPROVAL_DRAFT_CREATED', actorId, { activationTokenRedemptionEnvId });
      return { tokenRedemptionFinalApproval: record };
    }

    // Exactly 67 fields mapped to exactly 67 placeholders
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_fapv
       (activation_token_redemption_final_apv_id, source_activation_token_redemption_env_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id,
        source_activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id,
        source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id,
        source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id,
        source_plan_id, source_dispatcher_id, source_envelope_id,
        source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_redemption_final_apv_status, activation_token_redemption_final_apv_result,
        risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_redemption_final_apv_summary_json,
        impact_review_json, rollback_review_json, guardrail_review_json,
        token_redemption_final_apv_rules_json, token_redemption_final_apv_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, non_redeemable_token_record_json, source_activation_token_redemption_envelope_hash,
        source_activation_token_redemption_authorization_hash, source_activation_token_redemption_readiness_hash, source_activation_token_issuance_hash, source_activation_token_preflight_hash,
        source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_redemption_final_apv_hash, token_redemption_final_apv_evidence_pack_hash, evidence_pack_hash,
        lineage_hash_chain_json, redemption_final_apv_signatures_json, redemption_final_apv_metadata_json,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status,
        job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?)`,
      [
        approvalId, activationTokenRedemptionEnvId, record.source_activation_token_redemption_auth_id, record.source_activation_token_redemption_readiness_id,
        record.source_activation_token_issuance_id, record.source_activation_token_preflight_id, record.source_activation_token_staging_id,
        record.source_activation_token_final_apv_id, record.source_activation_token_env_id, record.source_activation_handoff_id,
        record.source_activation_decision_id, record.source_activation_lock_id, record.source_activation_auth_id, record.source_activation_readiness_id,
        record.source_plan_id, record.source_dispatcher_id, record.source_envelope_id, record.source_auth_id,
        record.source_readiness_id, record.source_approval_id, record.source_prep_id, record.source_review_id,
        record.source_simulation_id, record.source_execution_id, record.cohort_id, record.tenant_id, record.simulation_type,
        
        'DRAFT', null,
        record.risk_level, record.confidence_level, record.projected_impact_score, record.rollback_feasibility_score, record.evidence_completeness_score,
        'PENDING', 'PENDING',
        JSON.stringify(canaryConfig), '{}', '{}', '{}', '{}', '{}',
        JSON.stringify({ missing_token_redemption_final_approval_evaluation: true }),
        JSON.stringify(nonExecution164), JSON.stringify(writeScope164), JSON.stringify(tokenRecord),
        record.source_activation_token_redemption_envelope_hash, record.source_activation_token_redemption_authorization_hash, record.source_activation_token_redemption_readiness_hash,
        record.source_activation_token_issuance_hash, record.source_activation_token_preflight_hash, record.source_activation_token_staging_hash,
        record.source_token_material_hash, record.source_freeze_package_hash,
        
        null, null, null,
        '{}', '{}', '{}',
        
        'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
        'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      ]
    );

    await auditSvc.createAuditLog(approvalId, 'TOKEN_REDEMPTION_FINAL_APPROVAL_DRAFT_CREATED', actorId, { activationTokenRedemptionEnvId });
    return { tokenRedemptionFinalApproval: await this.getTokenRedemptionFinalApproval(approvalId) };
  }

  async getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.tokenRedemptionFinalApproval.get(activationTokenRedemptionFinalApvId) || null;
    const rows = await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_fapv WHERE activation_token_redemption_final_apv_id = ?`, [activationTokenRedemptionFinalApvId]);
    return rows && rows[0] ? rows[0] : null;
  }

  async listTokenRedemptionFinalApprovals() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return Array.from(this._mockState.tokenRedemptionFinalApproval.values());
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_fapv ORDER BY created_at DESC`);
  }

  async getRules(activationTokenRedemptionFinalApvId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.rules.get(activationTokenRedemptionFinalApvId) || [];
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_fapv_rules WHERE activation_token_redemption_final_apv_id = ? ORDER BY created_at ASC`, [activationTokenRedemptionFinalApvId]);
  }

  async updateTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId);
    if (!original) throw new Error('TOKEN_REDEMPTION_FINAL_APPROVAL_RECORD_NOT_FOUND');

    if (original.activation_token_redemption_final_apv_status === 'FINALIZED') {
      throw new Error('TOKEN_REDEMPTION_FINAL_APPROVAL_IMMUTABLE');
    }

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionFinalApproval.set(activationTokenRedemptionFinalApvId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenRedemptionFinalApvId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_redempt_fapv SET ${setClauses.join(', ')} WHERE activation_token_redemption_final_apv_id = ?`, bindings);
    return await this.getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId);
  }

  async _internalUpdateTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId);
    if (!original) throw new Error('TOKEN_REDEMPTION_FINAL_APPROVAL_RECORD_NOT_FOUND');

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionFinalApproval.set(activationTokenRedemptionFinalApvId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenRedemptionFinalApvId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_redempt_fapv SET ${setClauses.join(', ')} WHERE activation_token_redemption_final_apv_id = ?`, bindings);
    return await this.getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId);
  }

  async createRule(activationTokenRedemptionFinalApvId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const rule = { rule_id: ruleId, activation_token_redemption_final_apv_id: activationTokenRedemptionFinalApvId, check_type: checkType, severity, description, created_at: new Date() };

    if (!isProdLike) {
      const list = this._mockState.rules.get(activationTokenRedemptionFinalApvId) || [];
      list.push(rule);
      this._mockState.rules.set(activationTokenRedemptionFinalApvId, list);
      return rule;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_fapv_rules 
       (rule_id, activation_token_redemption_final_apv_id, check_type, severity, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [ruleId, activationTokenRedemptionFinalApvId, checkType, severity, description]
    );
    return rule;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService()
};
