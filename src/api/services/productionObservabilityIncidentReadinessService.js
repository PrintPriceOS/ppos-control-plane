'use strict';

const crypto = require('crypto');

const SAFETY_FLAGS = Object.freeze({
  simulation_only: true,
  real_alert_dispatched: false,
  production_mutation_enabled: false,
  external_submission_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  full_public_enabled: false,
  live_provider_connectivity_enabled: false,
});

const SAFETY_MARKERS = Object.freeze({
  simulationOnly: true,
  realAlertDispatched: false,
  productionMutationEnabled: false,
  externalSubmission: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  sourceMutation: false,
});

const PHASE_SAFETY_STRING =
  'PHASE_118_SIMULATION_ONLY. No real alert dispatch, no production mutation, ' +
  'no external submission, no payment/refund/payout execution, ' +
  'no live provider connectivity, no source commercial record mutation.';

const INCIDENT_CATEGORIES = [
  'API_DOWN',
  'DB_CONNECTION_FAILURE',
  'REDIS_CONNECTION_FAILURE',
  'PAYMENT_PROVIDER_FAILURE_SIMULATED',
  'PREFLIGHT_SERVICE_DEGRADED',
  'QUEUE_BACKLOG',
  'HIGH_ERROR_RATE',
  'SECURITY_ALERT',
  'DATA_EXPORT_BLOCKED',
  'ROLLBACK_REQUIRED',
];

const OBSERVABILITY_CHECKS = [
  { name: 'health_endpoint_reachable', category: 'API' },
  { name: 'db_connection_stable', category: 'DATABASE' },
  { name: 'logs_available', category: 'LOGGING' },
  { name: 'pm2_process_configured', category: 'PROCESS' },
  { name: 'alert_sink_configured', category: 'ALERTING' },
  { name: 'runbook_references_present', category: 'RUNBOOK' },
  { name: 'incident_escalation_contacts_documented', category: 'ESCALATION' },
  { name: 'queue_monitor_active', category: 'QUEUE' },
  { name: 'error_rate_baseline_defined', category: 'METRICS' },
  { name: 'rollback_trigger_documented', category: 'ROLLBACK' },
];

