'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const authBuilderSvc = require('./cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionEnvelopeAuditService').serviceInstance;

class CohortInterventionExecutionEnvelopeBuilderService {
  constructor() {
    this._mockState = {
      envelope: new Map(),
      rules: new Map()
    };
  }

  async createEnvelope(authId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Fetch parent Phase 146 authorization
    const auth = await authBuilderSvc.getAuth(authId);
    if (!auth) {
      throw new Error('PHASE146_AUTHORIZATION_NOT_FOUND');
    }

    // 2. Validate finalized and approved
    if (auth.auth_status !== 'FINALIZED') {
      throw new Error('PHASE146_AUTHORIZATION_NOT_FINALIZED');
    }
    if (auth.auth_decision !== 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE') {
      throw new Error('PHASE146_AUTHORIZATION_NOT_APPROVED');
    }
    if (auth.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE146_EXECUTION_CAPABILITY_VIOLATION');
    }

    const envelopeId = 'env_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const canaryEnvelope = {
      mode: 'NO_OP',
      max_cohorts: 0,
      max_participants: 0,
      max_invites: 0,
      max_runtime_mutations: 0,
      max_execution_jobs: 0,
      allow_queue_dispatch: false,
      allow_runtime_writes: false,
      requires_kill_switch: true,
      requires_operator_confirmation: true,
      requires_rollback_authority: true,
      snapshot_before_after_required: true
    };

    const writeScopeAttestation = {
      writes_only_phase147_tables: true,
      wrote_phase128_to_146_operational_tables: false
    };

    const nonExecutionAttestation = {
      safe_workflow_boundary_preserved: true,
      execution_enforcement_disabled: true,
      no_runtime_mutations: true
    };

    const envelopeRecord = {
      envelope_id: envelopeId,
      source_auth_id: auth.auth_id,
      source_readiness_id: auth.source_readiness_id,
      source_approval_id: auth.source_approval_id,
      source_prep_id: auth.source_prep_id,
      source_review_id: auth.source_review_id,
      source_simulation_id: auth.source_simulation_id,
      source_execution_id: auth.source_execution_id,
      cohort_id: auth.cohort_id,
      tenant_id: auth.tenant_id,
      simulation_type: auth.simulation_type,
      envelope_status: 'DRAFT',
      envelope_result: null,
      risk_level: auth.risk_level,
      confidence_level: auth.confidence_level,
      projected_impact_score: auth.projected_impact_score,
      rollback_feasibility_score: auth.rollback_feasibility_score,
      evidence_completeness_score: auth.evidence_completeness_score,
      guardrail_status: 'PENDING',
      write_scope_status: 'PENDING',
      canary_envelope_json: canaryEnvelope,
      envelope_summary_json: {},
      impact_review_json: auth.impact_review_json || {},
      rollback_review_json: auth.rollback_review_json || {},
      guardrail_review_json: auth.guardrail_review_json || {},
      envelope_rules_json: {},
      envelope_blockers_json: { missing_envelope_evaluation: true },
      non_execution_attestation_json: nonExecutionAttestation,
      write_scope_attestation_json: writeScopeAttestation,
      source_auth_hash: auth.auth_result_hash || 'none',
      source_auth_evidence_pack_hash: auth.evidence_pack_hash || 'none',
      envelope_result_hash: null,
      evidence_pack_hash: null,
      lineage_hash_chain_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      envelope_execution_status: 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING',
      no_op_execution_result: 'NO_OP_EXECUTED_NOT_MUTATED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      job_dispatch_status: 'NO_JOB_DISPATCHED',
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
      this._mockState.envelope.set(envelopeId, envelopeRecord);
      this._mockState.rules.set(envelopeId, []);
      await auditSvc.createAuditLog(envelopeId, 'ENVELOPE_DRAFT_CREATED', actorId, { source_auth_id: authId });
      return { envelope: envelopeRecord };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_no_op_envelope
       (envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id,
        cohort_id, tenant_id, simulation_type, envelope_status, envelope_result, risk_level, confidence_level,
        projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status,
        write_scope_status, canary_envelope_json, envelope_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, envelope_rules_json, envelope_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, source_auth_hash, source_auth_evidence_pack_hash,
        execution_capability_status, envelope_execution_status, no_op_execution_result, runtime_mutation_status, job_dispatch_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, '{}', ?, ?, ?, '{}', '{"missing_envelope_evaluation":true}', ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING', 'NO_OP_EXECUTED_NOT_MUTATED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_JOB_DISPATCHED', ?, ?)`,
      [
        envelopeId, auth.auth_id, auth.source_readiness_id, auth.source_approval_id, auth.source_prep_id, auth.source_review_id,
        auth.source_simulation_id, auth.source_execution_id, auth.cohort_id, auth.tenant_id, auth.simulation_type,
        auth.risk_level, auth.confidence_level, auth.projected_impact_score, auth.rollback_feasibility_score,
        auth.evidence_completeness_score, JSON.stringify(canaryEnvelope), JSON.stringify(auth.impact_review_json || {}),
        JSON.stringify(auth.rollback_review_json || {}), JSON.stringify(auth.guardrail_review_json || {}),
        JSON.stringify(nonExecutionAttestation), JSON.stringify(writeScopeAttestation),
        auth.auth_result_hash || 'none', auth.evidence_pack_hash || 'none', created, created
      ]
    );

    await auditSvc.createAuditLog(envelopeId, 'ENVELOPE_DRAFT_CREATED', actorId, { source_auth_id: authId });
    return { envelope: envelopeRecord };
  }

  async getEnvelope(envelopeId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.envelope.get(envelopeId) || null;
    }

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_no_op_envelope WHERE envelope_id = ?`,
      [envelopeId]
    );
    return rows[0] || null;
  }

  async listEnvelope() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return Array.from(this._mockState.envelope.values());
    }

    return await db.query(`SELECT * FROM cb_cohort_intervention_no_op_envelope ORDER BY created_at DESC`);
  }

  async updateEnvelope(envelopeId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const original = await this.getEnvelope(envelopeId);
    if (!original) throw new Error('ENVELOPE_RECORD_NOT_FOUND');

    const updated = {
      ...original,
      ...fields,
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.envelope.set(envelopeId, updated);
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

    values.push(envelopeId);
    await db.query(
      `UPDATE cb_cohort_intervention_no_op_envelope SET ${updatePairs.join(', ')} WHERE envelope_id = ?`,
      values
    );

    return updated;
  }

  async createRule(envelopeId, checkType, severity, description) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const ruleRecord = {
      rule_id: ruleId,
      envelope_id: envelopeId,
      check_type: checkType,
      severity: severity,
      description: description,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.rules.has(envelopeId)) {
        this._mockState.rules.set(envelopeId, []);
      }
      this._mockState.rules.get(envelopeId).push(ruleRecord);
      return ruleRecord;
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_envelope_rules
       (rule_id, envelope_id, check_type, severity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, envelopeId, checkType, severity, description, created]
    );
    return ruleRecord;
  }

  async getRules(envelopeId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.rules.get(envelopeId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_envelope_rules WHERE envelope_id = ? ORDER BY created_at ASC`,
      [envelopeId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionEnvelopeBuilderService();
module.exports = {
  CohortInterventionExecutionEnvelopeBuilderService,
  serviceInstance
};
