'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const finalApvBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionLock: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionLockDraft(finalApprovalId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let parent = null;

    if (!isProdLike) {
      parent = finalApvBuilder._mockState.tokenRedemptionFinalApproval.get(finalApprovalId);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_fapv WHERE activation_token_redemption_final_apv_id = ?`,
        [finalApprovalId]
      );
      if (rows && rows[0]) {
        parent = rows[0];
        if (typeof parent.canary_envelope_json === 'string') parent.canary_envelope_json = JSON.parse(parent.canary_envelope_json);
        if (typeof parent.non_execution_attestation_json === 'string') parent.non_execution_attestation_json = JSON.parse(parent.non_execution_attestation_json);
        if (typeof parent.write_scope_attestation_json === 'string') parent.write_scope_attestation_json = JSON.parse(parent.write_scope_attestation_json);
        if (typeof parent.non_redeemable_token_record_json === 'string') parent.non_redeemable_token_record_json = JSON.parse(parent.non_redeemable_token_record_json);
      }
    }

    if (!parent) {
      throw new Error(`TOKEN_REDEMPTION_FINAL_APPROVAL_NOT_FOUND: Parent Final Approval ${finalApprovalId} does not exist.`);
    }

    if (parent.activation_token_redemption_final_apv_status !== 'FINALIZED') {
      throw new Error(`TOKEN_REDEMPTION_FINAL_APPROVAL_NOT_READY: Parent Final Approval ${finalApprovalId} is not finalized.`);
    }

    const lockId = `atl_${crypto.randomBytes(8).toString('hex')}`;
    const defaultCanary = {
      redemption_lock_mode: 'TOKEN_REDEMPTION_LOCK_PRE_REDEMPTION_FREEZE_ONLY',
      allow_redemption_lock_record: true,
      allow_redemption_package_freeze_record: true,
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
      requires_future_redemption_unlock_or_execution_gate: true,
      immutable_after_finalization: true
    };

    const record = {
      activation_token_redemption_lock_id: lockId,
      source_activation_token_redemption_final_apv_id: finalApprovalId,
      source_activation_token_redemption_env_id: parent.source_activation_token_redemption_env_id || parent.source_envelope_id,
      source_activation_token_redemption_auth_id: parent.source_activation_token_redemption_auth_id || parent.source_auth_id,
      source_activation_token_redemption_readiness_id: parent.source_activation_token_redemption_readiness_id || parent.source_readiness_id,
      source_activation_token_issuance_id: parent.source_activation_token_issuance_id || parent.source_issuance_id,
      source_activation_token_preflight_id: parent.source_activation_token_preflight_id || parent.source_preflight_id || 'atp_dummy',
      source_activation_token_staging_id: parent.source_activation_token_staging_id || parent.source_staging_id || 'ats_dummy',
      source_activation_token_final_apv_id: finalApprovalId,
      source_activation_token_env_id: parent.source_activation_token_env_id || parent.source_envelope_id || 'env_dummy',
      source_activation_handoff_id: parent.source_activation_handoff_id || 'ahf_dummy',
      source_activation_decision_id: parent.source_activation_decision_id || 'dec_dummy',
      source_activation_lock_id: parent.source_activation_lock_id || 'lock_dummy',
      source_activation_auth_id: parent.source_activation_auth_id || 'auth_dummy',
      source_activation_readiness_id: parent.source_activation_readiness_id || 'rd_dummy',
      source_plan_id: parent.source_plan_id || 'pln_dummy',
      source_dispatcher_id: parent.source_dispatcher_id || 'dsp_dummy',
      source_envelope_id: parent.source_envelope_id || 'env_dummy',
      source_auth_id: parent.source_auth_id || 'ath_dummy',
      source_readiness_id: parent.source_readiness_id || 'rd_dummy',
      source_approval_id: parent.source_approval_id || 'apv_dummy',
      source_prep_id: parent.source_prep_id || 'prep_dummy',
      source_review_id: parent.source_review_id || null,
      source_simulation_id: parent.source_simulation_id || null,
      source_execution_id: parent.source_execution_id || null,
      cohort_id: parent.cohort_id || null,
      tenant_id: parent.tenant_id || null,
      simulation_type: parent.simulation_type || null,
      activation_token_redemption_lock_status: 'DRAFT',
      activation_token_redemption_lock_result: 'PENDING',
      risk_level: parent.risk_level || 'LOW',
      confidence_level: parent.confidence_level || 'HIGH',
      projected_impact_score: parent.projected_impact_score ? Number(parent.projected_impact_score) : 0.0,
      rollback_feasibility_score: parent.rollback_feasibility_score ? Number(parent.rollback_feasibility_score) : 100.0,
      evidence_completeness_score: parent.evidence_completeness_score ? Number(parent.evidence_completeness_score) : 0.0,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: defaultCanary,
      token_redemption_lock_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      token_redemption_lock_rules_json: {},
      token_redemption_lock_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true },
      write_scope_attestation_json: { writes_only_phase165_tables: true, wrote_phase128_to_164_operational_tables: false },
      non_redeemable_token_record_json: { token_redeemable: false, token_redemption: 'LOCKED_NOT_REDEEMED', reason: 'Pre-Redemption Freeze Lock applied.' },
      source_activation_token_redemption_final_approval_hash: parent.activation_token_redemption_final_approval_hash || parent.final_approval_hash || 'apv_hash_dummy',
      source_activation_token_redemption_envelope_hash: parent.activation_token_redemption_envelope_hash || parent.source_activation_token_redemption_envelope_hash || 'env_hash_dummy',
      source_activation_token_redemption_authorization_hash: parent.activation_token_redemption_auth_hash || parent.source_activation_token_redemption_authorization_hash || 'ath_hash_dummy',
      source_activation_token_redemption_readiness_hash: parent.activation_token_redemption_readiness_hash || parent.source_activation_token_redemption_readiness_hash || 'rdy_hash_dummy',
      source_activation_token_issuance_hash: parent.activation_token_issuance_hash || parent.source_activation_token_issuance_hash || 'iss_hash_dummy',
      source_activation_token_preflight_hash: parent.activation_token_preflight_hash || parent.source_activation_token_preflight_hash || 'pfl_hash_dummy',
      source_activation_token_staging_hash: parent.activation_token_staging_hash || parent.source_activation_token_staging_hash || 'stg_hash_dummy',
      source_token_material_hash: parent.source_token_material_hash || 'token_material_hash_dummy',
      source_freeze_package_hash: parent.source_freeze_package_hash || 'lock_hash_dummy',
      activation_token_redemption_lock_hash: 'pending_hash',
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_redemption_lock_status_val: 'LOCKED_NOT_REDEEMED',
      token_redemption_status: 'LOCKED_NOT_REDEEMED',
      token_redeemable_status: 'NOT_REDEEMABLE',
      activation_execution_status: 'TOKEN_REDEMPTION_LOCK_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockState.tokenRedemptionLock.set(lockId, record);
    } else {
      const columns = [
        'activation_token_redemption_lock_id', 'source_activation_token_redemption_final_apv_id',
        'source_activation_token_redemption_env_id', 'source_activation_token_redemption_auth_id',
        'source_activation_token_redemption_readiness_id', 'source_activation_token_issuance_id',
        'source_activation_token_preflight_id', 'source_activation_token_staging_id',
        'source_activation_token_final_apv_id', 'source_activation_token_env_id',
        'source_activation_handoff_id', 'source_activation_decision_id',
        'source_activation_lock_id', 'source_activation_auth_id',
        'source_activation_readiness_id', 'source_plan_id',
        'source_dispatcher_id', 'source_envelope_id',
        'source_auth_id', 'source_readiness_id',
        'source_approval_id', 'source_prep_id',
        'source_review_id', 'source_simulation_id', 'source_execution_id',
        'cohort_id', 'tenant_id', 'simulation_type',
        'activation_token_redemption_lock_status', 'activation_token_redemption_lock_result',
        'risk_level', 'confidence_level', 'projected_impact_score',
        'rollback_feasibility_score', 'evidence_completeness_score',
        'guardrail_status', 'write_scope_status', 'canary_envelope_json',
        'token_redemption_lock_summary_json', 'impact_review_json',
        'rollback_review_json', 'guardrail_review_json',
        'token_redemption_lock_rules_json', 'token_redemption_lock_blockers_json',
        'non_execution_attestation_json', 'write_scope_attestation_json',
        'non_redeemable_token_record_json',
        'source_activation_token_redemption_final_approval_hash', 'source_activation_token_redemption_envelope_hash',
        'source_activation_token_redemption_authorization_hash', 'source_activation_token_redemption_readiness_hash',
        'source_activation_token_issuance_hash', 'source_activation_token_preflight_hash',
        'source_activation_token_staging_hash', 'source_token_material_hash',
        'source_freeze_package_hash', 'activation_token_redemption_lock_hash',
        'execution_capability_status', 'token_status',
        'token_redemption_lock_status_val', 'token_redemption_status',
        'token_redeemable_status', 'activation_execution_status',
        'redemption_package_freeze_status', 'package_freeze_status',
        'plan_executable_status', 'job_creation_status',
        'queue_dispatch_status', 'runtime_mutation_status',
        'created_by', 'updated_by'
      ];

      const bindings = [
        record.activation_token_redemption_lock_id, record.source_activation_token_redemption_final_apv_id,
        record.source_activation_token_redemption_env_id, record.source_activation_token_redemption_auth_id,
        record.source_activation_token_redemption_readiness_id, record.source_activation_token_issuance_id,
        record.source_activation_token_preflight_id, record.source_activation_token_staging_id,
        record.source_activation_token_final_apv_id, record.source_activation_token_env_id,
        record.source_activation_handoff_id, record.source_activation_decision_id,
        record.source_activation_lock_id, record.source_activation_auth_id,
        record.source_activation_readiness_id, record.source_plan_id,
        record.source_dispatcher_id, record.source_envelope_id,
        record.source_auth_id, record.source_readiness_id,
        record.source_approval_id, record.source_prep_id,
        record.source_review_id, record.source_simulation_id, record.source_execution_id,
        record.cohort_id, record.tenant_id, record.simulation_type,
        record.activation_token_redemption_lock_status, record.activation_token_redemption_lock_result,
        record.risk_level, record.confidence_level, record.projected_impact_score,
        record.rollback_feasibility_score, record.evidence_completeness_score,
        record.guardrail_status, record.write_scope_status, JSON.stringify(record.canary_envelope_json),
        JSON.stringify(record.token_redemption_lock_summary_json), JSON.stringify(record.impact_review_json),
        JSON.stringify(record.rollback_review_json), JSON.stringify(record.guardrail_review_json),
        JSON.stringify(record.token_redemption_lock_rules_json), JSON.stringify(record.token_redemption_lock_blockers_json),
        JSON.stringify(record.non_execution_attestation_json), JSON.stringify(record.write_scope_attestation_json),
        JSON.stringify(record.non_redeemable_token_record_json),
        record.source_activation_token_redemption_final_approval_hash, record.source_activation_token_redemption_envelope_hash,
        record.source_activation_token_redemption_authorization_hash, record.source_activation_token_redemption_readiness_hash,
        record.source_activation_token_issuance_hash, record.source_activation_token_preflight_hash,
        record.source_activation_token_staging_hash, record.source_token_material_hash,
        record.source_freeze_package_hash, record.activation_token_redemption_lock_hash,
        record.execution_capability_status, record.token_status,
        record.token_redemption_lock_status_val, record.token_redemption_status,
        record.token_redeemable_status, record.activation_execution_status,
        record.redemption_package_freeze_status, record.package_freeze_status,
        record.plan_executable_status, record.job_creation_status,
        record.queue_dispatch_status, record.runtime_mutation_status,
        record.created_by, record.updated_by
      ];

      // Exact columns count assertion
      if (columns.length !== bindings.length) {
        throw new Error(`CRITICAL: Column count (${columns.length}) and bindings count (${bindings.length}) mismatch.`);
      }

      const query = `
        INSERT INTO cb_cohort_intervention_activation_token_redempt_lock
        (${columns.join(', ')})
        VALUES (${Array(columns.length).fill('?').join(', ')})
      `;
      await db.query(query, bindings);
    }

    await auditService.logAction(lockId, 'TOKEN_REDEMPTION_LOCK_DRAFT_CREATED', actorId, { finalApprovalId });

    return { tokenRedemptionLock: record };
  }

  async getTokenRedemptionLock(lockId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      const record = this._mockState.tokenRedemptionLock.get(lockId);
      if (!record) return null;
      return record;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_lock WHERE activation_token_redemption_lock_id = ?`,
      [lockId]
    );
    if (!rows || !rows[0]) return null;
    const record = rows[0];
    if (typeof record.canary_envelope_json === 'string') record.canary_envelope_json = JSON.parse(record.canary_envelope_json);
    if (typeof record.token_redemption_lock_summary_json === 'string') record.token_redemption_lock_summary_json = JSON.parse(record.token_redemption_lock_summary_json);
    if (typeof record.impact_review_json === 'string') record.impact_review_json = JSON.parse(record.impact_review_json);
    if (typeof record.rollback_review_json === 'string') record.rollback_review_json = JSON.parse(record.rollback_review_json);
    if (typeof record.guardrail_review_json === 'string') record.guardrail_review_json = JSON.parse(record.guardrail_review_json);
    if (typeof record.token_redemption_lock_rules_json === 'string') record.token_redemption_lock_rules_json = JSON.parse(record.token_redemption_lock_rules_json);
    if (typeof record.token_redemption_lock_blockers_json === 'string') record.token_redemption_lock_blockers_json = JSON.parse(record.token_redemption_lock_blockers_json);
    if (typeof record.non_execution_attestation_json === 'string') record.non_execution_attestation_json = JSON.parse(record.non_execution_attestation_json);
    if (typeof record.write_scope_attestation_json === 'string') record.write_scope_attestation_json = JSON.parse(record.write_scope_attestation_json);
    if (typeof record.non_redeemable_token_record_json === 'string') record.non_redeemable_token_record_json = JSON.parse(record.non_redeemable_token_record_json);
    return record;
  }

  async _internalUpdateTokenRedemptionLock(lockId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      const record = this._mockState.tokenRedemptionLock.get(lockId);
      if (!record) throw new Error(`Lock record ${lockId} not found`);
      Object.assign(record, fields);
      return record;
    }

    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      updates.push(`${key} = ?`);
      if (typeof val === 'object' && val !== null) {
        values.push(JSON.stringify(val));
      } else {
        values.push(val);
      }
    }
    values.push(lockId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_lock SET ${updates.join(', ')} WHERE activation_token_redemption_lock_id = ?`,
      values
    );
  }

  async updateTokenRedemptionLock(lockId, fields, actorId) {
    const record = await this.getTokenRedemptionLock(lockId);
    if (!record) throw new Error(`Lock record ${lockId} not found`);

    if (record.activation_token_redemption_lock_status === 'FINALIZED') {
      throw new Error(`LOCK_IMMUTABLE: Cannot modify finalized lock record.`);
    }

    const cleanFields = {};
    const allowed = [
      'canary_envelope_json', 'token_redemption_lock_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json', 'non_execution_attestation_json',
      'write_scope_attestation_json', 'non_redeemable_token_record_json'
    ];
    for (const key of allowed) {
      if (key in fields) cleanFields[key] = fields[key];
    }
    cleanFields.updated_by = actorId;

    await this._internalUpdateTokenRedemptionLock(lockId, cleanFields);
    await auditService.logAction(lockId, 'TOKEN_REDEMPTION_LOCK_UPDATED', actorId, cleanFields);
    return this.getTokenRedemptionLock(lockId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService()
};
