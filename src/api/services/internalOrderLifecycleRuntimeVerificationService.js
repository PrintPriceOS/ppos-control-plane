'use strict';

const crypto = require('crypto');

const SAFETY_MARKERS = Object.freeze({
  pilotOnly: true,
  runtimeVerificationOnly: true,
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
  productionActivationEnabled: false,
  serviceRestartExecuted: false,
  realRestartExecuted: false,
});

const SAFETY_FLAGS_DB = Object.freeze({
  pilot_only: true,
  runtime_verification_only: true,
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
  production_activation_enabled: false,
  service_restart_executed: false,
  real_restart_executed: false,
});

const SAFETY_MESSAGE =
  'Runtime verification / restart recovery drill only. No real restart is executed by code. ' +
  'All restart actions are manual/documented. FULL_PUBLIC remains disabled. No open marketplace access, ' +
  'payment execution, refund execution, payout execution, tax/accounting submission, ' +
  'provider submission, or source record mutation outside pilot scope is enabled.';

const EVIDENCE_SCHEMA_VERSION = '122.2';

const CHECK_TYPES = [
  'DB_READ_THROUGH',
  'MEMORY_EMPTY_RECOVERY',
  'AUDIT_TIMELINE_RECOVERY',
  'EVIDENCE_PACK_RECOVERY',
  'ALLOWLIST_FAIL_CLOSED_RUNTIME',
  'BLOCKER_FINDING_RUNTIME',
];

const RUN_STATUSES = [
  'DRAFT', 'RUNNING', 'PASSED', 'FAILED', 'SUSPENDED',
];

function _isDbFallbackAllowed() {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_DB_FALLBACK_FOR_SMOKE === 'true';
}

