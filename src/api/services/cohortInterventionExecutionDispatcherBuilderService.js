'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const envelopeBuilderSvc = require('./cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionDispatcherAuditService').serviceInstance;

class CohortInterventionExecutionDispatcherBuilderService {
  constructor() {
    this._mockState = {
      dispatcher: new Map(),
      rules: new Map()
    };
  }

  async createDispatcher(envelopeId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 147 envelope
    const envelope = await envelopeBuilderSvc.getEnvelope(envelopeId);
    if (!envelope) {
      throw new Error('PHASE147_ENVELOPE_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (envelope.envelope_status !== 'FINALIZED') {
      throw new Error('PHASE147_ENVELOPE_NOT_FINALIZED');
    }
    if (envelope.envelope_result !== 'NO_OP_EXECUTED_NOT_MUTATED') {
      throw new Error('PHASE147_ENVELOPE_NOT_APPROVED');
    }
    if (envelope.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE147_EXECUTION_CAPABILITY_VIOLATION');
    }

    const dispatcherId = 'dsp_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const dryRunConfig = {
      dispatch_mode: 'DRY_RUN_ONLY',
      queue_dispatch_mode: 'SIMULATED_ONLY',
      allow_real_job_creation: false,
      allow_queue_writes: false,
      allow_runtime_writes: false,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      rollback_hooks_required: true,
      kill_switch_required: true,
      operator_confirmation_required: true,
      snapshot_before_after_required: true
    };

    const writeScopeAttestation = {
      writes_only_phase148_tables: true,
      wrote_phase128_to_147_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const dispatcherRecord = {
      dispatcher_id: dispatcherId,
      source_envelope_id: envelope.envelope_id,
      source_auth_id: envelope.source_auth_id,
      source_readiness_id: envelope.source_readiness_id,
      source_approval_id: envelope.source_approval_id,
      source_prep_id: envelope.source_prep_id,
      source_review_id: envelope.source_review_id,
      source_simulation_id: envelope.source_simulation_id,
      source_execution_id: envelope.source_execution_id,
      cohort_id: envelope.cohort_id,
      tenant_id: envelope.tenant_id,
      simulation_type: envelope.simulation_type,
      dispatcher_status: 'DRAFT',
      dispatcher_result: null,
      risk_level: envelope.risk_level,
      confidence_level: envelope.confidence_level,
      projected_impact_score: envelope.projected_impact_score,
      rollback_feasibility_score: envelope.rollback_feasibility_score,
      evidence_completeness_score: envelope.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: dryRunConfig,
      dispatcher_summary_json: {},
      impact_review_json: envelope.impact_review_json || {},
      rollback_review_json: envelope.rollback_review_json || {},
      guardrail_review_json: envelope.guardrail_review_json || {},
      dispatcher_rules_json: {},
      dispatcher_blockers_json: { missing_dispatcher_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_envelope_hash: envelope.envelope_result_hash || 'none',
      source_envelope_evidence_pack_hash: envelope.evidence_pack_hash || 'none',
      dispatcher_result_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      dispatcher_execution_status: 'DRY_RUN_ACTIVE_NOT_MUTATING',
      dry_run_execution_result: 'DRY_RUN_EXECUTED_NOT_MUTATED',
      queue_dispatch_status: 'SIMULATED_ONLY',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      job_creation_status: 'NO_REAL_JOB_CREATED',
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
      this._mockState.dispatcher.set(dispatcherId, dispatcherRecord);
      this._mockState.rules.set(dispatcherId, []);
      await auditSvc.createAuditLog(dispatcherId, 'DISPATCHER_DRAFT_CREATED', actorId, { source_envelope_id: envelopeId });
      return { dispatcher: dispatcherRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_dry_run_dispatcher
       (dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, dispatcher_status, dispatcher_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, dispatcher_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, dispatcher_rules_json, dispatcher_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_envelope_hash, source_envelope_evidence_pack_hash,
        execution_capability_status, dispatcher_execution_status, dry_run_execution_result, queue_dispatch_status, runtime_mutation_status, job_creation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_dispatcher_evaluation":true}', ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'DRY_RUN_ACTIVE_NOT_MUTATING', 'DRY_RUN_EXECUTED_NOT_MUTATED', 'SIMULATED_ONLY', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_REAL_JOB_CREATED', ?, ?)`,
      [
        dispatcherId, envelope.envelope_id, envelope.source_auth_id, envelope.source_readiness_id, envelope.source_approval_id,
        envelope.source_prep_id, envelope.source_review_id, envelope.source_simulation_id, envelope.source_execution_id,
        envelope.cohort_id, envelope.tenant_id, envelope.simulation_type, envelope.risk_level, envelope.confidence_level,
        envelope.projected_impact_score, envelope.rollback_feasibility_score, envelope.evidence_completeness_score,
        JSON.stringify(dryRunConfig), JSON.stringify(envelope.impact_review_json || {}), JSON.stringify(envelope.rollback_review_json || {}),
        JSON.stringify(envelope.guardrail_review_json || {}), JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation),
        envelope.envelope_result_hash || 'none', envelope.evidence_pack_hash || 'none', created, created
      ]
    );

    await auditSvc.createAuditLog(dispatcherId, 'DISPATCHER_DRAFT_CREATED', actorId, { source_envelope_id: envelopeId });
    return { dispatcher: dispatcherRecord };
  }

  async getDispatcher(dispatcherId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.dispatcher.get(dispatcherId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_dry_run_dispatcher WHERE dispatcher_id = ?`,
      [dispatcherId]
    );
    return rows[0] || null;
  }

  async listDispatcher() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.dispatcher.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_dry_run_dispatcher ORDER BY created_at DESC`);
  }

  async updateDispatcher(dispatcherId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getDispatcher(dispatcherId);
    if (!original) throw new Error('DISPATCHER_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.dispatcher.set(dispatcherId, updated);
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

    values.push(dispatcherId);
    await db.query(
      `UPDATE cb_cohort_intervention_dry_run_dispatcher SET ${updatePairs.join(', ')} WHERE dispatcher_id = ?`,
      values
    );

    return updated;
  }

  async createRule(dispatcherId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      dispatcher_id: dispatcherId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(dispatcherId)) {
        this._mockState.rules.set(dispatcherId, []);
      }
      this._mockState.rules.get(dispatcherId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_dispatcher_rules
       (rule_id, dispatcher_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, dispatcherId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(dispatcherId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(dispatcherId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_dispatcher_rules WHERE dispatcher_id = ? ORDER BY created_at ASC`,
      [dispatcherId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionDispatcherBuilderService();
module.exports = {
  CohortInterventionExecutionDispatcherBuilderService,
  serviceInstance
};
