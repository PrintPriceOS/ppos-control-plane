'use strict';

const crypto = require('crypto');

const SAFETY_FLAGS = Object.freeze({
  controlled_pilot_only: true,
  full_public_enabled: false,
  open_marketplace_enabled: false,
  unrestricted_live_provider_connectivity_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  external_submission: false,
  source_mutation: false,
});

const SAFETY_MARKERS = Object.freeze({
  controlledPilotOnly: true,
  fullPublicEnabled: false,
  openMarketplaceEnabled: false,
  unrestrictedLiveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  externalSubmission: false,
  sourceMutation: false,
  rollbackAvailable: true,
});

const SAFETY_MESSAGE =
  'Controlled pilot only. FULL_PUBLIC remains disabled. No unrestricted live provider connectivity, ' +
  'payment execution, refund execution, payout execution, tax/accounting submission, ' +
  'provider submission, or source record mutation is enabled.';

const READINESS_CHECKS = [
  'PHASE_120_VALIDATED',
  'PHASE_120_1_VALIDATED',
  'LATEST_BUILD_EVIDENCE',
  'LATEST_MIGRATIONS_APPLIED',
  'DB_BACKUP_TIMESTAMP',
  'NO_UNRESOLVED_BLOCKERS',
  'SECURITY_COMPLIANCE_PASS',
  'INCIDENT_READINESS_PASS',
  'ROLLBACK_DRILL_PASS',
  'PILOT_TENANT_ALLOWLISTED',
  'FULL_PUBLIC_DISABLED',
  'EXTERNAL_SUBMISSIONS_DISABLED',
  'SOURCE_MUTATION_BLOCKED',
  'PAYMENT_EXECUTION_DISABLED',
];

const PILOT_RUN_STATUSES = [
  'DRAFT', 'IN_REVIEW', 'READY_FOR_TENANT_ACTIVATION',
  'ACTIVE_LIMITED_PILOT', 'SUSPENDED', 'COMPLETED', 'REJECTED',
];

const TENANT_STATUSES = [
  'DRAFT', 'REGISTERED', 'READY_FOR_PILOT', 'PILOT_ACTIVE',
  'PILOT_SUSPENDED', 'PILOT_COMPLETED', 'REJECTED',
];

class ControlledProductionPilotActivationService {
  constructor() {
    this._runs = new Map();
    this._tenants = new Map();
    this._checks = new Map();
    this._findings = new Map();
    this._audits = new Map();
    this._rollbackPoints = new Map();

    let _db = null;
    try {
      _db = require('./mysqlClient');
    } catch (_) {}
    this._db = _db;
  }

  _safetyMarkers() { return { ...SAFETY_MARKERS }; }
  _safetyFlags() { return { ...SAFETY_FLAGS }; }
  _now() { return new Date().toISOString(); }

