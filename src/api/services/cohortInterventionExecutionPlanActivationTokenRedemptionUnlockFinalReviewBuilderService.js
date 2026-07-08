'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const apvBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionUnlockFinalReview: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionUnlockFinalReviewDraft(unlockApprovalId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let parent = null;

    if (!isProdLike) {
      parent = apvBuilder._mockState.tokenRedemptionUnlockApproval.get(unlockApprovalId);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_apv WHERE activation_token_redemption_unlock_approval_id = ?`,
        [unlockApprovalId]
      );
      if (rows && rows[0]) {
        parent = rows[0];
        if (typeof parent.canary_envelope_json === 'string') parent.canary_envelope_json = JSON.parse(parent.canary_envelope_json);
        if (typeof parent.non_execution_attestation_json === 'string') parent.non_execution_attestation_json = JSON.parse(parent.non_execution_attestation_json);
        if (typeof parent.write_scope_attestation_json === 'string') parent.write_scope_attestation_json = JSON.parse(parent.write_scope_attestation_json);
      }
    }

    if (!parent) {
      throw new Error(`UNLOCK_APPROVAL_NOT_FOUND: Parent approval record ${unlockApprovalId} does not exist.`);
    }

    if (parent.unlock_approval_status !== 'FINALIZED') {
      throw new Error(`UNLOCK_APPROVAL_NOT_READY: Parent approval record ${unlockApprovalId} is not finalized.`);
    }

    if (parent.unlock_approval_result !== 'UNLOCK_APPROVAL_PASSED_NOT_UNLOCKED') {
      throw new Error(`UNLOCK_APPROVAL_NOT_PASSED: Parent approval record result is not UNLOCK_APPROVAL_PASSED_NOT_UNLOCKED.`);
    }

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

    const finalReviewId = `frev_${crypto.randomBytes(8).toString('hex')}`;
    const defaultCanary = {
      unlock_final_review_mode: 'TOKEN_REDEMPTION_UNLOCK_FINAL_REVIEW_GATE_ONLY',
      allow_unlock_final_review_record: true,
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
      requires_future_redemption_unlock_readiness_seal_or_execution_gate: true,
      immutable_after_finalization: true
    };

    const record = {
      activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: unlockApprovalId,
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
      unlock_final_review_status: 'DRAFT',
      unlock_final_review_result: 'PENDING',
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
      unlock_final_review_summary_json: { description: 'Unlock Final Review Gate', state: 'DRAFT' },
      impact_review_json: { scope: 'FINAL_REVIEW', impact: 'NONE' },
      rollback_review_json: { feasibility: 'VERIFIED' },
      guardrail_review_json: { scans_performed: 0 },
      unlock_final_review_rules_json: {},
      unlock_final_review_blockers_json: {},
      non_execution_attestation_json: { attestation: 'NON_EXECUTABLE_FINAL_REVIEW_ONLY' },
      write_scope_attestation_json: { scope: 'PHASE_168_TABLES_ONLY' },
      source_unlock_approval_hash: parent.unlock_approval_hash || 'apv_hash_dummy',
      source_unlock_eligibility_hash: parent.source_unlock_eligibility_hash || 'elig_hash_dummy',
      source_redemption_lock_hash: parent.source_redemption_lock_hash || 'lock_hash_dummy',
      source_redemption_final_approval_hash: parent.source_redemption_final_approval_hash || 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: parent.source_redemption_package_freeze_hash || 'freeze_hash_dummy',
      source_token_material_hash: parent.source_token_material_hash || 'token_material_hash_dummy',
      unlock_final_review_hash: 'pending_hash',
      unlock_final_review_evidence_pack_hash: 'pending_hash',
      evidence_pack_hash: 'pending_hash',
      lineage_hash_chain_json: {},
      security_signature_json: {},
      final_review_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_FINAL_REVIEW_DRAFT_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: parent.package_freeze_status || 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: parent.redemption_package_freeze_status || 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockState.tokenRedemptionUnlockFinalReview.set(finalReviewId, record);
      await auditService.logAction(finalReviewId, 'UNLOCK_FINAL_REVIEW_DRAFT_CREATED', actorId);
      return { tokenRedemptionUnlockFinalReview: record };
    }

    const keys = Object.keys(record);
    const columns = keys.map(k => k);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => {
      const v = record[k];
      return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
    });

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_frev
       (${columns.join(', ')})
       VALUES (${placeholders})`,
      values
    );

    await auditService.logAction(finalReviewId, 'UNLOCK_FINAL_REVIEW_DRAFT_CREATED', actorId);
    return { tokenRedemptionUnlockFinalReview: record };
  }

  async _internalUpdateUnlockFinalReview(finalReviewId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      const existing = this._mockState.tokenRedemptionUnlockFinalReview.get(finalReviewId);
      if (!existing) throw new Error(`Draft ${finalReviewId} not found.`);
      const updated = { ...existing, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionUnlockFinalReview.set(finalReviewId, updated);
      return updated;
    }

    const keys = Object.keys(fields);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => {
      const v = fields[k];
      return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
    });

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_frev
       SET ${setClause}
       WHERE activation_token_redemption_unlock_final_review_id = ?`,
      [...values, finalReviewId]
    );

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_frev WHERE activation_token_redemption_unlock_final_review_id = ?`,
      [finalReviewId]
    );

    const updated = rows[0];
    const jsonFields = [
      'canary_envelope_json', 'unlock_final_review_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json', 'unlock_final_review_rules_json',
      'unlock_final_review_blockers_json', 'non_execution_attestation_json',
      'write_scope_attestation_json', 'lineage_hash_chain_json', 'security_signature_json',
      'final_review_rationale_json'
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

  async getTokenRedemptionUnlockFinalReview(finalReviewId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.tokenRedemptionUnlockFinalReview.get(finalReviewId);
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_frev WHERE activation_token_redemption_unlock_final_review_id = ?`,
      [finalReviewId]
    );
    const record = rows[0];
    const jsonFields = [
      'canary_envelope_json', 'unlock_final_review_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json', 'unlock_final_review_rules_json',
      'unlock_final_review_blockers_json', 'non_execution_attestation_json',
      'write_scope_attestation_json', 'lineage_hash_chain_json', 'security_signature_json',
      'final_review_rationale_json'
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

  async getRules(finalReviewId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.rules.get(finalReviewId) || [];
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_frev_rl WHERE activation_token_redemption_unlock_final_review_id = ?`,
      [finalReviewId]
    );
    return rows;
  }

  async listTokenRedemptionUnlockFinalReviews() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return Array.from(this._mockState.tokenRedemptionUnlockFinalReview.values());
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_frev ORDER BY created_at DESC`
    );
    const jsonFields = [
      'canary_envelope_json', 'unlock_final_review_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json', 'unlock_final_review_rules_json',
      'unlock_final_review_blockers_json', 'non_execution_attestation_json',
      'write_scope_attestation_json', 'lineage_hash_chain_json', 'security_signature_json',
      'final_review_rationale_json'
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
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService()
};
