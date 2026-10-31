'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const operatorAttestationBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionUnlockDualControlAuthorization: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionUnlockDualControlAuthorizationDraft(unlockOperatorAttestationId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let parent = null;

    if (!isProdLike) {
      parent = operatorAttestationBuilder._mockState.tokenRedemptionUnlockOperatorAttestation.get(unlockOperatorAttestationId);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt WHERE activation_token_redemption_unlock_operator_attestation_id = ?`,
        [unlockOperatorAttestationId]
      );
      if (rows && rows[0]) {
        parent = rows[0];
        if (typeof parent.canary_envelope_json === 'string') parent.canary_envelope_json = JSON.parse(parent.canary_envelope_json);
        if (typeof parent.non_execution_attestation_json === 'string') parent.non_execution_attestation_json = JSON.parse(parent.non_execution_attestation_json);
        if (typeof parent.write_scope_attestation_json === 'string') parent.write_scope_attestation_json = JSON.parse(parent.write_scope_attestation_json);
      }
    }

    if (!parent) {
      throw new Error(`UNLOCK_OPERATOR_ATTESTATION_NOT_FOUND: Parent attestation record ${unlockOperatorAttestationId} does not exist.`);
    }

    if (parent.unlock_operator_attestation_status !== 'FINALIZED') {
      throw new Error(`UNLOCK_OPERATOR_ATTESTATION_NOT_READY: Parent attestation record ${unlockOperatorAttestationId} is not finalized.`);
    }

    if (parent.unlock_operator_attestation_result !== 'OPERATOR_ATTESTED_NOT_UNLOCKED') {
      throw new Error(`UNLOCK_OPERATOR_ATTESTATION_NOT_PASSED: Parent attestation record result is not OPERATOR_ATTESTED_NOT_UNLOCKED.`);
    }

    // Safety checks against parent fields:
    if (parent.token_unlock_status !== 'NOT_UNLOCKED') {
      throw new Error(`TOKEN_ALREADY_UNLOCKED_FORBIDDEN: Token is already unlocked on parent record.`);
    }

    if (parent.token_redeemable_status !== 'NOT_REDEEMABLE') {
      throw new Error(`TOKEN_REDEEMABLE_STATE_FORBIDDEN: Parent record shows token is redeemable.`);
    }

    if (parent.token_redemption_status !== 'LOCKED_NOT_REDEEMED') {
      throw new Error(`TOKEN_REDEMPTION_STATE_FORBIDDEN: Parent record shows token is redeemed.`);
    }

    if (parent.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error(`EXECUTION_CAPABILITY_FORBIDDEN: Execution capability is enabled on parent record.`);
    }

    if (parent.plan_executable_status !== 'NOT_EXECUTABLE') {
      throw new Error(`PLAN_EXECUTABLE_STATE_FORBIDDEN: Plan executable state is enabled on parent record.`);
    }

    if (parent.runtime_mutation_status !== 'ZERO_RUNTIME_MUTATION_CONFIRMED' && parent.runtime_mutation_status !== 'ZERO') {
      throw new Error(`RUNTIME_MUTATION_FORBIDDEN: Parent record allows runtime mutations.`);
    }

    if (parent.job_creation_status !== 'NO_REAL_JOB_CREATED') {
      throw new Error(`JOB_CREATION_STATE_FORBIDDEN: Parent record shows jobs created.`);
    }

    if (parent.queue_dispatch_status !== 'NO_QUEUE_DISPATCHED') {
      throw new Error(`QUEUE_DISPATCH_STATE_FORBIDDEN: Parent record shows queue dispatched.`);
    }

    const unlockDualControlAuthorizationId = `dcau_${crypto.randomBytes(8).toString('hex')}`;
    const defaultCanary = {
      unlock_dual_control_authorization_mode: 'TOKEN_REDEMPTION_UNLOCK_DUAL_CONTROL_AUTHORIZATION_GATE_ONLY',
      allow_unlock_dual_control_authorization_record: true,
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
      requires_future_execution_gate: true,
      immutable_after_finalization: true
    };

    const record = {
      activation_token_redemption_unlock_dual_control_authorization_id: unlockDualControlAuthorizationId,
      source_act_token_redempt_unlock_operator_attestation_id: unlockOperatorAttestationId,
      source_act_token_redempt_unlock_pre_execution_freeze_id: parent.source_act_token_redempt_unlock_pre_execution_freeze_id || 'freeze_dummy',
      source_activation_token_redemption_unlock_seal_id: parent.source_activation_token_redemption_unlock_seal_id || 'seal_dummy',
      source_activation_token_redemption_unlock_final_review_id: parent.source_activation_token_redemption_unlock_final_review_id || 'frev_dummy',
      source_activation_token_redemption_unlock_approval_id: parent.source_activation_token_redemption_unlock_approval_id || 'apv_dummy',
      source_activation_token_redemption_unlock_eligibility_id: parent.source_activation_token_redemption_unlock_eligibility_id || 'elig_dummy',
      source_activation_token_redemption_lock_id: parent.source_activation_token_redemption_lock_id || 'lock_dummy',
      source_activation_token_redemption_final_apv_id: parent.source_activation_token_redemption_final_apv_id || 'fapv_dummy',
      source_activation_token_redemption_envelope_id: parent.source_activation_token_redemption_envelope_id || 'env_dummy',
      source_activation_token_redemption_auth_id: parent.source_activation_token_redemption_auth_id || 'auth_dummy',
      source_activation_token_redemption_readiness_id: parent.source_activation_token_redemption_readiness_id || 'rd_dummy',
      source_activation_token_issuance_id: parent.source_activation_token_issuance_id || 'iss_dummy',
      source_activation_token_staging_id: parent.source_activation_token_staging_id || 'stg_dummy',
      source_activation_token_preflight_id: parent.source_activation_token_preflight_id || 'pfl_dummy',
      source_plan_id: parent.source_plan_id || 'pln_dummy',
      source_dispatcher_id: parent.source_dispatcher_id || 'dsp_dummy',
      source_envelope_id: parent.source_envelope_id || 'env_dummy',
      source_auth_id: parent.source_auth_id || 'ath_dummy',
      source_readiness_id: parent.source_readiness_id || 'rd_dummy',
      source_approval_id: parent.source_approval_id || 'apv_dummy',
      source_prep_id: parent.source_prep_id || 'prp_dummy',
      source_review_id: parent.source_review_id || 'rev_dummy',
      source_simulation_id: parent.source_simulation_id || 'sim_dummy',
      source_execution_id: parent.source_execution_id || 'exe_dummy',
      cohort_id: parent.cohort_id || 'mock_cohort',
      tenant_id: parent.tenant_id || 'mock_tenant',
      simulation_type: parent.simulation_type || 'mock_sim',
      unlock_dual_control_authorization_status: 'DRAFT',
      unlock_dual_control_authorization_result: 'PENDING',
      unlock_dual_control_authorization_mode: 'DUAL_CONTROL_AUTHORIZATION_ONLY',
      unlock_operator_attestation_status: parent.unlock_operator_attestation_status || 'FINALIZED',
      unlock_pre_execution_freeze_status: parent.unlock_pre_execution_freeze_status || 'FINALIZED',
      unlock_seal_status: parent.unlock_seal_status || 'FINALIZED',
      unlock_final_review_status: parent.unlock_final_review_status || 'FINALIZED',
      unlock_approval_status: parent.unlock_approval_status || 'FINALIZED',
      unlock_eligibility_status: parent.unlock_eligibility_status || 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED',
      token_redemption_lock_status: parent.token_redemption_lock_status || 'LOCKED_NOT_REDEEMED',
      token_redemption_status: parent.token_redemption_status || 'LOCKED_NOT_REDEEMED',
      token_unlock_status: 'NOT_UNLOCKED',
      token_redeemable_status: 'NOT_REDEEMABLE',
      risk_level: parent.risk_level || 'LOW',
      confidence_level: parent.confidence_level || 'HIGH',
      projected_impact_score: parent.projected_impact_score || 0.1,
      rollback_feasibility_score: parent.rollback_feasibility_score || 0.9,
      evidence_completeness_score: parent.evidence_completeness_score || 1.0,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: defaultCanary,
      unlock_dual_control_authorization_summary_json: { description: 'Unlock Dual-Control Authorization Gate', state: 'DRAFT' },
      impact_review_json: { scope: 'DUAL_CONTROL_AUTHORIZATION', impact: 'NONE' },
      rollback_review_json: { feasibility: 'VERIFIED' },
      guardrail_review_json: { scans_performed: 0 },
      unlock_dual_control_authorization_rules_json: {},
      unlock_dual_control_authorization_blockers_json: {},
      non_execution_attestation_json: { attestation: 'NON_EXECUTABLE_DUAL_CONTROL_AUTHORIZATION_ONLY' },
      write_scope_attestation_json: { scope: 'PHASE_172_TABLES_ONLY' },
      source_unlock_operator_attestation_hash: parent.unlock_operator_attestation_hash || 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: parent.source_unlock_pre_execution_freeze_hash || 'pfrz_hash_dummy',
      source_unlock_seal_hash: parent.source_unlock_seal_hash || 'seal_hash_dummy',
      source_unlock_final_review_hash: parent.source_unlock_final_review_hash || 'frev_hash_dummy',
      source_unlock_approval_hash: parent.source_unlock_approval_hash || 'apv_hash_dummy',
      source_unlock_eligibility_hash: parent.source_unlock_eligibility_hash || 'elig_hash_dummy',
      source_redemption_lock_hash: parent.source_redemption_lock_hash || 'lock_hash_dummy',
      source_redemption_final_approval_hash: parent.source_redemption_final_approval_hash || 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: parent.source_redemption_package_freeze_hash || 'freeze_hash_dummy',
      source_token_material_hash: parent.source_token_material_hash || 'token_material_hash_dummy',
      unlock_dual_control_authorization_hash: 'pending_hash',
      unlock_dual_control_authorization_evidence_pack_hash: 'pending_hash',
      evidence_pack_hash: 'pending_hash',
      lineage_hash_chain_json: {},
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_DUAL_CONTROL_AUTHORIZATION_DRAFT_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: parent.package_freeze_status || 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: parent.redemption_package_freeze_status || 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: null,
      primary_authorizer_role: null,
      primary_authorized_at: null,
      secondary_authorizer_id: null,
      secondary_authorizer_role: null,
      secondary_authorized_at: null,
      dual_control_separation_attestation_json: {},
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockState.tokenRedemptionUnlockDualControlAuthorization.set(unlockDualControlAuthorizationId, record);
      await auditService.logAction(unlockDualControlAuthorizationId, 'UNLOCK_DUAL_CONTROL_AUTHORIZATION_DRAFT_CREATED', actorId);
      return { tokenRedemptionUnlockDualControlAuthorization: record };
    }

    const keys = Object.keys(record);
    const columns = keys.map(k => k);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => {
      const v = record[k];
      return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
    });

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_dcau
       (${columns.join(', ')})
       VALUES (${placeholders})`,
      values
    );

    await auditService.logAction(unlockDualControlAuthorizationId, 'UNLOCK_DUAL_CONTROL_AUTHORIZATION_DRAFT_CREATED', actorId);
    return { tokenRedemptionUnlockDualControlAuthorization: record };
  }

  async _internalUpdateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      const existing = this._mockState.tokenRedemptionUnlockDualControlAuthorization.get(unlockDualControlAuthorizationId);
      if (!existing) throw new Error(`Draft ${unlockDualControlAuthorizationId} not found.`);
      const updated = { ...existing, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionUnlockDualControlAuthorization.set(unlockDualControlAuthorizationId, updated);
      return updated;
    }

    const keys = Object.keys(fields);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => {
      const v = fields[k];
      return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
    });

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_dcau
       SET ${setClause}
       WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
      [...values, unlockDualControlAuthorizationId]
    );

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
      [unlockDualControlAuthorizationId]
    );

    const updated = rows[0];
    const jsonFields = [
      'canary_envelope_json', 'unlock_dual_control_authorization_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json', 'unlock_dual_control_authorization_rules_json',
      'unlock_dual_control_authorization_blockers_json', 'non_execution_attestation_json',
      'write_scope_attestation_json', 'lineage_hash_chain_json', 'security_signature_json',
      'attestation_rationale_json', 'dual_control_separation_attestation_json'
    ];
    jsonFields.forEach(f => {
      if (updated && typeof updated[f] === 'string') {
        try {
          updated[f] = JSON.parse(updated[f]);
        } catch (e) {
          // Fallback
        }
      }
    });
    return updated;
  }

  async getTokenRedemptionUnlockDualControlAuthorization(unlockDualControlAuthorizationId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.tokenRedemptionUnlockDualControlAuthorization.get(unlockDualControlAuthorizationId);
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
      [unlockDualControlAuthorizationId]
    );
    const record = rows[0];
    const jsonFields = [
      'canary_envelope_json', 'unlock_dual_control_authorization_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json', 'unlock_dual_control_authorization_rules_json',
      'unlock_dual_control_authorization_blockers_json', 'non_execution_attestation_json',
      'write_scope_attestation_json', 'lineage_hash_chain_json', 'security_signature_json',
      'attestation_rationale_json', 'dual_control_separation_attestation_json'
    ];
    jsonFields.forEach(f => {
      if (record && typeof record[f] === 'string') {
        try {
          record[f] = JSON.parse(record[f]);
        } catch (e) {
          // Fallback
        }
      }
    });
    return record;
  }

  async listTokenRedemptionUnlockDualControlAuthorizations() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return Array.from(this._mockState.tokenRedemptionUnlockDualControlAuthorization.values());
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau ORDER BY created_at DESC`
    );
    const jsonFields = [
      'canary_envelope_json', 'unlock_dual_control_authorization_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json', 'unlock_dual_control_authorization_rules_json',
      'unlock_dual_control_authorization_blockers_json', 'non_execution_attestation_json',
      'write_scope_attestation_json', 'lineage_hash_chain_json', 'security_signature_json',
      'attestation_rationale_json', 'dual_control_separation_attestation_json'
    ];
    rows.forEach(record => {
      jsonFields.forEach(f => {
        if (record && typeof record[f] === 'string') {
          try {
            record[f] = JSON.parse(record[f]);
          } catch (e) {
            // Fallback
          }
        }
      });
    });
    return rows;
  }

  async getRules(unlockDualControlAuthorizationId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.rules.get(unlockDualControlAuthorizationId) || [];
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau_rl WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
      [unlockDualControlAuthorizationId]
    );
    return rows;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService()
};