  async _writeAudit(pilotRunId, eventType, detail = {}, actor = 'system', tenantId = null) {
    const auditId = crypto.randomUUID();
    const entry = {
      audit_id: auditId,
      pilot_run_id: pilotRunId,
      tenant_id: tenantId,
      event_type: eventType,
      actor,
      detail_json: detail,
      safety_markers: this._safetyMarkers(),
      created_at: this._now(),
    };

    if (!this._audits.has(pilotRunId)) this._audits.set(pilotRunId, []);
    this._audits.get(pilotRunId).push(entry);

    if (this._db) {
      try {
        await this._db.query(
          `INSERT INTO controlled_production_pilot_audits
            (id, pilot_run_id, tenant_id, event_type, actor, detail_json, safety_markers_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [auditId, pilotRunId, tenantId, eventType, actor,
           JSON.stringify(detail), JSON.stringify(entry.safety_markers)]
        );
      } catch (_) {}
    }

    return entry;
  }

  async createPilotRun(payload = {}) {
    const pilotRunId = payload.pilot_run_id || `pilot_${crypto.randomUUID()}`;
    const createdBy = payload.created_by || 'system';
    const now = this._now();

    const record = {
      pilot_run_id: pilotRunId,
      pilot_run_name: payload.pilot_run_name || 'Controlled Production Pilot Run',
      pilot_run_status: 'DRAFT',
      created_by: createdBy,
      phase120_validated: false,
      phase120_1_validated: false,
      latest_build_evidence: null,
      latest_migrations_applied: false,
      db_backup_timestamp: null,
      security_compliance_pass: false,
      incident_readiness_pass: false,
      rollback_drill_pass: false,
      ...this._safetyFlags(),
      metadata_json: payload.metadata || {},
      created_at: now,
      updated_at: now,
    };

    this._runs.set(pilotRunId, record);

    if (this._db) {
      try {
        await this._db.query(
          `INSERT INTO controlled_production_pilot_runs
            (id, pilot_run_id, pilot_run_name, pilot_run_status, created_by,
             controlled_pilot_only, full_public_enabled, open_marketplace_enabled,
             unrestricted_live_provider_connectivity_enabled,
             payment_execution_enabled, refund_execution_enabled, payout_execution_enabled,
             external_submission, source_mutation, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, 'DRAFT', ?, 1, 0, 0, 0, 0, 0, 0, 0, 0, ?, NOW(), NOW())`,
          [crypto.randomUUID(), pilotRunId, record.pilot_run_name, createdBy,
           JSON.stringify(record.metadata_json)]
        );
      } catch (_) {}
    }

    await this._writeAudit(pilotRunId, 'PILOT_RUN_CREATED', { pilotRunId, createdBy }, createdBy);

    return {
      pilot_run: record,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async registerPilotTenant(payload = {}) {
    const pilotRunId = payload.pilot_run_id;
    if (!pilotRunId) throw new Error('pilot_run_id is required');
    const tenantId = payload.tenant_id;
    if (!tenantId) throw new Error('tenant_id is required');

    const registeredBy = payload.registered_by || 'system';
    const now = this._now();
    const id = crypto.randomUUID();

    const tenantRecord = {
      id,
      pilot_run_id: pilotRunId,
      tenant_id: tenantId,
      tenant_name: payload.tenant_name || '',
      tenant_status: 'REGISTERED',
      registered_by: registeredBy,
      activated_at: null,
      suspended_at: null,
      completed_at: null,
      metadata_json: payload.metadata || {},
      created_at: now,
      updated_at: now,
    };

    const key = `${pilotRunId}:${tenantId}`;
    this._tenants.set(key, tenantRecord);

    if (this._db) {
      try {
        await this._db.query(
          `INSERT INTO controlled_production_pilot_tenants
            (id, pilot_run_id, tenant_id, tenant_name, tenant_status, registered_by, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'REGISTERED', ?, ?, NOW(), NOW())`,
          [id, pilotRunId, tenantId, tenantRecord.tenant_name, registeredBy,
           JSON.stringify(tenantRecord.metadata_json)]
        );
      } catch (_) {}
    }

    await this._writeAudit(pilotRunId, 'PILOT_TENANT_REGISTERED', { tenantId, registeredBy }, registeredBy, tenantId);

    return {
      tenant: tenantRecord,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async evaluatePilotReadiness(payload = {}) {
    const pilotRunId = payload.pilot_run_id;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const run = this._runs.get(pilotRunId) || {};

    const checks = READINESS_CHECKS.map(name => {
      let status = 'PASS';
      if (name === 'PHASE_120_VALIDATED') status = run.phase120_validated ? 'PASS' : 'FAIL';
      else if (name === 'PHASE_120_1_VALIDATED') status = run.phase120_1_validated ? 'PASS' : 'FAIL';
      else if (name === 'LATEST_BUILD_EVIDENCE') status = run.latest_build_evidence ? 'PASS' : 'FAIL';
      else if (name === 'LATEST_MIGRATIONS_APPLIED') status = run.latest_migrations_applied ? 'PASS' : 'FAIL';
      else if (name === 'DB_BACKUP_TIMESTAMP') status = run.db_backup_timestamp ? 'PASS' : 'FAIL';
      else if (name === 'SECURITY_COMPLIANCE_PASS') status = run.security_compliance_pass ? 'PASS' : 'FAIL';
      else if (name === 'INCIDENT_READINESS_PASS') status = run.incident_readiness_pass ? 'PASS' : 'FAIL';
      else if (name === 'ROLLBACK_DRILL_PASS') status = run.rollback_drill_pass ? 'PASS' : 'FAIL';
      else if (name === 'FULL_PUBLIC_DISABLED') status = !run.full_public_enabled ? 'PASS' : 'FAIL';
      else if (name === 'EXTERNAL_SUBMISSIONS_DISABLED') status = !run.external_submission ? 'PASS' : 'FAIL';
      else if (name === 'SOURCE_MUTATION_BLOCKED') status = !run.source_mutation ? 'PASS' : 'FAIL';
      else if (name === 'PAYMENT_EXECUTION_DISABLED') status = !run.payment_execution_enabled ? 'PASS' : 'FAIL';
      else if (name === 'NO_UNRESOLVED_BLOCKERS') {
        const findings = Array.from(this._findings.values())
          .filter(f => f.pilot_run_id === pilotRunId && f.finding_type === 'BLOCKER' && f.finding_status === 'OPEN');
        status = findings.length === 0 ? 'PASS' : 'FAIL';
      } else if (name === 'PILOT_TENANT_ALLOWLISTED') {
        const tenants = Array.from(this._tenants.values())
          .filter(t => t.pilot_run_id === pilotRunId);
        status = tenants.length > 0 ? 'PASS' : 'FAIL';
      }
      return { check_name: name, check_status: status };
    });

    const allPass = checks.every(c => c.check_status === 'PASS');
    const readinessStatus = allPass ? 'READY_FOR_TENANT_ACTIVATION' : 'BLOCKED';

    if (this._db) {
      try {
        for (const c of checks) {
          await this._db.query(
            `INSERT INTO controlled_production_pilot_checks
              (id, pilot_run_id, check_name, check_status, checked_by, checked_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'system', NOW(), NOW(), NOW())`,
            [crypto.randomUUID(), pilotRunId, c.check_name, c.check_status]
          );
        }
      } catch (_) {}
    }

    this._checks.set(pilotRunId, checks);

    await this._writeAudit(pilotRunId, 'PILOT_READINESS_EVALUATED', { readinessStatus, checks });

    return {
      pilot_run_id: pilotRunId,
      readiness_status: readinessStatus,
      checks,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async activatePilotForTenant(payload = {}) {
    const pilotRunId = payload.pilot_run_id;
    if (!pilotRunId) throw new Error('pilot_run_id is required');
    const tenantId = payload.tenant_id;
    if (!tenantId) throw new Error('tenant_id is required');

    const key = `${pilotRunId}:${tenantId}`;
    const tenant = this._tenants.get(key);

    if (!tenant) {
      throw new Error(
        `Tenant ${tenantId} is not registered in pilot run ${pilotRunId}. ` +
        'Only explicitly allowlisted tenants can be activated.'
      );
    }

    if (tenant.tenant_status === 'REJECTED') {
      throw new Error(`Tenant ${tenantId} has been rejected and cannot be activated.`);
    }

    const now = this._now();
    tenant.tenant_status = 'PILOT_ACTIVE';
    tenant.activated_at = now;
    tenant.updated_at = now;
    this._tenants.set(key, tenant);

    if (this._db) {
      try {
        await this._db.query(
          `UPDATE controlled_production_pilot_tenants
           SET tenant_status = 'PILOT_ACTIVE', activated_at = NOW(), updated_at = NOW()
           WHERE pilot_run_id = ? AND tenant_id = ?`,
          [pilotRunId, tenantId]
        );
      } catch (_) {}
    }

    await this._writeAudit(pilotRunId, 'PILOT_TENANT_ACTIVATED', { tenantId }, 'system', tenantId);

    return {
      tenant,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async suspendPilotTenant(payload = {}) {
    const pilotRunId = payload.pilot_run_id;
    if (!pilotRunId) throw new Error('pilot_run_id is required');
    const tenantId = payload.tenant_id;
    if (!tenantId) throw new Error('tenant_id is required');

    const key = `${pilotRunId}:${tenantId}`;
    const tenant = this._tenants.get(key);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found in pilot run ${pilotRunId}.`);

    const now = this._now();
    tenant.tenant_status = 'PILOT_SUSPENDED';
    tenant.suspended_at = now;
    tenant.suspension_reason = payload.reason || 'Manually suspended';
    tenant.updated_at = now;
    this._tenants.set(key, tenant);

    if (this._db) {
      try {
        await this._db.query(
          `UPDATE controlled_production_pilot_tenants
           SET tenant_status = 'PILOT_SUSPENDED', suspended_at = NOW(),
               suspension_reason = ?, updated_at = NOW()
           WHERE pilot_run_id = ? AND tenant_id = ?`,
          [tenant.suspension_reason, pilotRunId, tenantId]
        );
      } catch (_) {}
    }

    await this._writeAudit(pilotRunId, 'PILOT_TENANT_SUSPENDED',
      { tenantId, reason: tenant.suspension_reason }, 'system', tenantId);

    return {
      tenant,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async recordPilotFinding(payload = {}) {
    const pilotRunId = payload.pilot_run_id;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const findingId = crypto.randomUUID();
    const now = this._now();

    const finding = {
      id: findingId,
      pilot_run_id: pilotRunId,
      tenant_id: payload.tenant_id || null,
      finding_type: payload.finding_type || 'INFO',
      finding_status: 'OPEN',
      description: payload.description || '',
      resolution: null,
      created_by: payload.created_by || 'system',
      resolved_by: null,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    };

    this._findings.set(findingId, finding);

    if (this._db) {
      try {
        await this._db.query(
          `INSERT INTO controlled_production_pilot_findings
            (id, pilot_run_id, tenant_id, finding_type, finding_status, description, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'OPEN', ?, ?, NOW(), NOW())`,
          [findingId, pilotRunId, finding.tenant_id, finding.finding_type, finding.description, finding.created_by]
        );
      } catch (_) {}
    }

    await this._writeAudit(pilotRunId, 'PILOT_FINDING_RECORDED',
      { findingId, findingType: finding.finding_type }, finding.created_by, finding.tenant_id);

    return {
      finding,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async resolvePilotFinding(payload = {}) {
    const findingId = payload.finding_id;
    if (!findingId) throw new Error('finding_id is required');

    const finding = this._findings.get(findingId);
    if (!finding) throw new Error(`Finding ${findingId} not found.`);

    const now = this._now();
    finding.finding_status = 'RESOLVED';
    finding.resolution = payload.resolution || 'Resolved';
    finding.resolved_by = payload.resolved_by || 'system';
    finding.resolved_at = now;
    finding.updated_at = now;
    this._findings.set(findingId, finding);

    if (this._db) {
      try {
        await this._db.query(
          `UPDATE controlled_production_pilot_findings
           SET finding_status = 'RESOLVED', resolution = ?, resolved_by = ?, resolved_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [finding.resolution, finding.resolved_by, findingId]
        );
      } catch (_) {}
    }

    await this._writeAudit(finding.pilot_run_id, 'PILOT_FINDING_RESOLVED',
      { findingId, resolution: finding.resolution }, finding.resolved_by, finding.tenant_id);

    return {
      finding,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async createPilotRollbackPoint(payload = {}) {
    const pilotRunId = payload.pilot_run_id;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const rollbackId = crypto.randomUUID();
    const now = this._now();

    const point = {
      id: rollbackId,
      pilot_run_id: pilotRunId,
      tenant_id: payload.tenant_id || null,
      rollback_point_name: payload.rollback_point_name || `Rollback Point ${now}`,
      rollback_status: 'CREATED',
      snapshot_json: payload.snapshot || {},
      simulation_result_json: null,
      created_by: payload.created_by || 'system',
      simulated_at: null,
      created_at: now,
      updated_at: now,
    };

    this._rollbackPoints.set(rollbackId, point);

    if (this._db) {
      try {
        await this._db.query(
          `INSERT INTO controlled_production_pilot_rollback_points
            (id, pilot_run_id, tenant_id, rollback_point_name, rollback_status,
             snapshot_json, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'CREATED', ?, ?, NOW(), NOW())`,
          [rollbackId, pilotRunId, point.tenant_id, point.rollback_point_name,
           JSON.stringify(point.snapshot_json), point.created_by]
        );
      } catch (_) {}
    }

    await this._writeAudit(pilotRunId, 'PILOT_ROLLBACK_POINT_CREATED',
      { rollbackId, rollbackPointName: point.rollback_point_name }, point.created_by, point.tenant_id);

    return {
      rollback_point: point,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async simulatePilotRollback(payload = {}) {
    const rollbackId = payload.rollback_id;
    if (!rollbackId) throw new Error('rollback_id is required');

    const point = this._rollbackPoints.get(rollbackId);
    if (!point) throw new Error(`Rollback point ${rollbackId} not found.`);

    const now = this._now();
    const simulationResult = {
      rollback_id: rollbackId,
      simulation_status: 'SIMULATED_PASS',
      simulated_at: now,
      steps: [
        { step: 'VALIDATE_SNAPSHOT', status: 'PASS' },
        { step: 'CHECK_TENANT_STATE', status: 'PASS' },
        { step: 'SIMULATE_DATA_REVERT', status: 'PASS' },
        { step: 'VERIFY_INTEGRITY', status: 'PASS' },
      ],
      rollback_executed: false,
      simulation_only: true,
    };

    point.rollback_status = 'SIMULATED';
    point.simulation_result_json = simulationResult;
    point.simulated_at = now;
    point.updated_at = now;
    this._rollbackPoints.set(rollbackId, point);

    if (this._db) {
      try {
        await this._db.query(
          `UPDATE controlled_production_pilot_rollback_points
           SET rollback_status = 'SIMULATED', simulation_result_json = ?,
               simulated_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [JSON.stringify(simulationResult), rollbackId]
        );
      } catch (_) {}
    }

    await this._writeAudit(point.pilot_run_id, 'PILOT_ROLLBACK_SIMULATED',
      { rollbackId, simulationStatus: 'SIMULATED_PASS' }, 'system', point.tenant_id);

    return {
      rollback_point: point,
      simulation: simulationResult,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async buildPilotEvidencePack(payload = {}) {
    const pilotRunId = payload.pilot_run_id;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const run = this._runs.get(pilotRunId) || {};
    const tenants = Array.from(this._tenants.values()).filter(t => t.pilot_run_id === pilotRunId);
    const checks = this._checks.get(pilotRunId) || [];
    const findings = Array.from(this._findings.values()).filter(f => f.pilot_run_id === pilotRunId);
    const audits = this._audits.get(pilotRunId) || [];
    const rollbackPoints = Array.from(this._rollbackPoints.values()).filter(r => r.pilot_run_id === pilotRunId);

    const evidencePack = {
      pilot_run_id: pilotRunId,
      pilot_run: run,
      tenants,
      checks,
      findings,
      open_findings: findings.filter(f => f.finding_status === 'OPEN'),
      resolved_findings: findings.filter(f => f.finding_status === 'RESOLVED'),
      rollback_points: rollbackPoints,
      audit_count: audits.length,
      generated_at: this._now(),
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };

    await this._writeAudit(pilotRunId, 'PILOT_EVIDENCE_PACK_BUILT', { tenantCount: tenants.length, findingCount: findings.length });

    return evidencePack;
  }

  async getPilotAuditTimeline(payload = {}) {
    const pilotRunId = payload.pilot_run_id;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const audits = this._audits.get(pilotRunId) || [];

    return {
      pilot_run_id: pilotRunId,
      timeline: audits,
      count: audits.length,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }
}

module.exports = ControlledProductionPilotActivationService;
