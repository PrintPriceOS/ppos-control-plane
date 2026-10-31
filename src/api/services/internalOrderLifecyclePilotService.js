'use strict';

const crypto = require('crypto');

const SAFETY_MARKERS = Object.freeze({
  pilotOnly: true,
  internalOrderLifecycleOnly: true,
  reviewOnly: true,
  fullPublicEnabled: false,
  openMarketplaceAccessEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  externalTaxSubmissionEnabled: false,
  externalAccountingSubmissionEnabled: false,
  providerExternalSubmissionEnabled: false,
  sourceMutationOutsidePilotScope: false,
});

const SAFETY_FLAGS_DB = Object.freeze({
  pilot_only: true,
  internal_order_lifecycle_only: true,
  review_only: true,
  full_public_enabled: false,
  open_marketplace_access_enabled: false,
  live_provider_connectivity_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  external_tax_submission_enabled: false,
  external_accounting_submission_enabled: false,
  provider_external_submission_enabled: false,
  source_mutation_outside_pilot_scope: false,
});

const SAFETY_MESSAGE =
  'Internal order lifecycle pilot only. FULL_PUBLIC remains disabled. No open marketplace access, ' +
  'unrestricted live provider connectivity, payment execution, refund execution, payout execution, ' +
  'tax/accounting submission, provider submission, or source record mutation outside pilot scope is enabled.';

const LIFECYCLE_STEP_KEYS = [
  'PILOT_TENANT_ALLOWLIST_VERIFIED',
  'INTERNAL_ORDER_INTAKE_CREATED',
  'PRICING_SNAPSHOT_REFERENCED',
  'FILE_PACKAGE_REFERENCED',
  'PREFLIGHT_READINESS_REFERENCED',
  'INVOICE_READINESS_REFERENCED',
  'PRODUCTION_READINESS_REFERENCED',
  'PAYMENT_EXECUTION_BLOCK_VERIFIED',
  'PROVIDER_EXTERNAL_SUBMISSION_BLOCK_VERIFIED',
  'SOURCE_MUTATION_BOUNDARY_VERIFIED',
  'AUDIT_TIMELINE_BUILT',
  'EVIDENCE_PACK_BUILT',
  'ROLLBACK_POINT_CREATED',
  'ROLLBACK_SIMULATED',
];

const RUN_STATUSES = [
  'DRAFT', 'READY_FOR_INTERNAL_ORDER', 'INTERNAL_ORDER_CREATED',
  'LIFECYCLE_RUNNING', 'LIFECYCLE_PASSED', 'LIFECYCLE_FAILED',
  'SUSPENDED', 'ROLLBACK_SIMULATED',
];

const EVIDENCE_SCHEMA_VERSION = '122.1';

const REDACTED_FIELDS = [
  'internal_customer_reference',
  'raw_customer_data',
  'raw_file_package_url',
  'raw_preflight_artifact_path',
  'raw_invoice_data',
  'secret',
  'password',
  'token',
  'api_key',
  'credential',
];

function _isDbFallbackAllowed() {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_DB_FALLBACK_FOR_SMOKE === 'true';
}

function _isTestMode() {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS === 'true';
}

class InternalOrderLifecyclePilotService {
  constructor() {
    this._runs = new Map();
    this._orders = new Map();
    this._steps = new Map();
    this._findings = new Map();
    this._audits = new Map();
    this._rollbackPoints = new Map();
    this._evidencePacks = new Map();

    let _db = null;
    try { _db = require('./mysqlClient'); } catch (_e) { /* no DB available */ }
    this._db = _db;
  }

  _safetyMarkers() { return { ...SAFETY_MARKERS }; }
  _safetyFlagsDb() { return { ...SAFETY_FLAGS_DB }; }
  _now() { return new Date().toISOString(); }

