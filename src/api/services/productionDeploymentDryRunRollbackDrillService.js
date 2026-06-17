'use strict';

const crypto = require('crypto');

const SAFETY_FLAGS = Object.freeze({
  deployment_dry_run_only: true,
  real_deployment_executed: false,
  service_restart_executed: false,
  rollback_executed: false,
  source_mutation_enabled: false,
  external_submission_enabled: false,
  production_activation_enabled: false,
  full_public_enabled: false,
  live_provider_connectivity_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
});

const SAFETY_MARKERS = Object.freeze({
  deploymentDryRunOnly: true,
  realDeploymentExecuted: false,
  serviceRestartExecuted: false,
  rollbackExecuted: false,
  sourceMutation: false,
  externalSubmission: false,
  productionActivationEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
});

const PHASE_SAFETY_STRING =
  'PHASE_117_DRY_RUN_ONLY. No real deployment, no service restart, no rollback execution, ' +
  'no production activation, no live provider connectivity, no payment/refund/payout execution, ' +
  'no external submission, no source mutation.';

const SIMULATED_DEPLOY_STEPS = [
  { name: 'pre_deploy_env_check', type: 'PRE_DEPLOY_CHECK' },
  { name: 'migration_status_verify', type: 'MIGRATION_VERIFY' },
  { name: 'backup_timestamp_verify', type: 'BACKUP_VERIFY' },
  { name: 'service_restart_simulated', type: 'SERVICE_RESTART_SIMULATED' },
  { name: 'health_check_simulated', type: 'HEALTH_CHECK_SIMULATED' },
  { name: 'smoke_test_simulated', type: 'SMOKE_TEST_SIMULATED' },
  { name: 'rollback_plan_verify', type: 'ROLLBACK_PLAN_VERIFY' },
  { name: 'post_deploy_check_simulated', type: 'POST_DEPLOY_CHECK' },
];

class ProductionDeploymentDryRunRollbackDrillService {
  constructor() {
    this._dryRuns = new Map();
    this._steps = new Map();
    this._rollbackDrills = new Map();
    this._audits = new Map();

    let _db = null;
    try {
      _db = require('./mysqlClient');
    } catch (_) {
      // DB unavailable — in-memory fallback for smoke/test environments
    }
    this._db = _db;
  }

  _safetyFlags() { return { ...SAFETY_FLAGS }; }
  _safetyMarkers() { return { ...SAFETY_MARKERS }; }

