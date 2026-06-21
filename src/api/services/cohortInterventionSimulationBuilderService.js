'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const executionBuilderService = require('./cohortInterventionExecutionBuilderService').serviceInstance || require('./cohortInterventionExecutionBuilderService');
const executionEvidencePackService = require('./cohortInterventionExecutionEvidencePackService').serviceInstance || require('./cohortInterventionExecutionEvidencePackService');
const auditService = require('./cohortInterventionSimulationAuditService').serviceInstance || require('./cohortInterventionSimulationAuditService');

// Phase 141 hardening: only these Phase 140 execution types can source a high-risk simulation.
// EXECUTE_COHORT_CONTINUATION_MARKER and EXECUTE_OBSERVATION_EXTENSION are excluded —
// they represent routine safe-scope outcomes that do not warrant high-risk simulation.
const ELIGIBLE_PHASE140_SOURCE_TYPES = [
  'EXECUTE_RISK_ESCALATION_MARKER',
  'EXECUTE_MANUAL_INTERVENTION_TASKS',
  'EXECUTE_PARTICIPANT_SUPPORT_TASKS'
];

const ALLOWED_SIMULATION_TYPES = [
  'SIMULATE_COHORT_PAUSE',
  'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION',
  'SIMULATE_INVITE_REVOCATION',
  'SIMULATE_CONTROLLED_EXPANSION'
];

// Maps each eligible Phase 140 execution type to the simulation types it may unlock.
const SIMULATION_TYPE_MAP = {
  'EXECUTE_RISK_ESCALATION_MARKER':    ['SIMULATE_COHORT_PAUSE', 'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION', 'SIMULATE_INVITE_REVOCATION'],
  'EXECUTE_MANUAL_INTERVENTION_TASKS': ['SIMULATE_PARTICIPANT_ACCESS_RESTRICTION', 'SIMULATE_INVITE_REVOCATION', 'SIMULATE_CONTROLLED_EXPANSION'],
  'EXECUTE_PARTICIPANT_SUPPORT_TASKS': ['SIMULATE_PARTICIPANT_ACCESS_RESTRICTION', 'SIMULATE_CONTROLLED_EXPANSION']
};

class CohortInterventionSimulationBuilderService {
  constructor() {
    this._mockState = {
      simulations: new Map(),
      steps: new Map(),
      projections: new Map(),
      results: new Map(),
      evidences: new Map()
    };
  }

  _buildWriteScopeAttestation() {
    return {
      writes_only_phase141_tables: true,
      wrote_phase128_to_140_operational_tables: false,
      cohort_access_mutated: false,
      participant_access_mutated: false,
      invite_access_mutated: false,
      cohort_expanded: false,
      payment_or_billing_mutated: false,
      provider_submission_triggered: false,
      tax_accounting_submission_triggered: false,
      public_marketplace_enabled: false,
      source_mutation_triggered: false
    };
  }