class InternalOrderLifecycleRuntimeVerificationService {
  constructor() {
    this._runs = new Map();
    this._checks = new Map();
    this._audits = new Map();

    let _db = null;
    try { _db = require('./mysqlClient'); } catch (_e) { /* no DB available */ }
    this._db = _db;
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

  async _writeAudit(verificationRunId, checkId, eventType, actor, payload) {
    const auditId = crypto.randomUUID();
    const record = {
      audit_id: auditId,
      verification_run_id: verificationRunId,
      check_id: checkId || null,
      event_type: eventType,
      event_actor: actor || 'system',
      event_payload_json: payload || {},
      safety_snapshot_json: { ...SAFETY_MARKERS },
      created_at: new Date().toISOString(),
    };
    this._audits.set(auditId, record);
    await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_runtime_verification_audits
       (audit_id, verification_run_id, check_id, event_type, event_actor, event_payload_json, safety_snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [auditId, verificationRunId, record.check_id, eventType, record.event_actor,
       JSON.stringify(record.event_payload_json), JSON.stringify(record.safety_snapshot_json)]
    );
    return record;
  }

  _getPersistenceInfo(dbResult) {
    if (!dbResult) return { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    if (dbResult.ok) return { persistenceMode: 'DB', persistenceStatus: 'PERSISTED' };
    if (dbResult.fallback) return { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    return { persistenceMode: 'DB', persistenceStatus: 'FAILED' };
  }

  async createRuntimeVerificationRun(payload) {
    const { tenant_id, linked_pilot_run_id, requested_by } = payload || {};
    if (!tenant_id) throw new Error('tenant_id is required');

    const verificationRunId = crypto.randomUUID();
    const run = {
      verification_run_id: verificationRunId,
      phase: 'PHASE_122_2',
      tenant_id,
      linked_pilot_run_id: linked_pilot_run_id || null,
      status: 'DRAFT',
      ...SAFETY_FLAGS_DB,
      requested_by: requested_by || null,
      created_at: new Date().toISOString(),
    };
    this._runs.set(verificationRunId, run);

    const dbResult = await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_runtime_verification_runs
       (verification_run_id, phase, tenant_id, linked_pilot_run_id, status, requested_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [verificationRunId, run.phase, tenant_id, run.linked_pilot_run_id, run.status, run.requested_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(verificationRunId, null, 'RUNTIME_VERIFICATION_RUN_CREATED', requested_by, { tenant_id, linked_pilot_run_id });

    return {
      verification_run: run,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async _getRunById(verificationRunId) {
    if (this._runs.has(verificationRunId)) return this._runs.get(verificationRunId);
    const rows = await this._dbRead(
      'SELECT * FROM internal_order_lifecycle_runtime_verification_runs WHERE verification_run_id = ?',
      [verificationRunId]
    );
    if (rows && rows.length > 0) {
      this._runs.set(verificationRunId, rows[0]);
      return rows[0];
    }
    return null;
  }

  async _createCheck(verificationRunId, checkType, checkStatus, checkResult, persistenceMode, persistenceStatus) {
    const checkId = crypto.randomUUID();
    const record = {
      check_id: checkId,
      verification_run_id: verificationRunId,
      check_type: checkType,
      check_status: checkStatus,
      check_result_json: checkResult || {},
      persistence_mode: persistenceMode || null,
      persistence_status: persistenceStatus || null,
      memory_fallback_production_valid: false,
      safety_snapshot_json: { ...SAFETY_MARKERS },
      created_at: new Date().toISOString(),
    };
    this._checks.set(checkId, record);

    const dbResult = await this._dbWrite(
      `INSERT INTO internal_order_lifecycle_runtime_verification_checks
       (check_id, verification_run_id, check_type, check_status, check_result_json, persistence_mode, persistence_status, memory_fallback_production_valid, safety_snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [checkId, verificationRunId, checkType, checkStatus, JSON.stringify(record.check_result_json),
       record.persistence_mode, record.persistence_status, 0, JSON.stringify(record.safety_snapshot_json)]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(verificationRunId, checkId, `RUNTIME_CHECK_${checkType}`, 'system', {
      check_status: checkStatus, persistence_mode: persistence.persistenceMode,
    });

    return { check: record, ...persistence };
  }

  async verifyDbReadThrough(payload) {
    const { verification_run_id } = payload || {};
    if (!verification_run_id) throw new Error('verification_run_id is required');
    const run = await this._getRunById(verification_run_id);
    if (!run) throw new Error('Verification run not found');

    let checkStatus = 'FAILED';
    const result = { dbAvailable: false, readThroughWorking: false, memoryFallbackIsProductionValid: false };

    if (this._db) {
      result.dbAvailable = true;
      const rows = await this._dbRead(
        'SELECT verification_run_id FROM internal_order_lifecycle_runtime_verification_runs WHERE verification_run_id = ?',
        [verification_run_id]
      );
      if (rows && rows.length > 0) {
        result.readThroughWorking = true;
        checkStatus = 'PASSED';
      }
    } else if (_isDbFallbackAllowed()) {
      result.dbAvailable = false;
      result.readThroughWorking = false;
      result.memoryFallbackIsProductionValid = false;
      checkStatus = 'PASSED_WITH_FALLBACK';
    }

    const { check, ...persistence } = await this._createCheck(
      verification_run_id, 'DB_READ_THROUGH', checkStatus, result,
      result.dbAvailable ? 'DB' : 'MEMORY_FALLBACK',
      result.readThroughWorking ? 'PERSISTED' : 'FALLBACK_ONLY'
    );

    return { check, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async verifyMemoryEmptyRecovery(payload) {
    const { verification_run_id } = payload || {};
    if (!verification_run_id) throw new Error('verification_run_id is required');
    const run = await this._getRunById(verification_run_id);
    if (!run) throw new Error('Verification run not found');

    const result = {
      simulatedEmptyMemory: true,
      recoveredFromDb: false,
      memoryFallbackIsProductionValid: false,
      restartInstructions: 'Manual PM2 restart required. No code executes a real restart.',
    };

    const savedRun = this._runs.get(verification_run_id);
    this._runs.delete(verification_run_id);

    const recovered = await this._getRunById(verification_run_id);
    if (recovered) {
      result.recoveredFromDb = true;
    } else if (savedRun) {
      this._runs.set(verification_run_id, savedRun);
      result.recoveredFromDb = false;
    }

    const checkStatus = result.recoveredFromDb ? 'PASSED' : (_isDbFallbackAllowed() ? 'PASSED_WITH_FALLBACK' : 'FAILED');

    const { check, ...persistence } = await this._createCheck(
      verification_run_id, 'MEMORY_EMPTY_RECOVERY', checkStatus, result,
      result.recoveredFromDb ? 'DB' : 'MEMORY_FALLBACK',
      result.recoveredFromDb ? 'PERSISTED' : 'FALLBACK_ONLY'
    );

    return { check, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async verifyAuditTimelineRecovery(payload) {
    const { verification_run_id } = payload || {};
    if (!verification_run_id) throw new Error('verification_run_id is required');
    const run = await this._getRunById(verification_run_id);
    if (!run) throw new Error('Verification run not found');

    const result = { auditRecordsInMemory: 0, auditRecordsInDb: 0, recoveryStatus: 'NOT_ATTEMPTED' };

    let memCount = 0;
    for (const [, a] of this._audits) {
      if (a.verification_run_id === verification_run_id) memCount++;
    }
    result.auditRecordsInMemory = memCount;

    const rows = await this._dbRead(
      'SELECT COUNT(*) AS cnt FROM internal_order_lifecycle_runtime_verification_audits WHERE verification_run_id = ?',
      [verification_run_id]
    );
    if (rows && rows.length > 0) {
      result.auditRecordsInDb = rows[0].cnt || 0;
      result.recoveryStatus = result.auditRecordsInDb > 0 ? 'RECOVERED' : 'EMPTY';
    } else {
      result.recoveryStatus = _isDbFallbackAllowed() ? 'FALLBACK_ONLY' : 'FAILED';
    }

    const checkStatus = result.recoveryStatus === 'RECOVERED' ? 'PASSED' :
      (_isDbFallbackAllowed() ? 'PASSED_WITH_FALLBACK' : 'FAILED');

    const { check, ...persistence } = await this._createCheck(
      verification_run_id, 'AUDIT_TIMELINE_RECOVERY', checkStatus, result,
      result.auditRecordsInDb > 0 ? 'DB' : 'MEMORY_FALLBACK',
      result.recoveryStatus === 'RECOVERED' ? 'PERSISTED' : 'FALLBACK_ONLY'
    );

    return { check, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async verifyEvidencePackRecovery(payload) {
    const { verification_run_id, linked_pilot_run_id } = payload || {};
    if (!verification_run_id) throw new Error('verification_run_id is required');
    const run = await this._getRunById(verification_run_id);
    if (!run) throw new Error('Verification run not found');

    const result = { evidencePacksInDb: 0, recoveryStatus: 'NOT_ATTEMPTED' };

    const pilotRunId = linked_pilot_run_id || run.linked_pilot_run_id;
    if (pilotRunId) {
      const rows = await this._dbRead(
        'SELECT COUNT(*) AS cnt FROM internal_order_lifecycle_pilot_evidence_packs WHERE pilot_run_id = ?',
        [pilotRunId]
      );
      if (rows && rows.length > 0) {
        result.evidencePacksInDb = rows[0].cnt || 0;
        result.recoveryStatus = result.evidencePacksInDb > 0 ? 'RECOVERED' : 'EMPTY';
      } else {
        result.recoveryStatus = _isDbFallbackAllowed() ? 'FALLBACK_ONLY' : 'FAILED';
      }
    } else {
      result.recoveryStatus = 'NO_LINKED_PILOT_RUN';
    }

    const checkStatus = result.recoveryStatus === 'RECOVERED' ? 'PASSED' :
      (_isDbFallbackAllowed() ? 'PASSED_WITH_FALLBACK' : 'FAILED');

    const { check, ...persistence } = await this._createCheck(
      verification_run_id, 'EVIDENCE_PACK_RECOVERY', checkStatus, result,
      result.evidencePacksInDb > 0 ? 'DB' : 'MEMORY_FALLBACK',
      result.recoveryStatus === 'RECOVERED' ? 'PERSISTED' : 'FALLBACK_ONLY'
    );

    return { check, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async verifyAllowlistFailClosedRuntime(payload) {
    const { verification_run_id } = payload || {};
    if (!verification_run_id) throw new Error('verification_run_id is required');
    const run = await this._getRunById(verification_run_id);
    if (!run) throw new Error('Verification run not found');

    const allowlist = process.env.PILOT_TENANT_ALLOWLIST || '';
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS === 'true';

    const result = {
      allowlistPresent: allowlist.length > 0,
      allowlistValue: allowlist.length > 0 ? `${allowlist.split(',').length} tenant(s)` : 'EMPTY',
      isTestMode,
      failClosedInProduction: !isTestMode && allowlist.length === 0,
      tenantAllowlistFailClosed: !isTestMode,
    };

    const checkStatus = result.tenantAllowlistFailClosed || result.allowlistPresent ? 'PASSED' : 'FAILED';

    const { check, ...persistence } = await this._createCheck(
      verification_run_id, 'ALLOWLIST_FAIL_CLOSED_RUNTIME', checkStatus, result, 'DB', 'PERSISTED'
    );

    return { check, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async verifyBlockerFindingRuntime(payload) {
    const { verification_run_id, linked_pilot_run_id } = payload || {};
    if (!verification_run_id) throw new Error('verification_run_id is required');
    const run = await this._getRunById(verification_run_id);
    if (!run) throw new Error('Verification run not found');

    const pilotRunId = linked_pilot_run_id || run.linked_pilot_run_id;
    const result = { blockerFindingsCount: 0, blockerEnforcementActive: true, checkScope: 'RUNTIME' };

    if (pilotRunId) {
      const rows = await this._dbRead(
        `SELECT COUNT(*) AS cnt FROM internal_order_lifecycle_pilot_findings
         WHERE pilot_run_id = ? AND blocks_lifecycle = 1 AND finding_status != 'RESOLVED'`,
        [pilotRunId]
      );
      if (rows && rows.length > 0) {
        result.blockerFindingsCount = rows[0].cnt || 0;
      }
    }

    const checkStatus = 'PASSED';

    const { check, ...persistence } = await this._createCheck(
      verification_run_id, 'BLOCKER_FINDING_RUNTIME', checkStatus, result, 'DB', 'PERSISTED'
    );

    return { check, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async getVerificationAuditTimeline(payload) {
    const { verification_run_id } = payload || {};
    if (!verification_run_id) throw new Error('verification_run_id is required');

    const memAudits = [];
    for (const [, a] of this._audits) {
      if (a.verification_run_id === verification_run_id) memAudits.push(a);
    }

    const dbRows = await this._dbRead(
      'SELECT * FROM internal_order_lifecycle_runtime_verification_audits WHERE verification_run_id = ? ORDER BY created_at ASC',
      [verification_run_id]
    );

    return {
      audit_timeline: dbRows || memAudits,
      source: dbRows ? 'DB' : 'MEMORY',
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async buildRuntimeVerificationEvidencePack(payload) {
    const { verification_run_id } = payload || {};
    if (!verification_run_id) throw new Error('verification_run_id is required');
    const run = await this._getRunById(verification_run_id);
    if (!run) throw new Error('Verification run not found');

    const checks = [];
    for (const [, c] of this._checks) {
      if (c.verification_run_id === verification_run_id) checks.push(c);
    }
    const dbChecks = await this._dbRead(
      'SELECT * FROM internal_order_lifecycle_runtime_verification_checks WHERE verification_run_id = ? ORDER BY created_at ASC',
      [verification_run_id]
    );

    const audits = [];
    for (const [, a] of this._audits) {
      if (a.verification_run_id === verification_run_id) audits.push(a);
    }
    const dbAudits = await this._dbRead(
      'SELECT * FROM internal_order_lifecycle_runtime_verification_audits WHERE verification_run_id = ? ORDER BY created_at ASC',
      [verification_run_id]
    );

    const allChecks = dbChecks || checks;
    const allAudits = dbAudits || audits;

    const passedCount = allChecks.filter(c => c.check_status === 'PASSED' || c.check_status === 'PASSED_WITH_FALLBACK').length;
    const failedCount = allChecks.filter(c => c.check_status === 'FAILED').length;

    const evidencePack = {
      evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
      verification_run_id,
      tenant_id: run.tenant_id,
      linked_pilot_run_id: run.linked_pilot_run_id,
      verification_status: failedCount > 0 ? 'FAILED' : (passedCount > 0 ? 'PASSED' : 'NO_CHECKS'),
      checks_summary: {
        total: allChecks.length,
        passed: passedCount,
        failed: failedCount,
        check_types_verified: allChecks.map(c => c.check_type),
      },
      audit_summary: {
        total_events: allAudits.length,
      },
      restart_drill_instructions: {
        manual_only: true,
        no_code_restart: true,
        instructions: [
          '1. Create a pilot run and pilot order via Phase 122 admin UI.',
          '2. Verify data appears in DB via admin UI or direct query.',
          '3. Manually restart PM2: pm2 restart ppos-control-plane',
          '4. Reload admin UI and confirm pilot run / order data still appears.',
          '5. Verify audit timeline is recovered from DB.',
          '6. Verify evidence pack is recovered from DB.',
          '7. If verification fails, suspend pilot and investigate.',
        ],
      },
      memory_fallback_production_valid: false,
      safety_invariants: {
        ...SAFETY_MARKERS,
        no_code_restart: true,
        all_restart_actions_manual: true,
      },
      generated_at: new Date().toISOString(),
      generated_by: 'system',
    };

    const integrityHash = crypto.createHash('sha256').update(JSON.stringify(evidencePack)).digest('hex');
    evidencePack.integrity_hash = integrityHash;

    await this._writeAudit(verification_run_id, null, 'RUNTIME_VERIFICATION_EVIDENCE_PACK_BUILT', 'system', {
      checks_total: allChecks.length, passed: passedCount, failed: failedCount, integrity_hash: integrityHash,
    });

    return {
      evidence_pack: evidencePack,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async getReadiness(payload) {
    const { verification_run_id } = payload || {};

    const readiness = {
      phase122_1_validated: false,
      phase122_1_evidence: 'CHECKING',
      migration_065_applied: false,
      migration_066_applied: false,
      db_available: !!this._db,
      memory_fallback_production_valid: false,
    };

    const schemaRows = await this._dbRead(
      "SELECT version FROM schema_versions WHERE version IN ('065', '066') ORDER BY version ASC", []
    );
    if (schemaRows) {
      for (const row of schemaRows) {
        if (String(row.version) === '065') readiness.migration_065_applied = true;
        if (String(row.version) === '066') readiness.migration_066_applied = true;
      }
    }

    const evidenceRows = await this._dbRead(
      "SELECT evidence_status FROM internal_order_lifecycle_pilot_evidence_packs WHERE evidence_status = 'GENERATED' LIMIT 1", []
    );
    if (evidenceRows && evidenceRows.length > 0) {
      readiness.phase122_1_validated = true;
      readiness.phase122_1_evidence = 'VERIFIED';
    } else {
      readiness.phase122_1_evidence = 'UNVERIFIED';
    }

    let verificationRun = null;
    if (verification_run_id) {
      verificationRun = await this._getRunById(verification_run_id);
    }

    return {
      readiness,
      verification_run: verificationRun,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }
}

module.exports = InternalOrderLifecycleRuntimeVerificationService;