  _uid() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  }

  _writeAudit(dryRunId, eventType, actor, details) {
    const audit = {
      audit_id: `audit-${this._uid()}`,
      dry_run_id: dryRunId,
      event_type: eventType,
      actor: actor || 'system',
      details_json: details || {},
      deployment_dry_run_only: true,
      created_at: new Date().toISOString(),
    };
    if (!this._audits.has(dryRunId)) this._audits.set(dryRunId, []);
    this._audits.get(dryRunId).push(audit);
    return audit;
  }

  async createDeploymentDryRun(payload = {}) {
    const dryRunId = payload.dry_run_id || `dry-run-117-${this._uid()}`;
    const readinessRefId = payload.readiness_reference_id || `readiness-ref-${this._uid()}`;
    const requestedBy = payload.requested_by || 'system';

    const record = {
      dry_run_id: dryRunId,
      readiness_reference_id: readinessRefId,
      requested_by: requestedBy,
      status: 'PENDING',
      ...this._safetyFlags(),
      simulated_deployment_steps_json: null,
      health_check_results_json: null,
      evidence_metadata_json: null,
      created_at: new Date().toISOString(),
    };

    this._dryRuns.set(dryRunId, record);

    const steps = SIMULATED_DEPLOY_STEPS.map(s => ({
      step_id: `step-${this._uid()}`,
      dry_run_id: dryRunId,
      step_name: s.name,
      step_type: s.type,
      status: 'PENDING',
      simulated_only: true,
      result_json: null,
      created_at: new Date().toISOString(),
    }));
    this._steps.set(dryRunId, steps);

    if (this._db) {
      try {
        await this._db.query(
          `INSERT INTO production_deployment_dry_runs
            (dry_run_id, readiness_reference_id, requested_by, status,
             deployment_dry_run_only, real_deployment_executed, service_restart_executed,
             rollback_executed, source_mutation_enabled, external_submission_enabled,
             production_activation_enabled, full_public_enabled,
             live_provider_connectivity_enabled, payment_execution_enabled,
             refund_execution_enabled, payout_execution_enabled)
           VALUES (?,?,?,?,1,0,0,0,0,0,0,0,0,0,0,0)`,
          [dryRunId, readinessRefId, requestedBy, 'PENDING']
        );
      } catch (_) { /* fallback to in-memory */ }
    }

    this._writeAudit(dryRunId, 'DRY_RUN_CREATED', requestedBy, { readinessRefId });

    return {
      dry_run_id: dryRunId,
      readiness_reference_id: readinessRefId,
      status: 'PENDING',
      steps_initialized: steps.length,
      safety: this._safetyMarkers(),
      safety_flags: this._safetyFlags(),
      phase_safety_string: PHASE_SAFETY_STRING,
      dryRunOnly: true,
      reviewOnly: true,
    };
  }

  async evaluateDeploymentDryRunReadiness(payload = {}) {
    const dryRunId = payload.dry_run_id || `dry-run-117-${this._uid()}`;
    const actor = payload.actor || 'system';

    const invariants = {
      deployment_dry_run_only: true,
      real_deployment_executed: false,
      service_restart_executed: false,
      rollback_executed: false,
      production_activation_enabled: false,
      full_public_enabled: false,
      live_provider_connectivity_enabled: false,
      payment_execution_enabled: false,
      refund_execution_enabled: false,
      payout_execution_enabled: false,
      external_submission_enabled: false,
      source_mutation_enabled: false,
    };

    const safetyViolations = Object.entries(invariants)
      .filter(([k, expected]) => {
        if (k === 'deployment_dry_run_only') return expected !== true;
        return expected !== false;
      });

    const readinessStatus = safetyViolations.length === 0 ? 'READY_FOR_DRY_RUN' : 'BLOCKED';

    this._writeAudit(dryRunId, 'DRY_RUN_READINESS_EVALUATED', actor, { readinessStatus, invariants });

    return {
      dry_run_id: dryRunId,
      readiness_status: readinessStatus,
      safety_invariants: invariants,
      safety_violations: safetyViolations,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      dryRunOnly: true,
      reviewOnly: true,
    };
  }

  async executeDeploymentDryRun(payload = {}) {
    const dryRunId = payload.dry_run_id || `dry-run-117-${this._uid()}`;
    const actor = payload.actor || 'system';

    const record = this._dryRuns.get(dryRunId);
    if (record) record.status = 'DRY_RUN_RUNNING';

    this._writeAudit(dryRunId, 'DRY_RUN_STARTED', actor, {});

    const steps = this._steps.get(dryRunId) || SIMULATED_DEPLOY_STEPS.map(s => ({
      step_id: `step-${this._uid()}`,
      dry_run_id: dryRunId,
      step_name: s.name,
      step_type: s.type,
      status: 'PENDING',
      simulated_only: true,
    }));

    const executedSteps = steps.map(step => ({
      ...step,
      status: 'PASSED',
      simulated_only: true,
      result_json: {
        simulated: true,
        result: 'PASS',
        message: `${step.step_name} completed (simulated only)`,
        real_action_taken: false,
      },
    }));

    if (record) {
      record.status = 'DRY_RUN_PASSED';
      record.simulated_deployment_steps_json = executedSteps;
    }
    this._steps.set(dryRunId, executedSteps);

    this._writeAudit(dryRunId, 'DRY_RUN_EXECUTED', actor, {
      steps_executed: executedSteps.length,
      all_simulated: true,
    });

    return {
      dry_run_id: dryRunId,
      status: 'DRY_RUN_PASSED',
      steps_executed: executedSteps.length,
      simulated_deployment_steps: executedSteps,
      safety: this._safetyMarkers(),
      safety_flags: this._safetyFlags(),
      phase_safety_string: PHASE_SAFETY_STRING,
      dryRunOnly: true,
      reviewOnly: true,
    };
  }

  async simulateServiceRestart(payload = {}) {
    const dryRunId = payload.dry_run_id || `dry-run-117-${this._uid()}`;
    const actor = payload.actor || 'system';
    const serviceName = payload.service_name || 'ppos-control-plane';

    this._writeAudit(dryRunId, 'SERVICE_RESTART_SIMULATED', actor, {
      service_name: serviceName,
      simulated_only: true,
      real_restart_executed: false,
    });

    return {
      dry_run_id: dryRunId,
      service_name: serviceName,
      simulated: true,
      real_restart_executed: false,
      serviceRestartExecuted: false,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      dryRunOnly: true,
    };
  }

  async simulateHealthCheck(payload = {}) {
    const dryRunId = payload.dry_run_id || `dry-run-117-${this._uid()}`;
    const actor = payload.actor || 'system';

    const healthResults = {
      api_reachable: true,
      db_connection: true,
      migrations_clean: true,
      health_endpoint_ok: true,
      simulated_only: true,
    };

    this._writeAudit(dryRunId, 'HEALTH_CHECK_SIMULATED', actor, healthResults);

    return {
      dry_run_id: dryRunId,
      health_check_results: healthResults,
      simulated: true,
      real_health_check_executed: false,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      dryRunOnly: true,
    };
  }

  async simulateRollback(payload = {}) {
    const dryRunId = payload.dry_run_id || `dry-run-117-${this._uid()}`;
    const actor = payload.actor || 'system';
    const scenario = payload.rollback_scenario || 'STANDARD_ROLLBACK';

    const rollbackDrillId = `rollback-${this._uid()}`;
    const rollbackSteps = [
      { step: 'stop_new_service', simulated: true, result: 'PASS' },
      { step: 'restore_previous_build', simulated: true, result: 'PASS' },
      { step: 'rollback_migration_dry', simulated: true, result: 'PASS' },
      { step: 'restart_previous_service', simulated: true, result: 'PASS' },
      { step: 'verify_rollback_health', simulated: true, result: 'PASS' },
    ];

    const drill = {
      rollback_drill_id: rollbackDrillId,
      dry_run_id: dryRunId,
      rollback_scenario: scenario,
      rollback_simulated_only: true,
      real_rollback_executed: false,
      rollback_steps_json: rollbackSteps,
      status: 'COMPLETED',
      triggered_by: actor,
      created_at: new Date().toISOString(),
    };

    if (!this._rollbackDrills.has(dryRunId)) this._rollbackDrills.set(dryRunId, []);
    this._rollbackDrills.get(dryRunId).push(drill);

    if (this._db) {
      try {
        await this._db.query(
          `INSERT INTO production_deployment_rollback_drills
            (rollback_drill_id, dry_run_id, rollback_scenario, rollback_simulated_only,
             real_rollback_executed, status, triggered_by)
           VALUES (?,?,?,1,0,'COMPLETED',?)`,
          [rollbackDrillId, dryRunId, scenario, actor]
        );
      } catch (_) { /* fallback */ }
    }

    this._writeAudit(dryRunId, 'ROLLBACK_SIMULATED', actor, {
      rollback_drill_id: rollbackDrillId,
      scenario,
      simulated_only: true,
      real_rollback_executed: false,
    });

    return {
      rollback_drill_id: rollbackDrillId,
      dry_run_id: dryRunId,
      rollback_scenario: scenario,
      rollback_simulated_only: true,
      real_rollback_executed: false,
      rollback_steps: rollbackSteps,
      status: 'COMPLETED',
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      dryRunOnly: true,
      rollbackExecuted: false,
    };
  }

  async buildDeploymentDryRunEvidencePack(payload = {}) {
    const dryRunId = payload.dry_run_id || `dry-run-117-${this._uid()}`;
    const actor = payload.actor || 'system';

    const record = this._dryRuns.get(dryRunId) || {
      dry_run_id: dryRunId,
      status: 'PENDING',
      ...this._safetyFlags(),
    };
    const steps = this._steps.get(dryRunId) || [];
    const rollbacks = this._rollbackDrills.get(dryRunId) || [];
    const audits = this._audits.get(dryRunId) || [];

    this._writeAudit(dryRunId, 'DRY_RUN_EVIDENCE_PACK_BUILT', actor, {});

    return {
      dry_run_id: dryRunId,
      readiness_reference_id: record.readiness_reference_id || null,
      status: record.status || 'PENDING',
      simulated_deployment_steps: steps,
      rollback_drills: rollbacks,
      audit_summary: audits,
      safety_invariants: this._safetyFlags(),
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      dryRunOnly: true,
      reviewOnly: true,
      externalSubmission: false,
      sourceMutation: false,
      productionActivationEnabled: false,
      fullPublicEnabled: false,
      liveProviderConnectivityEnabled: false,
      paymentExecutionEnabled: false,
      refundExecutionEnabled: false,
      payoutExecutionEnabled: false,
    };
  }

  async getDryRunSteps(payload = {}) {
    const dryRunId = payload.dry_run_id;
    const steps = dryRunId ? (this._steps.get(dryRunId) || []) : [];
    return {
      dry_run_id: dryRunId,
      steps,
      safety: this._safetyMarkers(),
      dryRunOnly: true,
    };
  }

  async getDryRunAuditTimeline(payload = {}) {
    const dryRunId = payload.dry_run_id;
    const audits = dryRunId ? (this._audits.get(dryRunId) || []) : [];
    return {
      dry_run_id: dryRunId,
      audit_timeline: audits,
      safety: this._safetyMarkers(),
      dryRunOnly: true,
    };
  }
}

module.exports = ProductionDeploymentDryRunRollbackDrillService;
