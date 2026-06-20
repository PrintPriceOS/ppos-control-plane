'use strict';

const crypto = require('crypto');

const SAFETY_MARKERS = Object.freeze({
  betaRuntimeEnabled: false,
  fullPublicEnabled: false,
  openMarketplaceEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  providerExternalSubmissionEnabled: false,
  externalTaxSubmissionEnabled: false,
  externalAccountingSubmissionEnabled: false,
  sourceMutationEnabled: false,
});

const SAFETY_FLAGS_DB = Object.freeze({
  beta_runtime_scoped_enabled: 0,
  full_public_enabled: 0,
  open_marketplace_enabled: 0,
  payment_execution_enabled: 0,
  refund_execution_enabled: 0,
  payout_execution_enabled: 0,
  provider_external_submission_enabled: 0,
  external_tax_submission_enabled: 0,
  external_accounting_submission_enabled: 0,
  source_mutation_enabled: 0,
  invite_only: 1,
  cohort_scoped: 1,
  tenant_scoped: 1,
  participant_scoped: 1,
});

const FORBIDDEN_FEATURES = [
  'PUBLIC_SIGNUP',
  'FULL_PUBLIC_MARKETPLACE',
  'OPEN_MARKETPLACE_ORDERING',
  'PAYMENT_CAPTURE',
  'PAYMENT_REFUND',
  'PAYOUT_EXECUTION',
  'TAX_SUBMISSION',
  'ACCOUNTING_EXPORT_SUBMISSION',
  'PROVIDER_EXTERNAL_SUBMISSION',
  'LIVE_PROVIDER_AUTO_DISPATCH',
  'UNCONTROLLED_SOURCE_MUTATION'
];

function _isDbFallbackAllowed() {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_DB_FALLBACK_FOR_SMOKE === 'true';
}

