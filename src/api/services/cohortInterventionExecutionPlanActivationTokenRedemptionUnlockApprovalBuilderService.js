'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const eligBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionUnlockApproval: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionUnlockApprovalDraft(unlockEligibilityId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let parent = null;

    if (!isProdLike) {
      parent = eligBuilder._mockState.tokenRedemptionUnlockEligibility.get(unlockEligibilityId);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE activation_token_redemption_unlock_eligibility_id = ?`,
        [unlockEligibilityId]
      );
      if (rows && rows[0]) {
        parent = rows[0];
        if (typeof parent.canary_envelope_json === 'string') parent.canary_envelope_json = JSON.parse(parent.canary_envelope_json);
        if (typeof parent.non_execution_attestation_json === 'string') parent.non_execution_attestation_json = JSON.parse(parent.non_execution_attestation_json);
        if (typeof parent.write_scope_attestation_json === 'string') parent.write_scope_attestation_json = JSON.parse(parent.write_scope_attestation_json);
      }
    }

    if (!parent) {
      throw new Error(`UNLOCK_ELIGIBILITY_NOT_FOUND: Parent eligibility record ${unlockEligibilityId} does not exist.`);
    }

    if (parent.unlock_eligibility_status !== 'FINALIZED') {
      throw new Error(`UNLOCK_ELIGIBILITY_NOT_READY: Parent eligibility record ${unlockEligibilityId} is not finalized.`);
    }

    if (parent.unlock_eligibility_result !== 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED') {
      throw new Error(`UNLOCK_ELIGIBILITY_NOT_PASSED: Parent eligibility record result is not UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED.`);
    }

    if (parent.actual_unlock_status !== 'NOT_UNLOCKED') {
      throw new Error(`TOKEN_ALREADY_UNLOCKED_FORBIDDEN: Token is already unlocked on parent record.`);
    }

    if (parent.token_redeemable_status !== 'NOT_REDEEMABLE') {
      throw new Error(`TOKEN_REDEEMABLE_STATE_FORBIDDEN: Parent record shows token is redeemable.`);
    }

    if (parent.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error(`EXECUTION_CAPABILITY_FORBIDDEN: Execution capability is enabled on parent record.`);
    }

    if (parent.runtime_mutation_status !== 'ZERO_RUNTIME_MUTATION_CONFIRMED' && parent.runtime_mutation_status !== 'ZERO') {
      throw new Error(`RUNTIME_MUTATION_FORBIDDEN: Parent record allows runtime mutations.`);
    }

    const approvalId = `apv_${crypto.randomBytes(8).toString('hex')}`;
    const defaultCanary = {
      unlock_approval_mode: 'TOKEN_REDEMPTION_UNLOCK_APPROVAL_GATE_ONLY',
      allow_unlock_approval_record: true,
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
      requires_future_redemption_unlock_final_review_or_execution_gate: true,
      immutable_after_finalization: true
    };

    const record = {
      activation_token_redemption_unlock_approval_id: approvalId,
      source_activation_token_redemption_unlock_eligibility_id: unlockEligibilityId,
      source_activation_token_redemption_lock_id: parent.source_activation_token_redemption_lock_id || parent.source_lock_id || 'lock_dummy',
      source_activation_token_redemption_final_apv_id: parent.source_activation_token_redemption_final_apv_id || parent.source_approval_id || 'fapv_dummy',
      source_activation_token_redemption_envelope_id: parent.source_activation_token_redemption_envelope_id || parent.source_envelope_id || 'env_dummy',
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
      unlock_approval_status: 'DRAFT',
      unlock_approval_result: 'PENDING',
      unlock_eligibility_status: 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED',
      token_redemption_lock_status: 'LOCKED_NOT_REDEEMED',
      token_redemption_status: 'LOCKED_NOT_REDEEMED',
      token_unlock_status: 'NOT_UNLOCKED',
      token_redeemable_status: 'NOT_REDEEMABLE',
      risk_level: parent.risk_level || 'LOW',
      confidence_level: parent.confidence_level || 'HIGH',
      projected_impact_score: parent.projected_impact_score ? Number(parent.projected_impact_score) : 0.0,
      rollback_feasibility_score: parent.rollback_feasibility_score ? Number(parent.rollback_feasibility_score) : 100.0,
      evidence_completeness_score: parent.evidence_completeness_score ? Number(parent.evidence_completeness_score) : 0.0,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: defaultCanary,
      unlock_approval_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_approval_rules_json: {},
      unlock_approval_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true },
      write_scope_attestation_json: { writes_only_phase167_tables: true, wrote_phase128_to_166_operational_tables: false },
      source_unlock_eligibility_hash: parent.unlock_eligibility_hash || 'elig_hash_dummy',
      source_redemption_lock_hash: parent.source_redemption_lock_hash || 'lock_hash_dummy',
      source_redemption_package_freeze_hash: parent.source_redemption_package_freeze_hash || 'freeze_hash_dummy',
      source_token_material_hash: parent.source_token_material_hash || 'token_material_hash_dummy',
      unlock_approval_hash: 'pending_hash',
      unlock_approval_evidence_pack_hash: 'pending_hash',
      evidence_pack_hash: 'pending_hash',
      lineage_hash_chain_json: {},
      security_signature_json: {},
      approval_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_APPROVAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
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
      this._mockState.tokenRedemptionUnlockApproval.set(approvalId, record);
      this._mockState.rules.set(approvalId, []);
      await auditService.logAction(approvalId, 'UNLOCK_APPROVAL_DRAFT_CREATED', actorId, { unlockEligibilityId });
      return { tokenRedemptionUnlockApproval: record };
    }

    const columns = [
      'activation_token_redemption_unlock_approval_id', 'source_activation_token_redemption_unlock_eligibility_id',
      'source_activation_token_redemption_lock_id', 'source_activation_token_redemption_final_apv_id',
      'source_activation_token_redemption_envelope_id', 'source_activation_token_redemption_auth_id',
      'source_activation_token_redemption_readiness_id', 'source_activation_token_issuance_id',
      'source_activation_token_staging_id', 'source_activation_token_preflight_id',
      'source_plan_id', 'source_dispatcher_id', 'source_envelope_id',
      'source_auth_id', 'source_readiness_id', 'source_approval_id', 'source_prep_id',
      'source_review_id', 'source_simulation_id', 'source_execution_id',
      'cohort_id', 'tenant_id', 'simulation_type',
      'unlock_approval_status', 'unlock_approval_result',
      'unlock_eligibility_status', 'token_redemption_lock_status',
      'token_redemption_status', 'token_unlock_status', 'token_redeemable_status',
      'risk_level', 'confidence_level', 'projected_impact_score',
      'rollback_feasibility_score', 'evidence_completeness_score',
      'guardrail_status', 'write_scope_status', 'canary_envelope_json',
      'unlock_approval_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json',
      'unlock_approval_rules_json', 'unlock_approval_blockers_json',
      'non_execution_attestation_json', 'write_scope_attestation_json',
      'source_unlock_eligibility_hash', 'source_redemption_lock_hash',
      'source_redemption_package_freeze_hash', 'source_token_material_hash',
      'unlock_approval_hash', 'unlock_approval_evidence_pack_hash',
      'evidence_pack_hash', 'lineage_hash_chain_json',
      'security_signature_json', 'approval_rationale_json',
      'execution_capability_status', 'activation_execution_status',
      'package_freeze_status', 'redemption_package_freeze_status',
      'plan_executable_status', 'job_creation_status',
      'queue_dispatch_status', 'runtime_mutation_status',
      'created_by', 'updated_by'
    ];

    const bindings = [
      record.activation_token_redemption_unlock_approval_id, record.source_activation_token_redemption_unlock_eligibility_id,
      record.source_activation_token_redemption_lock_id, record.source_activation_token_redemption_final_apv_id,
      record.source_activation_token_redemption_envelope_id, record.source_activation_token_redemption_auth_id,
      record.source_activation_token_redemption_readiness_id, record.source_activation_token_issuance_id,
      record.source_activation_token_staging_id, record.source_activation_token_preflight_id,
      record.source_plan_id, record.source_dispatcher_id, record.source_envelope_id,
      record.source_auth_id, record.source_readiness_id, record.source_approval_id, record.source_prep_id,
      record.source_review_id, record.source_simulation_id, record.source_execution_id,
      record.cohort_id, record.tenant_id, record.simulation_type,
      record.unlock_approval_status, record.unlock_approval_result,
      record.unlock_eligibility_status, record.token_redemption_lock_status,
      record.token_redemption_status, record.token_unlock_status, record.token_redeemable_status,
      record.risk_level, record.confidence_level, record.projected_impact_score,
      record.rollback_feasibility_score, record.evidence_completeness_score,
      record.guardrail_status, record.write_scope_status,
      JSON.stringify(record.canary_envelope_json), JSON.stringify(record.unlock_approval_summary_json),
      JSON.stringify(record.impact_review_json), JSON.stringify(record.rollback_review_json),
      JSON.stringify(record.guardrail_review_json), JSON.stringify(record.unlock_approval_rules_json),
      JSON.stringify(record.unlock_approval_blockers_json), JSON.stringify(record.non_execution_attestation_json),
      JSON.stringify(record.write_scope_attestation_json), record.source_unlock_eligibility_hash,
      record.source_redemption_lock_hash, record.source_redemption_package_freeze_hash,
      record.source_token_material_hash, record.unlock_approval_hash,
      record.unlock_approval_evidence_pack_hash, record.evidence_pack_hash,
      JSON.stringify(record.lineage_hash_chain_json), JSON.stringify(record.security_signature_json),
      JSON.stringify(record.approval_rationale_json), record.execution_capability_status,
      record.activation_execution_status, record.package_freeze_status,
      record.redemption_package_freeze_status, record.plan_executable_status,
      record.job_creation_status, record.queue_dispatch_status,
      record.runtime_mutation_status, record.created_by, record.updated_by
    ];

    if (columns.length !== bindings.length) {
      throw new Error(`CRITICAL: Column count (${columns.length}) and bindings count (${bindings.length}) mismatch.`);
    }

    const query = `
      INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_apv
      (${columns.join(', ')})
      VALUES (${Array(columns.length).fill('?').join(', ')})
    `;
    await db.query(query, bindings);

    await auditService.logAction(approvalId, 'UNLOCK_APPROVAL_DRAFT_CREATED', actorId, { unlockEligibilityId });
    return { tokenRedemptionUnlockApproval: await this.getTokenRedemptionUnlockApproval(approvalId) };
  }

  async getTokenRedemptionUnlockApproval(unlockApprovalId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.tokenRedemptionUnlockApproval.get(unlockApprovalId) || null;
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_apv WHERE activation_token_redemption_unlock_approval_id = ?`,
      [unlockApprovalId]
    );
    if (rows && rows[0]) {
      const rec = rows[0];
      if (typeof rec.canary_envelope_json === 'string') rec.canary_envelope_json = JSON.parse(rec.canary_envelope_json);
      if (typeof rec.unlock_approval_summary_json === 'string') rec.unlock_approval_summary_json = JSON.parse(rec.unlock_approval_summary_json);
      if (typeof rec.impact_review_json === 'string') rec.impact_review_json = JSON.parse(rec.impact_review_json);
      if (typeof rec.rollback_review_json === 'string') rec.rollback_review_json = JSON.parse(rec.rollback_review_json);
      if (typeof rec.guardrail_review_json === 'string') rec.guardrail_review_json = JSON.parse(rec.guardrail_review_json);
      if (typeof rec.unlock_approval_rules_json === 'string') rec.unlock_approval_rules_json = JSON.parse(rec.unlock_approval_rules_json);
      if (typeof rec.unlock_approval_blockers_json === 'string') rec.unlock_approval_blockers_json = JSON.parse(rec.unlock_approval_blockers_json);
      if (typeof rec.non_execution_attestation_json === 'string') rec.non_execution_attestation_json = JSON.parse(rec.non_execution_attestation_json);
      if (typeof rec.write_scope_attestation_json === 'string') rec.write_scope_attestation_json = JSON.parse(rec.write_scope_attestation_json);
      if (typeof rec.lineage_hash_chain_json === 'string') rec.lineage_hash_chain_json = JSON.parse(rec.lineage_hash_chain_json);
      if (typeof rec.security_signature_json === 'string') rec.security_signature_json = JSON.parse(rec.security_signature_json);
      if (typeof rec.approval_rationale_json === 'string') rec.approval_rationale_json = JSON.parse(rec.approval_rationale_json);
      return rec;
    }
    return null;
  }

  async listTokenRedemptionUnlockApprovals() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return Array.from(this._mockState.tokenRedemptionUnlockApproval.values());
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_apv ORDER BY created_at DESC`
    );
    for (const rec of rows) {
      if (typeof rec.canary_envelope_json === 'string') rec.canary_envelope_json = JSON.parse(rec.canary_envelope_json);
      if (typeof rec.unlock_approval_summary_json === 'string') rec.unlock_approval_summary_json = JSON.parse(rec.unlock_approval_summary_json);
      if (typeof rec.impact_review_json === 'string') rec.impact_review_json = JSON.parse(rec.impact_review_json);
      if (typeof rec.rollback_review_json === 'string') rec.rollback_review_json = JSON.parse(rec.rollback_review_json);
      if (typeof rec.guardrail_review_json === 'string') rec.guardrail_review_json = JSON.parse(rec.guardrail_review_json);
      if (typeof rec.unlock_approval_rules_json === 'string') rec.unlock_approval_rules_json = JSON.parse(rec.unlock_approval_rules_json);
      if (typeof rec.unlock_approval_blockers_json === 'string') rec.unlock_approval_blockers_json = JSON.parse(rec.unlock_approval_blockers_json);
      if (typeof rec.non_execution_attestation_json === 'string') rec.non_execution_attestation_json = JSON.parse(rec.non_execution_attestation_json);
      if (typeof rec.write_scope_attestation_json === 'string') rec.write_scope_attestation_json = JSON.parse(rec.write_scope_attestation_json);
      if (typeof rec.lineage_hash_chain_json === 'string') rec.lineage_hash_chain_json = JSON.parse(rec.lineage_hash_chain_json);
      if (typeof rec.security_signature_json === 'string') rec.security_signature_json = JSON.parse(rec.security_signature_json);
      if (typeof rec.approval_rationale_json === 'string') rec.approval_rationale_json = JSON.parse(rec.approval_rationale_json);
    }
    return rows;
  }

  async getRules(unlockApprovalId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.rules.get(unlockApprovalId) || [];
    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_apv_rl WHERE activation_token_redemption_unlock_approval_id = ? ORDER BY created_at ASC`,
      [unlockApprovalId]
    );
  }

  async _internalUpdateUnlockApproval(unlockApprovalId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenRedemptionUnlockApproval(unlockApprovalId);
    if (!original) throw new Error('UNLOCK_APPROVAL_RECORD_NOT_FOUND');

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionUnlockApproval.set(unlockApprovalId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(unlockApprovalId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_apv SET ${setClauses.join(', ')} WHERE activation_token_redemption_unlock_approval_id = ?`,
      bindings
    );
    return await this.getTokenRedemptionUnlockApproval(unlockApprovalId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService()
};
