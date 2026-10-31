'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionEnvelope: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionEnvelopeDraft(activationTokenRedemptionAuthId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentAuth;
    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_auth WHERE activation_token_redemption_auth_id = ?`,
        [activationTokenRedemptionAuthId]
      );
      parentAuth = rows && rows[0];
    } else {
      const authBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
      parentAuth = authBuilder._mockState.tokenRedemptionAuth.get(activationTokenRedemptionAuthId);
    }

    if (!parentAuth) throw new Error('TOKEN_REDEMPTION_AUTHORIZATION_RECORD_NOT_FOUND');
    if (parentAuth.activation_token_redemption_auth_status !== 'FINALIZED' || parentAuth.activation_token_redemption_auth_result !== 'REDEMPTION_AUTHORIZED_NOT_REDEEMED') {
      throw new Error('TOKEN_REDEMPTION_AUTHORIZATION_NOT_READY');
    }

    const envelopeId = 'ate_env_' + crypto.randomBytes(8).toString('hex');
    const writeScope163 = { writes_only_phase163_tables: true, wrote_phase128_to_162_operational_tables: false };
    const nonExecution163 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

    const envelopeConfig = {
      redemption_envelope_mode: 'TOKEN_REDEMPTION_ENVELOPE_ONLY',
      token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_redemption_envelope_status: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
      token_redemption_status: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
      token_redeemable: false,
      allow_redemption_envelope_record: true,
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
      requires_future_redemption_final_approval_gate: true,
      immutable_after_finalization: true
    };

    const tokenRecord = {
      token_urn: `urn:printprice:cohort:intervention:token:envelope:${envelopeId}`,
      envelope_prepared_at: new Date().toISOString(),
      governed_redemption_envelope_confirmed: true,
      allow_token_redemption_assertion: 'Phase 163 is not token redemption. It only prepares a non-redeemable redemption envelope.'
    };

    const record = {
      activation_token_redemption_env_id: envelopeId,
      source_activation_token_redemption_auth_id: activationTokenRedemptionAuthId,
      source_activation_token_redemption_readiness_id: parentAuth.source_activation_token_redemption_readiness_id,
      source_activation_token_issuance_id: parentAuth.source_activation_token_issuance_id,
      source_activation_token_preflight_id: parentAuth.source_activation_token_preflight_id,
      source_activation_token_staging_id: parentAuth.source_activation_token_staging_id,
      source_activation_token_final_apv_id: parentAuth.source_activation_token_final_apv_id,
      source_activation_token_env_id: parentAuth.source_activation_token_env_id,
      source_activation_handoff_id: parentAuth.source_activation_handoff_id,
      source_activation_decision_id: parentAuth.source_activation_decision_id,
      source_activation_lock_id: parentAuth.source_activation_lock_id,
      source_activation_auth_id: parentAuth.source_activation_auth_id,
      source_activation_readiness_id: parentAuth.source_activation_readiness_id,
      source_plan_id: parentAuth.source_plan_id,
      source_dispatcher_id: parentAuth.source_dispatcher_id,
      source_envelope_id: parentAuth.source_envelope_id,
      source_auth_id: parentAuth.source_auth_id,
      source_readiness_id: parentAuth.source_readiness_id,
      source_approval_id: parentAuth.source_approval_id,
      source_prep_id: parentAuth.source_prep_id,
      source_review_id: parentAuth.source_review_id,
      source_simulation_id: parentAuth.source_simulation_id,
      source_execution_id: parentAuth.source_execution_id,
      cohort_id: parentAuth.cohort_id,
      tenant_id: parentAuth.tenant_id,
      simulation_type: parentAuth.simulation_type,
      activation_token_redemption_envelope_status: 'DRAFT',
      activation_token_redemption_envelope_result: null,
      risk_level: parentAuth.risk_level,
      confidence_level: parentAuth.confidence_level,
      projected_impact_score: parentAuth.projected_impact_score,
      rollback_feasibility_score: parentAuth.rollback_feasibility_score,
      evidence_completeness_score: parentAuth.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: envelopeConfig,
      token_redemption_envelope_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      token_redemption_envelope_rules_json: {},
      token_redemption_envelope_blockers_json: { missing_token_redemption_envelope_evaluation: true },
      non_execution_attestation_json: nonExecution163,
      write_scope_attestation_json: writeScope163,
      non_redeemable_token_record_json: tokenRecord,
      source_activation_token_redemption_authorization_hash: parentAuth.activation_token_redemption_auth_hash,
      source_activation_token_redemption_readiness_hash: parentAuth.source_activation_token_redemption_readiness_hash,
      source_activation_token_issuance_hash: parentAuth.source_activation_token_issuance_hash,
      source_activation_token_preflight_hash: parentAuth.source_activation_token_preflight_hash,
      source_activation_token_staging_hash: parentAuth.source_activation_token_staging_hash,
      source_token_material_hash: parentAuth.source_token_material_hash,
      source_freeze_package_hash: parentAuth.source_freeze_package_hash,
      activation_token_redemption_envelope_hash: null,
      token_redemption_envelope_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      redemption_envelope_signatures_json: {},
      redemption_envelope_metadata_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
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
      this._mockState.tokenRedemptionEnvelope.set(envelopeId, record);
      this._mockState.rules.set(envelopeId, []);
      await auditSvc.createAuditLog(envelopeId, 'TOKEN_REDEMPTION_ENVELOPE_DRAFT_CREATED', actorId, { activationTokenRedemptionAuthId });
      return { tokenRedemptionEnvelope: record };
    }

    // Exactly 64 fields mapped to exactly 64 placeholders
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_env
       (activation_token_redemption_env_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id,
        source_activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id,
        source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id,
        source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id,
        source_plan_id, source_dispatcher_id, source_envelope_id,
        source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_redemption_envelope_status, activation_token_redemption_envelope_result,
        risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_redemption_envelope_summary_json,
        impact_review_json, rollback_review_json, guardrail_review_json,
        token_redemption_envelope_rules_json, token_redemption_envelope_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, non_redeemable_token_record_json, source_activation_token_redemption_authorization_hash,
        source_activation_token_redemption_readiness_hash, source_activation_token_issuance_hash, source_activation_token_preflight_hash,
        source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_redemption_envelope_hash, token_redemption_envelope_evidence_pack_hash, evidence_pack_hash,
        lineage_hash_chain_json, redemption_envelope_signatures_json, redemption_envelope_metadata_json,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status,
        job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?)`,
      [
        envelopeId, activationTokenRedemptionAuthId, record.source_activation_token_redemption_readiness_id,
        record.source_activation_token_issuance_id, record.source_activation_token_preflight_id, record.source_activation_token_staging_id,
        record.source_activation_token_final_apv_id, record.source_activation_token_env_id, record.source_activation_handoff_id,
        record.source_activation_decision_id, record.source_activation_lock_id, record.source_activation_auth_id, record.source_activation_readiness_id,
        record.source_plan_id, record.source_dispatcher_id, record.source_envelope_id, record.source_auth_id,
        record.source_readiness_id, record.source_approval_id, record.source_prep_id, record.source_review_id,
        record.source_simulation_id, record.source_execution_id, record.cohort_id, record.tenant_id, record.simulation_type,
        
        'DRAFT', null,
        record.risk_level, record.confidence_level, record.projected_impact_score, record.rollback_feasibility_score, record.evidence_completeness_score,
        'PENDING', 'PENDING',
        JSON.stringify(envelopeConfig), '{}', '{}', '{}', '{}', '{}',
        JSON.stringify({ missing_token_redemption_envelope_evaluation: true }),
        JSON.stringify(nonExecution163), JSON.stringify(writeScope163), JSON.stringify(tokenRecord),
        record.source_activation_token_redemption_authorization_hash, record.source_activation_token_redemption_readiness_hash,
        record.source_activation_token_issuance_hash, record.source_activation_token_preflight_hash, record.source_activation_token_staging_hash,
        record.source_token_material_hash, record.source_freeze_package_hash,
        
        null, null, null,
        '{}', '{}', '{}',
        
        'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
        'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      ]
    );

    await auditSvc.createAuditLog(envelopeId, 'TOKEN_REDEMPTION_ENVELOPE_DRAFT_CREATED', actorId, { activationTokenRedemptionAuthId });
    return { tokenRedemptionEnvelope: await this.getTokenRedemptionEnvelope(envelopeId) };
  }

  async getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.tokenRedemptionEnvelope.get(activationTokenRedemptionEnvelopeId) || null;
    const rows = await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_env WHERE activation_token_redemption_env_id = ?`, [activationTokenRedemptionEnvelopeId]);
    return rows && rows[0] ? rows[0] : null;
  }

  async listTokenRedemptionEnvelopes() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return Array.from(this._mockState.tokenRedemptionEnvelope.values());
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_env ORDER BY created_at DESC`);
  }

  async getRules(activationTokenRedemptionEnvelopeId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.rules.get(activationTokenRedemptionEnvelopeId) || [];
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_env_rules WHERE activation_token_redemption_envelope_id = ? ORDER BY created_at ASC`, [activationTokenRedemptionEnvelopeId]);
  }

  async updateTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId);
    if (!original) throw new Error('TOKEN_REDEMPTION_ENVELOPE_RECORD_NOT_FOUND');

    if (original.activation_token_redemption_envelope_status === 'FINALIZED') {
      throw new Error('TOKEN_REDEMPTION_ENVELOPE_IMMUTABLE');
    }

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionEnvelope.set(activationTokenRedemptionEnvelopeId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenRedemptionEnvelopeId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_redempt_env SET ${setClauses.join(', ')} WHERE activation_token_redemption_env_id = ?`, bindings);
    return await this.getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId);
  }

  async _internalUpdateTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId);
    if (!original) throw new Error('TOKEN_REDEMPTION_ENVELOPE_RECORD_NOT_FOUND');

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionEnvelope.set(activationTokenRedemptionEnvelopeId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenRedemptionEnvelopeId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_redempt_env SET ${setClauses.join(', ')} WHERE activation_token_redemption_env_id = ?`, bindings);
    return await this.getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId);
  }

  async createRule(activationTokenRedemptionEnvelopeId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const rule = { rule_id: ruleId, activation_token_redemption_envelope_id: activationTokenRedemptionEnvelopeId, check_type: checkType, severity, description, created_at: new Date() };

    if (!isProdLike) {
      const list = this._mockState.rules.get(activationTokenRedemptionEnvelopeId) || [];
      list.push(rule);
      this._mockState.rules.set(activationTokenRedemptionEnvelopeId, list);
      return rule;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_env_rules 
       (rule_id, activation_token_redemption_envelope_id, check_type, severity, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [ruleId, activationTokenRedemptionEnvelopeId, checkType, severity, description]
    );
    return rule;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService()
};
