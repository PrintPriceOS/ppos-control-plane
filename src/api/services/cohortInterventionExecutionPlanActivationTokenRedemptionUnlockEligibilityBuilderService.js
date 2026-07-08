'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const lockBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionUnlockEligibility: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionUnlockEligibilityDraft(redemptionLockId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let parent = null;

    if (!isProdLike) {
      parent = lockBuilder._mockState.tokenRedemptionLock.get(redemptionLockId);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_lock WHERE activation_token_redemption_lock_id = ?`,
        [redemptionLockId]
      );
      if (rows && rows[0]) {
        parent = rows[0];
        if (typeof parent.canary_envelope_json === 'string') parent.canary_envelope_json = JSON.parse(parent.canary_envelope_json);
        if (typeof parent.non_execution_attestation_json === 'string') parent.non_execution_attestation_json = JSON.parse(parent.non_execution_attestation_json);
        if (typeof parent.write_scope_attestation_json === 'string') parent.write_scope_attestation_json = JSON.parse(parent.write_scope_attestation_json);
      }
    }

    if (!parent) {
      throw new Error(`TOKEN_REDEMPTION_LOCK_NOT_FOUND: Parent Lock ${redemptionLockId} does not exist.`);
    }

    if (parent.activation_token_redemption_lock_status !== 'FINALIZED') {
      throw new Error(`TOKEN_REDEMPTION_LOCK_NOT_READY: Parent Lock ${redemptionLockId} is not finalized.`);
    }

    if (parent.activation_token_redemption_lock_result !== 'LOCKED_NOT_REDEEMED' && parent.activation_token_redemption_lock_result !== 'APPROVED') {
      throw new Error(`TOKEN_REDEMPTION_LOCK_NOT_LOCKED: Parent Lock ${redemptionLockId} result is not LOCKED_NOT_REDEEMED.`);
    }

    if (parent.token_redeemable_status !== 'NOT_REDEEMABLE') {
      throw new Error(`TOKEN_REDEEMABLE_STATE_FORBIDDEN: Parent lock token is redeemable.`);
    }

    if (parent.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error(`EXECUTION_CAPABILITY_FORBIDDEN: Execution is enabled on parent lock.`);
    }

    if (parent.runtime_mutation_status !== 'ZERO_RUNTIME_MUTATION_CONFIRMED' && parent.runtime_mutation_status !== 'ZERO') {
      throw new Error(`RUNTIME_MUTATION_FORBIDDEN: Parent lock allows runtime mutations.`);
    }

    const eligibilityId = `elg_${crypto.randomBytes(8).toString('hex')}`;
    const defaultCanary = {
      unlock_eligibility_mode: 'TOKEN_REDEMPTION_UNLOCK_ELIGIBILITY_GATE_ONLY',
      allow_unlock_eligibility_record: true,
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
      requires_future_redemption_unlock_approval_or_execution_gate: true,
      immutable_after_finalization: true
    };

    const record = {
      activation_token_redemption_unlock_eligibility_id: eligibilityId,
      source_activation_token_redemption_lock_id: redemptionLockId,
      source_activation_token_redemption_final_apv_id: parent.source_activation_token_redemption_final_apv_id || parent.source_approval_id || 'fapv_dummy',
      source_activation_token_redemption_envelope_id: parent.source_activation_token_redemption_env_id || parent.source_envelope_id || 'env_dummy',
      source_activation_token_redemption_auth_id: parent.source_activation_token_redemption_auth_id || parent.source_auth_id || 'auth_dummy',
      source_activation_token_redemption_readiness_id: parent.source_activation_token_redemption_readiness_id || parent.source_readiness_id || 'rd_dummy',
      source_activation_token_issuance_id: parent.source_activation_token_issuance_id || parent.source_issuance_id || 'iss_dummy',
      source_activation_token_staging_id: parent.source_activation_token_staging_id || parent.source_staging_id || 'stg_dummy',
      source_activation_token_preflight_id: parent.source_activation_token_preflight_id || parent.source_preflight_id || 'pfl_dummy',
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
      unlock_eligibility_status: 'DRAFT',
      unlock_eligibility_result: 'PENDING',
      token_redemption_lock_status: 'LOCKED_NOT_REDEEMED',
      token_redemption_status: 'LOCKED_NOT_REDEEMED',
      token_redeemable_status: 'NOT_REDEEMABLE',
      actual_unlock_status: 'NOT_UNLOCKED',
      risk_level: parent.risk_level || 'LOW',
      confidence_level: parent.confidence_level || 'HIGH',
      projected_impact_score: parent.projected_impact_score ? Number(parent.projected_impact_score) : 0.0,
      rollback_feasibility_score: parent.rollback_feasibility_score ? Number(parent.rollback_feasibility_score) : 100.0,
      evidence_completeness_score: parent.evidence_completeness_score ? Number(parent.evidence_completeness_score) : 0.0,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: defaultCanary,
      unlock_eligibility_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_eligibility_rules_json: {},
      unlock_eligibility_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true },
      write_scope_attestation_json: { writes_only_phase166_tables: true, wrote_phase128_to_165_operational_tables: false },
      source_redemption_lock_hash: parent.activation_token_redemption_lock_hash || 'lock_hash_dummy',
      source_redemption_package_freeze_hash: parent.source_freeze_package_hash || 'freeze_hash_dummy',
      source_token_material_hash: parent.source_token_material_hash || 'token_material_hash_dummy',
      unlock_eligibility_hash: 'pending_hash',
      unlock_eligibility_evidence_pack_hash: 'pending_hash',
      evidence_pack_hash: 'pending_hash',
      lineage_hash_chain_json: {},
      security_signature_json: {},
      eligibility_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_ELIGIBILITY_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockState.tokenRedemptionUnlockEligibility.set(eligibilityId, record);
      this._mockState.rules.set(eligibilityId, []);
      await auditService.logAction(eligibilityId, 'UNLOCK_ELIGIBILITY_DRAFT_CREATED', actorId, { redemptionLockId });
      return { tokenRedemptionUnlockEligibility: record };
    }

    const columns = [
      'activation_token_redemption_unlock_eligibility_id', 'source_activation_token_redemption_lock_id',
      'source_activation_token_redemption_final_apv_id', 'source_activation_token_redemption_envelope_id',
      'source_activation_token_redemption_auth_id', 'source_activation_token_redemption_readiness_id',
      'source_activation_token_issuance_id', 'source_activation_token_staging_id',
      'source_activation_token_preflight_id', 'source_plan_id',
      'source_dispatcher_id', 'source_envelope_id',
      'source_auth_id', 'source_readiness_id',
      'source_approval_id', 'source_prep_id',
      'source_review_id', 'source_simulation_id', 'source_execution_id',
      'cohort_id', 'tenant_id', 'simulation_type',
      'unlock_eligibility_status', 'unlock_eligibility_result',
      'token_redemption_lock_status', 'token_redemption_status',
      'token_redeemable_status', 'actual_unlock_status',
      'risk_level', 'confidence_level', 'projected_impact_score',
      'rollback_feasibility_score', 'evidence_completeness_score',
      'guardrail_status', 'write_scope_status', 'canary_envelope_json',
      'unlock_eligibility_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json',
      'unlock_eligibility_rules_json', 'unlock_eligibility_blockers_json',
      'non_execution_attestation_json', 'write_scope_attestation_json',
      'source_redemption_lock_hash', 'source_redemption_package_freeze_hash',
      'source_token_material_hash', 'unlock_eligibility_hash',
      'unlock_eligibility_evidence_pack_hash', 'evidence_pack_hash',
      'lineage_hash_chain_json', 'security_signature_json',
      'eligibility_rationale_json', 'execution_capability_status',
      'activation_execution_status', 'package_freeze_status',
      'redemption_package_freeze_status', 'plan_executable_status',
      'job_creation_status', 'queue_dispatch_status',
      'runtime_mutation_status', 'created_by', 'updated_by'
    ];

    const bindings = [
      record.activation_token_redemption_unlock_eligibility_id, record.source_activation_token_redemption_lock_id,
      record.source_activation_token_redemption_final_apv_id, record.source_activation_token_redemption_envelope_id,
      record.source_activation_token_redemption_auth_id, record.source_activation_token_redemption_readiness_id,
      record.source_activation_token_issuance_id, record.source_activation_token_staging_id,
      record.source_activation_token_preflight_id, record.source_plan_id,
      record.source_dispatcher_id, record.source_envelope_id,
      record.source_auth_id, record.source_readiness_id,
      record.source_approval_id, record.source_prep_id,
      record.source_review_id, record.source_simulation_id, record.source_execution_id,
      record.cohort_id, record.tenant_id, record.simulation_type,
      record.unlock_eligibility_status, record.unlock_eligibility_result,
      record.token_redemption_lock_status, record.token_redemption_status,
      record.token_redeemable_status, record.actual_unlock_status,
      record.risk_level, record.confidence_level, record.projected_impact_score,
      record.rollback_feasibility_score, record.evidence_completeness_score,
      record.guardrail_status, record.write_scope_status,
      JSON.stringify(record.canary_envelope_json), JSON.stringify(record.unlock_eligibility_summary_json),
      JSON.stringify(record.impact_review_json), JSON.stringify(record.rollback_review_json),
      JSON.stringify(record.guardrail_review_json), JSON.stringify(record.unlock_eligibility_rules_json),
      JSON.stringify(record.unlock_eligibility_blockers_json), JSON.stringify(record.non_execution_attestation_json),
      JSON.stringify(record.write_scope_attestation_json), record.source_redemption_lock_hash,
      record.source_redemption_package_freeze_hash, record.source_token_material_hash,
      record.unlock_eligibility_hash, record.unlock_eligibility_evidence_pack_hash,
      record.evidence_pack_hash, JSON.stringify(record.lineage_hash_chain_json),
      JSON.stringify(record.security_signature_json), JSON.stringify(record.eligibility_rationale_json),
      record.execution_capability_status, record.activation_execution_status,
      record.package_freeze_status, record.redemption_package_freeze_status,
      record.plan_executable_status, record.job_creation_status,
      record.queue_dispatch_status, record.runtime_mutation_status,
      record.created_by, record.updated_by
    ];

    if (columns.length !== bindings.length) {
      throw new Error(`CRITICAL: Column count (${columns.length}) and bindings count (${bindings.length}) mismatch.`);
    }

    const query = `
      INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_elig
      (${columns.join(', ')})
      VALUES (${Array(columns.length).fill('?').join(', ')})
    `;
    await db.query(query, bindings);

    await auditService.logAction(eligibilityId, 'UNLOCK_ELIGIBILITY_DRAFT_CREATED', actorId, { redemptionLockId });
    return { tokenRedemptionUnlockEligibility: await this.getTokenRedemptionUnlockEligibility(eligibilityId) };
  }

  async getTokenRedemptionUnlockEligibility(unlockEligibilityId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.tokenRedemptionUnlockEligibility.get(unlockEligibilityId) || null;
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE activation_token_redemption_unlock_eligibility_id = ?`,
      [unlockEligibilityId]
    );
    if (rows && rows[0]) {
      const rec = rows[0];
      if (typeof rec.canary_envelope_json === 'string') rec.canary_envelope_json = JSON.parse(rec.canary_envelope_json);
      if (typeof rec.unlock_eligibility_summary_json === 'string') rec.unlock_eligibility_summary_json = JSON.parse(rec.unlock_eligibility_summary_json);
      if (typeof rec.impact_review_json === 'string') rec.impact_review_json = JSON.parse(rec.impact_review_json);
      if (typeof rec.rollback_review_json === 'string') rec.rollback_review_json = JSON.parse(rec.rollback_review_json);
      if (typeof rec.guardrail_review_json === 'string') rec.guardrail_review_json = JSON.parse(rec.guardrail_review_json);
      if (typeof rec.unlock_eligibility_rules_json === 'string') rec.unlock_eligibility_rules_json = JSON.parse(rec.unlock_eligibility_rules_json);
      if (typeof rec.unlock_eligibility_blockers_json === 'string') rec.unlock_eligibility_blockers_json = JSON.parse(rec.unlock_eligibility_blockers_json);
      if (typeof rec.non_execution_attestation_json === 'string') rec.non_execution_attestation_json = JSON.parse(rec.non_execution_attestation_json);
      if (typeof rec.write_scope_attestation_json === 'string') rec.write_scope_attestation_json = JSON.parse(rec.write_scope_attestation_json);
      if (typeof rec.lineage_hash_chain_json === 'string') rec.lineage_hash_chain_json = JSON.parse(rec.lineage_hash_chain_json);
      if (typeof rec.security_signature_json === 'string') rec.security_signature_json = JSON.parse(rec.security_signature_json);
      if (typeof rec.eligibility_rationale_json === 'string') rec.eligibility_rationale_json = JSON.parse(rec.eligibility_rationale_json);
      return rec;
    }
    return null;
  }

  async listTokenRedemptionUnlockEligibilities() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return Array.from(this._mockState.tokenRedemptionUnlockEligibility.values());
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_elig ORDER BY created_at DESC`
    );
    for (const rec of rows) {
      if (typeof rec.canary_envelope_json === 'string') rec.canary_envelope_json = JSON.parse(rec.canary_envelope_json);
      if (typeof rec.unlock_eligibility_summary_json === 'string') rec.unlock_eligibility_summary_json = JSON.parse(rec.unlock_eligibility_summary_json);
      if (typeof rec.impact_review_json === 'string') rec.impact_review_json = JSON.parse(rec.impact_review_json);
      if (typeof rec.rollback_review_json === 'string') rec.rollback_review_json = JSON.parse(rec.rollback_review_json);
      if (typeof rec.guardrail_review_json === 'string') rec.guardrail_review_json = JSON.parse(rec.guardrail_review_json);
      if (typeof rec.unlock_eligibility_rules_json === 'string') rec.unlock_eligibility_rules_json = JSON.parse(rec.unlock_eligibility_rules_json);
      if (typeof rec.unlock_eligibility_blockers_json === 'string') rec.unlock_eligibility_blockers_json = JSON.parse(rec.unlock_eligibility_blockers_json);
      if (typeof rec.non_execution_attestation_json === 'string') rec.non_execution_attestation_json = JSON.parse(rec.non_execution_attestation_json);
      if (typeof rec.write_scope_attestation_json === 'string') rec.write_scope_attestation_json = JSON.parse(rec.write_scope_attestation_json);
      if (typeof rec.lineage_hash_chain_json === 'string') rec.lineage_hash_chain_json = JSON.parse(rec.lineage_hash_chain_json);
      if (typeof rec.security_signature_json === 'string') rec.security_signature_json = JSON.parse(rec.security_signature_json);
      if (typeof rec.eligibility_rationale_json === 'string') rec.eligibility_rationale_json = JSON.parse(rec.eligibility_rationale_json);
    }
    return rows;
  }

  async getRules(unlockEligibilityId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.rules.get(unlockEligibilityId) || [];
    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_rules WHERE activation_token_redemption_unlock_eligibility_id = ? ORDER BY created_at ASC`,
      [unlockEligibilityId]
    );
  }

  async _internalUpdateUnlockEligibility(unlockEligibilityId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionUnlockEligibility(unlockEligibilityId);
    if (!original) throw new Error('UNLOCK_ELIGIBILITY_RECORD_NOT_FOUND');

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionUnlockEligibility.set(unlockEligibilityId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(unlockEligibilityId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_elig SET ${setClauses.join(', ')} WHERE activation_token_redemption_unlock_eligibility_id = ?`,
      bindings
    );
    return await this.getTokenRedemptionUnlockEligibility(unlockEligibilityId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService()
};