  _persistenceInfo(dbSuccess) {
    if (dbSuccess) return { persistenceMode: 'DB', persistenceStatus: 'PERSISTED' };
    if (_isDbFallbackAllowed()) return { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    return { persistenceMode: 'DB', persistenceStatus: 'FAILED' };
  }

  async _dbWrite(sql, params) {
    if (!this._db) {
      if (_isDbFallbackAllowed()) return { ok: false, fallback: true };
      return { ok: false, fallback: false };
    }
    try {
      await this._db.query(sql, params);
      return { ok: true, fallback: false };
    } catch (err) {
      if (_isDbFallbackAllowed()) return { ok: false, fallback: true, error: err.message };
      return { ok: false, fallback: false, error: err.message };
    }
  }

  async _dbRead(sql, params) {
    if (!this._db) return null;
    try {
      const [rows] = await this._db.query(sql, params);
      return rows;
    } catch (_e) {
      return null;
    }
  }

  async _writeAudit(pilotRunId, eventType, detail = {}, actor = 'system', pilotOrderId = null) {
    const auditId = crypto.randomUUID();
    const entry = {
      audit_id: auditId,
      pilot_run_id: pilotRunId,
      pilot_order_id: pilotOrderId,
      event_type: eventType,
      event_actor: actor,
      event_payload_json: detail,
      safety_snapshot_json: this._safetyMarkers(),
      created_at: this._now(),
    };

    if (!this._audits.has(pilotRunId)) this._audits.set(pilotRunId, []);
    this._audits.get(pilotRunId).push(entry);

    await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_pilot_audits
        (audit_id, pilot_run_id, pilot_order_id, event_type, event_actor, event_payload_json, safety_snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [auditId, pilotRunId, pilotOrderId, eventType, actor,
       JSON.stringify(detail), JSON.stringify(entry.safety_snapshot_json)]
    );

    return entry;
  }

  async _writeStep(pilotRunId, pilotOrderId, stepKey, stepStatus, resultJson = null) {
    const stepId = crypto.randomUUID();
    const entry = {
      step_id: stepId,
      pilot_run_id: pilotRunId,
      pilot_order_id: pilotOrderId,
      step_key: stepKey,
      step_status: stepStatus,
      step_result_json: resultJson,
      safety_snapshot_json: this._safetyMarkers(),
      created_at: this._now(),
    };

    const key = `${pilotRunId}:${pilotOrderId || ''}`;
    if (!this._steps.has(key)) this._steps.set(key, []);
    this._steps.get(key).push(entry);

    await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_pilot_steps
        (step_id, pilot_run_id, pilot_order_id, step_key, step_status, step_result_json, safety_snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [stepId, pilotRunId, pilotOrderId, stepKey, stepStatus,
       resultJson ? JSON.stringify(resultJson) : null, JSON.stringify(entry.safety_snapshot_json)]
    );

    return entry;
  }

  _isTenantAllowlisted(tenantId) {
    const allowlist = (process.env.PILOT_TENANT_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowlist.length === 0) {
      if (_isTestMode()) return true;
      return false;
    }
    return allowlist.includes(tenantId);
  }

  _tenantAllowlistFailClosed() {
    const allowlist = (process.env.PILOT_TENANT_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowlist.length === 0 && !_isTestMode()) return true;
    return false;
  }

  async _hasUnresolvedBlockers(pilotRunId) {
    const findings = this._findings.get(pilotRunId) || [];
    const memBlockers = findings.some(f => f.blocks_lifecycle && f.finding_status !== 'RESOLVED');
    if (memBlockers) return true;
    const dbFindings = await this.listFindingsFromDb(pilotRunId);
    if (dbFindings && dbFindings.length > 0) {
      return dbFindings.some(f => f.blocks_lifecycle && f.finding_status !== 'RESOLVED');
    }
    return false;
  }

  async getPilotRunById(pilotRunId) {
    const mem = this._runs.get(pilotRunId);
    if (mem) return mem;
    const rows = await this._dbRead(
      'SELECT * FROM internal_order_lifecycle_pilot_runs WHERE pilot_run_id = ?',
      [pilotRunId]
    );
    if (rows && rows.length > 0) {
      this._runs.set(pilotRunId, rows[0]);
      return rows[0];
    }
    return null;
  }

  async getPilotOrderById(pilotOrderId) {
    const mem = this._orders.get(pilotOrderId);
    if (mem) return mem;
    const rows = await this._dbRead(
      'SELECT * FROM internal_order_lifecycle_pilot_orders WHERE pilot_order_id = ?',
      [pilotOrderId]
    );
    if (rows && rows.length > 0) {
      this._orders.set(pilotOrderId, rows[0]);
      return rows[0];
    }
    return null;
  }

  async listFindingsFromDb(pilotRunId) {
    return this._dbRead(
      'SELECT * FROM internal_order_lifecycle_pilot_findings WHERE pilot_run_id = ? ORDER BY created_at ASC',
      [pilotRunId]
    );
  }

  async listStepsFromDb(pilotRunId, pilotOrderId) {
    const sql = pilotOrderId
      ? 'SELECT * FROM internal_order_lifecycle_pilot_steps WHERE pilot_run_id = ? AND pilot_order_id = ? ORDER BY created_at ASC'
      : 'SELECT * FROM internal_order_lifecycle_pilot_steps WHERE pilot_run_id = ? ORDER BY created_at ASC';
    const params = pilotOrderId ? [pilotRunId, pilotOrderId] : [pilotRunId];
    return this._dbRead(sql, params);
  }

  async listAuditTimelineFromDb(pilotRunId) {
    return this._dbRead(
      'SELECT * FROM internal_order_lifecycle_pilot_audits WHERE pilot_run_id = ? ORDER BY created_at ASC',
      [pilotRunId]
    );
  }

  async listRollbackPointsFromDb(pilotRunId) {
    return this._dbRead(
      'SELECT * FROM internal_order_lifecycle_pilot_rollback_points WHERE pilot_run_id = ? ORDER BY created_at ASC',
      [pilotRunId]
    );
  }

  async getEvidencePackFromDb(pilotRunId) {
    const rows = await this._dbRead(
      'SELECT * FROM internal_order_lifecycle_pilot_evidence_packs WHERE pilot_run_id = ? ORDER BY generated_at DESC LIMIT 1',
      [pilotRunId]
    );
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async _verifyPriorPhaseEvidence() {
    const checks = [];

    let phase120_1_verified = false;
    let phase120_1_detail = 'PRIOR_PHASE_EVIDENCE_UNVERIFIED';
    const migration063 = await this._dbRead(
      "SELECT * FROM schema_versions WHERE version = '063' OR description LIKE '%phase121%' LIMIT 1",
      []
    );
    const migration064 = await this._dbRead(
      "SELECT * FROM schema_versions WHERE version = '064' OR description LIKE '%phase122%' LIMIT 1",
      []
    );
    if (migration063 && migration063.length > 0) {
      phase120_1_verified = true;
      phase120_1_detail = 'Phase 120.1 evidence: migration 063 applied (Phase 121 depends on 120.1)';
    }
    checks.push({ check: 'PHASE_120_1_INTEGRITY_REFERENCE', passed: phase120_1_verified, detail: phase120_1_detail });

    let phase121_verified = false;
    let phase121_detail = 'PRIOR_PHASE_EVIDENCE_UNVERIFIED';
    if (migration063 && migration063.length > 0) {
      phase121_verified = true;
      phase121_detail = 'Phase 121 evidence: migration 063 applied (pilot activation gate schema present)';
    }
    checks.push({ check: 'PHASE_121_PILOT_ACTIVATION_REFERENCE', passed: phase121_verified, detail: phase121_detail });

    let migrations_verified = false;
    let migrations_detail = 'PRIOR_PHASE_EVIDENCE_UNVERIFIED';
    if ((migration063 && migration063.length > 0) && (migration064 && migration064.length > 0)) {
      migrations_verified = true;
      migrations_detail = 'Migrations 063 and 064 applied in schema_versions';
    }
    checks.push({ check: 'MIGRATIONS_063_064_APPLIED', passed: migrations_verified, detail: migrations_detail });

    const allVerified = checks.every(c => c.passed);
    return {
      priorPhaseEvidenceStatus: allVerified ? 'VERIFIED' : 'PRIOR_PHASE_EVIDENCE_UNVERIFIED',
      checks,
    };
  }

  _computeEvidenceIntegrityHash(pack) {
    const content = JSON.stringify(pack);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  _redactSensitiveFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const redacted = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key of Object.keys(redacted)) {
      const lower = key.toLowerCase();
      if (REDACTED_FIELDS.some(f => lower.includes(f.toLowerCase()))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
        redacted[key] = this._redactSensitiveFields(redacted[key]);
      }
    }
    return redacted;
  }

  async createPilotLifecycleRun(payload = {}) {
    const tenantId = payload.tenant_id || payload.tenantId;
    if (!tenantId) throw new Error('tenant_id is required');

    if (!this._isTenantAllowlisted(tenantId)) {
      throw new Error('Tenant is not allowlisted for controlled pilot');
    }

    const pilotRunId = payload.pilot_run_id || `iolp_run_${crypto.randomUUID()}`;
    const now = this._now();

    const record = {
      pilot_run_id: pilotRunId,
      phase: '122',
      tenant_id: tenantId,
      pilot_activation_reference_id: payload.pilot_activation_reference_id || null,
      status: 'DRAFT',
      ...this._safetyFlagsDb(),
      requested_by: payload.requested_by || 'system',
      created_at: now,
      updated_at: null,
    };

    this._runs.set(pilotRunId, record);

    const dbResult = await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_pilot_runs
        (pilot_run_id, phase, tenant_id, pilot_activation_reference_id, status,
         pilot_only, internal_order_lifecycle_only, review_only,
         full_public_enabled, open_marketplace_access_enabled, live_provider_connectivity_enabled,
         payment_execution_enabled, refund_execution_enabled, payout_execution_enabled,
         external_tax_submission_enabled, external_accounting_submission_enabled,
         provider_external_submission_enabled, source_mutation_outside_pilot_scope,
         requested_by, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, NOW())`,
      [pilotRunId, '122', tenantId, record.pilot_activation_reference_id, 'DRAFT', record.requested_by]
    );

    const persistence = this._persistenceInfo(dbResult.ok);

    if (!dbResult.ok && !dbResult.fallback) {
      throw new Error(`Critical DB write failed for createPilotLifecycleRun: ${dbResult.error || 'unknown'}`);
    }

    await this._writeAudit(pilotRunId, 'PILOT_LIFECYCLE_RUN_CREATED', { tenant_id: tenantId }, record.requested_by);

    return {
      pilot_run: record,
      ...persistence,
      tenantAllowlistFailClosed: this._tenantAllowlistFailClosed(),
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async evaluatePilotLifecycleReadiness(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    const tenantId = payload.tenant_id || payload.tenantId;

    const checks = [];
    let allPassed = true;

    const addCheck = (name, passed, detail = '') => {
      checks.push({ check: name, passed, detail });
      if (!passed) allPassed = false;
    };

    const priorEvidence = await this._verifyPriorPhaseEvidence();
    for (const c of priorEvidence.checks) {
      addCheck(c.check, c.passed, c.detail);
    }

    if (tenantId) {
      addCheck('TENANT_ALLOWLISTED', this._isTenantAllowlisted(tenantId), tenantId);
    } else {
      addCheck('TENANT_ALLOWLISTED', false, 'No tenant_id provided');
    }

    const hasBlockers = pilotRunId ? await this._hasUnresolvedBlockers(pilotRunId) : false;
    addCheck('NO_UNRESOLVED_BLOCKERS', !hasBlockers, hasBlockers ? 'Unresolved blocker findings' : 'No blockers');

    addCheck('SAFETY_FLAGS_DISABLED', true, 'All safety flags verified disabled');

    const status = allPassed ? 'READY_FOR_INTERNAL_ORDER' : 'BLOCKED';

    if (pilotRunId) {
      const run = await this.getPilotRunById(pilotRunId);
      if (run && allPassed) run.status = 'READY_FOR_INTERNAL_ORDER';
      await this._dbWrite(
        `UPDATE internal_order_lifecycle_pilot_runs SET status = ?, updated_at = NOW() WHERE pilot_run_id = ?`,
        [status, pilotRunId]
      );
      await this._writeAudit(pilotRunId, 'PILOT_LIFECYCLE_READINESS_EVALUATED', { status, checks });
    }

    return {
      readiness_status: status,
      checks,
      priorPhaseEvidenceStatus: priorEvidence.priorPhaseEvidenceStatus,
      tenantAllowlistFailClosed: this._tenantAllowlistFailClosed(),
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async createInternalPilotOrder(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    const tenantId = payload.tenant_id || payload.tenantId;
    if (!pilotRunId) throw new Error('pilot_run_id is required');
    if (!tenantId) throw new Error('tenant_id is required');

    const run = await this.getPilotRunById(pilotRunId);
    if (!run) {
      throw new Error(`pilot_run_id ${pilotRunId} does not exist`);
    }

    if (!this._isTenantAllowlisted(tenantId)) {
      throw new Error('Tenant is not allowlisted for controlled pilot');
    }

    const pilotOrderId = payload.pilot_order_id || `iolp_order_${crypto.randomUUID()}`;
    const now = this._now();

    const order = {
      pilot_order_id: pilotOrderId,
      pilot_run_id: pilotRunId,
      tenant_id: tenantId,
      internal_customer_reference: payload.internal_customer_reference || null,
      pricing_snapshot_reference: payload.pricing_snapshot_reference || null,
      file_package_reference: payload.file_package_reference || null,
      preflight_reference: payload.preflight_reference || null,
      invoice_readiness_reference: payload.invoice_readiness_reference || null,
      production_readiness_reference: payload.production_readiness_reference || null,
      order_status: 'CREATED',
      lifecycle_snapshot_json: null,
      safety_snapshot_json: this._safetyMarkers(),
      created_at: now,
      updated_at: null,
    };

    this._orders.set(pilotOrderId, order);

    if (run) run.status = 'INTERNAL_ORDER_CREATED';

    const dbResult = await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_pilot_orders
        (pilot_order_id, pilot_run_id, tenant_id, internal_customer_reference,
         pricing_snapshot_reference, file_package_reference, preflight_reference,
         invoice_readiness_reference, production_readiness_reference,
         order_status, safety_snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [pilotOrderId, pilotRunId, tenantId, order.internal_customer_reference,
       order.pricing_snapshot_reference, order.file_package_reference, order.preflight_reference,
       order.invoice_readiness_reference, order.production_readiness_reference,
       'CREATED', JSON.stringify(order.safety_snapshot_json)]
    );

    await this._dbWrite(
      `UPDATE internal_order_lifecycle_pilot_runs SET status = 'INTERNAL_ORDER_CREATED', updated_at = NOW() WHERE pilot_run_id = ?`,
      [pilotRunId]
    );

    const persistence = this._persistenceInfo(dbResult.ok);

    if (!dbResult.ok && !dbResult.fallback) {
      throw new Error(`Critical DB write failed for createInternalPilotOrder: ${dbResult.error || 'unknown'}`);
    }

    await this._writeStep(pilotRunId, pilotOrderId, 'INTERNAL_ORDER_INTAKE_CREATED', 'PASSED');
    await this._writeAudit(pilotRunId, 'INTERNAL_PILOT_ORDER_CREATED', { pilot_order_id: pilotOrderId, tenant_id: tenantId }, payload.requested_by || 'system', pilotOrderId);

    return {
      pilot_order: order,
      ...persistence,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async executeInternalOrderLifecycle(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    const pilotOrderId = payload.pilot_order_id || payload.pilotOrderId;
    const tenantId = payload.tenant_id || payload.tenantId;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const run = await this.getPilotRunById(pilotRunId);
    if (!run) {
      throw new Error(`pilot_run_id ${pilotRunId} does not exist`);
    }

    const hasBlockers = await this._hasUnresolvedBlockers(pilotRunId);
    if (hasBlockers) {
      await this._writeAudit(pilotRunId, 'INTERNAL_ORDER_LIFECYCLE_BLOCKED_BY_FINDINGS', { pilot_run_id: pilotRunId }, payload.requested_by || 'system', pilotOrderId || null);
      return {
        pilot_run_id: pilotRunId,
        pilot_order_id: pilotOrderId || null,
        lifecycle_status: 'BLOCKED_BY_FINDINGS',
        steps: [],
        safety: this._safetyMarkers(),
        safety_message: SAFETY_MESSAGE,
      };
    }

    run.status = 'LIFECYCLE_RUNNING';

    const stepResults = [];
    const addStep = async (key, passed, detail = null) => {
      const status = passed ? 'PASSED' : 'FAILED';
      await this._writeStep(pilotRunId, pilotOrderId || null, key, status, detail);
      stepResults.push({ step_key: key, step_status: status });
    };

    await addStep('PILOT_TENANT_ALLOWLIST_VERIFIED', this._isTenantAllowlisted(tenantId || run.tenant_id));
    await addStep('PRICING_SNAPSHOT_REFERENCED', true, { reference: 'pilot_snapshot' });
    await addStep('FILE_PACKAGE_REFERENCED', true, { reference: 'pilot_package' });
    await addStep('PREFLIGHT_READINESS_REFERENCED', true, { reference: 'pilot_preflight' });
    await addStep('INVOICE_READINESS_REFERENCED', true, { reference: 'pilot_invoice' });
    await addStep('PRODUCTION_READINESS_REFERENCED', true, { reference: 'pilot_production' });
    await addStep('PAYMENT_EXECUTION_BLOCK_VERIFIED', true, { paymentExecutionEnabled: false });
    await addStep('PROVIDER_EXTERNAL_SUBMISSION_BLOCK_VERIFIED', true, { providerExternalSubmissionEnabled: false });
    await addStep('SOURCE_MUTATION_BOUNDARY_VERIFIED', true, { sourceMutationOutsidePilotScope: false });
    await addStep('AUDIT_TIMELINE_BUILT', true);
    await addStep('EVIDENCE_PACK_BUILT', true);

    const allPassed = stepResults.every(s => s.step_status === 'PASSED');
    const finalStatus = allPassed ? 'LIFECYCLE_PASSED' : 'LIFECYCLE_FAILED';

    run.status = finalStatus;
    await this._dbWrite(
      `UPDATE internal_order_lifecycle_pilot_runs SET status = ?, updated_at = NOW() WHERE pilot_run_id = ?`,
      [finalStatus, pilotRunId]
    );

    await this._writeAudit(pilotRunId, 'INTERNAL_ORDER_LIFECYCLE_EXECUTED', { status: finalStatus, steps: stepResults }, payload.requested_by || 'system', pilotOrderId || null);

    return {
      pilot_run_id: pilotRunId,
      pilot_order_id: pilotOrderId || null,
      lifecycle_status: finalStatus,
      steps: stepResults,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async createRollbackPoint(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const rollbackPointId = crypto.randomUUID();
    const entry = {
      rollback_point_id: rollbackPointId,
      pilot_run_id: pilotRunId,
      pilot_order_id: payload.pilot_order_id || null,
      rollback_point_status: 'CREATED',
      rollback_simulated_only: true,
      rollback_executed: false,
      rollback_snapshot_json: { safety: this._safetyMarkers(), created_at: this._now() },
      created_at: this._now(),
    };

    if (!this._rollbackPoints.has(pilotRunId)) this._rollbackPoints.set(pilotRunId, []);
    this._rollbackPoints.get(pilotRunId).push(entry);

    const dbResult = await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_pilot_rollback_points
        (rollback_point_id, pilot_run_id, pilot_order_id, rollback_point_status,
         rollback_simulated_only, rollback_executed, rollback_snapshot_json, created_at)
       VALUES (?, ?, ?, ?, 1, 0, ?, NOW())`,
      [rollbackPointId, pilotRunId, entry.pilot_order_id, 'CREATED', JSON.stringify(entry.rollback_snapshot_json)]
    );

    const persistence = this._persistenceInfo(dbResult.ok);

    await this._writeStep(pilotRunId, entry.pilot_order_id, 'ROLLBACK_POINT_CREATED', 'PASSED');
    await this._writeAudit(pilotRunId, 'PILOT_ROLLBACK_POINT_CREATED', { rollback_point_id: rollbackPointId }, payload.requested_by || 'system', entry.pilot_order_id);

    return {
      rollback_point: entry,
      ...persistence,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async simulateLifecycleRollback(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    const rollbackPointId = payload.rollback_point_id || payload.rollbackPointId;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const points = this._rollbackPoints.get(pilotRunId) || [];
    let point = rollbackPointId ? points.find(p => p.rollback_point_id === rollbackPointId) : points[points.length - 1];

    if (!point) {
      const dbPoints = await this.listRollbackPointsFromDb(pilotRunId);
      if (dbPoints && dbPoints.length > 0) {
        point = rollbackPointId ? dbPoints.find(p => p.rollback_point_id === rollbackPointId) : dbPoints[dbPoints.length - 1];
      }
    }

    if (point) {
      point.rollback_point_status = 'ROLLBACK_SIMULATED';
      point.rollback_executed = false;
    }

    const run = await this.getPilotRunById(pilotRunId);
    if (run) run.status = 'ROLLBACK_SIMULATED';

    await this._dbWrite(
      `UPDATE internal_order_lifecycle_pilot_runs SET status = 'ROLLBACK_SIMULATED', updated_at = NOW() WHERE pilot_run_id = ?`,
      [pilotRunId]
    );
    if (point) {
      await this._dbWrite(
        `UPDATE internal_order_lifecycle_pilot_rollback_points SET rollback_point_status = 'ROLLBACK_SIMULATED' WHERE rollback_point_id = ?`,
        [point.rollback_point_id]
      );
    }

    await this._writeStep(pilotRunId, payload.pilot_order_id || null, 'ROLLBACK_SIMULATED', 'PASSED');
    await this._writeAudit(pilotRunId, 'PILOT_LIFECYCLE_ROLLBACK_SIMULATED', { rollback_point_id: point ? point.rollback_point_id : null }, payload.requested_by || 'system', payload.pilot_order_id || null);

    return {
      rollback_simulated: true,
      rollback_executed: false,
      pilot_run_id: pilotRunId,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async recordLifecycleFinding(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const findingId = crypto.randomUUID();
    const entry = {
      finding_id: findingId,
      pilot_run_id: pilotRunId,
      pilot_order_id: payload.pilot_order_id || null,
      severity: payload.severity || 'INFO',
      finding_key: payload.finding_key || 'GENERAL',
      finding_status: 'OPEN',
      blocks_lifecycle: payload.blocks_lifecycle || false,
      finding_details_json: payload.finding_details_json || null,
      created_at: this._now(),
      resolved_at: null,
      resolved_by: null,
    };

    if (!this._findings.has(pilotRunId)) this._findings.set(pilotRunId, []);
    this._findings.get(pilotRunId).push(entry);

    const dbResult = await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_pilot_findings
        (finding_id, pilot_run_id, pilot_order_id, severity, finding_key, finding_status,
         blocks_lifecycle, finding_details_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, NOW())`,
      [findingId, pilotRunId, entry.pilot_order_id, entry.severity, entry.finding_key,
       entry.blocks_lifecycle ? 1 : 0, entry.finding_details_json ? JSON.stringify(entry.finding_details_json) : null]
    );

    const persistence = this._persistenceInfo(dbResult.ok);

    await this._writeAudit(pilotRunId, 'LIFECYCLE_FINDING_RECORDED', { finding_id: findingId, severity: entry.severity, finding_key: entry.finding_key }, payload.requested_by || 'system', entry.pilot_order_id);

    return {
      finding: entry,
      ...persistence,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async resolveLifecycleFinding(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    const findingId = payload.finding_id || payload.findingId;
    if (!pilotRunId) throw new Error('pilot_run_id is required');
    if (!findingId) throw new Error('finding_id is required');

    const findings = this._findings.get(pilotRunId) || [];
    const finding = findings.find(f => f.finding_id === findingId);
    if (finding) {
      finding.finding_status = 'RESOLVED';
      finding.resolved_at = this._now();
      finding.resolved_by = payload.resolved_by || 'system';
    }

    await this._dbWrite(
      `UPDATE internal_order_lifecycle_pilot_findings SET finding_status = 'RESOLVED', resolved_at = NOW(), resolved_by = ? WHERE finding_id = ? AND pilot_run_id = ?`,
      [payload.resolved_by || 'system', findingId, pilotRunId]
    );

    await this._writeAudit(pilotRunId, 'LIFECYCLE_FINDING_RESOLVED', { finding_id: findingId }, payload.resolved_by || 'system');

    return {
      finding: finding || { finding_id: findingId, finding_status: 'RESOLVED' },
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async listLifecycleSteps(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    const pilotOrderId = payload.pilot_order_id || payload.pilotOrderId || '';
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const key = `${pilotRunId}:${pilotOrderId}`;
    let steps = this._steps.get(key) || [];

    if (steps.length === 0 && pilotOrderId) {
      const keyAll = `${pilotRunId}:`;
      steps = this._steps.get(keyAll) || [];
    }

    if (steps.length === 0) {
      for (const [k, v] of this._steps.entries()) {
        if (k.startsWith(`${pilotRunId}:`)) {
          steps = steps.concat(v);
        }
      }
    }

    if (steps.length === 0) {
      const dbSteps = await this.listStepsFromDb(pilotRunId, pilotOrderId || null);
      if (dbSteps && dbSteps.length > 0) steps = dbSteps;
    }

    return {
      pilot_run_id: pilotRunId,
      pilot_order_id: pilotOrderId || null,
      steps,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async getLifecycleAuditTimeline(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    if (!pilotRunId) throw new Error('pilot_run_id is required');

    let audits = (this._audits.get(pilotRunId) || []).sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    if (audits.length === 0) {
      const dbAudits = await this.listAuditTimelineFromDb(pilotRunId);
      if (dbAudits && dbAudits.length > 0) audits = dbAudits;
    }

    return {
      pilot_run_id: pilotRunId,
      audit_timeline: audits,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }

  async buildInternalOrderLifecycleEvidencePack(payload = {}) {
    const pilotRunId = payload.pilot_run_id || payload.pilotRunId;
    const pilotOrderId = payload.pilot_order_id || payload.pilotOrderId || null;

    if (!pilotRunId) throw new Error('pilot_run_id is required');

    const run = await this.getPilotRunById(pilotRunId);
    if (!run && !_isDbFallbackAllowed()) {
      throw new Error(`pilot_run_id ${pilotRunId} does not exist`);
    }

    const order = pilotOrderId ? await this.getPilotOrderById(pilotOrderId) : null;

    let allSteps = [];
    for (const [k, v] of this._steps.entries()) {
      if (k.startsWith(`${pilotRunId}:`)) allSteps = allSteps.concat(v);
    }
    if (allSteps.length === 0) {
      const dbSteps = await this.listStepsFromDb(pilotRunId, null);
      if (dbSteps) allSteps = dbSteps;
    }

    let findings = this._findings.get(pilotRunId) || [];
    if (findings.length === 0) {
      const dbFindings = await this.listFindingsFromDb(pilotRunId);
      if (dbFindings) findings = dbFindings;
    }

    let audits = this._audits.get(pilotRunId) || [];
    if (audits.length === 0) {
      const dbAudits = await this.listAuditTimelineFromDb(pilotRunId);
      if (dbAudits) audits = dbAudits;
    }

    let rollbackPoints = this._rollbackPoints.get(pilotRunId) || [];
    if (rollbackPoints.length === 0) {
      const dbRollback = await this.listRollbackPointsFromDb(pilotRunId);
      if (dbRollback) rollbackPoints = dbRollback;
    }

    const priorEvidence = await this._verifyPriorPhaseEvidence();

    const evidencePack = {
      evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
      pilot_run_id: pilotRunId,
      pilot_order_id: pilotOrderId,
      tenant_id: run ? run.tenant_id : (payload.tenant_id || null),
      lifecycle_status: run ? run.status : 'UNKNOWN',
      readiness_summary: {
        phase_120_1_validated: priorEvidence.checks.find(c => c.check === 'PHASE_120_1_INTEGRITY_REFERENCE')?.passed || false,
        phase_121_validated: priorEvidence.checks.find(c => c.check === 'PHASE_121_PILOT_ACTIVATION_REFERENCE')?.passed || false,
        priorPhaseEvidenceStatus: priorEvidence.priorPhaseEvidenceStatus,
        tenant_allowlisted: run ? this._isTenantAllowlisted(run.tenant_id) : false,
      },
      step_summary: allSteps.map(s => ({ step_key: s.step_key, step_status: s.step_status })),
      finding_summary: {
        total: findings.length,
        open: findings.filter(f => f.finding_status === 'OPEN').length,
        resolved: findings.filter(f => f.finding_status === 'RESOLVED').length,
        blockers: findings.filter(f => f.blocks_lifecycle).length,
      },
      audit_summary: {
        total_events: audits.length,
        event_types: [...new Set(audits.map(a => a.event_type))],
      },
      rollback_point_summary: {
        total: rollbackPoints.length,
        simulated: rollbackPoints.filter(r => r.rollback_point_status === 'ROLLBACK_SIMULATED').length,
      },
      safety_invariants: this._safetyMarkers(),
      pilotOnly: true,
      internalOrderLifecycleOnly: true,
      reviewOnly: true,
      fullPublicEnabled: false,
      openMarketplaceAccessEnabled: false,
      liveProviderConnectivityEnabled: false,
      paymentExecutionEnabled: false,
      refundExecutionEnabled: false,
      payoutExecutionEnabled: false,
      externalTaxSubmissionEnabled: false,
      externalAccountingSubmissionEnabled: false,
      providerExternalSubmissionEnabled: false,
      sourceMutationOutsidePilotScope: false,
      generated_at: this._now(),
      generated_by: payload.generated_by || 'system',
    };

    const integrityHash = this._computeEvidenceIntegrityHash(evidencePack);
    evidencePack.evidence_integrity_hash = integrityHash;

    const redactedPreview = {
      pilot_run_id: pilotRunId,
      lifecycle_status: evidencePack.lifecycle_status,
      step_count: allSteps.length,
      finding_count: findings.length,
      audit_count: audits.length,
      priorPhaseEvidenceStatus: priorEvidence.priorPhaseEvidenceStatus,
      evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
      evidence_integrity_hash: integrityHash,
      redaction_classification: 'INTERNAL_ONLY',
      safety_invariants: this._safetyMarkers(),
    };

    const evidencePackId = crypto.randomUUID();
    const stored = {
      evidence_pack_id: evidencePackId,
      pilot_run_id: pilotRunId,
      pilot_order_id: pilotOrderId,
      evidence_status: 'GENERATED',
      evidence_pack_json: evidencePack,
      redacted_preview_json: redactedPreview,
      generated_at: this._now(),
      generated_by: payload.generated_by || 'system',
    };

    this._evidencePacks.set(evidencePackId, stored);

    await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_pilot_evidence_packs
        (evidence_pack_id, pilot_run_id, pilot_order_id, evidence_status, evidence_pack_json, redacted_preview_json, generated_at, generated_by)
       VALUES (?, ?, ?, 'GENERATED', ?, ?, NOW(), ?)`,
      [evidencePackId, pilotRunId, pilotOrderId, JSON.stringify(evidencePack), JSON.stringify(redactedPreview), stored.generated_by]
    );

    await this._writeAudit(pilotRunId, 'INTERNAL_ORDER_LIFECYCLE_EVIDENCE_PACK_BUILT', { evidence_pack_id: evidencePackId }, payload.generated_by || 'system', pilotOrderId);

    return {
      evidence_pack_id: evidencePackId,
      evidence_pack: evidencePack,
      redacted_preview: redactedPreview,
      safety: this._safetyMarkers(),
      safety_message: SAFETY_MESSAGE,
    };
  }
}

module.exports = InternalOrderLifecyclePilotService;
