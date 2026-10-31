'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const planBuilderSvc = require('./cohortInterventionExecutionPlanBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationReadinessAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationReadinessBuilderService {
  constructor() {
    this._mockState = {
      readiness: new Map(),
      rules: new Map()
    };
  }

  async createReadiness(planId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 149 plan
    const plan = await planBuilderSvc.getPlan(planId);
    if (!plan) {
      throw new Error('PHASE149_PLAN_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (plan.plan_status !== 'FINALIZED') {
      throw new Error('PHASE149_PLAN_NOT_FINALIZED');
    }
    if (plan.plan_result !== 'PLAN_MATERIALIZED_NOT_EXECUTED') {
      throw new Error('PHASE149_PLAN_NOT_APPROVED');
    }
    if (plan.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE149_EXECUTION_CAPABILITY_VIOLATION');
    }

    const activationRdId = 'ard_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const rdConfig = {
      activation_mode: 'READINESS_ONLY',
      activation_status: 'ACTIVATION_READY_NOT_ACTIVE',
      allow_real_activation: false,
      allow_real_execution: false,
      allow_job_creation: false,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      requires_future_authorization_gate: true,
      requires_kill_switch: true,
      requires_rollback_authority: true,
      requires_operator_confirmation: true,
      requires_plan_hash_verification: true
    };

    const writeScopeAttestation = {
      writes_only_phase150_tables: true,
      wrote_phase128_to_149_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const rdRecord = {
      activation_rd_id: activationRdId,
      source_plan_id: plan.plan_id,
      source_dispatcher_id: plan.source_dispatcher_id,
      source_envelope_id: plan.source_envelope_id,
      source_auth_id: plan.source_auth_id,
      source_readiness_id: plan.source_readiness_id,
      source_approval_id: plan.source_approval_id,
      source_prep_id: plan.source_prep_id,
      source_review_id: plan.source_review_id,
      source_simulation_id: plan.source_simulation_id,
      source_execution_id: plan.source_execution_id,
      cohort_id: plan.cohort_id,
      tenant_id: plan.tenant_id,
      simulation_type: plan.simulation_type,
      activation_readiness_status: 'DRAFT',
      activation_readiness_result: null,
      risk_level: plan.risk_level,
      confidence_level: plan.confidence_level,
      projected_impact_score: plan.projected_impact_score,
      rollback_feasibility_score: plan.rollback_feasibility_score,
      evidence_completeness_score: plan.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: rdConfig,
      readiness_summary_json: {},
      impact_review_json: plan.impact_review_json || {},
      rollback_review_json: plan.rollback_review_json || {},
      guardrail_review_json: plan.guardrail_review_json || {},
      readiness_rules_json: {},
      readiness_blockers_json: { missing_readiness_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_plan_hash: plan.plan_materialization_hash || 'none',
      source_plan_evidence_pack_hash: plan.evidence_pack_hash || 'none',
      activation_readiness_hash: null,
      readiness_evidence_pack_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'ACTIVATION_NOT_EXECUTED',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      finalized_by: null,
      finalized_at: null,
      created_at: created,
      updated_at: created
    };

    if (!isProdLike) {
      this._mockState.readiness.set(activationRdId, rdRecord);
      this._mockState.rules.set(activationRdId, []);
      await auditSvc.createAuditLog(activationRdId, 'READINESS_DRAFT_CREATED', actorId, { source_plan_id: planId });
      return { readiness: rdRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd
       (activation_rd_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, activation_readiness_status, activation_readiness_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, readiness_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, readiness_rules_json, readiness_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_plan_hash, source_plan_evidence_pack_hash,
        execution_capability_status, activation_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_readiness_evaluation":true}', ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'ACTIVATION_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        activationRdId, plan.plan_id, plan.source_dispatcher_id, plan.source_envelope_id, plan.source_auth_id, plan.source_readiness_id,
        plan.source_approval_id, plan.source_prep_id, plan.source_review_id, plan.source_simulation_id, plan.source_execution_id,
        plan.cohort_id, plan.tenant_id, plan.simulation_type,
        plan.risk_level, plan.confidence_level, plan.projected_impact_score, plan.rollback_feasibility_score,
        plan.evidence_completeness_score, JSON.stringify(rdConfig), JSON.stringify(plan.impact_review_json || {}),
        JSON.stringify(plan.rollback_review_json || {}), JSON.stringify(plan.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), plan.plan_materialization_hash || 'none',
        plan.evidence_pack_hash || 'none', created, created
      ]
    );

    await auditSvc.createAuditLog(activationRdId, 'READINESS_DRAFT_CREATED', actorId, { source_plan_id: planId });
    return { readiness: rdRecord };
  }

  async getReadiness(activationRdId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.readiness.get(activationRdId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_rd WHERE activation_rd_id = ?`,
      [activationRdId]
    );
    return rows[0] || null;
  }

  async listReadiness() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.readiness.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_rd ORDER BY created_at DESC`);
  }

  async updateReadiness(activationRdId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getReadiness(activationRdId);
    if (!original) throw new Error('READINESS_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.readiness.set(activationRdId, updated);
      return updated;
    }

    const updatePairs = [];
    const values = [];
    for (const [k, v] of Object.entries(fields)) {
      updatePairs.push(`${k} = ?`);
      if (typeof v === 'object' && v !== null) {
        values.push(JSON.stringify(v));
      } else {
        values.push(v);
      }
    }
    updatePairs.push(`updated_at = NOW()`);

    values.push(activationRdId);
    await db.query(
      `UPDATE cb_cohort_intervention_activation_rd SET ${updatePairs.join(', ')} WHERE activation_rd_id = ?`,
      values
    );

    return updated;
  }

  async createRule(activationRdId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      activation_rd_id: activationRdId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(activationRdId)) {
        this._mockState.rules.set(activationRdId, []);
      }
      this._mockState.rules.get(activationRdId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd_rules
       (rule_id, activation_rd_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, activationRdId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(activationRdId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(activationRdId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_rd_rules WHERE activation_rd_id = ? ORDER BY created_at ASC`,
      [activationRdId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationReadinessBuilderService();
module.exports = {
  CohortInterventionExecutionPlanActivationReadinessBuilderService,
  serviceInstance
};