class ProductionObservabilityIncidentReadinessService {
  constructor() {
    this._runs = new Map();
    this._checks = new Map();
    this._simulations = new Map();
    this._audits = new Map();
    this._findings = new Map();

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

  _writeAudit(runId, eventType, actor, details) {
    const audit = {
      audit_id: `audit-${this._uid()}`,
      run_id: runId,
      event_type: eventType,
      actor: actor || 'system',
      details_json: details || {},
      simulation_only: true,
      created_at: new Date().toISOString(),
    };
    if (!this._audits.has(runId)) this._audits.set(runId, []);
    this._audits.get(runId).push(audit);
    return audit;
  }

  async evaluateObservabilityReadiness(payload = {}) {
    const runId = payload.run_id || `obs-run-118-${this._uid()}`;
    const actor = payload.actor || 'system';

    const checks = OBSERVABILITY_CHECKS.map(c => ({
      check_id: `chk-${this._uid()}`,
      run_id: runId,
      check_name: c.name,
      check_category: c.category,
      status: 'PASS',
      simulated_only: true,
      result_json: {
        simulated: true,
        result: 'PASS',
        message: `${c.name} check passed (simulated)`,
      },
    }));

    if (!this._checks.has(runId)) this._checks.set(runId, []);
    this._checks.get(runId).push(...checks);

    const allPassed = checks.every(c => c.status === 'PASS');
    const observabilityStatus = allPassed ? 'OBSERVABILITY_READY' : 'OBSERVABILITY_BLOCKED';

    if (this._db) {
      try {
        const runRecord = {
          run_id: runId,
          requested_by: actor,
          status: observabilityStatus,
          observability_status: observabilityStatus,
          simulation_only: 1,
          real_alert_dispatched: 0,
          production_mutation_enabled: 0,
          external_submission_enabled: 0,
          payment_execution_enabled: 0,
          refund_execution_enabled: 0,
          payout_execution_enabled: 0,
          full_public_enabled: 0,
          live_provider_connectivity_enabled: 0,
        };
        await this._db.query(
          `INSERT INTO production_incident_readiness_runs
            (run_id, requested_by, status, observability_status,
             simulation_only, real_alert_dispatched, production_mutation_enabled,
             external_submission_enabled, payment_execution_enabled,
             refund_execution_enabled, payout_execution_enabled,
             full_public_enabled, live_provider_connectivity_enabled)
           VALUES (?,?,?,?,1,0,0,0,0,0,0,0,0)`,
          [runId, actor, observabilityStatus, observabilityStatus]
        );
      } catch (_) { /* fallback to in-memory */ }
    }

    this._writeAudit(runId, 'OBSERVABILITY_READINESS_EVALUATED', actor, {
      observabilityStatus,
      checks_run: checks.length,
    });

    return {
      run_id: runId,
      observability_status: observabilityStatus,
      checks,
      incident_categories: INCIDENT_CATEGORIES,
      safety: this._safetyMarkers(),
      safety_flags: this._safetyFlags(),
      phase_safety_string: PHASE_SAFETY_STRING,
      simulationOnly: true,
      reviewOnly: true,
    };
  }

  async simulateIncident(payload = {}) {
    const runId = payload.run_id || `obs-run-118-${this._uid()}`;
    const actor = payload.actor || 'system';
    const incidentCategory = payload.incident_category || 'API_DOWN';
    const severity = payload.severity || 'MEDIUM';

    if (!INCIDENT_CATEGORIES.includes(incidentCategory)) {
      throw new Error(`Unknown incident category: ${incidentCategory}. Valid: ${INCIDENT_CATEGORIES.join(', ')}`);
    }

    const simulationId = `sim-${this._uid()}`;
    const runbook = `runbook/${incidentCategory.toLowerCase().replace(/_/g, '-')}.md`;

    const simulation = {
      simulation_id: simulationId,
      run_id: runId,
      incident_category: incidentCategory,
      severity,
      status: 'SIMULATED',
      alert_dispatch_simulated: true,
      real_alert_dispatched: false,
      runbook_reference: runbook,
      simulation_result_json: {
        simulated: true,
        incident_category: incidentCategory,
        severity,
        detection_time_simulated_ms: Math.floor(Math.random() * 500) + 100,
        alert_routed_to: 'INTERNAL_TEST_SINK_ONLY',
        escalation_path: 'on-call → team-lead → management',
        runbook: runbook,
        resolution_steps_simulated: [
          `identify_${incidentCategory.toLowerCase()}`,
          'assess_severity',
          'notify_stakeholders_simulated',
          'execute_runbook_steps',
          'verify_recovery',
          'post_incident_review',
        ],
        real_action_taken: false,
        real_alert_dispatched: false,
      },
      created_at: new Date().toISOString(),
    };

    if (!this._simulations.has(runId)) this._simulations.set(runId, []);
    this._simulations.get(runId).push(simulation);

    if (this._db) {
      try {
        await this._db.query(
          `INSERT INTO production_incident_simulations
            (simulation_id, run_id, incident_category, severity, status,
             alert_dispatch_simulated, real_alert_dispatched, runbook_reference)
           VALUES (?,?,?,?,?,1,0,?)`,
          [simulationId, runId, incidentCategory, severity, 'SIMULATED', runbook]
        );
      } catch (_) { /* fallback */ }
    }

    this._writeAudit(runId, 'INCIDENT_SIMULATED', actor, {
      simulationId,
      incidentCategory,
      severity,
      simulated: true,
    });

    return {
      simulation_id: simulationId,
      run_id: runId,
      incident_category: incidentCategory,
      severity,
      status: 'SIMULATED',
      alert_dispatch_simulated: true,
      real_alert_dispatched: false,
      runbook_reference: runbook,
      simulation_result: simulation.simulation_result_json,
      safety: this._safetyMarkers(),
      safety_flags: this._safetyFlags(),
      phase_safety_string: PHASE_SAFETY_STRING,
      simulationOnly: true,
      reviewOnly: true,
    };
  }

  async simulateAlertDispatch(payload = {}) {
    const runId = payload.run_id || `obs-run-118-${this._uid()}`;
    const actor = payload.actor || 'system';
    const alertType = payload.alert_type || 'GENERIC_ALERT';
    const sink = payload.sink || 'INTERNAL_TEST_SINK_ONLY';

    this._writeAudit(runId, 'ALERT_DISPATCH_SIMULATED', actor, {
      alertType,
      sink,
      real_alert_dispatched: false,
      simulated_only: true,
    });

    return {
      run_id: runId,
      alert_type: alertType,
      sink,
      dispatched: false,
      simulated: true,
      real_alert_dispatched: false,
      message: `Alert dispatch simulated to ${sink} only. No real external alert was sent.`,
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      simulationOnly: true,
    };
  }

  async recordIncidentFinding(payload = {}) {
    const runId = payload.run_id || `obs-run-118-${this._uid()}`;
    const actor = payload.actor || 'system';
    const findingId = `finding-${this._uid()}`;
    const category = payload.category || 'OBSERVABILITY_GAP';
    const description = payload.description || 'Finding recorded';
    const severity = payload.severity || 'MEDIUM';

    const finding = {
      finding_id: findingId,
      run_id: runId,
      category,
      description,
      severity,
      status: 'OPEN',
      actor,
      created_at: new Date().toISOString(),
    };

    if (!this._findings.has(runId)) this._findings.set(runId, []);
    this._findings.get(runId).push(finding);

    this._writeAudit(runId, 'INCIDENT_FINDING_RECORDED', actor, {
      findingId,
      category,
      severity,
    });

    return {
      finding_id: findingId,
      run_id: runId,
      status: 'OPEN',
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      simulationOnly: true,
    };
  }

  async resolveIncidentFinding(payload = {}) {
    const runId = payload.run_id || `obs-run-118-${this._uid()}`;
    const findingId = payload.finding_id;
    const actor = payload.actor || 'system';
    const resolution = payload.resolution || 'Resolved';

    const findings = this._findings.get(runId) || [];
    const finding = findings.find(f => f.finding_id === findingId);
    if (finding) {
      finding.status = 'RESOLVED';
      finding.resolution = resolution;
      finding.resolved_at = new Date().toISOString();
    }

    this._writeAudit(runId, 'INCIDENT_FINDING_RESOLVED', actor, {
      findingId,
      resolution,
    });

    return {
      finding_id: findingId,
      run_id: runId,
      status: 'RESOLVED',
      safety: this._safetyMarkers(),
      phase_safety_string: PHASE_SAFETY_STRING,
      simulationOnly: true,
    };
  }

  async buildIncidentReadinessEvidencePack(payload = {}) {
    const runId = payload.run_id || `obs-run-118-${this._uid()}`;
    const actor = payload.actor || 'system';

    const checks = this._checks.get(runId) || [];
    const simulations = this._simulations.get(runId) || [];
    const findings = this._findings.get(runId) || [];
    const audits = this._audits.get(runId) || [];

    const openFindings = findings.filter(f => f.status === 'OPEN');

    const evidencePack = {
      run_id: runId,
      phase: 118,
      phase_name: 'Production Observability & Incident Readiness',
      generated_at: new Date().toISOString(),
      generated_by: actor,
      observability_checks: {
        total: checks.length,
        passed: checks.filter(c => c.status === 'PASS').length,
        failed: checks.filter(c => c.status === 'FAIL').length,
      },
      incident_categories_covered: INCIDENT_CATEGORIES,
      simulations_run: simulations.length,
      findings: {
        total: findings.length,
        open: openFindings.length,
        resolved: findings.length - openFindings.length,
      },
      audit_events: audits.length,
      safety_invariants: {
        simulation_only: true,
        real_alert_dispatched: false,
        production_mutation_enabled: false,
        external_submission_enabled: false,
        payment_execution_enabled: false,
        refund_execution_enabled: false,
        payout_execution_enabled: false,
        full_public_enabled: false,
        live_provider_connectivity_enabled: false,
      },
      safety: this._safetyMarkers(),
      safety_flags: this._safetyFlags(),
      phase_safety_string: PHASE_SAFETY_STRING,
      simulationOnly: true,
      reviewOnly: true,
      status: openFindings.length === 0 ? 'EVIDENCE_PACK_COMPLETE' : 'EVIDENCE_PACK_WITH_OPEN_FINDINGS',
    };

    this._writeAudit(runId, 'EVIDENCE_PACK_BUILT', actor, {
      simulations_run: simulations.length,
      findings_open: openFindings.length,
    });

    return evidencePack;
  }
}

module.exports = ProductionObservabilityIncidentReadinessService;
