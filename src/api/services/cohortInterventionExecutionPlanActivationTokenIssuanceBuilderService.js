'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenIssuanceAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenIssuanceBuilderService {
  constructor() {
    this._mockState = {
      tokenIssuance: new Map(),
      rules: new Map()
    };
  }

  async createTokenIssuanceDraft(activationTokenPreflightId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentPreflight;
    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_preflight WHERE activation_token_preflight_id = ?`,
        [activationTokenPreflightId]
      );
      parentPreflight = rows && rows[0];
    } else {
      const preflightBuilder = require('./cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
      parentPreflight = preflightBuilder._mockState.tokenPreflight.get(activationTokenPreflightId);
    }

    if (!parentPreflight) throw new Error('TOKEN_PREFLIGHT_RECORD_NOT_FOUND');
    if (parentPreflight.activation_token_preflight_status !== 'FINALIZED' || parentPreflight.activation_token_preflight_result !== 'PREFLIGHT_PASSED_NOT_ISSUED') {
      throw new Error('TOKEN_PREFLIGHT_NOT_READY');
    }

    const issuanceId = 'ati_' + crypto.randomBytes(8).toString('hex');
    const writeScope160 = { writes_only_phase160_tables: true, wrote_phase128_to_159_operational_tables: false };
    const nonExecution160 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

    const issuanceConfig = {
      issuance_mode: 'TOKEN_ISSUANCE_RECORD_ONLY',
      token_issuance_record_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_issuance_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_redeemable: false,
      allow_token_issuance_record: true,
      allow_usable_token_issue: false,
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
      requires_preflight_hash_verification: true,
      immutable_after_finalization: true
    };

    const tokenRecord = {
      token_urn: `urn:printprice:cohort:intervention:token:${issuanceId}`,
      issued_at: new Date().toISOString(),
      governed_issuance_limit_confirmed: true,
      allow_token_issue_assertion: 'allow_token_issue=true is scoped only to non-redeemable issuance record creation. It does not permit credential activation, redemption, runtime access, or execution.'
    };

    const record = {
      activation_token_issuance_id: issuanceId,
      source_activation_token_preflight_id: activationTokenPreflightId,
      source_activation_token_staging_id: parentPreflight.source_activation_token_staging_id,
      source_activation_token_final_apv_id: parentPreflight.source_activation_token_final_apv_id,
      source_activation_token_env_id: parentPreflight.source_activation_token_env_id,
      source_activation_handoff_id: parentPreflight.source_activation_handoff_id,
      source_activation_decision_id: parentPreflight.source_activation_decision_id,
      source_activation_lock_id: parentPreflight.source_activation_lock_id,
      source_activation_auth_id: parentPreflight.source_activation_auth_id,
      source_activation_readiness_id: parentPreflight.source_activation_readiness_id,
      source_plan_id: parentPreflight.source_plan_id,
      source_dispatcher_id: parentPreflight.source_dispatcher_id,
      source_envelope_id: parentPreflight.source_envelope_id,
      source_auth_id: parentPreflight.source_auth_id,
      source_readiness_id: parentPreflight.source_readiness_id,
      source_approval_id: parentPreflight.source_approval_id,
      source_prep_id: parentPreflight.source_prep_id,
      source_review_id: parentPreflight.source_review_id,
      source_simulation_id: parentPreflight.source_simulation_id,
      source_execution_id: parentPreflight.source_execution_id,
      cohort_id: parentPreflight.cohort_id,
      tenant_id: parentPreflight.tenant_id,
      simulation_type: parentPreflight.simulation_type,
      activation_token_issuance_status: 'DRAFT',
      activation_token_issuance_result: null,
      risk_level: parentPreflight.risk_level,
      confidence_level: parentPreflight.confidence_level,
      projected_impact_score: parentPreflight.projected_impact_score,
      rollback_feasibility_score: parentPreflight.rollback_feasibility_score,
      evidence_completeness_score: parentPreflight.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: issuanceConfig,
      token_issuance_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      token_issuance_rules_json: {},
      token_issuance_blockers_json: { missing_token_issuance_evaluation: true },
      non_execution_attestation_json: nonExecution160,
      write_scope_attestation_json: writeScope160,
      non_redeemable_token_record_json: tokenRecord,
      source_activation_token_preflight_hash: parentPreflight.activation_token_preflight_hash,
      source_activation_token_staging_hash: parentPreflight.source_activation_token_staging_hash,
      source_token_material_hash: parentPreflight.source_token_material_hash,
      source_freeze_package_hash: parentPreflight.source_freeze_package_hash,
      activation_token_issuance_hash: null,
      token_issuance_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      issuance_signatures_json: {},
      issuance_metadata_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
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
      this._mockState.tokenIssuance.set(issuanceId, record);
      this._mockState.rules.set(issuanceId, []);
      await auditSvc.createAuditLog(issuanceId, 'TOKEN_ISSUANCE_DRAFT_CREATED', actorId, { activationTokenPreflightId });
      return { tokenIssuance: record };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_issuance
       (activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id,
        source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id,
        source_activation_decision_id, source_activation_lock_id, source_activation_auth_id,
        source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id,
        source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_issuance_status, activation_token_issuance_result,
        risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_issuance_summary_json,
        impact_review_json, rollback_review_json, guardrail_review_json,
        token_issuance_rules_json, token_issuance_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, non_redeemable_token_record_json, source_activation_token_preflight_hash,
        source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status,
        job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}',
               '{}', ?, ?, ?, ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
               'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        issuanceId, activationTokenPreflightId, record.source_activation_token_staging_id,
        record.source_activation_token_final_apv_id, record.source_activation_token_env_id, record.source_activation_handoff_id,
        record.source_activation_decision_id, record.source_activation_lock_id, record.source_activation_auth_id,
        record.source_activation_readiness_id, record.source_plan_id, record.source_dispatcher_id, record.source_envelope_id,
        record.source_auth_id, record.source_readiness_id, record.source_approval_id, record.source_prep_id,
        record.source_review_id, record.source_simulation_id, record.source_execution_id,
        record.cohort_id, record.tenant_id, record.simulation_type,
        record.risk_level, record.confidence_level, record.projected_impact_score,
        record.rollback_feasibility_score, record.evidence_completeness_score,
        JSON.stringify(issuanceConfig),
        JSON.stringify({ missing_token_issuance_evaluation: true }),
        JSON.stringify(nonExecution160), JSON.stringify(writeScope160), JSON.stringify(tokenRecord),
        record.source_activation_token_preflight_hash, record.source_activation_token_staging_hash,
        record.source_token_material_hash, record.source_freeze_package_hash
      ]
    );

    await auditSvc.createAuditLog(issuanceId, 'TOKEN_ISSUANCE_DRAFT_CREATED', actorId, { activationTokenPreflightId });
    return { tokenIssuance: await this.getTokenIssuance(issuanceId) };
  }

  async getTokenIssuance(activationTokenIssuanceId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.tokenIssuance.get(activationTokenIssuanceId) || null;
    const rows = await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_issuance WHERE activation_token_issuance_id = ?`, [activationTokenIssuanceId]);
    return rows && rows[0] ? rows[0] : null;
  }

  async listTokenIssuances() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return Array.from(this._mockState.tokenIssuance.values());
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_issuance ORDER BY created_at DESC`);
  }

  async getRules(activationTokenIssuanceId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) return this._mockState.rules.get(activationTokenIssuanceId) || [];
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_issuance_rules WHERE activation_token_issuance_id = ? ORDER BY created_at ASC`, [activationTokenIssuanceId]);
  }

  async updateTokenIssuance(activationTokenIssuanceId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenIssuance(activationTokenIssuanceId);
    if (!original) throw new Error('TOKEN_ISSUANCE_RECORD_NOT_FOUND');

    if (original.activation_token_issuance_status === 'FINALIZED') {
      throw new Error('TOKEN_ISSUANCE_IMMUTABLE');
    }

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenIssuance.set(activationTokenIssuanceId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenIssuanceId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_issuance SET ${setClauses.join(', ')} WHERE activation_token_issuance_id = ?`, bindings);
    return await this.getTokenIssuance(activationTokenIssuanceId);
  }

  async _internalUpdateTokenIssuance(activationTokenIssuanceId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getTokenIssuance(activationTokenIssuanceId);
    if (!original) throw new Error('TOKEN_ISSUANCE_RECORD_NOT_FOUND');

    if (!isProdLike) {
      const updated = { ...original, ...fields, updated_at: new Date() };
      this._mockState.tokenIssuance.set(activationTokenIssuanceId, updated);
      return updated;
    }

    const setClauses = [];
    const bindings = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`${k} = ?`);
      bindings.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    bindings.push(activationTokenIssuanceId);
    await db.query(`UPDATE cb_cohort_intervention_activation_token_issuance SET ${setClauses.join(', ')} WHERE activation_token_issuance_id = ?`, bindings);
    return await this.getTokenIssuance(activationTokenIssuanceId);
  }

  async createRule(activationTokenIssuanceId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const rule = { rule_id: ruleId, activation_token_issuance_id: activationTokenIssuanceId, check_type: checkType, severity, description, created_at: new Date() };

    if (!isProdLike) {
      const list = this._mockState.rules.get(activationTokenIssuanceId) || [];
      list.push(rule);
      this._mockState.rules.set(activationTokenIssuanceId, list);
      return rule;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_issuance_rules 
       (rule_id, activation_token_issuance_id, check_type, severity, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [ruleId, activationTokenIssuanceId, checkType, severity, description]
    );
    return rule;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenIssuanceBuilderService()
};