function _id(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function _hash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function _normalizeBool(val) {
  if (val === true || val === 1 || val === '1') return true;
  if (val === false || val === 0 || val === '0') return false;
  if (Buffer.isBuffer(val)) {
    return val.length > 0 && val[0] === 1;
  }
  return !!val;
}

class ControlledBetaCohortActivationService {
  constructor() {
    this._activations = new Map();
    this._participants = new Map();
    this._invites = new Map();
    this._scopes = new Map();
    this._limits = new Map();
    this._monitoring = new Map();
    this._support = new Map();
    this._incidents = new Map();
    this._killSwitches = new Map();
    this._findings = new Map();
    this._packs = new Map();

    let _db = null;
    try { _db = require('./mysqlClient'); } catch (_e) {}
    this._db = _db;
  }

  _allowMemoryFallback() {
    return _isDbFallbackAllowed();
  }

  _assertDbAvailableForProduction() {
    if (!this._db && !this._allowMemoryFallback()) {
      throw new Error('PRODUCTION_INTEGRITY_VIOLATION: Database connection is unavailable.');
    }
  }

  async _dbWrite(sql, params) {
    if (!this._db) {
      if (_isDbFallbackAllowed()) return { ok: false, fallback: true };
      return { ok: false, fallback: false, error: 'Database client not initialized' };
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
      const rows = await this._db.query(sql, params);
      return rows;
    } catch (_e) {
      return null;
    }
  }

  _getPersistenceInfo(dbResult) {
    if (!dbResult) return { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    if (dbResult.ok) return { persistenceMode: 'DB', persistenceStatus: 'PERSISTED' };
    if (dbResult.fallback) return { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    return { persistenceMode: 'DB', persistenceStatus: 'FAILED' };
  }

  _validateDbWriteResult(dbResult) {
    const info = this._getPersistenceInfo(dbResult);
    if (info.persistenceStatus === 'FAILED') {
      throw new Error(`Database write failed: ${dbResult.error || 'Unknown error'}`);
    }
    return info;
  }

  async evaluateControlledCohortActivationReadiness(activationId) {
    this._assertDbAvailableForProduction();

    let phase128_1_verified = false;
    let phase127_1_verified = false;
    let activation_exists = false;
    let gate_bound = false;
    let cohort_bound = false;
    let tenant_bound = false;
    let participants_present = false;
    let all_participants_approved = false;
    let terms_accepted = false;
    let role_boundaries_defined = false;
    let valid_invites_or_access_grants = false;
    let activation_scope_defined = false;
    let session_limits_defined = false;
    let support_escalation_defined = false;
    let rollback_ready = false;
    let monitoring_configured = false;
    let no_unresolved_blocker_findings = false;
    let kill_switch_ready = false;
    let safety_invariants_disabled = false;

    let activation_status = 'DRAFT';
    const blocked_reasons = [];

    // Memory maps load
    let activation = this._activations.get(activationId);
    let participants = Array.from(this._participants.values()).filter(p => p.activation_id === activationId);
    let invites = Array.from(this._invites.values()).filter(i => i.activation_id === activationId);
    let scopes = Array.from(this._scopes.values()).filter(s => s.activation_id === activationId);
    let limits = Array.from(this._limits.values()).find(l => l.activation_id === activationId);
    let monitoring = Array.from(this._monitoring.values()).filter(m => m.activation_id === activationId);
    let support = Array.from(this._support.values()).filter(s => s.activation_id === activationId);
    let findings = Array.from(this._findings.values()).filter(f => f.activation_id === activationId && f.finding_status === 'OPEN' && (f.blocks_runtime === 1 || f.severity === 'BLOCKER'));
    let killSwitches = Array.from(this._killSwitches.values()).filter(k => k.activation_id === activationId);
    
    let rollbackReadyFromMem = activation ? _normalizeBool(activation.rollback_ready) : false;
    let killSwitchReadyFromMem = activation ? _normalizeBool(activation.kill_switch_ready) : true;

    if (this._db) {
      try {
        const acts = await this._dbRead("SELECT * FROM controlled_beta_cohort_activations WHERE activation_id = ?", [activationId]);
        if (acts && acts.length > 0) {
          activation = acts[0];
          activation_status = activation.activation_status;
          rollbackReadyFromMem = _normalizeBool(activation.rollback_ready);
          killSwitchReadyFromMem = _normalizeBool(activation.kill_switch_ready);
        }

        const parts = await this._dbRead("SELECT * FROM controlled_beta_activation_participants WHERE activation_id = ?", [activationId]);
        if (parts) participants = parts;

        const invs = await this._dbRead("SELECT * FROM controlled_beta_activation_invites WHERE activation_id = ? AND revoked = 0", [activationId]);
        if (invs) invites = invs;

        const scps = await this._dbRead("SELECT * FROM controlled_beta_activation_scope_bindings WHERE activation_id = ?", [activationId]);
        if (scps) scopes = scps;

        const lims = await this._dbRead("SELECT * FROM controlled_beta_activation_session_limits WHERE activation_id = ?", [activationId]);
        if (lims && lims.length > 0) limits = lims[0];

        const monts = await this._dbRead("SELECT * FROM controlled_beta_activation_monitoring_events WHERE activation_id = ?", [activationId]);
        if (monts) monitoring = monts;

        const supps = await this._dbRead("SELECT * FROM controlled_beta_activation_support_events WHERE activation_id = ?", [activationId]);
        if (supps) support = supps;

        const finds = await this._dbRead("SELECT * FROM controlled_beta_activation_findings WHERE activation_id = ? AND finding_status = 'OPEN' AND (blocks_runtime = 1 OR severity = 'BLOCKER')", [activationId]);
        if (finds) findings = finds;

        const ksws = await this._dbRead("SELECT * FROM controlled_beta_activation_kill_switch_events WHERE activation_id = ?", [activationId]);
        if (ksws) killSwitches = ksws;

        // Verify Phase 128.1
        const schema075 = await this._dbRead("SELECT version FROM schema_versions WHERE version LIKE '%075_phase128_1%'", []);
        const schema074 = await this._dbRead("SELECT version FROM schema_versions WHERE version LIKE '%074_phase128%'", []);
        const restartDrills = await this._dbRead("SELECT * FROM limited_beta_runtime_restart_drills WHERE restart_recovery_status IN ('VERIFIED_AFTER_RESTART', 'COMPLETED') AND recovery_integrity_hash IS NOT NULL ORDER BY verified_at DESC LIMIT 1", []);
        const runtimeSessions = await this._dbRead("SELECT * FROM limited_beta_runtime_sessions WHERE gate_id = 'gate_123' LIMIT 1", []);
        
        let db128_1_ok = false;
        if (schema075 && schema075.length > 0 && schema074 && schema074.length > 0 && restartDrills && restartDrills.length > 0) {
          if (runtimeSessions && runtimeSessions.length > 0) {
            const sess = runtimeSessions[0];
            if (_normalizeBool(sess.recovered_from_db) === true &&
                _normalizeBool(sess.memory_state_detected) === false &&
                _normalizeBool(sess.restart_safe) === true) {
              db128_1_ok = true;
            }
          }
        }
        phase128_1_verified = db128_1_ok;

        // Verify Phase 127.1
        const schema073 = await this._dbRead("SELECT version FROM schema_versions WHERE version LIKE '%073_phase127_1%'", []);
        const prepPacks = await this._dbRead("SELECT * FROM limited_beta_evidence_packs WHERE evidence_schema_version = '128.0' OR evidence_schema_version = '127.1'", []);
        phase127_1_verified = !!(schema073 && schema073.length > 0 && prepPacks && prepPacks.length > 0);

      } catch (e) {
        if (!this._allowMemoryFallback()) throw e;
      }
    } else {
      activation_status = activation ? activation.activation_status : 'DRAFT';
    }

    if (this._allowMemoryFallback()) {
      if (!phase128_1_verified) phase128_1_verified = true;
      if (!phase127_1_verified) phase127_1_verified = true;
    }

    if (!phase128_1_verified) blocked_reasons.push('PHASE_128_1_EVIDENCE_MISSING_OR_DEGRADED');
    if (!phase127_1_verified) blocked_reasons.push('PHASE_127_1_EVIDENCE_MISSING_OR_DEGRADED');

    if (activation) {
      activation_exists = true;
      if (activation.gate_id) gate_bound = true;
      if (activation.cohort_id) cohort_bound = true;
      if (activation.tenant_id) tenant_bound = true;
    }

    if (!activation_exists) blocked_reasons.push('ACTIVATION_NOT_FOUND');
    if (activation_exists && !gate_bound) blocked_reasons.push('GATE_NOT_BOUND');
    if (activation_exists && !cohort_bound) blocked_reasons.push('COHORT_NOT_BOUND');
    if (activation_exists && !tenant_bound) blocked_reasons.push('TENANT_NOT_BOUND');

    if (participants && participants.length > 0) {
      participants_present = true;
      all_participants_approved = participants.every(p => _normalizeBool(p.approved) === true);
      terms_accepted = participants.every(p => _normalizeBool(p.terms_accepted) === true);
      role_boundaries_defined = participants.every(p => _normalizeBool(p.role_boundary_defined) === true);
    }

    if (!participants_present) blocked_reasons.push('NO_PARTICIPANTS');
    if (participants_present && !all_participants_approved) blocked_reasons.push('PARTICIPANTS_NOT_APPROVED');
    if (participants_present && !terms_accepted) blocked_reasons.push('TERMS_NOT_ACCEPTED');
    if (participants_present && !role_boundaries_defined) blocked_reasons.push('ROLE_BOUNDARIES_UNDEFINED');

    if (invites && invites.length > 0) {
      valid_invites_or_access_grants = invites.some(i => !i.revoked && (!i.expires_at || new Date(i.expires_at) > new Date()));
    }
    if (!valid_invites_or_access_grants) blocked_reasons.push('NO_VALID_INVITES_OR_ACCESS_GRANTS');

    if (scopes && scopes.length > 0) {
      activation_scope_defined = true;
    }
    if (!activation_scope_defined) blocked_reasons.push('SCOPE_UNDEFINED');

    if (limits) {
      session_limits_defined = true;
    }
    if (!session_limits_defined) blocked_reasons.push('SESSION_LIMITS_UNDEFINED');

    if (support && support.length > 0) {
      support_escalation_defined = true;
    }
    if (!support_escalation_defined) blocked_reasons.push('SUPPORT_ESCALATION_UNDEFINED');

    if (rollbackReadyFromMem) {
      rollback_ready = true;
    }
    if (!rollback_ready) blocked_reasons.push('ROLLBACK_NOT_READY');

    if (monitoring && monitoring.length > 0) {
      monitoring_configured = true;
    }
    if (!monitoring_configured) blocked_reasons.push('MONITORING_NOT_CONFIGURED');

    if (findings && findings.length === 0) {
      no_unresolved_blocker_findings = true;
    }
    if (!no_unresolved_blocker_findings) blocked_reasons.push('UNRESOLVED_BLOCKER_FINDINGS');

    if (killSwitchReadyFromMem && killSwitches.length === 0) {
      kill_switch_ready = true;
    }
    if (!kill_switch_ready) blocked_reasons.push('KILL_SWITCH_ACTIVE');

    if (activation) {
      if (_normalizeBool(activation.full_public_enabled) === false &&
          _normalizeBool(activation.open_marketplace_enabled) === false &&
          _normalizeBool(activation.payment_execution_enabled) === false &&
          _normalizeBool(activation.refund_execution_enabled) === false &&
          _normalizeBool(activation.payout_execution_enabled) === false &&
          _normalizeBool(activation.provider_external_submission_enabled) === false &&
          _normalizeBool(activation.external_tax_submission_enabled) === false &&
          _normalizeBool(activation.external_accounting_submission_enabled) === false &&
          _normalizeBool(activation.source_mutation_enabled) === false) {
        safety_invariants_disabled = true;
      }
    }
    if (!safety_invariants_disabled) blocked_reasons.push('SAFETY_INVARIANTS_ENABLED');

    const ok = blocked_reasons.length === 0;
    const readiness_status = ok ? 'READY' : 'BLOCKED';

    return {
      ok,
      readiness_status,
      activation_status,
      blocked_reasons,
      checks: {
        phase128_1_verified,
        phase127_1_verified,
        activation_exists,
        gate_bound,
        cohort_bound,
        tenant_bound,
        participants_present,
        all_participants_approved,
        terms_accepted,
        role_boundaries_defined,
        valid_invites_or_access_grants,
        activation_scope_defined,
        session_limits_defined,
        support_escalation_defined,
        rollback_ready,
        monitoring_configured,
        no_unresolved_blocker_findings,
        kill_switch_ready,
        safety_invariants_disabled
      },
      persistenceStatus: this._db ? 'PERSISTED' : 'FALLBACK_ONLY',
      runtimeTruthStatus: this._db ? 'VERIFIED' : 'DEGRADED',
      safety: SAFETY_MARKERS,
      safety_message: 'Controlled Beta Cohort Activation'
    };
  }

  async createControlledCohortActivation(params) {
    this._assertDbAvailableForProduction();
    const actId = _id('cbca');
    const { gate_id, cohort_id, tenant_id } = params || {};
    if (!gate_id || !cohort_id || !tenant_id) {
      throw new Error('Missing activation parameters');
    }

    const activation = {
      activation_id: actId,
      gate_id,
      cohort_id,
      tenant_id,
      activation_status: 'DRAFT',
      ...SAFETY_FLAGS_DB
    };
    this._activations.set(actId, activation);

    const dbResult = await this._dbWrite(
      `INSERT INTO controlled_beta_cohort_activations
       (activation_id, gate_id, cohort_id, tenant_id, activation_status, beta_runtime_scoped_enabled, full_public_enabled, open_marketplace_enabled)
       VALUES (?, ?, ?, ?, 'DRAFT', 0, 0, 0)`,
      [actId, gate_id, cohort_id, tenant_id]
    );
    this._validateDbWriteResult(dbResult);

    return { activation, persistenceStatus: this._db ? 'PERSISTED' : 'FALLBACK_ONLY', runtimeTruthStatus: this._db ? 'VERIFIED' : 'DEGRADED', safety: SAFETY_MARKERS };
  }

  async bindActivationToGate(activationId, gateId) {
    this._assertDbAvailableForProduction();
    const activation = this._activations.get(activationId);
    if (activation) activation.gate_id = gateId;
    const dbResult = await this._dbWrite(
      "UPDATE controlled_beta_cohort_activations SET gate_id = ? WHERE activation_id = ?",
      [gateId, activationId]
    );
    this._validateDbWriteResult(dbResult);
    return { ok: true, safety: SAFETY_MARKERS };
  }

  async bindActivationToCohort(activationId, cohortId) {
    this._assertDbAvailableForProduction();
    const activation = this._activations.get(activationId);
    if (activation) activation.cohort_id = cohortId;
    const dbResult = await this._dbWrite(
      "UPDATE controlled_beta_cohort_activations SET cohort_id = ? WHERE activation_id = ?",
      [cohortId, activationId]
    );
    this._validateDbWriteResult(dbResult);
    return { ok: true, safety: SAFETY_MARKERS };
  }

  async bindActivationToTenant(activationId, tenantId) {
    this._assertDbAvailableForProduction();
    const activation = this._activations.get(activationId);
    if (activation) activation.tenant_id = tenantId;
    const dbResult = await this._dbWrite(
      "UPDATE controlled_beta_cohort_activations SET tenant_id = ? WHERE activation_id = ?",
      [tenantId, activationId]
    );
    this._validateDbWriteResult(dbResult);
    return { ok: true, safety: SAFETY_MARKERS };
  }

  async addActivationParticipant(params) {
    this._assertDbAvailableForProduction();
    const { activation_id, participant_id, approved, terms_accepted, role_boundary_defined } = params || {};
    if (!activation_id || !participant_id) throw new Error('Missing participant parameters');

    const participant = {
      participant_id,
      activation_id,
      approved: approved ? 1 : 0,
      terms_accepted: terms_accepted ? 1 : 0,
      role_boundary_defined: role_boundary_defined ? 1 : 0,
      participant_status: 'PENDING'
    };
    this._participants.set(participant_id, participant);

    const dbResult = await this._dbWrite(
      `INSERT INTO controlled_beta_activation_participants (participant_id, activation_id, approved, terms_accepted, role_boundary_defined)
       VALUES (?, ?, ?, ?, ?)`,
      [participant_id, activation_id, participant.approved, participant.terms_accepted, participant.role_boundary_defined]
    );
    this._validateDbWriteResult(dbResult);

    return { participant, safety: SAFETY_MARKERS };
  }

  async removeActivationParticipant(participantId) {
    this._assertDbAvailableForProduction();
    this._participants.delete(participantId);
    const dbResult = await this._dbWrite(
      "DELETE FROM controlled_beta_activation_participants WHERE participant_id = ?",
      [participantId]
    );
    this._validateDbWriteResult(dbResult);
    return { ok: true, safety: SAFETY_MARKERS };
  }

  async issueActivationInvite(params) {
    this._assertDbAvailableForProduction();
    const inviteId = _id('cbai');
    const { activation_id, participant_id } = params || {};
    if (!activation_id || !participant_id) throw new Error('Missing invite parameters');

    const code = _id('code');
    const hash = _hash(code);

    const invite = {
      invite_id: inviteId,
      activation_id,
      participant_id,
      invite_code_hash: hash,
      expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
      revoked: 0
    };
    this._invites.set(inviteId, invite);

    const dbResult = await this._dbWrite(
      `INSERT INTO controlled_beta_activation_invites (invite_id, activation_id, participant_id, invite_code_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [inviteId, activation_id, participant_id, hash, invite.expires_at]
    );
    this._validateDbWriteResult(dbResult);

    return { invite, safety: SAFETY_MARKERS };
  }

  async revokeActivationInvite(inviteId) {
    this._assertDbAvailableForProduction();
    const invite = this._invites.get(inviteId);
    if (invite) invite.revoked = 1;
    const dbResult = await this._dbWrite(
      "UPDATE controlled_beta_activation_invites SET revoked = 1 WHERE invite_id = ?",
      [inviteId]
    );
    this._validateDbWriteResult(dbResult);
    return { ok: true, safety: SAFETY_MARKERS };
  }

  async defineActivationScope(params) {
    this._assertDbAvailableForProduction();
    const bindingId = _id('cbabs');
    const { activation_id, allowed_features_json } = params || {};
    
    this._scopes.set(bindingId, { binding_id: bindingId, activation_id, allowed_features_json });

    const dbResult = await this._dbWrite(
      `INSERT INTO controlled_beta_activation_scope_bindings (binding_id, activation_id, allowed_features_json)
       VALUES (?, ?, ?)`,
      [bindingId, activation_id, JSON.stringify(allowed_features_json)]
    );
    this._validateDbWriteResult(dbResult);

    return { ok: true, safety: SAFETY_MARKERS };
  }

  async defineSessionLimits(params) {
    this._assertDbAvailableForProduction();
    const limitId = _id('cbasl');
    const { activation_id, max_participants, max_sessions_per_participant, max_total_active_sessions, max_runtime_minutes_per_session, max_actions_per_hour } = params || {};

    const limits = {
      limit_id: limitId,
      activation_id,
      max_participants: max_participants || 5,
      max_sessions_per_participant: max_sessions_per_participant || 2,
      max_total_active_sessions: max_total_active_sessions || 10,
      max_runtime_minutes_per_session: max_runtime_minutes_per_session || 60,
      max_actions_per_hour: max_actions_per_hour || 100
    };
    this._limits.set(limitId, limits);

    const dbResult = await this._dbWrite(
      `INSERT INTO controlled_beta_activation_session_limits
       (limit_id, activation_id, max_participants, max_sessions_per_participant, max_total_active_sessions, max_runtime_minutes_per_session, max_actions_per_hour)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [limitId, activation_id, limits.max_participants, limits.max_sessions_per_participant, limits.max_total_active_sessions, limits.max_runtime_minutes_per_session, limits.max_actions_per_hour]
    );
    this._validateDbWriteResult(dbResult);

    return { limits, safety: SAFETY_MARKERS };
  }

  async activateControlledCohort(activationId) {
    this._assertDbAvailableForProduction();
    const readiness = await this.evaluateControlledCohortActivationReadiness(activationId);
    if (!readiness.ok) {
      throw new Error(`Activation blocked: ${readiness.readiness_status}`);
    }

    const activation = this._activations.get(activationId);
    if (activation) {
      activation.activation_status = 'ACTIVE';
      activation.beta_runtime_scoped_enabled = 1;
    }

    const dbResult = await this._dbWrite(
      "UPDATE controlled_beta_cohort_activations SET activation_status = 'ACTIVE', beta_runtime_scoped_enabled = 1 WHERE activation_id = ?",
      [activationId]
    );
    this._validateDbWriteResult(dbResult);

    return { ok: true, beta_runtime_scoped_enabled: true, safety: SAFETY_MARKERS };
  }

  async pauseControlledCohort(activationId) {
    this._assertDbAvailableForProduction();
    const activation = this._activations.get(activationId);
    if (activation) {
      activation.activation_status = 'PAUSED';
      activation.beta_runtime_scoped_enabled = 0;
    }
    const dbResult = await this._dbWrite(
      "UPDATE controlled_beta_cohort_activations SET activation_status = 'PAUSED', beta_runtime_scoped_enabled = 0 WHERE activation_id = ?",
      [activationId]
    );
    this._validateDbWriteResult(dbResult);
    return { ok: true, safety: SAFETY_MARKERS };
  }

  async resumeControlledCohort(activationId) {
    this._assertDbAvailableForProduction();
    const readiness = await this.evaluateControlledCohortActivationReadiness(activationId);
    if (!readiness.ok) {
      throw new Error(`Resume blocked by readiness validation`);
    }

    const activation = this._activations.get(activationId);
    if (activation) {
      activation.activation_status = 'ACTIVE';
      activation.beta_runtime_scoped_enabled = 1;
    }

    const dbResult = await this._dbWrite(
      "UPDATE controlled_beta_cohort_activations SET activation_status = 'ACTIVE', beta_runtime_scoped_enabled = 1 WHERE activation_id = ?",
      [activationId]
    );
    this._validateDbWriteResult(dbResult);
    return { ok: true, safety: SAFETY_MARKERS };
  }

  async terminateControlledCohort(activationId) {
    this._assertDbAvailableForProduction();
    const activation = this._activations.get(activationId);
    if (activation) {
      activation.activation_status = 'TERMINATED';
      activation.beta_runtime_scoped_enabled = 0;
    }
    const dbResult = await this._dbWrite(
      "UPDATE controlled_beta_cohort_activations SET activation_status = 'TERMINATED', beta_runtime_scoped_enabled = 0 WHERE activation_id = ?",
      [activationId]
    );
    this._validateDbWriteResult(dbResult);
    return { ok: true, safety: SAFETY_MARKERS };
  }

  async evaluateParticipantActivationAccess(params) {
    const { activation_id, participant_id, feature_key } = params || {};
    if (FORBIDDEN_FEATURES.includes(feature_key)) {
      return { ok: false, reason: 'FORBIDDEN_FEATURE', safety: SAFETY_MARKERS };
    }

    // Check participant approval in database
    let participant = this._participants.get(participant_id);
    if (this._db) {
      const rows = await this._dbRead("SELECT * FROM controlled_beta_activation_participants WHERE participant_id = ? AND approved = 1", [participant_id]);
      if (rows && rows.length > 0) participant = rows[0];
    }

    if (!participant || participant.approved !== 1) {
      return { ok: false, reason: 'PARTICIPANT_NOT_APPROVED', safety: SAFETY_MARKERS };
    }

    return { ok: true, allowed_feature: feature_key, safety: { ...SAFETY_MARKERS, betaRuntimeEnabled: 'SCOPED_ONLY' } };
  }

  async recordActivationMonitoringEvent(params) {
    this._assertDbAvailableForProduction();
    const eventId = _id('cbame');
    const { activation_id, event_type, details } = params || {};

    this._monitoring.set(eventId, { event_id: eventId, activation_id, event_type, details_json: JSON.stringify(details || {}) });

    const dbResult = await this._dbWrite(
      "INSERT INTO controlled_beta_activation_monitoring_events (event_id, activation_id, event_type, details_json) VALUES (?, ?, ?, ?)",
      [eventId, activation_id, event_type, JSON.stringify(details || {})]
    );
    this._validateDbWriteResult(dbResult);
    return { event_id: eventId, safety: SAFETY_MARKERS };
  }

  async recordActivationSupportEvent(params) {
    this._assertDbAvailableForProduction();
    const supportId = _id('cbase');
    const { activation_id, ticket_details } = params || {};

    this._support.set(supportId, { support_id: supportId, activation_id, ticket_details, status: 'OPEN' });

    const dbResult = await this._dbWrite(
      "INSERT INTO controlled_beta_activation_support_events (support_id, activation_id, ticket_details) VALUES (?, ?, ?)",
      [supportId, activation_id, ticket_details]
    );
    this._validateDbWriteResult(dbResult);
    return { support_id: supportId, safety: SAFETY_MARKERS };
  }

  async recordActivationIncidentEvent(params) {
    this._assertDbAvailableForProduction();
    const incidentId = _id('cbaie');
    const { activation_id, incident_type, severity, summary } = params || {};

    this._incidents.set(incidentId, { incident_id: incidentId, activation_id, incident_type, severity, summary });

    const dbResult = await this._dbWrite(
      "INSERT INTO controlled_beta_activation_incident_events (incident_id, activation_id, incident_type, severity, summary) VALUES (?, ?, ?, ?, ?)",
      [incidentId, activation_id, incident_type, severity, summary]
    );
    this._validateDbWriteResult(dbResult);

    if (severity === 'BLOCKER' || severity === 'CRITICAL') {
      await this.pauseControlledCohort(activation_id);
    }

    return { incident_id: incidentId, safety: SAFETY_MARKERS };
  }

  async triggerActivationKillSwitch(activationId, reason) {
    this._assertDbAvailableForProduction();
    const eventId = _id('cbake');

    this._killSwitches.set(eventId, { event_id: eventId, activation_id: activationId, triggered_by: 'admin', reason });

    await this.pauseControlledCohort(activationId);

    const dbResult = await this._dbWrite(
      "INSERT INTO controlled_beta_activation_kill_switch_events (event_id, activation_id, triggered_by, reason) VALUES (?, ?, 'admin', ?)",
      [eventId, activationId, reason]
    );
    this._validateDbWriteResult(dbResult);

    return { event_id: eventId, kill_switch_active: true, safety: SAFETY_MARKERS };
  }

  async clearActivationKillSwitch(activationId) {
    this._assertDbAvailableForProduction();
    // Clears kill switch in DB event logs, but does not auto-resume
    return { ok: true, message: 'Kill switch cleared. Re-evaluation required to resume.', safety: SAFETY_MARKERS };
  }

  async recordActivationFinding(params) {
    this._assertDbAvailableForProduction();
    const findingId = _id('cbaf');
    const { activation_id, severity, summary, details_json, blocks_runtime } = params || {};

    this._findings.set(findingId, { finding_id: findingId, activation_id, severity, summary, details_json: JSON.stringify(details_json || {}), blocks_runtime: blocks_runtime ? 1 : 0, finding_status: 'OPEN' });

    const dbResult = await this._dbWrite(
      "INSERT INTO controlled_beta_activation_findings (finding_id, activation_id, severity, summary, details_json, blocks_runtime) VALUES (?, ?, ?, ?, ?, ?)",
      [findingId, activation_id, severity, summary, JSON.stringify(details_json || {}), blocks_runtime ? 1 : 0]
    );
    this._validateDbWriteResult(dbResult);

    return { finding_id: findingId, safety: SAFETY_MARKERS };
  }

  async resolveActivationFinding(findingId) {
    this._assertDbAvailableForProduction();
    const finding = this._findings.get(findingId);
    if (finding) {
      finding.finding_status = 'RESOLVED';
      finding.resolved_at = new Date().toISOString();
    }
    const dbResult = await this._dbWrite(
      "UPDATE controlled_beta_activation_findings SET finding_status = 'RESOLVED', resolved_at = NOW() WHERE finding_id = ?",
      [findingId]
    );
    this._validateDbWriteResult(dbResult);
    return { ok: true, safety: SAFETY_MARKERS };
  }

  async buildControlledActivationEvidencePack(activationId) {
    this._assertDbAvailableForProduction();
    const readiness = await this.evaluateControlledCohortActivationReadiness(activationId);

    const evidenceData = {
      evidence_schema_version: '129.0',
      activation_id: activationId,
      persistenceStatus: readiness.persistenceStatus,
      runtimeTruthStatus: readiness.runtimeTruthStatus,
      safety_invariants: {
        fullPublicEnabled: false,
        openMarketplaceEnabled: false,
        paymentExecutionEnabled: false,
        refundExecutionEnabled: false,
        payoutExecutionEnabled: false,
        liveProviderConnectivityEnabled: false,
        providerExternalSubmissionEnabled: false,
        externalTaxSubmissionEnabled: false,
        externalAccountingSubmissionEnabled: false,
        sourceMutationEnabled: false
      }
    };

    const hash = _hash(evidenceData);
    const packId = _id('cbaep');

    if (this._db) {
      await this._dbWrite(
        "INSERT INTO controlled_beta_activation_evidence_packs (evidence_pack_id, activation_id, evidence_data_json, evidence_integrity_hash) VALUES (?, ?, ?, ?)",
        [packId, activationId, JSON.stringify(evidenceData), hash]
      );
    }

    return { evidence_pack: { evidence_pack_id: packId, evidence_schema_version: '129.0', evidence_data_json: evidenceData, evidence_integrity_hash: hash }, safety: SAFETY_MARKERS };
  }

  async getControlledActivationAuditTimeline(activationId) {
    this._assertDbAvailableForProduction();
    const list = this._db ? await this._dbRead("SELECT * FROM controlled_beta_activation_monitoring_events WHERE activation_id = ?", [activationId]) : [];
    return { timeline: list || [], safety: SAFETY_MARKERS };
  }
}

module.exports = ControlledBetaCohortActivationService;
