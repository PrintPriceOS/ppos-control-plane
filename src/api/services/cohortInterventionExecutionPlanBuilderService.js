'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const dispatcherBuilderSvc = require('./cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanAuditService').serviceInstance;

class CohortInterventionExecutionPlanBuilderService {
  constructor() {
    this._mockState = {
      plan: new Map(),
      rules: new Map()
    };
  }

  async createPlan(dispatcherId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 148 dispatcher
    const dispatcher = await dispatcherBuilderSvc.getDispatcher(dispatcherId);
    if (!dispatcher) {
      throw new Error('PHASE148_DISPATCHER_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (dispatcher.dispatcher_status !== 'FINALIZED') {
      throw new Error('PHASE148_DISPATCHER_NOT_FINALIZED');
    }
    if (dispatcher.dispatcher_result !== 'DRY_RUN_EXECUTED_NOT_MUTATED') {
      throw new Error('PHASE148_DISPATCHER_NOT_APPROVED');
    }
    if (dispatcher.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE148_EXECUTION_CAPABILITY_VIOLATION');
    }

    const planId = 'pln_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const planConfig = {
      plan_mode: 'MATERIALIZED_NOT_EXECUTABLE',
      allow_real_execution: false,
      allow_job_creation: false,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      requires_future_activation_gate: true,
      requires_kill_switch: true,
      requires_rollback_hooks: true,
      requires_operator_confirmation: true,
      immutable_after_finalization: true
    };

    const writeScopeAttestation = {
      writes_only_phase149_tables: true,
      wrote_phase128_to_148_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const planRecord = {
      plan_id: planId,
      source_dispatcher_id: dispatcher.dispatcher_id,
      source_envelope_id: dispatcher.source_envelope_id,
      source_auth_id: dispatcher.source_auth_id,
      source_readiness_id: dispatcher.source_readiness_id,
      source_approval_id: dispatcher.source_approval_id,
      source_prep_id: dispatcher.source_prep_id,
      source_review_id: dispatcher.source_review_id,
      source_simulation_id: dispatcher.source_simulation_id,
      source_execution_id: dispatcher.source_execution_id,
      cohort_id: dispatcher.cohort_id,
      tenant_id: dispatcher.tenant_id,
      simulation_type: dispatcher.simulation_type,
      plan_status: 'DRAFT',
      plan_result: null,
      risk_level: dispatcher.risk_level,
      confidence_level: dispatcher.confidence_level,
      projected_impact_score: dispatcher.projected_impact_score,
      rollback_feasibility_score: dispatcher.rollback_feasibility_score,
      evidence_completeness_score: dispatcher.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: planConfig,
      plan_summary_json: {},
      impact_review_json: dispatcher.impact_review_json || {},
      rollback_review_json: dispatcher.rollback_review_json || {},
      guardrail_review_json: dispatcher.guardrail_review_json || {},
      plan_rules_json: {},
      plan_blockers_json: { missing_plan_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_dispatcher_hash: dispatcher.dispatcher_result_hash || 'none',
      source_dispatcher_evidence_pack_hash: dispatcher.evidence_pack_hash || 'none',
      execution_plan_hash: null,
      plan_materialization_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      execution_plan_status: 'MATERIALIZED_NOT_EXECUTABLE',
      plan_execution_status: 'PLAN_MATERIALIZED_NOT_EXECUTED',
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
      this._mockState.plan.set(planId, planRecord);
      this._mockState.rules.set(planId, []);
      await auditSvc.createAuditLog(planId, 'PLAN_DRAFT_CREATED', actorId, { source_dispatcher_id: dispatcherId });
      return { plan: planRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_plan
       (plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, plan_status, plan_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, plan_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, plan_rules_json, plan_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_dispatcher_hash, source_dispatcher_evidence_pack_hash,
        execution_capability_status, execution_plan_status, plan_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_plan_evaluation":true}', ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'MATERIALIZED_NOT_EXECUTABLE', 'PLAN_MATERIALIZED_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', ?, ?)`,
      [
        planId, dispatcher.dispatcher_id, dispatcher.source_envelope_id, dispatcher.source_auth_id, dispatcher.source_readiness_id,
        dispatcher.source_approval_id, dispatcher.source_prep_id, dispatcher.source_review_id, dispatcher.source_simulation_id,
        dispatcher.source_execution_id, dispatcher.cohort_id, dispatcher.tenant_id, dispatcher.simulation_type,
        dispatcher.risk_level, dispatcher.confidence_level, dispatcher.projected_impact_score, dispatcher.rollback_feasibility_score,
        dispatcher.evidence_completeness_score, JSON.stringify(planConfig), JSON.stringify(dispatcher.impact_review_json || {}),
        JSON.stringify(dispatcher.rollback_review_json || {}), JSON.stringify(dispatcher.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation), dispatcher.dispatcher_result_hash || 'none',
        dispatcher.evidence_pack_hash || 'none', created, created
      ]
    );

    await auditSvc.createAuditLog(planId, 'PLAN_DRAFT_CREATED', actorId, { source_dispatcher_id: dispatcherId });
    return { plan: planRecord };
  }

  async getPlan(planId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.plan.get(planId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_exec_plan WHERE plan_id = ?`,
      [planId]
    );
    return rows[0] || null;
  }

  async listPlan() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.plan.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_exec_plan ORDER BY created_at DESC`);
  }

  async updatePlan(planId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getPlan(planId);
    if (!original) throw new Error('PLAN_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.plan.set(planId, updated);
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

    values.push(planId);
    await db.query(
      `UPDATE cb_cohort_intervention_exec_plan SET ${updatePairs.join(', ')} WHERE plan_id = ?`,
      values
    );

    return updated;
  }

  async createRule(planId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      plan_id: planId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(planId)) {
        this._mockState.rules.set(planId, []);
      }
      this._mockState.rules.get(planId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_plan_rules
       (rule_id, plan_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, planId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(planId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(planId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_plan_rules WHERE plan_id = ? ORDER BY created_at ASC`,
      [planId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanBuilderService();
module.exports = {
  CohortInterventionExecutionPlanBuilderService,
  serviceInstance
};