  async getExecution(executionId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return executionBuilderService._mockState.executions.get(executionId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_executions WHERE execution_id = ?', [executionId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getExecutionEvidence(executionId, isProdLike) {
    if (!isProdLike) {
      return executionEvidencePackService._mockState
        ? executionEvidencePackService._mockState.evidence.get(executionId)
        : null;
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_execution_evidence WHERE execution_id = ?', [executionId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getSimulation(simulationId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.simulations.get(simulationId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_simulations WHERE simulation_id = ?', [simulationId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getSteps(simulationId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.steps.get(simulationId) || [];
    } else {
      return await db.query('SELECT * FROM controlled_beta_cohort_intervention_simulation_steps WHERE simulation_id = ?', [simulationId]);
    }
  }

  async createSimulation(executionId, simulationType, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Validate Phase 140 execution
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error('PHASE140_EXECUTION_NOT_FOUND');
    }
    if (execution.execution_status !== 'EXECUTED') {
      throw new Error('PHASE140_EXECUTION_NOT_COMPLETED');
    }

    // Phase 141 hardening: restrict eligible source types
    if (!ELIGIBLE_PHASE140_SOURCE_TYPES.includes(execution.execution_type)) {
      throw new Error(
        `INELIGIBLE_PHASE140_SOURCE_TYPE: ${execution.execution_type} does not qualify for high-risk simulation. ` +
        `Eligible types: ${ELIGIBLE_PHASE140_SOURCE_TYPES.join(', ')}`
      );
    }

    // Validate simulation type is allowed for this source
    if (!ALLOWED_SIMULATION_TYPES.includes(simulationType)) {
      throw new Error(`UNSUPPORTED_SIMULATION_TYPE: ${simulationType}`);
    }

    const allowedForSource = SIMULATION_TYPE_MAP[execution.execution_type] || [];
    if (!allowedForSource.includes(simulationType)) {
      throw new Error(
        `SIMULATION_TYPE_NOT_ALLOWED_FOR_SOURCE: ${simulationType} is not unlocked by ${execution.execution_type}`
      );
    }

    // Validate Phase 140 evidence exists
    const execEvidence = await this.getExecutionEvidence(executionId, isProdLike);
    if (!execEvidence || execEvidence.evidence_schema_version !== '140.0') {
      throw new Error('PHASE140_EVIDENCE_MISSING_OR_INVALID');
    }

    const simulationId = 'sim_' + crypto.randomBytes(8).toString('hex');
    const writeScopeAttestation = this._buildWriteScopeAttestation();
    const simulationBlockers = {
      missing_impact_analysis: true,
      missing_rollback_preview: true,
      missing_operator_confirmation: true
    };

    const lineageHashes = JSON.parse(typeof execution.lineage_hashes_json === 'string' ? execution.lineage_hashes_json : JSON.stringify(execution.lineage_hashes_json || {}));

    const simulationRecord = {
      simulation_id: simulationId,
      source_execution_id: executionId,
      source_execution_type: execution.execution_type,
      source_execution_hash: execution.evidence_pack_hash || 'placeholder_exec_hash',
      source_execution_evidence_pack_hash: execEvidence.evidence_pack_hash,
      source_approval_hash: lineageHashes.source_approval_hash || 'placeholder_approval_hash',
      source_preparation_hash: lineageHashes.source_preparation_hash || 'placeholder_prep_hash',
      source_review_hash: lineageHashes.source_review_hash || 'placeholder_review_hash',
      tenant_id: execution.tenant_id,
      cohort_id: execution.cohort_id,
      simulation_type: simulationType,
      simulation_status: 'DRAFT',
      operator_confirmed: 0,
      safe_scope_simulation_attestation: 'PHASE_141_SIMULATION_ONLY_NO_OPERATIONAL_MUTATION',
      simulation_write_scope_attestation_json: writeScopeAttestation,
      simulation_blockers_json: simulationBlockers,
      requested_by: actorId,
      created_at: new Date()
    };

    const requiredSteps = [
      { step_key: 'impact_analysis', step_label: 'Impact Analysis Projection', status: 'PENDING', required: 1 },
      { step_key: 'rollback_preview', step_label: 'Rollback Preview Generation', status: 'PENDING', required: 1 },
      { step_key: 'operator_confirmation', step_label: 'Operator Confirmation', status: 'PENDING', required: 1 }
    ];

    if (!isProdLike) {
      this._mockState.simulations.set(simulationId, simulationRecord);
      const stepsWithIds = requiredSteps.map(s => ({
        step_id: 'sst_' + crypto.randomBytes(6).toString('hex'),
        simulation_id: simulationId,
        ...s,
        created_at: new Date()
      }));
      this._mockState.steps.set(simulationId, stepsWithIds);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_simulations
         (simulation_id, source_execution_id, source_execution_type, source_execution_hash,
          source_execution_evidence_pack_hash, source_approval_hash, source_preparation_hash,
          source_review_hash, tenant_id, cohort_id, simulation_type, simulation_status,
          operator_confirmed, safe_scope_simulation_attestation, simulation_write_scope_attestation_json,
          simulation_blockers_json, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          simulationId, executionId, execution.execution_type,
          simulationRecord.source_execution_hash, execEvidence.evidence_pack_hash,
          simulationRecord.source_approval_hash, simulationRecord.source_preparation_hash,
          simulationRecord.source_review_hash,
          execution.tenant_id, execution.cohort_id, simulationType, 'DRAFT', 0,
          'PHASE_141_SIMULATION_ONLY_NO_OPERATIONAL_MUTATION',
          JSON.stringify(writeScopeAttestation), JSON.stringify(simulationBlockers), actorId
        ]
      );

      for (const step of requiredSteps) {
        const stepId = 'sst_' + crypto.randomBytes(6).toString('hex');
        await db.query(
          `INSERT INTO controlled_beta_cohort_intervention_simulation_steps
           (step_id, simulation_id, step_key, step_label, status, required)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [stepId, simulationId, step.step_key, step.step_label, step.status, step.required]
        );
      }
    }

    await auditService.recordAuditEvent(simulationId, 'SIMULATION_CREATED', actorId, {
      simulation_type: simulationType,
      source_execution_id: executionId,
      source_execution_type: execution.execution_type
    });

    const sim = await this.getSimulation(simulationId);
    const steps = await this.getSteps(simulationId);

    return { simulation: sim || simulationRecord, steps };
  }
}

const serviceInstance = new CohortInterventionSimulationBuilderService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationBuilderService = CohortInterventionSimulationBuilderService;
